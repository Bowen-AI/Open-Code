import * as http from "http";
import { URL, URLSearchParams } from "url";
import { MemoryKind } from "./types";

export interface MemoryClient {
  health(): Promise<boolean>;
  appendRaw(p: {
    projectId: string;
    sessionId: string;
    kind: MemoryKind;
    payload: object;
  }): Promise<{ id: string }>;
  appendSemantic(p: {
    projectId: string;
    kind: string;
    body: object;
    sourceRawIds?: string[];
  }): Promise<{ id: string }>;
  clearProject(projectId: string): Promise<{ deleted: number }>;
  recentRaw(projectId: string, limit?: number): Promise<unknown[]>;
}

function jsonPost(base: string, pathname: string, body: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const u = new URL(pathname, base);
    const data = Buffer.from(JSON.stringify(body), "utf8");
    const port = u.port || (u.protocol === "https:" ? 443 : 80);
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
            resolve(JSON.parse(text));
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

function httpGet(base: string, pathnameWithQuery: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const u = new URL(pathnameWithQuery, base);
    const port = u.port || (u.protocol === "https:" ? 443 : 80);
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

export class HttpMemoryClient implements MemoryClient {
  constructor(private base: string) {}

  async health(): Promise<boolean> {
    try {
      const j = (await httpGet(this.base, "/v1/health")) as { ok?: boolean };
      return j?.ok === true;
    } catch {
      return false;
    }
  }

  async appendRaw(p: {
    projectId: string;
    sessionId: string;
    kind: MemoryKind;
    payload: object;
  }): Promise<{ id: string }> {
    return (await jsonPost(this.base, "/v1/raw/append", {
      project_id: p.projectId,
      session_id: p.sessionId,
      kind: p.kind,
      payload: p.payload
    })) as { id: string };
  }

  async appendSemantic(p: {
    projectId: string;
    kind: string;
    body: object;
    sourceRawIds?: string[];
  }): Promise<{ id: string }> {
    return (await jsonPost(this.base, "/v1/semantic/append", {
      project_id: p.projectId,
      kind: p.kind,
      body: p.body,
      source_raw_ids: p.sourceRawIds
    })) as { id: string };
  }

  async clearProject(projectId: string): Promise<{ deleted: number }> {
    return (await jsonPost(this.base, "/v1/raw/clear", {
      project_id: projectId
    })) as { deleted: number };
  }

  async recentRaw(pId: string, limit = 20): Promise<unknown[]> {
    const q = new URLSearchParams({ project_id: pId, limit: String(limit) });
    const j = (await httpGet(
      this.base,
      `/v1/raw/recent?${q.toString()}`
    )) as { items: unknown[] };
    return j.items ?? [];
  }
}

export { getProjectId, getSessionId } from "./util/projectId";
