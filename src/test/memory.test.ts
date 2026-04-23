/**
 * Memory system unit tests.
 * Runs with plain Node.js (no VSCode host needed).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RepoMemory } from '../memory/RepoMemory';
import { HostMemory } from '../memory/HostMemory';
import { MemoryOrganizer } from '../memory/MemoryOrganizer';
import { MemoryEntry } from '../memory/types';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: overrides.id ?? `test-${Math.random().toString(36).slice(2)}`,
    scope: overrides.scope ?? 'host',
    tags: overrides.tags ?? ['general'],
    content: overrides.content ?? 'Test memory content',
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'open-cursor-test-'));
}

// ── RepoMemory ────────────────────────────────────────────────────────────────

describe('RepoMemory', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = tmpDir();
    mem = new RepoMemory(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('saves and retrieves an entry by id', async () => {
    const entry = makeEntry({ id: 'abc123', tags: ['api'] });
    await mem.save(entry);
    const found = await mem.getById('abc123');
    assert.ok(found);
    assert.strictEqual(found.content, entry.content);
  });

  it('returns undefined for unknown id', async () => {
    const found = await mem.getById('nonexistent');
    assert.strictEqual(found, undefined);
  });

  it('deletes an entry', async () => {
    const entry = makeEntry({ id: 'del1', tags: ['bug'] });
    await mem.save(entry);
    const deleted = await mem.delete('del1');
    assert.ok(deleted);
    assert.strictEqual(await mem.getById('del1'), undefined);
  });

  it('returns false when deleting nonexistent entry', async () => {
    const deleted = await mem.delete('no-such-id');
    assert.strictEqual(deleted, false);
  });

  it('queries by tag', async () => {
    await mem.save(makeEntry({ id: 'a1', tags: ['api', 'design'] }));
    await mem.save(makeEntry({ id: 'b1', tags: ['bug'] }));

    const results = await mem.query({ tags: ['api'] });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'a1');
  });

  it('queries by search term (case-insensitive)', async () => {
    await mem.save(makeEntry({ id: 'c1', content: 'HATEOAS conventions', tags: ['api'] }));
    await mem.save(makeEntry({ id: 'c2', content: 'unrelated content', tags: ['misc'] }));

    const results = await mem.query({ search: 'hateoas' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'c1');
  });

  it('respects the limit option', async () => {
    for (let i = 0; i < 5; i++) {
      await mem.save(makeEntry({ id: `limit-${i}`, tags: ['test'] }));
    }
    const results = await mem.query({ limit: 3 });
    assert.strictEqual(results.length, 3);
  });

  it('clears all entries', async () => {
    await mem.save(makeEntry({ id: 'clear1', tags: ['x'] }));
    await mem.clear();
    const all = await mem.all();
    assert.strictEqual(all.length, 0);
  });

  it('lists all entries', async () => {
    await mem.save(makeEntry({ id: 'all1', tags: ['t1'] }));
    await mem.save(makeEntry({ id: 'all2', tags: ['t2'] }));
    const all = await mem.all();
    assert.strictEqual(all.length, 2);
  });
});

// ── HostMemory ────────────────────────────────────────────────────────────────

describe('HostMemory', () => {
  let dir: string;
  let mem: HostMemory;

  beforeEach(() => {
    dir = tmpDir();
    mem = new HostMemory(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('saves and retrieves an entry', async () => {
    const entry = makeEntry({ id: 'h1', scope: 'host', tags: ['pref'] });
    await mem.save(entry);
    const found = await mem.getById('h1');
    assert.ok(found);
    assert.strictEqual(found.id, 'h1');
  });

  it('deletes an entry', async () => {
    const entry = makeEntry({ id: 'hdel', scope: 'host' });
    await mem.save(entry);
    assert.ok(await mem.delete('hdel'));
    assert.strictEqual(await mem.getById('hdel'), undefined);
  });

  it('returns false when deleting nonexistent entry', async () => {
    assert.strictEqual(await mem.delete('ghost'), false);
  });

  it('clears all entries', async () => {
    await mem.save(makeEntry({ id: 'hc1', tags: ['a'] }));
    await mem.clear();
    assert.strictEqual((await mem.all()).length, 0);
  });
});

// ── MemoryOrganizer ───────────────────────────────────────────────────────────

describe('MemoryOrganizer', () => {
  it('evicts oldest entries when over the limit', () => {
    const entries: MemoryEntry[] = [
      makeEntry({ id: 'old1', created_at: '2023-01-01T00:00:00Z' }),
      makeEntry({ id: 'old2', created_at: '2023-01-02T00:00:00Z' }),
      makeEntry({ id: 'new1', created_at: '2024-01-01T00:00:00Z' }),
    ];
    const evicted = MemoryOrganizer.evictOldest(entries, 2);
    assert.strictEqual(evicted.length, 1);
    assert.strictEqual(evicted[0].id, 'old1');
  });

  it('returns empty array when under the limit', () => {
    const entries = [makeEntry(), makeEntry()];
    assert.deepStrictEqual(MemoryOrganizer.evictOldest(entries, 5), []);
  });

  it('collects all unique tags sorted alphabetically', () => {
    const entries: MemoryEntry[] = [
      makeEntry({ tags: ['bug', 'api'] }),
      makeEntry({ tags: ['api', 'design'] }),
      makeEntry({ tags: [] }),
    ];
    const tags = MemoryOrganizer.allTags(entries);
    assert.deepStrictEqual(tags, ['api', 'bug', 'design']);
  });

  it('builds a context block with numbered items', () => {
    const entries: MemoryEntry[] = [
      makeEntry({ tags: ['api'], content: 'Use HATEOAS' }),
      makeEntry({ tags: ['style'], content: 'Keep functions short' }),
    ];
    const block = MemoryOrganizer.buildContextBlock(entries);
    assert.ok(block.includes('### Relevant Memories'));
    assert.ok(block.includes('1.'));
    assert.ok(block.includes('Use HATEOAS'));
    assert.ok(block.includes('2.'));
    assert.ok(block.includes('Keep functions short'));
  });

  it('returns empty string for empty entries', () => {
    assert.strictEqual(MemoryOrganizer.buildContextBlock([]), '');
  });

  it('groups entries by primary tag', () => {
    const entries: MemoryEntry[] = [
      makeEntry({ id: 'g1', tags: ['api', 'design'] }),
      makeEntry({ id: 'g2', tags: ['api'] }),
      makeEntry({ id: 'g3', tags: [] }),
    ];
    const groups = MemoryOrganizer.groupByPrimaryTag(entries);
    assert.strictEqual(groups.get('api')!.length, 2);
    assert.strictEqual(groups.get('general')!.length, 1);
  });
});
