import Link from "next/link";
import type { Session, SourceTool } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";

type SessionListItem = Session & {
  sourceTool: SourceTool;
  messages: Array<{
    modelProvider: string | null;
    modelId: string | null;
    content: string;
  }>;
  _count: {
    messages: number;
  };
};

function getModelLabel(
  modelProvider: string | null | undefined,
  modelId: string | null | undefined,
) {
  const provider = modelProvider?.trim();
  const model = modelId?.trim();

  if (model) {
    return model;
  }

  return provider || null;
}

interface SessionRowProps {
  session: SessionListItem;
}

function cleanPreviewText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replaceAll(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/gi, "")
    .replaceAll(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
    .replaceAll(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/gi, "")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function cleanSummaryText(value: string) {
  return value
    .replaceAll(/^caveat:\s.*$/gim, "")
    .replaceAll(/^assistant message$/gim, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export function SessionRow({ session }: SessionRowProps) {
  const elapsedMinutes = session.lastActivityAt
    ? (Date.now() - session.lastActivityAt.getTime()) / (60 * 1000)
    : null;
  const activityStatus =
    elapsedMinutes === null
      ? null
      : elapsedMinutes <= 5
        ? "active"
        : elapsedMinutes <= 30
          ? "idle"
          : "closed";
  const modelLabel = getModelLabel(
    session.messages[0]?.modelProvider,
    session.messages[0]?.modelId,
  );
  const title = cleanPreviewText(session.title) || "Untitled session";
  const rawSummary = cleanPreviewText(session.summary);
  const fallbackFromMessage = cleanPreviewText(session.messages[0]?.content);
  const summaryCandidate = rawSummary || fallbackFromMessage;
  const summary = summaryCandidate
    ? cleanSummaryText(summaryCandidate) || "No summary yet"
    : "No summary yet";
  const statusTone =
    activityStatus === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : activityStatus === "idle"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-600";

  return (
    <Link href={`/sessions/${session.id}`} className="block">
      <Card className="border-border/70 hover:border-border hover:bg-muted/10 rounded-xl shadow-none transition-all">
        <CardContent className="px-6 py-3.5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 pr-4">
              <p className="truncate text-[13px] font-medium leading-tight tracking-tight">
                {title}
              </p>
              <p className="text-muted-foreground mt-1 line-clamp-1 min-w-0 text-[11px] leading-tight">
                {summary}
              </p>
            </div>
            <div className="pr-1 flex w-[19rem] shrink-0 items-center justify-end gap-1.5 pt-0.5">
              <span className="text-muted-foreground shrink-0 text-[8px]">
                {session._count.messages} msgs
              </span>
              <div className="flex max-w-full flex-nowrap items-center justify-end gap-1">
                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[8px] font-medium leading-none text-zinc-700">
                  {session.sourceTool.name}
                </span>
                {modelLabel ? (
                  <span className="inline-flex max-w-36 items-center truncate rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[8px] font-medium leading-none text-zinc-600">
                    {modelLabel}
                  </span>
                ) : null}
                {activityStatus ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[8px] font-medium leading-none ${statusTone}`}
                  >
                    {activityStatus}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
