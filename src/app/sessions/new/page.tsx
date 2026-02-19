import Link from "next/link";
import { ManualSessionForm } from "@/components/ingestion/manual-session-form";
import { Button } from "@/components/ui/button";
import { getSessionFilters } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const { sourceTools, workspaces } = await getSessionFilters();

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Session</h1>
          <p className="text-muted-foreground text-sm">
            Create a structured session by pasting a transcript or adding
            messages.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/sessions">Back</Link>
        </Button>
      </header>
      <ManualSessionForm sourceTools={sourceTools} workspaces={workspaces} />
    </div>
  );
}
