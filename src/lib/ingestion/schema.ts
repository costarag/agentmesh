import { z } from "zod";

export const canonicalBundleSchema = z.object({
  session: z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
    externalSessionId: z.string().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
  }),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "tool"]),
        content: z.string().min(1),
        metadata: z.record(z.string(), z.unknown()).optional(),
        promptTokens: z.number().int().nonnegative().optional(),
        completionTokens: z.number().int().nonnegative().optional(),
        totalTokens: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
      }),
    )
    .optional(),
  artifacts: z
    .array(
      z.object({
        type: z.string().min(1),
        name: z.string().min(1),
        content: z.string(),
        messageIndex: z.number().int().nonnegative().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  tags: z.array(z.string().min(1)).optional(),
});

export type CanonicalBundleInput = z.infer<typeof canonicalBundleSchema>;
