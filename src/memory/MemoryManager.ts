/**
 * MemoryManager – unified facade for all Open-Cursor memory operations.
 *
 * Delegates to RepoMemory (workspace-scoped) and/or HostMemory (global)
 * depending on configuration and the requested scope.
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { RepoMemory } from './RepoMemory';
import { HostMemory } from './HostMemory';
import { MemoryOrganizer } from './MemoryOrganizer';
import { MemoryEntry, MemoryQuery, MemoryScope } from './types';

export interface MemoryManagerOptions {
  context: vscode.ExtensionContext;
  /** Absolute path to the workspace root (may be undefined in no-folder mode). */
  workspaceRoot?: string;
  /** Override the host memory base directory (useful for tests). */
  hostMemoryDir?: string;
  /** Override the maximum entries per scope (useful for tests; defaults to VSCode config). */
  maxEntriesPerScope?: number;
}

export class MemoryManager {
  private readonly repoMemory: RepoMemory | undefined;
  private readonly hostMemory: HostMemory;
  private readonly context: vscode.ExtensionContext;
  private readonly maxEntriesOverride: number | undefined;

  constructor(opts: MemoryManagerOptions) {
    this.context = opts.context;
    this.hostMemory = new HostMemory(opts.hostMemoryDir);
    this.repoMemory = opts.workspaceRoot
      ? new RepoMemory(opts.workspaceRoot)
      : undefined;
    this.maxEntriesOverride = opts.maxEntriesPerScope;
  }

  // ── Create / Update ────────────────────────────────────────────────────────

  /**
   * Add a new memory entry and return it.
   */
  async add(
    content: string,
    tags: string[],
    scope: MemoryScope = 'host',
  ): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      scope,
      tags,
      content,
      created_at: now,
      updated_at: now,
    };

    await this.storeFor(scope).save(entry);
    await this.enforceLimit(scope);
    return entry;
  }

  /**
   * Update the content and/or tags of an existing memory.
   * Returns the updated entry, or undefined if the id was not found.
   */
  async update(
    id: string,
    patch: Partial<Pick<MemoryEntry, 'content' | 'tags'>>,
  ): Promise<MemoryEntry | undefined> {
    for (const scope of (['repo', 'host'] as MemoryScope[])) {
      const store = this.storeFor(scope);
      const existing = await store.getById(id);
      if (existing) {
        const updated: MemoryEntry = {
          ...existing,
          ...patch,
          updated_at: new Date().toISOString(),
        };
        await store.save(updated);
        return updated;
      }
    }
    return undefined;
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<boolean> {
    const fromHost = await this.hostMemory.delete(id);
    const fromRepo = this.repoMemory
      ? await this.repoMemory.delete(id)
      : false;
    return fromHost || fromRepo;
  }

  async clearAll(): Promise<void> {
    await this.hostMemory.clear();
    if (this.repoMemory) {
      await this.repoMemory.clear();
    }
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  async query(q: MemoryQuery): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];

    if (q.scope === 'repo' || !q.scope) {
      if (this.repoMemory) {
        results.push(...(await this.repoMemory.query(q)));
      }
    }

    if (q.scope === 'host' || !q.scope) {
      results.push(...(await this.hostMemory.query(q)));
    }

    return q.limit !== undefined ? results.slice(0, q.limit) : results;
  }

  async getById(id: string): Promise<MemoryEntry | undefined> {
    return (
      (await this.hostMemory.getById(id)) ??
      (this.repoMemory ? await this.repoMemory.getById(id) : undefined)
    );
  }

  async all(scope?: MemoryScope): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    if (!scope || scope === 'repo') {
      results.push(...(this.repoMemory ? await this.repoMemory.all() : []));
    }
    if (!scope || scope === 'host') {
      results.push(...(await this.hostMemory.all()));
    }
    return results;
  }

  // ── Organisation helpers ───────────────────────────────────────────────────

  async allTags(): Promise<string[]> {
    return MemoryOrganizer.allTags(await this.all());
  }

  /**
   * Build a compact context block for injection into an LLM prompt.
   */
  async buildContextBlock(q: MemoryQuery): Promise<string> {
    const entries = await this.query(q);
    return MemoryOrganizer.buildContextBlock(entries);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private storeFor(scope: MemoryScope): RepoMemory | HostMemory {
    if (scope === 'repo') {
      if (!this.repoMemory) {
        throw new Error(
          'Repo memory is unavailable: no workspace folder is open.',
        );
      }
      return this.repoMemory;
    }
    return this.hostMemory;
  }

  private async enforceLimit(scope: MemoryScope): Promise<void> {
    let max: number;
    if (this.maxEntriesOverride !== undefined) {
      max = this.maxEntriesOverride;
    } else {
      const cfg = vscode.workspace.getConfiguration('openCursor');
      max = cfg.get('memory.maxEntriesPerScope') ?? 500;
    }

    const store = this.storeFor(scope);
    const all = await store.all();
    const toEvict = MemoryOrganizer.evictOldest(all, max);
    for (const e of toEvict) {
      await store.delete(e.id);
    }
  }
}
