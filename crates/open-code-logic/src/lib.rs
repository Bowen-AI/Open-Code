//! Logic-first project model and multi-agent coordination primitives.
//!
//! The core crate deliberately avoids Tauri and UI dependencies so the logic
//! board, conflict model, and git/worktree planning stay fast and testable.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const LOGIC_DIR: &str = "logic";
pub const PROJECT_FILE: &str = "open-code.project.json";
pub const PAPER_FILE: &str = "open-code.paper.md";
pub const WORKTREE_DIR: &str = ".open-code/worktrees";
pub const MAX_WORKER_EDIT_BYTES: usize = 1_000_000;
const MAX_HUNK_LCS_CELLS: usize = 750_000;

#[derive(Debug)]
pub enum LogicError {
    Io(io::Error),
    Json(serde_json::Error),
    CardNotFound(String),
    CardNotReady { card_id: String, status: CardStatus },
    CardNotRunning { card_id: String, status: CardStatus },
    CardNotReadyToMerge { card_id: String, status: CardStatus },
    CardNotResettable { card_id: String, status: CardStatus },
    AgentPlanMismatch { card_id: String },
    NoReviewableAgentRun { card_id: String },
    NoResettableAgentRun { card_id: String },
    HumanLogicReviewRequired { card_id: String, conflicts: Vec<ConflictRecord> },
    UnsafeLinkedFile { card_id: String, file: String },
    ProposedChangeOutOfScope { card_id: String, file: String },
    ProposedChangeTooLarge { card_id: String, file: String, bytes: usize },
    StaleLinkedFile { card_id: String, file: String },
    NoAgentFileEdits { card_id: String },
    InvalidWorktreePath { card_id: String, worktree_path: String },
}

impl fmt::Display for LogicError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LogicError::Io(e) => write!(f, "I/O error: {e}"),
            LogicError::Json(e) => write!(f, "JSON error: {e}"),
            LogicError::CardNotFound(id) => write!(f, "logic card not found: {id}"),
            LogicError::CardNotReady { card_id, status } => {
                write!(f, "logic card {card_id} is not ready to run: {status:?}")
            }
            LogicError::CardNotRunning { card_id, status } => {
                write!(f, "logic card {card_id} is not running: {status:?}")
            }
            LogicError::CardNotReadyToMerge { card_id, status } => {
                write!(f, "logic card {card_id} is not ready to merge: {status:?}")
            }
            LogicError::CardNotResettable { card_id, status } => {
                write!(
                    f,
                    "logic card {card_id} cannot be reset for retry from status {status:?}"
                )
            }
            LogicError::AgentPlanMismatch { card_id } => write!(
                f,
                "agent run plan does not match the recorded branch/worktree for {card_id}"
            ),
            LogicError::NoReviewableAgentRun { card_id } => {
                write!(f, "logic card {card_id} has no latest reviewable agent run")
            }
            LogicError::NoResettableAgentRun { card_id } => {
                write!(f, "logic card {card_id} has no terminal agent run to reset")
            }
            LogicError::HumanLogicReviewRequired { card_id, conflicts } => write!(
                f,
                "logic card {card_id} needs human review before agent work: {} conflict(s)",
                conflicts.len()
            ),
            LogicError::UnsafeLinkedFile { card_id, file } => write!(
                f,
                "logic card {card_id} links unsafe file path `{file}`; linked files must be relative project paths"
            ),
            LogicError::ProposedChangeOutOfScope { card_id, file } => write!(
                f,
                "agent run for {card_id} proposed out-of-scope file `{file}`"
            ),
            LogicError::ProposedChangeTooLarge {
                card_id,
                file,
                bytes,
            } => write!(
                f,
                "agent run for {card_id} proposed `{file}` at {bytes} bytes, above the safe edit limit"
            ),
            LogicError::StaleLinkedFile { card_id, file } => write!(
                f,
                "agent run for {card_id} cannot apply `{file}` because the file changed since the worker read it"
            ),
            LogicError::NoAgentFileEdits { card_id } => write!(
                f,
                "agent run for {card_id} did not include any structured file edits"
            ),
            LogicError::InvalidWorktreePath {
                card_id,
                worktree_path,
            } => write!(
                f,
                "agent run for {card_id} has an invalid worktree path `{worktree_path}`"
            ),
        }
    }
}

impl std::error::Error for LogicError {}

impl From<io::Error> for LogicError {
    fn from(value: io::Error) -> Self {
        LogicError::Io(value)
    }
}

