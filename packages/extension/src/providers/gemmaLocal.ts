import * as http from "http";
import { URL } from "url";

/**
 * OpenAI-style chat to localhost (Ollama: POST /v1/chat/completions or /api/chat).
 * Default `gemmaBaseUrl` points at Ollama; model id is configured in the server, not in this extension.
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export class GemmaLocalProvider {
  constructor(private baseUrl: string) {}

  async complete(messages: ChatMessage[], options?: { model?: string }): Promise<string> {
    const model = options?.model ?? "gemma2"; // Ollama default tag; user pins in Ollama
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
        return await this.postJson(p, body);
      } catch (e) {
        lastErr = e as Error;
      }
    }
    throw new Error(
      `Gemma/LLM at ${this.baseUrl} unreachable (tried ${tryPaths.join(", ")}). ${lastErr?.message ?? ""}`.trim()
    );
  }

  private postJson(path: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
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
          headers: { "content-type": "application/json", "content-length": data.length }
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
