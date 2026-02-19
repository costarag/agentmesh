import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let databaseStatus: "connected" | "error" = "connected";
  let errorMessage: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    databaseStatus = "error";
    errorMessage = error instanceof Error ? error.message : "Unknown error";
  }

  const recentImports = await prisma.session.findMany({
    where: {
      importedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      importSource: true,
      importedAt: true,
    },
    orderBy: {
      importedAt: "desc",
    },
    take: 8,
  });

  const ingestionSources = await prisma.ingestionSource.findMany({
    include: {
      runs: {
        orderBy: {
          startedAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
  type IngestionSourceItem = (typeof ingestionSources)[number];
  type RecentImport = (typeof recentImports)[number];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Runtime status and recent ingestion activity.
        </p>
      </header>

      <section className="rounded-md border p-4">
        <p className="text-sm font-medium">Database</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Status:{" "}
          {databaseStatus === "connected" ? "Connected" : "Connection error"}
        </p>
        {errorMessage ? (
          <p className="text-destructive mt-2 font-mono text-xs">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-md border p-4">
        <p className="text-sm font-medium">Ingestion sources</p>
        {ingestionSources.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No ingestion sources configured yet.
          </p>
        ) : (
          ingestionSources.map((source: IngestionSourceItem) => (
            <article key={source.id} className="rounded border p-2">
              <p className="text-sm font-medium">
                {source.name} ({source.type})
              </p>
              <p className="text-muted-foreground text-xs">
                {source.statusMessage ?? "No status yet"}
              </p>
              {source.runs[0] ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  Last run {source.runs[0].status} · sessions{" "}
                  {source.runs[0].scannedSessions} · messages{" "}
                  {source.runs[0].upsertedMessages} · parts{" "}
                  {source.runs[0].upsertedParts}
                </p>
              ) : null}
            </article>
          ))
        )}
      </section>

      <section className="space-y-2 rounded-md border p-4">
        <p className="text-sm font-medium">Recent imports</p>
        {recentImports.length === 0 ? (
          <p className="text-muted-foreground text-sm">No imports yet.</p>
        ) : (
          recentImports.map((session: RecentImport) => (
            <article key={session.id} className="rounded border p-2">
              <p className="text-sm">{session.title}</p>
              <p className="text-muted-foreground text-xs">
                {session.importSource ?? "unknown"} -{" "}
                {session.importedAt?.toLocaleString()}
              </p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
