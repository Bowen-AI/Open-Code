import {
  cardsForTopic,
  cancelAgentRun,
  cloneProject,
  completeAgentRun,
  detectConflicts,
  DOC_PRESENTATIONS,
  latestAgentRun,
  markCardMerged,
  renderDocumentation,
  resetAgentWork,
  resolveHumanConflict,
  sampleProject,
  startAgent,
  statusLabel,
  updateCard
} from "./logic.js";
import {
  DEFAULT_MODEL,
  MODEL_CHOICES,
  OLLAMA_BASE_URL,
  askOllama,
  buildCardAgentMessages,
  checkOllama,
  installHint,
  modelFromChoice
} from "./models.js";

const STORAGE_KEY = "open-code.logic-preview.v1";

const storedState = loadStoredState();
let project = ensureProjectShape(storedState?.project || cloneProject(sampleProject));
let selectedTopicId = storedState?.selectedTopicId || project.topics[0].id;
let selectedCardId = storedState?.selectedCardId || project.cards[0].id;
let docMode = storedState?.docMode || "paper";
let showConflicts = true;
let activity = storedState?.activity || [];
let activeAgentRequests = new Map();
let modelState = {
  baseUrl: OLLAMA_BASE_URL,
  choice: "auto",
  customModel: "",
  selectedModel: DEFAULT_MODEL,
  online: false,
  installed: false,
  installedModels: [],
  message: "Not checked"
};

const nodes = {
  title: document.querySelector("#project-title"),
  status: document.querySelector("#status-line"),
  counts: document.querySelector("#counts-line"),
  modelChoice: document.querySelector("#model-choice"),
  modelBaseUrl: document.querySelector("#model-base-url"),
  customModel: document.querySelector("#custom-model"),
  modelStatus: document.querySelector("#model-status"),
  topicCount: document.querySelector("#topic-count"),
  topicList: document.querySelector("#topic-list"),
  runningCount: document.querySelector("#running-count"),
  topicHeading: document.querySelector("#topic-heading"),
  conflictReview: document.querySelector("#conflict-review"),
  cardGrid: document.querySelector("#card-grid"),
  selectedId: document.querySelector("#selected-id"),
  form: document.querySelector("#inspector-form"),
  selectedConflicts: document.querySelector("#selected-conflicts"),
  docMode: document.querySelector("#doc-mode"),
  docFormat: document.querySelector("#doc-format"),
  paper: document.querySelector("#paper-output"),
  activityCount: document.querySelector("#activity-count"),
  activityLog: document.querySelector("#activity-log")
};

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const cardId = target.dataset.cardId;
  const topicId = target.dataset.topicId;

  if (action === "select-topic") {
    selectedTopicId = topicId;
    const topic = project.topics.find((item) => item.id === topicId);
    selectedCardId = topic?.cardIds[0] || selectedCardId;
    setStatus(`Selected topic ${topic?.title || topicId}.`);
  }

  if (action === "select-card") {
    selectedCardId = cardId;
    setStatus(`Selected card ${cardId}.`);
  }

  if (action === "run-agent") {
    runAgent(cardId);
  }

  if (action === "merge-card") {
    mergeCard(cardId);
  }

  if (action === "cancel-agent") {
    cancelAgent(cardId);
  }

  if (action === "reset-agent") {
    resetAgent(cardId);
  }

  if (action === "open-card") {
    const card = findCard(cardId);
    const targetFile = card?.linkedFiles[0] || "project root";
    activity = [`VS Code handoff simulated for ${targetFile}`, ...activity];
    setStatus("Preview simulated the VS Code handoff. Tauri runs the real command.");
  }

  if (action === "reset") {
    project = cloneProject(sampleProject);
    selectedTopicId = project.topics[0].id;
    selectedCardId = project.cards[0].id;
    activity = [];
    localStorage.removeItem(STORAGE_KEY);
    setStatus("Demo reset.");
  }

  if (action === "paper") {
    docMode = "paper";
    setStatus("Readable paper presentation selected.");
  }

  if (action === "vscode") {
    activity = ["VS Code project handoff simulated.", ...activity];
    setStatus("Preview simulated opening the project in VS Code.");
  }

  if (action === "toggle-conflicts") {
    showConflicts = !showConflicts;
    setStatus(showConflicts ? "Conflict review shown." : "Conflict review hidden.");
  }

  if (action === "check-model") {
    void refreshModelHealth();
  }

  if (action === "resolve-conflict") {
    resolveConflict(target.dataset.conflictId, "resolve-link");
  }

  if (action === "obsolete-conflict") {
    resolveConflict(target.dataset.conflictId, "mark-other-obsolete");
  }

  render();
});

