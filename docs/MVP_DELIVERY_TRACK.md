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
- Write implementation notes and then code changes on the card branch.
- Escalate only if the implementation requires changing logic.

Done when:

- One ready card creates a branch/worktree.
- The model reads the card and writes an implementation note.
- The worker records an `agentRuns[]` entry with proposed file changes.
- The worker edits at least one linked file.
- The branch becomes ready to merge.

## P2: Packaged runtime

- Ollama remains the MVP path.
- Product path is a bundled local runtime sidecar, likely llama.cpp-compatible.
- Model weights should not be committed to the repo.
- First-run downloads verified artifacts into app data.

Done when:

- Mac/Linux app starts the runtime without user terminal setup.
- `gemma3:4b` is downloaded or verified with checksum.
- Agent calls use the app-managed localhost endpoint.
