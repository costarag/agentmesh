import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestCanonicalBundle } from "@/lib/ingestion/service";
import { parseTranscript } from "@/lib/ingestion/transcript-parser";

const manualSessionSchema = z.object({
  workspaceId: z.string().min(1),
  sourceToolId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  transcript: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "tool"]),
        content: z.string().min(1),
      }),
    )
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = manualSessionSchema.parse(body);

    const transcriptMessages = parsed.transcript
      ? parseTranscript(parsed.transcript)
      : [];
    const providedMessages = parsed.messages ?? [];
    const messages = [...providedMessages, ...transcriptMessages].filter(
      (message) => message.content.trim().length > 0,
    );

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "At least one message is required." },
        { status: 400 },
      );
    }

    const result = await ingestCanonicalBundle({
      workspaceId: parsed.workspaceId,
      sourceToolId: parsed.sourceToolId,
      importSource: "manual-entry",
      bundle: {
        session: {
          title: parsed.title,
          summary: parsed.summary,
        },
        messages,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed.",
          details: error.issues,
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Manual session creation failed.",
      },
      { status: 500 },
    );
  }
}
