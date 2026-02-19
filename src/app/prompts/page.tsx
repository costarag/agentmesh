import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function normalizePrompt(value: string) {
  return value.replaceAll(/\s+/g, " ").trim();
}

function promptKey(value: string) {
  return normalizePrompt(value).toLowerCase();
}

type PromptCandidate = {
  id: string;
  content: string;
  sourceTool: string;
  sessionId: string;
  sessionTitle: string;
  createdAt: Date;
  modelProvider: string | null;
  modelId: string | null;
};

export default async function PromptsPage() {
  const userMessages = await prisma.message.findMany({
    where: {
      role: "USER",
      content: {
        not: "",
      },
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
    take: 300,
  });
  type UserMessage = (typeof userMessages)[number];

  const cleaned = userMessages
    .map((message: UserMessage) => ({
      id: message.id,
      content: normalizePrompt(message.content),
      sourceTool: message.session.sourceTool.name,
      sessionId: message.session.id,
      sessionTitle: message.session.title,
      createdAt: message.sourceTimestamp ?? message.createdAt,
      modelProvider: message.modelProvider,
      modelId: message.modelId,
    }))
    .filter((message: PromptCandidate) => message.content.length >= 12);

  const recentPrompts = cleaned.slice(0, 40);
  const recurringMap = new Map<string, { text: string; count: number }>();
  for (const prompt of cleaned) {
    const key = promptKey(prompt.content);
    const existing = recurringMap.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    recurringMap.set(key, { text: prompt.content, count: 1 });
  }

  const recurringPrompts = [...recurringMap.values()]
    .filter((entry) => entry.count >= 2)
    .sort((left, right) => right.count - left.count)
    .slice(0, 20);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Prompts</h1>
        <p className="text-muted-foreground text-sm">
          Real prompts observed from your sessions, including recurring
          patterns.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Recurring prompts</h2>
        {recurringPrompts.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
            No recurring prompts yet.
          </div>
        ) : (
          recurringPrompts.map((prompt) => (
            <article key={prompt.text} className="rounded-md border p-3">
              <p className="text-sm">{prompt.text}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Seen {prompt.count} times
              </p>
            </article>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Recent prompts</h2>
        {recentPrompts.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
            No prompts available.
          </div>
        ) : (
          recentPrompts.map((prompt: (typeof recentPrompts)[number]) => (
            <article key={prompt.id} className="rounded-md border p-3">
              <p className="text-sm">{prompt.content}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {prompt.sourceTool}
                {prompt.modelProvider || prompt.modelId
                  ? ` · ${prompt.modelProvider ?? ""}${prompt.modelProvider && prompt.modelId ? "/" : ""}${prompt.modelId ?? ""}`
                  : ""}
                {" · "}
                <Link
                  className="underline"
                  href={`/sessions/${prompt.sessionId}`}
                >
                  {prompt.sessionTitle}
                </Link>
                {" · "}
                {prompt.createdAt.toLocaleString()}
              </p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
