# MVP delivery track

This is the priority order for turning the visible logic preview into a real Mac/Linux local agent app.

## P0: Local brain contract

- Default model: `gemma3:4b`.
- MVP backend: Ollama at `http://127.0.0.1:11434`.
- UI must always show one of: not checked, offline, online but model missing, online and ready.
- Agent runs may simulate only when the brain is offline, and the UI must say so.

Done when:

- The app can detect Ollama.
- The app can detect installed Gemma models.
- Auto mode chooses the strongest installed Gemma candidate.
- A card-agent run can call the local model and record the model note.

## P1: Persistent logic workspace

- Browser preview persists to localStorage so users can test-drive without a toolchain.
- Tauri app persists to `logic/open-code.project.json` and regenerates `logic/open-code.paper.md`.
- The logic file remains GitHub-readable and reviewable.
- Documentation can be viewed as paper, spec, roadmap, handoff, or website without changing card logic.

Done when:

- Card edits survive refresh.
- Card status and agent activity survive refresh.
- The documentation selector renders each mode from the same project state.
- Save/load in Tauri is verified with tests.

## P1: Human logic conflict workflow

- Agents handle code overlap.
- Humans handle logic conflicts, missing dependencies, redundancy, and dependency cycles.
- UI must provide explicit resolution actions, not hidden auto-fixes.

Done when:

- User can select both conflicting cards.
- User can resolve declared conflict/redundancy links.
- User can remove missing dependencies.
- User can mark obsolete logic blocked.

## P1: Real agent worker

- Start with one card in one worktree.
- Prompt the local Gemma brain with card summary, details, linked files, dependencies, and conflicts.
- Persist production worker run metadata with model, mode, prompt summary, branch/worktree, diagnostics, conflicts, and scoped proposed changes.
- Reject unsafe linked files and proposed changes outside the card's linked-file scope before treating worker output as reviewable.
- Apply structured linked-file replacements only inside the card worktree and only when the file still matches the content the worker read.
- Write implementation notes and then code changes on the card branch.
- Escalate only if the implementation requires changing logic.

Done when:

- One ready card creates a branch/worktree.
- The model reads the card and writes an implementation note. The production Tauri path now records this as a notes-only `agentRuns[]` entry.
- The worker records an `agentRuns[]` entry with scoped proposed file changes.
- The backend worker edit path can write at least one linked file after stale-file, worktree-scope, linked-file-scope, path, duplicate, no-op, and size checks.
- The desktop model loop can request structured JSON edits from Gemma/Ollama and route them through the guarded backend apply path.
- The desktop can mark the latest reviewable worker run merged or rejected through the backend; rejected worktrees remain intact for inspection instead of being silently cleaned up.
- The desktop can cancel a running card agent through the backend; cancellation records a `cancelled` run, moves the card out of `running`, and preserves branch/worktree metadata for inspection.
- In-flight model calls receive an abort signal, and late worker completions are ignored after cancellation instead of making a cancelled card reviewable again.
- Rejected, failed, or cancelled worker runs can be reset for retry; reset records an `abandoned` audit run, clears active branch/worktree metadata, and the production Tauri path cleans up only scoped agent worktrees/branches.
- Structured worker edits now persist review hunk metadata with old/new line ranges, and the desktop plus preview inspectors surface those hunks before merge/reject closeout.
- Accepted review closeout in the production Tauri path commits proposed linked-file changes on the card branch, merges that branch into the project root, attempts scoped worktree/branch cleanup, records git diagnostics, and clears active card branch/worktree metadata.
- The branch becomes ready to merge.

Current gap: model-generated whole-file replacements can now reach the guarded backend path and receive basic hunk inspection, review closeout with git merge, cancellation, and reset-for-retry, but the desktop still needs per-hunk accept/reject, inline diff review, true resume from partial worker progress, stronger merge-conflict recovery, and broader integration coverage before this is GA-grade.

## P2: Packaged runtime

- Ollama remains the MVP path.
- Product path is a bundled local runtime sidecar, likely llama.cpp-compatible.
- Model weights should not be committed to the repo.
- First-run downloads verified artifacts into app data.

Done when:

- Mac/Linux app starts the runtime without user terminal setup.
- `gemma3:4b` is downloaded or verified with checksum.
- Agent calls use the app-managed localhost endpoint.
