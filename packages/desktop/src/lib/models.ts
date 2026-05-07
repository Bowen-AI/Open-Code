import type { ConflictRecord, LogicCard } from "./types";

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
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
): Promise<string> {
  const cleanBaseUrl = normalizeOllamaBaseUrl(baseUrl);
  const response = await fetchWithTimeout(
    `${cleanBaseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false })
    },
    120000
  );
  if (!response.ok) {
    throw new Error(`Ollama chat failed: HTTP ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { message?: { content?: string }; response?: string };
  return String(body.message?.content ?? body.response ?? JSON.stringify(body));
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

export function installHint(model = DEFAULT_MODEL): string {
  return `Install Ollama, then run: ollama pull ${model}`;
}

function expandInstalledModelName(name: string): string[] {
  if (!name.includes(":")) {
    return [name, `${name}:latest`];
  }
  const [family, tag] = name.split(":");
  return tag === "latest" ? [name, family] : [name];
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
