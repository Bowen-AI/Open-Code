# Logic workspace architecture

Open Code is now centered on project logic before code. The desktop app treats each logic card as the smallest coherent unit of work, and cards can become isolated agent jobs.

## Source of truth

- `logic/open-code.project.json` is the structured project state for topics, cards, dependencies, linked files, branch metadata, and conflicts.
- `logic/open-code.paper.md` is the default generated, GitHub-readable project paper.
- Documentation presentations can render the same card graph as paper, spec, roadmap, agent handoff, or website view.
- `.open-code/worktrees/` is ignored local runtime state for branch-per-card agent worktrees.

## Multi-agent model

- One ready card maps to one agent branch and worktree.
- Branches use `open-code/card/<card-id>-<slug>`.
- Worktrees live under `.open-code/worktrees/<card-id>-<slug>`.
- The Rust core plans branches/worktrees and blocks human-required logic conflicts before starting work.
- Code overlaps are allowed to proceed into merge-agent work.

## Conflict model

- Agent-resolvable conflicts:
  - Same linked file across active cards.
  - Future same-hunk git conflicts where both card intents remain compatible.
- Human-gated conflicts:
  - Explicit logic conflict links.
  - Redundancy links.
  - Dependency cycles.
  - Missing dependencies.
  - Any merge that changes the design meaning of a card.

## Desktop app

The new `packages/desktop` app is a Tauri + Svelte shell:

- topic rail
- traceable logic flow
- card inspector
- conflict review view
- documentation presentation switcher for paper, spec, roadmap, handoff, and website views
- agent launch action
- Gemma/Ollama brain selection with Auto, Gemma 3 defaults, and custom model tags
- preview persistence for card edits and activity
- explicit human logic conflict resolution actions
- Open in VS Code handoff

The app can run with demo data in the browser shell, then use Tauri commands when installed to load/save real project state and create git worktrees.
