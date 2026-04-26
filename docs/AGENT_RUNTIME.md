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
   - Asks the brain for implementation intent and risks.
   - Applies code changes only inside the card worktree.
   - Records an `agentRuns[]` entry back to the card/activity timeline.

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

Every completed worker attempt records:

- `id`
- `at`
- `model`
- `mode` (`model` or `simulated`)
- `note`
- `proposedChanges[]`
- `preflightConflicts[]`

Each proposed file change records:

- `file`
- `summary`
- `status` (`proposed`, `needs_merge_agent`, or later `applied`)

## Merge closeout

A card may be marked `merged` only after it reaches `ready_to_merge`. The closeout step clears non-human card conflicts and marks proposed changes as `applied` unless they still need a merge agent.

## MVP behavior

If no brain is running, the UI may simulate the agent path, but it must make that obvious in the activity log and record `mode: simulated`. Silent fake agents are not acceptable.