nodes.modelChoice.innerHTML = MODEL_CHOICES.map(
  (choice) => `<option value="${choice.id}">${choice.label}</option>`
).join("");
nodes.docMode.innerHTML = DOC_PRESENTATIONS.map(
  (presentation) => `<option value="${presentation.id}">${presentation.label}</option>`
).join("");
nodes.modelChoice.value = modelState.choice;
nodes.modelBaseUrl.value = modelState.baseUrl;
nodes.customModel.value = modelState.customModel;
nodes.docMode.value = docMode;

nodes.modelChoice.addEventListener("change", () => {
  modelState.choice = nodes.modelChoice.value;
  modelState.selectedModel = modelFromChoice(modelState.choice, modelState.customModel);
  modelState.message = `Selected ${modelState.selectedModel}. Check brain to verify Ollama.`;
  render();
});

nodes.modelBaseUrl.addEventListener("input", () => {
  modelState.baseUrl = nodes.modelBaseUrl.value;
  modelState.online = false;
  modelState.message = "Ollama URL changed. Check brain again.";
  render();
});

nodes.customModel.addEventListener("input", () => {
  modelState.customModel = nodes.customModel.value;
  modelState.selectedModel = modelFromChoice(modelState.choice, modelState.customModel);
  render();
});

nodes.docMode.addEventListener("change", () => {
  docMode = nodes.docMode.value;
  const presentation = DOC_PRESENTATIONS.find((candidate) => candidate.id === docMode);
  setStatus(`Documentation view: ${presentation?.label || docMode}.`);
  render();
});

nodes.form.addEventListener("input", (event) => {
  const card = selectedCard();
  if (!card) return;
  const field = event.target.name;
  const value = event.target.value;
  const patch =
    field === "linkedFiles" || field === "dependencies"
      ? { [field]: parseList(value) }
      : { [field]: value };
  project = updateCard(project, card.id, patch);
  setStatus(`Updated ${field} for ${card.title}.`);
  render();
});

nodes.form.addEventListener("change", (event) => {
  if (event.target.name !== "status") return;
  const card = selectedCard();
  if (!card) return;
  project = updateCard(project, card.id, { status: event.target.value });
  setStatus(`Updated status for ${card.title}.`);
  render();
});

function render() {
  const topic = project.topics.find((item) => item.id === selectedTopicId);
  const conflicts = detectConflicts(project);
  const cards = cardsForTopic(project, selectedTopicId);
  const card = selectedCard();
  const running = project.cards.filter((item) => item.status === "running").length;

  nodes.title.textContent = project.project.title;
  nodes.counts.textContent = `${project.cards.length} cards, ${conflicts.length} conflicts`;
  renderModelPanel();
  nodes.topicCount.textContent = String(project.topics.length);
  nodes.runningCount.textContent = String(running);
  nodes.topicHeading.textContent = topic?.title || "All Logic";
  nodes.selectedId.textContent = card?.id || "";

  nodes.topicList.innerHTML = project.topics
    .map(
      (item) => `
        <button class="topic-button ${item.id === selectedTopicId ? "active" : ""}" type="button" data-action="select-topic" data-topic-id="${escapeHtml(item.id)}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${item.cardIds.length} cards</span>
        </button>
      `
    )
    .join("");

  nodes.conflictReview.hidden = !showConflicts;
  nodes.conflictReview.innerHTML = renderConflictReview(conflicts);
  nodes.cardGrid.innerHTML = cards.map((item, index) => renderCard(item, index, conflicts)).join("");
  renderInspector(card, conflicts);
  renderDocumentationPanel(project);
  nodes.activityCount.textContent = String(activity.length);
  nodes.activityLog.innerHTML =
    activity.length === 0
      ? "<p>No agent activity yet.</p>"
      : activity.map((line) => `<code class="activity-line">${escapeHtml(line)}</code>`).join("");
  saveState();
}

