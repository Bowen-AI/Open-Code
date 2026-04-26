use open_code_logic::{
    apply_conflict_report, detect_conflicts, load_project, render_paper, save_project, write_paper,
    AgentCoordinator, AgentWorkPlan, GitCommandPlan, LogicProject,
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
            open_in_vscode
        ])
        .run(tauri::generate_context!())
        .expect("error while running Open Code desktop app");
}
