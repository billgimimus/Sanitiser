/**
 * Entry point: wires the UI to the domain modules.
 *
 * Kept intentionally boring: DOM lookups, event handlers, and calls out
 * to the domain modules. Any logic that would grow past a screenful
 * belongs in its own module.
 *
 * Public surface: none (side effects on window load).
 */

import {
  hasFileSystemAccess, pickRoot, listCases, readFileText, writeFileText,
  ensureCaseFolders, readJSON, writeJSON,
} from './filesystem.js';
import { loadMapping, saveMapping, addEntry, addAlias, findByOriginal } from './mapping.js';
import {
  detectEntities, applySanitisation, buildHeader, headerSentinel,
} from './sanitiser.js';
import { openReviewDialog } from './review-ui.js';
import { rehydrate } from './rehydrator.js';
import { checkOutgoing } from './integrity.js';
import { copyText, readText, setIndicator } from './clipboard.js';
import {
  createCase, closeCase, reopenCase, CLOSURE_REASONS, isSoftReopen,
} from './case-manager.js';
import { appendAudit } from './audit.js';

const state = {
  handles: null,
  view: 'open',
  cases: [],
  selectedCaseId: null,
  selectedFile: null,
  currentText: null,
  currentSanitised: null,
  currentSanitisedMtime: null,
  currentOriginalMtime: null,
  currentMapping: null,
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  if (!hasFileSystemAccess()) {
    document.getElementById('browser-warning').hidden = false;
    document.getElementById('btn-open-root').disabled = true;
    return;
  }
  document.getElementById('btn-open-root').addEventListener('click', onOpenRoot);
  document.getElementById('btn-new-case').addEventListener('click', onNewCase);
  document.getElementById('btn-paste-rehydrate').addEventListener('click', onPasteRehydrate);
  document.querySelectorAll('#sidebar .tab').forEach((btn) => {
    btn.addEventListener('click', () => switchSidebarView(btn.dataset.view));
  });
  document.getElementById('btn-sanitise').addEventListener('click', onSanitise);
  document.getElementById('btn-copy-sanitised').addEventListener('click', onCopySanitised);
  document.getElementById('btn-resanitise').addEventListener('click', onSanitise);
  document.querySelectorAll('#file-view .tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => switchFileTab(btn.dataset.tab));
  });
}

async function onOpenRoot() {
  try {
    state.handles = await pickRoot();
    document.getElementById('root-path').textContent = 'Casework folder ready';
    await refreshCases();
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    showToast(`Could not open folder: ${err.message}`, true);
  }
}

async function refreshCases() {
  state.cases = await listCases(state.handles, state.view);
  renderSidebar();
}

function renderSidebar() {
  const list = document.getElementById('case-list');
  list.innerHTML = '';
  if (!state.cases.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.style.padding = '12px';
    empty.textContent = state.view === 'open'
      ? 'No open cases. Click New case to add one.'
      : 'No closed cases.';
    list.appendChild(empty);
    return;
  }
  for (const c of state.cases) {
    const item = document.createElement('div');
    item.className = 'case-item' + (state.selectedCaseId === c.id ? ' selected' : '');
    const meta = c.meta && c.meta.closureReason
      ? `Closed: ${c.meta.closureReason}`
      : `${c.files.length} file${c.files.length === 1 ? '' : 's'}`;
    item.innerHTML = `
      <div class="case-id">${escapeHtml(c.id)}</div>
      <div class="case-meta">${escapeHtml(meta)}</div>
    `;
    item.addEventListener('click', () => selectCase(c.id));
    list.appendChild(item);
    if (state.selectedCaseId === c.id) {
      const files = document.createElement('div');
      files.className = 'case-files';
      for (const f of c.files) {
        const fitem = document.createElement('div');
        fitem.className = 'file-item' + (state.selectedFile === f.name ? ' selected' : '');
        const badge = f.hasSanitised ? '<span class="file-badge done">sanitised</span>' : '<span class="file-badge">raw</span>';
        fitem.innerHTML = `<span>${escapeHtml(f.name)}</span>${badge}`;
        fitem.addEventListener('click', (ev) => {
          ev.stopPropagation();
          selectFile(f.name);
        });
        files.appendChild(fitem);
      }
      if (!c.files.length) {
        const drop = document.createElement('div');
        drop.className = 'muted';
        drop.style.padding = '6px 12px';
        drop.textContent = 'No files yet. Drag files here to add them.';
        files.appendChild(drop);
      }
      const actions = document.createElement('div');
      actions.style.padding = '8px 12px';
      actions.style.display = 'flex';
      actions.style.gap = '6px';
      if (c.kind === 'open') {
        const btnClose = document.createElement('button');
        btnClose.textContent = 'Close case';
        btnClose.addEventListener('click', (ev) => { ev.stopPropagation(); onCloseCase(c); });
        actions.appendChild(btnClose);
      } else {
        const btnReopen = document.createElement('button');
        btnReopen.textContent = isSoftReopen(c.meta) ? 'Soft reopen' : 'Reopen';
        btnReopen.addEventListener('click', (ev) => { ev.stopPropagation(); onReopenCase(c); });
        actions.appendChild(btnReopen);
      }
      files.appendChild(actions);
      configureCaseDrop(item, files, c);
      list.appendChild(files);
    }
  }
}

