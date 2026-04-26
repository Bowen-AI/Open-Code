export const sampleProject = {
  version: 1,
  project: {
    id: "open-code",
    title: "Open Code Logic Workspace",
    summary:
      "Logic cards drive the project. Parallel agents work in isolated branches, code conflicts go to merge agents, and logic conflicts go to humans."
  },
  topics: [
    {
      id: "logic-runtime",
      title: "Logic Runtime",
      summary: "Schema, conflict detection, work planning, and generated documentation output.",
      cardIds: ["card-logic-schema", "card-agent-coordinator", "card-conflict-model"]
    },
    {
      id: "desktop-shell",
      title: "Desktop Shell",
      summary: "A lightweight UI for inspecting logic, running card agents, and opening VS Code.",
      cardIds: ["card-logic-board-ui", "card-documentation-presentations", "card-vscode-handoff"]
    },
    {
      id: "mvp-delivery",
      title: "MVP Delivery Track",
      summary:
        "The highest-priority work still needed to move from preview to a real local agent product.",
      cardIds: [
        "card-local-gemma-brain",
        "card-persistent-workspace",
        "card-human-conflict-resolution",
        "card-real-agent-worker",
        "card-packaged-runtime"
      ]
    }
  ],
  cards: [
    {
      id: "card-logic-schema",
      title: "Readable Logic Schema",
      summary: "Store cards in readable JSON and render them into multiple documentation views.",
      details:
        "The JSON project file keeps stable ids, topic order, dependencies, linked files, agent status, and conflict records. Paper, spec, roadmap, handoff, and website views are generated so the same logic can be reviewed in the right format.",
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
      summary: "Run one isolated branch and worktree per card.",
      details:
        "The coordinator plans branch names and worktree paths. It blocks human-required logic conflicts before work starts and lets code overlaps proceed to merge-agent review.",
      status: "running",
      linkedFiles: ["crates/open-code-logic/src/lib.rs", "packages/desktop/src-tauri/src/main.rs"],
      dependencies: ["card-logic-schema"],
      relatedCards: ["card-conflict-model"],
      implementationBranch: "open-code/card/card-agent-coordinator-parallel-agent-coordinator",
      worktreePath: ".open-code/worktrees/card-agent-coordinator-parallel-agent-coordinator",
      conflicts: []
    },
    {
      id: "card-conflict-model",
      title: "Conflict Review Model",
      summary: "Separate code overlap from human logic conflict.",
      details:
        "Same-file work is agent merge work. Contradictory behavior, duplicated design, incompatible APIs, or dependency cycles become human review.",
      status: "ready",
      linkedFiles: ["crates/open-code-logic/src/lib.rs", "packages/desktop/preview/app.js"],
      dependencies: ["card-logic-schema"],
      relatedCards: ["card-agent-coordinator"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-logic-board-ui",
      title: "Logic Board UI",
      summary: "Show topics, card flow, agent badges, and conflicts.",
      details:
        "The main screen has a topic rail, connected card flow, card inspector, conflict review, documentation presentation switcher, and agent activity log.",
      status: "ready",
      linkedFiles: ["packages/desktop/preview/index.html", "packages/desktop/preview/app.js"],
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
        "packages/desktop/preview/logic.js",
        "packages/desktop/preview/app.js",
        "docs/DOCUMENTATION_PRESENTATIONS.md"
      ],
      dependencies: ["card-logic-schema", "card-logic-board-ui"],
      relatedCards: ["card-persistent-workspace"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-vscode-handoff",
      title: "Open in VS Code",
      summary: "Open the project, card worktree, or linked file.",
      details:
        "The MVP preview simulates the handoff; the Tauri app implements the real command through the backend.",
      status: "ready",
      linkedFiles: ["packages/desktop/src-tauri/src/main.rs"],
      dependencies: ["card-agent-coordinator"],
      relatedCards: ["card-logic-board-ui"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-local-gemma-brain",
      title: "Local Gemma Brain",
      summary: "Use Gemma 3 4B through Ollama now, with Auto/custom model selection.",
      details:
        "The MVP should always show whether the agent brain is online. Auto prefers installed Gemma 3 models, defaulting to gemma3:4b. Agent runs call the local Ollama API when available and otherwise remain explicit simulations.",
      status: "ready",
      linkedFiles: [
        "packages/desktop/preview/models.js",
        "packages/desktop/src/lib/models.ts",
        "runtime/model-manifest.json"
      ],
      dependencies: ["card-logic-board-ui"],
      relatedCards: ["card-real-agent-worker", "card-packaged-runtime"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-persistent-workspace",
      title: "Persistent Logic Workspace",
      summary: "Keep preview edits across refresh and mirror the Tauri save/load contract.",
      details:
        "The browser preview should persist card edits, statuses, links, selected cards, and activity in localStorage so users can test-drive the workflow. The Tauri app uses the same contract with project JSON and generated Markdown.",
      status: "ready",
      linkedFiles: ["packages/desktop/preview/app.js", "logic/open-code.project.json"],
      dependencies: ["card-logic-schema", "card-logic-board-ui"],
      relatedCards: ["card-human-conflict-resolution"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-human-conflict-resolution",
      title: "Human Logic Conflict Resolution",
      summary: "Let humans resolve design conflicts by editing, unblocking, or marking cards obsolete.",
      details:
        "Logic conflicts should not be auto-merged. The UI needs explicit actions to select conflicting cards, resolve declared conflict links, remove missing dependencies, and mark obsolete logic blocked.",
      status: "ready",
      linkedFiles: ["packages/desktop/preview/app.js", "packages/desktop/preview/logic.js"],
      dependencies: ["card-conflict-model", "card-persistent-workspace"],
      relatedCards: ["card-real-agent-worker"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-real-agent-worker",
      title: "Real Agent Worker",
      summary: "Turn a ready card into model-backed code changes in its worktree.",
      details:
        "After a card starts, the worker should prompt Gemma with card intent, linked files, dependencies, and conflict report, then produce implementation notes and code changes on the card branch.",
      status: "draft",
      linkedFiles: [
        "crates/open-code-logic/src/lib.rs",
        "packages/desktop/src-tauri/src/main.rs"
      ],
      dependencies: ["card-agent-coordinator", "card-local-gemma-brain", "card-human-conflict-resolution"],
      relatedCards: ["card-packaged-runtime"],
      implementationBranch: null,
      worktreePath: null,
      conflicts: []
    },
    {
      id: "card-packaged-runtime",
      title: "Packaged Model Runtime",
      summary: "Bundle a local inference sidecar and manage Gemma download/verification.",
      details:
        "Ollama is the MVP path. The product path bundles a llama.cpp-compatible runtime, stores models under app data, verifies checksums, and exposes one local HTTP API for agents.",
      status: "draft",
      linkedFiles: ["docs/AGENT_RUNTIME.md", "runtime/model-manifest.json"],
      dependencies: ["card-local-gemma-brain"],
      relatedCards: ["card-real-agent-worker"],
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
      reason: "Conflict detection runs over structured cards."
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
    },
    {
      from: "card-local-gemma-brain",
      to: "card-logic-board-ui",
      kind: "dependency",
      reason: "The model status belongs in the main logic workspace."
    },
    {
      from: "card-persistent-workspace",
      to: "card-logic-board-ui",
      kind: "dependency",
      reason: "Persistence makes the preview useful as a real planning surface."
    },
    {
      from: "card-human-conflict-resolution",
      to: "card-conflict-model",
      kind: "dependency",
      reason: "Resolution actions depend on the conflict classifier."
    },
    {
      from: "card-real-agent-worker",
      to: "card-local-gemma-brain",
      kind: "dependency",
      reason: "Real workers need an online local model brain."
    },
    {
      from: "card-real-agent-worker",
      to: "card-human-conflict-resolution",
      kind: "dependency",
      reason: "Workers must block when a card has human-required logic conflicts."
    },
    {
      from: "card-packaged-runtime",
      to: "card-local-gemma-brain",
      kind: "dependency",
      reason: "The packaged runtime replaces the MVP Ollama dependency after the brain contract is stable."
    }
  ]
};

export function cloneProject(project = sampleProject) {
  return JSON.parse(JSON.stringify(project));
}

export const DOC_PRESENTATIONS = [
  {
    id: "paper",
    label: "Paper",
    format: "markdown",
    summary: "Long-form reasoning for reviewing the project as a coherent document."
  },
  {
    id: "spec",
    label: "Spec",
    format: "markdown",
    summary: "Dense implementation contract grouped by topics, files, dependencies, and conflicts."
  },
  {
    id: "roadmap",
    label: "Roadmap",
    format: "markdown",
    summary: "Status-first view of what is running, ready, blocked, and next."
  },
  {
    id: "handoff",
    label: "Agent Handoff",
    format: "markdown",
    summary: "Operational briefing for the next coding or merge agent."
  },
  {
    id: "website",
    label: "Website",
    format: "website",
    summary: "A visual stakeholder presentation generated from the same logic graph."
  }
];

const STATUS_ORDER = [
  "running",
  "ready_to_merge",
  "needs_human_logic_review",
  "ready",
  "draft",
  "merged",
  "blocked"
];

export function renderDocumentation(project, mode = "paper") {
  const presentation =
    DOC_PRESENTATIONS.find((candidate) => candidate.id === mode) || DOC_PRESENTATIONS[0];

  if (presentation.id === "website") {
    return renderWebsiteDocumentation(project, presentation);
  }

  const renderers = {
    paper: renderPaper,
    spec: renderSpec,
    roadmap: renderRoadmap,
    handoff: renderHandoff
  };

  return {
    ...presentation,
    title: `${project.project.title} ${presentation.label}`,
    content: renderers[presentation.id](project)
  };
}

export function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "logic";
}

export function branchForCard(card) {
  return `open-code/card/${card.id}-${slugify(card.title)}`;
}

export function worktreeForCard(card) {
  return `.open-code/worktrees/${card.id}-${slugify(card.title)}`;
}

export function cardsForTopic(project, topicId) {
  const topic = project.topics.find((candidate) => candidate.id === topicId);
  if (!topic) return project.cards;
  return topic.cardIds
    .map((cardId) => project.cards.find((card) => card.id === cardId))
    .filter(Boolean);
}

export function detectConflicts(project) {
  const conflicts = [];
  const active = project.cards.filter((card) => !["draft", "merged", "blocked"].includes(card.status));
  const byFile = new Map();

  for (const card of active) {
    for (const file of normalizeFiles(card.linkedFiles)) {
      byFile.set(file, [...(byFile.get(file) || []), card.id]);
    }
  }

  for (const [file, cardIds] of byFile) {
    const uniqueIds = [...new Set(cardIds)].sort();
    if (uniqueIds.length > 1) {
      conflicts.push({
        id: `code-overlap-${uniqueIds.join("-")}-${slugify(file)}`,
        kind: "code_overlap",
        cardIds: uniqueIds,
        file,
        reason: `Multiple active cards link to ${file}; a merge agent should reconcile code changes.`,
        humanRequired: false,
        status: "agent_merge_pending"
      });
    }
  }

  const cardIds = new Set(project.cards.map((card) => card.id));
  for (const card of project.cards) {
    for (const dependency of card.dependencies) {
      if (!cardIds.has(dependency)) {
        conflicts.push({
          id: `missing-dependency-${card.id}-${dependency}`,
          kind: "missing_dependency",
          cardIds: [card.id, dependency],
          file: null,
          reason: `${card.id} depends on missing card ${dependency}.`,
          humanRequired: true,
          status: "human_review"
        });
      }
    }
  }

  for (const cycle of dependencyCycles(project)) {
    conflicts.push({
      id: `dependency-cycle-${cycle.join("-")}`,
      kind: "dependency_cycle",
      cardIds: cycle,
      file: null,
      reason: `Dependency cycle detected: ${cycle.join(" -> ")}.`,
      humanRequired: true,
      status: "human_review"
    });
  }

  for (const link of project.links) {
    if (link.kind === "conflicts_with" || link.kind === "redundant_with") {
      conflicts.push({
        id: `${link.kind}-${link.from}-${link.to}`,
        kind: link.kind === "conflicts_with" ? "logic_conflict" : "redundancy",
        cardIds: [link.from, link.to].sort(),
        file: null,
        reason: link.reason || "Cards need a human logic decision.",
        humanRequired: true,
        status: "human_review"
      });
    }
  }

  return conflicts.sort((a, b) => a.id.localeCompare(b.id));
}

export function startAgent(project, cardId) {
  const next = cloneProject(project);
  const card = next.cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Missing card ${cardId}`);
  if (card.status !== "ready") throw new Error(`Card ${cardId} is not ready`);

  const conflicts = detectConflicts(next).filter((conflict) => conflict.cardIds.includes(cardId));
  const humanConflict = conflicts.find((conflict) => conflict.humanRequired);
  if (humanConflict) throw new Error(`Human logic review required: ${humanConflict.reason}`);

  card.status = "running";
  card.implementationBranch = branchForCard(card);
  card.worktreePath = worktreeForCard(card);
  card.conflicts = conflicts;

  return {
    project: next,
    plan: {
      cardId: card.id,
      branch: card.implementationBranch,
      worktreePath: card.worktreePath,
      linkedFiles: normalizeFiles(card.linkedFiles),
      summary: card.summary,
      preflightConflicts: conflicts
    }
  };
}

export function completeAgentRun(project, cardId, options = {}) {
  const next = cloneProject(project);
  const card = next.cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Missing card ${cardId}`);

  const preflightConflicts = options.preflightConflicts || card.conflicts || [];
  const note =
    options.note ||
    [
      `Implementation intent: ${card.summary}`,
      `Likely files: ${normalizeFiles(card.linkedFiles).join(", ") || "no linked files yet"}`,
      `Merge/conflict note: ${preflightConflicts.length} preflight conflict(s); human-required conflicts block before worker execution.`
    ].join("\n");
  const model = options.model || "simulated-worker";
  const mode = options.mode || "simulated";
  const run = {
    id: options.id || `run-${card.id}-${Date.now()}`,
    at: options.at || new Date().toISOString(),
    model,
    mode,
    note,
    proposedChanges: proposedChangesForCard(card, preflightConflicts),
    preflightConflicts
  };

  card.agentRuns = [...(card.agentRuns || []), run];
  card.status = "ready_to_merge";
  card.conflicts = preflightConflicts;
  return { project: next, run };
}

export function updateCard(project, cardId, patch) {
  return {
    ...project,
    cards: project.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card))
  };
}

export function markCardMerged(project, cardId) {
  const next = cloneProject(project);
  const card = next.cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Missing card ${cardId}`);
  if (card.status !== "ready_to_merge") {
    throw new Error(`Card ${cardId} is not ready to merge`);
  }
  card.status = "merged";
  card.conflicts = [];
  const latestRun = card.agentRuns?.[card.agentRuns.length - 1];
  if (latestRun) {
    latestRun.proposedChanges = latestRun.proposedChanges.map((change) => ({
      ...change,
      status: change.status === "needs_merge_agent" ? "needs_merge_agent" : "applied"
    }));
  }
  return next;
}

export function resolveHumanConflict(project, conflictId, action = "resolve-link") {
  const next = cloneProject(project);
  const conflict = detectConflicts(next).find((item) => item.id === conflictId);
  if (!conflict) return next;
  if (!conflict.humanRequired) {
    throw new Error("Only human-required logic conflicts can be resolved here.");
  }

  if (action === "mark-other-obsolete") {
    const [keepId, obsoleteId] = conflict.cardIds;
    const obsolete = next.cards.find((card) => card.id === obsoleteId);
    if (obsolete) {
      obsolete.status = "blocked";
      obsolete.details = `${obsolete.details}\n\nResolution note: marked obsolete in favor of ${keepId}.`.trim();
    }
  }

  next.links = next.links.filter((link) => {
    const samePair = conflict.cardIds.includes(link.from) && conflict.cardIds.includes(link.to);
    const humanLink = link.kind === "conflicts_with" || link.kind === "redundant_with";
    return !(samePair && humanLink);
  });

  if (conflict.kind === "missing_dependency") {
    const [cardId, missingId] = conflict.cardIds;
    const card = next.cards.find((item) => item.id === cardId);
    if (card) {
      card.dependencies = card.dependencies.filter((dependency) => dependency !== missingId);
    }
  }

  if (conflict.kind === "dependency_cycle") {
    const [from, to] = conflict.cardIds;
    const card = next.cards.find((item) => item.id === from);
    if (card) {
      card.dependencies = card.dependencies.filter((dependency) => dependency !== to);
    }
  }

  for (const card of next.cards) {
    card.conflicts = [];
  }

  return next;
}

export function renderPaper(project) {
  const conflicts = detectConflicts(project);
  const lines = [`# ${project.project.title}`, "", project.project.summary, ""];

  if (conflicts.length) {
    lines.push("## Conflict Review", "");
    for (const conflict of conflicts) {
      const owner = conflict.humanRequired ? "Human logic review" : "Agent merge work";
      const file = conflict.file ? ` in ${conflict.file}` : "";
      lines.push(`- **${owner}${file}:** ${conflict.reason} (${conflict.cardIds.join(", ")})`);
    }
    lines.push("");
  }

  for (const topic of project.topics) {
    lines.push(`## ${topic.title}`, "", topic.summary, "");
    for (const card of cardsForTopic(project, topic.id)) {
      lines.push(`### ${card.title} \`${card.id}\``, "");
      lines.push(`**Summary:** ${card.summary}`, "");
      lines.push(`**Status:** \`${card.status}\``, "");
      if (card.linkedFiles.length) {
        lines.push(`**Linked files:** ${card.linkedFiles.map((file) => `\`${file}\``).join(", ")}`, "");
      }
      if (card.dependencies.length) {
        lines.push(`**Depends on:** ${card.dependencies.map((id) => `\`${id}\``).join(", ")}`, "");
      }
      if (card.implementationBranch) {
        lines.push(`**Branch:** \`${card.implementationBranch}\``, "");
      }
      const latestRun = latestAgentRun(card);
      if (latestRun) {
        lines.push("**Latest agent run:**", "");
        lines.push(`- Model: \`${latestRun.model}\` (${latestRun.mode})`);
        lines.push(`- Note: ${latestRun.note.replace(/\n/g, " ")}`);
        for (const change of latestRun.proposedChanges || []) {
          lines.push(`- Proposed \`${change.file}\`: ${change.summary}`);
        }
        lines.push("");
      }
      lines.push(card.details, "");
    }
  }

  return lines.join("\n");
}

