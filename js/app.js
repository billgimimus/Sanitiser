/**
 * Casework Sanitisation Tool - single-file build.
 *
 * Every module of the original design has been concatenated into this
 * file so the tool runs by opening index.html directly, without needing
 * a local static server. Section markers below identify each module's
 * original responsibility; the code within each section is otherwise
 * unchanged from the modular source.
 *
 * Wrapped in an IIFE so nothing leaks into the global scope of the page.
 */

(function () {
  'use strict';

  // Signal to the fallback banner in index.html that the script did load.
  window.__sanitiserLoaded = true;


// =====================================================================
// js/roles.js
// =====================================================================

/**
 * Role vocabulary and identifier categories.
 *
 * Kept as data, not spread across the UI code, because the vocabulary is
 * expected to evolve as the adviser encounters cases the current list does
 * not cover. Central location makes the tokens auditable at a glance.
 *
 * Public surface: ROLE_GROUPS, ALL_ROLES, CATEGORY_LABELS, JUDGEMENT_CATEGORIES,
 * CATEGORY_DEFAULT_ROLE, SAFE_IDENTITIES.
 */

const ROLE_GROUPS = [
  {
    label: 'Client side',
    roles: [
      '[CL]',
      "[CL'S PARTNER]",
      "[CL'S EX-PARTNER]",
      "[CL'S CHILD]",
      "[CL'S PARENT]",
      "[CL'S SIBLING]",
      "[CL'S SUPPORT WORKER]",
      "[CL'S SOLICITOR]",
      "[CL'S GP]",
      "[CL'S MH PRACTITIONER]",
      "[CL'S EMAIL]",
      "[CL'S PHONE]",
      "[CL'S ADDRESS]",
    ],
  },
  {
    label: 'Landlord side',
    roles: [
      '[LANDLORD]',
      "[LANDLORD'S AGENT]",
      "[LANDLORD'S SOLICITOR]",
      '[MANAGING AGENT]',
      '[SOLICITOR FIRM]',
    ],
  },
  {
    label: 'Local authority side',
    roles: [
      '[LA HOUSING OFFICER]',
      '[LA HOMELESSNESS OFFICER]',
      '[LA REVIEWS OFFICER]',
      '[LA HB/UC DECISION MAKER]',
    ],
  },
  {
    label: 'Referrer side',
    roles: [
      '[REFERRER ORG]',
      '[SM]',
      '[SUPPORT WORKER]',
      '[CASEWORKER]',
      '[IDVA]',
      '[REFERRER EMAIL]',
      '[REFERRER PHONE]',
      '[REFERRER INT REF]',
    ],
  },
  {
    label: 'Court and legal',
    roles: [
      '[COURT]',
      '[JUDGE]',
      '[BAILIFF]',
      '[DUTY SOLICITOR]',
    ],
  },
  {
    label: 'Other',
    roles: [
      '[NEIGHBOUR]',
      '[WITNESS]',
      '[THIRD PARTY]',
    ],
  },
  {
    label: 'Adviser side (safe)',
    roles: [
      '[ADVISER]',
      '[ADVISER EMAIL]',
      '[SHELTER]',
    ],
  },
];

const ALL_ROLES = ROLE_GROUPS.flatMap((g) => g.roles);

const CATEGORY_LABELS = {
  postcode_full: 'Full postcode',
  postcode_outward: 'Postcode area (safe)',
  phone: 'Phone number',
  email: 'Email address',
  ni_number: 'National insurance number',
  nhs_number: 'NHS number',
  passport: 'Passport number',
  brp: 'BRP number',
  hmcts_ref: 'HMCTS reference',
  uc_claim: 'UC / HB / benefit reference',
  bank_details: 'Bank details',
  vrm: 'Vehicle registration',
  dob: 'Date of birth',
  name_possible: 'Possible name (review)',
  address_line: 'Address line',
  currency: 'Currency amount (preserved)',
  date: 'Date (preserved)',
  custom: 'Custom',
};

/**
 * Categories the spec marks as "judgement call" and requires the adviser
 * to actively resolve before the sanitised file can be written.
 */
const JUDGEMENT_CATEGORIES = new Set([
  'name_possible',
  'address_line',
]);

/**
 * When a category has an obvious default role assignment, offer it in the
 * review dialog rather than asking the adviser to pick from scratch. The
 * adviser can override.
 */
const CATEGORY_DEFAULT_ROLE = {
  email: "[CL'S EMAIL]",
  phone: "[CL'S PHONE]",
  postcode_full: "[CL'S ADDRESS]",
  ni_number: '[NI NUMBER]',
  nhs_number: '[NHS NUMBER]',
  passport: '[PASSPORT NUMBER]',
  brp: '[BRP NUMBER]',
  hmcts_ref: '[HMCTS REF]',
  uc_claim: '[UC CLAIM REF]',
  bank_details: '[BANK DETAILS]',
  vrm: '[VRM]',
  dob: '[DOB]',
  address_line: "[CL'S ADDRESS]",
};

/**
 * Fixed tokens that never occupy a numbered slot. If the adviser's own
 * details show up in a document, they collapse to these tokens
 * consistently across all cases.
 */
const SAFE_IDENTITIES = new Set([
  '[ADVISER]',
  '[ADVISER EMAIL]',
  '[SHELTER]',
]);

/**
 * Categories that should never be shown as "unresolved" flags: they are
 * preserved verbatim and do not need review.
 */
const PRESERVED_CATEGORIES = new Set([
  'currency',
  'date',
  'postcode_outward',
]);


// =====================================================================
// js/patterns.js
// =====================================================================

/**
 * Regex patterns for structured identifier detection.
 *
 * Each pattern is anchored with word boundaries or lookarounds so that
 * matches are stable across common surrounding punctuation. The order in
 * which detectors run matters: postcodes must be matched before the
 * generic name-possible heuristic, or "S10 2AB" would be split.
 *
 * Public surface: DETECTORS (array of { name, category, regex, extract? }).
 */

/**
 * UK postcode. Handles standard and forces of the form S1 2AB, SW1A 1AA.
 * Case-insensitive; we keep the original casing when tokenising.
 */
const UK_POSTCODE = /\b([A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?)\s*(\d[ABD-HJLNP-UW-Z]{2})\b/gi;

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/**
 * UK phone numbers: 07-mobile, 01/02/03 landline, +44 international, and
 * bare 10-11 digit strings that look phone-shaped. Loose intentionally;
 * false positives get resolved at review.
 */
/**
 * The trailing `\d(?!\d)` anchors the match on a digit rather than an
 * optional-space chunk, so a trailing " and" or "," is not swallowed.
 */
const UK_PHONE = /(?:\+44\s?|0)(?:\d\s?){8,10}\d(?!\d)/g;

const NI_NUMBER = /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi;

const NHS_NUMBER = /\b\d{3}\s?\d{3}\s?\d{4}\b/g;

const PASSPORT = /\b\d{9}\b/g;

const BRP = /\b(?:RC|BR|ZR|CR|ZU|AR)\d{7}\b/gi;

const HMCTS_REF = /\b[A-Z]?\d{1,2}[A-Z]{2}\d{3,7}\b/g;

const UC_CLAIM = /\b(?:UC|HB|CTB)[- ]?\d{6,12}\b/gi;

/**
 * VRMs: current-format British registration marks. Older formats not covered.
 */
const VRM = /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/g;

/**
 * Sort-code + account-number pair, either together or separately.
 */
const SORT_CODE = /\b\d{2}[- ]?\d{2}[- ]?\d{2}\b/g;
const ACCOUNT_NUMBER = /\b\d{8}\b/g;

/**
 * Dates: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, and "10 July 2026" style.
 * Preserved by default, but detected so the adviser can override if a
 * particular date is a DOB.
 */
const DATE_NUMERIC = /\b(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:19|20)\d{2}\b/g;
const DATE_ISO = /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g;
const DATE_NAMED = /\b(?:0?[1-9]|[12]\d|3[01])\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d{2}\b/gi;

const CURRENCY = /£\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\b\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:GBP|pounds?)\b/gi;

/**
 * Capitalised multi-word phrases that look like personal names but did
 * not match any structured pattern above. Deliberately noisy: the review
 * step is where accuracy is achieved. Excludes common non-name openers
 * (Dear, Yours, Regards) and month names via a lookbehind list.
 */
const NAME_STOPWORDS = new Set([
  'Dear', 'Yours', 'Regards', 'Kind', 'Sincerely', 'Faithfully',
  'Mr', 'Mrs', 'Ms', 'Miss', 'Mx', 'Dr', 'Sir', 'Madam',
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'The', 'This', 'That', 'These', 'Those', 'A', 'An', 'And', 'Or',
  'From', 'To', 'For', 'With', 'On', 'In', 'At', 'By', 'Of',
  'Housing', 'Council', 'Court', 'Act', 'Section', 'Chapter',
  'Notice', 'Order', 'Letter', 'Email', 'Subject', 'Re', 'Ref',
  'Shelter', 'England', 'Wales', 'Scotland',
]);

const NAME_TITLES = /\b(?:Mr|Mrs|Ms|Miss|Mx|Dr)\.?\s+[A-Z][a-z]+(?:[- ][A-Z][a-z]+)*/g;
const NAME_PLAIN = /\b[A-Z][a-z]+(?:[- ][A-Z][a-z]+)+\b/g;

/**
 * Full address line: house number followed by street name, up to a comma
 * or newline. Used mainly for the address_line category flag.
 */
const ADDRESS_LINE = /\b\d{1,4}[A-Z]?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Road|Street|Lane|Avenue|Drive|Close|Court|Crescent|Way|Terrace|Grove|Place|Rd|St|Ave)\b/g;

/**
 * Detector spec: each entry produces zero or more matches. The `regex`
 * is applied globally to a string; the returned matches are objects of
 * shape { start, end, text, category, extra? }.
 */
const DETECTORS = [
  {
    name: 'postcode',
    run(text) {
      const out = [];
      for (const m of text.matchAll(UK_POSTCODE)) {
        const outward = m[1].toUpperCase();
        out.push({
          start: m.index,
          end: m.index + m[0].length,
          text: m[0],
          category: 'postcode_full',
          extra: { outward },
        });
      }
      return out;
    },
  },
  { name: 'email', run: (t) => matchesOf(t, EMAIL, 'email') },
  { name: 'phone', run: (t) => matchesOf(t, UK_PHONE, 'phone') },
  { name: 'ni_number', run: (t) => matchesOf(t, NI_NUMBER, 'ni_number') },
  { name: 'nhs_number', run: (t) => matchesOf(t, NHS_NUMBER, 'nhs_number') },
  { name: 'brp', run: (t) => matchesOf(t, BRP, 'brp') },
  { name: 'uc_claim', run: (t) => matchesOf(t, UC_CLAIM, 'uc_claim') },
  { name: 'hmcts_ref', run: (t) => matchesOf(t, HMCTS_REF, 'hmcts_ref') },
  { name: 'vrm', run: (t) => matchesOf(t, VRM, 'vrm') },
  { name: 'currency', run: (t) => matchesOf(t, CURRENCY, 'currency') },
  { name: 'date_numeric', run: (t) => matchesOf(t, DATE_NUMERIC, 'date') },
  { name: 'date_iso', run: (t) => matchesOf(t, DATE_ISO, 'date') },
  { name: 'date_named', run: (t) => matchesOf(t, DATE_NAMED, 'date') },
  { name: 'address_line', run: (t) => matchesOf(t, ADDRESS_LINE, 'address_line') },
  { name: 'name_titled', run: (t) => matchesOf(t, NAME_TITLES, 'name_possible') },
  {
    name: 'name_plain',
    run(text) {
      const out = [];
      for (const m of text.matchAll(NAME_PLAIN)) {
        const first = m[0].split(/[- ]/)[0];
        if (NAME_STOPWORDS.has(first)) continue;
        out.push({
          start: m.index,
          end: m.index + m[0].length,
          text: m[0],
          category: 'name_possible',
        });
      }
      return out;
    },
  },
];

function matchesOf(text, regex, category) {
  const out = [];
  for (const m of text.matchAll(regex)) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category,
    });
  }
  return out;
}


