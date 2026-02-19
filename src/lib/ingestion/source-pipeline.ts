import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import {
  IngestionRunStatus,
  IngestionSourceType,
  MessagePartType,
  MessageRole,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

const DEFAULT_LOOKBACK_DAYS = Number(process.env.INGEST_LOOKBACK_DAYS ?? "30");
const DEFAULT_CLAUDE_ROOT =
  process.env.CLAUDE_HOME ?? path.join(homedir(), ".claude");
const DEFAULT_OPENCODE_HOME =
  process.env.OPENCODE_HOME ??
  path.join(homedir(), ".local", "share", "opencode");

type IngestMessagePartInput = {
  externalPartId: string;
  partType: MessagePartType;
  text?: string;
  data?: Prisma.InputJsonValue;
  sourceTimestamp?: Date;
  ordinal: number;
};

export type IngestMessageInput = {
  externalMessageId: string;
  role: MessageRole;
  modelProvider?: string;
  modelId?: string;
  content: string;
  metadata?: Prisma.InputJsonValue;
  sourceTimestamp?: Date;
  ordinal: number;
  parts: IngestMessagePartInput[];
};

type IngestSessionInput = {
  externalSessionId: string;
  sourceSessionPath?: string;
  title: string;
  summary?: string;
  startedAt?: Date;
  endedAt?: Date;
  lastActivityAt?: Date;
  messages: IngestMessageInput[];
};

type SourceRunResult = {
  scannedSessions: number;
  upsertedSessions: number;
  upsertedMessages: number;
  upsertedParts: number;
  maxTimestamp?: Date;
  note?: string;
};

type IngestionMode = "backfill" | "poll";

export async function ensureDefaultIngestionSources(prisma: PrismaClient) {
  await prisma.ingestionSource.upsert({
    where: { key: "claude-default" },
    update: {
      rootPath: DEFAULT_CLAUDE_ROOT,
      lookbackDays: DEFAULT_LOOKBACK_DAYS,
    },
    create: {
      key: "claude-default",
      type: IngestionSourceType.CLAUDE,
      name: "Claude default",
      rootPath: DEFAULT_CLAUDE_ROOT,
      lookbackDays: DEFAULT_LOOKBACK_DAYS,
      pollIntervalSec: 30,
    },
  });

  await prisma.ingestionSource.upsert({
    where: { key: "opencode-default" },
    update: {
      rootPath: DEFAULT_OPENCODE_HOME,
      dbPath: path.join(DEFAULT_OPENCODE_HOME, "opencode.db"),
      lookbackDays: DEFAULT_LOOKBACK_DAYS,
    },
    create: {
      key: "opencode-default",
      type: IngestionSourceType.OPENCODE,
      name: "OpenCode default",
      rootPath: DEFAULT_OPENCODE_HOME,
      dbPath: path.join(DEFAULT_OPENCODE_HOME, "opencode.db"),
      lookbackDays: DEFAULT_LOOKBACK_DAYS,
      pollIntervalSec: 15,
    },
  });
}

export async function runIngestionCycle(
  prisma: PrismaClient,
  mode: IngestionMode,
) {
  await ensureDefaultIngestionSources(prisma);

  const sources = await prisma.ingestionSource.findMany({
    where: { isEnabled: true },
    orderBy: { createdAt: "asc" },
  });

  for (const source of sources) {
    const run = await prisma.ingestionRun.create({
      data: {
        sourceId: source.id,
        mode,
        status: IngestionRunStatus.RUNNING,
      },
    });

    await prisma.ingestionSource.update({
      where: { id: source.id },
      data: { lastRunAt: new Date(), statusMessage: `Running ${mode}...` },
    });

    try {
      if (
        source.type !== IngestionSourceType.CLAUDE &&
        source.type !== IngestionSourceType.OPENCODE
      ) {
        throw new Error(`Unsupported ingestion source type: ${source.type}`);
      }

      const result =
        source.type === IngestionSourceType.CLAUDE
          ? await runClaudeSource(
              prisma,
              source.id,
              source.rootPath,
              source.lookbackDays,
            )
          : await runOpenCodeSource(
              prisma,
              source.id,
              source.rootPath,
              source.lookbackDays,
            );

      await prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: IngestionRunStatus.SUCCESS,
          finishedAt: new Date(),
          scannedSessions: result.scannedSessions,
          upsertedSessions: result.upsertedSessions,
          upsertedMessages: result.upsertedMessages,
          upsertedParts: result.upsertedParts,
          note: result.note,
        },
      });

      await prisma.ingestionSource.update({
        where: { id: source.id },
        data: {
          lastSuccessAt: new Date(),
          statusMessage:
            result.note ??
            `Success: ${result.upsertedSessions} sessions, ${result.upsertedMessages} messages`,
        },
      });

      if (result.maxTimestamp) {
        await setCheckpoint(
          prisma,
          source.id,
          "lastTimestamp",
          result.maxTimestamp.toISOString(),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown ingestion failure";
      await prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: IngestionRunStatus.FAILED,
          finishedAt: new Date(),
          errorCount: 1,
          note: message,
        },
      });
      await prisma.ingestionError.create({
        data: {
          sourceId: source.id,
          runId: run.id,
          code: "INGESTION_FAILURE",
          message,
        },
      });
      await prisma.ingestionSource.update({
        where: { id: source.id },
        data: {
          lastErrorAt: new Date(),
          statusMessage: message,
        },
      });
    }
  }
}