function renderSpec(project) {
  const conflicts = detectConflicts(project);
  const lines = [
    `# Technical Spec: ${project.project.title}`,
    "",
    project.project.summary,
    "",
    "## State Snapshot",
    "",
    `- Topics: ${project.topics.length}`,
    `- Cards: ${project.cards.length}`,
    `- Active agents: ${project.cards.filter((card) => card.status === "running").length}`,
    `- Human review items: ${conflicts.filter((conflict) => conflict.humanRequired).length}`,
    `- Agent merge items: ${conflicts.filter((conflict) => !conflict.humanRequired).length}`,
    "",
    "## Documentation Contract",
    "",
    "- The card graph is the source of truth.",
    "- Presentations are generated views over the same cards, topics, dependencies, linked files, and conflicts.",
    "- Paper is for narrative review; spec is for implementation; roadmap is for sequencing; handoff is for agents; website is for visual review.",
    ""
  ];

  for (const topic of project.topics) {
    lines.push(`## ${topic.title}`, "", topic.summary, "");
    for (const card of cardsForTopic(project, topic.id)) {
      lines.push(`### ${card.title}`, "");
      lines.push(`- Card: \`${card.id}\``);
      lines.push(`- Status: \`${card.status}\``);
      lines.push(`- Summary: ${card.summary}`);
      lines.push(`- Dependencies: ${card.dependencies.length ? card.dependencies.map((id) => `\`${id}\``).join(", ") : "none"}`);
      lines.push(`- Linked files: ${card.linkedFiles.length ? card.linkedFiles.map((file) => `\`${file}\``).join(", ") : "none"}`);
      if (card.implementationBranch) {
        lines.push(`- Branch: \`${card.implementationBranch}\``);
      }
      lines.push("", card.details, "");
    }
  }

  if (conflicts.length) {
    lines.push("## Conflict And Redundancy Report", "");
    for (const conflict of conflicts) {
      lines.push(
        `- **${conflict.humanRequired ? "Human" : "Agent"} ${statusLabel(conflict.kind)}:** ${conflict.reason} (${conflict.cardIds.join(", ")})`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderRoadmap(project) {
  const conflicts = detectConflicts(project);
  const lines = [`# Roadmap: ${project.project.title}`, "", project.project.summary, ""];

  for (const status of STATUS_ORDER) {
    const cards = project.cards.filter((card) => card.status === status);
    if (!cards.length) continue;
    lines.push(`## ${statusLabel(status)}`, "");
    for (const card of cards) {
      const topic = project.topics.find((candidate) => candidate.cardIds.includes(card.id));
      const files = card.linkedFiles.length ? ` Files: ${card.linkedFiles.join(", ")}.` : "";
      lines.push(`- **${card.title}** (${topic?.title || "Ungrouped"}): ${card.summary}${files}`);
    }
    lines.push("");
  }

  lines.push("## Review Queue", "");
  if (!conflicts.length) {
    lines.push("- No open conflicts or redundancy items.", "");
  } else {
    for (const conflict of conflicts) {
      lines.push(
        `- **${conflict.humanRequired ? "Human decision" : "Merge agent"}:** ${conflict.reason} (${conflict.cardIds.join(", ")})`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderHandoff(project) {
  const conflicts = detectConflicts(project);
  const readyCards = project.cards.filter((card) => card.status === "ready");
  const runningCards = project.cards.filter((card) => card.status === "running");
  const mergeCards = project.cards.filter((card) => card.status === "ready_to_merge");
  const lines = [
    `# Agent Handoff: ${project.project.title}`,
    "",
    project.project.summary,
    "",
    "## Operating Rules",
    "",
    "- Work from one logic card at a time.",
    "- Create one branch and worktree per active card.",
    "- Resolve code conflicts with agents when both card intents stay true.",
    "- Escalate logic conflicts, duplicate intent, incompatible APIs, or UX/design contradictions to a human.",
    "- Update the card summary, details, linked files, and agent run record after work.",
    "",
    "## Ready Cards",
    ""
  ];

  lines.push(...renderHandoffCardList(readyCards));
  lines.push("## Running Cards", "");
  lines.push(...renderHandoffCardList(runningCards));
  lines.push("## Ready To Merge", "");
  lines.push(...renderHandoffCardList(mergeCards));
  lines.push("## Conflicts", "");
  if (!conflicts.length) {
    lines.push("- No conflicts detected.", "");
  } else {
    for (const conflict of conflicts) {
      lines.push(
        `- **${conflict.humanRequired ? "Human" : "Agent"} ${statusLabel(conflict.kind)}:** ${conflict.reason} Cards: ${conflict.cardIds.join(", ")}.`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderWebsiteDocumentation(project, presentation) {
  const conflicts = detectConflicts(project);
  const linkedFiles = new Set(project.cards.flatMap((card) => normalizeFiles(card.linkedFiles)));
  return {
    ...presentation,
    title: project.project.title,
    content: `${project.project.title}\n\n${project.project.summary}`,
    stats: [
      { label: "Topics", value: String(project.topics.length) },
      { label: "Cards", value: String(project.cards.length) },
      {
        label: "Active Agents",
        value: String(project.cards.filter((card) => card.status === "running").length)
      },
      { label: "Linked Files", value: String(linkedFiles.size) }
    ],
    conflicts: conflicts.map((conflict) => ({
      id: conflict.id,
      label: conflict.humanRequired ? "Human decision" : "Merge agent",
      reason: conflict.reason,
      cardIds: conflict.cardIds,
      file: conflict.file
    })),
    topics: project.topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      summary: topic.summary,
      cards: cardsForTopic(project, topic.id).map(cardToWebsiteCard)
    })),
    ungroupedCards: project.cards
      .filter((card) => !project.topics.some((topic) => topic.cardIds.includes(card.id)))
      .map(cardToWebsiteCard)
  };
}

function renderHandoffCardList(cards) {
  if (!cards.length) return ["- None.", ""];
  return [
    ...cards.map((card) => {
      const files = card.linkedFiles.length ? ` Files: ${card.linkedFiles.join(", ")}.` : "";
      const branch = card.implementationBranch ? ` Branch: ${card.implementationBranch}.` : "";
      return `- **${card.title}** \`${card.id}\`: ${card.summary}${files}${branch}`;
    }),
    ""
  ];
}

function cardToWebsiteCard(card) {
  return {
    id: card.id,
    title: card.title,
    summary: card.summary,
    details: card.details,
    status: card.status,
    linkedFiles: normalizeFiles(card.linkedFiles),
    dependencies: [...card.dependencies],
    branch: card.implementationBranch || null
  };
}

export function latestAgentRun(card) {
  const runs = card.agentRuns || [];
  return runs[runs.length - 1];
}

export function statusLabel(status) {
  return String(status).replaceAll("_", " ");
}

function normalizeFiles(files) {
  return [...new Set(files.map((file) => String(file).trim().replaceAll("\\", "/")).filter(Boolean))].sort();
}

function proposedChangesForCard(card, preflightConflicts) {
  const conflictFiles = new Set(
    preflightConflicts.map((conflict) => conflict.file).filter((file) => typeof file === "string")
  );
  const files = normalizeFiles(card.linkedFiles);
  if (files.length === 0) {
    return [
      {
        file: "(new file TBD)",
        summary: "Worker should choose a file after reading the project structure.",
        status: "proposed"
      }
    ];
  }
  return files.map((file) => ({
    file,
    summary: conflictFiles.has(file)
      ? "Review with merge agent because another active card links this file."
      : `Implement ${card.title} while preserving the card summary and dependencies.`,
    status: conflictFiles.has(file) ? "needs_merge_agent" : "proposed"
  }));
}

function dependencyCycles(project) {
  const adjacency = new Map(project.cards.map((card) => [card.id, [...card.dependencies]]));
  const found = new Set();

  for (const start of adjacency.keys()) {
    visit(start, start, [], adjacency, found);
  }

  return [...found].map((cycle) => cycle.split(">"));
}

function visit(start, current, stack, adjacency, found) {
  if (stack.includes(current)) return;
  const nextStack = [...stack, current];
  for (const next of adjacency.get(current) || []) {
    if (next === start && nextStack.length > 1) {
      found.add(canonicalCycle(nextStack).join(">"));
    } else {
      visit(start, next, nextStack, adjacency, found);
    }
  }
}

function canonicalCycle(cycle) {
  const rotations = cycle.map((_, index) => [...cycle.slice(index), ...cycle.slice(0, index)]);
  return rotations.sort((a, b) => a.join(">").localeCompare(b.join(">")))[0];
}