function configureCaseDrop(caseItem, container, caseObj) {
  const dropTargets = [caseItem, container];
  for (const el of dropTargets) {
    el.addEventListener('dragover', (ev) => { ev.preventDefault(); el.style.background = '#eef4fb'; });
    el.addEventListener('dragleave', () => { el.style.background = ''; });
    el.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      el.style.background = '';
      const files = Array.from(ev.dataTransfer.files);
      if (!files.length) return;
      for (const f of files) {
        const buf = await f.arrayBuffer();
        const h = await caseObj.rawHandle.getFileHandle(f.name, { create: true });
        const w = await h.createWritable();
        await w.write(buf);
        await w.close();
      }
      await appendAudit(caseObj.rawHandle, `${files.length} file(s) added: ${files.map((f) => f.name).join(', ')}`);
      await refreshCases();
      showToast(`${files.length} file${files.length === 1 ? '' : 's'} added.`);
    });
  }
}

async function selectCase(id) {
  state.selectedCaseId = id;
  state.selectedFile = null;
  hideFileView();
  renderSidebar();
}

async function selectFile(name) {
  state.selectedFile = name;
  const c = state.cases.find((x) => x.id === state.selectedCaseId);
  if (!c) return;
  try {
    const { text, lastModified } = await readFileText(c.rawHandle, name);
    state.currentText = text;
    state.currentOriginalMtime = lastModified;
    state.currentSanitised = null;
    state.currentSanitisedMtime = null;
    state.currentMapping = await loadMapping(c.rawHandle, c.id);
    let sanitisedText = null;
    try {
      const { text: sText, lastModified: sMtime } = await readFileText(c.sanHandle, name);
      sanitisedText = sText;
      state.currentSanitised = sText;
      state.currentSanitisedMtime = sMtime;
    } catch (_e) { /* not yet sanitised */ }
    renderFileView(name, c, text, sanitisedText);
    renderSidebar();
  } catch (err) {
    showToast(`Could not open file: ${err.message}`, true);
  }
}

function renderFileView(name, caseObj, text, sanitisedText) {
  document.getElementById('welcome').hidden = true;
  document.getElementById('file-view').hidden = false;
  document.getElementById('file-name').textContent = name;
  document.getElementById('file-case').textContent = `Case ${caseObj.id}`;
  document.getElementById('original-content').textContent = text;
  document.getElementById('sanitised-content').textContent = sanitisedText || '';
  document.getElementById('sanitised-status').textContent = sanitisedText
    ? 'This file has been sanitised.'
    : 'This file has not been sanitised yet. Click "Sanitise this file" to review detected entities.';
  const stale = sanitisedText && state.currentOriginalMtime > state.currentSanitisedMtime;
  document.getElementById('stale-warning').hidden = !stale;
  document.getElementById('btn-resanitise').hidden = !sanitisedText;
  document.getElementById('btn-copy-sanitised').disabled = !sanitisedText;
  switchFileTab('original');
}

function hideFileView() {
  document.getElementById('welcome').hidden = false;
  document.getElementById('file-view').hidden = true;
}

