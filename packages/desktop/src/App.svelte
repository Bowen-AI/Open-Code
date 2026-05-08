<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { sampleProject } from "./lib/sampleProject";
  import {
    DEFAULT_MODEL,
    MODEL_CHOICES,
    OLLAMA_BASE_URL,
    askOllama,
    buildCardAgentEditMessages,
    buildCardAgentMessages,
    checkOllama,
    installHint,
    modelFromChoice,
    parseStructuredAgentEditResponse
  } from "./lib/models";
  import type {
    AgentFileEdit,
    AgentLinkedFile,
    AgentReviewDisposition,
    AgentWorkPlan,
    ConflictRecord,
    ConflictStatus,
    GitCommandPlan,
    LogicCard,
    LogicProject,
    AgentRun,
    AgentRunInput,
    RecordAgentRunResponse,
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
  let selectedRun: AgentRun | undefined;

  interface ActiveAgentRequest {
    token: string;
    controller: AbortController;
    startedAt: string;
  }

  let activeAgentRequests = new Map<string, ActiveAgentRequest>();

  $: selectedTopic = project.topics.find((topic) => topic.id === selectedTopicId);
  $: selectedCard = project.cards.find((card) => card.id === selectedCardId);
  $: conflicts = backendConflicts ?? detectLocalConflicts(project);
  $: humanConflicts = conflicts.filter((conflict) => conflict.humanRequired);
  $: agentConflicts = conflicts.filter((conflict) => !conflict.humanRequired);
  $: selectedConflicts = selectedCard
    ? conflicts.filter((conflict) => conflict.cardIds.includes(selectedCard.id))
    : [];
  $: selectedRun = selectedCard ? latestAgentRun(selectedCard) : undefined;
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
      const startLines = formatStartResponse(response);
      if (!response.outcomes.every((outcome) => outcome.ok)) {
        agentLog = [...startLines, ...agentLog];
        statusLine = "Git command failed; review agent activity before continuing.";
        await refreshPaper();
        return;
      }
      const startedAt = new Date().toISOString();
      const activeRequest = beginAgentRequest(response.plan.cardId, startedAt);
      try {
        const run = await runStructuredWorker(
          card,
          response.plan,
          startedAt,
          activeRequest.controller.signal
        );
        if (!isActiveAgentRequest(response.plan.cardId, activeRequest.token)) {
          agentLog = [
            `Ignored late worker result for ${response.plan.cardId}; cancellation is authoritative.`,
            ...startLines,
            ...agentLog
          ];
          statusLine = `${card.title} cancellation was already recorded; late model output was ignored.`;
          await refreshPaper();
          return;
        }
        project = run.project;
        agentLog = [
          `Worker run ${run.run.id}: ${run.run.status ?? "notes_only"}`,
          `Recorded ${run.run.proposedChanges.length} scoped proposed change(s)`,
          ...startLines,
          ...agentLog
        ];
        statusLine =
          run.run.status === "ready_for_review"
            ? "Agent applied structured edits in the card worktree; review before merging."
            : run.run.status === "failed"
              ? "Agent worker failed while applying structured edits; inspect the latest run diagnostics."
              : "Agent worktree started; no reviewable file edits were applied.";
        await refreshPaper();
      } catch (error) {
        if (isAbortError(error) || activeRequest.controller.signal.aborted) {
          agentLog = [
            `Stopped in-flight worker for ${response.plan.cardId}; late model output cannot update the card.`,
            ...startLines,
            ...agentLog
          ];
          statusLine = `${card.title} cancellation requested; in-flight model work stopped.`;
          await refreshPaper();
          return;
        }
        throw error;
      } finally {
        clearActiveAgentRequest(response.plan.cardId, activeRequest.token);
      }
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

  async function runStructuredWorker(
    card: LogicCard,
    plan: AgentWorkPlan,
    startedAt: string,
    signal: AbortSignal
  ): Promise<RecordAgentRunResponse> {
    if (!modelOnline) {
      const finishedAt = new Date().toISOString();
      return recordAgentRun(
        plan,
        buildAgentRunInput(
          card,
          plan,
          "Brain not connected; structured edits were not attempted.",
          startedAt,
          finishedAt,
          "notes_only",
          [
            {
              level: "warn",
              message: `Offline brain: ${installHint(selectedModel)}`
            }
          ],
          "simulated_note"
        )
      );
    }

    throwIfAgentCancelled(signal);

    let files: AgentLinkedFile[];
    try {
      files = await invoke<AgentLinkedFile[]>("read_card_agent_files", {
        projectRoot: projectRoot.trim(),
        project,
        plan
      });
    } catch (error) {
      const finishedAt = new Date().toISOString();
      return recordAgentRun(
        plan,
        buildAgentRunInput(
          card,
          plan,
          `Could not read linked files from the card worktree: ${String(error)}`,
          startedAt,
          finishedAt,
          "notes_only",
          [{ level: "error", message: String(error) }],
          "model_note"
        )
      );
    }

    throwIfAgentCancelled(signal);

    let rawResponse = "";
    try {
      rawResponse = await askOllama(
        modelBaseUrl,
        selectedModel,
        buildCardAgentEditMessages(card, plan.preflightConflicts, files),
        { signal }
      );
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        throw error;
      }
      modelOnline = false;
      const finishedAt = new Date().toISOString();
      return recordAgentRun(
        plan,
        buildAgentRunInput(
          card,
          plan,
          `Brain call failed before structured edits were generated: ${(error as Error).message}`,
          startedAt,
          finishedAt,
          "notes_only",
          [{ level: "error", message: (error as Error).message }],
          "model_note"
        )
      );
    }

    throwIfAgentCancelled(signal);

    let parsed: { note: string; edits: AgentFileEdit[] };
    try {
      parsed = parseStructuredAgentEditResponse(
        rawResponse,
        files.map((file) => file.file)
      );
    } catch (error) {
      const finishedAt = new Date().toISOString();
      return recordAgentRun(
        plan,
        buildAgentRunInput(
          card,
          plan,
          `Structured worker response could not be used: ${(error as Error).message}`,
          startedAt,
          finishedAt,
          "notes_only",
          [{ level: "error", message: (error as Error).message }],
          "model_note"
        )
      );
    }

    const finishedAt = new Date().toISOString();
    if (parsed.edits.length === 0) {
      return recordAgentRun(
        plan,
        buildAgentRunInput(card, plan, parsed.note, startedAt, finishedAt, "notes_only", [
          { level: "info", message: "Structured worker returned no file edits." }
        ])
      );
    }

    throwIfAgentCancelled(signal);

    const run = buildAgentRunInput(card, plan, parsed.note, startedAt, finishedAt, "started", [
      {
        level: "info",
        message: `Structured worker generated ${parsed.edits.length} file edit(s).`
      }
    ], "model");
    try {
      throwIfAgentCancelled(signal);
      const response = await invoke<RecordAgentRunResponse>("apply_card_agent_edits", {
        projectRoot: projectRoot.trim(),
        project,
        plan,
        run,
        edits: parsed.edits
      });
      throwIfAgentCancelled(signal);
      return response;
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        throw error;
      }
      return recordAgentRun(
        plan,
        buildAgentRunInput(
          card,
          plan,
          `Structured edit application failed: ${String(error)}`,
          startedAt,
          new Date().toISOString(),
          "failed",
          [{ level: "error", message: String(error) }]
        )
      );
    }
  }

  async function recordAgentRun(plan: AgentWorkPlan, run: AgentRunInput) {
    return invoke<RecordAgentRunResponse>("record_card_agent_run", {
      projectRoot: projectRoot.trim(),
      project,
      plan,
      run
    });
  }

  async function finalizeAgentReview(card: LogicCard, disposition: AgentReviewDisposition) {
    if (!projectRoot.trim()) {
      statusLine = "Set a project root before closing out an agent review.";
      return;
    }
    try {
      const response = await invoke<RecordAgentRunResponse>("finalize_card_agent_review", {
        projectRoot: projectRoot.trim(),
        project,
        cardId: card.id,
        disposition,
        reviewedAt: new Date().toISOString()
      });
      project = response.project;
      selectedCardId = card.id;
      const action = disposition === "merged" ? "merged" : "rejected";
      agentLog = [
        `Review ${action}: ${card.id} (${response.run.proposedChanges.length} change(s))`,
        ...agentLog
      ];
      statusLine =
        disposition === "merged"
          ? `${card.title} branch merged; generated paper updated.`
          : `${card.title} rejected; worktree remains for inspection.`;
      await refreshPaper();
    } catch (error) {
      statusLine = `Could not close agent review: ${String(error)}`;
    }
  }

  async function cancelAgent(card: LogicCard) {
    const stoppedActiveRequest = abortActiveAgentRequest(card.id);
    if (!projectRoot.trim()) {
      const cancelledAt = new Date().toISOString();
      const run: AgentRun = {
        id: `run-${card.id}-${Date.now()}`,
        at: cancelledAt,
        model: "system",
        mode: "manual_cancel",
        status: "cancelled",
        promptSummary: "",
        note: "Simulated running card agent was cancelled before reviewable edits were produced.",
        startedAt: null,
        finishedAt: cancelledAt,
        branch: card.implementationBranch ?? null,
        worktreePath: card.worktreePath ?? null,
        diagnostics: [
          {
            level: "warn",
            message: "Simulated cancellation preserved branch/worktree metadata in project state."
          }
        ],
        proposedChanges: [],
        preflightConflicts: card.conflicts ?? []
      };
      updateCard(card.id, {
        status: "blocked",
        agentRuns: [...(card.agentRuns ?? []), run]
      });
      agentLog = [
        `Cancelled simulated run for ${card.id}; no project-root worktree was created.`,
        ...(stoppedActiveRequest ? [`Stopped in-flight model request for ${card.id}.`] : []),
        ...agentLog
      ];
      statusLine = "Simulated agent run cancelled.";
      return;
    }
    try {
      const response = await invoke<RecordAgentRunResponse>("cancel_card_agent", {
        projectRoot: projectRoot.trim(),
        project,
        cardId: card.id,
        cancelledAt: new Date().toISOString(),
        reason: "User cancelled the running card agent before reviewable edits were produced."
      });
      project = response.project;
      selectedCardId = card.id;
      agentLog = [
        `Cancelled ${card.id}; branch/worktree metadata preserved for inspection.`,
        ...(stoppedActiveRequest ? [`Stopped in-flight model request for ${card.id}.`] : []),
        ...agentLog
      ];
      statusLine = `${card.title} cancelled; inspect or reset the card before rerunning.`;
      await refreshPaper();
    } catch (error) {
      statusLine = `Could not cancel agent: ${String(error)}`;
    }
  }

  async function resetAgentWork(card: LogicCard) {
    if (!isResettable(card)) {
      statusLine = "Only blocked cards with a rejected, failed, or cancelled worker run can be reset.";
      return;
    }
    const resetAt = new Date().toISOString();
    if (!projectRoot.trim()) {
      const run: AgentRun = {
        id: `run-${card.id}-${Date.now()}`,
        at: resetAt,
        model: "system",
        mode: "manual_reset",
        status: "abandoned",
        promptSummary: "",
        note: "Simulated blocked agent work was reset for a clean retry.",
        startedAt: null,
        finishedAt: resetAt,
        branch: card.implementationBranch ?? latestAgentRun(card)?.branch ?? null,
        worktreePath: card.worktreePath ?? latestAgentRun(card)?.worktreePath ?? null,
        diagnostics: [
          {
            level: "info",
            message: "Previous branch/worktree metadata was preserved in this audit run."
          }
        ],
        proposedChanges: [],
        preflightConflicts: card.conflicts ?? []
      };
      updateCard(card.id, {
        status: "ready",
        implementationBranch: null,
        worktreePath: null,
        conflicts: [],
        agentRuns: [...(card.agentRuns ?? []), run]
      });
      agentLog = [`Reset ${card.id} for retry in preview state.`, ...agentLog];
      statusLine = `${card.title} reset for retry.`;
      return;
    }
    try {
      const response = await invoke<RecordAgentRunResponse>("reset_card_agent_work", {
        projectRoot: projectRoot.trim(),
        project,
        cardId: card.id,
        resetAt,
        reason: "User reset blocked agent work for a clean retry."
      });
      project = response.project;
      selectedCardId = card.id;
      agentLog = [
        `Reset ${card.id} for retry; previous branch/worktree recorded in ${response.run.id}.`,
        ...agentLog
      ];
      statusLine = `${card.title} reset for retry.`;
      await refreshPaper();
    } catch (error) {
      statusLine = `Could not reset agent work: ${String(error)}`;
    }
  }

  function buildAgentRunInput(
    card: LogicCard,
    plan: AgentWorkPlan,
    note: string,
    startedAt: string,
    finishedAt: string,
    status: AgentRunInput["status"] = "notes_only",
    diagnostics: NonNullable<AgentRunInput["diagnostics"]> = [
      {
        level: "info",
        message: "Production path recorded an implementation note without file edits."
      }
    ],
    mode = modelOnline ? "model_note" : "simulated_note"
  ): AgentRunInput {
    const promptSummary = [
      `Card ${card.id}: ${card.summary}`,
      `Files: ${plan.linkedFiles.join(", ") || "none"}`,
      `Dependencies: ${card.dependencies.join(", ") || "none"}`,
      `Preflight conflicts: ${plan.preflightConflicts.length}`
    ].join(" | ");
    return {
      id: `run-${card.id}-${Date.now()}`,
      model: selectedModel,
      mode,
      status,
      promptSummary,
      note,
      startedAt,
      finishedAt,
      diagnostics
    };
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

  function latestAgentRun(card: LogicCard) {
    return card.agentRuns?.[card.agentRuns.length - 1];
  }

  function beginAgentRequest(cardId: string, startedAt: string): ActiveAgentRequest {
    const existing = activeAgentRequests.get(cardId);
    existing?.controller.abort();
    const request = {
      token: `${cardId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      controller: new AbortController(),
      startedAt
    };
    activeAgentRequests = new Map(activeAgentRequests);
    activeAgentRequests.set(cardId, request);
    return request;
  }

  function abortActiveAgentRequest(cardId: string) {
    const request = activeAgentRequests.get(cardId);
    if (!request) {
      return false;
    }
    request.controller.abort();
    activeAgentRequests = new Map(activeAgentRequests);
    activeAgentRequests.delete(cardId);
    return true;
  }

  function clearActiveAgentRequest(cardId: string, token: string) {
    if (activeAgentRequests.get(cardId)?.token !== token) {
      return;
    }
    activeAgentRequests = new Map(activeAgentRequests);
    activeAgentRequests.delete(cardId);
  }

  function isActiveAgentRequest(cardId: string, token: string) {
    return activeAgentRequests.get(cardId)?.token === token;
  }

  function throwIfAgentCancelled(signal: AbortSignal) {
    if (!signal.aborted) {
      return;
    }
    const error = new Error("Agent worker was cancelled.");
    error.name = "AbortError";
    throw error;
  }

  function isAbortError(error: unknown) {
    return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
  }

  function isReviewable(card: LogicCard) {
    const run = latestAgentRun(card);
    return card.status === "ready_to_merge" && (run?.status ?? "ready_for_review") === "ready_for_review";
  }

  function isResettable(card: LogicCard) {
    const run = latestAgentRun(card);
    return (
      card.status === "blocked" &&
      (run?.status === "cancelled" || run?.status === "failed" || run?.status === "rejected")
    );
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
              {#if isReviewable(card)}
                <button type="button" on:click={() => finalizeAgentReview(card, "merged")}>Merge branch</button>
                <button type="button" on:click={() => finalizeAgentReview(card, "rejected")}>Reject run</button>
              {/if}
              {#if card.status === "running"}
                <button type="button" on:click={() => cancelAgent(card)}>Cancel run</button>
              {/if}
              {#if isResettable(card)}
                <button type="button" on:click={() => resetAgentWork(card)}>Reset for retry</button>
              {/if}
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
          ></textarea>
        </label>
        <label>
          Design details
          <textarea
            rows="9"
            value={selectedCard.details}
            on:input={(event) =>
              updateCard(selectedCard.id, { details: event.currentTarget.value })}
          ></textarea>
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
          ></textarea>
        </label>
        <label>
          Dependencies
          <textarea
            rows="2"
            value={selectedCard.dependencies.join(", ")}
            on:input={(event) => updateDependencies(selectedCard, event.currentTarget.value)}
          ></textarea>
        </label>

        {#if selectedCard.implementationBranch}
          <section class="branch-box">
            <span>Branch</span>
            <code>{selectedCard.implementationBranch}</code>
            {#if selectedCard.worktreePath}
              <span>Worktree</span>
              <code>{selectedCard.worktreePath}</code>
            {/if}
            {#if selectedCard.status === "running"}
              <button type="button" on:click={() => cancelAgent(selectedCard)}>Cancel run</button>
            {/if}
            {#if isResettable(selectedCard)}
              <button type="button" on:click={() => resetAgentWork(selectedCard)}>Reset for retry</button>
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

        {#if selectedRun}
          <section class="latest-run">
            <h3>Latest agent run</h3>
            <div class="run-meta">
              <span>{selectedRun.status ?? "ready_for_review"}</span>
              <span>{selectedRun.mode}</span>
            </div>
            <p>{selectedRun.note}</p>
            {#if selectedRun.promptSummary}
              <code>{selectedRun.promptSummary}</code>
            {/if}
            {#if selectedRun.branch}
              <code>{selectedRun.branch}</code>
            {/if}
            {#if isReviewable(selectedCard)}
              <div class="review-actions" aria-label="Agent review actions">
                <button type="button" on:click={() => finalizeAgentReview(selectedCard, "merged")}>
                  Merge branch
                </button>
                <button type="button" on:click={() => finalizeAgentReview(selectedCard, "rejected")}>
                  Reject run
                </button>
              </div>
            {/if}
            {#if isResettable(selectedCard)}
              <div class="review-actions" aria-label="Agent retry actions">
                <button type="button" on:click={() => resetAgentWork(selectedCard)}>
                  Reset for retry
                </button>
              </div>
            {/if}
            {#each selectedRun.diagnostics ?? [] as diagnostic}
              <div class="run-diagnostic">
                <span>{diagnostic.level}</span>
                <p>{diagnostic.message}</p>
              </div>
            {/each}
            {#each selectedRun.proposedChanges ?? [] as change}
              <div class="proposed-change">
                <code>{change.file}</code>
                <span>{change.status}</span>
                <p>{change.summary}</p>
                {#if (change.hunks ?? []).length > 0}
                  <div class="review-hunks" aria-label={`Review hunks for ${change.file}`}>
                    {#each change.hunks ?? [] as hunk}
                      <div class="review-hunk">
                        <span>{hunk.status}</span>
                        <code>{hunk.id}</code>
                        <p>
                          old {hunk.oldStartLine}:{hunk.oldLineCount} · new {hunk.newStartLine}:{hunk.newLineCount}
                        </p>
                        <small>{hunk.summary}</small>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </section>
        {/if}
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
