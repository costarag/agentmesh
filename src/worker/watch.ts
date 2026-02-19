import { prisma } from "../lib/prisma";
import { runIngestionCycle } from "../lib/ingestion/source-pipeline";

const POLL_INTERVAL_MS = Number(process.env.INGEST_POLL_INTERVAL_MS ?? "30000");

async function tick() {
  await runIngestionCycle(prisma, "poll");
}

async function main() {
  console.log(
    `Starting AgentMesh ingestion watcher (${POLL_INTERVAL_MS}ms interval)`,
  );

  await tick();

  const interval = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);

  process.on("SIGINT", async () => {
    clearInterval(interval);
    await prisma.$disconnect();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    clearInterval(interval);
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