// =====================================================================
// js/filesystem.js
// =====================================================================

/**
 * File System Access API wrapper.
 *
 * The tool is anchored to a single "root" folder that the adviser picks
 * once per session. Beneath it we materialise four canonical mirrors:
 *
 *   Casework/                    active raw
 *   Casework_sanitised/          active sanitised
 *   Casework_closed/             closed raw
 *   Casework_sanitised_closed/   closed sanitised
 *
 * Any of these that do not already exist are created on first access, so
 * the adviser can point the tool at an empty directory and start working
 * without preparation.
 *
 * Public surface: pickRoot, hasFileSystemAccess, listCases, readFileText,
 * writeFileText, ensureCaseFolders, moveCase, deleteEntry, getFileHandle,
 * readJSON, writeJSON.
 */

const ROOTS = {
  activeRaw: 'Casework',
  activeSan: 'Casework_sanitised',
  closedRaw: 'Casework_closed',
  closedSan: 'Casework_sanitised_closed',
};

function hasFileSystemAccess() {
  return typeof window !== 'undefined'
    && typeof window.showDirectoryPicker === 'function';
}

/**
 * Prompt the user to pick a root folder and materialise the four mirrors
 * inside it. Returns an object holding the four directory handles plus
 * the top-level root handle for later re-lookup.
 */