impl From<serde_json::Error> for LogicError {
    fn from(value: serde_json::Error) -> Self {
        LogicError::Json(value)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LogicProject {
    pub version: u32,
    pub project: ProjectMeta,
    #[serde(default)]
    pub topics: Vec<Topic>,
    #[serde(default)]
    pub cards: Vec<LogicCard>,
    #[serde(default)]
    pub links: Vec<LogicLink>,
}

impl LogicProject {
    pub fn card(&self, card_id: &str) -> Option<&LogicCard> {
        self.cards.iter().find(|card| card.id == card_id)
    }

    pub fn card_mut(&mut self, card_id: &str) -> Option<&mut LogicCard> {
        self.cards.iter_mut().find(|card| card.id == card_id)
    }

    pub fn topic_for_card(&self, card_id: &str) -> Option<&Topic> {
        self.topics
            .iter()
            .find(|topic| topic.card_ids.iter().any(|id| id == card_id))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMeta {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Topic {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub card_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LogicCard {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub details: String,
    #[serde(default)]
    pub status: CardStatus,
    #[serde(default)]
    pub linked_files: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub related_cards: Vec<String>,
    #[serde(default)]
    pub implementation_branch: Option<String>,
    #[serde(default)]
    pub worktree_path: Option<String>,
    #[serde(default)]
    pub conflicts: Vec<ConflictRecord>,
    #[serde(default)]
    pub agent_runs: Vec<AgentRun>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum CardStatus {
    Draft,
    Ready,
    Running,
    NeedsHumanLogicReview,
    ReadyToMerge,
    Merged,
    Blocked,
}

impl Default for CardStatus {
    fn default() -> Self {
        CardStatus::Draft
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LogicLink {
    pub from: String,
    pub to: String,
    pub kind: LinkKind,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum LinkKind {
    Dependency,
    RelatesTo,
    ConflictsWith,
    RedundantWith,
    Blocks,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRecord {
    pub id: String,
    pub kind: ConflictKind,
    #[serde(default)]
    pub card_ids: Vec<String>,
    #[serde(default)]
    pub file: Option<String>,
    pub reason: String,
    pub human_required: bool,
    #[serde(default)]
    pub status: ConflictStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRun {
    pub id: String,
    pub at: String,
    pub model: String,
    pub mode: String,
    #[serde(default = "default_agent_run_status")]
    pub status: AgentRunStatus,
    #[serde(default)]
    pub prompt_summary: String,
    pub note: String,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub worktree_path: Option<String>,
    #[serde(default)]
    pub diagnostics: Vec<AgentDiagnostic>,
    #[serde(default)]
    pub proposed_changes: Vec<ProposedFileChange>,
    #[serde(default)]
    pub preflight_conflicts: Vec<ConflictRecord>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AgentRunStatus {
    Started,
    NotesOnly,
    ReadyForReview,
    Applied,
    Rejected,
    Failed,
    Cancelled,
    Abandoned,
}

fn default_agent_run_status() -> AgentRunStatus {
    AgentRunStatus::ReadyForReview
}

fn default_notes_only_status() -> AgentRunStatus {
    AgentRunStatus::NotesOnly
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentDiagnostic {
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunInput {
    #[serde(default)]
    pub id: Option<String>,
    pub model: String,
    pub mode: String,
    #[serde(default = "default_notes_only_status")]
    pub status: AgentRunStatus,
    #[serde(default)]
    pub prompt_summary: String,
    pub note: String,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub diagnostics: Vec<AgentDiagnostic>,
    #[serde(default)]
    pub proposed_changes: Vec<ProposedFileChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentFileEdit {
    pub file: String,
    pub expected_text: String,
    pub new_text: String,
    #[serde(default)]
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentLinkedFile {
    pub file: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProposedFileChange {
    pub file: String,
    pub summary: String,
    pub status: String,
    #[serde(default)]
    pub hunks: Vec<ProposedChangeHunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProposedChangeHunk {
    pub id: String,
    pub old_start_line: usize,
    pub old_line_count: usize,
    pub new_start_line: usize,
    pub new_line_count: usize,
    pub status: String,
    pub summary: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AgentReviewDisposition {
    Merged,
    Rejected,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ConflictKind {
    CodeOverlap,
    LogicConflict,
    Redundancy,
    DependencyCycle,
    MissingDependency,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ConflictStatus {
    Open,
    AgentMergePending,
    HumanReview,
    Resolved,
}

impl Default for ConflictStatus {
    fn default() -> Self {
        ConflictStatus::Open
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentWorkPlan {
    pub card_id: String,
    pub branch: String,
    pub worktree_path: String,
    pub linked_files: Vec<String>,
    pub summary: String,
    #[serde(default)]
    pub preflight_conflicts: Vec<ConflictRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandPlan {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub purpose: String,
}

#[derive(Debug, Clone)]
pub struct AgentCoordinator {
    project_root: PathBuf,
}

impl AgentCoordinator {
    pub fn new(project_root: impl Into<PathBuf>) -> Self {
        Self {
            project_root: project_root.into(),
        }
    }

    pub fn plan_card_work(
        &self,
        project: &LogicProject,
        card_id: &str,
    ) -> Result<AgentWorkPlan, LogicError> {
        let card = project
            .card(card_id)
            .ok_or_else(|| LogicError::CardNotFound(card_id.to_string()))?;
        if card.status != CardStatus::Ready {
            return Err(LogicError::CardNotReady {
                card_id: card_id.to_string(),
                status: card.status,
            });
        }

        let preflight_conflicts = detect_conflicts(project)
            .into_iter()
            .filter(|conflict| conflict.card_ids.iter().any(|id| id == card_id))
            .collect::<Vec<_>>();
        let human_conflicts = preflight_conflicts
            .iter()
            .filter(|conflict| conflict.human_required)
            .cloned()
            .collect::<Vec<_>>();
        if !human_conflicts.is_empty() {
            return Err(LogicError::HumanLogicReviewRequired {
                card_id: card_id.to_string(),
                conflicts: human_conflicts,
            });
        }
        let linked_files = safe_normalized_files(card)?;

        let branch = branch_for_card(card);
        let card_id_slug = slugify(&card.id);
        let worktree = self
            .project_root
            .join(WORKTREE_DIR)
            .join(format!("{}-{}", card_id_slug, slugify(&card.title)));

        Ok(AgentWorkPlan {
            card_id: card.id.clone(),
            branch,
            worktree_path: worktree.to_string_lossy().to_string(),
            linked_files,
            summary: card.summary.clone(),
            preflight_conflicts,
        })
    }

    pub fn prepare_git_commands(&self, plan: &AgentWorkPlan, base_ref: &str) -> Vec<GitCommandPlan> {
        let cwd = self.project_root.to_string_lossy().to_string();
        vec![
            GitCommandPlan {
                program: "git".to_string(),
                args: vec!["branch".to_string(), plan.branch.clone(), base_ref.to_string()],
                cwd: cwd.clone(),
                purpose: "create isolated branch for logic card".to_string(),
            },
            GitCommandPlan {
                program: "git".to_string(),
                args: vec![
                    "worktree".to_string(),
                    "add".to_string(),
                    plan.worktree_path.clone(),
                    plan.branch.clone(),
                ],
                cwd,
                purpose: "create isolated worktree for parallel agent execution".to_string(),
            },
        ]
    }

    pub fn record_start(
        &self,
        project: &mut LogicProject,
        plan: &AgentWorkPlan,
    ) -> Result<(), LogicError> {
        let card = project
            .card_mut(&plan.card_id)
            .ok_or_else(|| LogicError::CardNotFound(plan.card_id.clone()))?;
        card.status = CardStatus::Running;
        card.implementation_branch = Some(plan.branch.clone());
        card.worktree_path = Some(plan.worktree_path.clone());
        card.conflicts = plan.preflight_conflicts.clone();
        Ok(())
    }

    pub fn record_agent_run(
        &self,
        project: &mut LogicProject,
        plan: &AgentWorkPlan,
        input: AgentRunInput,
    ) -> Result<AgentRun, LogicError> {
        let card = project
            .card_mut(&plan.card_id)
            .ok_or_else(|| LogicError::CardNotFound(plan.card_id.clone()))?;
        if card.status != CardStatus::Running {
            return Err(LogicError::CardNotRunning {
                card_id: plan.card_id.clone(),
                status: card.status,
            });
        }
        if card.implementation_branch.as_deref() != Some(plan.branch.as_str())
            || card.worktree_path.as_deref() != Some(plan.worktree_path.as_str())
        {
            return Err(LogicError::AgentPlanMismatch {
                card_id: plan.card_id.clone(),
            });
        }

        let linked_files = safe_normalized_files(card)?;
        let proposed_changes = if input.proposed_changes.is_empty() {
            proposed_changes_for_card(card, &plan.preflight_conflicts)
        } else {
            input.proposed_changes
        };
        validate_proposed_changes(&card.id, &linked_files, &proposed_changes)?;

        let at = input
            .finished_at
            .clone()
            .or_else(|| input.started_at.clone())
            .unwrap_or_else(|| "manual".to_string());
        let id = input
            .id
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| format!("run-{}-{}", slugify(&card.id), card.agent_runs.len() + 1));
        let run = AgentRun {
            id,
            at,
            model: input.model,
            mode: input.mode,
            status: input.status,
            prompt_summary: input.prompt_summary,
            note: input.note,
            started_at: input.started_at,
            finished_at: input.finished_at,
            branch: Some(plan.branch.clone()),
            worktree_path: Some(plan.worktree_path.clone()),
            diagnostics: input.diagnostics,
            proposed_changes,
            preflight_conflicts: plan.preflight_conflicts.clone(),
        };

        card.agent_runs.push(run.clone());
        card.conflicts = plan.preflight_conflicts.clone();
        match run.status {
            AgentRunStatus::ReadyForReview => card.status = CardStatus::ReadyToMerge,
            AgentRunStatus::Applied => card.status = CardStatus::Merged,
            AgentRunStatus::Rejected => card.status = CardStatus::Blocked,
            AgentRunStatus::Failed => card.status = CardStatus::Blocked,
            AgentRunStatus::Started
            | AgentRunStatus::NotesOnly
            | AgentRunStatus::Cancelled
            | AgentRunStatus::Abandoned => {}
        }

        Ok(run)
    }

    pub fn read_agent_linked_files(
        &self,
        project: &LogicProject,
        plan: &AgentWorkPlan,
    ) -> Result<Vec<AgentLinkedFile>, LogicError> {
        let card = self.running_card_for_plan(project, plan)?;
        let linked_files = safe_normalized_files(card)?;
        let worktree_root = self.worktree_root(plan)?;
        linked_files
            .into_iter()
            .map(|file| {
                let path = worktree_root.join(&file);
                let text = fs::read_to_string(path)?;
                if text.len() > MAX_WORKER_EDIT_BYTES {
                    return Err(LogicError::ProposedChangeTooLarge {
                        card_id: plan.card_id.clone(),
                        file,
                        bytes: text.len(),
                    });
                }
                Ok(AgentLinkedFile { file, text })
            })
            .collect()
    }

    pub fn apply_agent_file_edits(
        &self,
        project: &mut LogicProject,
        plan: &AgentWorkPlan,
        mut input: AgentRunInput,
        edits: Vec<AgentFileEdit>,
    ) -> Result<AgentRun, LogicError> {
        let card = self.running_card_for_plan(project, plan)?;
        let linked_files = safe_normalized_files(card)?;
        let worktree_root = self.worktree_root(plan)?;
        let pending_edits =
            validate_agent_file_edits(&card.id, &worktree_root, &linked_files, edits)?;

        for edit in &pending_edits {
            fs::write(&edit.path, &edit.new_text)?;
        }

        input.status = AgentRunStatus::ReadyForReview;
        input.proposed_changes = pending_edits
            .into_iter()
            .map(|edit| ProposedFileChange {
                file: edit.file,
                summary: edit.summary,
                status: "proposed".to_string(),
                hunks: edit.hunks,
            })
            .collect();

        self.record_agent_run(project, plan, input)
    }

    pub fn finalize_agent_review(
        &self,
        project: &mut LogicProject,
        card_id: &str,
        disposition: AgentReviewDisposition,
        reviewed_at: impl Into<String>,
    ) -> Result<AgentRun, LogicError> {
        let card = project
            .card_mut(card_id)
            .ok_or_else(|| LogicError::CardNotFound(card_id.to_string()))?;
        if card.status != CardStatus::ReadyToMerge {
            return Err(LogicError::CardNotReadyToMerge {
                card_id: card_id.to_string(),
                status: card.status,
            });
        }

        let run = card
            .agent_runs
            .last_mut()
            .filter(|run| run.status == AgentRunStatus::ReadyForReview)
            .ok_or_else(|| LogicError::NoReviewableAgentRun {
                card_id: card_id.to_string(),
            })?;
        let reviewed_at = reviewed_at.into();

        match disposition {
            AgentReviewDisposition::Merged => {
                run.status = AgentRunStatus::Applied;
                for change in &mut run.proposed_changes {
                    change.status = "applied".to_string();
                    for hunk in &mut change.hunks {
                        hunk.status = "applied".to_string();
                    }
                }
                run.diagnostics.push(AgentDiagnostic {
                    level: "info".to_string(),
                    message: format!("Reviewer marked this run merged at {reviewed_at}."),
                });
                card.status = CardStatus::Merged;
                card.implementation_branch = None;
                card.worktree_path = None;
                card.conflicts.clear();
            }
            AgentReviewDisposition::Rejected => {
                run.status = AgentRunStatus::Rejected;
                for change in &mut run.proposed_changes {
                    change.status = "rejected".to_string();
                    for hunk in &mut change.hunks {
                        hunk.status = "rejected".to_string();
                    }
                }
                run.diagnostics.push(AgentDiagnostic {
                    level: "warn".to_string(),
                    message: format!(
                        "Reviewer rejected this run at {reviewed_at}; worktree left intact for inspection."
                    ),
                });
                card.status = CardStatus::Blocked;
            }
        }

        Ok(run.clone())
    }

    pub fn cancel_agent_run(
        &self,
        project: &mut LogicProject,
        card_id: &str,
        cancelled_at: impl Into<String>,
        reason: impl Into<String>,
    ) -> Result<AgentRun, LogicError> {
        let card = project
            .card_mut(card_id)
            .ok_or_else(|| LogicError::CardNotFound(card_id.to_string()))?;
        if card.status != CardStatus::Running {
            return Err(LogicError::CardNotRunning {
                card_id: card_id.to_string(),
                status: card.status,
            });
        }

        let cancelled_at = cancelled_at.into();
        let note = {
            let reason = reason.into();
            if reason.trim().is_empty() {
                "Reviewer cancelled the running agent before reviewable edits were produced."
                    .to_string()
            } else {
                reason
            }
        };
        let run = AgentRun {
            id: format!("run-{}-{}", slugify(&card.id), card.agent_runs.len() + 1),
            at: cancelled_at.clone(),
            model: "system".to_string(),
            mode: "manual_cancel".to_string(),
            status: AgentRunStatus::Cancelled,
            prompt_summary: String::new(),
            note,
            started_at: None,
            finished_at: Some(cancelled_at.clone()),
            branch: card.implementation_branch.clone(),
            worktree_path: card.worktree_path.clone(),
            diagnostics: vec![AgentDiagnostic {
                level: "warn".to_string(),
                message: format!(
                    "Agent run cancelled at {cancelled_at}; branch and worktree metadata were preserved for inspection."
                ),
            }],
            proposed_changes: Vec::new(),
            preflight_conflicts: card.conflicts.clone(),
        };

        card.agent_runs.push(run.clone());
        card.status = CardStatus::Blocked;
        Ok(run)
    }

    pub fn reset_agent_work(
        &self,
        project: &mut LogicProject,
        card_id: &str,
        reset_at: impl Into<String>,
        reason: impl Into<String>,
    ) -> Result<AgentRun, LogicError> {
        let card = project
            .card_mut(card_id)
            .ok_or_else(|| LogicError::CardNotFound(card_id.to_string()))?;
        if card.status != CardStatus::Blocked {
            return Err(LogicError::CardNotResettable {
                card_id: card_id.to_string(),
                status: card.status,
            });
        }

        let latest_run = card
            .agent_runs
            .last()
            .filter(|run| {
                matches!(
                    run.status,
                    AgentRunStatus::Rejected | AgentRunStatus::Failed | AgentRunStatus::Cancelled
                )
            })
            .ok_or_else(|| LogicError::NoResettableAgentRun {
                card_id: card_id.to_string(),
            })?;
        let previous_branch = card
            .implementation_branch
            .clone()
            .or_else(|| latest_run.branch.clone());
        let previous_worktree = card
            .worktree_path
            .clone()
            .or_else(|| latest_run.worktree_path.clone());
        let reset_at = reset_at.into();
        let note = {
            let reason = reason.into();
            if reason.trim().is_empty() {
                "Reviewer reset this blocked agent work for a clean retry.".to_string()
            } else {
                reason
            }
        };
        let run = AgentRun {
            id: format!("run-{}-{}", slugify(&card.id), card.agent_runs.len() + 1),
            at: reset_at.clone(),
            model: "system".to_string(),
            mode: "manual_reset".to_string(),
            status: AgentRunStatus::Abandoned,
            prompt_summary: String::new(),
            note,
            started_at: None,
            finished_at: Some(reset_at.clone()),
            branch: previous_branch.clone(),
            worktree_path: previous_worktree.clone(),
            diagnostics: vec![AgentDiagnostic {
                level: "info".to_string(),
                message: format!(
                    "Agent work reset at {reset_at}; previous branch/worktree metadata was preserved in this audit run."
                ),
            }],
            proposed_changes: Vec::new(),
            preflight_conflicts: card.conflicts.clone(),
        };

        card.agent_runs.push(run.clone());
        card.status = CardStatus::Ready;
        card.implementation_branch = None;
        card.worktree_path = None;
        card.conflicts.clear();
        Ok(run)
    }

    fn running_card_for_plan<'a>(
        &self,
        project: &'a LogicProject,
        plan: &AgentWorkPlan,
    ) -> Result<&'a LogicCard, LogicError> {
        let card = project
            .card(&plan.card_id)
            .ok_or_else(|| LogicError::CardNotFound(plan.card_id.clone()))?;
        if card.status != CardStatus::Running {
            return Err(LogicError::CardNotRunning {
                card_id: plan.card_id.clone(),
                status: card.status,
            });
        }
        if card.implementation_branch.as_deref() != Some(plan.branch.as_str())
            || card.worktree_path.as_deref() != Some(plan.worktree_path.as_str())
        {
            return Err(LogicError::AgentPlanMismatch {
                card_id: plan.card_id.clone(),
            });
        }
        Ok(card)
    }

    fn worktree_root(&self, plan: &AgentWorkPlan) -> Result<PathBuf, LogicError> {
        let root = PathBuf::from(&plan.worktree_path);
        let worktree_root = if root.is_absolute() {
            root
        } else {
            self.project_root.join(root)
        };
        let canonical_worktree = fs::canonicalize(&worktree_root)?;
        let canonical_scope = fs::canonicalize(self.project_root.join(WORKTREE_DIR))?;
        if !canonical_worktree.starts_with(&canonical_scope) {
            return Err(LogicError::InvalidWorktreePath {
                card_id: plan.card_id.clone(),
                worktree_path: plan.worktree_path.clone(),
            });
        }
        Ok(canonical_worktree)
    }
}

pub fn branch_for_card(card: &LogicCard) -> String {
    format!("open-code/card/{}-{}", slugify(&card.id), slugify(&card.title))
}

pub fn project_file_path(project_root: impl AsRef<Path>) -> PathBuf {
    project_root.as_ref().join(LOGIC_DIR).join(PROJECT_FILE)
}

pub fn paper_file_path(project_root: impl AsRef<Path>) -> PathBuf {
    project_root.as_ref().join(LOGIC_DIR).join(PAPER_FILE)
}

pub fn load_project(project_root: impl AsRef<Path>) -> Result<LogicProject, LogicError> {
    let text = fs::read_to_string(project_file_path(project_root))?;
    Ok(serde_json::from_str(&text)?)
}

pub fn save_project(
    project_root: impl AsRef<Path>,
    project: &LogicProject,
) -> Result<(), LogicError> {
    let path = project_file_path(project_root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(project)?;
    fs::write(path, format!("{json}\n"))?;
    Ok(())
}

pub fn write_paper(project_root: impl AsRef<Path>, project: &LogicProject) -> Result<(), LogicError> {
    let path = paper_file_path(project_root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, render_paper(project))?;
    Ok(())
}

pub fn detect_conflicts(project: &LogicProject) -> Vec<ConflictRecord> {
    let mut conflicts = Vec::new();
    conflicts.extend(detect_file_overlaps(project));
    conflicts.extend(detect_missing_dependencies(project));
    conflicts.extend(detect_dependency_cycles(project));
    conflicts.extend(detect_declared_logic_conflicts(project));
    conflicts.sort_by(|a, b| a.id.cmp(&b.id));
    conflicts
}

pub fn apply_conflict_report(project: &mut LogicProject) {
    let conflicts = detect_conflicts(project);
    for card in &mut project.cards {
        card.conflicts = conflicts
            .iter()
            .filter(|conflict| conflict.card_ids.iter().any(|id| id == &card.id))
            .cloned()
            .collect();
        let has_blocking_human_conflict = card
            .conflicts
            .iter()
            .any(|conflict| conflict.human_required && conflict.status != ConflictStatus::Resolved);

        match (has_blocking_human_conflict, card.status) {
            (true, CardStatus::Draft | CardStatus::Merged | CardStatus::Blocked) => {}
            (true, _) => card.status = CardStatus::NeedsHumanLogicReview,
            (false, CardStatus::NeedsHumanLogicReview) => card.status = CardStatus::Ready,
            (false, _) => {}
        }
    }
}

pub fn render_paper(project: &LogicProject) -> String {
    let mut out = String::new();
    out.push_str(&format!("# {}\n\n", project.project.title));
    if !project.project.summary.trim().is_empty() {
        out.push_str(project.project.summary.trim());
        out.push_str("\n\n");
    }

    let conflicts = detect_conflicts(project);
    let human_conflicts = conflicts
        .iter()
        .filter(|conflict| conflict.human_required)
        .collect::<Vec<_>>();
    let agent_conflicts = conflicts
        .iter()
        .filter(|conflict| !conflict.human_required)
        .collect::<Vec<_>>();

    if !human_conflicts.is_empty() || !agent_conflicts.is_empty() {
        out.push_str("## Conflict Review\n\n");
        if !human_conflicts.is_empty() {
            out.push_str("### Human Logic Decisions\n\n");
            for conflict in human_conflicts {
                out.push_str(&format!(
                    "- **{}**: {} (`{}`)\n",
                    conflict_label(conflict.kind),
                    conflict.reason,
                    conflict.card_ids.join("`, `")
                ));
            }
            out.push('\n');
        }
        if !agent_conflicts.is_empty() {
            out.push_str("### Agent Merge Work\n\n");
            for conflict in agent_conflicts {
                let file = conflict
                    .file
                    .as_ref()
                    .map(|f| format!(" in `{f}`"))
                    .unwrap_or_default();
                out.push_str(&format!(
                    "- **{}{}**: {} (`{}`)\n",
                    conflict_label(conflict.kind),
                    file,
                    conflict.reason,
                    conflict.card_ids.join("`, `")
                ));
            }
            out.push('\n');
        }
    }

    let mut rendered_cards = HashSet::new();
    for topic in &project.topics {
        out.push_str(&format!("## {}\n\n", topic.title));
        if !topic.summary.trim().is_empty() {
            out.push_str(topic.summary.trim());
            out.push_str("\n\n");
        }
        for card_id in &topic.card_ids {
            if let Some(card) = project.card(card_id) {
                render_card(&mut out, card);
                rendered_cards.insert(card.id.clone());
            }
        }
    }

    let ungrouped = project
        .cards
        .iter()
        .filter(|card| !rendered_cards.contains(&card.id))
        .collect::<Vec<_>>();
    if !ungrouped.is_empty() {
        out.push_str("## Ungrouped Logic\n\n");
        for card in ungrouped {
            render_card(&mut out, card);
        }
    }

    out
}

fn render_card(out: &mut String, card: &LogicCard) {
    out.push_str(&format!("### {} `{}`\n\n", card.title, card.id));
    if !card.summary.trim().is_empty() {
        out.push_str(&format!("**Summary:** {}\n\n", card.summary.trim()));
    }
    out.push_str(&format!("**Status:** `{:?}`\n\n", card.status));
    if !card.linked_files.is_empty() {
        out.push_str("**Linked files:** ");
        out.push_str(
            &normalized_files(&card.linked_files)
                .iter()
                .map(|file| format!("`{file}`"))
                .collect::<Vec<_>>()
                .join(", "),
        );
        out.push_str("\n\n");
    }
    if !card.dependencies.is_empty() {
        out.push_str("**Depends on:** ");
        out.push_str(
            &card
                .dependencies
                .iter()
                .map(|dep| format!("`{dep}`"))
                .collect::<Vec<_>>()
                .join(", "),
        );
        out.push_str("\n\n");
    }
    if let Some(branch) = &card.implementation_branch {
        out.push_str(&format!("**Branch:** `{branch}`\n\n"));
    }
    if !card.conflicts.is_empty() {
        out.push_str("**Open conflicts:**\n\n");
        for conflict in &card.conflicts {
            out.push_str(&format!(
                "- {}: {}\n",
                conflict_label(conflict.kind),
                conflict.reason
            ));
        }
        out.push('\n');
    }
    if let Some(run) = card.agent_runs.last() {
        out.push_str("**Latest agent run:**\n\n");
        out.push_str(&format!(
            "- Model: `{}` ({}, {})\n",
            run.model,
            run.mode,
            agent_run_status_label(run.status)
        ));
        if let Some(branch) = &run.branch {
            out.push_str(&format!("- Branch: `{branch}`\n"));
        }
        if let Some(worktree_path) = &run.worktree_path {
            out.push_str(&format!("- Worktree: `{worktree_path}`\n"));
        }
        if !run.prompt_summary.trim().is_empty() {
            out.push_str(&format!("- Prompt: {}\n", run.prompt_summary.replace('\n', " ")));
        }
        out.push_str(&format!("- Note: {}\n", run.note.replace('\n', " ")));
        for diagnostic in &run.diagnostics {
            out.push_str(&format!("- Diagnostic {}: {}\n", diagnostic.level, diagnostic.message));
        }
        for change in &run.proposed_changes {
            out.push_str(&format!(
                "- Proposed `{}` ({}, {} hunk(s)): {}\n",
                change.file,
                change.status,
                change.hunks.len(),
                change.summary
            ));
            for hunk in &change.hunks {
                out.push_str(&format!(
                    "  - Hunk `{}` ({}): {}\n",
                    hunk.id, hunk.status, hunk.summary
                ));
            }
        }
        out.push('\n');
    }
    if !card.details.trim().is_empty() {
        out.push_str(card.details.trim());
        out.push_str("\n\n");
    }
}

fn detect_file_overlaps(project: &LogicProject) -> Vec<ConflictRecord> {
    let mut by_file: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for card in active_cards(project) {
        for file in normalized_files(&card.linked_files) {
            by_file.entry(file).or_default().insert(card.id.clone());
        }
    }

    by_file
        .into_iter()
        .filter(|(_, cards)| cards.len() > 1)
        .map(|(file, cards)| {
            let card_ids = cards.into_iter().collect::<Vec<_>>();
            ConflictRecord {
                id: stable_conflict_id("code-overlap", &card_ids, Some(&file)),
                kind: ConflictKind::CodeOverlap,
                card_ids,
                file: Some(file.clone()),
                reason: format!(
                    "Multiple active cards link to {file}; a merge agent should reconcile code changes."
                ),
                human_required: false,
                status: ConflictStatus::AgentMergePending,
            }
        })
        .collect()
}

fn detect_missing_dependencies(project: &LogicProject) -> Vec<ConflictRecord> {
    let card_ids = project
        .cards
        .iter()
        .map(|card| card.id.as_str())
        .collect::<HashSet<_>>();
    let mut conflicts = Vec::new();
    for card in &project.cards {
        for dependency in &card.dependencies {
            if !card_ids.contains(dependency.as_str()) {
                conflicts.push(ConflictRecord {
                    id: stable_conflict_id("missing-dependency", &[card.id.clone(), dependency.clone()], None),
                    kind: ConflictKind::MissingDependency,
                    card_ids: vec![card.id.clone(), dependency.clone()],
                    file: None,
                    reason: format!("Card {} depends on missing card {}.", card.id, dependency),
                    human_required: true,
                    status: ConflictStatus::HumanReview,
                });
            }
        }
    }
    conflicts
}

fn detect_dependency_cycles(project: &LogicProject) -> Vec<ConflictRecord> {
    let mut adjacency: HashMap<&str, Vec<&str>> = HashMap::new();
    for card in &project.cards {
        adjacency.entry(card.id.as_str()).or_default();
        for dep in &card.dependencies {
            adjacency.entry(card.id.as_str()).or_default().push(dep.as_str());
        }
    }
    for link in project
        .links
        .iter()
        .filter(|link| matches!(link.kind, LinkKind::Dependency | LinkKind::Blocks))
    {
        adjacency
            .entry(link.from.as_str())
            .or_default()
            .push(link.to.as_str());
    }

    let mut found = BTreeSet::<Vec<String>>::new();
    for start in adjacency.keys().copied().collect::<Vec<_>>() {
        let mut stack = Vec::<String>::new();
        dfs_cycles(start, start, &adjacency, &mut stack, &mut found);
    }

    found
        .into_iter()
        .map(|cycle| ConflictRecord {
            id: stable_conflict_id("dependency-cycle", &cycle, None),
            kind: ConflictKind::DependencyCycle,
            card_ids: cycle.clone(),
            file: None,
            reason: format!("Dependency cycle detected: {}.", cycle.join(" -> ")),
            human_required: true,
            status: ConflictStatus::HumanReview,
        })
        .collect()
}

fn detect_declared_logic_conflicts(project: &LogicProject) -> Vec<ConflictRecord> {
    project
        .links
        .iter()
        .filter_map(|link| match link.kind {
            LinkKind::ConflictsWith => Some((ConflictKind::LogicConflict, link)),
            LinkKind::RedundantWith => Some((ConflictKind::Redundancy, link)),
            _ => None,
        })
        .map(|(kind, link)| {
            let mut card_ids = vec![link.from.clone(), link.to.clone()];
            card_ids.sort();
            let default_reason = match kind {
                ConflictKind::LogicConflict => {
                    "Cards declare incompatible logic and need a human design decision."
                }
                ConflictKind::Redundancy => {
                    "Cards may duplicate logic and need a human merge/obsolete decision."
                }
                _ => "Cards need a human decision.",
            };
            ConflictRecord {
                id: stable_conflict_id(conflict_id_prefix(kind), &card_ids, None),
                kind,
                card_ids,
                file: None,
                reason: if link.reason.trim().is_empty() {
                    default_reason.to_string()
                } else {
                    link.reason.clone()
                },
                human_required: true,
                status: ConflictStatus::HumanReview,
            }
        })
        .collect()
}

fn active_cards(project: &LogicProject) -> impl Iterator<Item = &LogicCard> {
    project.cards.iter().filter(|card| {
        !matches!(
            card.status,
            CardStatus::Merged | CardStatus::Blocked | CardStatus::Draft
        )
    })
}

fn dfs_cycles<'a>(
    start: &'a str,
    current: &'a str,
    adjacency: &HashMap<&'a str, Vec<&'a str>>,
    stack: &mut Vec<String>,
    found: &mut BTreeSet<Vec<String>>,
) {
    if stack.iter().any(|id| id == current) {
        return;
    }
    stack.push(current.to_string());
    if let Some(nexts) = adjacency.get(current) {
        for next in nexts {
            if *next == start && stack.len() > 1 {
                found.insert(canonical_cycle(stack));
            } else {
                dfs_cycles(start, *next, adjacency, stack, found);
            }
        }
    }
    stack.pop();
}

fn canonical_cycle(cycle: &[String]) -> Vec<String> {
    let mut best = cycle.to_vec();
    for i in 1..cycle.len() {
        let rotated = cycle[i..]
            .iter()
            .chain(cycle[..i].iter())
            .cloned()
            .collect::<Vec<_>>();
        if rotated < best {
            best = rotated;
        }
    }
    best
}

fn stable_conflict_id(prefix: &str, card_ids: &[String], file: Option<&str>) -> String {
    let mut parts = card_ids.to_vec();
    parts.sort();
    let file_part = file
        .map(|f| format!("-{}", slugify(f)))
        .unwrap_or_default();
    format!("{prefix}-{}{}", parts.join("-"), file_part)
}

fn conflict_id_prefix(kind: ConflictKind) -> &'static str {
    match kind {
        ConflictKind::CodeOverlap => "code-overlap",
        ConflictKind::LogicConflict => "logic-conflict",
        ConflictKind::Redundancy => "redundancy",
        ConflictKind::DependencyCycle => "dependency-cycle",
        ConflictKind::MissingDependency => "missing-dependency",
    }
}

fn conflict_label(kind: ConflictKind) -> &'static str {
    match kind {
        ConflictKind::CodeOverlap => "Code overlap",
        ConflictKind::LogicConflict => "Logic conflict",
        ConflictKind::Redundancy => "Redundancy",
        ConflictKind::DependencyCycle => "Dependency cycle",
        ConflictKind::MissingDependency => "Missing dependency",
    }
}

fn agent_run_status_label(status: AgentRunStatus) -> &'static str {
    match status {
        AgentRunStatus::Started => "started",
        AgentRunStatus::NotesOnly => "notes_only",
        AgentRunStatus::ReadyForReview => "ready_for_review",
        AgentRunStatus::Applied => "applied",
        AgentRunStatus::Rejected => "rejected",
        AgentRunStatus::Failed => "failed",
        AgentRunStatus::Cancelled => "cancelled",
        AgentRunStatus::Abandoned => "abandoned",
    }
}

fn normalized_files(files: &[String]) -> Vec<String> {
    let mut out = files
        .iter()
        .map(|file| normalize_file(file))
        .filter(|file| !file.is_empty())
        .collect::<Vec<_>>();
    out.sort();
    out.dedup();
    out
}

fn normalize_file(file: &str) -> String {
    file.trim().replace('\\', "/")
}

fn safe_normalized_files(card: &LogicCard) -> Result<Vec<String>, LogicError> {
    let files = normalized_files(&card.linked_files);
    for file in &files {
        if !is_safe_project_file(file) {
            return Err(LogicError::UnsafeLinkedFile {
                card_id: card.id.clone(),
                file: file.clone(),
            });
        }
    }
    Ok(files)
}

fn is_safe_project_file(file: &str) -> bool {
    if file.is_empty() || file.starts_with('/') || file.starts_with('~') {
        return false;
    }
    !file
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
}

fn proposed_changes_for_card(
    card: &LogicCard,
    preflight_conflicts: &[ConflictRecord],
) -> Vec<ProposedFileChange> {
    let conflict_files = preflight_conflicts
        .iter()
        .filter_map(|conflict| conflict.file.as_deref())
        .collect::<BTreeSet<_>>();
    let files = normalized_files(&card.linked_files);
    if files.is_empty() {
        return vec![ProposedFileChange {
            file: "(new file TBD)".to_string(),
            summary: "Worker should choose a file after reading the project structure.".to_string(),
            status: "needs_scope".to_string(),
            hunks: Vec::new(),
        }];
    }
    files
        .into_iter()
        .map(|file| {
            let needs_merge_agent = conflict_files.contains(file.as_str());
            ProposedFileChange {
                summary: if needs_merge_agent {
                    "Review with merge agent because another active card links this file.".to_string()
                } else {
                    format!(
                        "Implementation note recorded for {}; code edits still require the structured patch worker.",
                        card.title
                    )
                },
                status: if needs_merge_agent {
                    "needs_merge_agent".to_string()
                } else {
                    "notes_only".to_string()
                },
                file,
                hunks: Vec::new(),
            }
        })
        .collect()
}

fn validate_proposed_changes(
    card_id: &str,
    linked_files: &[String],
    proposed_changes: &[ProposedFileChange],
) -> Result<(), LogicError> {
    let linked = linked_files.iter().collect::<BTreeSet<_>>();
    for change in proposed_changes {
        if change.file == "(new file TBD)" {
            continue;
        }
        if !is_safe_project_file(&change.file) || !linked.contains(&change.file) {
            return Err(LogicError::ProposedChangeOutOfScope {
                card_id: card_id.to_string(),
                file: change.file.clone(),
            });
        }
    }
    Ok(())
}

#[derive(Debug)]
struct PendingAgentFileEdit {
    file: String,
    path: PathBuf,
    summary: String,
    new_text: String,
    hunks: Vec<ProposedChangeHunk>,
}

fn validate_agent_file_edits(
    card_id: &str,
    worktree_root: &Path,
    linked_files: &[String],
    edits: Vec<AgentFileEdit>,
) -> Result<Vec<PendingAgentFileEdit>, LogicError> {
    if edits.is_empty() {
        return Err(LogicError::NoAgentFileEdits {
            card_id: card_id.to_string(),
        });
    }

    let linked = linked_files.iter().collect::<BTreeSet<_>>();
    let mut pending = Vec::new();
    let mut seen = BTreeSet::new();

    for edit in edits {
        let file = normalize_file(&edit.file);
        if !is_safe_project_file(&file) || !linked.contains(&file) || !seen.insert(file.clone()) {
            return Err(LogicError::ProposedChangeOutOfScope {
                card_id: card_id.to_string(),
                file,
            });
        }
        if edit.expected_text == edit.new_text {
            return Err(LogicError::NoAgentFileEdits {
                card_id: card_id.to_string(),
            });
        }
        let bytes = edit.new_text.len();
        if bytes > MAX_WORKER_EDIT_BYTES {
            return Err(LogicError::ProposedChangeTooLarge {
                card_id: card_id.to_string(),
                file,
                bytes,
            });
        }

        let path = worktree_root.join(&file);
        let current_text = fs::read_to_string(&path)?;
        if current_text != edit.expected_text {
            return Err(LogicError::StaleLinkedFile {
                card_id: card_id.to_string(),
                file,
            });
        }

        pending.push(PendingAgentFileEdit {
            hunks: compute_review_hunks(&file, &edit.expected_text, &edit.new_text),
            file,
            path,
            summary: if edit.summary.trim().is_empty() {
                "Structured worker edit applied in the card worktree.".to_string()
            } else {
                edit.summary
            },
            new_text: edit.new_text,
        });
    }

    Ok(pending)
}

fn compute_review_hunks(file: &str, old_text: &str, new_text: &str) -> Vec<ProposedChangeHunk> {
    if old_text == new_text {
        return Vec::new();
    }
    let old_lines = split_review_lines(old_text);
    let new_lines = split_review_lines(new_text);
    if old_lines.len().saturating_mul(new_lines.len()) > MAX_HUNK_LCS_CELLS {
        return vec![review_hunk(file, 1, 0, old_lines.len(), 0, new_lines.len())];
    }

    let dp = build_lcs_table(&old_lines, &new_lines);
    let mut hunks = Vec::new();
    let mut old_chunk: Vec<&str> = Vec::new();
    let mut new_chunk: Vec<&str> = Vec::new();
    let mut old_start = 0;
    let mut new_start = 0;
    let mut old_index = 0;
    let mut new_index = 0;

    while old_index < old_lines.len() || new_index < new_lines.len() {
        if old_index < old_lines.len()
            && new_index < new_lines.len()
            && old_lines[old_index] == new_lines[new_index]
        {
            flush_review_hunk(
                file,
                &mut hunks,
                old_start,
                new_start,
                &mut old_chunk,
                &mut new_chunk,
            );
            old_index += 1;
            new_index += 1;
            continue;
        }

        if old_chunk.is_empty() && new_chunk.is_empty() {
            old_start = old_index;
            new_start = new_index;
        }

        if new_index < new_lines.len()
            && (old_index == old_lines.len()
                || dp[old_index][new_index + 1] >= dp[old_index + 1][new_index])
        {
            new_chunk.push(new_lines[new_index].as_str());
            new_index += 1;
        } else if old_index < old_lines.len() {
            old_chunk.push(old_lines[old_index].as_str());
            old_index += 1;
        }
    }

    flush_review_hunk(
        file,
        &mut hunks,
        old_start,
        new_start,
        &mut old_chunk,
        &mut new_chunk,
    );
    hunks
}

fn split_review_lines(text: &str) -> Vec<String> {
    if text.is_empty() {
        Vec::new()
    } else {
        text.replace("\r\n", "\n")
            .replace('\r', "\n")
            .split('\n')
            .map(|line| line.to_string())
            .collect()
    }
}

fn build_lcs_table(old_lines: &[String], new_lines: &[String]) -> Vec<Vec<usize>> {
    let mut dp = vec![vec![0; new_lines.len() + 1]; old_lines.len() + 1];
    for old_index in (0..old_lines.len()).rev() {
        for new_index in (0..new_lines.len()).rev() {
            dp[old_index][new_index] = if old_lines[old_index] == new_lines[new_index] {
                dp[old_index + 1][new_index + 1] + 1
            } else {
                dp[old_index + 1][new_index].max(dp[old_index][new_index + 1])
            };
        }
    }
    dp
}

fn flush_review_hunk(
    file: &str,
    hunks: &mut Vec<ProposedChangeHunk>,
    old_start: usize,
    new_start: usize,
    old_chunk: &mut Vec<&str>,
    new_chunk: &mut Vec<&str>,
) {
    if old_chunk.is_empty() && new_chunk.is_empty() {
        return;
    }
    hunks.push(review_hunk(
        file,
        hunks.len() + 1,
        old_start,
        old_chunk.len(),
        new_start,
        new_chunk.len(),
    ));
    old_chunk.clear();
    new_chunk.clear();
}

fn review_hunk(
    file: &str,
    index: usize,
    old_start: usize,
    old_line_count: usize,
    new_start: usize,
    new_line_count: usize,
) -> ProposedChangeHunk {
    let old_start_line = old_start + 1;
    let new_start_line = new_start + 1;
    ProposedChangeHunk {
        id: format!("{}-hunk-{index}", slugify(file)),
        old_start_line,
        old_line_count,
        new_start_line,
        new_line_count,
        status: "proposed".to_string(),
        summary: format!(
            "-{old_line_count} +{new_line_count} at old:{old_start_line} new:{new_start_line}"
        ),
    }
}

pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut previous_dash = false;
    for ch in input.chars().flat_map(|ch| ch.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            previous_dash = false;
        } else if !previous_dash && !out.is_empty() {
            out.push('-');
            previous_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        "logic".to_string()
    } else {
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(id: &str, title: &str, status: CardStatus, linked_files: &[&str]) -> LogicCard {
        LogicCard {
            id: id.to_string(),
            title: title.to_string(),
            summary: format!("{title} summary"),
            details: format!("{title} details"),
            status,
            linked_files: linked_files.iter().map(|file| file.to_string()).collect(),
            dependencies: Vec::new(),
            related_cards: Vec::new(),
            implementation_branch: None,
            worktree_path: None,
            conflicts: Vec::new(),
            agent_runs: Vec::new(),
        }
    }

    fn project(cards: Vec<LogicCard>, links: Vec<LogicLink>) -> LogicProject {
        let card_ids = cards.iter().map(|card| card.id.clone()).collect::<Vec<_>>();
        LogicProject {
            version: 1,
            project: ProjectMeta {
                id: "demo".to_string(),
                title: "Demo".to_string(),
                summary: "A demo logic project.".to_string(),
            },
            topics: vec![Topic {
                id: "topic".to_string(),
                title: "Topic".to_string(),
                summary: "Topic summary".to_string(),
                card_ids,
            }],
            cards,
            links,
        }
    }

    fn run_input(status: AgentRunStatus) -> AgentRunInput {
        AgentRunInput {
            id: Some("run-test".to_string()),
            model: "gemma3:4b".to_string(),
            mode: "model_note".to_string(),
            status,
            prompt_summary: "Card summary, linked files, dependencies, and conflicts.".to_string(),
            note: "Implementation intent recorded by the local model.".to_string(),
            started_at: Some("2026-05-08T00:00:00Z".to_string()),
            finished_at: Some("2026-05-08T00:00:01Z".to_string()),
            diagnostics: vec![AgentDiagnostic {
                level: "info".to_string(),
                message: "No structured patch was applied.".to_string(),
            }],
            proposed_changes: Vec::new(),
        }
    }

    fn reviewable_run_input_with_hunk() -> AgentRunInput {
        let mut input = run_input(AgentRunStatus::ReadyForReview);
        input.proposed_changes = vec![ProposedFileChange {
            file: "src/app.ts".to_string(),
            summary: "Review one changed block.".to_string(),
            status: "proposed".to_string(),
            hunks: vec![ProposedChangeHunk {
                id: "src-app-ts-hunk-1".to_string(),
                old_start_line: 1,
                old_line_count: 1,
                new_start_line: 1,
                new_line_count: 1,
                status: "proposed".to_string(),
                summary: "-1 +1 at old:1 new:1".to_string(),
            }],
        }];
        input
    }

    fn unique_test_root(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("open-code-logic-{name}-{}-{nanos}", std::process::id()))
    }

    #[test]
    fn branch_names_are_safe_and_predictable() {
        let c = card("card-7", "Voice UI: Start/Stop!", CardStatus::Ready, &[]);
        assert_eq!(
            branch_for_card(&c),
            "open-code/card/card-7-voice-ui-start-stop"
        );
    }

    #[test]
    fn branch_and_worktree_paths_slug_card_ids() {
        let p = project(
            vec![card(
                "../Card:Unsafe ID",
                "Voice UI",
                CardStatus::Ready,
                &["src/App.svelte"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "../Card:Unsafe ID").unwrap();

        assert_eq!(plan.branch, "open-code/card/card-unsafe-id-voice-ui");
        assert!(plan
            .worktree_path
            .ends_with(".open-code/worktrees/card-unsafe-id-voice-ui"));
    }

    #[test]
    fn coordinator_rejects_unsafe_linked_file_paths() {
        let p = project(
            vec![card(
                "card-unsafe",
                "Unsafe Linked File",
                CardStatus::Ready,
                &["../secrets.env"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");

        let err = coordinator.plan_card_work(&p, "card-unsafe").unwrap_err();
        assert!(matches!(err, LogicError::UnsafeLinkedFile { .. }));
    }

    #[test]
    fn file_overlap_is_agent_merge_work_not_human_logic_review() {
        let p = project(
            vec![
                card("logic-a", "Logic A", CardStatus::Ready, &["src/app.ts"]),
                card("logic-b", "Logic B", CardStatus::Running, &["src/app.ts"]),
            ],
            vec![],
        );

        let conflicts = detect_conflicts(&p);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].kind, ConflictKind::CodeOverlap);
        assert!(!conflicts[0].human_required);
        assert_eq!(conflicts[0].status, ConflictStatus::AgentMergePending);
    }

    #[test]
    fn declared_logic_conflict_requires_human_review() {
        let p = project(
            vec![
                card("logic-a", "Logic A", CardStatus::Ready, &[]),
                card("logic-b", "Logic B", CardStatus::Ready, &[]),
            ],
            vec![LogicLink {
                from: "logic-a".to_string(),
                to: "logic-b".to_string(),
                kind: LinkKind::ConflictsWith,
                reason: "One card requires local-only, the other requires cloud sync.".to_string(),
            }],
        );

        let conflicts = detect_conflicts(&p);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].kind, ConflictKind::LogicConflict);
        assert!(conflicts[0].human_required);
    }

    #[test]
    fn dependency_cycle_requires_human_review() {
        let mut a = card("a", "A", CardStatus::Ready, &[]);
        a.dependencies = vec!["b".to_string()];
        let mut b = card("b", "B", CardStatus::Ready, &[]);
        b.dependencies = vec!["a".to_string()];

        let conflicts = detect_conflicts(&project(vec![a, b], vec![]));
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].kind, ConflictKind::DependencyCycle);
        assert!(conflicts[0].human_required);
    }

    #[test]
    fn coordinator_plans_branch_and_worktree_for_ready_card() {
        let p = project(
            vec![card(
                "card-voice",
                "Voice Conversation UI",
                CardStatus::Ready,
                &["src/App.svelte"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "card-voice").unwrap();

        assert_eq!(
            plan.branch,
            "open-code/card/card-voice-voice-conversation-ui"
        );
        assert!(plan
            .worktree_path
            .ends_with(".open-code/worktrees/card-voice-voice-conversation-ui"));
        assert_eq!(plan.linked_files, vec!["src/App.svelte"]);
    }

    #[test]
    fn coordinator_blocks_human_logic_conflicts_before_agent_work() {
        let p = project(
            vec![
                card("logic-a", "Logic A", CardStatus::Ready, &[]),
                card("logic-b", "Logic B", CardStatus::Ready, &[]),
            ],
            vec![LogicLink {
                from: "logic-a".to_string(),
                to: "logic-b".to_string(),
                kind: LinkKind::RedundantWith,
                reason: "Both define the same command surface.".to_string(),
            }],
        );
        let coordinator = AgentCoordinator::new("/repo");

        let err = coordinator.plan_card_work(&p, "logic-a").unwrap_err();
        assert!(matches!(err, LogicError::HumanLogicReviewRequired { .. }));
    }

    #[test]
    fn record_start_marks_card_running_with_branch_and_conflicts() {
        let mut p = project(
            vec![
                card("logic-a", "Logic A", CardStatus::Ready, &["src/app.ts"]),
                card("logic-b", "Logic B", CardStatus::Running, &["src/app.ts"]),
            ],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();

        coordinator.record_start(&mut p, &plan).unwrap();
        let updated = p.card("logic-a").unwrap();
        assert_eq!(updated.status, CardStatus::Running);
        assert_eq!(updated.implementation_branch.as_deref(), Some(plan.branch.as_str()));
        assert_eq!(updated.conflicts.len(), 1);
        assert_eq!(updated.conflicts[0].kind, ConflictKind::CodeOverlap);
    }

    #[test]
    fn record_agent_run_persists_auditable_notes_without_marking_ready_to_merge() {
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();

        let run = coordinator
            .record_agent_run(&mut p, &plan, run_input(AgentRunStatus::NotesOnly))
            .unwrap();
        let updated = p.card("logic-a").unwrap();

        assert_eq!(updated.status, CardStatus::Running);
        assert_eq!(run.status, AgentRunStatus::NotesOnly);
        assert_eq!(run.branch.as_deref(), Some(plan.branch.as_str()));
        assert_eq!(run.worktree_path.as_deref(), Some(plan.worktree_path.as_str()));
        assert_eq!(run.proposed_changes.len(), 1);
        assert_eq!(run.proposed_changes[0].file, "src/app.ts");
        assert_eq!(run.proposed_changes[0].status, "notes_only");
        assert_eq!(updated.agent_runs.len(), 1);
    }

    #[test]
    fn ready_for_review_agent_run_moves_card_to_ready_to_merge() {
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();

        coordinator
            .record_agent_run(&mut p, &plan, run_input(AgentRunStatus::ReadyForReview))
            .unwrap();

        assert_eq!(p.card("logic-a").unwrap().status, CardStatus::ReadyToMerge);
    }

    #[test]
    fn merged_review_closeout_marks_card_and_changes_applied() {
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();
        coordinator
            .record_agent_run(&mut p, &plan, reviewable_run_input_with_hunk())
            .unwrap();

        let run = coordinator
            .finalize_agent_review(
                &mut p,
                "logic-a",
                AgentReviewDisposition::Merged,
                "2026-05-08T01:00:00Z",
            )
            .unwrap();
        let updated = p.card("logic-a").unwrap();

        assert_eq!(updated.status, CardStatus::Merged);
        assert_eq!(updated.implementation_branch, None);
        assert_eq!(updated.worktree_path, None);
        assert_eq!(run.status, AgentRunStatus::Applied);
        assert_eq!(run.branch.as_deref(), Some(plan.branch.as_str()));
        assert_eq!(run.worktree_path.as_deref(), Some(plan.worktree_path.as_str()));
        assert_eq!(run.proposed_changes[0].status, "applied");
        assert_eq!(run.proposed_changes[0].hunks[0].status, "applied");
        assert!(run
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("marked this run merged")));
    }

    #[test]
    fn rejected_review_closeout_blocks_card_without_losing_worktree_metadata() {
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();
        coordinator
            .record_agent_run(&mut p, &plan, reviewable_run_input_with_hunk())
            .unwrap();

        let run = coordinator
            .finalize_agent_review(
                &mut p,
                "logic-a",
                AgentReviewDisposition::Rejected,
                "2026-05-08T01:00:00Z",
            )
            .unwrap();
        let updated = p.card("logic-a").unwrap();

        assert_eq!(updated.status, CardStatus::Blocked);
        assert_eq!(updated.implementation_branch.as_deref(), Some(plan.branch.as_str()));
        assert_eq!(updated.worktree_path.as_deref(), Some(plan.worktree_path.as_str()));
        assert_eq!(run.status, AgentRunStatus::Rejected);
        assert_eq!(run.proposed_changes[0].status, "rejected");
        assert_eq!(run.proposed_changes[0].hunks[0].status, "rejected");
        assert!(run
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("left intact")));
    }

    #[test]
    fn review_closeout_requires_latest_reviewable_run() {
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();
        coordinator
            .record_agent_run(&mut p, &plan, run_input(AgentRunStatus::NotesOnly))
            .unwrap();
        p.card_mut("logic-a").unwrap().status = CardStatus::ReadyToMerge;

        let err = coordinator
            .finalize_agent_review(
                &mut p,
                "logic-a",
                AgentReviewDisposition::Merged,
                "2026-05-08T01:00:00Z",
            )
            .unwrap_err();

        assert!(matches!(err, LogicError::NoReviewableAgentRun { .. }));
    }

    #[test]
    fn cancel_agent_run_blocks_card_and_preserves_worktree_metadata() {
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();

        let run = coordinator
            .cancel_agent_run(
                &mut p,
                "logic-a",
                "2026-05-08T02:00:00Z",
                "User stopped the worker before review.",
            )
            .unwrap();
        let updated = p.card("logic-a").unwrap();

        assert_eq!(updated.status, CardStatus::Blocked);
        assert_eq!(updated.implementation_branch.as_deref(), Some(plan.branch.as_str()));
        assert_eq!(updated.worktree_path.as_deref(), Some(plan.worktree_path.as_str()));
        assert_eq!(run.status, AgentRunStatus::Cancelled);
        assert_eq!(run.mode, "manual_cancel");
        assert_eq!(run.branch.as_deref(), Some(plan.branch.as_str()));
        assert_eq!(run.worktree_path.as_deref(), Some(plan.worktree_path.as_str()));
        assert!(run.proposed_changes.is_empty());
        assert!(run
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("preserved for inspection")));
    }

    #[test]
    fn cancel_agent_run_requires_running_card() {
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");

        let err = coordinator
            .cancel_agent_run(
                &mut p,
                "logic-a",
                "2026-05-08T02:00:00Z",
                "User stopped the worker before review.",
            )
            .unwrap_err();

        assert!(matches!(err, LogicError::CardNotRunning { .. }));
        assert!(p.card("logic-a").unwrap().agent_runs.is_empty());
    }

    #[test]
    fn reset_agent_work_returns_blocked_terminal_run_to_ready_for_retry() {
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();
        coordinator
            .cancel_agent_run(
                &mut p,
                "logic-a",
                "2026-05-08T02:00:00Z",
                "User stopped the worker before review.",
            )
            .unwrap();

        let run = coordinator
            .reset_agent_work(
                &mut p,
                "logic-a",
                "2026-05-08T02:05:00Z",
                "Clean retry requested after cancellation.",
            )
            .unwrap();
        let updated = p.card("logic-a").unwrap();

        assert_eq!(updated.status, CardStatus::Ready);
        assert_eq!(updated.implementation_branch, None);
        assert_eq!(updated.worktree_path, None);
        assert!(updated.conflicts.is_empty());
        assert_eq!(run.status, AgentRunStatus::Abandoned);
        assert_eq!(run.mode, "manual_reset");
        assert_eq!(run.branch.as_deref(), Some(plan.branch.as_str()));
        assert_eq!(run.worktree_path.as_deref(), Some(plan.worktree_path.as_str()));
        assert_eq!(updated.agent_runs.len(), 2);
    }

    #[test]
    fn reset_agent_work_accepts_rejected_and_failed_terminal_runs() {
        let coordinator = AgentCoordinator::new("/repo");

        let mut rejected = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let rejected_plan = coordinator.plan_card_work(&rejected, "logic-a").unwrap();
        coordinator.record_start(&mut rejected, &rejected_plan).unwrap();
        coordinator
            .record_agent_run(
                &mut rejected,
                &rejected_plan,
                run_input(AgentRunStatus::ReadyForReview),
            )
            .unwrap();
        coordinator
            .finalize_agent_review(
                &mut rejected,
                "logic-a",
                AgentReviewDisposition::Rejected,
                "2026-05-08T02:00:00Z",
            )
            .unwrap();

        let rejected_reset = coordinator
            .reset_agent_work(
                &mut rejected,
                "logic-a",
                "2026-05-08T02:05:00Z",
                "Retry requested after rejecting the run.",
            )
            .unwrap();

        let rejected_card = rejected.card("logic-a").unwrap();
        assert_eq!(rejected_card.status, CardStatus::Ready);
        assert_eq!(rejected_card.implementation_branch, None);
        assert_eq!(rejected_card.worktree_path, None);
        assert_eq!(rejected_reset.status, AgentRunStatus::Abandoned);
        assert_eq!(
            rejected_reset.branch.as_deref(),
            Some(rejected_plan.branch.as_str())
        );
        assert_eq!(
            rejected_reset.worktree_path.as_deref(),
            Some(rejected_plan.worktree_path.as_str())
        );

        let mut failed = project(
            vec![card(
                "logic-b",
                "Logic B",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let failed_plan = coordinator.plan_card_work(&failed, "logic-b").unwrap();
        coordinator.record_start(&mut failed, &failed_plan).unwrap();
        coordinator
            .record_agent_run(&mut failed, &failed_plan, run_input(AgentRunStatus::Failed))
            .unwrap();

        let failed_reset = coordinator
            .reset_agent_work(
                &mut failed,
                "logic-b",
                "2026-05-08T02:10:00Z",
                "Retry requested after a failed run.",
            )
            .unwrap();

        let failed_card = failed.card("logic-b").unwrap();
        assert_eq!(failed_card.status, CardStatus::Ready);
        assert_eq!(failed_card.implementation_branch, None);
        assert_eq!(failed_card.worktree_path, None);
        assert_eq!(failed_reset.status, AgentRunStatus::Abandoned);
        assert_eq!(
            failed_reset.branch.as_deref(),
            Some(failed_plan.branch.as_str())
        );
        assert_eq!(
            failed_reset.worktree_path.as_deref(),
            Some(failed_plan.worktree_path.as_str())
        );
    }

    #[test]
    fn reset_agent_work_requires_blocked_card_with_terminal_agent_run() {
        let mut ready = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let status_err = coordinator
            .reset_agent_work(
                &mut ready,
                "logic-a",
                "2026-05-08T02:05:00Z",
                "Retry requested.",
            )
            .unwrap_err();
        assert!(matches!(status_err, LogicError::CardNotResettable { .. }));

        let mut blocked = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Blocked,
                &["src/app.ts"],
            )],
            vec![],
        );
        let run_err = coordinator
            .reset_agent_work(
                &mut blocked,
                "logic-a",
                "2026-05-08T02:05:00Z",
                "Retry requested.",
            )
            .unwrap_err();
        assert!(matches!(run_err, LogicError::NoResettableAgentRun { .. }));
    }

    #[test]
    fn apply_agent_file_edits_writes_linked_file_and_records_reviewable_run() {
        let root = unique_test_root("apply-edit");
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new(&root);
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        let target = PathBuf::from(&plan.worktree_path).join("src/app.ts");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, "old implementation\n").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();

        let run = coordinator
            .apply_agent_file_edits(
                &mut p,
                &plan,
                run_input(AgentRunStatus::NotesOnly),
                vec![AgentFileEdit {
                    file: "src/app.ts".to_string(),
                    expected_text: "old implementation\n".to_string(),
                    new_text: "new implementation\n".to_string(),
                    summary: "Replace the placeholder implementation.".to_string(),
                }],
            )
            .unwrap();

        assert_eq!(
            std::fs::read_to_string(&target).unwrap(),
            "new implementation\n"
        );
        assert_eq!(p.card("logic-a").unwrap().status, CardStatus::ReadyToMerge);
        assert_eq!(run.status, AgentRunStatus::ReadyForReview);
        assert_eq!(run.proposed_changes[0].file, "src/app.ts");
        assert_eq!(run.proposed_changes[0].status, "proposed");
        assert_eq!(run.proposed_changes[0].hunks.len(), 1);
        assert_eq!(run.proposed_changes[0].hunks[0].id, "src-app-ts-hunk-1");
        assert_eq!(run.proposed_changes[0].hunks[0].old_start_line, 1);
        assert_eq!(run.proposed_changes[0].hunks[0].old_line_count, 1);
        assert_eq!(run.proposed_changes[0].hunks[0].new_start_line, 1);
        assert_eq!(run.proposed_changes[0].hunks[0].new_line_count, 1);
        assert_eq!(run.proposed_changes[0].hunks[0].status, "proposed");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn apply_agent_file_edits_records_multiple_review_hunks() {
        let root = unique_test_root("multi-hunk-edit");
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new(&root);
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        let target = PathBuf::from(&plan.worktree_path).join("src/app.ts");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, "a\nb\nc\n").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();

        let run = coordinator
            .apply_agent_file_edits(
                &mut p,
                &plan,
                run_input(AgentRunStatus::NotesOnly),
                vec![AgentFileEdit {
                    file: "src/app.ts".to_string(),
                    expected_text: "a\nb\nc\n".to_string(),
                    new_text: "A\nb\nc\nd\n".to_string(),
                    summary: "Change the heading and append a line.".to_string(),
                }],
            )
            .unwrap();

        let hunks = &run.proposed_changes[0].hunks;
        assert_eq!(hunks.len(), 2);
        assert_eq!(hunks[0].summary, "-1 +1 at old:1 new:1");
        assert_eq!(hunks[1].summary, "-0 +1 at old:4 new:4");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn read_agent_linked_files_returns_exact_worktree_text() {
        let root = unique_test_root("read-linked-files");
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new(&root);
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        let target = PathBuf::from(&plan.worktree_path).join("src/app.ts");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, "current implementation\n").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();

        let files = coordinator.read_agent_linked_files(&p, &plan).unwrap();

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file, "src/app.ts");
        assert_eq!(files[0].text, "current implementation\n");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn apply_agent_file_edits_rejects_stale_files_without_writing() {
        let root = unique_test_root("stale-edit");
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new(&root);
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        let target = PathBuf::from(&plan.worktree_path).join("src/app.ts");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, "changed by user\n").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();

        let err = coordinator
            .apply_agent_file_edits(
                &mut p,
                &plan,
                run_input(AgentRunStatus::NotesOnly),
                vec![AgentFileEdit {
                    file: "src/app.ts".to_string(),
                    expected_text: "old implementation\n".to_string(),
                    new_text: "new implementation\n".to_string(),
                    summary: "Replace the placeholder implementation.".to_string(),
                }],
            )
            .unwrap_err();

        assert!(matches!(err, LogicError::StaleLinkedFile { .. }));
        assert_eq!(
            std::fs::read_to_string(&target).unwrap(),
            "changed by user\n"
        );
        assert_eq!(p.card("logic-a").unwrap().status, CardStatus::Running);
        assert!(p.card("logic-a").unwrap().agent_runs.is_empty());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn apply_agent_file_edits_rejects_noop_edits_without_marking_reviewable() {
        let root = unique_test_root("noop-edit");
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new(&root);
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        let target = PathBuf::from(&plan.worktree_path).join("src/app.ts");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, "unchanged implementation\n").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();

        let err = coordinator
            .apply_agent_file_edits(
                &mut p,
                &plan,
                run_input(AgentRunStatus::NotesOnly),
                vec![AgentFileEdit {
                    file: "src/app.ts".to_string(),
                    expected_text: "unchanged implementation\n".to_string(),
                    new_text: "unchanged implementation\n".to_string(),
                    summary: "No real edit.".to_string(),
                }],
            )
            .unwrap_err();

        assert!(matches!(err, LogicError::NoAgentFileEdits { .. }));
        assert_eq!(p.card("logic-a").unwrap().status, CardStatus::Running);
        assert!(p.card("logic-a").unwrap().agent_runs.is_empty());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn apply_agent_file_edits_rejects_unlinked_files() {
        let root = unique_test_root("scope-edit");
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new(&root);
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        let target = PathBuf::from(&plan.worktree_path).join("src/app.ts");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, "old implementation\n").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();

        let err = coordinator
            .apply_agent_file_edits(
                &mut p,
                &plan,
                run_input(AgentRunStatus::NotesOnly),
                vec![AgentFileEdit {
                    file: "src/other.ts".to_string(),
                    expected_text: "old implementation\n".to_string(),
                    new_text: "new implementation\n".to_string(),
                    summary: "Attempt an unlinked edit.".to_string(),
                }],
            )
            .unwrap_err();

        assert!(matches!(err, LogicError::ProposedChangeOutOfScope { .. }));
        assert_eq!(
            std::fs::read_to_string(&target).unwrap(),
            "old implementation\n"
        );
        assert!(p.card("logic-a").unwrap().agent_runs.is_empty());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn apply_agent_file_edits_rejects_worktrees_outside_project_scope() {
        let root = unique_test_root("worktree-scope");
        let outside = unique_test_root("outside-worktree");
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new(&root);
        let mut plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        std::fs::create_dir_all(root.join(WORKTREE_DIR)).unwrap();
        let outside_target = outside.join("src/app.ts");
        std::fs::create_dir_all(outside_target.parent().unwrap()).unwrap();
        std::fs::write(&outside_target, "outside worktree\n").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();
        plan.worktree_path = outside.to_string_lossy().to_string();
        p.card_mut("logic-a").unwrap().worktree_path = Some(plan.worktree_path.clone());

        let err = coordinator
            .apply_agent_file_edits(
                &mut p,
                &plan,
                run_input(AgentRunStatus::NotesOnly),
                vec![AgentFileEdit {
                    file: "src/app.ts".to_string(),
                    expected_text: "outside worktree\n".to_string(),
                    new_text: "should not write\n".to_string(),
                    summary: "Attempt a write outside the project worktree scope.".to_string(),
                }],
            )
            .unwrap_err();

        assert!(matches!(err, LogicError::InvalidWorktreePath { .. }));
        assert_eq!(
            std::fs::read_to_string(&outside_target).unwrap(),
            "outside worktree\n"
        );
        assert!(p.card("logic-a").unwrap().agent_runs.is_empty());

        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(outside);
    }

    #[test]
    fn record_agent_run_rejects_mismatched_plan_metadata() {
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let mut plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();
        plan.branch = "open-code/card/other".to_string();

        let err = coordinator
            .record_agent_run(&mut p, &plan, run_input(AgentRunStatus::NotesOnly))
            .unwrap_err();

        assert!(matches!(err, LogicError::AgentPlanMismatch { .. }));
    }

    #[test]
    fn record_agent_run_rejects_out_of_scope_proposed_changes() {
        let mut p = project(
            vec![card(
                "logic-a",
                "Logic A",
                CardStatus::Ready,
                &["src/app.ts"],
            )],
            vec![],
        );
        let coordinator = AgentCoordinator::new("/repo");
        let plan = coordinator.plan_card_work(&p, "logic-a").unwrap();
        coordinator.record_start(&mut p, &plan).unwrap();
        let mut input = run_input(AgentRunStatus::ReadyForReview);
        input.proposed_changes = vec![ProposedFileChange {
            file: "src/other.ts".to_string(),
            summary: "Out-of-scope edit.".to_string(),
            status: "proposed".to_string(),
            hunks: Vec::new(),
        }];

        let err = coordinator.record_agent_run(&mut p, &plan, input).unwrap_err();
        assert!(matches!(err, LogicError::ProposedChangeOutOfScope { .. }));
    }

    #[test]
    fn paper_contains_conflict_review_and_branch_metadata() {
        let mut p = project(
            vec![
                card("logic-a", "Logic A", CardStatus::Ready, &["src/app.ts"]),
                card("logic-b", "Logic B", CardStatus::Running, &["src/app.ts"]),
            ],
            vec![],
        );
        p.cards[0].implementation_branch = Some("open-code/card/logic-a-logic-a".to_string());
        let md = render_paper(&p);

        assert!(md.contains("## Conflict Review"));
        assert!(md.contains("Agent Merge Work"));
        assert!(md.contains("`src/app.ts`"));
        assert!(md.contains("open-code/card/logic-a-logic-a"));
    }

    #[test]
    fn conflict_report_restores_ready_after_human_blocker_is_removed() {
        let mut p = project(
            vec![
                card("logic-a", "Logic A", CardStatus::Ready, &[]),
                card("logic-b", "Logic B", CardStatus::Ready, &[]),
            ],
            vec![LogicLink {
                from: "logic-a".to_string(),
                to: "logic-b".to_string(),
                kind: LinkKind::ConflictsWith,
                reason: "Temporary product decision conflict.".to_string(),
            }],
        );

        apply_conflict_report(&mut p);
        assert_eq!(
            p.card("logic-a").unwrap().status,
            CardStatus::NeedsHumanLogicReview
        );

        p.links.clear();
        apply_conflict_report(&mut p);
        assert_eq!(p.card("logic-a").unwrap().status, CardStatus::Ready);
        assert!(p.card("logic-a").unwrap().conflicts.is_empty());
    }

    #[test]
    fn conflict_report_preserves_draft_blocked_and_merged_statuses() {
        let mut draft = card("logic-a", "Logic A", CardStatus::Draft, &[]);
        draft.dependencies = vec!["missing-card".to_string()];
        let mut blocked = card("logic-b", "Logic B", CardStatus::Blocked, &[]);
        blocked.dependencies = vec!["missing-card".to_string()];
        let mut merged = card("logic-c", "Logic C", CardStatus::Merged, &[]);
        merged.dependencies = vec!["missing-card".to_string()];
        let mut p = project(vec![draft, blocked, merged], vec![]);

        apply_conflict_report(&mut p);

        assert_eq!(p.card("logic-a").unwrap().status, CardStatus::Draft);
        assert_eq!(p.card("logic-b").unwrap().status, CardStatus::Blocked);
        assert_eq!(p.card("logic-c").unwrap().status, CardStatus::Merged);
        assert_eq!(p.card("logic-a").unwrap().conflicts.len(), 1);
    }
}
