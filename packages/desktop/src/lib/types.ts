export type CardStatus =
  | "draft"
  | "ready"
  | "running"
  | "needs_human_logic_review"
  | "ready_to_merge"
  | "merged"
  | "blocked";

export type LinkKind =
  | "dependency"
  | "relates_to"
  | "conflicts_with"
  | "redundant_with"
  | "blocks";

export type ConflictKind =
  | "code_overlap"
  | "logic_conflict"
  | "redundancy"
  | "dependency_cycle"
  | "missing_dependency";

export type ConflictStatus =
  | "open"
  | "agent_merge_pending"
  | "human_review"
  | "resolved";

export type AgentRunStatus =
  | "started"
  | "notes_only"
  | "ready_for_review"
  | "applied"
  | "rejected"
  | "failed"
  | "cancelled"
  | "abandoned";

export type AgentReviewDisposition = "merged" | "rejected";

export interface LogicProject {
  version: number;
  project: ProjectMeta;
  topics: Topic[];
  cards: LogicCard[];
  links: LogicLink[];
}

export interface ProjectMeta {
  id: string;
  title: string;
  summary: string;
}

export interface Topic {
  id: string;
  title: string;
  summary: string;
  cardIds: string[];
}

export interface LogicCard {
  id: string;
  title: string;
  summary: string;
  details: string;
  status: CardStatus;
  linkedFiles: string[];
  dependencies: string[];
  relatedCards: string[];
  implementationBranch?: string | null;
  worktreePath?: string | null;
  conflicts: ConflictRecord[];
  agentRuns?: AgentRun[];
}

export interface LogicLink {
  from: string;
  to: string;
  kind: LinkKind;
  reason: string;
}

export interface ConflictRecord {
  id: string;
  kind: ConflictKind;
  cardIds: string[];
  file?: string | null;
  reason: string;
  humanRequired: boolean;
  status: ConflictStatus;
}

export interface AgentWorkPlan {
  cardId: string;
  branch: string;
  worktreePath: string;
  linkedFiles: string[];
  summary: string;
  preflightConflicts: ConflictRecord[];
}

export interface GitCommandPlan {
  program: string;
  args: string[];
  cwd: string;
  purpose: string;
}

export interface GitCommandOutcome {
  command: GitCommandPlan;
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface StartAgentResponse {
  project: LogicProject;
  plan: AgentWorkPlan;
  commands: GitCommandPlan[];
  outcomes: GitCommandOutcome[];
}

export interface RecordAgentRunResponse {
  project: LogicProject;
  run: AgentRun;
}

export interface AgentRun {
  id: string;
  at: string;
  model: string;
  mode: string;
  status?: AgentRunStatus;
  promptSummary?: string;
  note: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  branch?: string | null;
  worktreePath?: string | null;
  diagnostics?: AgentDiagnostic[];
  proposedChanges: ProposedFileChange[];
  preflightConflicts: ConflictRecord[];
}

export interface AgentRunInput {
  id?: string | null;
  model: string;
  mode: string;
  status: AgentRunStatus;
  promptSummary?: string;
  note: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  diagnostics?: AgentDiagnostic[];
  proposedChanges?: ProposedFileChange[];
}

export interface AgentFileEdit {
  file: string;
  expectedText: string;
  newText: string;
  summary?: string;
}

export interface AgentLinkedFile {
  file: string;
  text: string;
}

export interface AgentDiagnostic {
  level: string;
  message: string;
}

export interface ProposedFileChange {
  file: string;
  summary: string;
  status: string;
  hunks?: ProposedChangeHunk[];
}

export interface ProposedChangeHunk {
  id: string;
  oldStartLine: number;
  oldLineCount: number;
  newStartLine: number;
  newLineCount: number;
  status: string;
  summary: string;
}
