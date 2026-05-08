import type { AgentFileEdit, AgentLinkedFile, ConflictRecord, LogicCard } from "./types";

export const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_MODEL = "gemma3:4b";
export const DEFAULT_MODE = "auto";
export const OLLAMA_DEFAULT_PORT = "11434";

export interface ModelChoice {
  id: string;
  label: string;
  model: string;
  description: string;
}

export interface ModelHealth {
  ok: boolean;
  baseUrl: string;
  selectedModel: string;
  installedModels: string[];
  installed: boolean;
}

export const MODEL_CHOICES: ModelChoice[] = [
  {
    id: "auto",
    label: "Auto",
    model: DEFAULT_MODEL,
    description: "Prefer the strongest installed Gemma model, defaulting to Gemma 3 4B."
  },
  {
    id: "gemma3:4b",
    label: "Gemma 3 4B",
    model: "gemma3:4b",
    description: "MVP default brain: capable, local, and realistic for a developer laptop."
  },
  {
    id: "gemma3n:e4b",
    label: "Gemma 3n E4B",
    model: "gemma3n:e4b",
    description: "Efficient Gemma 3n model for everyday devices."
  },
  {
    id: "gemma3:12b",
    label: "Gemma 3 12B",
    model: "gemma3:12b",
    description: "Stronger local model when the machine has enough memory."
  },
  {
    id: "gemma3:27b",
    label: "Gemma 3 27B",
    model: "gemma3:27b",
    description: "Highest local Gemma 3 option in the MVP list; needs much more memory."
  },
  {
    id: "gemma3:1b",
    label: "Gemma 3 1B",
    model: "gemma3:1b",
    description: "Small fallback for low-resource machines."
  },
  {
    id: "custom",
    label: "Custom Ollama model",
    model: "",
    description: "Use any installed Ollama model tag."
  }
];

export const AUTO_MODEL_CANDIDATES = [
  "gemma3:27b",
  "gemma3:12b",
  "gemma3:4b",
  "gemma3n:e4b",
  "gemma3:1b",
  "gemma3:270m",
  "gemma3"
];

