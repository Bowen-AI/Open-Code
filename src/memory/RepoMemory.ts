/**
 * RepoMemory – stores agent memories inside the current workspace repository.
 *
 * Storage layout (relative to workspace root):
 *   .open-cursor/memory/<tag-slug>/<id>.json
 *
 * Each file is a serialised MemoryEntry.  Files can be git-tracked or
 * git-ignored depending on the project's .gitignore configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MemoryEntry, MemoryQuery } from './types';

export class RepoMemory {
  private readonly baseDir: string;

  constructor(workspaceRoot: string) {
    this.baseDir = path.join(workspaceRoot, '.open-cursor', 'memory');
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async save(entry: MemoryEntry): Promise<void> {
    const dir = this.dirForEntry(entry);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${entry.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf8');
  }

  async delete(id: string): Promise<boolean> {
    for (const filePath of this.allFilePaths()) {
      if (path.basename(filePath, '.json') === id) {
        fs.unlinkSync(filePath);
        return true;
      }
    }
    return false;
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async getById(id: string): Promise<MemoryEntry | undefined> {
    for (const filePath of this.allFilePaths()) {
      if (path.basename(filePath, '.json') === id) {
        return this.readFile(filePath);
      }
    }
    return undefined;
  }

  async query(q: MemoryQuery): Promise<MemoryEntry[]> {
    const entries = this.allFilePaths()
      .map((p) => this.readFile(p))
      .filter((e): e is MemoryEntry => e !== undefined);

    return this.applyQuery(entries, q);
  }

  async all(): Promise<MemoryEntry[]> {
    return this.allFilePaths()
      .map((p) => this.readFile(p))
      .filter((e): e is MemoryEntry => e !== undefined);
  }

  async clear(): Promise<void> {
    if (fs.existsSync(this.baseDir)) {
      fs.rmSync(this.baseDir, { recursive: true, force: true });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private dirForEntry(entry: MemoryEntry): string {
    const primaryTag =
      entry.tags.length > 0 ? this.slugify(entry.tags[0]) : 'general';
    return path.join(this.baseDir, primaryTag);
  }

  private slugify(tag: string): string {
    return tag.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  private allFilePaths(): string[] {
    if (!fs.existsSync(this.baseDir)) {
      return [];
    }
    return this.walkDir(this.baseDir).filter((f) => f.endsWith('.json'));
  }

  private walkDir(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.walkDir(full));
      } else {
        results.push(full);
      }
    }
    return results;
  }

  private readFile(filePath: string): MemoryEntry | undefined {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as MemoryEntry;
    } catch {
      return undefined;
    }
  }

  private applyQuery(entries: MemoryEntry[], q: MemoryQuery): MemoryEntry[] {
    let result = entries;

    if (q.tags && q.tags.length > 0) {
      result = result.filter((e) =>
        q.tags!.every((t) => e.tags.includes(t)),
      );
    }

    if (q.search) {
      const needle = q.search.toLowerCase();
      result = result.filter((e) =>
        e.content.toLowerCase().includes(needle),
      );
    }

    if (q.limit !== undefined) {
      result = result.slice(0, q.limit);
    }

    return result;
  }
}
