import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("packages/desktop/preview/index.html", "utf8");
const app = fs.readFileSync("packages/desktop/preview/app.js", "utf8");
const css = fs.readFileSync("packages/desktop/preview/styles.css", "utf8");

const requiredTestIds = [
  "status-strip",
  "model-panel",
  "model-choice",
  "model-base-url",
  "custom-model",
  "check-model",
  "model-status",
  "conflict-review",
  "card-grid",
  "title-input",
  "summary-input",
  "details-input",
  "status-select",
  "files-input",
  "dependencies-input",
  "selected-conflicts",
  "doc-mode",
  "paper-output",
  "activity-log"
];

for (const testId of requiredTestIds) {
  assert.match(html, new RegExp(`data-testid="${testId}"`), `missing test id ${testId}`);
}

const requiredActions = [
  "reset",
  "paper",
  "vscode",
  "toggle-conflicts",
  "check-model",
  "select-topic",
  "select-card",
  "run-agent",
  "merge-card",
  "cancel-agent",
  "reset-agent",
  "open-card",
  "resolve-conflict",
  "obsolete-conflict"
];

for (const action of requiredActions) {
  assert.match(app, new RegExp(`action === "${action}"|data-action="${action}"`), `missing action ${action}`);
}

for (const selector of [
  ".topics",
  ".flow",
  ".inspector",
  ".conflict-review",
  ".logic-card",
  ".documentation",
  ".activity"
]) {
  assert.ok(css.includes(selector), `missing CSS selector ${selector}`);
}

for (const selector of [".agent-run", ".proposed-change", ".proposed-changes", ".review-hunk"]) {
  assert.ok(css.includes(selector), `missing agent worker CSS selector ${selector}`);
}

for (const selector of [".doc-toolbar", ".doc-output", ".website-doc", ".website-card"]) {
  assert.ok(css.includes(selector), `missing documentation CSS selector ${selector}`);
}

for (const token of ["DOC_PRESENTATIONS", "renderDocumentationPanel", "renderWebsiteDoc"]) {
  assert.ok(app.includes(token), `missing documentation UI token ${token}`);
}

console.log("UI contract preview tests passed.");