async function pickRoot() {
  const root = await window.showDirectoryPicker({ mode: 'readwrite' });
  const activeRaw = await root.getDirectoryHandle(ROOTS.activeRaw, { create: true });
  const activeSan = await root.getDirectoryHandle(ROOTS.activeSan, { create: true });
  const closedRaw = await root.getDirectoryHandle(ROOTS.closedRaw, { create: true });
  const closedSan = await root.getDirectoryHandle(ROOTS.closedSan, { create: true });
  return { root, activeRaw, activeSan, closedRaw, closedSan };
}

/**
 * List cases under either the active or closed raw mirror. Each entry is
 * { id, kind: 'open' | 'closed', rawHandle, sanHandle, files, meta }.
 * files is a list of { name, kind: 'file', size, lastModified }; meta
 * includes any parsed _closure.json summary.
 */
async function listCases(handles, kind) {
  const rawParent = kind === 'closed' ? handles.closedRaw : handles.activeRaw;
  const sanParent = kind === 'closed' ? handles.closedSan : handles.activeSan;
  const cases = [];
  for await (const entry of rawParent.values()) {
    if (entry.kind !== 'directory') continue;
    const rawHandle = entry;
    let sanHandle = null;
    try {
      sanHandle = await sanParent.getDirectoryHandle(entry.name, { create: true });
    } catch (_e) {
      sanHandle = null;
    }
    const files = await listFiles(rawHandle, sanHandle);
    const meta = await tryReadClosure(rawHandle);
    cases.push({ id: entry.name, kind, rawHandle, sanHandle, files, meta });
  }
  cases.sort((a, b) => a.id.localeCompare(b.id));
  return cases;
}

