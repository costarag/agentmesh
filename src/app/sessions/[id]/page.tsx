import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageBlock } from "@/components/sessions/message-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getSessionById } from "@/lib/sessions";

export const dynamic = "force-dynamic";

interface SessionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({
  params,
}: SessionDetailPageProps) {
  const { id } = await params;
  const session = await getSessionById(id);

  if (!session) {
    notFound();
  }

  const latestMetric = session.metricSnapshots[0];
  type SessionMessage = (typeof session.messages)[number];
  type SessionTag = (typeof session.tags)[number];
  type SessionTask = (typeof session.tasks)[number];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-4">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{session.sourceTool.name}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {session.title}
          </h1>
          {session.summary ? (
            <p className="text-muted-foreground text-sm">{session.summary}</p>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href="/sessions">Back to sessions</Link>
          </Button>
        </header>

        <Separator />

        <div className="space-y-3">
          {session.messages.map((message: SessionMessage) => (
            <MessageBlock key={message.id} message={message} />
          ))}
        </div>
      </section>

      <aside className="space-y-4">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Session metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Created {new Date(session.createdAt).toLocaleString()}
            </p>
            <p className="text-muted-foreground">
              Last activity{" "}
              {session.lastActivityAt?.toLocaleString() ?? "unknown"}
            </p>
            <p className="text-muted-foreground">
              Source path {session.sourceSessionPath ?? "unknown"}
            </p>
            <p>{session.messages.length} messages</p>
            <p>{session.artifacts.length} artifacts</p>
            <p>{session.tasks.length} tasks</p>
            {latestMetric ? (
              <>
                <Separator />
                <p>{latestMetric.totalTokens} total tokens</p>
                <p>${latestMetric.estimatedCost.toString()} estimated cost</p>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Tags</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {session.tags.length === 0 ? (
              <span className="text-muted-foreground text-sm">No tags</span>
            ) : (
              session.tags.map((tag: SessionTag) => (
                <Badge key={tag.tagId} variant="outline">
                  {tag.tag.name}
                </Badge>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {session.tasks.length === 0 ? (
              <span className="text-muted-foreground text-sm">
                No derived tasks
              </span>
            ) : (
              session.tasks.map((task: SessionTask) => (
                <article
                  key={task.id}
                  className="rounded-md border p-2 text-sm"
                >
                  <p className="font-medium">{task.title}</p>
                  <p className="text-muted-foreground text-xs">{task.status}</p>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
