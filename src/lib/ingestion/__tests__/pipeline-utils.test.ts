import { describe, expect, it } from "bun:test";
import { MessagePartType, MessageRole } from "@prisma/client";
import {
  deriveSessionSummary,
  fallbackSessionTitle,
  mapClaudePartType,
  mapClaudeRole,
  mapOpenCodePartType,
  mapOpenCodeRole,
  sanitizeImportedText,
  type IngestMessageInput,
} from "../source-pipeline";

// Minimal helper so tests stay readable
function makeMessage(role: MessageRole, content: string): IngestMessageInput {
  return {
    externalMessageId: `msg-${Math.random()}`,
    role,
    content,
    ordinal: 0,
    parts: [],
  };
}

describe("sanitizeImportedText", () => {
  it("removes <local-command-caveat> blocks", () => {
    const input =
      "before<local-command-caveat>secret</local-command-caveat>after";
    expect(sanitizeImportedText(input)).toBe("beforeafter");
  });

  it("removes <system-reminder> blocks", () => {
    const input = "start<system-reminder>internal note</system-reminder>end";
    expect(sanitizeImportedText(input)).toBe("startend");
  });

  it("removes <local-command-stdout> blocks", () => {
    const input =
      "out:<local-command-stdout>$ ls -la</local-command-stdout>done";
    expect(sanitizeImportedText(input)).toBe("out:done");
  });

  it("handles multiline XML blocks", () => {
    const input =
      "before\n<system-reminder>\nline1\nline2\n</system-reminder>\nafter";
    expect(sanitizeImportedText(input)).toBe("before\n\nafter");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeImportedText("  hello world  ")).toBe("hello world");
  });

  it("returns empty string when all content is stripped", () => {
    expect(
      sanitizeImportedText("<system-reminder>all gone</system-reminder>"),
    ).toBe("");
  });

  it("is case-insensitive for tag names", () => {
    const input = "x<SYSTEM-REMINDER>hidden</SYSTEM-REMINDER>y";
    expect(sanitizeImportedText(input)).toBe("xy");
  });
});

describe("fallbackSessionTitle", () => {
  it("uses the session ID prefix when content is empty", () => {
    const title = fallbackSessionTitle("", "abcdefgh-1234-5678");
    expect(title).toBe("Session abcdefgh");
  });

  it("uses the session ID prefix when content is only whitespace", () => {
    const title = fallbackSessionTitle("   ", "abcdefgh-0000");
    expect(title).toBe("Session abcdefgh");
  });

  it("returns cleaned content as the title", () => {
    const title = fallbackSessionTitle("  Help me with TypeScript  ", "abc");
    expect(title).toBe("Help me with TypeScript");
  });

  it("truncates long content to 80 characters", () => {
    const longContent = "a".repeat(100);
    const title = fallbackSessionTitle(longContent, "session-id");
    expect(title.length).toBeLessThanOrEqual(80);
  });

  it("collapses internal whitespace", () => {
    const title = fallbackSessionTitle("fix   the  bug\nnow", "id");
    expect(title).toBe("fix the bug now");
  });
});

describe("mapClaudeRole", () => {
  it("maps 'assistant' to ASSISTANT", () => {
    expect(mapClaudeRole("assistant")).toBe(MessageRole.ASSISTANT);
  });

  it("maps 'system' to TOOL", () => {
    expect(mapClaudeRole("system")).toBe(MessageRole.TOOL);
  });

  it("maps 'progress' to TOOL", () => {
    expect(mapClaudeRole("progress")).toBe(MessageRole.TOOL);
  });

  it("defaults unknown type to USER", () => {
    expect(mapClaudeRole("human")).toBe(MessageRole.USER);
  });

  it("defaults undefined to USER", () => {
    expect(mapClaudeRole(undefined)).toBe(MessageRole.USER);
  });
});

