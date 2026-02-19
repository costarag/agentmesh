"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Option {
  id: string;
  name: string;
}

interface ManualSessionFormProps {
  sourceTools: Option[];
  workspaces: Option[];
}

interface EditableMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
}

export function ManualSessionForm({
  sourceTools,
  workspaces,
}: ManualSessionFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [transcript, setTranscript] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [sourceToolId, setSourceToolId] = useState(sourceTools[0]?.id ?? "");
  const [messages, setMessages] = useState<EditableMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addMessage() {
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: "",
      },
    ]);
  }

  function removeMessage(id: string) {
    setMessages((current) => current.filter((message) => message.id !== id));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/sessions/manual", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        summary: summary || undefined,
        workspaceId,
        sourceToolId,
        transcript: transcript || undefined,
        messages: messages
          .filter((message) => message.content.trim().length > 0)
          .map(({ role, content }) => ({ role, content })),
      }),
    });

    const data = (await response.json()) as {
      error?: string;
      sessionId?: string;
    };

    if (!response.ok || !data.sessionId) {
      setError(data.error ?? "Could not create session.");
      setSubmitting(false);
      return;
    }

    router.push(`/sessions/${data.sessionId}`);
    router.refresh();
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Create manual session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Title</p>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Summary</p>
            <Input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Workspace</p>
            <Select value={workspaceId} onValueChange={setWorkspaceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Source tool</p>
            <Select value={sourceToolId} onValueChange={setSourceToolId}>
              <SelectTrigger>
                <SelectValue placeholder="Select source tool" />
              </SelectTrigger>
              <SelectContent>
                {sourceTools.map((tool) => (
                  <SelectItem key={tool.id} value={tool.id}>
                    {tool.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Paste transcript</p>
          <Textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            className="min-h-44"
            placeholder="Use blocks like User: ... Assistant: ..."
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Or add messages manually</p>
            <Button variant="outline" size="sm" onClick={addMessage}>
              <Plus className="mr-1 size-4" />
              Add message
            </Button>
          </div>
          {messages.map((message, index) => (
            <div
              key={message.id}
              className="grid gap-2 rounded-md border p-3 md:grid-cols-[160px_1fr_auto]"
            >
              <Select
                value={message.role}
                onValueChange={(role) => {
                  setMessages((current) =>
                    current.map((entry) =>
                      entry.id === message.id
                        ? { ...entry, role: role as EditableMessage["role"] }
                        : entry,
                    ),
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="assistant">assistant</SelectItem>
                  <SelectItem value="tool">tool</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={message.content}
                onChange={(event) => {
                  setMessages((current) =>
                    current.map((entry) =>
                      entry.id === message.id
                        ? { ...entry, content: event.target.value }
                        : entry,
                    ),
                  );
                }}
                placeholder={`Message ${index + 1}`}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeMessage(message.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <Button onClick={handleSubmit} disabled={submitting || !title.trim()}>
          {submitting ? "Saving..." : "Create session"}
        </Button>
      </CardContent>
    </Card>
  );
}
