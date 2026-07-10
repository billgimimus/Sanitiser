/**
 * Entity review dialog.
 *
 * Presents detected spans to the adviser as a table. Each row lets them
 * choose one of: preserve, apply an existing role, allocate a new role
 * from the vocabulary, or supply a custom token. Judgement-call rows
 * (address_line, name_possible) start unresolved and cannot be left in
 * that state when the adviser tries to save.
 *
 * The dialog also exposes the sanitised preview so the adviser can eye
 * the outcome before writing it to disk.
 *
 * Public surface: openReviewDialog(entities, mapping, options).
 * Resolves with { decisions, mappingUpdates } or null if cancelled.
 */

import {
  ROLE_GROUPS,
  ALL_ROLES,
  CATEGORY_LABELS,
  CATEGORY_DEFAULT_ROLE,
  JUDGEMENT_CATEGORIES,
  PRESERVED_CATEGORIES,
} from './roles.js';
import { findByOriginal } from './mapping.js';

export function openReviewDialog(entities, mapping, options = {}) {
  return new Promise((resolve) => {
    const decisions = entities.map((e) => initialDecision(e, mapping));

    const root = document.getElementById('dialog-root');
    root.innerHTML = '';

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.width = '900px';
    backdrop.appendChild(modal);

    modal.innerHTML = `
      <div class="modal-header">Review detected entities: ${escapeHtml(options.title || 'file')}</div>
      <div class="modal-body">
        <p class="muted">Assign a role or preserve for each item. Anything highlighted in orange requires a decision before saving.</p>
        <div id="review-summary" class="muted" style="margin-bottom:8px"></div>
        <table class="entity-table">
          <thead>
            <tr>
              <th style="width:32%">Detected</th>
              <th style="width:14%">Category</th>
              <th style="width:22%">Action</th>
              <th style="width:32%">Token or replacement</th>
            </tr>
          </thead>
          <tbody id="review-body"></tbody>
        </table>
      </div>
      <div class="modal-footer">
        <button data-action="cancel">Cancel</button>
        <button class="primary" data-action="save">Save sanitised file</button>
      </div>
    `;

    const tbody = modal.querySelector('#review-body');
    decisions.forEach((d, i) => tbody.appendChild(renderRow(d, i, mapping)));
    updateSummary(modal, decisions);

    modal.addEventListener('change', (ev) => {
      const rowEl = ev.target.closest('tr[data-idx]');
      if (!rowEl) return;
      const idx = Number(rowEl.dataset.idx);
      updateDecisionFromRow(decisions[idx], rowEl);
      refreshRow(rowEl, decisions[idx]);
      updateSummary(modal, decisions);
    });

    modal.addEventListener('input', (ev) => {
      if (ev.target.matches('input[data-role="custom"]')) {
        const rowEl = ev.target.closest('tr[data-idx]');
        const idx = Number(rowEl.dataset.idx);
        decisions[idx].token = ev.target.value;
        updateSummary(modal, decisions);
      }
    });

    modal.addEventListener('click', (ev) => {
      const action = ev.target.dataset && ev.target.dataset.action;
      if (action === 'cancel') {
        cleanup();
        resolve(null);
      } else if (action === 'save') {
        const unresolved = decisions.filter(isUnresolved);
        if (unresolved.length) {
          highlightUnresolved(tbody, decisions);
          const summary = modal.querySelector('#review-summary');
          summary.textContent = `${unresolved.length} item${unresolved.length === 1 ? '' : 's'} still need a decision.`;
          summary.classList.add('warning');
          return;
        }
        const { finalDecisions, mappingUpdates } = finaliseDecisions(decisions, mapping);
        cleanup();
        resolve({ decisions: finalDecisions, mappingUpdates });
      }
    });

    function cleanup() { backdrop.remove(); }
    root.appendChild(backdrop);
  });
}

