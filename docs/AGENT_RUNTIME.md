# Agent runtime contract

Open Code agents are driven by logic cards. A card is not just a prompt; it is the unit of design intent, branch isolation, and merge review.

## Runtime layers

1. **Logic state**
   - Source: `logic/open-code.project.json`.
   - Human-readable default paper: `logic/open-code.paper.md`.
   - Additional presentations: spec, roadmap, handoff, and website views generated from the same card graph.
   - Card fields used by agents: title, summary, details, linked files, dependencies, status, conflicts.

2. **Agent coordinator**
   - One ready card maps to one branch/worktree.
   - Branch pattern: `open-code/card/<card-id>-<slug>`.
   - Worktree path: `.open-code/worktrees/<card-id>-<slug>`.
   - Human-required conflicts block before model work starts.

3. **Brain provider**
   - MVP: Ollama-compatible local HTTP API.
   - Default model: `gemma3:4b`.
   - Auto mode chooses the strongest installed Gemma candidate.
   - Product path: app-managed local sidecar runtime.

4. **Worker**
   - Reads the card and linked files.
   - Asks the brain for structured JSON with implementation notes and complete linked-file replacements.
   - Rejects unsafe linked files and proposed changes outside the card's linked-file scope.
   - Applies structured file replacements only when the linked file still exactly matches the text the worker read.
   - Applies code changes only inside the card worktree.
   - Records an `agentRuns[]` entry back to the card/activity timeline.
   - Can be cancelled before reviewable edits are produced; cancellation records an audit run and leaves branch/worktree metadata intact for inspection.

5. **Merge agent**
   - Handles code overlaps and git conflicts.
   - May resolve code conflicts when both card intents remain true.
   - Must escalate when merge requires changing card logic.

## Conflict boundary

Agents may resolve:

- Same-file code overlap.
- Git merge conflicts that preserve both card intents.
- Formatting or import conflicts.

Humans must resolve:

- Contradictory behavior.
- Duplicate product logic.
- API/design disagreement.
- Dependency cycles.
- Missing or obsolete logic.

## Prompt shape

Every card-agent prompt should include:

- card id and title
- summary
- details
- status
- linked files
- dependencies
- preflight conflicts
- explicit instruction that logic conflicts require human review

## Agent run record

Every worker attempt records:

- `id`
- `at`
- `model`
- `mode` (`model_note`, `simulated_note`, `model`, `simulated`, `manual_cancel`, or `manual_reset`)
- `status` (`started`, `notes_only`, `ready_for_review`, `applied`, `rejected`, `failed`, `cancelled`, or `abandoned`)
- `promptSummary`
- `note`
- `startedAt` / `finishedAt`
- `branch`
- `worktreePath`
- `diagnostics[]`
- `proposedChanges[]`
- `preflightConflicts[]`

Each proposed file change records:

- `file`
- `summary`
- `status` (`notes_only`, `proposed`, `needs_merge_agent`, or later `applied`)
- `hunks[]` with stable hunk id, old/new line ranges, status, and summary

## Structured edit contract

The Tauri backend exposes a structured worker edit path for the production shell. Each edit request carries:

- `file`: a normalized project-relative path that must already be in the card's linked-file scope
- `expectedText`: the exact file contents the worker read before proposing the edit
- `newText`: the complete replacement contents to write in the card worktree
- `summary`: the human-readable change summary saved into `proposedChanges[]`

The backend rejects edits when:

- the card is not `running`
- the branch/worktree plan does not match the card's recorded run state
- the worktree path is outside the project's `.open-code/worktrees` directory
- the file path is absolute, contains traversal, is duplicated, or is not linked to the card
- the edit is a no-op
- `newText` is above the safe worker edit size limit
- the current worktree file differs from `expectedText`

Only after the write succeeds does the backend persist a `ready_for_review` agent run and move the card to `ready_to_merge`. Each proposed change includes line-hunk range metadata computed from the exact `expectedText` and `newText`; the project file records ranges and summaries, not raw diff text. The notes-only path remains available for model planning output; it must not mark a card reviewable by itself.

The desktop model loop now reads linked-file text through the backend, sends that exact text to the local Gemma/Ollama provider, parses the structured JSON response, and submits edits to the backend apply command. Offline models, unreadable linked files, invalid JSON, empty edit lists, stale files, and rejected scope checks are recorded as diagnostics or failed runs instead of silently producing mergeable work.

## Cancellation

A running card may be cancelled before it reaches review. The backend only accepts cancellation while the card is `running`; it appends a `cancelled` agent run with the cancellation time, diagnostic note, branch, worktree path, and preflight conflicts, then moves the card to `blocked`. The branch and worktree are intentionally preserved so a user or support engineer can inspect partial state instead of losing recovery context.

The desktop shell also aborts the active per-card model request when cancellation is requested. If a worker response arrives after cancellation, the UI treats the cancellation as authoritative and ignores the late completion instead of applying edits or marking the card reviewable.

## Reset for retry

A blocked card may be reset only when its latest worker run is `rejected`, `failed`, or `cancelled`. Reset appends an `abandoned` audit run that preserves the previous branch and worktree path, clears the active branch/worktree fields, clears stale conflicts, and returns the card to `ready` for a clean rerun.

The production Tauri path performs scoped cleanup before saving the reset: it removes only worktrees inside `.open-code/worktrees` and deletes only branches under `open-code/card/`. Rejected and cancelled worktrees remain inspectable until the user explicitly requests this reset.

## Merge closeout

A card may be marked `merged` only after it reaches `ready_to_merge`. The closeout step clears non-human card conflicts and marks proposed changes and their recorded hunks as `applied` unless they still need a merge agent.

## MVP behavior

If no brain is running, the UI may simulate the agent path, but it must make that obvious in the activity log and record `mode: simulated_note`. Silent fake agents are not acceptable.
