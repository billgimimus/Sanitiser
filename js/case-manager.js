/**
 * Case lifecycle.
 *
 * Creates cases, records closure and reopen events in _closure.json, and
 * moves case folders between active and closed roots. Also handles the
 * soft reopen distinction: a case reopened within seven days of closure
 * cancels the closure outright, no closed audit is preserved.
 *
 * Public surface: createCase, closeCase, reopenCase, isSoftReopen,
 * CLOSURE_REASONS.
 */

import { ensureCaseFolders, readJSON, writeJSON, moveCase } from './filesystem.js';
import { saveMapping, loadMapping } from './mapping.js';
import { appendAudit } from './audit.js';

const CLOSURE_FILENAME = '_closure.json';
const SOFT_REOPEN_DAYS = 7;

export const CLOSURE_REASONS = [
  'Advice given',
  'No engagement',
  'Referred out',
  'Rejected after three attempts',
  'Other',
];

export async function createCase(handles, caseId) {
  const { rawHandle, sanHandle } = await ensureCaseFolders(handles, caseId, false);
  const mapping = await loadMapping(rawHandle, caseId);
  await saveMapping(rawHandle, mapping);
  await writeJSON(rawHandle, CLOSURE_FILENAME, {
    version: 1,
    caseId,
    state: 'open',
    createdAt: new Date().toISOString(),
    events: [{ type: 'created', at: new Date().toISOString() }],
  });
  await appendAudit(rawHandle, `Case created: ${caseId}`);
  return { rawHandle, sanHandle };
}

export async function closeCase(handles, caseObj, { reason, note }) {
  const closure = (await readJSON(caseObj.rawHandle, CLOSURE_FILENAME)) || {
    version: 1,
    caseId: caseObj.id,
    events: [],
  };
  closure.state = 'closed';
  closure.closedAt = new Date().toISOString();
  closure.closureReason = reason;
  closure.closureNote = note || '';
  closure.events = closure.events || [];
  closure.events.push({
    type: 'closed',
    at: closure.closedAt,
    reason,
    note: note || '',
  });
  await writeJSON(caseObj.rawHandle, CLOSURE_FILENAME, closure);
  await appendAudit(caseObj.rawHandle, `Case closed: reason=${reason}${note ? `, note=${note}` : ''}`);
  await moveCase(handles, caseObj.id, true);
}

export async function reopenCase(handles, caseObj, { reason, note }) {
  const closure = (await readJSON(caseObj.rawHandle, CLOSURE_FILENAME)) || {
    version: 1,
    caseId: caseObj.id,
    events: [],
  };
  const soft = isSoftReopen(closure);
  await moveCase(handles, caseObj.id, false);

  const { rawHandle } = await ensureCaseFolders(handles, caseObj.id, false);
  const now = new Date().toISOString();
  if (soft) {
    if (closure.events && closure.events.length) {
      closure.events = closure.events.filter((e) => e.type !== 'closed');
    }
    delete closure.closedAt;
    delete closure.closureReason;
    delete closure.closureNote;
    closure.state = 'open';
    closure.events.push({ type: 'soft_reopen', at: now });
    await writeJSON(rawHandle, CLOSURE_FILENAME, closure);
    await appendAudit(rawHandle, 'Case soft-reopened within seven-day window; closure event removed.');
  } else {
    closure.state = 'open';
    closure.events = closure.events || [];
    closure.events.push({
      type: 'reopen',
      at: now,
      reason: reason || '',
      note: note || '',
    });
    delete closure.closedAt;
    delete closure.closureReason;
    delete closure.closureNote;
    await writeJSON(rawHandle, CLOSURE_FILENAME, closure);
    await appendAudit(rawHandle, `Case reopened${reason ? `: reason=${reason}` : ''}${note ? `, note=${note}` : ''}`);
  }
}

export function isSoftReopen(closure) {
  if (!closure || closure.state !== 'closed') return false;
  if (!closure.closedAt) return false;
  const closedMs = Date.parse(closure.closedAt);
  if (Number.isNaN(closedMs)) return false;
  const ageDays = (Date.now() - closedMs) / (1000 * 60 * 60 * 24);
  return ageDays <= SOFT_REOPEN_DAYS;
}
