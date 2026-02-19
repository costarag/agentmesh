import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getActivityStatus(lastActivityAt: Date) {
  const elapsedMs = Date.now() - lastActivityAt.getTime();
  const elapsedMin = elapsedMs / (60 * 1000);

  if (elapsedMin <= 5) {
    return "active";
  }

  if (elapsedMin <= 30) {
    return "idle";
  }

  return "closed";
}

export default async function ActivityPage() {
  const [sessions, recentEvents, ingestionSources] = await Promise.all([
    prisma.session.findMany({
      where: {
        lastActivityAt: {
          not: null,
        },
      },
      select: {
        id: true,
        lastActivityAt: true,
      },
      take: 400,
    }),
    prisma.message.findMany({
      include: {
        session: {
          select: {
            id: true,
            title: true,
            sourceTool: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        sourceTimestamp: "desc",
      },
      take: 120,
    }),
    prisma.ingestionSource.findMany({
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        name: true,
        statusMessage: true,
        lastSuccessAt: true,
      },
    }),
  ]);
  type IngestionSourceItem = (typeof ingestionSources)[number];
  type ActivityEvent = (typeof recentEvents)[number];

  let activeCount = 0;
  let idleCount = 0;
  let closedCount = 0;

  for (const session of sessions) {
    if (!session.lastActivityAt) {
      continue;
    }

    const status = getActivityStatus(session.lastActivityAt);
    if (status === "active") {
      activeCount += 1;
    } else if (status === "idle") {
      idleCount += 1;
    } else {
      closedCount += 1;
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground text-sm">
          Live operational view: current status, ingestion health, and latest
          message events.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Active sessions</p>
          <p className="text-xl font-semibold">{activeCount}</p>
        </article>
        <article className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Idle sessions</p>
          <p className="text-xl font-semibold">{idleCount}</p>
        </article>
        <article className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">Closed sessions</p>
          <p className="text-xl font-semibold">{closedCount}</p>
        </article>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Ingestion health</h2>
        {ingestionSources.map((source: IngestionSourceItem) => (
          <article key={source.id} className="rounded-md border p-3">
            <p className="text-sm font-medium">{source.name}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {source.statusMessage ?? "No status yet"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Last success: {source.lastSuccessAt?.toLocaleString() ?? "never"}
            </p>
          </article>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Recent events</h2>
        {recentEvents.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
            No events yet.
          </div>
        ) : (
          recentEvents.map((event: ActivityEvent) => (
            <article key={event.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{event.session.sourceTool.name}</Badge>
                <Badge variant="secondary">{event.role.toLowerCase()}</Badge>
                {event.modelProvider || event.modelId ? (
                  <Badge variant="secondary">
                    {event.modelProvider ?? ""}
                    {event.modelProvider && event.modelId ? "/" : ""}
                    {event.modelId ?? ""}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 text-sm line-clamp-3">{event.content}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                <Link
                  className="underline"
                  href={`/sessions/${event.session.id}`}
                >
                  {event.session.title}
                </Link>
                {" · "}
                {(event.sourceTimestamp ?? event.createdAt).toLocaleString()}
              </p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
