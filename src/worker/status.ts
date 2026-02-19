import { prisma } from "../lib/prisma";

async function main() {
  const sources = await prisma.ingestionSource.findMany({
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (sources.length === 0) {
    console.log("No ingestion sources configured.");
    return;
  }

  for (const source of sources) {
    const lastRun = source.runs[0];
    console.log(`${source.name} (${source.type})`);
    console.log(`  enabled: ${source.isEnabled}`);
    console.log(`  status: ${source.statusMessage ?? "n/a"}`);
    console.log(
      `  last success: ${source.lastSuccessAt?.toISOString() ?? "never"}`,
    );
    console.log(
      `  last error: ${source.lastErrorAt?.toISOString() ?? "never"}`,
    );
    if (lastRun) {
      console.log(
        `  last run: ${lastRun.status} sessions=${lastRun.scannedSessions} messages=${lastRun.upsertedMessages} parts=${lastRun.upsertedParts}`,
      );
    }
    console.log("");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
