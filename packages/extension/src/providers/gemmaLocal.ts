import * as http from "http";
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
  error?: string;
}

export class GemmaLocalProvider {
  constructor(
    private baseUrl: string,
    private defaultModel: string
  ) {}

  getBaseUrl(): string {
    return this.baseUrl;
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
        const body = await this.getJson(check.path);
        const models = extractModelNames(body);
        return {
          ok: true,
          baseUrl: this.baseUrl,
          model: this.defaultModel,
          endpoint: check.kind,
          models
        };
      } catch (e) {
        lastErr = e as Error;
      }
    }
    return {
      ok: false,
      baseUrl: this.baseUrl,
      model: this.defaultModel,
      error: lastErr?.message ?? "runtime unreachable"
    };
  }

  async complete(messages: ChatMessage[], options?: { model?: string; signal?: AbortSignal }): Promise<string> {
    const model = options?.model ?? this.defaultModel;
    const body = JSON.stringify({
      model,
      messages,
      stream: false
    });
    const url = new URL(this.baseUrl);
    if (!url.port) {
      if (url.protocol === "https:") {
        url.port = "443";
      } else {
        url.port = "11434";
      }
    }
    const tryPaths = ["/v1/chat/completions", "/api/chat"];
    let lastErr: Error | undefined;
    for (const p of tryPaths) {
      try {
        return await this.postJson(p, body, options?.signal);
      } catch (e) {
        lastErr = e as Error;
      }
    }
    throw new Error(
      `Gemma/LLM at ${this.baseUrl} unreachable (tried ${tryPaths.join(", ")}). ${lastErr?.message ?? ""}`.trim()
    );
  }

  private getJson(path: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const u = new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
      const port = u.port
        ? parseInt(u.port, 10)
        : u.protocol === "https:"
          ? 443
          : 80;
      const req = http.get(
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
      req.on("error", reject);
    });
  }

  private postJson(path: string, body: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("request cancelled"));
        return;
      }
      const u = new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
      const port = u.port
        ? parseInt(u.port, 10)
        : u.protocol === "https:"
          ? 443
          : 80;
      const data = Buffer.from(body, "utf8");
      const req = http.request(
        {
          method: "POST",
          hostname: u.hostname,
          port,
          path: u.pathname,
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
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }
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