async function listFiles(rawHandle, sanHandle) {
  const out = [];
  const sanNames = new Set();
  if (sanHandle) {
    for await (const s of sanHandle.values()) {
      if (s.kind === 'file') sanNames.add(s.name);
    }
  }
  for await (const entry of rawHandle.values()) {
    if (entry.kind !== 'file') continue;
    if (entry.name === '_mapping.json' || entry.name === '_closure.json' || entry.name === '_audit.log') continue;
    const file = await entry.getFile();
    out.push({
      name: entry.name,
      size: file.size,
      lastModified: file.lastModified,
      hasSanitised: sanNames.has(entry.name),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function tryReadClosure(dirHandle) {
  try {
    const h = await dirHandle.getFileHandle('_closure.json');
    const f = await h.getFile();
    return JSON.parse(await f.text());
  } catch (_e) {
    return null;
  }
}

async function readFileText(dirHandle, name) {
  const h = await dirHandle.getFileHandle(name);
  const f = await h.getFile();
  return { text: await f.text(), lastModified: f.lastModified };
}

async function writeFileText(dirHandle, name, text) {
  const h = await dirHandle.getFileHandle(name, { create: true });
  const w = await h.createWritable();
  await w.write(text);
  await w.close();
}

async function readJSON(dirHandle, name) {
  try {
    const { text } = await readFileText(dirHandle, name);
    return JSON.parse(text);
  } catch (_e) {
    return null;
  }
}

async function writeJSON(dirHandle, name, obj) {
  await writeFileText(dirHandle, name, JSON.stringify(obj, null, 2));
}

/**
 * Ensure both raw and sanitised case folders exist for the given case ID.
 * Returns the two directory handles.
 */
async function ensureCaseFolders(handles, caseId, closed = false) {
  const rawParent = closed ? handles.closedRaw : handles.activeRaw;
  const sanParent = closed ? handles.closedSan : handles.activeSan;
  const rawHandle = await rawParent.getDirectoryHandle(caseId, { create: true });
  const sanHandle = await sanParent.getDirectoryHandle(caseId, { create: true });
  return { rawHandle, sanHandle };
}

/**
 * Move a case between active and closed roots. Both raw and sanitised
 * mirrors are moved. Implemented as recursive copy plus delete, because
 * the File System Access API does not offer a cross-parent move.
 */
async function moveCase(handles, caseId, toClosed) {
  const fromRaw = toClosed ? handles.activeRaw : handles.closedRaw;
  const fromSan = toClosed ? handles.activeSan : handles.closedSan;
  const toRaw = toClosed ? handles.closedRaw : handles.activeRaw;
  const toSan = toClosed ? handles.closedSan : handles.activeSan;
  await moveDirectory(fromRaw, toRaw, caseId);
  await moveDirectory(fromSan, toSan, caseId);
}

async function moveDirectory(fromParent, toParent, name) {
  let src;
  try { src = await fromParent.getDirectoryHandle(name); }
  catch (_e) { return; }
  const dst = await toParent.getDirectoryHandle(name, { create: true });
  await copyTree(src, dst);
  await fromParent.removeEntry(name, { recursive: true });
}

async function copyTree(src, dst) {
  for await (const entry of src.values()) {
    if (entry.kind === 'file') {
      const srcFile = await entry.getFile();
      const dstHandle = await dst.getFileHandle(entry.name, { create: true });
      const w = await dstHandle.createWritable();
      await w.write(await srcFile.arrayBuffer());
      await w.close();
    } else {
      const child = await dst.getDirectoryHandle(entry.name, { create: true });
      await copyTree(entry, child);
    }
  }
}

async function deleteEntry(dirHandle, name) {
  await dirHandle.removeEntry(name);
}

async function getFileHandle(dirHandle, name, create = false) {
  return dirHandle.getFileHandle(name, { create });
}


// =====================================================================
// js/audit.js
// =====================================================================

/**
 * Per-case plain-text audit log.
 *
 * Kept as simple appended lines with ISO date prefixes so the adviser can
 * open the file in any editor and read the history without tooling.
 *
 * Public surface: appendAudit.
 */

const AUDIT_FILENAME = '_audit.log';

async function appendAudit(rawHandle, line) {
  let existing = '';
  try {
    const h = await rawHandle.getFileHandle(AUDIT_FILENAME);
    const f = await h.getFile();
    existing = await f.text();
  } catch (_e) {
    existing = '';
  }
  const stamped = `${new Date().toISOString()}\t${line}\n`;
  const h = await rawHandle.getFileHandle(AUDIT_FILENAME, { create: true });
  const w = await h.createWritable();
  await w.write(existing + stamped);
  await w.close();
}


// =====================================================================
// js/mapping.js
// =====================================================================

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


const MAPPING_FILENAME = '_mapping.json';

async function loadMapping(rawHandle, caseId) {
  const existing = await readJSON(rawHandle, MAPPING_FILENAME);
  if (existing && existing.version === 1) return existing;
  return {
    version: 1,
    caseId,
    createdAt: new Date().toISOString(),
    entries: [],
  };
}

async function saveMapping(rawHandle, mapping) {
  await writeJSON(rawHandle, MAPPING_FILENAME, mapping);
}

function findByOriginal(mapping, original) {
  if (!original) return null;
  const lc = original.toLowerCase();
  for (const e of mapping.entries) {
    if (e.original.toLowerCase() === lc) return e;
    if (e.aliases && e.aliases.some((a) => a.toLowerCase() === lc)) return e;
  }
  return null;
}

function findByToken(mapping, token) {
  return mapping.entries.find((e) => e.token === token) || null;
}

function addEntry(mapping, entry) {
  mapping.entries.push({
    original: entry.original,
    token: entry.token,
    category: entry.category || 'custom',
    aliases: entry.aliases || [],
    createdAt: new Date().toISOString(),
    notes: entry.notes || undefined,
  });
}

function addAlias(mapping, token, alias) {
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
function allocateNumberedToken(mapping, baseToken) {
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
function mergeIntoMapping(target, source) {
  for (const e of source.entries) {
    if (findByOriginal(target, e.original)) continue;
    target.entries.push({ ...e });
  }
}


// =====================================================================
// js/clipboard.js
// =====================================================================

/**
 * Clipboard helpers.
 *
 * Wraps the async Clipboard API with fallbacks and surfaces the most
 * recent operation to the UI so the adviser always knows what is on
 * the clipboard. Every write refreshes the indicator; a failed write
 * throws rather than silently succeeding.
 *
 * Public surface: copyText, readText, setIndicator.
 */

const INDICATOR_ID = 'clipboard-indicator';

async function copyText(text, label) {
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    throw new Error('Clipboard API not available in this browser.');
  }
  await navigator.clipboard.writeText(text);
  setIndicator(label);
}

async function readText() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    throw new Error('Clipboard read not available in this browser.');
  }
  return navigator.clipboard.readText();
}

function setIndicator(label) {
  const el = document.getElementById(INDICATOR_ID);
  if (!el) return;
  if (!label) { el.textContent = ''; return; }
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  el.textContent = `Clipboard: ${label} at ${hh}:${mm}`;
}


// =====================================================================
// js/integrity.js
// =====================================================================

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

function checkOutgoing(sanitisedText, mapping) {
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


// =====================================================================
// js/sanitiser.js
// =====================================================================

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



const HEADER_START = '# --- SANITISED CASEWORK MATERIAL ---';
const HEADER_END = '# --- END OF HEADER ---';

const headerSentinel = HEADER_START;

/**
 * Run every detector over the text and reduce the result to a
 * non-overlapping span list. Where two detectors overlap, the more
 * specific one wins: a postcode inside a longer address wins over the
 * address-line detector, an NI number wins over "possible name", and so
 * on. Specificity is expressed as detector order in DETECTORS.
 */
function detectEntities(text, mapping) {
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
function applySanitisation(text, decisions) {
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

function buildHeader({ caseId, sourceName, tokensUsed, sanitisedDateISO }) {
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
function stripHeader(text) {
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


// =====================================================================
// js/rehydrator.js
// =====================================================================

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



/**
 * Scan the text for occurrences of any real identifier from the mapping.
 * Returns an array of hits: { start, end, original, token }.
 *
 * Common first names are suppressed unless they appear alongside their
 * surname or with a title, to reduce the noise from a chat that happens
 * to mention "John" but not the client. Full names, addresses, emails,
 * phone numbers, and reference-like categories match unconditionally.
 */
function reverseCheck(text, mapping) {
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
function forwardReplace(text, mapping) {
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
function rehydrate(text, mapping) {
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


// =====================================================================
// js/case-manager.js
// =====================================================================

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




const CLOSURE_FILENAME = '_closure.json';
const SOFT_REOPEN_DAYS = 7;

const CLOSURE_REASONS = [
  'Advice given',
  'No engagement',
  'Referred out',
  'Rejected after three attempts',
  'Other',
];

async function createCase(handles, caseId) {
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

async function closeCase(handles, caseObj, { reason, note }) {
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

async function reopenCase(handles, caseObj, { reason, note }) {
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

function isSoftReopen(closure) {
  if (!closure || closure.state !== 'closed') return false;
  if (!closure.closedAt) return false;
  const closedMs = Date.parse(closure.closedAt);
  if (Number.isNaN(closedMs)) return false;
  const ageDays = (Date.now() - closedMs) / (1000 * 60 * 60 * 24);
  return ageDays <= SOFT_REOPEN_DAYS;
}


// =====================================================================
// js/review-ui.js
// =====================================================================

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



function openReviewDialog(entities, mapping, options = {}) {
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


// =====================================================================
// js/main.js
// =====================================================================

/**
 * Entry point: wires the UI to the domain modules.
 *
 * Kept intentionally boring: DOM lookups, event handlers, and calls out
 * to the domain modules. Any logic that would grow past a screenful
 * belongs in its own module.
 *
 * Public surface: none (side effects on window load).
 */










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

})();