async function runClaudeSource(
  prisma: PrismaClient,
  sourceId: string,
  sourceRootPath: string | null,
  lookbackDays: number,
): Promise<SourceRunResult> {
  const claudeRoot = sourceRootPath ?? DEFAULT_CLAUDE_ROOT;
  const projectsRoot = path.join(claudeRoot, "projects");
  const lastCheckpoint = await getCheckpoint(prisma, sourceId, "lastTimestamp");
  const now = new Date();
  const lookbackStart = new Date(
    now.getTime() - lookbackDays * 24 * 60 * 60 * 1000,
  );
  const since =
    lastCheckpoint && new Date(lastCheckpoint) > lookbackStart
      ? new Date(lastCheckpoint)
      : lookbackStart;

  const files = await listFiles(projectsRoot, (filePath) =>
    filePath.endsWith(".jsonl"),
  );
  const sessions = new Map<string, IngestSessionInput>();
  let maxTimestamp: Date | undefined;

  for (const filePath of files) {
    const fileStat = await stat(filePath);
    if (fileStat.mtime < since) {
      continue;
    }

    const raw = await readFile(filePath, "utf8");
    const lines = raw.split("\n").filter(Boolean);

    for (const line of lines) {
      let parsed: Record<string, unknown>;

      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      const sessionId = toStringValue(parsed.sessionId);
      if (!sessionId) {
        continue;
      }

      const timestamp = toDate(
        toStringValue(parsed.timestamp) ??
          toStringValue(
            (parsed.snapshot as { timestamp?: string } | undefined)?.timestamp,
          ),
      );

      if (timestamp && timestamp < since) {
        continue;
      }

      if (timestamp && (!maxTimestamp || timestamp > maxTimestamp)) {
        maxTimestamp = timestamp;
      }

      const messageRecord = buildClaudeMessage(parsed, sessionId, filePath);
      if (!messageRecord) {
        continue;
      }

      const existing = sessions.get(sessionId);
      if (!existing) {
        sessions.set(sessionId, {
          externalSessionId: sessionId,
          sourceSessionPath: toStringValue(parsed.cwd),
          title: fallbackSessionTitle(messageRecord.content, sessionId),
          startedAt: timestamp,
          lastActivityAt: timestamp,
          messages: [messageRecord],
        });
        continue;
      }

      existing.messages.push(messageRecord);
      if (
        timestamp &&
        (!existing.lastActivityAt || timestamp > existing.lastActivityAt)
      ) {
        existing.lastActivityAt = timestamp;
      }
      if (
        timestamp &&
        (!existing.startedAt || timestamp < existing.startedAt)
      ) {
        existing.startedAt = timestamp;
      }
      if (!existing.sourceSessionPath) {
        existing.sourceSessionPath = toStringValue(parsed.cwd);
      }
    }
  }

  const sourceToolId = await ensureSourceTool(
    prisma,
    "claude-code",
    "Claude Code",
  );
  const workspaceId = await ensureWorkspace(prisma);

  for (const session of sessions.values()) {
    session.messages.sort((left, right) => {
      const leftTime = left.sourceTimestamp?.getTime() ?? 0;
      const rightTime = right.sourceTimestamp?.getTime() ?? 0;
      return leftTime - rightTime;
    });

    session.messages.forEach((message, index) => {
      message.ordinal = index;
    });
  }

  return persistSessions(
    prisma,
    sourceToolId,
    workspaceId,
    "claude-watcher",
    [...sessions.values()],
    maxTimestamp,
  );
}

