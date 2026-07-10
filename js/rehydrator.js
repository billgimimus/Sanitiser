/**
 * Rehydration: convert tokenised text back to real identifiers, but only
 * after a reverse-direction integrity check has run.
 *
 * The reverse check catches a specific failure mode: the adviser types a
 * real name into the AI chat, the AI echoes it back, and the response is
 * pasted here for rehydration. Without the check, the real name would
 * pass through unnoticed because there is no token to substitute. So we
 * scan the incoming text for any real identifier from the mapping and
 * halt if we find one.
 *
 * The forward pass then substitutes tokens for the real identifiers.
 *
 * Public surface: reverseCheck, forwardReplace, rehydrate.
 */

import { findByToken } from './mapping.js';
import { stripHeader } from './sanitiser.js';

/**
 * Scan the text for occurrences of any real identifier from the mapping.
 * Returns an array of hits: { start, end, original, token }.
 *
 * Common first names are suppressed unless they appear alongside their
 * surname or with a title, to reduce the noise from a chat that happens
 * to mention "John" but not the client. Full names, addresses, emails,
 * phone numbers, and reference-like categories match unconditionally.
 */
export function reverseCheck(text, mapping) {
  const hits = [];
  for (const entry of mapping.entries) {
    const originals = [entry.original, ...(entry.aliases || [])];
    for (const original of originals) {
      const trimmed = (original || '').trim();
      if (!trimmed) continue;
      const suppressed = shouldSuppress(entry, trimmed);
      const rx = buildLiteralRegex(trimmed);
      for (const m of text.matchAll(rx)) {
        if (suppressed && !contextIndicatesName(text, m.index, m[0].length)) continue;
        hits.push({
          start: m.index,
          end: m.index + m[0].length,
          original: m[0],
          token: entry.token,
        });
      }
    }
  }
  hits.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });
  const nonOverlapping = [];
  let cursor = -1;
  for (const h of hits) {
    if (h.start < cursor) continue;
    nonOverlapping.push(h);
    cursor = h.end;
  }
  return nonOverlapping;
}

function shouldSuppress(entry, original) {
  if (entry.category !== 'name_possible') return false;
  return !/\s/.test(original);
}

function contextIndicatesName(text, idx, len) {
  const before = text.slice(Math.max(0, idx - 12), idx);
  const after = text.slice(idx + len, idx + len + 16);
  if (/\b(Mr|Mrs|Ms|Miss|Mx|Dr)\.?\s*$/i.test(before)) return true;
  if (/^\s+[A-Z][a-z]+/.test(after)) return true;
  return false;
}

/**
 * Replace tokens with their real identifiers. Tokens are literal square
 * brackets containing UPPERCASE_LETTERS, apostrophes, numbers, and a
 * handful of punctuation characters used by the vocabulary.
 */
export function forwardReplace(text, mapping) {
  const tokenRegex = /\[[A-Z0-9'\/ _\-.]+?\]/g;
  return text.replace(tokenRegex, (match) => {
    const entry = findByToken(mapping, match);
    return entry ? entry.original : match;
  });
}

/**
 * Full rehydration flow, structured so the caller can decide what to do
 * with a reverse-check hit rather than the tool silently choosing.
 *
 * Returns { hits, replaced }. If hits is non-empty, the caller must
 * present them to the adviser before the replaced text is used.
 */
export function rehydrate(text, mapping) {
  const withoutHeader = stripHeader(text);
  const hits = reverseCheck(withoutHeader, mapping);
  const replaced = forwardReplace(withoutHeader, mapping);
  return { hits, replaced, cleaned: withoutHeader };
}

function buildLiteralRegex(str) {
  const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const looksAlphaNum = /^[A-Za-z0-9 '\-]+$/.test(str);
  const bounded = looksAlphaNum ? `\\b${escaped}\\b` : escaped;
  return new RegExp(bounded, 'gi');
}
