/**
 * Shared types for the Open-Cursor memory system.
 */

export type MemoryScope = 'repo' | 'host';

export interface MemoryEntry {
  /** Stable UUID for this memory. */
  id: string;
  /** Whether the memory lives in the repo or on the host machine. */
  scope: MemoryScope;
  /** Free-form tags for organisation (e.g. ['api', 'design', 'bug']). */
  tags: string[];
  /** The actual memory content. */
  content: string;
  /** ISO-8601 creation timestamp. */
  created_at: string;
  /** ISO-8601 last-updated timestamp. */
  updated_at: string;
}

export interface MemoryQuery {
  /** Filter by scope. Omit to search both scopes. */
  scope?: MemoryScope;
  /** All specified tags must be present. */
  tags?: string[];
  /** Case-insensitive substring search against content. */
  search?: string;
  /** Maximum number of results to return. */
  limit?: number;
}