export function normalizeOllamaBaseUrl(baseUrl = OLLAMA_BASE_URL): string {
  const raw = String(baseUrl || OLLAMA_BASE_URL).trim() || OLLAMA_BASE_URL;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  if (!url.port && (url.protocol === "http:" || url.protocol === "https:")) {
    url.port = OLLAMA_DEFAULT_PORT;
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

export function modelFromChoice(choice: string, customModel = ""): string {
  if (choice === "custom") {
    return customModel.trim() || DEFAULT_MODEL;
  }
  if (choice === "auto") {
    return DEFAULT_MODEL;
  }
  return choice.trim() || DEFAULT_MODEL;
}

export function chooseAutoModel(installedModels: string[]): string {
  const installed = new Set(installedModels.flatMap(expandInstalledModelName));
  return AUTO_MODEL_CANDIDATES.find((candidate) => installed.has(candidate)) ?? DEFAULT_MODEL;
}

export function parseOllamaTags(payload: unknown): string[] {
  const models =
    payload && typeof payload === "object" && "models" in payload && Array.isArray(payload.models)
      ? payload.models
      : [];
  return models
    .map((model) => {
      if (!model || typeof model !== "object") {
        return undefined;
      }
      const value = model as { name?: string; model?: string; id?: string };
      return value.name ?? value.model ?? value.id;
    })
    .filter((model): model is string => typeof model === "string" && model.length > 0)
    .sort();
}

export async function checkOllama(
  baseUrl = OLLAMA_BASE_URL,
  choice = DEFAULT_MODE,
  customModel = ""
): Promise<ModelHealth> {
  const cleanBaseUrl = normalizeOllamaBaseUrl(baseUrl);
  const response = await fetchWithTimeout(`${cleanBaseUrl}/api/tags`, {}, 1800);
  if (!response.ok) {
    throw new Error(`Ollama health failed: HTTP ${response.status}`);
  }
  const tags = await response.json();
  const installedModels = parseOllamaTags(tags);
  const selectedModel = choice === "auto" ? chooseAutoModel(installedModels) : modelFromChoice(choice, customModel);
  return {
    ok: true,
    baseUrl: cleanBaseUrl,
    selectedModel,
    installedModels,
    installed: installedModels.flatMap(expandInstalledModelName).includes(selectedModel)
  };
}

export async function askOllama(
  baseUrl: string,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: OllamaRequestOptions = {}
): Promise<string> {
  const cleanBaseUrl = normalizeOllamaBaseUrl(baseUrl);
  const response = await fetchWithTimeout(
    `${cleanBaseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false })
    },
    options.timeoutMs ?? 120000,
    options.signal
  );
  if (!response.ok) {
    throw new Error(`Ollama chat failed: HTTP ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { message?: { content?: string }; response?: string };
  return String(body.message?.content ?? body.response ?? JSON.stringify(body));
}

export interface StructuredAgentEditResult {
  note: string;
  edits: AgentFileEdit[];
}

export interface OllamaRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function buildCardAgentMessages(card: LogicCard, conflicts: ConflictRecord[]) {
  return [
    {
      role: "system" as const,
      content:
        "You are the Open Code agent brain. Be concise. Review one logic card and return an implementation note that preserves the card intent. Code conflicts can be merged by agents; logic conflicts must be escalated to humans."
    },
    {
      role: "user" as const,
      content: [
        `Card: ${card.title} (${card.id})`,
        `Summary: ${card.summary}`,
        `Details: ${card.details}`,
        `Linked files: ${card.linkedFiles.join(", ") || "none"}`,
        `Dependencies: ${card.dependencies.join(", ") || "none"}`,
        `Preflight conflicts: ${conflicts.map((conflict) => conflict.reason).join(" | ") || "none"}`,
        "Return 3 bullets: implementation intent, likely files, and merge/conflict note."
      ].join("\n")
    }
  ];
}

export function buildCardAgentEditMessages(
  card: LogicCard,
  conflicts: ConflictRecord[],
  files: AgentLinkedFile[]
) {
  return [
    {
      role: "system" as const,
      content: [
        "You are the Open Code structured worker. Return only JSON.",
        "The JSON shape is {\"note\":\"...\",\"edits\":[{\"file\":\"...\",\"expectedText\":\"...\",\"newText\":\"...\",\"summary\":\"...\"}]}",
        "Only edit listed files. expectedText must exactly match the current file text. newText must be the complete replacement text for that file.",
        "If the card cannot be implemented safely, return an explanatory note and an empty edits array."
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `Card: ${card.title} (${card.id})`,
        `Summary: ${card.summary}`,
        `Details: ${card.details}`,
        `Linked files: ${card.linkedFiles.join(", ") || "none"}`,
        `Dependencies: ${card.dependencies.join(", ") || "none"}`,
        `Preflight conflicts: ${conflicts.map((conflict) => conflict.reason).join(" | ") || "none"}`,
        "Current linked file contents:",
        ...files.map((file) =>
          [`--- ${file.file}`, file.text, `--- end ${file.file}`].join("\n")
        )
      ].join("\n")
    }
  ];
}

export function parseStructuredAgentEditResponse(
  content: string,
  allowedFiles: string[]
): StructuredAgentEditResult {
  const parsed = JSON.parse(extractJsonObject(content)) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Structured worker response was not a JSON object.");
  }

  const value = parsed as { note?: unknown; edits?: unknown };
  const note = typeof value.note === "string" ? value.note : "";
  const edits = Array.isArray(value.edits) ? value.edits : [];
  const allowed = new Set(allowedFiles);
  return {
    note: note.trim() || "Structured worker returned file edits.",
    edits: edits.map((edit) => parseStructuredEdit(edit, allowed))
  };
}

export function installHint(model = DEFAULT_MODEL): string {
  return `Install Ollama, then run: ollama pull ${model}`;
}

function parseStructuredEdit(edit: unknown, allowedFiles: Set<string>): AgentFileEdit {
  if (!edit || typeof edit !== "object") {
    throw new Error("Structured worker edit was not an object.");
  }
  const value = edit as {
    file?: unknown;
    expectedText?: unknown;
    newText?: unknown;
    summary?: unknown;
  };
  if (typeof value.file !== "string" || !allowedFiles.has(value.file)) {
    throw new Error(`Structured worker proposed an out-of-scope file: ${String(value.file)}`);
  }
  if (typeof value.expectedText !== "string" || typeof value.newText !== "string") {
    throw new Error(`Structured worker edit for ${value.file} is missing exact text fields.`);
  }
  return {
    file: value.file,
    expectedText: value.expectedText,
    newText: value.newText,
    summary: typeof value.summary === "string" ? value.summary : "Structured worker edit."
  };
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new Error("Structured worker response did not contain JSON.");
}

function expandInstalledModelName(name: string): string[] {
  if (!name.includes(":")) {
    return [name, `${name}:latest`];
  }
  const [family, tag] = name.split(":");
  return tag === "latest" ? [name, family] : [name];
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason);
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}