describe("mapClaudePartType", () => {
  it("maps 'text' to TEXT", () => {
    expect(mapClaudePartType("text")).toBe(MessagePartType.TEXT);
  });

  it("maps 'thinking' to REASONING", () => {
    expect(mapClaudePartType("thinking")).toBe(MessagePartType.REASONING);
  });

  it("maps 'tool_use' to TOOL", () => {
    expect(mapClaudePartType("tool_use")).toBe(MessagePartType.TOOL);
  });

  it("maps 'tool_result' to TOOL", () => {
    expect(mapClaudePartType("tool_result")).toBe(MessagePartType.TOOL);
  });

  it("maps unknown type to OTHER", () => {
    expect(mapClaudePartType("image")).toBe(MessagePartType.OTHER);
  });

  it("maps undefined to OTHER", () => {
    expect(mapClaudePartType(undefined)).toBe(MessagePartType.OTHER);
  });
});

describe("mapOpenCodeRole", () => {
  it("maps 'assistant' to ASSISTANT", () => {
    expect(mapOpenCodeRole("assistant")).toBe(MessageRole.ASSISTANT);
  });

  it("maps 'tool' to TOOL", () => {
    expect(mapOpenCodeRole("tool")).toBe(MessageRole.TOOL);
  });

  it("maps 'user' to USER", () => {
    expect(mapOpenCodeRole("user")).toBe(MessageRole.USER);
  });

  it("defaults undefined to USER", () => {
    expect(mapOpenCodeRole(undefined)).toBe(MessageRole.USER);
  });
});

describe("mapOpenCodePartType", () => {
  const cases: Array<[string, MessagePartType]> = [
    ["text", MessagePartType.TEXT],
    ["reasoning", MessagePartType.REASONING],
    ["tool", MessagePartType.TOOL],
    ["step-start", MessagePartType.STEP_START],
    ["step-finish", MessagePartType.STEP_FINISH],
    ["error", MessagePartType.ERROR],
  ];

  for (const [input, expected] of cases) {
    it(`maps '${input}' to ${expected}`, () => {
      expect(mapOpenCodePartType(input)).toBe(expected);
    });
  }

  it("maps unknown type to OTHER", () => {
    expect(mapOpenCodePartType("blob")).toBe(MessagePartType.OTHER);
  });

  it("maps undefined to OTHER", () => {
    expect(mapOpenCodePartType(undefined)).toBe(MessagePartType.OTHER);
  });
});

describe("deriveSessionSummary", () => {
  it("prefers the first assistant message", () => {
    const messages = [
      makeMessage(MessageRole.USER, "What is TypeScript?"),
      makeMessage(
        MessageRole.ASSISTANT,
        "TypeScript is a typed superset of JavaScript.",
      ),
    ];
    const summary = deriveSessionSummary(messages);
    expect(summary).toContain("TypeScript is a typed superset");
  });

  it("falls back to the user message when no assistant message exists", () => {
    const messages = [makeMessage(MessageRole.USER, "Hello from user")];
    expect(deriveSessionSummary(messages)).toBe("Hello from user");
  });

  it("truncates content longer than 180 characters and appends ellipsis", () => {
    const longContent = "x".repeat(200);
    const messages = [makeMessage(MessageRole.USER, longContent)];
    const summary = deriveSessionSummary(messages);
    expect(summary?.length).toBe(180);
    expect(summary?.endsWith("...")).toBe(true);
  });

  it("returns the full string when content is exactly 180 characters", () => {
    const content = "y".repeat(180);
    const messages = [makeMessage(MessageRole.USER, content)];
    const summary = deriveSessionSummary(messages);
    expect(summary?.length).toBe(180);
    expect(summary?.endsWith("...")).toBe(false);
  });

  it("strips XML tags from the content before truncating", () => {
    const content = `<system-reminder>hidden</system-reminder>${"z".repeat(50)}`;
    const messages = [makeMessage(MessageRole.USER, content)];
    const summary = deriveSessionSummary(messages);
    expect(summary).not.toContain("hidden");
  });

  it("returns null for an empty messages array", () => {
    expect(deriveSessionSummary([])).toBeNull();
  });

  it("returns null when all messages have empty content", () => {
    const messages = [makeMessage(MessageRole.USER, "")];
    expect(deriveSessionSummary(messages)).toBeNull();
  });
});
