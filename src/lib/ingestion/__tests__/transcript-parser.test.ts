import { describe, expect, it } from "bun:test";
import { parseTranscript } from "../transcript-parser";

describe("parseTranscript", () => {
  it("parses a simple user/assistant exchange", () => {
    const raw = "user: Hello\n\nassistant: Hi there";
    const result = parseTranscript(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "Hello" });
    expect(result[1]).toEqual({ role: "assistant", content: "Hi there" });
  });

  it("is case-insensitive for role prefixes", () => {
    const raw = "User: Hello\n\nAssistant: Hi\n\nTool: output";
    const result = parseTranscript(raw);
    expect(result[0]?.role).toBe("user");
    expect(result[1]?.role).toBe("assistant");
    expect(result[2]?.role).toBe("tool");
  });

  it("handles multi-line message bodies", () => {
    const raw = "user: First line\nSecond line\nThird line";
    const result = parseTranscript(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe("First line\nSecond line\nThird line");
  });

  it("splits on two or more consecutive blank lines", () => {
    const raw = "user: A\n\n\nassistant: B";
    const result = parseTranscript(raw);
    expect(result).toHaveLength(2);
  });

  it("assigns alternating roles when no role prefix is present", () => {
    const raw = "First chunk\n\nSecond chunk\n\nThird chunk";
    const result = parseTranscript(raw);
    expect(result[0]?.role).toBe("user");
    expect(result[1]?.role).toBe("assistant");
    expect(result[2]?.role).toBe("user");
  });

  it("parses the tool role", () => {
    const raw = "tool: bash output here";
    const result = parseTranscript(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: "tool", content: "bash output here" });
  });

  it("returns an empty array for blank input", () => {
    expect(parseTranscript("")).toHaveLength(0);
    expect(parseTranscript("   \n\n   ")).toHaveLength(0);
  });

  it("includes inline text after the role prefix in the content", () => {
    const raw = "assistant: The answer is 42";
    const result = parseTranscript(raw);
    expect(result[0]?.content).toBe("The answer is 42");
  });

  it("combines inline text and following lines into the content", () => {
    const raw = "user: Question header\nDetails on the next line";
    const result = parseTranscript(raw);
    expect(result[0]?.content).toBe(
      "Question header\nDetails on the next line",
    );
  });

  it("handles a single chunk with no role prefix as user turn", () => {
    const raw = "Just some text with no role marker";
    const result = parseTranscript(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("user");
    expect(result[0]?.content).toBe("Just some text with no role marker");
  });

  it("filters out chunks that produce empty content", () => {
    const raw = "user: Hello\n\n\n\n\nassistant: World";
    const result = parseTranscript(raw);
    expect(result.every((m) => m.content.length > 0)).toBe(true);
  });
});
