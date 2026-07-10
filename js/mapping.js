/**
 * Case mapping store.
 *
 * A mapping is the case's memory of every real identifier that has been
 * tokenised, and the role token it received. Persisted as _mapping.json
 * inside the raw case folder. Deterministic tokenisation across sessions
 * depends on this file, so it is written after every review approval.
 *
 * Shape on disk:
 *   {
 *     "version": 1,
 *     "caseId": "R123456",
 *     "createdAt": "2026-07-10T09:42:11.221Z",
 *     "entries": [
 *       {
 *         "original": "Jane Smith",
 *         "token": "[CL]",
 *         "category": "name_possible",
 *         "aliases": ["Jane", "Ms Smith"],
 *         "createdAt": "..."
 *       },
 *       ...
 *     ]
 *   }
 *
 * Aliases exist so that a "Ms Smith" fragment can still resolve to the
 * client without occupying a fresh token slot. The tokenise code appends
 * an alias whenever it maps a variant of an existing entity's name.
 *
 * Public surface: loadMapping, saveMapping, findByOriginal, findByToken,
 * addEntry, addAlias, allocateNumberedToken, mergeIntoMapping.
 */

import { writeJSON, readJSON } from './filesystem.js';

const MAPPING_FILENAME = '_mapping.json';

export async function loadMapping(rawHandle, caseId) {
  const existing = await readJSON(rawHandle, MAPPING_FILENAME);
  if (existing && existing.version === 1) return existing;
  return {
    version: 1,
    caseId,
    createdAt: new Date().toISOString(),
    entries: [],
  };
}

export async function saveMapping(rawHandle, mapping) {
  await writeJSON(rawHandle, MAPPING_FILENAME, mapping);
}

export function findByOriginal(mapping, original) {
  if (!original) return null;
  const lc = original.toLowerCase();
  for (const e of mapping.entries) {
    if (e.original.toLowerCase() === lc) return e;
    if (e.aliases && e.aliases.some((a) => a.toLowerCase() === lc)) return e;
  }
  return null;
}

export function findByToken(mapping, token) {
  return mapping.entries.find((e) => e.token === token) || null;
}

export function addEntry(mapping, entry) {
  mapping.entries.push({
    original: entry.original,
    token: entry.token,
    category: entry.category || 'custom',
    aliases: entry.aliases || [],
    createdAt: new Date().toISOString(),
    notes: entry.notes || undefined,
  });
}

export function addAlias(mapping, token, alias) {
  const e = findByToken(mapping, token);
  if (!e) return false;
  if (!e.aliases) e.aliases = [];
  if (!e.aliases.includes(alias) && e.original.toLowerCase() !== alias.toLowerCase()) {
    e.aliases.push(alias);
  }
  return true;
}

/**
 * Allocate the next numbered token for a role that already exists in the
 * mapping. If the role has been used once and this is the second entity
 * with the same role, the existing token is retro-fitted to _1 and the
 * new one becomes _2. This gives the readable "[LANDLORD]" for the
 * common single-landlord case, and only introduces numbering under
 * genuine ambiguity, matching the spec's stated intent.
 */
export function allocateNumberedToken(mapping, baseToken) {
  const bare = baseToken.replace(/_\d+\]$/, ']');
  const roleName = bare.slice(1, -1);
  const existing = mapping.entries.filter((e) => {
    const t = e.token;
    return t === bare || new RegExp(`^\\[${escapeRegex(roleName)}_\\d+\\]$`).test(t);
  });
  if (existing.length === 0) return bare;
  if (existing.length === 1 && existing[0].token === bare) {
    existing[0].token = `[${roleName}_1]`;
    return `[${roleName}_2]`;
  }
  const maxN = existing.reduce((m, e) => {
    const match = e.token.match(/_(\d+)\]$/);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `[${roleName}_${maxN + 1}]`;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Merge a linked case's mapping into this case's mapping without
 * clobbering existing entries. Used when a case is opened as a
 * re-referral of a closed case.
 */
export function mergeIntoMapping(target, source) {
  for (const e of source.entries) {
    if (findByOriginal(target, e.original)) continue;
    target.entries.push({ ...e });
  }
}
