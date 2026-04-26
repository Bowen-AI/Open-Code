import type { LogicProject } from "./types";

export const sampleProject: LogicProject = {
  version: 1,
  project: {
    id: "open-code",
    title: "Open Code Logic Workspace",
    summary:
      "A logic-first desktop workspace where project decisions are cards, cards become isolated agent work units, and human review is reserved for design conflicts."
  },
  topics: [
    {
      id: "logic-runtime",
      title: "Logic Runtime",
      summary:
        "The source of truth for cards, topics, dependencies, conflict detection, and generated documentation output.",
      cardIds: ["card-logic-schema", "card-agent-coordinator", "card-conflict-model"]
    },
    {
      id: "desktop-shell",
      title: "Desktop Shell",
      summary:
        "A lightweight Tauri and Svelte app that lets users inspect, edit, and run logic cards.",
      cardIds: ["card-logic-board-ui", "card-documentation-presentations", "card-vscode-handoff"]
    }
  ],
  cards: [
    {
      id: "card-logic-schema",
      title: "Readable Logic Schema",
      summary: "Store cards and topics in GitHub-readable JSON plus generated documentation views.",
      details:
        "The structured project file keeps stable card ids, topic order, dependencies, linked files, and conflict metadata. Paper, spec, roadmap, handoff, and website presentations are generated from the same state.",
      status: "ready",
      linkedFiles: ["crates/open-code-logic/src/lib.rs", "logic/open-code.project.json"],
      dependencies: [],
      relatedCards: ["card-conflict-model"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-agent-coordinator",
      title: "Parallel Agent Coordinator",
      summary: "Run one isolated branch and worktree per active card.",
      details:
        "The coordinator prepares branch names, worktree paths, and command plans. It blocks human-required logic conflicts before an agent starts, but allows code overlaps to continue into merge-agent work.",
      status: "running",
      linkedFiles: ["crates/open-code-logic/src/lib.rs", "packages/desktop/src-tauri/src/main.rs"],
      dependencies: ["card-logic-schema"],
      relatedCards: ["card-conflict-model"],
      implementationBranch: "open-code/card/card-agent-coordinator-parallel-agent-coordinator",
      worktreePath:
        ".open-code/worktrees/card-agent-coordinator-parallel-agent-coordinator",
      conflicts: []
    },
    {
      id: "card-conflict-model",
      title: "Conflict Review Model",
      summary: "Separate agent-resolvable code overlap from human-resolved logic conflict.",
      details:
        "Same-file work is an agent merge task. Contradictory behavior, duplicated design, incompatible APIs, or dependency cycles become human logic review.",
      status: "ready",
      linkedFiles: ["crates/open-code-logic/src/lib.rs", "packages/desktop/src/App.svelte"],
      dependencies: ["card-logic-schema"],
      relatedCards: ["card-agent-coordinator"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-logic-board-ui",
      title: "Logic Board UI",
      summary: "Show topics, card flow, running agents, branches, and conflict badges.",
      details:
        "The main screen uses a topic rail, central logic flow, documentation presentation switcher, and an inspector. Editing happens at the card level because the card is the smallest coherent unit of logic.",
      status: "ready",
      linkedFiles: ["packages/desktop/src/App.svelte", "packages/desktop/src/app.css"],
      dependencies: ["card-logic-schema", "card-conflict-model"],
      relatedCards: ["card-documentation-presentations", "card-vscode-handoff"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-documentation-presentations",
      title: "Documentation Presentations",
      summary: "Render logic as paper, spec, roadmap, handoff, or website.",
      details:
        "Paper stays useful for long-form reasoning, but the same card graph also needs dense specs, status roadmaps, agent handoffs, and a website-style presentation for stakeholder review. The UI should switch presentation modes without changing the underlying logic cards.",
      status: "ready",
      linkedFiles: [
        "packages/desktop/src/App.svelte",
        "packages/desktop/src/app.css",
        "docs/DOCUMENTATION_PRESENTATIONS.md"
      ],
      dependencies: ["card-logic-schema", "card-logic-board-ui"],
      relatedCards: ["card-vscode-handoff"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-vscode-handoff",
      title: "Open in VS Code",
      summary: "Open a card worktree, project folder, or linked file in VS Code.",
      details:
        "Code remains behind the logic surface. Users can jump to VS Code only when they need file-level editing or to inspect an agent worktree.",
      status: "ready",
      linkedFiles: ["packages/desktop/src-tauri/src/main.rs"],
      dependencies: ["card-agent-coordinator"],
      relatedCards: ["card-logic-board-ui"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    }
  ],
  links: [
    {
      from: "card-agent-coordinator",
      to: "card-logic-schema",
      kind: "dependency",
      reason: "Agent work needs stable card ids and linked files."
    },
    {
      from: "card-conflict-model",
      to: "card-logic-schema",
      kind: "dependency",
      reason: "Conflict detection runs over structured cards and links."
    },
    {
      from: "card-logic-board-ui",
      to: "card-conflict-model",
      kind: "dependency",
      reason: "The UI must explain which conflicts need humans."
    },
    {
      from: "card-documentation-presentations",
      to: "card-logic-schema",
      kind: "dependency",
      reason: "Every presentation renders from the same structured project graph."
    },
    {
      from: "card-documentation-presentations",
      to: "card-logic-board-ui",
      kind: "dependency",
      reason: "The presentation switcher belongs in the main logic workspace."
    }
  ]
};