function renderDocumentationPanel(value) {
  const doc = renderDocumentation(value, docMode);
  nodes.docMode.value = doc.id;
  nodes.docFormat.textContent = doc.format === "website" ? "Website" : "Markdown";
  nodes.paper.classList.toggle("website-output", doc.format === "website");
  nodes.paper.classList.toggle("markdown-output", doc.format !== "website");
  if (doc.format === "website") {
    nodes.paper.innerHTML = renderWebsiteDoc(doc);
  } else {
    nodes.paper.textContent = doc.content;
  }
}

function renderWebsiteDoc(doc) {
  const conflictBlock =
    doc.conflicts.length === 0
      ? '<p class="website-empty">No conflicts detected.</p>'
      : doc.conflicts
          .map(
            (conflict) => `
              <article class="website-conflict">
                <strong>${escapeHtml(conflict.label)}</strong>
                <span>${escapeHtml(conflict.cardIds.join(" + "))}</span>
                <p>${escapeHtml(conflict.reason)}</p>
              </article>
            `
          )
          .join("");
  const topicBlocks = doc.topics
    .map(
      (topic) => `
        <section class="website-topic">
          <div class="website-topic-heading">
            <div>
              <span>${escapeHtml(topic.id)}</span>
              <h4>${escapeHtml(topic.title)}</h4>
            </div>
            <strong>${topic.cards.length} cards</strong>
          </div>
          <p>${escapeHtml(topic.summary)}</p>
          <div class="website-card-grid">
            ${topic.cards.map(renderWebsiteCard).join("")}
          </div>
        </section>
      `
    )
    .join("");

  return `
    <article class="website-doc" data-testid="website-doc">
      <section class="website-hero">
        <span>Logic presentation site</span>
        <h3>${escapeHtml(doc.title)}</h3>
        <p>${escapeHtml(doc.content.split("\n\n")[1] || "")}</p>
        <div class="website-stats">
          ${doc.stats
            .map(
              (stat) => `
                <div>
                  <strong>${escapeHtml(stat.value)}</strong>
                  <span>${escapeHtml(stat.label)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </section>
      <section class="website-conflicts">
        <div class="website-section-title">
          <span>Review queue</span>
          <strong>${doc.conflicts.length}</strong>
        </div>
        ${conflictBlock}
      </section>
      ${topicBlocks}
    </article>
  `;
}

function renderWebsiteCard(card) {
  return `
    <article class="website-card">
      <div class="website-card-topline">
        <span>${escapeHtml(statusLabel(card.status))}</span>
        <code>${escapeHtml(card.id)}</code>
      </div>
      <h5>${escapeHtml(card.title)}</h5>
      <p>${escapeHtml(card.summary)}</p>
      <div class="website-card-meta">
        <span>${card.linkedFiles.length} files</span>
        <span>${card.dependencies.length} deps</span>
      </div>
    </article>
  `;
}

function renderConflictReview(conflicts) {
  const human = conflicts.filter((conflict) => conflict.humanRequired);
  const agent = conflicts.filter((conflict) => !conflict.humanRequired);
  return `
    <article class="review-column human">
      <h3>Human Logic Review</h3>
      ${
        human.length === 0
          ? "<p>No human-gated logic conflicts.</p>"
          : human.map(renderConflictButton).join("")
      }
    </article>
    <article class="review-column agent">
      <h3>Agent Merge Work</h3>
      ${
        agent.length === 0
          ? "<p>No code overlaps waiting for merge agents.</p>"
          : agent.map(renderConflictButton).join("")
      }
    </article>
  `;
}

function renderConflictButton(conflict) {
  const humanActions = conflict.humanRequired
    ? `
      <div class="conflict-actions">
        <button type="button" data-action="resolve-conflict" data-conflict-id="${escapeHtml(conflict.id)}">Resolve link</button>
        <button type="button" data-action="obsolete-conflict" data-conflict-id="${escapeHtml(conflict.id)}">Mark other obsolete</button>
      </div>
    `
    : "";
  return `
    <article class="conflict-row">
      <button type="button" class="conflict-select" data-action="select-card" data-card-id="${escapeHtml(conflict.cardIds[0])}">
        <span>${escapeHtml(statusLabel(conflict.kind))}</span>
        <strong>${escapeHtml(conflict.cardIds.join(" + "))}</strong>
        <small>${escapeHtml(conflict.reason)}</small>
      </button>
      ${humanActions}
    </article>
  `;
}

function renderModelPanel() {
  nodes.modelChoice.value = modelState.choice;
  nodes.modelBaseUrl.value = modelState.baseUrl;
  nodes.customModel.value = modelState.customModel;
  nodes.modelStatus.classList.toggle("online", modelState.online);
  nodes.modelStatus.classList.toggle("offline", !modelState.online && modelState.message !== "Not checked");
  nodes.modelStatus.textContent = modelState.message;
}

function renderCard(card, index, conflicts) {
  const hasConflict = conflicts.some((conflict) => conflict.cardIds.includes(card.id));
  const branch = card.implementationBranch
    ? `<code class="branch">${escapeHtml(card.implementationBranch)}</code>`
    : "";
  const latestRun = latestAgentRun(card);
  const canReset =
    card.status === "blocked" &&
    ["cancelled", "failed", "rejected"].includes(latestRun?.status);
  return `
    <article class="logic-card ${card.id === selectedCardId ? "selected" : ""} ${card.status === "running" ? "running" : ""}" data-testid="logic-card">
      <button type="button" class="card-body" data-action="select-card" data-card-id="${escapeHtml(card.id)}">
        <div class="card-topline">
          <span class="pill">${index + 1}</span>
          <span class="pill">${escapeHtml(statusLabel(card.status))}</span>
        </div>
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.summary)}</p>
        <div class="meta-row">
          <span class="pill">${card.linkedFiles.length} files</span>
          <span class="pill">${card.dependencies.length} deps</span>
          ${hasConflict ? '<span class="warning">conflict</span>' : ""}
        </div>
        ${branch}
      </button>
      <div class="card-actions">
        <button type="button" data-action="run-agent" data-card-id="${escapeHtml(card.id)}">Run agent</button>
        ${
          card.status === "ready_to_merge"
            ? `<button type="button" data-action="merge-card" data-card-id="${escapeHtml(card.id)}">Merge branch</button>`
            : ""
        }
        ${
          card.status === "running"
            ? `<button type="button" data-action="cancel-agent" data-card-id="${escapeHtml(card.id)}">Cancel run</button>`
            : ""
        }
        ${
          canReset
            ? `<button type="button" data-action="reset-agent" data-card-id="${escapeHtml(card.id)}">Reset for retry</button>`
            : ""
        }
        <button type="button" data-action="open-card" data-card-id="${escapeHtml(card.id)}">VS Code</button>
      </div>
    </article>
  `;
}

function renderInspector(card, conflicts) {
  if (!card) return;
  nodes.form.elements.title.value = card.title;
  nodes.form.elements.summary.value = card.summary;
  nodes.form.elements.details.value = card.details;
  nodes.form.elements.status.value = card.status;
  nodes.form.elements.linkedFiles.value = card.linkedFiles.join(", ");
  nodes.form.elements.dependencies.value = card.dependencies.join(", ");
  const latestRun = latestAgentRun(card);

  const selectedConflicts = conflicts.filter((conflict) => conflict.cardIds.includes(card.id));
  nodes.selectedConflicts.innerHTML = `
    <h3>Conflict report</h3>
    ${
      selectedConflicts.length === 0
        ? "<p>No conflicts for this card.</p>"
        : selectedConflicts
            .map(
              (conflict) => `
                <article class="mini-conflict ${conflict.humanRequired ? "human" : ""}">
                  <strong>${escapeHtml(statusLabel(conflict.kind))}</strong>
                  <p>${escapeHtml(conflict.humanRequired ? "Human decision" : "Merge agent")}</p>
                  <span>${escapeHtml(conflict.reason)}</span>
                  ${
                    conflict.humanRequired
                      ? `<div class="conflict-actions">
                          <button type="button" data-action="resolve-conflict" data-conflict-id="${escapeHtml(conflict.id)}">Resolve link</button>
                          <button type="button" data-action="obsolete-conflict" data-conflict-id="${escapeHtml(conflict.id)}">Mark other obsolete</button>
                        </div>`
                      : ""
                  }
                </article>
              `
            )
            .join("")
    }
    <h3>Latest agent run</h3>
    ${
      latestRun
        ? renderAgentRun(latestRun)
        : "<p>No worker run has produced implementation notes yet.</p>"
    }
  `;
}

function renderAgentRun(run) {
  return `
    <article class="agent-run">
      <strong>${escapeHtml(run.model)} · ${escapeHtml(run.mode)}</strong>
      <span>${escapeHtml(run.status || "ready_for_review")} · ${escapeHtml(run.at)}</span>
      <p>${escapeHtml(run.note)}</p>
      <div class="proposed-changes">
        ${(run.proposedChanges || [])
          .map(
            (change) => `
              <div class="proposed-change">
                <code>${escapeHtml(change.file)}</code>
                <span>${escapeHtml(change.status)}</span>
                <p>${escapeHtml(change.summary)}</p>
                ${renderReviewHunks(change)}
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderReviewHunks(change) {
  const hunks = change.hunks || [];
  if (hunks.length === 0) {
    return "";
  }
  return `
    <div class="review-hunks" aria-label="Review hunks for ${escapeHtml(change.file)}">
      ${hunks
        .map(
          (hunk) => `
            <div class="review-hunk">
              <span>${escapeHtml(hunk.status)}</span>
              <code>${escapeHtml(hunk.id)}</code>
              <p>old ${Number(hunk.oldStartLine)}:${Number(hunk.oldLineCount)} · new ${Number(hunk.newStartLine)}:${Number(hunk.newLineCount)}</p>
              <small>${escapeHtml(hunk.summary)}</small>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

async function refreshModelHealth() {
  modelState.message = "Checking Ollama...";
  renderModelPanel();
  try {
    const health = await checkOllama(modelState.baseUrl, modelState.choice, modelState.customModel);
    modelState = {
      ...modelState,
      selectedModel: health.selectedModel,
      online: true,
      installed: health.installed,
      installedModels: health.installedModels,
      message: health.installed
        ? `Online: ${health.selectedModel}`
        : `Ollama online, but ${health.selectedModel} is missing. ${installHint(health.selectedModel)}`
    };
  } catch (error) {
    modelState = {
      ...modelState,
      online: false,
      installed: false,
      installedModels: [],
      selectedModel: modelFromChoice(modelState.choice, modelState.customModel),
      message: `Offline: ${installHint(modelFromChoice(modelState.choice, modelState.customModel))}`
    };
    activity = [`Brain offline: ${error.message}`, ...activity];
  }
  render();
}

async function runAgent(cardId) {
  try {
    const card = findCard(cardId);
    const result = startAgent(project, cardId);
    project = result.project;
    selectedCardId = result.plan.cardId;
    const activeRequest = beginAgentRequest(cardId);
    let modelNote = "Brain not connected; simulated planning only.";
    try {
      if (modelState.online && card) {
        try {
          modelNote = await askOllama(
            modelState.baseUrl,
            modelState.selectedModel,
            buildCardAgentMessages(card, result.plan.preflightConflicts),
            { signal: activeRequest.controller.signal }
          );
        } catch (error) {
          if (isAbortError(error) || activeRequest.controller.signal.aborted) {
            throw error;
          }
          modelState.online = false;
          modelNote = `Brain call failed: ${error.message}`;
        }
      }
      if (!isActiveAgentRequest(cardId, activeRequest.token)) {
        activity = [
          `Ignored late preview worker result for ${cardId}; cancellation is authoritative.`,
          ...activity
        ];
        setStatus(`${cardId} cancellation was already recorded; late model output was ignored.`);
        return;
      }
    } catch (error) {
      if (isAbortError(error) || activeRequest.controller.signal.aborted) {
        activity = [
          `Stopped in-flight preview worker for ${cardId}; late model output cannot update the card.`,
          ...activity
        ];
        setStatus(`${cardId} cancellation requested; in-flight model work stopped.`);
        return;
      }
      throw error;
    } finally {
      clearActiveAgentRequest(cardId, activeRequest.token);
    }
    const completed = completeAgentRun(project, cardId, {
      model: modelState.selectedModel,
      mode: modelState.online ? "model" : "simulated",
      note: modelNote,
      preflightConflicts: result.plan.preflightConflicts
    });
    project = completed.project;
    activity = [
      `Ready to merge ${result.plan.branch}`,
      `Worker wrote ${completed.run.proposedChanges.length} proposed change(s)`,
      `Brain ${modelState.selectedModel}: ${modelNote}`,
      `${result.plan.preflightConflicts.length} preflight conflicts`,
      ...activity
    ];
    setStatus(`Agent worker finished ${cardId}; card is ready to merge.`);
  } catch (error) {
    activity = [`Agent blocked: ${error.message}`, ...activity];
    setStatus(error.message);
  }
  render();
}

function resolveConflict(conflictId, action) {
  try {
    project = resolveHumanConflict(project, conflictId, action);
    activity = [`Resolved human logic conflict ${conflictId} with ${action}.`, ...activity];
    setStatus("Human logic conflict resolved.");
  } catch (error) {
    activity = [`Conflict resolution failed: ${error.message}`, ...activity];
    setStatus(error.message);
  }
}

function mergeCard(cardId) {
  try {
    project = markCardMerged(project, cardId);
    activity = [`Merged ${cardId}.`, ...activity];
    setStatus(`${cardId} merged.`);
  } catch (error) {
    activity = [`Merge failed: ${error.message}`, ...activity];
    setStatus(error.message);
  }
}

function cancelAgent(cardId) {
  try {
    const stoppedActiveRequest = abortActiveAgentRequest(cardId);
    const result = cancelAgentRun(project, cardId, {
      note: "Preview user cancelled the running card agent before review."
    });
    project = result.project;
    activity = [
      `Cancelled ${cardId}; worktree metadata preserved.`,
      ...(stoppedActiveRequest ? [`Stopped in-flight model request for ${cardId}.`] : []),
      ...activity
    ];
    setStatus(`${cardId} cancelled.`);
  } catch (error) {
    activity = [`Cancellation failed: ${error.message}`, ...activity];
    setStatus(error.message);
  }
}

function resetAgent(cardId) {
  try {
    const result = resetAgentWork(project, cardId, {
      note: "Preview user reset blocked agent work for a clean retry."
    });
    project = result.project;
    activity = [`Reset ${cardId} for retry.`, ...activity];
    setStatus(`${cardId} reset for retry.`);
  } catch (error) {
    activity = [`Reset failed: ${error.message}`, ...activity];
    setStatus(error.message);
  }
}

function selectedCard() {
  return findCard(selectedCardId);
}

function findCard(cardId) {
  return project.cards.find((card) => card.id === cardId);
}

function beginAgentRequest(cardId) {
  const existing = activeAgentRequests.get(cardId);
  existing?.controller.abort();
  const request = {
    token: `${cardId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    controller: new AbortController()
  };
  activeAgentRequests = new Map(activeAgentRequests);
  activeAgentRequests.set(cardId, request);
  return request;
}

function abortActiveAgentRequest(cardId) {
  const request = activeAgentRequests.get(cardId);
  if (!request) return false;
  request.controller.abort();
  activeAgentRequests = new Map(activeAgentRequests);
  activeAgentRequests.delete(cardId);
  return true;
}

function clearActiveAgentRequest(cardId, token) {
  if (activeAgentRequests.get(cardId)?.token !== token) return;
  activeAgentRequests = new Map(activeAgentRequests);
  activeAgentRequests.delete(cardId);
}

function isActiveAgentRequest(cardId, token) {
  return activeAgentRequests.get(cardId)?.token === token;
}

function isAbortError(error) {
  return Boolean(error && typeof error === "object" && error.name === "AbortError");
}

function parseList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function setStatus(message) {
  nodes.status.textContent = message;
}

function loadStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed?.project?.cards?.length) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function ensureProjectShape(value) {
  const next = cloneProject(value);
  const starter = cloneProject(sampleProject);

  for (const starterTopic of starter.topics) {
    const topic = next.topics.find((candidate) => candidate.id === starterTopic.id);
    if (!topic) {
      next.topics.push(starterTopic);
      continue;
    }
    for (const cardId of starterTopic.cardIds) {
      if (!topic.cardIds.includes(cardId) && starter.cards.some((card) => card.id === cardId)) {
        topic.cardIds.push(cardId);
      }
    }
  }

  for (const starterCard of starter.cards) {
    if (!next.cards.some((card) => card.id === starterCard.id)) {
      next.cards.push(starterCard);
    }
  }

  for (const starterLink of starter.links) {
    const exists = next.links.some(
      (link) =>
        link.from === starterLink.from && link.to === starterLink.to && link.kind === starterLink.kind
    );
    if (!exists) {
      next.links.push(starterLink);
    }
  }

  return next;
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      project,
      selectedTopicId,
      selectedCardId,
      docMode,
      activity: activity.slice(0, 80)
    })
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
