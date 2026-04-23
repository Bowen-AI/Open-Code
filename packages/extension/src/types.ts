export type MemoryKind =
  | "message"
  | "diff"
  | "tool_out"
  | "user_action"
  | "discriminator"
  | "critic_mindset";

export interface ProposedChange {
  id: string;
  uri: string;
  oldText: string;
  newText: string;
  reason?: string;
}

export interface ActionLogEntry {
  id: string;
  at: string;
  kind: string;
  detail: string;
}
