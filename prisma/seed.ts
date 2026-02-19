import {
  MessageRole,
  PrismaClient,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const HOURS = 60 * 60 * 1000;

async function main() {
  await prisma.ingestionError.deleteMany();
  await prisma.ingestionRun.deleteMany();
  await prisma.ingestionCheckpoint.deleteMany();
  await prisma.ingestionSource.deleteMany();
  await prisma.messageTag.deleteMany();
  await prisma.sessionTag.deleteMany();
  await prisma.metricSnapshot.deleteMany();
  await prisma.task.deleteMany();
  await prisma.artifact.deleteMany();
  await prisma.messagePart.deleteMany();
  await prisma.message.deleteMany();
  await prisma.session.deleteMany();
  await prisma.promptVersion.deleteMany();
  await prisma.promptTemplate.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.sourceTool.deleteMany();
  await prisma.workspace.deleteMany();

  const [personal, work] = await Promise.all([
    prisma.workspace.create({
      data: { name: "Personal", slug: "personal" },
    }),
    prisma.workspace.create({ data: { name: "Work", slug: "work" } }),
  ]);

  const [claude, chatgpt, cursor] = await Promise.all([
    prisma.sourceTool.create({ data: { name: "Claude", slug: "claude" } }),
    prisma.sourceTool.create({ data: { name: "ChatGPT", slug: "chatgpt" } }),
    prisma.sourceTool.create({ data: { name: "Cursor", slug: "cursor" } }),
  ]);

  const [architectureTag, ingestionTag, testingTag, migrationTag] =
    await Promise.all([
      prisma.tag.create({
        data: { name: "Architecture", slug: "architecture" },
      }),
      prisma.tag.create({ data: { name: "Ingestion", slug: "ingestion" } }),
      prisma.tag.create({ data: { name: "Testing", slug: "testing" } }),
      prisma.tag.create({ data: { name: "Migration", slug: "migration" } }),
    ]);

  const sessionsData = [
    {
      workspace: work,
      sourceTool: claude,
      title: "Design canonical schema for AgentMesh",
      summary:
        "Defined canonical entities and ingestion-safe relationships for multi-tool transcripts.",
      externalSessionId: "claude-work-001",
      importSource: "seed",
      startedAt: new Date(Date.now() - 72 * HOURS),
      endedAt: new Date(Date.now() - 71 * HOURS),
      messages: [
        {
          role: MessageRole.USER,
          content:
            "We need a schema that supports sessions from Claude, ChatGPT, and Cursor with future adapters.",
          promptTokens: 89,
          completionTokens: 0,
          totalTokens: 89,
        },
        {
          role: MessageRole.ASSISTANT,
          content:
            "Use Session + Message as the center. Add Task and MetricSnapshot as derived entities. Keep adapter metadata in JSON for forward compatibility.",
          promptTokens: 89,
          completionTokens: 214,
          totalTokens: 303,
        },
      ],
      tasks: [
        {
          title: "Create Prisma schema for canonical model",
          status: TaskStatus.DONE,
          priority: TaskPriority.HIGH,
        },
      ],
      tags: [architectureTag],
    },
    {
      workspace: work,
      sourceTool: cursor,
      title: "Implement JSON import pipeline",
      summary: "Built initial parser for generic JSON transcripts.",
      externalSessionId: "cursor-work-002",
      importSource: "seed",
      startedAt: new Date(Date.now() - 56 * HOURS),
      endedAt: new Date(Date.now() - 55 * HOURS),
      messages: [
        {
          role: MessageRole.USER,
          content:
            "Can we support any JSON shape with light normalization before validation?",
          promptTokens: 54,
          completionTokens: 0,
          totalTokens: 54,
        },
        {
          role: MessageRole.ASSISTANT,
          content:
            "Yes. Normalize keys first, then enforce a canonical bundle with Zod. Show field-level errors back in the UI.",
          promptTokens: 54,
          completionTokens: 117,
          totalTokens: 171,
        },
      ],
      tasks: [
        {
          title: "Add generic source adapter",
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.HIGH,
        },
      ],
      tags: [ingestionTag],
    },
    {
      workspace: personal,
      sourceTool: chatgpt,
      title: "Debug flaky tests in parser",
      summary: "Stabilized parser tests by fixing timestamp handling.",
      externalSessionId: "chatgpt-personal-003",
      importSource: "seed",
      startedAt: new Date(Date.now() - 40 * HOURS),
      endedAt: new Date(Date.now() - 39 * HOURS),
      messages: [
        {
          role: MessageRole.USER,
          content:
            "Tests fail only on CI. I suspect timezone parsing in transcript timestamps.",
          promptTokens: 77,
          completionTokens: 0,
          totalTokens: 77,
        },
        {
          role: MessageRole.ASSISTANT,
          content:
            "Store timestamps as UTC and parse with explicit offsets. Avoid Date.parse on ambiguous strings.",
          promptTokens: 77,
          completionTokens: 162,
          totalTokens: 239,
        },
      ],
      tasks: [
        {
          title: "Write deterministic date parser tests",
          status: TaskStatus.OPEN,
          priority: TaskPriority.MEDIUM,
        },
      ],
      tags: [testingTag],
    },
  ];

  for (const base of sessionsData) {
    const session = await prisma.session.create({
      data: {
        workspaceId: base.workspace.id,
        sourceToolId: base.sourceTool.id,
        title: base.title,
        summary: base.summary,
        externalSessionId: base.externalSessionId,
        importSource: base.importSource,
        importedAt: new Date(),
        startedAt: base.startedAt,
        endedAt: base.endedAt,
      },
    });

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    for (const [index, message] of base.messages.entries()) {
      promptTokens += message.promptTokens;
      completionTokens += message.completionTokens;
      totalTokens += message.totalTokens;

      await prisma.message.create({
        data: {
          sessionId: session.id,
          role: message.role,
          content: message.content,
          promptTokens: message.promptTokens,
          completionTokens: message.completionTokens,
          totalTokens: message.totalTokens,
          ordinal: index,
        },
      });
    }

    for (const task of base.tasks) {
      await prisma.task.create({
        data: {
          sessionId: session.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
        },
      });
    }

    for (const tag of base.tags) {
      await prisma.sessionTag.create({
        data: {
          sessionId: session.id,
          tagId: tag.id,
        },
      });
    }

    await prisma.metricSnapshot.create({
      data: {
        sessionId: session.id,
        sourceToolId: base.sourceTool.id,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost: Number((totalTokens / 1_000_000).toFixed(6)),
      },
    });
  }

  const template = await prisma.promptTemplate.create({
    data: {
      name: "Session Summary",
      description: "Summarize key decisions and open tasks from a session.",
    },
  });

  await prisma.promptVersion.createMany({
    data: [
      {
        templateId: template.id,
        version: 1,
        content:
          "Summarize the transcript in 5 bullets. Include decisions and unresolved tasks.",
      },
      {
        templateId: template.id,
        version: 2,
        content:
          "Produce a concise summary with sections: Context, Decisions, Risks, Follow-ups.",
      },
    ],
  });

  await prisma.session.create({
    data: {
      workspaceId: work.id,
      sourceToolId: chatgpt.id,
      title: "Plan incremental migration from CJS to ESM",
      summary:
        "Created a low-risk migration plan and identified runtime path mapping caveats.",
      externalSessionId: "chatgpt-work-004",
      importSource: "seed",
      importedAt: new Date(),
      messages: {
        create: [
          {
            role: MessageRole.USER,
            content:
              "We need to migrate to ESM without breaking test runners and scripts.",
            ordinal: 0,
            totalTokens: 71,
            promptTokens: 71,
            completionTokens: 0,
          },
          {
            role: MessageRole.ASSISTANT,
            content:
              "Migrate package-by-package. Add dual exports first, then switch internal imports, then remove CJS.",
            ordinal: 1,
            totalTokens: 214,
            promptTokens: 71,
            completionTokens: 143,
          },
        ],
      },
      tasks: {
        create: {
          title: "Audit CJS-only dependencies",
          description: "List packages requiring interop wrappers",
          status: TaskStatus.OPEN,
          priority: TaskPriority.MEDIUM,
        },
      },
      tags: {
        create: {
          tagId: migrationTag.id,
        },
      },
      metricSnapshots: {
        create: {
          sourceToolId: chatgpt.id,
          totalTokens: 285,
          promptTokens: 142,
          completionTokens: 143,
          estimatedCost: 0.000285,
        },
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
