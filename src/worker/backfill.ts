import { prisma } from "../lib/prisma";
import { runIngestionCycle } from "../lib/ingestion/source-pipeline";

async function main() {
  await runIngestionCycle(prisma, "backfill");
  console.log("Backfill completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
