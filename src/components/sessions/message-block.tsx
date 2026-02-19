import type { Message, MessagePart } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MessageBlockProps {
  message: Message & { parts?: MessagePart[] };
}

const ROLE_STYLES: Record<string, string> = {
  USER: "border-blue-200/70 bg-blue-50/50",
  ASSISTANT: "border-zinc-200 bg-zinc-50",
  TOOL: "border-amber-200/70 bg-amber-50/50",
};

export function MessageBlock({ message }: MessageBlockProps) {
  return (
    <article
      className={cn(
        "rounded-xl border p-3 text-sm leading-relaxed",
        ROLE_STYLES[message.role] ?? "border-border bg-card",
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px] uppercase">
            {message.role.toLowerCase()}
          </Badge>
          {message.modelProvider || message.modelId ? (
            <Badge variant="secondary" className="text-[11px]">
              {message.modelProvider && message.modelId
                ? `${message.modelProvider}/${message.modelId}`
                : message.modelProvider || message.modelId}
            </Badge>
          ) : null}
        </div>
        <span className="text-muted-foreground text-xs">
          #{message.ordinal + 1}
        </span>
      </header>
      <p className="whitespace-pre-wrap">{message.content}</p>
      {message.parts && message.parts.length > 0 ? (
        <div className="mt-3 space-y-2">
          {message.parts.map((part: MessagePart) => (
            <div
              key={part.id}
              className="bg-background/70 rounded-md border p-2 text-xs"
            >
              <p className="text-muted-foreground mb-1 font-mono uppercase">
                {part.partType.toLowerCase()}
              </p>
              {part.text ? (
                <p className="whitespace-pre-wrap">{part.text}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <footer className="text-muted-foreground mt-2 text-xs">
        {message.totalTokens ?? 0} tokens
      </footer>
    </article>
  );
}
