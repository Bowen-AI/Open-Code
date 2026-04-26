<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { sampleProject } from "./lib/sampleProject";
  import {
    DEFAULT_MODEL,
    MODEL_CHOICES,
    OLLAMA_BASE_URL,
    askOllama,
    buildCardAgentMessages,
    checkOllama,
    installHint,
    modelFromChoice
  } from "./lib/models";
  import type {
    AgentWorkPlan,
    ConflictRecord,
    ConflictStatus,
    GitCommandPlan,
    LogicCard,
    LogicProject,
    StartAgentResponse
  } from "./lib/types";

  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

  let project: LogicProject = clone(sampleProject);
  let projectRoot = "";
  let selectedTopicId = project.topics[0]?.id ?? "";
  let selectedCardId = project.cards[0]?.id ?? "";
  let paperPreview = "";
  let statusLine = "Demo logic project loaded.";
  let agentLog: string[] = [];
  let showConflictReview = true;
  let backendConflicts: ConflictRecord[] | null = null;
  let modelChoice = "auto";
  let modelBaseUrl = OLLAMA_BASE_URL;
  let customModel = "";
  let selectedModel = DEFAULT_MODEL;
  let modelOnline = false;
  let modelMessage = "Not checked";
  let selectedTopic: LogicProject["topics"][number] | undefined;
  let selectedCard: LogicCard | undefined;
  let conflicts: ConflictRecord[] = [];
  let humanConflicts: ConflictRecord[] = [];
  let agentConflicts: ConflictRecord[] = [];
  let selectedConflicts: ConflictRecord[] = [];
  let visibleCards: LogicCard[] = [];

  $: selectedTopic = project.topics.find((topic) => topic.id === selectedTopicId);
  $: selectedCard = project.cards.find((card) => card.id === selectedCardId);
  $: conflicts = backendConflicts ?? detectLocalConflicts(project);
  $: humanConflicts = conflicts.filter((conflict) => conflict.humanRequired);
  $: agentConflicts = conflicts.filter((conflict) => !conflict.humanRequired);
  $: selectedConflicts = selectedCard
    ? conflicts.filter((conflict) => conflict.cardIds.includes(selectedCard.id))
    : [];
  $: visibleCards = selectedTopic
    ? selectedTopic.cardIds
        .map((cardId) => project.cards.find((card) => card.id === cardId))
        .filter((card): card is LogicCard => Boolean(card))
    : project.cards;

  onMount(async () => {
    await refreshPaper();
  });

  async function loadProject() {
    if (!projectRoot.trim()) {
      statusLine = "Set a project root first, or keep editing the demo project.";
      return;
    }
    try {
      project = await invoke<LogicProject>("load_logic_project", {
        projectRoot: projectRoot.trim()
      });
      selectedTopicId = project.topics[0]?.id ?? "";
      selectedCardId = project.cards[0]?.id ?? "";
      statusLine = "Loaded project logic from disk.";
      await refreshPaper();
    } catch (error) {
      statusLine = `Could not load project: ${String(error)}`;
    }
  }

  async function saveProject() {
    if (!projectRoot.trim()) {
      statusLine = "Set a project root before saving to disk.";
      return;
    }
    try {
      await invoke("save_logic_project", {
        projectRoot: projectRoot.trim(),
        project
      });
      statusLine = "Saved JSON and regenerated the readable paper.";
    } catch (error) {
      statusLine = `Could not save project: ${String(error)}`;
    }
  }

  async function refreshConflicts() {
    try {
      backendConflicts = await invoke<ConflictRecord[]>("detect_logic_conflicts", { project });
      statusLine = "Conflict report refreshed.";
    } catch {
      backendConflicts = null;
      statusLine = "Using local conflict detection preview.";
    }
  }

  async function refreshPaper() {
    try {
      paperPreview = await invoke<string>("render_logic_paper", { project });
    } catch {
      paperPreview = renderLocalPaper(project, conflicts);
    }
  }

  async function startAgent(card: LogicCard) {
    if (!projectRoot.trim()) {
      const plan = simulateStart(card);
      const modelNote = await askBrainForCard(card, plan.preflightConflicts);
      agentLog = [
        `Simulated ${plan.branch}`,
        `Worktree ${plan.worktreePath}`,
        `Brain ${selectedModel}: ${modelNote}`,
        ...agentLog
      ];
      statusLine = "Agent start simulated. Set a project root to create real git worktrees.";
      await refreshPaper();
      return;
    }
    try {
      const response = await invoke<StartAgentResponse>("start_card_agent", {
        projectRoot: projectRoot.trim(),
        project,
        cardId: card.id
      });
      project = response.project;
      selectedCardId = response.plan.cardId;
      const modelNote = await askBrainForCard(card, response.plan.preflightConflicts);
      agentLog = [`Brain ${selectedModel}: ${modelNote}`].concat(formatStartResponse(response), agentLog);
      statusLine = response.outcomes.every((outcome) => outcome.ok)
        ? "Agent worktree started."
        : "Git command failed; review agent activity before continuing.";
      await refreshPaper();
    } catch (error) {
      statusLine = `Agent could not start: ${String(error)}`;
    }
  }

  async function refreshModelHealth() {
    modelMessage = "Checking Ollama...";
    try {
      const health = await checkOllama(modelBaseUrl, modelChoice, customModel);
      selectedModel = health.selectedModel;
      modelOnline = true;
      modelMessage = health.installed
        ? `Online: ${health.selectedModel}`
        : `Ollama online, but ${health.selectedModel} is missing. ${installHint(health.selectedModel)}`;
    } catch (error) {
      modelOnline = false;
      selectedModel = modelFromChoice(modelChoice, customModel);
      modelMessage = `Offline: ${installHint(selectedModel)}`;
      agentLog = [`Brain offline: ${(error as Error).message}`, ...agentLog];
    }
  }

  async function askBrainForCard(card: LogicCard, preflightConflicts: ConflictRecord[]) {
    if (!modelOnline) {
      return "Brain not connected; simulated planning only.";
    }
    try {
      return await askOllama(
        modelBaseUrl,
        selectedModel,
        buildCardAgentMessages(card, preflightConflicts)
      );
    } catch (error) {
      modelOnline = false;
      return `Brain call failed: ${(error as Error).message}`;
    }
  }

  async function openInVsCode(card?: LogicCard) {
    try {
      await invoke("open_in_vscode", {
        projectRoot: projectRoot.trim(),
        filePath: card?.linkedFiles[0] ?? null,
        worktreePath: card?.worktreePath ?? null
      });
      statusLine = card ? `Opened ${card.title} in VS Code.` : "Opened project in VS Code.";
    } catch (error) {
      statusLine = `Could not open VS Code: ${String(error)}`;
    }
  }

  function setSelectedCard(cardId: string) {
    selectedCardId = cardId;
    const topic = project.topics.find((candidate) => candidate.cardIds.includes(cardId));
    if (topic) {
      selectedTopicId = topic.id;
    }
  }

  function updateCard(cardId: string, patch: Partial<LogicCard>) {
    backendConflicts = null;
    project = {
      ...project,
      cards: project.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card))
    };
    void refreshPaper();
  }

  function updateModelChoice(value: string) {
    modelChoice = value;
    selectedModel = modelFromChoice(modelChoice, customModel);
    modelOnline = false;
    modelMessage = `Selected ${selectedModel}. Check brain to verify Ollama.`;
  }

  function updateCustomModel(value: string) {
    customModel = value;
    selectedModel = modelFromChoice(modelChoice, customModel);
  }

  function updateLinkedFiles(card: LogicCard, value: string) {
    updateCard(card.id, { linkedFiles: parseList(value) });
  }

  function updateDependencies(card: LogicCard, value: string) {
    updateCard(card.id, { dependencies: parseList(value) });
  }

  function parseList(value: string) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function simulateStart(card: LogicCard): AgentWorkPlan {
    const slug = slugify(card.title);
    const branch = `open-code/card/${card.id}-${slug}`;
    const worktreePath = `.open-code/worktrees/${card.id}-${slug}`;
    project = {
      ...project,
      cards: project.cards.map((candidate) =>
        candidate.id === card.id
          ? {
              ...candidate,
              status: "running",
              implementationBranch: branch,
              worktreePath,
              conflicts: conflicts.filter((conflict) => conflict.cardIds.includes(card.id))
            }
          : candidate
      )
    };
    return {
      cardId: card.id,
      branch,
      worktreePath,
      linkedFiles: card.linkedFiles,
      summary: card.summary,
      preflightConflicts: selectedConflicts
    };
  }

  function formatStartResponse(response: StartAgentResponse) {
    const commandText = response.commands.map(formatCommand);
    const outcomeText = response.outcomes.map(
      (outcome) => `${outcome.ok ? "ok" : "failed"}: ${formatCommand(outcome.command)}`
    );
    return [`Started ${response.plan.branch}`, ...commandText, ...outcomeText];
  }

  function formatCommand(command: GitCommandPlan) {
    return `${command.program} ${command.args.join(" ")}`;
  }

  function detectLocalConflicts(value: LogicProject): ConflictRecord[] {
    const active = value.cards.filter(
      (card) => !["draft", "merged", "blocked"].includes(card.status)
    );
    const byFile = new Map<string, string[]>();
    for (const card of active) {
      for (const file of card.linkedFiles) {
        const normalized = file.trim().replaceAll("\\", "/");
        if (!normalized) continue;
        byFile.set(normalized, [...(byFile.get(normalized) ?? []), card.id]);
      }
    }

    const output: ConflictRecord[] = [];
    for (const [file, cardIds] of byFile) {
      const uniqueIds = [...new Set(cardIds)].sort();
      if (uniqueIds.length > 1) {
        output.push({
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

    const cardIds = new Set(value.cards.map((card) => card.id));
    for (const card of value.cards) {
      for (const dependency of card.dependencies) {
        if (!cardIds.has(dependency)) {
          output.push({
            id: `missing-dependency-${card.id}-${dependency}`,
            kind: "missing_dependency",
            cardIds: [card.id, dependency],
            reason: `${card.id} depends on missing card ${dependency}.`,
            humanRequired: true,
            status: "human_review"
          });
        }
      }
    }

    for (const link of value.links) {
      if (link.kind === "conflicts_with" || link.kind === "redundant_with") {
        output.push({
          id: `${link.kind}-${link.from}-${link.to}`,
          kind: link.kind === "conflicts_with" ? "logic_conflict" : "redundancy",
          cardIds: [link.from, link.to].sort(),
          reason: link.reason || "Cards need a human logic decision.",
          humanRequired: true,
          status: "human_review"
        });
      }
    }

    return output.sort((a, b) => a.id.localeCompare(b.id));
  }

  function renderLocalPaper(value: LogicProject, report: ConflictRecord[]) {
    const lines = [`# ${value.project.title}`, "", value.project.summary, ""];
    if (report.length > 0) {
      lines.push("## Conflict Review", "");
      for (const conflict of report) {
        lines.push(
          `- ${conflict.humanRequired ? "Human" : "Agent"}: ${conflict.reason} (${conflict.cardIds.join(", ")})`
        );
      }
      lines.push("");
    }
    for (const topic of value.topics) {
      lines.push(`## ${topic.title}`, "", topic.summary, "");
      for (const cardId of topic.cardIds) {
        const card = value.cards.find((candidate) => candidate.id === cardId);
        if (!card) continue;
        lines.push(`### ${card.title} \`${card.id}\``, "");
        lines.push(`**Summary:** ${card.summary}`, "");
        lines.push(`**Status:** \`${card.status}\``, "");
        if (card.linkedFiles.length) {
          lines.push(`**Linked files:** ${card.linkedFiles.map((file) => `\`${file}\``).join(", ")}`, "");
        }
        lines.push(card.details, "");
      }
    }
    return lines.join("\n");
  }

  function slugify(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "logic"
    );
  }

  function conflictTone(status: ConflictStatus) {
    return status === "agent_merge_pending" ? "agent" : "human";
  }
</script>

<svelte:head>
  <title>Open Code Logic Workspace</title>
</svelte:head>

<main class="workspace">
  <header class="topbar">
    <section class="identity">
      <div class="mark">OC</div>
      <div>
        <p class="eyebrow">Logic-first workspace</p>
        <h1>{project.project.title}</h1>
      </div>
    </section>
    <section class="project-actions" aria-label="Project actions">
      <input
        aria-label="Project root"
        bind:value={projectRoot}
        placeholder="/path/to/project"
      />
      <button type="button" on:click={loadProject}>Load</button>
      <button type="button" on:click={saveProject}>Save</button>
      <button type="button" on:click={() => openInVsCode()}>VS Code</button>
    </section>
  </header>

  <section class="status-strip">
    <span>{statusLine}</span>
    <button type="button" on:click={refreshConflicts}>Check conflicts</button>
    <button type="button" on:click={refreshPaper}>Refresh paper</button>
  </section>

  <section class="model-panel" aria-label="Agent brain">
    <div>
      <p class="eyebrow">Agent brain</p>
      <h2>Google Gemma via Ollama</h2>
    </div>
    <label>
      Mode
      <select value={modelChoice} on:change={(event) => updateModelChoice(event.currentTarget.value)}>
        {#each MODEL_CHOICES as choice}
          <option value={choice.id}>{choice.label}</option>
        {/each}
      </select>
    </label>
    <label>
      Ollama URL
      <input
        value={modelBaseUrl}
        on:input={(event) => {
          modelBaseUrl = event.currentTarget.value;
          modelOnline = false;
          modelMessage = "Ollama URL changed. Check brain again.";
        }}
      />
    </label>
    <label>
      Custom model
      <input
        placeholder="gemma3:4b"
        value={customModel}
        on:input={(event) => updateCustomModel(event.currentTarget.value)}
      />
    </label>
    <button type="button" on:click={refreshModelHealth}>Check brain</button>
    <div class:online={modelOnline} class:offline={!modelOnline && modelMessage !== "Not checked"} class="model-status">
      {modelMessage}
    </div>
  </section>

  <section class="layout">
    <aside class="topics" aria-label="Topics">
      <div class="panel-title">
        <span>Topics</span>
        <span>{project.topics.length}</span>
      </div>
      {#each project.topics as topic}
        <button
          type="button"
          class:active={topic.id === selectedTopicId}
          on:click={() => (selectedTopicId = topic.id)}
        >
          <strong>{topic.title}</strong>
          <span>{topic.cardIds.length} cards</span>
        </button>
      {/each}

      <div class="agent-pulse">
        <span>Running agents</span>
        <strong>{project.cards.filter((card) => card.status === "running").length}</strong>
      </div>
    </aside>

    <section class="logic-flow" aria-label="Logic card flow">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Paper flow</p>
          <h2>{selectedTopic?.title ?? "All Logic"}</h2>
        </div>
        <button type="button" on:click={() => (showConflictReview = !showConflictReview)}>
          {showConflictReview ? "Hide conflicts" : "Show conflicts"}
        </button>
      </div>

      {#if showConflictReview && conflicts.length > 0}
        <section class="conflict-review" aria-label="Conflict review">
          <div class="review-column human">
            <h3>Human Logic Review</h3>
            {#if humanConflicts.length === 0}
              <p>No human-gated logic conflicts.</p>
            {:else}
              {#each humanConflicts as conflict}
                <button type="button" class="conflict-row" on:click={() => setSelectedCard(conflict.cardIds[0])}>
                  <span>{conflict.kind.replaceAll("_", " ")}</span>
                  <strong>{conflict.cardIds.join(" + ")}</strong>
                  <small>{conflict.reason}</small>
                </button>
              {/each}
            {/if}
          </div>
          <div class="review-column agent">
            <h3>Agent Merge Work</h3>
            {#if agentConflicts.length === 0}
              <p>No code overlaps waiting for merge agents.</p>
            {:else}
              {#each agentConflicts as conflict}
                <button type="button" class="conflict-row" on:click={() => setSelectedCard(conflict.cardIds[0])}>
                  <span>{conflict.file ?? "code overlap"}</span>
                  <strong>{conflict.cardIds.join(" + ")}</strong>
                  <small>{conflict.reason}</small>
                </button>
              {/each}
            {/if}
          </div>
        </section>
      {/if}

      <div class="cards">
        {#each visibleCards as card, index}
          <article
            class:selected={card.id === selectedCardId}
            class:running={card.status === "running"}
            class:blocked={card.status === "needs_human_logic_review"}
            class="logic-card"
          >
            <button type="button" class="card-body" on:click={() => setSelectedCard(card.id)}>
              <div class="card-topline">
                <span class="step">{index + 1}</span>
                <span class="status">{card.status.replaceAll("_", " ")}</span>
              </div>
              <h3>{card.title}</h3>
              <p>{card.summary}</p>
              <div class="meta-row">
                <span>{card.linkedFiles.length} files</span>
                <span>{card.dependencies.length} deps</span>
                {#if conflicts.some((conflict) => conflict.cardIds.includes(card.id))}
                  <span class="warn">conflict</span>
                {/if}
              </div>
              {#if card.implementationBranch}
                <code>{card.implementationBranch}</code>
              {/if}
            </button>
            <div class="card-actions">
              <button type="button" on:click={() => startAgent(card)}>Run agent</button>
              <button type="button" on:click={() => openInVsCode(card)}>VS Code</button>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <aside class="inspector" aria-label="Selected logic card">
      {#if selectedCard}
        <div class="panel-title">
          <span>Card Inspector</span>
          <span>{selectedCard.id}</span>
        </div>

        <label>
          Title
          <input
            value={selectedCard.title}
            on:input={(event) =>
              updateCard(selectedCard.id, { title: event.currentTarget.value })}
          />
        </label>
        <label>
          Minimum summary
          <textarea
            rows="3"
            value={selectedCard.summary}
            on:input={(event) =>
              updateCard(selectedCard.id, { summary: event.currentTarget.value })}
          />
        </label>
        <label>
          Design details
          <textarea
            rows="9"
            value={selectedCard.details}
            on:input={(event) =>
              updateCard(selectedCard.id, { details: event.currentTarget.value })}
          />
        </label>
        <label>
          Status
          <select
            value={selectedCard.status}
            on:change={(event) =>
              updateCard(selectedCard.id, { status: event.currentTarget.value as LogicCard["status"] })}
          >
            <option value="draft">draft</option>
            <option value="ready">ready</option>
            <option value="running">running</option>
            <option value="needs_human_logic_review">needs human logic review</option>
            <option value="ready_to_merge">ready to merge</option>
            <option value="merged">merged</option>
            <option value="blocked">blocked</option>
          </select>
        </label>
        <label>
          Linked files
          <textarea
            rows="3"
            value={selectedCard.linkedFiles.join(", ")}
            on:input={(event) => updateLinkedFiles(selectedCard, event.currentTarget.value)}
          />
        </label>
        <label>
          Dependencies
          <textarea
            rows="2"
            value={selectedCard.dependencies.join(", ")}
            on:input={(event) => updateDependencies(selectedCard, event.currentTarget.value)}
          />
        </label>

        {#if selectedCard.implementationBranch}
          <section class="branch-box">
            <span>Branch</span>
            <code>{selectedCard.implementationBranch}</code>
            {#if selectedCard.worktreePath}
              <span>Worktree</span>
              <code>{selectedCard.worktreePath}</code>
            {/if}
          </section>
        {/if}

        <section class="selected-conflicts">
          <h3>Conflict report</h3>
          {#if selectedConflicts.length === 0}
            <p>No conflicts for this card.</p>
          {:else}
            {#each selectedConflicts as conflict}
              <div class:human={conflictTone(conflict.status) === "human"} class="mini-conflict">
                <strong>{conflict.kind.replaceAll("_", " ")}</strong>
                <span>{conflict.humanRequired ? "human decision" : "merge agent"}</span>
                <p>{conflict.reason}</p>
              </div>
            {/each}
          {/if}
        </section>
      {:else}
        <p>Select a card to edit its logic.</p>
      {/if}
    </aside>
  </section>

  <section class="bottom">
    <article class="paper-preview">
      <div class="panel-title">
        <span>Generated Paper</span>
        <span>Markdown</span>
      </div>
      <pre>{paperPreview}</pre>
    </article>
    <article class="agent-log">
      <div class="panel-title">
        <span>Agent Activity</span>
        <span>{agentLog.length}</span>
      </div>
      {#if agentLog.length === 0}
        <p>No agent activity yet.</p>
      {:else}
        {#each agentLog as line}
          <code>{line}</code>
        {/each}
      {/if}
    </article>
  </section>
</main>
