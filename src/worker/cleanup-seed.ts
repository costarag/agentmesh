import { prisma } from "../lib/prisma";

async function main() {
  await prisma.ingestionError.deleteMany();
  await prisma.ingestionRun.deleteMany();
  await prisma.ingestionCheckpoint.deleteMany();
  await prisma.ingestionSource.updateMany({
    data: {
      lastRunAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      statusMessage: "Reset after seed cleanup",
    },
  });

  const deletedSeedSessions = await prisma.session.deleteMany({
    where: {
      importSource: "seed",
    },
  });

  await prisma.promptVersion.deleteMany();
  await prisma.promptTemplate.deleteMany();

  await prisma.workspace.deleteMany({
    where: {
      slug: {
        in: ["personal", "work"],
      },
      sessions: {
        none: {},
      },
    },
  });

  await prisma.sourceTool.deleteMany({
    where: {
      sessions: {
        none: {},
      },
    },
  });

  const workspaceCount = await prisma.workspace.count();
  if (workspaceCount === 0) {
    await prisma.workspace.create({
      data: {
        name: "Default",
        slug: "default",
      },
    });
  }

  console.log(`Deleted ${deletedSeedSessions.count} seed sessions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