function switchFileTab(which) {
  document.querySelectorAll('#file-view .tabs .tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === which);
  });
  document.getElementById('tab-original').hidden = which !== 'original';
  document.getElementById('tab-sanitised').hidden = which !== 'sanitised';
}

async function onSanitise() {
  const c = state.cases.find((x) => x.id === state.selectedCaseId);
  if (!c || !state.selectedFile) return;
  const mapping = state.currentMapping;
  const entities = detectEntities(state.currentText, mapping);
  const result = await openReviewDialog(entities, mapping, { title: state.selectedFile });
  if (!result) return;
  // New entries were pushed onto mapping.entries inside finaliseDecisions.
  // mappingUpdates only carries alias additions to existing entries.
  for (const upd of result.mappingUpdates) {
    if (upd.aliasFor) addAlias(mapping, upd.aliasFor, upd.alias);
  }
  const sanitised = applySanitisation(state.currentText, result.decisions);
  const offenders = checkOutgoing(sanitised, mapping);
  if (offenders.length) {
    showToast(`Sanitisation blocked. ${offenders.length} real identifier${offenders.length === 1 ? '' : 's'} still present: ${offenders.map((o) => o.original).join(', ')}`, true);
    return;
  }
  const header = buildHeader({
    caseId: c.id,
    sourceName: state.selectedFile,
    tokensUsed: result.decisions.filter((d) => d.action === 'tokenise').map((d) => d.token),
    sanitisedDateISO: new Date().toISOString(),
  });
  const output = header + sanitised;
  await writeFileText(c.sanHandle, state.selectedFile, output);
  await saveMapping(c.rawHandle, mapping);
  await appendAudit(c.rawHandle, `Sanitised: ${state.selectedFile} (${result.decisions.length} decisions, ${result.mappingUpdates.length} new mapping entries)`);
  state.currentMapping = mapping;
  await selectFile(state.selectedFile);
  showToast('Sanitised file written.');
}

async function onCopySanitised() {
  if (!state.currentSanitised) return;
  try {
    await copyText(state.currentSanitised, `sanitised ${state.selectedFile}`);
    showToast('Sanitised text copied. Paste into your AI service.');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function onPasteRehydrate() {
  if (!state.selectedCaseId) {
    showToast('Select a case first so the tool knows which mapping to use.', true);
    return;
  }
  const c = state.cases.find((x) => x.id === state.selectedCaseId);
  if (!c) return;
  let text = '';
  try { text = await readText(); } catch (err) { showToast(err.message, true); return; }
  if (!text) { showToast('Clipboard is empty.', true); return; }
  const mapping = await loadMapping(c.rawHandle, c.id);
  const { hits, replaced, cleaned } = rehydrate(text, mapping);
  if (hits.length) {
    await showRehydrateIntegrityDialog(hits, replaced, cleaned, mapping);
    return;
  }
  try {
    await copyText(replaced, 'rehydrated text');
    await appendAudit(c.rawHandle, `Rehydrated ${text.length} chars (${(text.match(/\[[A-Z_]+.*?\]/g) || []).length} tokens).`);
    showToast('Rehydrated text copied. Paste into Outlook or CRM.');
  } catch (err) {
    showToast(err.message, true);
  }
}

function showRehydrateIntegrityDialog(hits, replaced, cleaned, mapping) {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root');
    root.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    backdrop.appendChild(modal);
    modal.innerHTML = `
      <div class="modal-header">Reverse integrity check found real identifiers</div>
      <div class="modal-body">
        <p>The pasted text contains real identifiers from this case's mapping. These would normally live only in the raw material, not in AI output. Choose how to proceed.</p>
        <div class="integrity-block">
          <strong>${hits.length} match${hits.length === 1 ? '' : 'es'}:</strong>
          <ul>
            ${hits.map((h) => `<li>${escapeHtml(h.original)} → suggested token ${escapeHtml(h.token)}</li>`).join('')}
          </ul>
        </div>
      </div>
      <div class="modal-footer">
        <button data-action="abort" class="danger">Abort</button>
        <button data-action="view">View both texts</button>
        <button data-action="auto" class="primary">Auto-replace and copy</button>
      </div>
    `;
    modal.addEventListener('click', async (ev) => {
      const action = ev.target.dataset && ev.target.dataset.action;
      if (!action) return;
      if (action === 'abort') {
        backdrop.remove();
        showToast('Rehydration aborted. Nothing on the clipboard.', true);
        resolve();
        return;
      }
      if (action === 'view') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.body.innerText = `--- CLEANED INPUT ---\n${cleaned}\n\n--- WOULD REHYDRATE TO ---\n${replaced}`;
        }
        return;
      }
      if (action === 'auto') {
        let corrected = cleaned;
        const sortedHits = [...hits].sort((a, b) => b.start - a.start);
        for (const h of sortedHits) {
          corrected = corrected.slice(0, h.start) + h.token + corrected.slice(h.end);
        }
        const { replaced: finalText } = rehydrate(corrected, mapping);
        try {
          await copyText(finalText, 'rehydrated text (auto-corrected)');
          showToast('Auto-corrected and copied. Review before use.');
        } catch (err) {
          showToast(err.message, true);
        }
        backdrop.remove();
        resolve();
      }
    });
    root.appendChild(backdrop);
  });
}

