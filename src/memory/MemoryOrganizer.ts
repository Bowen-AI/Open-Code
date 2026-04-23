/**
 * MemoryOrganizer – higher-level utilities for organising memories.
 *
 * Responsibilities:
 *  - Enforce the configured maximum entries per scope (FIFO eviction)
 *  - Collect all unique tags across a set of memories
 *  - Generate concise summaries of a memory set for agent context injection
 */

import { MemoryEntry } from './types';

export class MemoryOrganizer {
  /**
   * Evict the oldest entries so that the list does not exceed `maxEntries`.
   * Returns the evicted entries (so the caller can delete them from storage).
   */
  static evictOldest(
    entries: MemoryEntry[],
    maxEntries: number,
  ): MemoryEntry[] {
    if (entries.length <= maxEntries) {
      return [];
    }

    const sorted = [...entries].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    return sorted.slice(0, entries.length - maxEntries);
  }

  /**
   * Collect all unique tags across the provided entries, sorted alphabetically.
   */
  static allTags(entries: MemoryEntry[]): string[] {
    const tagSet = new Set<string>();
    for (const e of entries) {
      for (const t of e.tags) {
        tagSet.add(t);
      }
    }
    return [...tagSet].sort();
  }

  /**
   * Build a compact text block suitable for injection into an LLM prompt.
   * Each memory is rendered as a numbered item with its tags and content.
   */
  static buildContextBlock(entries: MemoryEntry[]): string {
    if (entries.length === 0) {
      return '';
    }

    const lines: string[] = ['### Relevant Memories'];
    entries.forEach((e, i) => {
      const tagStr = e.tags.length > 0 ? `[${e.tags.join(', ')}]` : '';
      lines.push(`${i + 1}. ${tagStr} ${e.content.trim()}`);
    });

    return lines.join('\n');
  }

  /**
   * Group entries by their first tag (or 'general' if untagged).
   */
  static groupByPrimaryTag(
    entries: MemoryEntry[],
  ): Map<string, MemoryEntry[]> {
    const groups = new Map<string, MemoryEntry[]>();
    for (const e of entries) {
      const key = e.tags.length > 0 ? e.tags[0] : 'general';
      const group = groups.get(key) ?? [];
      group.push(e);
      groups.set(key, group);
    }
    return groups;
  }
}
