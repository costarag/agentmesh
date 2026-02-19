import {
  MessageRole,
  TaskPriority,
  TaskStatus,
  type Prisma,
} from "@prisma/client";
import { canonicalBundleSchema } from "@/lib/ingestion/schema";
import type { CanonicalSessionBundle } from "@/lib/ingestion/types";
import { prisma } from "@/lib/prisma";

const TASK_STATUS_MAP = {
  open: TaskStatus.OPEN,
  in_progress: TaskStatus.IN_PROGRESS,
  done: TaskStatus.DONE,
  cancelled: TaskStatus.CANCELLED,
} as const;

const TASK_PRIORITY_MAP = {
  low: TaskPriority.LOW,
  medium: TaskPriority.MEDIUM,
  high: TaskPriority.HIGH,
} as const;

const MESSAGE_ROLE_MAP = {
  user: MessageRole.USER,
  assistant: MessageRole.ASSISTANT,
  tool: MessageRole.TOOL,
} as const;

export async function ingestCanonicalBundle(input: {
  bundle: CanonicalSessionBundle;
  workspaceId: string;
  sourceToolId: string;
  importSource: string;
}) {
  const parsed = canonicalBundleSchema.parse(input.bundle);

  return prisma.$transaction(async (tx) => {
    const maybeDuplicate = parsed.session.externalSessionId
      ? await tx.session.findFirst({
          where: {
            sourceToolId: input.sourceToolId,
            externalSessionId: parsed.session.externalSessionId,
          },
          select: { id: true },
        })
      : null;

    if (maybeDuplicate) {
      return {
        sessionId: maybeDuplicate.id,
        deduplicated: true,
      };
    }

    const session = await tx.session.create({
      data: {
        workspaceId: input.workspaceId,
        sourceToolId: input.sourceToolId,
        title: parsed.session.title,
        summary: parsed.session.summary ?? deriveBundleSummary(parsed.messages),
        externalSessionId: parsed.session.externalSessionId,
        startedAt: parsed.session.startedAt
          ? new Date(parsed.session.startedAt)
          : null,
        endedAt: parsed.session.endedAt
          ? new Date(parsed.session.endedAt)
          : null,
        importSource: input.importSource,
        importedAt: new Date(),
      },
    });

    const messageRecords: Array<{ id: string; ordinal: number }> = [];
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    for (const [ordinal, message] of parsed.messages.entries()) {
      promptTokens += message.promptTokens ?? 0;
      completionTokens += message.completionTokens ?? 0;
      totalTokens +=
        message.totalTokens ??
        (message.promptTokens ?? 0) + (message.completionTokens ?? 0);

      const created = await tx.message.create({
        data: {
          sessionId: session.id,
          role: MESSAGE_ROLE_MAP[message.role],
          content: message.content,
          metadata: message.metadata as Prisma.JsonObject | undefined,
          promptTokens: message.promptTokens,
          completionTokens: message.completionTokens,
          totalTokens: message.totalTokens,
          ordinal,
        },
        select: {
          id: true,
          ordinal: true,
        },
      });

      messageRecords.push(created);
    }

    if (parsed.tasks) {
      for (const task of parsed.tasks) {
        await tx.task.create({
          data: {
            sessionId: session.id,
            title: task.title,
            description: task.description,
            status: TASK_STATUS_MAP[task.status ?? "open"],
            priority: TASK_PRIORITY_MAP[task.priority ?? "medium"],
          },
        });
      }
    }

    if (parsed.tags && parsed.tags.length > 0) {
      for (const rawTagName of parsed.tags) {
        const tagName = rawTagName.trim();
        if (!tagName) {
          continue;
        }

        const slug = tagName.toLowerCase().replaceAll(/\s+/g, "-");
        const tag = await tx.tag.upsert({
          where: { slug },
          update: {},
          create: { name: tagName, slug },
          select: { id: true },
        });

        await tx.sessionTag.create({
          data: {
            sessionId: session.id,
            tagId: tag.id,
          },
        });
      }
    }

    if (parsed.artifacts && parsed.artifacts.length > 0) {
      for (const artifact of parsed.artifacts) {
        const messageId =
          artifact.messageIndex !== undefined
            ? messageRecords.find(
                (record) => record.ordinal === artifact.messageIndex,
              )?.id
            : undefined;

        await tx.artifact.create({
          data: {
            sessionId: session.id,
            messageId,
            type: artifact.type,
            name: artifact.name,
            content: artifact.content,
            metadata: artifact.metadata as Prisma.JsonObject | undefined,
          },
        });
      }
    }

    await tx.metricSnapshot.create({
      data: {
        sessionId: session.id,
        sourceToolId: input.sourceToolId,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost: Number((totalTokens / 1_000_000).toFixed(6)),
      },
    });

    return {
      sessionId: session.id,
      deduplicated: false,
    };
  });
}

function deriveBundleSummary(messages: CanonicalSessionBundle["messages"]) {
  const best =
    messages.find((message) => message.role === "assistant") ??
    messages.find((message) => message.role === "user") ??
    messages[0];

  if (!best?.content) {
    return null;
  }

  const clean = best.content.replaceAll(/\s+/g, " ").trim();
  if (!clean) {
    return null;
  }

  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
}