async function onNewCase() {
  const id = prompt('New case ID (Shelter R-number or action number):');
  if (!id) return;
  const trimmed = id.trim();
  if (!/^[A-Z0-9\-]{2,32}$/i.test(trimmed)) {
    showToast('Case IDs may only contain letters, digits, and hyphens.', true);
    return;
  }
  if (state.cases.some((c) => c.id.toLowerCase() === trimmed.toLowerCase())) {
    showToast('A case with that ID already exists.', true);
    return;
  }
  try {
    await createCase(state.handles, trimmed);
    await refreshCases();
    selectCase(trimmed);
    showToast(`Case ${trimmed} created.`);
  } catch (err) {
    showToast(`Could not create case: ${err.message}`, true);
  }
}

async function onCloseCase(caseObj) {
  const reason = await promptClosureReason();
  if (!reason) return;
  const note = prompt('Optional closure note (leave blank to skip):') || '';
  try {
    await closeCase(state.handles, caseObj, { reason, note });
    state.selectedCaseId = null;
    state.selectedFile = null;
    hideFileView();
    await refreshCases();
    showToast(`Case ${caseObj.id} closed.`);
  } catch (err) {
    showToast(`Could not close case: ${err.message}`, true);
  }
}

async function onReopenCase(caseObj) {
  const soft = isSoftReopen(caseObj.meta);
  let reason = '';
  let note = '';
  if (!soft) {
    reason = prompt('Reopen reason (leave blank to skip):') || '';
    note = prompt('Optional reopen note (leave blank to skip):') || '';
  }
  try {
    await reopenCase(state.handles, caseObj, { reason, note });
    state.selectedCaseId = null;
    state.selectedFile = null;
    hideFileView();
    await refreshCases();
    showToast(`Case ${caseObj.id} reopened${soft ? ' (soft, within seven-day window)' : ''}.`);
  } catch (err) {
    showToast(`Could not reopen case: ${err.message}`, true);
  }
}

function promptClosureReason() {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root');
    root.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    backdrop.appendChild(modal);
    modal.innerHTML = `
      <div class="modal-header">Close case</div>
      <div class="modal-body">
        <div class="form-row">
          <label>Closure reason</label>
          <select id="closure-reason">
            ${CLOSURE_REASONS.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button data-action="cancel">Cancel</button>
        <button class="primary" data-action="ok">Close case</button>
      </div>
    `;
    modal.addEventListener('click', (ev) => {
      const a = ev.target.dataset && ev.target.dataset.action;
      if (a === 'cancel') { backdrop.remove(); resolve(null); }
      if (a === 'ok') {
        const r = modal.querySelector('#closure-reason').value;
        backdrop.remove();
        resolve(r);
      }
    });
    root.appendChild(backdrop);
  });
}

function switchSidebarView(which) {
  state.view = which;
  state.selectedCaseId = null;
  state.selectedFile = null;
  hideFileView();
  document.querySelectorAll('#sidebar .tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === which);
  });
  refreshCases();
}

function showToast(msg, isError = false) {
  const root = document.getElementById('toast-root');
  root.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 6000);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Silence "unused" hints for imports kept for future use in later phases.
void ensureCaseFolders; void readJSON; void writeJSON; void addEntry;
void findByOriginal; void headerSentinel; void setIndicator;
