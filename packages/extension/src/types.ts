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
  hunks?: Array<{
    id: string;
    oldStartLine: number;
    oldLineCount: number;
    newStartLine: number;
    newLineCount: number;
    summary: string;
  }>;
  acceptedHunkIds?: string[];
  reason?: string;
}

export interface ActionLogEntry {
  id: string;
  at: string;
  kind: string;
  detail: string;
}
