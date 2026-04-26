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

#[derive(Debug)]
pub enum LogicError {
    Io(io::Error),
    Json(serde_json::Error),
    CardNotFound(String),
    CardNotReady { card_id: String, status: CardStatus },
    HumanLogicReviewRequired { card_id: String, conflicts: Vec<ConflictRecord> },
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
            LogicError::HumanLogicReviewRequired { card_id, conflicts } => write!(
                f,
                "logic card {card_id} needs human review before agent work: {} conflict(s)",
                conflicts.len()
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
    pub note: String,
    #[serde(default)]
    pub proposed_changes: Vec<ProposedFileChange>,
    #[serde(default)]
    pub preflight_conflicts: Vec<ConflictRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProposedFileChange {
    pub file: String,
    pub summary: String,
    pub status: String,
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

        let branch = branch_for_card(card);
        let worktree = self
            .project_root
            .join(WORKTREE_DIR)
            .join(format!("{}-{}", card.id, slugify(&card.title)));

        Ok(AgentWorkPlan {
            card_id: card.id.clone(),
            branch,
            worktree_path: worktree.to_string_lossy().to_string(),
            linked_files: normalized_files(&card.linked_files),
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
}

pub fn branch_for_card(card: &LogicCard) -> String {
    format!("open-code/card/{}-{}", card.id, slugify(&card.title))
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
        if card
            .conflicts
            .iter()
            .any(|conflict| conflict.human_required && conflict.status != ConflictStatus::Resolved)
        {
            card.status = CardStatus::NeedsHumanLogicReview;
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
        out.push_str(&format!("- Model: `{}` ({})\n", run.model, run.mode));
        out.push_str(&format!("- Note: {}\n", run.note.replace('\n', " ")));
        for change in &run.proposed_changes {
            out.push_str(&format!(
                "- Proposed `{}`: {}\n",
                change.file, change.summary
            ));
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

fn normalized_files(files: &[String]) -> Vec<String> {
    let mut out = files
        .iter()
        .map(|file| file.trim().replace('\\', "/"))
        .filter(|file| !file.is_empty())
        .collect::<Vec<_>>();
    out.sort();
    out.dedup();
    out
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

    #[test]
    fn branch_names_are_safe_and_predictable() {
        let c = card("card-7", "Voice UI: Start/Stop!", CardStatus::Ready, &[]);
        assert_eq!(
            branch_for_card(&c),
            "open-code/card/card-7-voice-ui-start-stop"
        );
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
}
