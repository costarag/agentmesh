export type CanonicalMessageRole = "user" | "assistant" | "tool";

export interface CanonicalMessage {
  role: CanonicalMessageRole;
  content: string;
  metadata?: Record<string, unknown>;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface CanonicalTask {
  title: string;
  description?: string;
  status?: "open" | "in_progress" | "done" | "cancelled";
  priority?: "low" | "medium" | "high";
}

export interface CanonicalArtifact {
  type: string;
  name: string;
  content: string;
  messageIndex?: number;
  metadata?: Record<string, unknown>;
}

export interface CanonicalSessionBundle {
  session: {
    title: string;
    summary?: string;
    externalSessionId?: string;
    startedAt?: string;
    endedAt?: string;
  };
  messages: CanonicalMessage[];
  tasks?: CanonicalTask[];
  artifacts?: CanonicalArtifact[];
  tags?: string[];
}
