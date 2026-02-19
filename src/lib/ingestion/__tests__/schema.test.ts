import { describe, expect, it } from "bun:test";
import { canonicalBundleSchema } from "../schema";

describe("canonicalBundleSchema", () => {
  it("accepts a minimal valid bundle", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test session" },
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts all three message roles", () => {
    for (const role of ["user", "assistant", "tool"]) {
      const result = canonicalBundleSchema.safeParse({
        session: { title: "Test" },
        messages: [{ role, content: "Hello" }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an empty messages array", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test" },
      messages: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty session title", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "" },
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown message role", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test" },
      messages: [{ role: "system", content: "Hello" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a message with empty content", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test" },
      messages: [{ role: "user", content: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative token counts", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test" },
      messages: [{ role: "user", content: "Hello", promptTokens: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid ISO datetime strings for session dates", () => {
    const result = canonicalBundleSchema.safeParse({
      session: {
        title: "Test",
        startedAt: "2024-01-01T00:00:00.000Z",
        endedAt: "2024-01-01T01:00:00.000Z",
      },
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-ISO date strings", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test", startedAt: "January 1 2024" },
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional tasks with status and priority", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test" },
      messages: [{ role: "user", content: "Hello" }],
      tasks: [{ title: "Do something", status: "open", priority: "high" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects tasks with an empty title", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test" },
      messages: [{ role: "user", content: "Hello" }],
      tasks: [{ title: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown task status", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test" },
      messages: [{ role: "user", content: "Hello" }],
      tasks: [{ title: "Task", status: "blocked" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional artifacts with type, name, and content", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test" },
      messages: [{ role: "user", content: "Hello" }],
      artifacts: [
        { type: "code", name: "snippet.ts", content: "const x = 1;" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional tags", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test" },
      messages: [{ role: "user", content: "Hello" }],
      tags: ["typescript", "refactoring"],
    });
    expect(result.success).toBe(true);
  });

  it("preserves parsed token values", () => {
    const result = canonicalBundleSchema.safeParse({
      session: { title: "Test" },
      messages: [
        {
          role: "assistant",
          content: "Response",
          promptTokens: 50,
          completionTokens: 100,
          totalTokens: 150,
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const msg = result.data.messages[0];
      expect(msg?.promptTokens).toBe(50);
      expect(msg?.completionTokens).toBe(100);
      expect(msg?.totalTokens).toBe(150);
    }
  });
});
