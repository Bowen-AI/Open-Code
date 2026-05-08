import assert from "node:assert/strict";
import {
  branchForCard,
  cardsForTopic,
  cancelAgentRun,
  cloneProject,
  completeAgentRun,
  detectConflicts,
  DOC_PRESENTATIONS,
  latestAgentRun,
  markCardMerged,
  renderDocumentation,
  renderPaper,
  resetAgentWork,
  resolveHumanConflict,
  sampleProject,
  startAgent,
  updateCard
} from "../logic.js";
import {
  DEFAULT_MODEL,
  askOllama,
  checkOllama,
  chooseAutoModel,
  installHint,
  modelFromChoice,
  normalizeOllamaBaseUrl,
  parseOllamaTags
} from "../models.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("renders topic cards in topic order", () => {
  const project = cloneProject();
  const cards = cardsForTopic(project, "logic-runtime");
  assert.deepEqual(
    cards.map((card) => card.id),
    ["card-logic-schema", "card-agent-coordinator", "card-conflict-model"]
  );
});

test("detects agent-resolvable file overlaps", () => {
  const project = cloneProject();
  const conflicts = detectConflicts(project).filter((conflict) => conflict.kind === "code_overlap");
  assert.ok(conflicts.length >= 2);
  assert.ok(conflicts.every((conflict) => conflict.humanRequired === false));
  assert.ok(conflicts.some((conflict) => conflict.file === "crates/open-code-logic/src/lib.rs"));
});

test("detects human-gated missing dependency", () => {
  let project = cloneProject();
  project = updateCard(project, "card-vscode-handoff", {
    dependencies: ["missing-card"]
  });
  const conflict = detectConflicts(project).find((item) => item.kind === "missing_dependency");
  assert.equal(conflict?.humanRequired, true);
  assert.deepEqual(conflict?.cardIds, ["card-vscode-handoff", "missing-card"]);
});

test("resolves human-gated missing dependency", () => {
  let project = cloneProject();
  project = updateCard(project, "card-vscode-handoff", {
    dependencies: ["missing-card"]
  });
  const conflict = detectConflicts(project).find((item) => item.kind === "missing_dependency");
  const resolved = resolveHumanConflict(project, conflict.id);
  assert.equal(
    detectConflicts(resolved).some((item) => item.id === conflict.id),
    false
  );
  assert.deepEqual(
    resolved.cards.find((card) => card.id === "card-vscode-handoff").dependencies,
    []
  );
});

test("marks other card obsolete when resolving a declared logic conflict", () => {
  const project = cloneProject();
  project.links.push({
    from: "card-local-gemma-brain",
    to: "card-packaged-runtime",
    kind: "conflicts_with",
    reason: "Temporary test conflict."
  });
  const conflict = detectConflicts(project).find((item) => item.kind === "logic_conflict");
  const resolved = resolveHumanConflict(project, conflict.id, "mark-other-obsolete");
  assert.equal(detectConflicts(resolved).some((item) => item.id === conflict.id), false);
  assert.equal(
    resolved.cards.find((card) => card.id === conflict.cardIds[1]).status,
    "blocked"
  );
});

test("blocks agent start when card is not ready", () => {
  const project = cloneProject();
  assert.throws(() => startAgent(project, "card-agent-coordinator"), /not ready/);
});

test("starts a ready card agent with branch and worktree metadata", () => {
  const project = cloneProject();
  const { project: next, plan } = startAgent(project, "card-vscode-handoff");
  const card = next.cards.find((candidate) => candidate.id === "card-vscode-handoff");
  assert.equal(card.status, "running");
  assert.equal(plan.branch, branchForCard(card));
  assert.equal(card.implementationBranch, plan.branch);
  assert.match(plan.worktreePath, /\.open-code\/worktrees\/card-vscode-handoff-open-in-vs-code/);
});

test("completes an agent run with implementation note and proposed changes", () => {
  const started = startAgent(cloneProject(), "card-vscode-handoff");
  const completed = completeAgentRun(started.project, "card-vscode-handoff", {
    id: "run-test",
    at: "2026-04-26T00:00:00.000Z",
    model: "gemma3:4b",
    mode: "simulated",
    note: "Implementation intent: open linked files."
  });
  const card = completed.project.cards.find((candidate) => candidate.id === "card-vscode-handoff");
  assert.equal(card.status, "ready_to_merge");
  assert.equal(latestAgentRun(card).id, "run-test");
  assert.equal(latestAgentRun(card).proposedChanges.length, 1);
  assert.equal(latestAgentRun(card).proposedChanges[0].file, "packages/desktop/src-tauri/src/main.rs");
  assert.equal(latestAgentRun(card).proposedChanges[0].hunks.length, 1);
  assert.equal(
    latestAgentRun(card).proposedChanges[0].hunks[0].status,
    latestAgentRun(card).proposedChanges[0].status
  );
});

