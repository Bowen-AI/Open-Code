import * as http from "http";
import * as https from "https";
import { URL } from "url";

/**
 * OpenAI-style chat to localhost (Ollama: POST /v1/chat/completions or /api/chat).
 * Default `gemmaBaseUrl` points at Ollama; model id is configurable so product builds can pin it.
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface GemmaHealth {
  ok: boolean;
  baseUrl: string;
  model: string;
  endpoint?: string;
  models?: string[];
  installed?: boolean;
  error?: string;
}

const OLLAMA_DEFAULT_PORT = "11434";
const HEALTH_TIMEOUT_MS = 1_800;
const CHAT_TIMEOUT_MS = 120_000;

export class GemmaLocalProvider {
  private readonly normalizedBaseUrl: string;

  constructor(
    private baseUrl: string,
    private defaultModel: string
  ) {
    this.normalizedBaseUrl = normalizeLocalRuntimeBaseUrl(baseUrl);
  }

  getBaseUrl(): string {
    return this.normalizedBaseUrl;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  async health(): Promise<GemmaHealth> {
    const checks = [
      { path: "/api/tags", kind: "ollama" },
      { path: "/v1/models", kind: "openai" }
    ];
    let lastErr: Error | undefined;
    for (const check of checks) {
      try {
        const body = await this.getJson(check.path, HEALTH_TIMEOUT_MS);
        const models = extractModelNames(body);
        const installed = models ? modelIsInstalled(models, this.defaultModel) : undefined;
        return {
          ok: installed !== false,
          baseUrl: this.normalizedBaseUrl,
          model: this.defaultModel,
          endpoint: check.kind,
          models,
          installed,
          error: installed === false ? `${this.defaultModel} is not installed` : undefined
        };
      } catch (e) {
        lastErr = e as Error;
      }
    }
    return {
      ok: false,
      baseUrl: this.normalizedBaseUrl,
      model: this.defaultModel,
      error: lastErr?.message ?? "runtime unreachable"
    };
  }

  async complete(
    messages: ChatMessage[],
    options?: { model?: string; signal?: AbortSignal; timeoutMs?: number }
  ): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    const body = JSON.stringify({
      model,
      messages,
      stream: false
    });
    const tryPaths = ["/v1/chat/completions", "/api/chat"];
    let lastErr: Error | undefined;
    for (const p of tryPaths) {
      try {
        return await this.postJson(p, body, options?.signal, options?.timeoutMs ?? CHAT_TIMEOUT_MS);
      } catch (e) {
        lastErr = e as Error;
      }
    }
    throw new Error(
      `Gemma/LLM at ${this.normalizedBaseUrl} unreachable (tried ${tryPaths.join(", ")}). ${lastErr?.message ?? ""}`.trim()
    );
  }

  private getJson(path: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const u = new URL(path, `${this.normalizedBaseUrl}/`);
      const port = u.port
        ? parseInt(u.port, 10)
        : u.protocol === "https:"
          ? 443
          : 80;
      const client = u.protocol === "https:" ? https : http;
      const req = client.get(
        {
          hostname: u.hostname,
          port,
          path: u.pathname + u.search
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              return reject(new Error(`HTTP ${res.statusCode} ${text}`));
            }
            try {
              resolve(JSON.parse(text));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`request timed out after ${timeoutMs}ms`)));
      req.on("error", reject);
    });
  }

  private postJson(path: string, body: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("request cancelled"));
        return;
      }
      const u = new URL(path, `${this.normalizedBaseUrl}/`);
      const port = u.port
        ? parseInt(u.port, 10)
        : u.protocol === "https:"
          ? 443
          : 80;
      const data = Buffer.from(body, "utf8");
      const client = u.protocol === "https:" ? https : http;
      const req = client.request(
        {
          method: "POST",
          hostname: u.hostname,
          port,
          path: u.pathname + u.search,
          headers: { "content-type": "application/json", "content-length": data.length },
          signal
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              return reject(new Error(`HTTP ${res.statusCode} ${text}`));
            }
            try {
              const j = JSON.parse(text) as {
                choices?: Array<{ message?: { content?: string } }>;
                message?: { content?: string };
              };
              const out =
                j.choices?.[0]?.message?.content ?? j.message?.content ?? JSON.stringify(j);
              resolve(String(out));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`request timed out after ${timeoutMs}ms`)));
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }
}

export function normalizeLocalRuntimeBaseUrl(baseUrl: string): string {
  const raw = String(baseUrl || "http://127.0.0.1:11434").trim() || "http://127.0.0.1:11434";
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported model runtime protocol: ${url.protocol}`);
  }
  if (!url.port && (url.protocol === "http:" || url.protocol === "https:")) {
    url.port = OLLAMA_DEFAULT_PORT;
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

function extractModelNames(body: unknown): string[] | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  type ModelListItem = { id?: string; name?: string; model?: string };
  const value = body as {
    models?: ModelListItem[];
    data?: ModelListItem[];
  };
  const names = (value.models ?? value.data)
    ?.map((m) => m.name ?? m.model ?? m.id)
    .filter((m): m is string => typeof m === "string" && m.length > 0);
  return names && names.length > 0 ? names : undefined;
}

function modelIsInstalled(models: string[], target: string): boolean {
  const installed = new Set(models.flatMap(expandInstalledModelName));
  return installed.has(target);
}

function expandInstalledModelName(name: string): string[] {
  if (!name.includes(":")) {
    return [name, `${name}:latest`];
  }
  const [family, tag] = name.split(":");
  return tag === "latest" ? [name, family] : [name];
}