async function runOpenCodeSource(
  prisma: PrismaClient,
  sourceId: string,
  sourceRootPath: string | null,
  lookbackDays: number,
): Promise<SourceRunResult> {
  const root = sourceRootPath ?? DEFAULT_OPENCODE_HOME;
  const sessionRoot = path.join(root, "storage", "session");
  const messageRoot = path.join(root, "storage", "message");
  const partRoot = path.join(root, "storage", "part");
  const lastCheckpoint = await getCheckpoint(prisma, sourceId, "lastTimestamp");
  const now = new Date();
  const lookbackStart = new Date(
    now.getTime() - lookbackDays * 24 * 60 * 60 * 1000,
  );
  const since =
    lastCheckpoint && new Date(lastCheckpoint) > lookbackStart
      ? new Date(lastCheckpoint)
      : lookbackStart;

  const sessionFiles = await listFiles(sessionRoot, (filePath) =>
    filePath.endsWith(".json"),
  );
  const sessions: IngestSessionInput[] = [];
  let maxTimestamp: Date | undefined;

  for (const filePath of sessionFiles) {
    const parsed = await safeReadJson(filePath);
    if (!parsed || typeof parsed !== "object") {
      continue;
    }

    const sessionRecord = parsed as Record<string, unknown>;
    const sessionId = toStringValue(sessionRecord.id);
    if (!sessionId) {
      continue;
    }

    const sessionTime = sessionRecord.time as
      | { updated?: number; created?: number }
      | undefined;
    const updatedMs = toNumberValue(sessionTime?.updated);
    const createdMs = toNumberValue(sessionTime?.created);
    const lastUpdated = toDateFromMs(updatedMs ?? createdMs);

    if (lastUpdated && lastUpdated < since) {
      continue;
    }

    if (lastUpdated && (!maxTimestamp || lastUpdated > maxTimestamp)) {
      maxTimestamp = lastUpdated;
    }

    const messageDir = path.join(messageRoot, sessionId);
    const messageFiles = await listFiles(messageDir, (entryPath) =>
      entryPath.endsWith(".json"),
    );
    const messageItems: IngestMessageInput[] = [];

    for (const messageFilePath of messageFiles) {
      const message = await safeReadJson(messageFilePath);
      if (!message || typeof message !== "object") {
        continue;
      }

      const messageRecord = message as Record<string, unknown>;
      const messageId = toStringValue(messageRecord.id);
      if (!messageId) {
        continue;
      }

      const messageCreated = toDateFromMs(
        toNumberValue(
          (messageRecord.time as { created?: number } | undefined)?.created,
        ),
      );

      if (messageCreated && messageCreated < since) {
        continue;
      }

      if (messageCreated && (!maxTimestamp || messageCreated > maxTimestamp)) {
        maxTimestamp = messageCreated;
      }

      const partDir = path.join(partRoot, messageId);
      const partFiles = await listFiles(partDir, (entryPath) =>
        entryPath.endsWith(".json"),
      );
      const parsedParts = await Promise.all(
        partFiles.map((entryPath) => safeReadJson(entryPath)),
      );
      const sortedParts = parsedParts
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === "object"),
        )
        .sort((left, right) => {
          const leftStart =
            toNumberValue(
              (left.time as { start?: number } | undefined)?.start,
            ) ?? 0;
          const rightStart =
            toNumberValue(
              (right.time as { start?: number } | undefined)?.start,
            ) ?? 0;
          return leftStart - rightStart;
        });

      const parts: IngestMessagePartInput[] = sortedParts.map((part, index) => {
        const partType = mapOpenCodePartType(toStringValue(part.type));
        const partText = extractOpenCodePartText(part, partType);
        const partStart = toDateFromMs(
          toNumberValue((part.time as { start?: number } | undefined)?.start),
        );

        return {
          externalPartId:
            toStringValue(part.id) ?? hashValue(`${messageId}:part:${index}`),
          partType,
          text: partText,
          data: toJsonInput(part),
          sourceTimestamp: partStart,
          ordinal: index,
        };
      });

      const contentFromText = parts
        .filter((part) => part.partType === MessagePartType.TEXT)
        .map((part) => part.text)
        .filter((text): text is string =>
          Boolean(text && text.trim().length > 0),
        )
        .join("\n\n");

      const summaryTitle = toStringValue(
        (messageRecord.summary as { title?: string } | undefined)?.title,
      );
      const fallbackContent = summaryTitle;

      if (!contentFromText && !fallbackContent) {
        continue;
      }

      const finalContent = contentFromText || fallbackContent;
      if (!finalContent) {
        continue;
      }

      messageItems.push({
        externalMessageId: messageId,
        role: mapOpenCodeRole(toStringValue(messageRecord.role)),
        modelProvider:
          toStringValue(messageRecord.providerID) ??
          toStringValue(
            (messageRecord.model as { providerID?: unknown } | undefined)
              ?.providerID,
          ),
        modelId:
          toStringValue(messageRecord.modelID) ??
          toStringValue(
            (messageRecord.model as { modelID?: unknown } | undefined)?.modelID,
          ),
        content: finalContent,
        metadata: toJsonInput(messageRecord),
        sourceTimestamp: messageCreated,
        ordinal: messageItems.length,
        parts,
      });
    }

    messageItems.sort((left, right) => {
      const leftTime = left.sourceTimestamp?.getTime() ?? 0;
      const rightTime = right.sourceTimestamp?.getTime() ?? 0;
      return leftTime - rightTime;
    });
    messageItems.forEach((message, index) => {
      message.ordinal = index;
    });

    const sessionTitle =
      toStringValue(sessionRecord.title) ??
      fallbackSessionTitle(messageItems[0]?.content ?? "", sessionId);
    sessions.push({
      externalSessionId: sessionId,
      sourceSessionPath: toStringValue(sessionRecord.directory),
      title: sessionTitle,
      startedAt: toDateFromMs(createdMs),
      lastActivityAt: lastUpdated,
      messages: messageItems,
    });
  }

  const sourceToolId = await ensureSourceTool(prisma, "opencode", "OpenCode");
  const workspaceId = await ensureWorkspace(prisma);
  return persistSessions(
    prisma,
    sourceToolId,
    workspaceId,
    "opencode-watcher",
    sessions,
    maxTimestamp,
  );
}