test("marks a ready-to-merge card merged", () => {
  const started = startAgent(cloneProject(), "card-local-gemma-brain");
  const completed = completeAgentRun(started.project, "card-local-gemma-brain", {
    id: "run-merge",
    at: "2026-04-26T00:00:00.000Z",
    model: "gemma3:4b",
    mode: "simulated",
    note: "Implementation intent: merge path."
  });
  const merged = markCardMerged(completed.project, "card-local-gemma-brain");
  const card = merged.cards.find((candidate) => candidate.id === "card-local-gemma-brain");
  assert.equal(card.status, "merged");
  assert.equal(card.implementationBranch, null);
  assert.equal(card.worktreePath, null);
  assert.equal(latestAgentRun(card).proposedChanges[0].status, "applied");
  assert.equal(latestAgentRun(card).proposedChanges[0].hunks[0].status, "applied");
});

test("cancels a running agent while preserving branch metadata", () => {
  const started = startAgent(cloneProject(), "card-vscode-handoff");
  const cancelled = cancelAgentRun(started.project, "card-vscode-handoff", {
    id: "run-cancel",
    at: "2026-05-08T02:00:00.000Z",
    note: "User cancelled the preview worker."
  });
  const card = cancelled.project.cards.find((candidate) => candidate.id === "card-vscode-handoff");
  assert.equal(card.status, "blocked");
  assert.equal(latestAgentRun(card).id, "run-cancel");
  assert.equal(latestAgentRun(card).status, "cancelled");
  assert.equal(latestAgentRun(card).mode, "manual_cancel");
  assert.equal(latestAgentRun(card).branch, started.plan.branch);
  assert.equal(card.implementationBranch, started.plan.branch);
});

test("resets a blocked terminal agent run for retry", () => {
  const started = startAgent(cloneProject(), "card-vscode-handoff");
  const cancelled = cancelAgentRun(started.project, "card-vscode-handoff", {
    id: "run-cancel",
    at: "2026-05-08T02:00:00.000Z",
    note: "User cancelled the preview worker."
  });
  const reset = resetAgentWork(cancelled.project, "card-vscode-handoff", {
    id: "run-reset",
    at: "2026-05-08T02:05:00.000Z",
    note: "Retry after cancellation."
  });
  const card = reset.project.cards.find((candidate) => candidate.id === "card-vscode-handoff");
  assert.equal(card.status, "ready");
  assert.equal(card.implementationBranch, null);
  assert.equal(card.worktreePath, null);
  assert.equal(latestAgentRun(card).id, "run-reset");
  assert.equal(latestAgentRun(card).status, "abandoned");
  assert.equal(latestAgentRun(card).branch, started.plan.branch);
  assert.equal(latestAgentRun(card).worktreePath, started.plan.worktreePath);
});

test("resets rejected and failed terminal preview runs for retry", () => {
  const rejectedStart = startAgent(cloneProject(), "card-vscode-handoff");
  const rejectedCompleted = completeAgentRun(rejectedStart.project, "card-vscode-handoff", {
    id: "run-rejected",
    at: "2026-05-08T02:00:00.000Z",
    model: "gemma3:4b",
    mode: "simulated",
    note: "Implementation intent: rejected run."
  });
  const rejectedProject = cloneProject(rejectedCompleted.project);
  const rejectedCard = rejectedProject.cards.find((candidate) => candidate.id === "card-vscode-handoff");
  rejectedCard.status = "blocked";
  latestAgentRun(rejectedCard).status = "rejected";
  latestAgentRun(rejectedCard).branch = rejectedStart.plan.branch;
  latestAgentRun(rejectedCard).worktreePath = rejectedStart.plan.worktreePath;

  const resetRejected = resetAgentWork(rejectedProject, "card-vscode-handoff", {
    id: "run-reset-rejected",
    at: "2026-05-08T02:05:00.000Z",
    note: "Retry after rejection."
  });
  const resetRejectedCard = resetRejected.project.cards.find(
    (candidate) => candidate.id === "card-vscode-handoff"
  );
  assert.equal(resetRejectedCard.status, "ready");
  assert.equal(latestAgentRun(resetRejectedCard).status, "abandoned");
  assert.equal(latestAgentRun(resetRejectedCard).branch, rejectedStart.plan.branch);

  const failedStart = startAgent(cloneProject(), "card-vscode-handoff");
  const failedProject = cloneProject(failedStart.project);
  const failedCard = failedProject.cards.find((candidate) => candidate.id === "card-vscode-handoff");
  failedCard.status = "blocked";
  failedCard.agentRuns = [
    {
      id: "run-failed",
      at: "2026-05-08T02:10:00.000Z",
      model: "gemma3:4b",
      mode: "model",
      status: "failed",
      promptSummary: "",
      note: "Structured edit application failed.",
      startedAt: "2026-05-08T02:09:00.000Z",
      finishedAt: "2026-05-08T02:10:00.000Z",
      branch: failedStart.plan.branch,
      worktreePath: failedStart.plan.worktreePath,
      diagnostics: [{ level: "error", message: "stale linked file" }],
      proposedChanges: [],
      preflightConflicts: []
    }
  ];

  const resetFailed = resetAgentWork(failedProject, "card-vscode-handoff", {
    id: "run-reset-failed",
    at: "2026-05-08T02:15:00.000Z",
    note: "Retry after failure."
  });
  const resetFailedCard = resetFailed.project.cards.find(
    (candidate) => candidate.id === "card-vscode-handoff"
  );
  assert.equal(resetFailedCard.status, "ready");
  assert.equal(latestAgentRun(resetFailedCard).status, "abandoned");
  assert.equal(latestAgentRun(resetFailedCard).worktreePath, failedStart.plan.worktreePath);
});

