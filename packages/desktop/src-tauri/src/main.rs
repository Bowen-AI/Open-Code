use open_code_logic::{
    apply_conflict_report, detect_conflicts, load_project, render_paper, save_project, write_paper,
    AgentCoordinator, AgentDiagnostic, AgentFileEdit, AgentLinkedFile, AgentReviewDisposition,
    AgentRun, AgentRunInput, AgentRunStatus, AgentWorkPlan, CardStatus, GitCommandPlan,
    LogicProject,
};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommandOutcome {
    command: GitCommandPlan,
    ok: bool,
    stdout: String,
    stderr: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartAgentResponse {
    project: LogicProject,
    plan: AgentWorkPlan,
    commands: Vec<GitCommandPlan>,
    outcomes: Vec<GitCommandOutcome>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordAgentRunResponse {
    project: LogicProject,
    run: AgentRun,
}

#[tauri::command]
fn load_logic_project(project_root: String) -> Result<LogicProject, String> {
    let mut project = load_project(project_root).map_err(|e| e.to_string())?;
    apply_conflict_report(&mut project);
    Ok(project)
}

#[tauri::command]
fn save_logic_project(project_root: String, mut project: LogicProject) -> Result<(), String> {
    apply_conflict_report(&mut project);
    save_project(&project_root, &project).map_err(|e| e.to_string())?;
    write_paper(project_root, &project).map_err(|e| e.to_string())
}

#[tauri::command]
fn render_logic_paper(project: LogicProject) -> String {
    render_paper(&project)
}

#[tauri::command]
fn detect_logic_conflicts(project: LogicProject) -> Vec<open_code_logic::ConflictRecord> {
    detect_conflicts(&project)
}

#[tauri::command]
fn plan_card_agent(
    project_root: String,
    project: LogicProject,
    card_id: String,
) -> Result<AgentWorkPlan, String> {
    let coordinator = AgentCoordinator::new(project_root);
    coordinator
        .plan_card_work(&project, &card_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn start_card_agent(
    project_root: String,
    mut project: LogicProject,
    card_id: String,
) -> Result<StartAgentResponse, String> {
    let coordinator = AgentCoordinator::new(&project_root);
    let plan = coordinator
        .plan_card_work(&project, &card_id)
        .map_err(|e| e.to_string())?;
    let commands = coordinator.prepare_git_commands(&plan, "HEAD");
    let root = PathBuf::from(&project_root);
    fs::create_dir_all(root.join(open_code_logic::WORKTREE_DIR)).map_err(|e| e.to_string())?;

    let mut outcomes = Vec::new();
    outcomes.push(ensure_branch(&root, &plan.branch, &commands[0])?);
    outcomes.push(ensure_worktree(&root, &plan.worktree_path, &plan.branch, &commands[1])?);

    if outcomes.iter().all(|outcome| outcome.ok) {
        coordinator
            .record_start(&mut project, &plan)
            .map_err(|e| e.to_string())?;
        save_project(&project_root, &project).map_err(|e| e.to_string())?;
        write_paper(&project_root, &project).map_err(|e| e.to_string())?;
    }

    Ok(StartAgentResponse {
        project,
        plan,
        commands,
        outcomes,
    })
}

#[tauri::command]
fn record_card_agent_run(
    project_root: String,
    mut project: LogicProject,
    plan: AgentWorkPlan,
    run: AgentRunInput,
) -> Result<RecordAgentRunResponse, String> {
    let coordinator = AgentCoordinator::new(&project_root);
    let recorded = coordinator
        .record_agent_run(&mut project, &plan, run)
        .map_err(|e| e.to_string())?;
    save_project(&project_root, &project).map_err(|e| e.to_string())?;
    write_paper(&project_root, &project).map_err(|e| e.to_string())?;
    Ok(RecordAgentRunResponse {
        project,
        run: recorded,
    })
}

#[tauri::command]
fn read_card_agent_files(
    project_root: String,
    project: LogicProject,
    plan: AgentWorkPlan,
) -> Result<Vec<AgentLinkedFile>, String> {
    let coordinator = AgentCoordinator::new(&project_root);
    coordinator
        .read_agent_linked_files(&project, &plan)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn apply_card_agent_edits(
    project_root: String,
    mut project: LogicProject,
    plan: AgentWorkPlan,
    run: AgentRunInput,
    edits: Vec<AgentFileEdit>,
) -> Result<RecordAgentRunResponse, String> {
    let coordinator = AgentCoordinator::new(&project_root);
    let recorded = coordinator
        .apply_agent_file_edits(&mut project, &plan, run, edits)
        .map_err(|e| e.to_string())?;
    save_project(&project_root, &project).map_err(|e| e.to_string())?;
    write_paper(&project_root, &project).map_err(|e| e.to_string())?;
    Ok(RecordAgentRunResponse {
        project,
        run: recorded,
    })
}

#[tauri::command]
fn finalize_card_agent_review(
    project_root: String,
    mut project: LogicProject,
    card_id: String,
    disposition: AgentReviewDisposition,
    reviewed_at: String,
) -> Result<RecordAgentRunResponse, String> {
    let coordinator = AgentCoordinator::new(&project_root);
    let git_diagnostics = if disposition == AgentReviewDisposition::Merged {
        merge_agent_git_work(&project_root, &project, &card_id)?
    } else {
        Vec::new()
    };
    let mut recorded = coordinator
        .finalize_agent_review(&mut project, &card_id, disposition, reviewed_at)
        .map_err(|e| e.to_string())?;
    if !git_diagnostics.is_empty() {
        if let Some(run) = project
            .card_mut(&card_id)
            .and_then(|card| card.agent_runs.last_mut())
        {
            run.diagnostics.extend(git_diagnostics);
            recorded = run.clone();
        }
    }
    save_project(&project_root, &project).map_err(|e| e.to_string())?;
    write_paper(&project_root, &project).map_err(|e| e.to_string())?;
    Ok(RecordAgentRunResponse {
        project,
        run: recorded,
    })
}

#[tauri::command]
fn cancel_card_agent(
    project_root: String,
    mut project: LogicProject,
    card_id: String,
    cancelled_at: String,
    reason: String,
) -> Result<RecordAgentRunResponse, String> {
    let coordinator = AgentCoordinator::new(&project_root);
    let recorded = coordinator
        .cancel_agent_run(&mut project, &card_id, cancelled_at, reason)
        .map_err(|e| e.to_string())?;
    save_project(&project_root, &project).map_err(|e| e.to_string())?;
    write_paper(&project_root, &project).map_err(|e| e.to_string())?;
    Ok(RecordAgentRunResponse {
        project,
        run: recorded,
    })
}

#[tauri::command]
fn reset_card_agent_work(
    project_root: String,
    mut project: LogicProject,
    card_id: String,
    reset_at: String,
    reason: String,
) -> Result<RecordAgentRunResponse, String> {
    let coordinator = AgentCoordinator::new(&project_root);
    let mut validation_probe = project.clone();
    coordinator
        .reset_agent_work(
            &mut validation_probe,
            &card_id,
            reset_at.clone(),
            reason.clone(),
        )
        .map_err(|e| e.to_string())?;
    cleanup_agent_git_work(&project_root, &project, &card_id)?;
    let recorded = coordinator
        .reset_agent_work(&mut project, &card_id, reset_at, reason)
        .map_err(|e| e.to_string())?;
    save_project(&project_root, &project).map_err(|e| e.to_string())?;
    write_paper(&project_root, &project).map_err(|e| e.to_string())?;
    Ok(RecordAgentRunResponse {
        project,
        run: recorded,
    })
}

#[tauri::command]
fn open_in_vscode(
    project_root: String,
    file_path: Option<String>,
    worktree_path: Option<String>,
) -> Result<(), String> {
    let root = PathBuf::from(project_root.trim());
    let target_root = worktree_path
        .filter(|path| !path.trim().is_empty())
        .map(|path| {
            let path = PathBuf::from(path);
            if path.is_absolute() {
                path
            } else {
                root.join(path)
            }
        })
        .unwrap_or(root);

    if target_root.as_os_str().is_empty() {
        return Err("Set a project root or start a card worktree first.".to_string());
    }

    let target = match file_path.filter(|path| !path.trim().is_empty()) {
        Some(file) => {
            let path = PathBuf::from(&file);
            if path.is_absolute() {
                path
            } else {
                target_root.join(path)
            }
        }
        None => target_root,
    };

    open_code_target(&target)
}

fn ensure_branch(
    root: &Path,
    branch: &str,
    command: &GitCommandPlan,
) -> Result<GitCommandOutcome, String> {
    let exists = Command::new("git")
        .args(["rev-parse", "--verify", branch])
        .current_dir(root)
        .output()
        .map_err(|e| e.to_string())?
        .status
        .success();
    if exists {
        return Ok(GitCommandOutcome {
            command: command.clone(),
            ok: true,
            stdout: "branch already exists".to_string(),
            stderr: String::new(),
        });
    }
    run_command(command)
}

fn ensure_worktree(
    root: &Path,
    worktree_path: &str,
    branch: &str,
    command: &GitCommandPlan,
) -> Result<GitCommandOutcome, String> {
    if Path::new(worktree_path).exists() {
        return Ok(GitCommandOutcome {
            command: command.clone(),
            ok: true,
            stdout: "worktree already exists".to_string(),
            stderr: String::new(),
        });
    }
    let result = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(root)
        .output()
        .map_err(|e| e.to_string())?;
    let list = String::from_utf8_lossy(&result.stdout);
    if list.contains(&format!("branch refs/heads/{branch}")) {
        return Ok(GitCommandOutcome {
            command: command.clone(),
            ok: true,
            stdout: "branch already has a worktree".to_string(),
            stderr: String::new(),
        });
    }
    run_command(command)
}

fn cleanup_agent_git_work(
    project_root: &str,
    project: &LogicProject,
    card_id: &str,
) -> Result<(), String> {
    let root = PathBuf::from(project_root);
    let card = project
        .card(card_id)
        .ok_or_else(|| format!("logic card not found: {card_id}"))?;
    let latest_run = card.agent_runs.last();
    let worktree_path = card
        .worktree_path
        .as_deref()
        .or_else(|| latest_run.and_then(|run| run.worktree_path.as_deref()));
    let branch = card
        .implementation_branch
        .as_deref()
        .or_else(|| latest_run.and_then(|run| run.branch.as_deref()));

    if let Some(worktree_path) = worktree_path {
        remove_agent_worktree(&root, worktree_path)?;
    }
    if let Some(branch) = branch {
        delete_agent_branch(&root, branch)?;
    }
    Ok(())
}

fn remove_agent_worktree(root: &Path, worktree_path: &str) -> Result<(), String> {
    let worktree = scoped_agent_worktree_path(root, worktree_path)?;
    if !worktree.exists() {
        return Ok(());
    }
    let output = Command::new("git")
        .args(["worktree", "remove", "--force"])
        .arg(&worktree)
        .current_dir(root)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "git worktree remove failed: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    ))
}

fn delete_agent_branch(root: &Path, branch: &str) -> Result<(), String> {
    if !branch.starts_with("open-code/card/") {
        return Err(format!(
            "refusing to delete non Open Code agent branch `{branch}`"
        ));
    }
    let exists = Command::new("git")
        .args(["rev-parse", "--verify", branch])
        .current_dir(root)
        .output()
        .map_err(|e| e.to_string())?
        .status
        .success();
    if !exists {
        return Ok(());
    }
    let output = Command::new("git")
        .args(["branch", "-D", branch])
        .current_dir(root)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "git branch cleanup failed: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    ))
}

fn merge_agent_git_work(
    project_root: &str,
    project: &LogicProject,
    card_id: &str,
) -> Result<Vec<AgentDiagnostic>, String> {
    let root = PathBuf::from(project_root);
    let card = project
        .card(card_id)
        .ok_or_else(|| format!("logic card not found: {card_id}"))?;
    if card.status != CardStatus::ReadyToMerge {
        return Err(format!(
            "logic card {card_id} is not ready to merge: {:?}",
            card.status
        ));
    }
    let latest_run = card
        .agent_runs
        .last()
        .filter(|run| run.status == AgentRunStatus::ReadyForReview)
        .ok_or_else(|| format!("logic card {card_id} has no latest reviewable agent run"))?;
    let branch = card
        .implementation_branch
        .as_deref()
        .or(latest_run.branch.as_deref())
        .ok_or_else(|| format!("logic card {card_id} has no agent branch to merge"))?;
    if !branch.starts_with("open-code/card/") {
        return Err(format!(
            "refusing to merge non Open Code agent branch `{branch}`"
        ));
    }
    let worktree_path = card
        .worktree_path
        .as_deref()
        .or(latest_run.worktree_path.as_deref())
        .ok_or_else(|| format!("logic card {card_id} has no agent worktree to merge"))?;
    let worktree = scoped_agent_worktree_path(&root, worktree_path)?;
    if !worktree.exists() {
        return Err(format!(
            "agent worktree does not exist: `{}`",
            worktree.to_string_lossy()
        ));
    }
    ensure_agent_worktree_branch(&worktree, branch)?;

    let proposed_files = latest_run
        .proposed_changes
        .iter()
        .filter(|change| change.status == "proposed")
        .map(|change| change.file.as_str())
        .collect::<Vec<_>>();
    if proposed_files.is_empty() {
        return Err(format!(
            "logic card {card_id} has no proposed linked-file changes to merge"
        ));
    }

    let mut diagnostics = Vec::new();
    let committed =
        commit_agent_worktree_changes(&worktree, card_id, &card.title, branch, &proposed_files)?;
    diagnostics.push(AgentDiagnostic {
        level: "info".to_string(),
        message: if committed {
            format!("Committed proposed linked-file changes on `{branch}`.")
        } else {
            format!("No staged linked-file changes remained on `{branch}` before merge.")
        },
    });
    merge_agent_branch(&root, branch)?;
    diagnostics.push(AgentDiagnostic {
        level: "info".to_string(),
        message: format!("Merged `{branch}` into the project root."),
    });

    if let Err(error) = remove_agent_worktree(&root, worktree_path) {
        diagnostics.push(AgentDiagnostic {
            level: "warn".to_string(),
            message: format!("Merged branch, but worktree cleanup needs attention: {error}"),
        });
    } else {
        diagnostics.push(AgentDiagnostic {
            level: "info".to_string(),
            message: "Removed the merged agent worktree.".to_string(),
        });
    }

    if let Err(error) = delete_agent_branch(&root, branch) {
        diagnostics.push(AgentDiagnostic {
            level: "warn".to_string(),
            message: format!("Merged branch, but branch cleanup needs attention: {error}"),
        });
    } else {
        diagnostics.push(AgentDiagnostic {
            level: "info".to_string(),
            message: "Deleted the merged agent branch.".to_string(),
        });
    }

    Ok(diagnostics)
}

fn ensure_agent_worktree_branch(worktree: &Path, branch: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(worktree)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "could not inspect agent worktree branch: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let actual = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if actual != branch {
        return Err(format!(
            "agent worktree is on `{actual}`, expected `{branch}`"
        ));
    }
    Ok(())
}

fn commit_agent_worktree_changes(
    worktree: &Path,
    card_id: &str,
    card_title: &str,
    branch: &str,
    files: &[&str],
) -> Result<bool, String> {
    run_git_checked(
        worktree,
        &["--literal-pathspecs", "add", "--"],
        files,
        "git add proposed files",
    )?;
    let diff = Command::new("git")
        .args(["--literal-pathspecs", "diff", "--cached", "--quiet", "--"])
        .args(files)
        .current_dir(worktree)
        .output()
        .map_err(|e| e.to_string())?;
    if diff.status.success() {
        return Ok(false);
    }
    if diff.status.code() != Some(1) {
        return Err(format!(
            "could not inspect staged agent changes: {}{}",
            String::from_utf8_lossy(&diff.stdout),
            String::from_utf8_lossy(&diff.stderr)
        ));
    }

    let subject = format!("Implement {card_title}");
    let body = format!("Open Code card: {card_id}\nAgent branch: {branch}");
    run_git_checked(
        worktree,
        &[
            "-c",
            "user.name=Open Code",
            "-c",
            "user.email=open-code@local.invalid",
            "commit",
            "--no-gpg-sign",
            "-m",
            &subject,
            "-m",
            &body,
        ],
        &[],
        "git commit proposed files",
    )?;
    Ok(true)
}

fn merge_agent_branch(root: &Path, branch: &str) -> Result<(), String> {
    run_git_checked(
        root,
        &[
            "-c",
            "user.name=Open Code",
            "-c",
            "user.email=open-code@local.invalid",
            "merge",
            "--no-ff",
            "--no-edit",
            branch,
        ],
        &[],
        "git merge agent branch",
    )?;
    Ok(())
}

fn run_git_checked(
    cwd: &Path,
    args: &[&str],
    trailing_args: &[&str],
    purpose: &str,
) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .args(trailing_args)
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    Err(format!(
        "{purpose} failed: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    ))
}

fn scoped_agent_worktree_path(root: &Path, worktree_path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(worktree_path);
    let candidate = if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    };
    let scope = root.join(open_code_logic::WORKTREE_DIR);
    let checked_candidate = if candidate.exists() {
        fs::canonicalize(&candidate).map_err(|e| e.to_string())?
    } else {
        candidate.clone()
    };
    let checked_scope = if scope.exists() {
        fs::canonicalize(&scope).map_err(|e| e.to_string())?
    } else {
        scope.clone()
    };
    if !checked_candidate.starts_with(&checked_scope) {
        return Err(format!(
            "refusing to remove worktree outside `{}`: `{}`",
            scope.to_string_lossy(),
            candidate.to_string_lossy()
        ));
    }
    Ok(candidate)
}

fn run_command(command: &GitCommandPlan) -> Result<GitCommandOutcome, String> {
    let output = Command::new(&command.program)
        .args(&command.args)
        .current_dir(&command.cwd)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(GitCommandOutcome {
        command: command.clone(),
        ok: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn open_code_target(target: &Path) -> Result<(), String> {
    let code_status = Command::new("code").arg(target).status();
    if matches!(code_status, Ok(status) if status.success()) {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .args(["-a", "Visual Studio Code"])
            .arg(target)
            .status()
            .map_err(|e| e.to_string())?;
        return if status.success() {
            Ok(())
        } else {
            Err("Visual Studio Code open command failed.".to_string())
        };
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("The `code` command is not available on PATH.".to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_logic_project,
            save_logic_project,
            render_logic_paper,
            detect_logic_conflicts,
            plan_card_agent,
            start_card_agent,
            record_card_agent_run,
            read_card_agent_files,
            apply_card_agent_edits,
            finalize_card_agent_review,
            cancel_card_agent,
            reset_card_agent_work,
            open_in_vscode
        ])
        .run(tauri::generate_context!())
        .expect("error while running Open Code desktop app");
}
