import Link from "next/link";
import { SessionsFilters } from "@/components/sessions/sessions-filters";
import { SessionRow } from "@/components/sessions/session-row";
import { Button } from "@/components/ui/button";
import { getSessionFilters, getSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

interface SessionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function SessionsPage({
  searchParams,
}: SessionsPageProps) {
  const params = await searchParams;
  const page = Number(getQueryValue(params.page) ?? "1");
  const search = getQueryValue(params.search);
  const sourceToolId = getQueryValue(params.sourceToolId);
  const modelKey = getQueryValue(params.modelKey);
  const from = getQueryValue(params.from);
  const to = getQueryValue(params.to);

  const [{ sessions, pageCount }, { sourceTools, models }] = await Promise.all([
    getSessions({ page, search, sourceToolId, modelKey, from, to }),
    getSessionFilters(),
  ]);
  type SessionItem = (typeof sessions)[number];

  const previousPage = Math.max(1, page - 1);
  const nextPage = Math.min(pageCount, page + 1);
  const query = new URLSearchParams();
  if (search) {
    query.set("search", search);
  }
  if (sourceToolId) {
    query.set("sourceToolId", sourceToolId);
  }
  if (modelKey) {
    query.set("modelKey", modelKey);
  }
  if (from) {
    query.set("from", from);
  }
  if (to) {
    query.set("to", to);
  }
  const base = query.toString();

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-muted-foreground text-sm">
            Search and review normalized sessions from all tools.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/sessions/new">New Session</Link>
          </Button>
        </div>
      </section>

      <SessionsFilters
        sourceTools={sourceTools}
        models={models}
        initialSearch={search}
        initialSourceToolId={sourceToolId}
        initialModelKey={modelKey}
        initialFrom={from}
        initialTo={to}
      />

      <section className="space-y-4">
        {sessions.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            No sessions match the current filters.
          </div>
        ) : (
          sessions.map((session: SessionItem) => (
            <SessionRow key={session.id} session={session} />
          ))
        )}
      </section>

      <nav className="flex items-center justify-end gap-2">
        <Button asChild variant="outline" size="sm" disabled={page <= 1}>
          <Link
            href={`/sessions?${base}${base ? "&" : ""}page=${previousPage}`}
          >
            Previous
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
        >
          <Link href={`/sessions?${base}${base ? "&" : ""}page=${nextPage}`}>
            Next
          </Link>
        </Button>
      </nav>
    </div>
  );
}