async function persistSessions(
  prisma: PrismaClient,
  sourceToolId: string,
  workspaceId: string,
  importSource: string,
  sessions: IngestSessionInput[],
  maxTimestamp?: Date,
): Promise<SourceRunResult> {
  let upsertedSessions = 0;
  let upsertedMessages = 0;
  let upsertedParts = 0;

  for (const sessionInput of sessions) {
    if (!sessionInput.externalSessionId || sessionInput.messages.length === 0) {
      continue;
    }

    const session = await prisma.session.upsert({
      where: {
        sourceToolId_externalSessionId: {
          sourceToolId,
          externalSessionId: sessionInput.externalSessionId,
        },
      },
      update: {
        title: sessionInput.title,
        summary:
          sessionInput.summary ?? deriveSessionSummary(sessionInput.messages),
        startedAt: sessionInput.startedAt,
        endedAt: sessionInput.endedAt,
        lastActivityAt: sessionInput.lastActivityAt,
        sourceSessionPath: sessionInput.sourceSessionPath,
        importSource,
        importedAt: new Date(),
      },
      create: {
        workspaceId,
        sourceToolId,
        externalSessionId: sessionInput.externalSessionId,
        sourceSessionPath: sessionInput.sourceSessionPath,
        title: sessionInput.title,
        summary:
          sessionInput.summary ?? deriveSessionSummary(sessionInput.messages),
        startedAt: sessionInput.startedAt,
        endedAt: sessionInput.endedAt,
        lastActivityAt: sessionInput.lastActivityAt,
        importSource,
        importedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    upsertedSessions += 1;

    for (const messageInput of sessionInput.messages) {
      const message = await prisma.message.upsert({
        where: {
          sessionId_externalMessageId: {
            sessionId: session.id,
            externalMessageId: messageInput.externalMessageId,
          },
        },
        update: {
          role: messageInput.role,
          modelProvider: messageInput.modelProvider,
          modelId: messageInput.modelId,
          content: messageInput.content,
          metadata: messageInput.metadata,
          sourceTimestamp: messageInput.sourceTimestamp,
          ordinal: messageInput.ordinal,
        },
        create: {
          sessionId: session.id,
          externalMessageId: messageInput.externalMessageId,
          role: messageInput.role,
          modelProvider: messageInput.modelProvider,
          modelId: messageInput.modelId,
          content: messageInput.content,
          metadata: messageInput.metadata,
          sourceTimestamp: messageInput.sourceTimestamp,
          ordinal: messageInput.ordinal,
        },
        select: {
          id: true,
        },
      });

      upsertedMessages += 1;

      for (const part of messageInput.parts) {
        await prisma.messagePart.upsert({
          where: {
            messageId_externalPartId: {
              messageId: message.id,
              externalPartId: part.externalPartId,
            },
          },
          update: {
            partType: part.partType,
            text: part.text,
            data: part.data,
            sourceTimestamp: part.sourceTimestamp,
            ordinal: part.ordinal,
            sessionId: session.id,
          },
          create: {
            sessionId: session.id,
            messageId: message.id,
            externalPartId: part.externalPartId,
            partType: part.partType,
            text: part.text,
            data: part.data,
            sourceTimestamp: part.sourceTimestamp,
            ordinal: part.ordinal,
          },
        });
        upsertedParts += 1;
      }
    }
  }

  return {
    scannedSessions: sessions.length,
    upsertedSessions,
    upsertedMessages,
    upsertedParts,
    maxTimestamp,
  };
}

async function ensureSourceTool(
  prisma: PrismaClient,
  slug: string,
  name: string,
) {
  const tool = await prisma.sourceTool.upsert({
    where: { slug },
    update: { name },
    create: { slug, name },
    select: { id: true },
  });

  return tool.id;
}

async function ensureWorkspace(prisma: PrismaClient) {
  const existing = await prisma.workspace.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const created = await prisma.workspace.create({
    data: {
      name: "Default",
      slug: "default",
    },
    select: { id: true },
  });

  return created.id;
}

async function getCheckpoint(
  prisma: PrismaClient,
  sourceId: string,
  cursorKey: string,
) {
  const checkpoint = await prisma.ingestionCheckpoint.findUnique({
    where: {
      sourceId_cursorKey: {
        sourceId,
        cursorKey,
      },
    },
    select: {
      cursorValue: true,
    },
  });

  return checkpoint?.cursorValue;
}

async function setCheckpoint(
  prisma: PrismaClient,
  sourceId: string,
  cursorKey: string,
  cursorValue: string,
) {
  await prisma.ingestionCheckpoint.upsert({
    where: {
      sourceId_cursorKey: {
        sourceId,
        cursorKey,
      },
    },
    update: { cursorValue },
    create: {
      sourceId,
      cursorKey,
      cursorValue,
    },
  });
}

function buildClaudeMessage(
  parsed: Record<string, unknown>,
  sessionId: string,
  filePath: string,
): IngestMessageInput | null {
  const sourceTimestamp = toDate(toStringValue(parsed.timestamp));
  const role = mapClaudeRole(toStringValue(parsed.type));
  const rawMessage = (
    parsed.message as { content?: unknown; id?: string } | undefined
  )?.content;
  const rawContent = rawMessage ?? parsed.content;

  const parts: IngestMessagePartInput[] = [];
  let content = "";

  if (typeof rawContent === "string") {
    const trimmed = sanitizeImportedText(rawContent);
    if (!trimmed) {
      return null;
    }
    content = trimmed;
    parts.push({
      externalPartId: hashValue(
        `${sessionId}:${toStringValue(parsed.uuid) ?? ""}:text`,
      ),
      partType: MessagePartType.TEXT,
      text: trimmed,
      data: toJsonInput(rawContent),
      sourceTimestamp,
      ordinal: 0,
    });
  } else if (Array.isArray(rawContent)) {
    const visibleText: string[] = [];
    for (const [index, item] of rawContent.entries()) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const partType = mapClaudePartType(
        toStringValue((item as { type?: string }).type),
      );
      const partText = extractClaudePartText(
        item as Record<string, unknown>,
        partType,
      );
      if (partText && partType === MessagePartType.TEXT) {
        visibleText.push(partText);
      }
      parts.push({
        externalPartId: hashValue(
          `${sessionId}:${toStringValue(parsed.uuid) ?? ""}:part:${index}`,
        ),
        partType,
        text: partText,
        data: toJsonInput(item),
        sourceTimestamp,
        ordinal: index,
      });
    }
    content = visibleText.join("\n\n").trim();
  }

  if (!content) {
    return null;
  }

  const externalMessageId =
    toStringValue(parsed.uuid) ??
    toStringValue((parsed.message as { id?: string } | undefined)?.id) ??
    hashValue(`${sessionId}:${filePath}:${content.slice(0, 100)}`);

  return {
    externalMessageId,
    role,
    modelProvider: extractProviderFromClaude(parsed),
    modelId: extractModelFromClaude(parsed),
    content,
    sourceTimestamp,
    metadata: toJsonInput(parsed),
    ordinal: 0,
    parts,
  };
}

export function mapClaudeRole(type: string | undefined): MessageRole {
  if (type === "assistant") {
    return MessageRole.ASSISTANT;
  }
  if (type === "system" || type === "progress") {
    return MessageRole.TOOL;
  }
  return MessageRole.USER;
}

function extractProviderFromClaude(parsed: Record<string, unknown>) {
  const direct = toStringValue(parsed.provider);
  if (direct) {
    return direct;
  }

  const messageRecord =
    typeof parsed.message === "object" && parsed.message !== null
      ? (parsed.message as Record<string, unknown>)
      : undefined;
  return toStringValue(messageRecord?.provider) ?? "anthropic";
}

function extractModelFromClaude(parsed: Record<string, unknown>) {
  const direct = toStringValue(parsed.model);
  if (direct) {
    return direct;
  }

  const messageRecord =
    typeof parsed.message === "object" && parsed.message !== null
      ? (parsed.message as Record<string, unknown>)
      : undefined;
  return toStringValue(messageRecord?.model);
}

export function mapClaudePartType(type: string | undefined): MessagePartType {
  if (type === "text") {
    return MessagePartType.TEXT;
  }
  if (type === "thinking") {
    return MessagePartType.REASONING;
  }
  if (type === "tool_use" || type === "tool_result") {
    return MessagePartType.TOOL;
  }
  return MessagePartType.OTHER;
}

function extractClaudePartText(
  item: Record<string, unknown>,
  partType: MessagePartType,
) {
  if (partType === MessagePartType.TEXT) {
    const text =
      toStringValue(item.text) ?? toStringValue(item.content) ?? undefined;
    return text ? sanitizeImportedText(text) : undefined;
  }

  if (partType === MessagePartType.REASONING) {
    const text =
      toStringValue(item.thinking) ?? toStringValue(item.text) ?? undefined;
    return text ? sanitizeImportedText(text) : undefined;
  }

  if (partType === MessagePartType.TOOL) {
    const name = toStringValue(item.name);
    if (name) {
      return `[tool] ${name}`;
    }
    return toStringValue(item.type) ?? "tool";
  }

  return toStringValue(item.text) ?? undefined;
}

export function mapOpenCodeRole(value: string | undefined): MessageRole {
  if (value === "assistant") {
    return MessageRole.ASSISTANT;
  }
  if (value === "tool") {
    return MessageRole.TOOL;
  }
  return MessageRole.USER;
}

export function mapOpenCodePartType(type: string | undefined): MessagePartType {
  if (type === "text") {
    return MessagePartType.TEXT;
  }
  if (type === "reasoning") {
    return MessagePartType.REASONING;
  }
  if (type === "tool") {
    return MessagePartType.TOOL;
  }
  if (type === "step-start") {
    return MessagePartType.STEP_START;
  }
  if (type === "step-finish") {
    return MessagePartType.STEP_FINISH;
  }
  if (type === "error") {
    return MessagePartType.ERROR;
  }
  return MessagePartType.OTHER;
}

function extractOpenCodePartText(
  part: Record<string, unknown>,
  partType: MessagePartType,
) {
  if (
    partType === MessagePartType.TEXT ||
    partType === MessagePartType.REASONING
  ) {
    const text = toStringValue(part.text) ?? undefined;
    return text ? sanitizeImportedText(text) : undefined;
  }

  if (partType === MessagePartType.TOOL) {
    const state = part.state as
      | { title?: string; output?: string; input?: unknown }
      | undefined;
    return (
      state?.title ?? state?.output ?? toStringValue(part.tool) ?? "tool call"
    );
  }

  return toStringValue(part.type) ?? undefined;
}

export function fallbackSessionTitle(content: string, sessionId: string) {
  const clean = sanitizeImportedText(content).replaceAll(/\s+/g, " ").trim();
  if (!clean) {
    return `Session ${sessionId.slice(0, 8)}`;
  }
  return clean.slice(0, 80);
}

export function sanitizeImportedText(value: string) {
  return value
    .replaceAll(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/gi, "")
    .replaceAll(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
    .replaceAll(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/gi, "")
    .trim();
}

export function deriveSessionSummary(messages: IngestMessageInput[]) {
  const best =
    messages.find((message) => message.role === MessageRole.ASSISTANT) ??
    messages.find((message) => message.role === MessageRole.USER) ??
    messages[0];

  if (!best?.content) {
    return null;
  }

  const clean = sanitizeImportedText(best.content)
    .replaceAll(/\s+/g, " ")
    .trim();
  if (!clean) {
    return null;
  }

  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
}

function hashValue(input: string) {
  return createHash("sha1").update(input).digest("hex");
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function toNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function toDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDateFromMs(value: number | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function listFiles(
  directory: string,
  include: (filePath: string) => boolean,
): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listFiles(absolutePath, include)));
      } else if (entry.isFile() && include(absolutePath)) {
        files.push(absolutePath);
      }
    }

    return files;
  } catch {
    return [];
  }
}

async function safeReadJson(filePath: string): Promise<unknown | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
