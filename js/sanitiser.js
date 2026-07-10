/**
 * Detection and tokenisation.
 *
 * detectEntities produces a list of candidate spans over the raw text.
 * applySanitisation replaces confirmed spans with their assigned tokens,
 * preserving every other byte of the original. The output additionally
 * carries a header block so an accidental paste of sanitised material
 * into a client-facing system is visible on inspection.
 *
 * Public surface: detectEntities, applySanitisation, buildHeader,
 * stripHeader, headerSentinel.
 */

import { DETECTORS } from './patterns.js';
import { findByOriginal } from './mapping.js';

const HEADER_START = '# --- SANITISED CASEWORK MATERIAL ---';
const HEADER_END = '# --- END OF HEADER ---';

export const headerSentinel = HEADER_START;

/**
 * Run every detector over the text and reduce the result to a
 * non-overlapping span list. Where two detectors overlap, the more
 * specific one wins: a postcode inside a longer address wins over the
 * address-line detector, an NI number wins over "possible name", and so
 * on. Specificity is expressed as detector order in DETECTORS.
 */
export function detectEntities(text, mapping) {
  const raw = [];
  DETECTORS.forEach((d, order) => {
    const spans = d.run(text);
    for (const s of spans) raw.push({ ...s, order });
  });
  raw.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (b.end - b.start !== a.end - a.start) return (b.end - b.start) - (a.end - a.start);
    return a.order - b.order;
  });
  const chosen = [];
  let cursor = -1;
  for (const s of raw) {
    if (s.start < cursor) continue;
    chosen.push(s);
    cursor = s.end;
  }
  return chosen.map((s) => decorateWithMapping(s, mapping, text));
}

function decorateWithMapping(span, mapping, text) {
  const known = findByOriginal(mapping, span.text);
  return {
    ...span,
    known: known ? { token: known.token, category: known.category } : null,
    contextBefore: text.slice(Math.max(0, span.start - 30), span.start),
    contextAfter: text.slice(span.end, Math.min(text.length, span.end + 30)),
  };
}

/**
 * Apply the reviewed decisions to the original text. Each decision has
 * one of three actions: 'tokenise' (replace with the given token),
 * 'preserve' (leave the text as-is), or 'partial' (postcode outward-only
 * truncation). The output length differs from the input; nothing outside
 * a replaced span is altered.
 */
export function applySanitisation(text, decisions) {
  const applied = decisions
    .filter((d) => d.action !== 'preserve')
    .sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const d of applied) {
    if (d.start < cursor) continue;
    out += text.slice(cursor, d.start);
    if (d.action === 'partial' && d.replacement) {
      out += d.replacement;
    } else {
      out += d.token || '[REDACTED]';
    }
    cursor = d.end;
  }
  out += text.slice(cursor);
  return out;
}

export function buildHeader({ caseId, sourceName, tokensUsed, sanitisedDateISO }) {
  const uniqueTokens = Array.from(new Set(tokensUsed)).sort();
  const dateLabel = formatDate(sanitisedDateISO);
  const lines = [
    HEADER_START,
    `# Case: ${caseId}`,
    `# Source: ${sourceName}`,
    `# Sanitised: ${dateLabel}`,
    `# Tokens: ${uniqueTokens.join(' ') || '(none)'}`,
    '# This block must be removed before use in client-facing systems.',
    HEADER_END,
    '',
  ];
  return lines.join('\n');
}

/**
 * Remove the header block if present. Used before rehydration so token
 * substitution runs against the sanitised body only.
 */
export function stripHeader(text) {
  const startIdx = text.indexOf(HEADER_START);
  if (startIdx === -1) return text;
  const endIdx = text.indexOf(HEADER_END, startIdx);
  if (endIdx === -1) return text;
  const after = endIdx + HEADER_END.length;
  const nl = text.indexOf('\n', after);
  return text.slice(nl === -1 ? after : nl + 1);
}

function formatDate(iso) {
  const d = new Date(iso);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
