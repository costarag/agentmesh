import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TASK_PATTERNS = [
  /^\s*- \[ \]\s+(.+)$/gm,
  /^\s*TODO:\s+(.+)$/gim,
  /^\s*Next:\s+(.+)$/gim,
];

function extractTaskCandidates(content: string) {
  const candidates: string[] = [];
  for (const pattern of TASK_PATTERNS) {
    const matches = [...content.matchAll(pattern)];
    for (const match of matches) {
      const text = match[1]?.trim();
      if (text && text.length >= 6) {
        candidates.push(text);
      }
    }
  }

  if (candidates.length > 0) {
    return candidates;
  }

  if (
    content.length > 40 &&
    /\b(need to|should|must|action)\b/i.test(content)
  ) {
    return [content.split("\n")[0]?.trim() ?? content.slice(0, 140)];
  }

  return [];
}

export default async function TasksPage() {
  const [tasks, candidateMessages] = await Promise.all([
    prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        session: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      take: 50,
    }),
    prisma.message.findMany({
      where: {
        OR: [
          { content: { contains: "TODO", mode: "insensitive" } },
          { content: { contains: "- [ ]", mode: "insensitive" } },
          { content: { contains: "Next:", mode: "insensitive" } },
          { content: { contains: "need to", mode: "insensitive" } },
        ],
      },
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
      take: 200,
    }),
  ]);
  type StructuredTask = (typeof tasks)[number];
  type CandidateMessage = (typeof candidateMessages)[number];

  const derivedTasks = candidateMessages
    .flatMap((message: CandidateMessage) =>
      extractTaskCandidates(message.content).map((title) => ({
        id: `${message.id}-${title.slice(0, 20)}`,
        title,
        sessionId: message.session.id,
        sessionTitle: message.session.title,
        sourceTool: message.session.sourceTool.name,
      })),
    )
    .slice(0, 60);

  const hasStoredTasks = tasks.length > 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground text-sm">
          Action items derived from conversations and structured task records.
        </p>
      </header>

      {hasStoredTasks ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Structured tasks</h2>
          {tasks.map((task: StructuredTask) => (
            <article key={task.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{task.title}</p>
                <p className="text-muted-foreground text-xs">{task.status}</p>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                Session: {task.session.title}
              </p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Derived tasks</h2>
        {derivedTasks.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
            No task-like lines detected yet.
          </div>
        ) : (
          derivedTasks.map((task: (typeof derivedTasks)[number]) => (
            <article key={task.id} className="rounded-md border p-3">
              <p className="text-sm font-medium">{task.title}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {task.sourceTool} ·{" "}
                <Link
                  className="underline"
                  href={`/sessions/${task.sessionId}`}
                >
                  {task.sessionTitle}
                </Link>
              </p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