test("reset for retry requires a blocked terminal agent run", () => {
  assert.throws(
    () => resetAgentWork(cloneProject(), "card-vscode-handoff"),
    /cannot be reset/
  );
  const project = updateCard(cloneProject(), "card-vscode-handoff", { status: "blocked" });
  assert.throws(
    () => resetAgentWork(project, "card-vscode-handoff"),
    /no terminal agent run/
  );
});

test("renders generated paper with conflict review and branches", () => {
  const project = cloneProject(sampleProject);
  const paper = renderPaper(project);
  assert.match(paper, /# Open Code Logic Workspace/);
  assert.match(paper, /## Conflict Review/);
  assert.match(paper, /open-code\/card\/card-agent-coordinator/);
});

test("renders latest agent run in generated paper", () => {
  const started = startAgent(cloneProject(), "card-vscode-handoff");
  const completed = completeAgentRun(started.project, "card-vscode-handoff", {
    id: "run-paper",
    at: "2026-04-26T00:00:00.000Z",
    model: "gemma3:4b",
    mode: "simulated",
    note: "Implementation intent: test paper rendering."
  });
  const paper = renderPaper(completed.project);
  assert.match(paper, /Latest agent run/);
  assert.match(paper, /Implementation intent: test paper rendering/);
});

test("renders every documentation presentation from the same logic graph", () => {
  const project = cloneProject(sampleProject);
  for (const presentation of DOC_PRESENTATIONS) {
    const doc = renderDocumentation(project, presentation.id);
    assert.equal(doc.id, presentation.id);
    assert.equal(doc.format, presentation.format);
    assert.ok(doc.content.length > 20);
  }
});

test("website documentation exposes visual topic and card sections", () => {
  const project = cloneProject(sampleProject);
  const doc = renderDocumentation(project, "website");
  assert.equal(doc.format, "website");
  assert.ok(doc.stats.some((stat) => stat.label === "Cards"));
  assert.ok(doc.topics.length >= 3);
  assert.ok(doc.topics.some((topic) => topic.cards.some((card) => card.id === "card-documentation-presentations")));
});

test("auto model prefers the strongest installed Gemma candidate", () => {
  assert.equal(chooseAutoModel(["gemma3:1b", "gemma3:12b", "gemma3n:e4b"]), "gemma3:12b");
  assert.equal(chooseAutoModel([]), DEFAULT_MODEL);
});

test("model choice supports custom Ollama model names", () => {
  assert.equal(modelFromChoice("auto"), DEFAULT_MODEL);
  assert.equal(modelFromChoice("custom", "gemma3:27b"), "gemma3:27b");
  assert.equal(modelFromChoice("gemma3n:e4b"), "gemma3n:e4b");
});

test("Ollama tags and install hints are parseable", () => {
  const tags = parseOllamaTags({ models: [{ name: "gemma3:4b" }, { model: "gemma3n:e4b" }] });
  assert.deepEqual(tags, ["gemma3:4b", "gemma3n:e4b"]);
  assert.equal(installHint("gemma3:4b"), "Install Ollama, then run: ollama pull gemma3:4b");
});

test("Ollama base URL normalization preserves the default local port", () => {
  assert.equal(normalizeOllamaBaseUrl("127.0.0.1"), "http://127.0.0.1:11434");
  assert.equal(normalizeOllamaBaseUrl("http://localhost"), "http://localhost:11434");
  assert.equal(normalizeOllamaBaseUrl("http://localhost:1234/"), "http://localhost:1234");
});

test("model health uses the normalized Ollama endpoint and detects installation", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ models: [{ name: "gemma3:4b" }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    const health = await checkOllama("http://127.0.0.1", "gemma3:4b");
    assert.equal(requestedUrl, "http://127.0.0.1:11434/api/tags");
    assert.equal(health.selectedModel, "gemma3:4b");
    assert.equal(health.installed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Ollama chat requests honor external cancellation", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let forwardedSignal;
  globalThis.fetch = async (_url, options = {}) => {
    forwardedSignal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => {
          const error = new Error("cancelled");
          error.name = "AbortError";
          reject(error);
        },
        { once: true }
      );
    });
  };
  try {
    const pending = askOllama("http://127.0.0.1", "gemma3:4b", [], {
      signal: controller.signal,
      timeoutMs: 5000
    });
    controller.abort();
    await assert.rejects(pending, (error) => error.name === "AbortError");
    assert.equal(forwardedSignal.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`${tests.length} preview tests passed.`);