function initialDecision(entity, mapping) {
  const base = {
    ...entity,
    action: 'unresolved',
    token: '',
    replacement: null,
  };
  if (entity.known) {
    base.action = 'tokenise';
    base.token = entity.known.token;
    return base;
  }
  if (PRESERVED_CATEGORIES.has(entity.category)) {
    base.action = 'preserve';
    return base;
  }
  if (entity.category === 'postcode_full' && entity.extra && entity.extra.outward) {
    base.action = 'partial';
    base.replacement = entity.extra.outward;
    return base;
  }
  const def = CATEGORY_DEFAULT_ROLE[entity.category];
  if (def && !JUDGEMENT_CATEGORIES.has(entity.category)) {
    base.action = 'tokenise';
    base.token = def;
    return base;
  }
  return base;
}

function renderRow(decision, idx) {
  const tr = document.createElement('tr');
  tr.dataset.idx = String(idx);
  const original = escapeHtml(decision.text);
  const context = escapeHtml(`${decision.contextBefore}⟨${decision.text}⟩${decision.contextAfter}`);
  const catLabel = CATEGORY_LABELS[decision.category] || decision.category;
  const flag = JUDGEMENT_CATEGORIES.has(decision.category) ? '<span class="chip flag">review</span>' : '';
  tr.innerHTML = `
    <td>
      <div class="entity-original">${original}</div>
      <div class="entity-category">${escapeHtml(context)}</div>
    </td>
    <td>${flag}<span class="entity-category">${escapeHtml(catLabel)}</span></td>
    <td>${renderActionSelect(decision)}</td>
    <td>${renderTokenControl(decision)}</td>
  `;
  return tr;
}

function renderActionSelect(decision) {
  const opts = [
    { v: 'unresolved', l: 'Choose action' },
    { v: 'tokenise', l: 'Tokenise (role token)' },
    { v: 'preserve', l: 'Preserve as-is' },
  ];
  if (decision.category === 'postcode_full') {
    opts.push({ v: 'partial', l: 'Truncate to outward code' });
  }
  const selected = decision.action;
  return `<select data-role="action">${opts
    .map((o) => `<option value="${o.v}"${o.v === selected ? ' selected' : ''}>${o.l}</option>`)
    .join('')}</select>`;
}

function renderTokenControl(decision) {
  if (decision.action === 'preserve') return '<span class="muted">preserved</span>';
  if (decision.action === 'partial') return `<span class="entity-original">${escapeHtml(decision.replacement || '')}</span>`;
  if (decision.action === 'tokenise') {
    return `
      <select data-role="token">
        ${ROLE_GROUPS.map((g) => `
          <optgroup label="${escapeHtml(g.label)}">
            ${g.roles.map((r) => `<option value="${escapeHtml(r)}"${r === decision.token ? ' selected' : ''}>${escapeHtml(r)}</option>`).join('')}
          </optgroup>
        `).join('')}
      </select>
      <input data-role="custom" placeholder="or type custom [ROLE]" value="${escapeHtml(startsCustom(decision.token) ? decision.token : '')}">
    `;
  }
  return '<span class="muted">choose an action</span>';
}

function startsCustom(tok) {
  return tok && !ALL_ROLES.includes(tok);
}

function updateDecisionFromRow(decision, rowEl) {
  const action = rowEl.querySelector('select[data-role="action"]').value;
  decision.action = action;
  if (action === 'tokenise') {
    const sel = rowEl.querySelector('select[data-role="token"]');
    const custom = rowEl.querySelector('input[data-role="custom"]');
    if (custom && custom.value.trim()) decision.token = custom.value.trim();
    else if (sel) decision.token = sel.value;
  }
}

function refreshRow(rowEl, decision) {
  const tokenCell = rowEl.children[3];
  tokenCell.innerHTML = renderTokenControl(decision);
}

function isUnresolved(d) {
  if (d.action === 'unresolved') return true;
  if (d.action === 'tokenise' && !d.token) return true;
  return false;
}

function highlightUnresolved(tbody, decisions) {
  Array.from(tbody.children).forEach((tr, i) => {
    tr.style.background = isUnresolved(decisions[i]) ? '#fff4e0' : '';
  });
}

