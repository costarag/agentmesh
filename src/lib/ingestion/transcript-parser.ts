export type ParsedMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
};

export function parseTranscript(raw: string): ParsedMessage[] {
  const chunks = raw
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks
    .map((chunk, index) => {
      const lines = chunk.split("\n");
      const firstLine = lines[0]?.trim();
      const rest = lines.slice(1).join("\n").trim();

      if (!firstLine) {
        return null;
      }

      const userMatch = firstLine.match(/^user:\s*(.*)$/i);
      const assistantMatch = firstLine.match(/^assistant:\s*(.*)$/i);
      const toolMatch = firstLine.match(/^tool:\s*(.*)$/i);

      if (userMatch) {
        return {
          role: "user" as const,
          content: `${userMatch[1]}${rest ? `\n${rest}` : ""}`.trim(),
        };
      }

      if (assistantMatch) {
        return {
          role: "assistant" as const,
          content: `${assistantMatch[1]}${rest ? `\n${rest}` : ""}`.trim(),
        };
      }

      if (toolMatch) {
        return {
          role: "tool" as const,
          content: `${toolMatch[1]}${rest ? `\n${rest}` : ""}`.trim(),
        };
      }

      return {
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: chunk,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}
