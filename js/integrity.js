/**
 * Integrity checks that block writes and warn on paste.
 *
 * checkOutgoing runs immediately before writing a sanitised file. It
 * scans the proposed output for any real identifier present in the
 * mapping and reports the offenders. If it returns a non-empty list,
 * the caller must not write.
 *
 * Public surface: checkOutgoing.
 */

export function checkOutgoing(sanitisedText, mapping) {
  const offenders = [];
  for (const entry of mapping.entries) {
    const originals = [entry.original, ...(entry.aliases || [])];
    for (const original of originals) {
      const trimmed = (original || '').trim();
      if (!trimmed) continue;
      if (entry.category === 'name_possible' && !/\s/.test(trimmed)) continue;
      const rx = literalRegex(trimmed);
      const m = sanitisedText.match(rx);
      if (m) {
        offenders.push({ original: m[0], token: entry.token });
      }
    }
  }
  return offenders;
}

function literalRegex(str) {
  const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const looksAlphaNum = /^[A-Za-z0-9 '\-]+$/.test(str);
  const bounded = looksAlphaNum ? `\\b${escaped}\\b` : escaped;
  return new RegExp(bounded, 'i');
}