function updateSummary(modal, decisions) {
  const total = decisions.length;
  const unresolved = decisions.filter(isUnresolved).length;
  const summary = modal.querySelector('#review-summary');
  summary.classList.remove('warning');
  summary.textContent = `${total} detected, ${unresolved} still to decide.`;
}

/**
 * Convert reviewed decisions into the final decisions list, mutating the
 * mapping in-place with any new entries and returning a list of alias
 * updates for the caller to persist.
 *
 * Token allocation runs as a two-pass process because a role that
 * appears twice in one document must retro-fit the first occurrence
 * from `[LANDLORD]` to `[LANDLORD_1]` and give the second `[LANDLORD_2]`.
 * The spec requires the bare form for a solo occurrence, so we cannot
 * pre-emptively number.
 */
function finaliseDecisions(decisions, mapping) {
  const aliasUpdates = [];
  const finalDecisions = decisions.map((d) => ({ ...d }));

  const intents = [];
  const dedupByText = new Map();
  finalDecisions.forEach((d, i) => {
    if (d.action !== 'tokenise') return;
    const existing = findByOriginal(mapping, d.text);
    if (existing) {
      d.token = existing.token;
      if (!sameText(existing.original, d.text)
        && !(existing.aliases || []).some((a) => sameText(a, d.text))) {
        aliasUpdates.push({ aliasFor: existing.token, alias: d.text });
      }
      return;
    }
    const key = d.text.toLowerCase();
    if (dedupByText.has(key)) {
      dedupByText.get(key).linkedIndices.push(i);
      return;
    }
    const intent = {
      baseToken: d.token,
      text: d.text,
      category: d.category,
      primaryIndex: i,
      linkedIndices: [],
    };
    dedupByText.set(key, intent);
    intents.push(intent);
  });

  const byBase = new Map();
  for (const intent of intents) {
    const arr = byBase.get(intent.baseToken) || [];
    arr.push(intent);
    byBase.set(intent.baseToken, arr);
  }
  const now = new Date().toISOString();
  for (const [baseTok, group] of byBase) {
    const tokens = allocateGroup(baseTok, group.length, mapping);
    group.forEach((intent, i) => {
      const tok = tokens[i];
      finalDecisions[intent.primaryIndex].token = tok;
      for (const li of intent.linkedIndices) finalDecisions[li].token = tok;
      mapping.entries.push({
        original: intent.text,
        token: tok,
        category: intent.category,
        aliases: [],
        createdAt: now,
      });
    });
  }
  return { finalDecisions, mappingUpdates: aliasUpdates };
}

/**
 * Allocate `count` fresh tokens under `baseTok`, taking prior mapping
 * state into account. If retro-fitting is needed to convert an existing
 * bare `[LANDLORD]` into `[LANDLORD_1]`, this mutates that entry.
 * Custom (non-vocabulary) tokens are used verbatim for every occurrence.
 */
function allocateGroup(baseTok, count, mapping) {
  if (!ALL_ROLES.includes(baseTok)) {
    return Array(count).fill(baseTok);
  }
  const roleName = baseTok.slice(1, -1);
  const numberedRegex = new RegExp(`^\\[${escapeRegex(roleName)}_(\\d+)\\]$`);
  const priorBare = mapping.entries.filter((e) => e.token === baseTok);
  const priorNumbered = mapping.entries
    .map((e) => (e.token.match(numberedRegex) || [])[1])
    .filter(Boolean).map(Number);
  const maxPrior = priorNumbered.length ? Math.max(...priorNumbered) : 0;
  const solo = count === 1 && priorBare.length === 0 && maxPrior === 0;
  if (solo) return [baseTok];
  if (priorBare.length === 1 && maxPrior === 0) {
    priorBare[0].token = `[${roleName}_1]`;
  }
  const baseN = Math.max(maxPrior, priorBare.length);
  const out = [];
  for (let i = 0; i < count; i++) out.push(`[${roleName}_${baseN + i + 1}]`);
  return out;
}

function sameText(a, b) { return (a || '').toLowerCase() === (b || '').toLowerCase(); }
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
