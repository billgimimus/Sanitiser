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
  'Hi', 'Hello', 'Hey', 'Cheers', 'Best', 'Thanks', 'Thank',
  'Warm', 'Warmest', 'Also', 'Please', 'Attn', 'FAO',
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
 * Salutation followed by a capitalised name. Written as a separate
 * pattern so single-word given names ("Hi Kieran,") are still caught
 * even though the multi-word NAME_PLAIN detector would not see them.
 * Longer alternatives ("Kind regards") come first so they win over
 * their shorter prefixes.
 */
const SALUTATION_NAME = /\b(?:Kind\s+regards|Kindest\s+regards|Best\s+regards|Best\s+wishes|Warmest\s+regards|Thank\s+you|Many\s+thanks|Hi|Hello|Hey|Cheers|Best|Thanks|Dear|Yours|Regards|Warmest|Warm|Attn|FAO|Sincerely|Faithfully)[,;:.]?\s+([A-Z][a-z]+(?:[- ][A-Z][a-z]+)*)/g;

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
    name: 'salutation_name',
    run(text) {
      const out = [];
      for (const m of text.matchAll(SALUTATION_NAME)) {
        const captured = m[1];
        const first = captured.split(/[- ]/)[0];
        if (NAME_STOPWORDS.has(first)) continue;
        const nameStart = m.index + m[0].length - captured.length;
        out.push({
          start: nameStart,
          end: nameStart + captured.length,
          text: captured,
          category: 'name_possible',
        });
      }
      return out;
    },
  },
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
  if (existing && existing.version === 1) {
    if (!Array.isArray(existing.safeList)) existing.safeList = [];
    return existing;
  }
  return {
    version: 1,
    caseId,
    createdAt: new Date().toISOString(),
    entries: [],
    safeList: [],
  };
}

/**
 * Global settings live in _settings.json at the casework root, next to
 * the four canonical folder mirrors. Currently only holds a globally
 * scoped safe list of strings to skip during detection across every
 * case. Later phases may add custom regex patterns and known-safe
 * identities here.
 */
const SETTINGS_FILENAME = '_settings.json';

async function loadGlobalSettings(rootHandle) {
  const existing = await readJSON(rootHandle, SETTINGS_FILENAME);
  if (existing && existing.version === 1) {
    if (!Array.isArray(existing.safeList)) existing.safeList = [];
    if (typeof existing.nerEnabled !== 'boolean') existing.nerEnabled = false;
    return existing;
  }
  return { version: 1, safeList: [], nerEnabled: false };
}

async function saveGlobalSettings(rootHandle, settings) {
  await writeJSON(rootHandle, SETTINGS_FILENAME, settings);
}

/**
 * Cross-case watchlist of every identifier ever tokenised in any case,
 * open or closed. Stored at the casework root as _watchlist.json so
 * both active and closed cases contribute. Each entry:
 *   { normalised, original, category, caseId, addedAt, matchStrength }
 * `normalised` is a lowercased comparison key. `matchStrength` is the
 * lightweight grading the spec defines: hard (address / postcode+name /
 * email / phone), medium (name only), soft (indirect combinations).
 */
const WATCHLIST_FILENAME = '_watchlist.json';

async function loadWatchlist(rootHandle) {
  const existing = await readJSON(rootHandle, WATCHLIST_FILENAME);
  if (existing && existing.version === 1) {
    if (!Array.isArray(existing.entries)) existing.entries = [];
    return existing;
  }
  return { version: 1, entries: [] };
}

async function saveWatchlist(rootHandle, watchlist) {
  await writeJSON(rootHandle, WATCHLIST_FILENAME, watchlist);
}

function watchlistMatchStrength(category) {
  if (['email', 'phone', 'address_line', 'postcode_full', 'ni_number', 'nhs_number', 'brp', 'passport'].includes(category)) return 'hard';
  if (category === 'name_possible') return 'medium';
  return 'soft';
}

/**
 * Append every unique mapping entry (excluding those already seen for
 * this case) to the watchlist. Called after a successful sanitisation
 * so that closed cases still contribute forever.
 */
function accumulateWatchlist(watchlist, mapping, caseId) {
  const seen = new Set(
    watchlist.entries
      .filter((e) => e.caseId === caseId)
      .map((e) => `${e.normalised}|${e.category}`)
  );
  let added = 0;
  for (const e of mapping.entries) {
    const key = `${e.original.toLowerCase().trim()}|${e.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    watchlist.entries.push({
      normalised: e.original.toLowerCase().trim(),
      original: e.original,
      category: e.category,
      caseId,
      addedAt: new Date().toISOString(),
      matchStrength: watchlistMatchStrength(e.category),
    });
    added++;
  }
  return added;
}

/**
 * For each detected entity, list any prior appearances in other cases.
 * Same-case appearances are suppressed so the banner doesn't count the
 * adviser's own history against them.
 */
// =====================================================================
// optional NER (Transformers.js + Xenova/bert-base-NER)
// =====================================================================

const NER_MODEL_ID = 'Xenova/bert-base-NER';

/**
 * Load the token-classification pipeline on demand. Vendored WASM lives
 * under lib/; model files are streamed from huggingface.co the first
 * time and cached by the browser's Cache API. Subsequent activations
 * (this session or later) are fast and offline-friendly.
 */
async function ensureNerPipeline(onProgress) {
  if (state.nerPipeline) return state.nerPipeline;
  if (state.nerLoading) throw new Error('Model already loading. Wait for it to finish.');
  if (!window.Transformers) throw new Error('Transformers.js not loaded. Check lib/transformers.min.js is in place.');
  state.nerLoading = true;
  try {
    const T = window.Transformers;
    T.env.backends.onnx.wasm.wasmPaths = 'lib/';
    T.env.allowLocalModels = false;
    const pipe = await T.pipeline('token-classification', NER_MODEL_ID, {
      quantized: true,
      progress_callback: onProgress,
    });
    state.nerPipeline = pipe;
    return pipe;
  } finally {
    state.nerLoading = false;
  }
}

/**
 * Run NER on a text and return spans in the same shape the regex
 * detectors produce. Chunks text on paragraph boundaries so a long
 * document stays inside the model's 512-token context. PER labels are
 * mapped to name_possible; LOC to address_line; ORG is treated as a
 * name_possible so it flows through the review as a judgement call.
 */
async function runNerOnText(text) {
  const pipe = state.nerPipeline;
  if (!pipe) return [];
  const chunks = chunkTextForNer(text, 1500);
  const out = [];
  for (const chunk of chunks) {
    const raw = await pipe(chunk.text, { aggregation_strategy: 'simple' });
    for (const r of raw) {
      const category = mapNerLabel(r.entity_group || r.entity);
      if (!category) continue;
      const start = chunk.offset + r.start;
      const end = chunk.offset + r.end;
      out.push({
        start,
        end,
        text: text.slice(start, end),
        category,
        source: 'ner',
      });
    }
  }
  return out;
}

function chunkTextForNer(text, maxChars) {
  const chunks = [];
  if (text.length <= maxChars) return [{ text, offset: 0 }];
  const paras = text.split(/(\n\s*\n)/);
  let buf = '';
  let offset = 0;
  let bufOffset = 0;
  for (const piece of paras) {
    if (buf.length + piece.length > maxChars && buf) {
      chunks.push({ text: buf, offset: bufOffset });
      buf = piece;
      bufOffset = offset;
    } else {
      if (!buf) bufOffset = offset;
      buf += piece;
    }
    offset += piece.length;
  }
  if (buf) chunks.push({ text: buf, offset: bufOffset });
  return chunks;
}

function mapNerLabel(label) {
  if (!label) return null;
  const l = label.replace(/^[BIO]-/, '');
  if (l === 'PER') return 'name_possible';
  if (l === 'LOC') return 'address_line';
  if (l === 'ORG') return 'name_possible';
  return null;
}

/**
 * Merge NER spans into the existing entity list. Regex detectors run
 * first; NER contributes only spans that do not overlap an existing
 * detection, so the deterministic detectors always win a tie.
 */
function mergeNerSpans(entities, nerSpans) {
  if (!nerSpans.length) return entities;
  const sorted = [...entities].sort((a, b) => a.start - b.start);
  const out = [...entities];
  for (const s of nerSpans) {
    const overlaps = sorted.some((e) => Math.max(e.start, s.start) < Math.min(e.end, s.end));
    if (!overlaps) out.push(s);
  }
  return out.sort((a, b) => a.start - b.start);
}

function crossCheckWatchlist(entities, watchlist, currentCaseId) {
  const byKey = new Map();
  for (const entry of watchlist.entries || []) {
    if (entry.caseId === currentCaseId) continue;
    const arr = byKey.get(entry.normalised) || [];
    arr.push(entry);
    byKey.set(entry.normalised, arr);
  }
  return entities.map((e) => {
    const key = (e.text || '').toLowerCase().trim();
    const hits = byKey.get(key);
    if (!hits || !hits.length) return e;
    return { ...e, priorAppearances: hits };
  });
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
function detectEntities(text, mapping, safeSet) {
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
  const skipCheck = safeSet && safeSet.size ? safeSet : null;
  for (const s of raw) {
    if (s.start < cursor) continue;
    if (skipCheck && skipCheck.has(s.text.toLowerCase())) {
      cursor = s.end;
      continue;
    }
    chosen.push(s);
    cursor = s.end;
  }
  return chosen.map((s) => decorateWithMapping(s, mapping, text));
}

/**
 * Build a single lowercased Set from the case and global safe lists so
 * detection has one thing to consult per span.
 */
function buildSafeSet(caseSafeList, globalSafeList) {
  const set = new Set();
  for (const entry of caseSafeList || []) set.add(String(entry).toLowerCase());
  for (const entry of globalSafeList || []) set.add(String(entry).toLowerCase());
  return set;
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

function buildHeader({ caseId, sourceName, tokensUsed, sanitisedDateISO, verbatimCount }) {
  const uniqueTokens = Array.from(new Set(tokensUsed)).sort();
  const dateLabel = formatDate(sanitisedDateISO);
  const lines = [
    HEADER_START,
    `# Case: ${caseId}`,
    `# Source: ${sourceName}`,
    `# Sanitised: ${dateLabel}`,
    `# Tokens: ${uniqueTokens.join(' ') || '(none)'}`,
  ];
  if (verbatimCount) {
    lines.push(`# Verbatim blocks: ${verbatimCount} (must be reproduced without alteration between <verbatim-referral> tags)`);
  }
  lines.push('# This block must be removed before use in client-facing systems.', HEADER_END, '');
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
  const { text: withoutVerbatim, mismatches: verbatimMismatches } = verifyAndStripVerbatimBlocks(withoutHeader, mapping);
  const hits = reverseCheck(withoutVerbatim, mapping);
  const replaced = forwardReplace(withoutVerbatim, mapping);
  return { hits, replaced, cleaned: withoutVerbatim, verbatimMismatches };
}

// =====================================================================
// verbatim blocks: enforce byte-for-byte reproduction of referral notes
// =====================================================================

/**
 * Scan a raw source text for author-marked verbatim regions written as
 *   <verbatim> ... </verbatim>
 * and return the spans plus the raw content between the tags. Used
 * before sanitisation so we can wrap the tokenised output in the
 * <verbatim-referral id="..."> markers Claude sees.
 */
function extractVerbatimSpans(text) {
  const rx = /<verbatim>([\s\S]*?)<\/verbatim>/g;
  const out = [];
  let m;
  while ((m = rx.exec(text)) !== null) {
    out.push({
      openStart: m.index,
      contentStart: m.index + '<verbatim>'.length,
      contentEnd: m.index + m[0].length - '</verbatim>'.length,
      closeEnd: m.index + m[0].length,
      raw: m[1],
    });
  }
  return out;
}

/**
 * After applySanitisation has produced the sanitised body, replace each
 * `<verbatim>...</verbatim>` block in that body with
 * `<verbatim-referral id="vN">...</verbatim-referral>` and remember the
 * raw content of each block on the mapping. The Nth block in the source
 * maps to the Nth block in the sanitised text because the marker tags
 * are byte-preserved by applySanitisation.
 */
function rewriteVerbatimBlocks(rawText, sanitisedText, mapping) {
  const rawSpans = extractVerbatimSpans(rawText);
  if (!rawSpans.length) return { sanitised: sanitisedText, ids: [] };
  const sanSpans = extractVerbatimSpans(sanitisedText);
  if (sanSpans.length !== rawSpans.length) {
    throw new Error('Verbatim marker count changed during sanitisation. Aborting to avoid mis-pairing.');
  }
  if (!Array.isArray(mapping.verbatimBlocks)) mapping.verbatimBlocks = [];
  const stamp = Date.now();
  const ids = [];
  let out = '';
  let cursor = 0;
  sanSpans.forEach((s, i) => {
    const id = `v_${stamp}_${i + 1}`;
    ids.push(id);
    out += sanitisedText.slice(cursor, s.openStart);
    out += `<verbatim-referral id="${id}">`;
    out += sanitisedText.slice(s.contentStart, s.contentEnd);
    out += '</verbatim-referral>';
    cursor = s.closeEnd;
    mapping.verbatimBlocks.push({
      id,
      originalContent: rawSpans[i].raw,
      sanitisedContent: sanitisedText.slice(s.contentStart, s.contentEnd),
      createdAt: new Date().toISOString(),
    });
  });
  out += sanitisedText.slice(cursor);
  return { sanitised: out, ids };
}

/**
 * On rehydration, find every `<verbatim-referral id="X">...</verbatim-referral>`
 * block in the pasted AI reply, rehydrate the content, and compare it
 * byte-for-byte with the originalContent recorded when the sanitised
 * file was written. Mismatches are returned; the tags themselves are
 * stripped from the output either way so client-facing paste never
 * carries the marker syntax.
 */
function verifyAndStripVerbatimBlocks(text, mapping) {
  const rx = /<verbatim-referral\s+id="([^"]+)">([\s\S]*?)<\/verbatim-referral>/g;
  const mismatches = [];
  const records = (mapping && mapping.verbatimBlocks) || [];
  const replaced = text.replace(rx, (_m, id, content) => {
    const rehydratedInside = forwardReplace(content, mapping);
    const record = records.find((r) => r.id === id);
    if (!record) {
      mismatches.push({ id, reason: 'unknown block id', actual: rehydratedInside, expected: null });
    } else if (rehydratedInside !== record.originalContent) {
      mismatches.push({ id, reason: 'content differs', actual: rehydratedInside, expected: record.originalContent });
    }
    return rehydratedInside;
  });
  return { text: replaced, mismatches };
}

function buildLiteralRegex(str) {
  const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const looksAlphaNum = /^[A-Za-z0-9 '\-]+$/.test(str);
  const bounded = looksAlphaNum ? `\\b${escaped}\\b` : escaped;
  return new RegExp(bounded, 'gi');
}


// =====================================================================
// eml-parser: minimal MIME parser for .eml drag-drop
// =====================================================================

/**
 * Parse an .eml file into a normalized shape:
 *   { headers, bodyText, attachments, warnings }
 *
 * Handles: RFC 2822 headers with continuation, RFC 2047 encoded-word
 * subject fields, multipart/* including nested, multipart/alternative
 * (prefers text/plain), quoted-printable and base64 transfer encoding,
 * and a minimal HTML-to-text fallback for HTML-only bodies.
 *
 * Intentional limits: single-byte and UTF-8 only; complex character sets
 * beyond that decode as UTF-8, which is fine for casework English but
 * would garble e.g. Windows-1252 accents. If a real email fails to
 * parse cleanly, drop the raw .eml and use the paste-text failsafe.
 */
function parseEml(raw) {
  const norm = String(raw).replace(/\r\n/g, '\n');
  const sepIdx = norm.indexOf('\n\n');
  if (sepIdx === -1) {
    return { headers: [], bodyText: norm, attachments: [], warnings: ['No header/body separator; treating as body only.'] };
  }
  const headers = emlParseHeaders(norm.slice(0, sepIdx));
  const body = norm.slice(sepIdx + 2);
  const attachments = [];
  const warnings = [];
  const bodyText = emlExtractBody({ headers, body, attachments, warnings });
  return { headers, bodyText, attachments, warnings };
}

function emlParseHeaders(block) {
  const out = [];
  const lines = block.split('\n');
  let current = null;
  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      current.value += '\n' + line.replace(/^[ \t]+/, ' ');
      continue;
    }
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    if (current) out.push(current);
    current = { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
  }
  if (current) out.push(current);
  return out;
}

function emlHeaderValue(headers, name) {
  const lc = name.toLowerCase();
  for (const h of headers) if (h.name.toLowerCase() === lc) return h.value;
  return null;
}

function emlExtractParam(headerValueStr, paramName) {
  if (!headerValueStr) return null;
  const rx = new RegExp(`;\\s*${paramName}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i');
  const m = headerValueStr.match(rx);
  if (!m) return null;
  return m[1] || m[2];
}

function emlExtractBody(ctx) {
  const ct = emlHeaderValue(ctx.headers, 'content-type') || 'text/plain';
  const cte = (emlHeaderValue(ctx.headers, 'content-transfer-encoding') || '').toLowerCase();
  const charset = emlExtractParam(ct, 'charset') || 'utf-8';
  if (/^multipart\//i.test(ct)) {
    const boundary = emlExtractParam(ct, 'boundary');
    if (!boundary) {
      ctx.warnings.push('Multipart Content-Type without boundary; treating body as raw.');
      return ctx.body;
    }
    return emlExtractMultipart(ct, ctx.body, boundary, ctx.attachments, ctx.warnings);
  }
  if (/^text\/html/i.test(ct)) return emlHtmlToText(emlDecodeContent(ctx.body, cte, charset));
  return emlDecodeContent(ctx.body, cte, charset);
}

function emlExtractMultipart(parentCt, body, boundary, attachments, warnings) {
  const parts = emlSplitMultipart(body, boundary);
  const isAlternative = /multipart\/alternative/i.test(parentCt);
  const textPieces = [];
  const htmlPieces = [];
  for (const p of parts) {
    const ph = emlParseHeaders(p.headerBlock);
    const pct = emlHeaderValue(ph, 'content-type') || 'text/plain';
    const pcte = (emlHeaderValue(ph, 'content-transfer-encoding') || '').toLowerCase();
    const pcd = emlHeaderValue(ph, 'content-disposition') || '';
    const charset = emlExtractParam(pct, 'charset') || 'utf-8';
    const filename = emlExtractParam(pcd, 'filename') || emlExtractParam(pct, 'name');
    const isAttachment = /^attachment/i.test(pcd)
      || (filename && !/^inline/i.test(pcd) && !/^text\//i.test(pct));
    if (isAttachment) {
      attachments.push({
        filename: filename || '(unnamed)',
        contentType: pct.split(';')[0].trim(),
        approxSize: Math.round(p.body.length * (pcte === 'base64' ? 0.75 : 1)),
      });
      continue;
    }
    if (/^multipart\//i.test(pct)) {
      const innerBoundary = emlExtractParam(pct, 'boundary');
      if (innerBoundary) {
        textPieces.push(emlExtractMultipart(pct, p.body, innerBoundary, attachments, warnings));
      }
      continue;
    }
    if (/^text\/plain/i.test(pct)) textPieces.push(emlDecodeContent(p.body, pcte, charset));
    else if (/^text\/html/i.test(pct)) htmlPieces.push(emlHtmlToText(emlDecodeContent(p.body, pcte, charset)));
  }
  if (isAlternative) return textPieces[0] || htmlPieces[0] || '';
  return [...textPieces, ...htmlPieces].filter(Boolean).join('\n');
}

function emlSplitMultipart(body, boundary) {
  const marker = '--' + boundary;
  const parts = [];
  let cursor = 0;
  while (true) {
    const start = body.indexOf(marker, cursor);
    if (start === -1) break;
    const afterMarker = start + marker.length;
    if (body.slice(afterMarker, afterMarker + 2) === '--') break;
    const partBodyStart = afterMarker;
    const nextStart = body.indexOf('\n' + marker, partBodyStart);
    const partEnd = nextStart === -1 ? body.length : nextStart + 1;
    const partSlice = body.slice(partBodyStart, partEnd).replace(/^\n/, '').replace(/\n$/, '');
    const sepIdx = partSlice.indexOf('\n\n');
    if (sepIdx === -1) parts.push({ headerBlock: partSlice, body: '' });
    else parts.push({ headerBlock: partSlice.slice(0, sepIdx), body: partSlice.slice(sepIdx + 2) });
    cursor = partEnd;
  }
  return parts;
}

function emlDecodeContent(body, cte, _charset) {
  if (cte === 'base64') { try { return emlDecodeBase64Utf8(body.replace(/[\r\n]/g, '')); } catch (_e) { return body; } }
  if (cte === 'quoted-printable') return emlDecodeQuotedPrintable(body);
  return body;
}

function emlDecodeQuotedPrintable(input) {
  const withoutSoft = input.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < withoutSoft.length; i++) {
    const c = withoutSoft.charCodeAt(i);
    if (c === 61 && i + 2 < withoutSoft.length) {
      const hex = withoutSoft.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) { bytes.push(parseInt(hex, 16)); i += 2; continue; }
    }
    bytes.push(c);
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

function emlDecodeBase64Utf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function emlDecodeMimeWords(str) {
  if (!str) return str;
  return str.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_m, _cs, enc, text) => {
    try {
      if (enc.toUpperCase() === 'B') return emlDecodeBase64Utf8(text);
      return emlDecodeQuotedPrintable(text.replace(/_/g, ' '));
    } catch (_e) { return _m; }
  });
}

function emlHtmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Render a parsed .eml as the plain-text file the tool actually saves
 * into the case. Header block is deliberately readable and stable; the
 * sanitiser then treats it as any other document.
 */
function formatEmlAsText(parsed, sourceFilename) {
  const wanted = ['from', 'to', 'cc', 'bcc', 'subject', 'date', 'message-id', 'in-reply-to'];
  const lines = [`# Imported from email: ${sourceFilename}`, ''];
  for (const name of wanted) {
    const raw = emlHeaderValue(parsed.headers, name);
    if (!raw) continue;
    const value = emlDecodeMimeWords(raw).replace(/\n\s*/g, ' ');
    lines.push(`${headerLabel(name)}: ${value}`);
  }
  lines.push('', '---', '', parsed.bodyText.trim() || '(empty body)');
  if (parsed.attachments.length) {
    lines.push('', '---', '', 'Attachments (present, not processed by the tool):');
    for (const a of parsed.attachments) {
      lines.push(`  - ${a.filename} (${a.contentType}, approx ${humanBytes(a.approxSize)})`);
    }
  }
  if (parsed.warnings.length) {
    lines.push('', '---', '', 'Parser warnings:');
    for (const w of parsed.warnings) lines.push(`  - ${w}`);
  }
  return lines.join('\n') + '\n';
}

function headerLabel(name) {
  const map = { from: 'From', to: 'To', cc: 'Cc', bcc: 'Bcc', subject: 'Subject', date: 'Date', 'message-id': 'Message-ID', 'in-reply-to': 'In-Reply-To' };
  return map[name] || name;
}

function humanBytes(n) {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / (1024 * 1024) * 10) / 10} MB`;
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
    const documentText = options.documentText || '';
    const decisions = entities.map((e) => initialDecision(e, mapping));
    const safeListUpdates = [];

    const root = document.getElementById('dialog-root');
    root.innerHTML = '';

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.width = '960px';
    backdrop.appendChild(modal);

    modal.innerHTML = `
      <div class="modal-header">Review detected entities: ${escapeHtml(options.title || 'file')}</div>
      <div class="modal-body">
        ${renderPriorAppearanceBanner(options.priorSummary)}
        <p class="muted">The detected text on the left is editable, so you can trim a wrongly captured boundary (for example changing "Hi Kieran" to "Kieran"). Use "Safe here" or "Safe everywhere" to record that a specific string should be skipped by future detection.</p>
        <div id="review-summary" class="muted" style="margin-bottom:8px"></div>
        <table class="entity-table">
          <thead>
            <tr>
              <th style="width:36%">Detected (editable)</th>
              <th style="width:12%">Category</th>
              <th style="width:22%">Action</th>
              <th style="width:30%">Token or replacement</th>
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
      const rowEl = ev.target.closest('tr[data-idx]');
      if (!rowEl) return;
      const idx = Number(rowEl.dataset.idx);
      if (ev.target.matches('input[data-role="custom"]')) {
        decisions[idx].token = ev.target.value;
        updateSummary(modal, decisions);
      } else if (ev.target.matches('input[data-role="span-text"]')) {
        const ok = repositionSpan(decisions[idx], ev.target.value, documentText);
        updateContextDisplay(rowEl, decisions[idx]);
        markInvalidText(rowEl, !ok);
        updateSummary(modal, decisions);
      }
    });

    modal.addEventListener('click', (ev) => {
      const rowEl = ev.target.closest('tr[data-idx]');
      if (rowEl) {
        const idx = Number(rowEl.dataset.idx);
        const role = ev.target.dataset && ev.target.dataset.role;
        if (role === 'safe-case' || role === 'safe-global') {
          const scope = role === 'safe-global' ? 'global' : 'case';
          const text = decisions[idx].text.trim();
          if (!text) { return; }
          if (!safeListUpdates.some((u) => u.text.toLowerCase() === text.toLowerCase() && u.scope === scope)) {
            safeListUpdates.push({ text, scope });
          }
          decisions[idx].action = 'preserve';
          refreshRow(rowEl, decisions[idx]);
          markSafeChip(rowEl, scope);
          updateSummary(modal, decisions);
          return;
        }
      }
      const action = ev.target.dataset && ev.target.dataset.action;
      if (action === 'cancel') {
        cleanup();
        resolve(null);
      } else if (action === 'save') {
        const unresolved = decisions.filter(isUnresolved);
        const invalid = decisions.filter((d) => d.action !== 'preserve' && d.textInvalid);
        if (unresolved.length || invalid.length) {
          highlightUnresolved(tbody, decisions);
          const summary = modal.querySelector('#review-summary');
          const parts = [];
          if (unresolved.length) parts.push(`${unresolved.length} still need a decision`);
          if (invalid.length) parts.push(`${invalid.length} have edited text that no longer matches the document`);
          summary.textContent = parts.join(' and ') + '.';
          summary.classList.add('warning');
          return;
        }
        const { finalDecisions, mappingUpdates } = finaliseDecisions(decisions, mapping);
        cleanup();
        resolve({ decisions: finalDecisions, mappingUpdates, safeListUpdates });
      }
    });

    function cleanup() { backdrop.remove(); }
    root.appendChild(backdrop);
  });
}

/**
 * Search for `newText` inside a window around the entity's original
 * position (`originalStart` / `originalEnd`). Anchor to the original
 * position rather than the current one so that repeated edits do not
 * drift down the document.
 */
function repositionSpan(decision, newText, documentText) {
  decision.text = newText;
  const trimmed = newText.trim();
  if (!trimmed || !documentText) {
    decision.textInvalid = !!trimmed;
    return false;
  }
  const win = 100;
  const origStart = decision.originalStart != null ? decision.originalStart : decision.start;
  const origEnd = decision.originalEnd != null ? decision.originalEnd : decision.end;
  const winStart = Math.max(0, origStart - win);
  const winEnd = Math.min(documentText.length, origEnd + win);
  const slice = documentText.slice(winStart, winEnd);
  let idx = slice.indexOf(trimmed);
  if (idx === -1) idx = slice.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx === -1) { decision.textInvalid = true; return false; }
  decision.start = winStart + idx;
  decision.end = winStart + idx + trimmed.length;
  decision.text = documentText.slice(decision.start, decision.end);
  decision.contextBefore = documentText.slice(Math.max(0, decision.start - 30), decision.start);
  decision.contextAfter = documentText.slice(decision.end, Math.min(documentText.length, decision.end + 30));
  decision.textInvalid = false;
  return true;
}

/**
 * Render the top-of-review banner listing prior appearances of any
 * detected identifier in other cases. Silent when there are none.
 * Deliberately lightweight: this is a passive trigger, not a formal
 * conflicts policy. Shelter's substantive conflict rules govern the
 * actual decision.
 */
function renderPriorAppearanceBanner(summary) {
  if (!summary) return '';
  const rows = summary.cases.map((c) => {
    const items = c.items.map((it) => `<span class="chip">${escapeHtml(it.text)}</span>`).join(' ');
    return `<li><strong>${escapeHtml(c.caseId)}</strong>: ${items}</li>`;
  }).join('');
  return `
    <div class="integrity-block">
      <strong>${summary.totalIdentifiers} identifier${summary.totalIdentifiers === 1 ? '' : 's'} previously seen in ${summary.cases.length} other case${summary.cases.length === 1 ? '' : 's'}.</strong>
      This is a passive trigger, not a determination of conflict. Review before proceeding, and follow Shelter's substantive conflict-handling process if a real conflict is confirmed.
      <ul>${rows}</ul>
    </div>`;
}

function updateContextDisplay(rowEl, decision) {
  const el = rowEl.querySelector('[data-role="context"]');
  if (el) {
    el.textContent = `${decision.contextBefore}⟨${decision.text}⟩${decision.contextAfter}`;
  }
}

function markInvalidText(rowEl, invalid) {
  const el = rowEl.querySelector('[data-role="edit-status"]');
  if (el) el.hidden = !invalid;
}

function markSafeChip(rowEl, scope) {
  const el = rowEl.querySelector('[data-role="safe-status"]');
  if (!el) return;
  el.hidden = false;
  el.textContent = scope === 'global' ? 'Marked safe everywhere' : 'Marked safe in this case';
}

function initialDecision(entity, mapping) {
  const base = {
    ...entity,
    action: 'unresolved',
    token: '',
    replacement: null,
    originalStart: entity.start,
    originalEnd: entity.end,
    textInvalid: false,
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
  const catLabel = CATEGORY_LABELS[decision.category] || decision.category;
  const flag = JUDGEMENT_CATEGORIES.has(decision.category) ? '<span class="chip flag">review</span>' : '';
  const priorHits = decision.priorAppearances && decision.priorAppearances.length;
  const priorChip = priorHits
    ? `<span class="chip flag" title="${escapeHtml('Prior appearances: ' + decision.priorAppearances.map((p) => p.caseId).join(', '))}">seen in ${priorHits} other case${priorHits === 1 ? '' : 's'}</span>`
    : '';
  tr.innerHTML = `
    <td>
      <input class="entity-original" style="width:100%;font-family:var(--mono);font-size:12px;padding:4px 6px;" data-role="span-text" type="text" value="${escapeHtml(decision.text)}">
      <div class="entity-category" data-role="context" style="margin-top:2px">${escapeHtml(`${decision.contextBefore}⟨${decision.text}⟩${decision.contextAfter}`)}</div>
      <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">
        <button type="button" data-role="safe-case" style="padding:2px 8px;font-size:11px">Safe here</button>
        <button type="button" data-role="safe-global" style="padding:2px 8px;font-size:11px" title="Add this text to the global safe list, so no case flags it again">Safe everywhere</button>
        <span class="chip" data-role="safe-status" hidden></span>
        <span class="chip flag" data-role="edit-status" hidden>Edited text not found in the document</span>
      </div>
    </td>
    <td>${flag}${priorChip}<span class="entity-category">${escapeHtml(catLabel)}</span></td>
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
  const actionCell = rowEl.children[2];
  const tokenCell = rowEl.children[3];
  actionCell.innerHTML = renderActionSelect(decision);
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
  globalSettings: { version: 1, safeList: [], nerEnabled: false },
  watchlist: { version: 1, entries: [] },
  nerPipeline: null,
  nerLoading: false,
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
  document.getElementById('btn-delete-file').addEventListener('click', onDeleteOpenFile);
  document.getElementById('ner-toggle').addEventListener('change', onNerToggleChange);
  document.querySelectorAll('#file-view .tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => switchFileTab(btn.dataset.tab));
  });
}

async function onOpenRoot() {
  try {
    state.handles = await pickRoot();
    state.globalSettings = await loadGlobalSettings(state.handles.root);
    state.watchlist = await loadWatchlist(state.handles.root);
    document.getElementById('root-path').textContent = 'Casework folder ready';
    const toggle = document.getElementById('ner-toggle');
    toggle.checked = !!state.globalSettings.nerEnabled;
    updateNerStatus();
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
        fitem.innerHTML = `<span class="file-item-name">${escapeHtml(f.name)}</span><span class="file-item-right">${badge}<button class="file-item-del" data-role="delete" title="Delete this file from the case" type="button">×</button></span>`;
        fitem.addEventListener('click', (ev) => {
          if (ev.target.dataset && ev.target.dataset.role === 'delete') {
            ev.stopPropagation();
            onDeleteFile(c, f.name);
            return;
          }
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
        const btnPaste = document.createElement('button');
        btnPaste.textContent = 'Paste text as new file';
        btnPaste.title = 'Failsafe for content the tool cannot yet extract from PDFs or .msg files. Paste in the text, name the file, and the tool saves it as a .txt inside the case.';
        btnPaste.addEventListener('click', (ev) => { ev.stopPropagation(); onPasteTextToCase(c); });
        actions.appendChild(btnPaste);
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
      const importedNames = [];
      const emlSummaries = [];
      for (const f of files) {
        const savedName = await handleDroppedFile(caseObj, f, emlSummaries);
        importedNames.push(savedName);
      }
      await appendAudit(caseObj.rawHandle, `${files.length} file(s) added: ${importedNames.join(', ')}`);
      await refreshCases();
      if (emlSummaries.length) {
        showEmailImportSummary(emlSummaries);
      } else {
        showToast(`${files.length} file${files.length === 1 ? '' : 's'} added.`);
      }
    });
  }
}

/**
 * Route a dropped file through parser-specific handling if we recognise
 * the format, otherwise fall back to a raw byte-for-byte copy. Returns
 * the filename that was actually saved into the case, so the audit log
 * reflects the on-disk state.
 */
async function handleDroppedFile(caseObj, file, emlSummaries) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.eml')) {
    try {
      const raw = await readFileAsUtf8(file);
      const parsed = parseEml(raw);
      const text = formatEmlAsText(parsed, file.name);
      const savedName = await writeUnique(caseObj.rawHandle, replaceExtension(file.name, '.txt'), text);
      emlSummaries.push({
        sourceName: file.name,
        savedName,
        attachments: parsed.attachments,
        warnings: parsed.warnings,
      });
      return savedName;
    } catch (err) {
      const buf = await file.arrayBuffer();
      const savedName = await writeRawUnique(caseObj.rawHandle, file.name, buf);
      showToast(`Could not parse ${file.name} as email (${err.message}); saved raw instead. Use "Paste text as new file" for the content you want to sanitise.`, true);
      return savedName;
    }
  }
  if (lower.endsWith('.pdf')) {
    if (!window.pdfjsLib) {
      const buf = await file.arrayBuffer();
      const savedName = await writeRawUnique(caseObj.rawHandle, file.name, buf);
      showToast('.pdf support requires lib/pdf.min.js in the same folder. Saved raw for now.', true);
      return savedName;
    }
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parsePdf(buf, file.name);
      const savedName = await writeUnique(caseObj.rawHandle, replaceExtension(file.name, '.txt'), parsed.text);
      emlSummaries.push({
        sourceName: file.name,
        savedName,
        attachments: [],
        warnings: parsed.warnings,
      });
      return savedName;
    } catch (err) {
      const buf = await file.arrayBuffer();
      const savedName = await writeRawUnique(caseObj.rawHandle, file.name, buf);
      showToast(`Could not extract text from ${file.name} (${err.message}); saved raw. If it is a scanned image PDF, OCR is not yet in scope.`, true);
      return savedName;
    }
  }
  if (lower.endsWith('.msg')) {
    if (typeof window.MsgReader !== 'function') {
      const buf = await file.arrayBuffer();
      const savedName = await writeRawUnique(caseObj.rawHandle, file.name, buf);
      showToast(`.msg support requires lib/msgreader.min.js in the same folder. Saved raw for now.`, true);
      return savedName;
    }
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseMsg(buf);
      const text = formatEmlAsText(parsed, file.name);
      const savedName = await writeUnique(caseObj.rawHandle, replaceExtension(file.name, '.txt'), text);
      emlSummaries.push({
        sourceName: file.name,
        savedName,
        attachments: parsed.attachments,
        warnings: parsed.warnings,
      });
      return savedName;
    } catch (err) {
      const buf = await file.arrayBuffer();
      const savedName = await writeRawUnique(caseObj.rawHandle, file.name, buf);
      showToast(`Could not parse ${file.name} as .msg (${err.message}); saved raw. Try Outlook > Save As > .eml and drop that instead.`, true);
      return savedName;
    }
  }
  const buf = await file.arrayBuffer();
  return writeRawUnique(caseObj.rawHandle, file.name, buf);
}

/**
 * Adapt msgreader's output shape into the same `{ headers, bodyText,
 * attachments, warnings }` structure the .eml pipeline uses, so both
 * formats flow through `formatEmlAsText` and land on disk with the same
 * header layout. Recipients are consolidated into To / Cc lines; the
 * primary body is text/plain (bodyHtml stripped as a fallback).
 */
let pdfWorkerConfigured = false;

/**
 * Extract page text from a PDF. Configures the PDF.js worker on first
 * use; if the worker path cannot be loaded (typical from `file://`),
 * PDF.js's own main-thread fallback runs instead, which is slower but
 * fine for the file sizes casework produces.
 *
 * Returns the same shape the other importers use so it can flow through
 * the shared summary and audit path.
 */
async function parsePdf(arrayBuffer, sourceName) {
  const pdfjs = window.pdfjsLib;
  if (!pdfWorkerConfigured) {
    try { pdfjs.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js'; } catch (_e) { /* main-thread fallback */ }
    pdfWorkerConfigured = true;
  }
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const warnings = [];
  const parts = [`# Imported from PDF: ${sourceName}`, `# Pages: ${doc.numPages}`, ''];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    const pageText = joinPdfLines(text.items);
    parts.push(`--- Page ${i} ---`, pageText, '');
    if (!pageText.trim()) warnings.push(`Page ${i} produced no text (image or scanned page).`);
  }
  if (doc.numPages && warnings.length === doc.numPages) {
    warnings.push('No text extracted from any page. The PDF is likely scanned. OCR is not yet in scope.');
  }
  return { text: parts.join('\n'), warnings };
}

/**
 * PDF.js emits text items with positional data, one item per run of
 * glyphs. Reconstruct visual lines by grouping items whose y-position
 * matches, then join them with spaces where the item.hasEOL flag
 * indicates a line break.
 */
function joinPdfLines(items) {
  if (!items.length) return '';
  const lines = [];
  let current = [];
  let lastY = null;
  for (const it of items) {
    const y = it.transform ? it.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
      lines.push(current.join(''));
      current = [];
    }
    current.push(it.str);
    if (it.hasEOL) {
      lines.push(current.join(''));
      current = [];
    }
    lastY = y;
  }
  if (current.length) lines.push(current.join(''));
  return lines.join('\n');
}

function parseMsg(arrayBuffer) {
  const reader = new window.MsgReader(arrayBuffer);
  const data = reader.getFileData();
  const warnings = [];
  const headers = [];
  const push = (name, value) => { if (value) headers.push({ name, value }); };
  const senderLine = data.senderName
    ? (data.senderEmail ? `${data.senderName} <${data.senderEmail}>` : data.senderName)
    : (data.senderEmail || '');
  push('From', senderLine);
  const toList = (data.recipients || []).filter((r) => (r.recipType || 'to') === 'to')
    .map((r) => r.name ? `${r.name} <${r.email || ''}>` : (r.email || '')).filter(Boolean).join(', ');
  const ccList = (data.recipients || []).filter((r) => r.recipType === 'cc')
    .map((r) => r.name ? `${r.name} <${r.email || ''}>` : (r.email || '')).filter(Boolean).join(', ');
  push('To', toList);
  push('Cc', ccList);
  push('Subject', data.subject || data.normalizedSubject || '');
  push('Date', data.messageDeliveryTime || data.clientSubmitTime || '');
  push('Message-ID', data.internetMessageId || '');
  push('In-Reply-To', data.inReplyToId || '');
  let bodyText = data.body || '';
  if (!bodyText && data.bodyHtml) {
    warnings.push('No plain-text body; extracted from HTML fallback.');
    bodyText = emlHtmlToText(data.bodyHtml);
  }
  const attachments = (data.attachments || []).map((a) => ({
    filename: a.fileName || a.displayName || '(unnamed)',
    contentType: a.mimeType || 'application/octet-stream',
    approxSize: a.contentLength || 0,
  }));
  return { headers, bodyText, attachments, warnings };
}

async function readFileAsUtf8(file) {
  const buf = await file.arrayBuffer();
  return new TextDecoder('utf-8').decode(new Uint8Array(buf));
}

function replaceExtension(name, newExt) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name + newExt;
  return name.slice(0, dot) + newExt;
}

async function writeUnique(dirHandle, name, text) {
  const unique = await ensureUniqueName(dirHandle, name);
  await writeFileText(dirHandle, unique, text);
  return unique;
}

async function writeRawUnique(dirHandle, name, buf) {
  const unique = await ensureUniqueName(dirHandle, name);
  const h = await dirHandle.getFileHandle(unique, { create: true });
  const w = await h.createWritable();
  await w.write(buf);
  await w.close();
  return unique;
}

async function ensureUniqueName(dirHandle, name) {
  const exists = async (n) => {
    try { await dirHandle.getFileHandle(n); return true; } catch (_e) { return false; }
  };
  if (!(await exists(name))) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 500; i++) {
    const candidate = `${base}_${i}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}_${Date.now()}${ext}`;
}

function showEmailImportSummary(summaries) {
  const root = document.getElementById('dialog-root');
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.width = '620px';
  backdrop.appendChild(modal);
  const rows = summaries.map((s) => `
    <div style="margin-bottom:12px;padding:8px;background:#f4f2ec;border-radius:4px;">
      <div><strong>${escapeHtml(s.sourceName)}</strong> imported as <code>${escapeHtml(s.savedName)}</code></div>
      ${s.attachments.length ? `
        <div style="margin-top:4px;font-size:12px;">Attachments (recorded in the text file as present, not processed):</div>
        <ul style="margin:2px 0 0 20px;font-size:12px;">
          ${s.attachments.map((a) => `<li>${escapeHtml(a.filename)} <span class="muted">(${escapeHtml(a.contentType)}, ~${escapeHtml(humanBytes(a.approxSize))})</span></li>`).join('')}
        </ul>` : '<div class="muted" style="font-size:12px;">No attachments detected.</div>'}
      ${s.warnings.length ? `
        <div style="margin-top:4px;font-size:12px;color:var(--warning-text);">Warnings: ${s.warnings.map(escapeHtml).join('; ')}</div>` : ''}
    </div>
  `).join('');
  modal.innerHTML = `
    <div class="modal-header">Email import summary</div>
    <div class="modal-body">
      <p class="muted">Attachment content is not yet extracted by the tool. The imported text file lists them so nothing is silently dropped, and their names still appear in the sanitisation review. When PDF and image support arrives in phase 2, previously skipped attachments can be processed from the case view.</p>
      ${rows}
    </div>
    <div class="modal-footer">
      <button class="primary" data-action="ok">Done</button>
    </div>
  `;
  modal.addEventListener('click', (ev) => {
    if (ev.target.dataset && ev.target.dataset.action === 'ok') backdrop.remove();
  });
  root.appendChild(backdrop);
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
    const unsupported = classifyUnsupported(name);
    if (unsupported) {
      state.currentText = null;
      state.currentOriginalMtime = null;
      state.currentSanitised = null;
      state.currentSanitisedMtime = null;
      state.currentMapping = await loadMapping(c.rawHandle, c.id);
      renderUnsupportedFileView(name, c, unsupported);
      renderSidebar();
      return;
    }
    const { text, lastModified } = await readFileText(c.rawHandle, name);
    if (looksBinary(text)) {
      state.currentText = null;
      state.currentOriginalMtime = null;
      state.currentSanitised = null;
      state.currentSanitisedMtime = null;
      state.currentMapping = await loadMapping(c.rawHandle, c.id);
      renderUnsupportedFileView(name, c, 'The content of this file does not look like plain text. It may be a binary format the tool cannot yet parse.');
      renderSidebar();
      return;
    }
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

/**
 * Return a human-readable reason if the file cannot yet be shown as text
 * based on extension alone, or null if it should be attempted.
 */
function classifyUnsupported(name) {
  const lower = name.toLowerCase();
  const map = [
    ['.pdf', 'PDFs are extracted on drop. This file is a raw copy left over from before PDF support arrived; delete and re-drop the source to import it as text.'],
    ['.msg', 'Outlook .msg files are parsed on drop. This file is a raw copy left over from before .msg support arrived; delete and re-drop the source to import it as text.'],
    ['.doc', 'Legacy .doc format is not supported. Copy the text out and paste it back in.'],
    ['.docx', '.docx files are not yet parsed. Copy the text out and paste it back in.'],
    ['.xls', 'Excel files are not supported.'],
    ['.xlsx', 'Excel files are not supported.'],
    ['.png', 'Image files are not supported. Phase 2 adds OCR (Tesseract) if needed.'],
    ['.jpg', 'Image files are not supported. Phase 2 adds OCR (Tesseract) if needed.'],
    ['.jpeg', 'Image files are not supported. Phase 2 adds OCR (Tesseract) if needed.'],
    ['.gif', 'Image files are not supported.'],
    ['.zip', 'Archive files are not opened by the tool.'],
  ];
  for (const [ext, reason] of map) {
    if (lower.endsWith(ext)) return reason;
  }
  return null;
}

/**
 * Rough binary heuristic: count control characters (excluding tab, CR,
 * LF) in the first kilobyte. If they are more than 5% of the sample, the
 * content is almost certainly not human text.
 */
function looksBinary(text) {
  if (!text) return false;
  const sample = text.slice(0, 1024);
  if (!sample.length) return false;
  let ctrl = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 65533) ctrl++;
  }
  return (ctrl / sample.length) > 0.05;
}

function renderUnsupportedFileView(name, caseObj, reason) {
  document.getElementById('welcome').hidden = true;
  document.getElementById('file-view').hidden = false;
  document.getElementById('file-name').textContent = name;
  document.getElementById('file-case').textContent = `Case ${caseObj.id}`;
  const banner = `This file cannot be shown or sanitised in its current form. ${escapeHtml(reason)} As a failsafe, use "Paste text as new file" on the case row: open ${escapeHtml(name)} in its native viewer, copy the text you want to send to Claude, and paste it in. The tool saves the pasted text as a .txt inside the case and sanitises it normally.`;
  const pre = document.getElementById('original-content');
  pre.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'warning';
  div.innerHTML = banner;
  pre.appendChild(div);
  document.getElementById('sanitised-content').textContent = '';
  document.getElementById('sanitised-status').textContent = 'Not applicable for this file type.';
  document.getElementById('stale-warning').hidden = true;
  document.getElementById('btn-resanitise').hidden = true;
  document.getElementById('btn-copy-sanitised').disabled = true;
  document.getElementById('btn-sanitise').disabled = true;
  switchFileTab('original');
}

function renderFileView(name, caseObj, text, sanitisedText) {
  document.getElementById('welcome').hidden = true;
  document.getElementById('file-view').hidden = false;
  document.getElementById('file-name').textContent = name;
  document.getElementById('file-case').textContent = `Case ${caseObj.id}`;
  const pre = document.getElementById('original-content');
  pre.innerHTML = '';
  pre.textContent = text;
  document.getElementById('sanitised-content').textContent = sanitisedText || '';
  document.getElementById('sanitised-status').textContent = sanitisedText
    ? 'This file has been sanitised.'
    : 'This file has not been sanitised yet. Click "Sanitise this file" to review detected entities.';
  const stale = sanitisedText && state.currentOriginalMtime > state.currentSanitisedMtime;
  document.getElementById('stale-warning').hidden = !stale;
  document.getElementById('btn-resanitise').hidden = !sanitisedText;
  document.getElementById('btn-copy-sanitised').disabled = !sanitisedText;
  document.getElementById('btn-sanitise').disabled = false;
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
  const safeSet = buildSafeSet(mapping.safeList, state.globalSettings.safeList);
  const rawEntities = detectEntities(state.currentText, mapping, safeSet);
  let mergedEntities = rawEntities;
  if (state.globalSettings.nerEnabled && state.nerPipeline) {
    try {
      updateNerStatus('running');
      const nerSpans = (await runNerOnText(state.currentText))
        .filter((s) => !safeSet.has((s.text || '').toLowerCase().trim()));
      mergedEntities = mergeNerSpans(rawEntities, nerSpans);
      updateNerStatus('ready');
    } catch (err) {
      updateNerStatus('ready');
      showToast(`NER run failed, continuing with regex only: ${err.message}`, true);
    }
  }
  const entities = crossCheckWatchlist(mergedEntities, state.watchlist, c.id);
  const priorSummary = summarisePriorAppearances(entities);
  const result = await openReviewDialog(entities, mapping, {
    title: state.selectedFile,
    documentText: state.currentText,
    priorSummary,
  });
  if (!result) return;
  for (const upd of result.mappingUpdates) {
    if (upd.aliasFor) addAlias(mapping, upd.aliasFor, upd.alias);
  }
  const safeAudit = await persistSafeListUpdates(mapping, result.safeListUpdates || []);
  const sanitisedRaw = applySanitisation(state.currentText, result.decisions);
  let sanitised;
  let verbatimIds = [];
  try {
    const rewritten = rewriteVerbatimBlocks(state.currentText, sanitisedRaw, mapping);
    sanitised = rewritten.sanitised;
    verbatimIds = rewritten.ids;
  } catch (err) {
    showToast(`Verbatim rewrite failed: ${err.message}`, true);
    return;
  }
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
    verbatimCount: verbatimIds.length,
  });
  const output = header + sanitised;
  await writeFileText(c.sanHandle, state.selectedFile, output);
  await saveMapping(c.rawHandle, mapping);
  const added = accumulateWatchlist(state.watchlist, mapping, c.id);
  if (added) await saveWatchlist(state.handles.root, state.watchlist);
  const verbatimAudit = verbatimIds.length ? `; ${verbatimIds.length} verbatim block(s)` : '';
  const watchlistAudit = added ? `; ${added} new watchlist entrie(s)` : '';
  await appendAudit(c.rawHandle, `Sanitised: ${state.selectedFile} (${result.decisions.length} decisions, ${result.mappingUpdates.length} new mapping entries)${safeAudit ? `; ${safeAudit}` : ''}${verbatimAudit}${watchlistAudit}`);
  state.currentMapping = mapping;
  await selectFile(state.selectedFile);
  showToast(verbatimIds.length ? `Sanitised file written with ${verbatimIds.length} verbatim block(s).` : 'Sanitised file written.');
}

/**
 * Reduce the per-entity prior-appearance data to a small summary the
 * review dialog can render as a single banner without cluttering the
 * table. Returns null if no prior appearances were found.
 */
function summarisePriorAppearances(entities) {
  const flagged = entities.filter((e) => e.priorAppearances && e.priorAppearances.length);
  if (!flagged.length) return null;
  const perCase = new Map();
  for (const e of flagged) {
    for (const p of e.priorAppearances) {
      const list = perCase.get(p.caseId) || [];
      list.push({ text: e.text, category: e.category, strength: p.matchStrength });
      perCase.set(p.caseId, list);
    }
  }
  return {
    totalIdentifiers: flagged.length,
    cases: Array.from(perCase.entries()).map(([caseId, items]) => ({ caseId, items })),
  };
}

/**
 * Fold the review dialog's safe-list updates into the case mapping and
 * the global settings, and persist whichever ones changed. Returns a
 * short audit summary or an empty string.
 */
async function persistSafeListUpdates(mapping, updates) {
  if (!updates.length) return '';
  let addedCase = 0;
  let addedGlobal = 0;
  const lowerIn = (arr, s) => arr.some((x) => String(x).toLowerCase() === s.toLowerCase());
  for (const upd of updates) {
    if (!lowerIn(mapping.safeList, upd.text)) {
      mapping.safeList.push(upd.text);
      addedCase++;
    }
    if (upd.scope === 'global' && !lowerIn(state.globalSettings.safeList, upd.text)) {
      state.globalSettings.safeList.push(upd.text);
      addedGlobal++;
    }
  }
  if (addedGlobal) {
    await saveGlobalSettings(state.handles.root, state.globalSettings);
  }
  const parts = [];
  if (addedCase) parts.push(`${addedCase} added to case safe list`);
  if (addedGlobal) parts.push(`${addedGlobal} added to global safe list`);
  return parts.join(', ');
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
  const { hits, replaced, cleaned, verbatimMismatches } = rehydrate(text, mapping);
  if (verbatimMismatches && verbatimMismatches.length) {
    const choice = await showVerbatimMismatchDialog(verbatimMismatches);
    if (choice === 'abort') {
      showToast('Rehydration aborted. Verbatim block mismatch left unresolved.', true);
      return;
    }
    await appendAudit(c.rawHandle, `Verbatim mismatch acknowledged and overridden by adviser for ${verbatimMismatches.length} block(s).`);
  }
  if (hits.length) {
    await showRehydrateIntegrityDialog(hits, replaced, cleaned, mapping);
    return;
  }
  try {
    await copyText(replaced, 'rehydrated text');
    const mismatchNote = verbatimMismatches && verbatimMismatches.length ? `; ${verbatimMismatches.length} verbatim mismatch(es) overridden` : '';
    await appendAudit(c.rawHandle, `Rehydrated ${text.length} chars (${(text.match(/\[[A-Z_]+.*?\]/g) || []).length} tokens)${mismatchNote}.`);
    showToast('Rehydrated text copied. Paste into Outlook or CRM.');
  } catch (err) {
    showToast(err.message, true);
  }
}

/**
 * Present verbatim byte-match failures to the adviser and let them
 * decide whether to abort or override. Overriding does not "fix" the
 * mismatch: it simply lets the (potentially altered) block through
 * after the adviser has read what changed. The audit log records the
 * override.
 */
function showVerbatimMismatchDialog(mismatches) {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root');
    root.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.width = '820px';
    backdrop.appendChild(modal);
    const rows = mismatches.map((mm) => `
      <div style="margin-bottom:16px;">
        <div class="entity-category">Block id: ${escapeHtml(mm.id)} - ${escapeHtml(mm.reason)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;">
          <div>
            <div class="entity-category">Original (in mapping)</div>
            <pre style="border:1px solid var(--border);padding:6px;font-size:12px;white-space:pre-wrap;max-height:220px;overflow:auto;">${escapeHtml(mm.expected == null ? '(no record of this id in the mapping)' : mm.expected)}</pre>
          </div>
          <div>
            <div class="entity-category">Rehydrated from AI reply</div>
            <pre style="border:1px solid var(--border);padding:6px;font-size:12px;white-space:pre-wrap;max-height:220px;overflow:auto;">${escapeHtml(mm.actual)}</pre>
          </div>
        </div>
      </div>
    `).join('');
    modal.innerHTML = `
      <div class="modal-header">Verbatim block byte-match failed</div>
      <div class="modal-body">
        <p>The AI's response should have reproduced the following block(s) exactly. Any difference blocks the paste-to-CRM step so the referral note stays byte-identical to the referral form. Review each pair below.</p>
        ${rows}
      </div>
      <div class="modal-footer">
        <button class="danger" data-action="abort">Abort rehydration</button>
        <button data-action="override">Override and continue</button>
      </div>
    `;
    modal.addEventListener('click', (ev) => {
      const a = ev.target.dataset && ev.target.dataset.action;
      if (a === 'abort' || a === 'override') {
        backdrop.remove();
        resolve(a);
      }
    });
    root.appendChild(backdrop);
  });
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

/**
 * Failsafe input path for content the tool cannot yet extract from
 * emails, PDFs, or other binary formats. The adviser opens the source
 * in its native viewer, copies the text they want, and pastes it in
 * here. The pasted text is saved as a plain .txt inside the case, and
 * flows through the normal sanitise / rehydrate path from there.
 */
function onPasteTextToCase(caseObj) {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root');
    root.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.width = '720px';
    backdrop.appendChild(modal);
    const defaultName = buildPastedFilename();
    modal.innerHTML = `
      <div class="modal-header">Paste text as new file in ${escapeHtml(caseObj.id)}</div>
      <div class="modal-body">
        <p class="muted">Use this when the tool cannot yet parse the source (PDF, .msg, .docx). Open the source in its native viewer, copy the text, paste it here, and give the resulting file a name.</p>
        <div class="form-row">
          <label>Filename (kept as-is; .txt appended if missing)</label>
          <input id="paste-filename" type="text" value="${escapeHtml(defaultName)}">
        </div>
        <div class="form-row">
          <label>Optional source note (recorded in the audit log, not in the file)</label>
          <input id="paste-source" type="text" placeholder="e.g. from Outlook: letter from Sheffield CC dated 10 July 2026">
        </div>
        <div class="form-row">
          <label>Text</label>
          <textarea id="paste-text" rows="16" style="font-family: var(--mono); font-size: 13px;" placeholder="Paste the text here..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button data-action="cancel">Cancel</button>
        <button class="primary" data-action="save">Save into case</button>
      </div>
    `;
    setTimeout(() => modal.querySelector('#paste-text').focus(), 0);
    modal.addEventListener('click', async (ev) => {
      const action = ev.target.dataset && ev.target.dataset.action;
      if (action === 'cancel') { backdrop.remove(); resolve(); return; }
      if (action !== 'save') return;
      const rawName = modal.querySelector('#paste-filename').value.trim();
      const text = modal.querySelector('#paste-text').value;
      const source = modal.querySelector('#paste-source').value.trim();
      if (!rawName) { showToast('Please give the file a name.', true); return; }
      if (!text) { showToast('Please paste some text before saving.', true); return; }
      let name = rawName;
      if (!/\.[a-z0-9]{1,6}$/i.test(name)) name += '.txt';
      const existing = (caseObj.files || []).some((f) => f.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        if (!confirm(`A file called ${name} already exists in this case. Overwrite it?`)) return;
      }
      try {
        await writeFileText(caseObj.rawHandle, name, text);
        const sourceLine = source ? `, source: ${source}` : '';
        await appendAudit(caseObj.rawHandle, `Pasted text saved as ${name} (${text.length} chars${sourceLine})`);
        backdrop.remove();
        await refreshCases();
        await selectCase(caseObj.id);
        await selectFile(name);
        showToast(`Saved ${name} into ${caseObj.id}.`);
        resolve();
      } catch (err) {
        showToast(`Could not save: ${err.message}`, true);
      }
    });
    root.appendChild(backdrop);
  });
}

function buildPastedFilename() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `pasted_${yyyy}-${mm}-${dd}_${hh}${mn}.txt`;
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

/**
 * Delete a file from a case. Removes the raw copy and, if present, the
 * sanitised mirror. The case mapping is left alone: tokens already
 * allocated may still be referenced by other files in the case, and
 * removing them would silently break rehydration of those.
 */
async function onDeleteFile(caseObj, name) {
  const hasSanitised = (caseObj.files.find((f) => f.name === name) || {}).hasSanitised;
  const proceed = confirm(
    `Delete "${name}" from case ${caseObj.id}?\n\n`
    + `This removes the raw copy${hasSanitised ? ' and the sanitised copy' : ''}. `
    + 'The case mapping is not changed, so any tokens already assigned still work in other files. '
    + 'This cannot be undone from the tool.'
  );
  if (!proceed) return;
  try {
    await deleteEntry(caseObj.rawHandle, name);
    if (hasSanitised) {
      try { await deleteEntry(caseObj.sanHandle, name); } catch (_e) { /* mirror already missing */ }
    }
    await appendAudit(caseObj.rawHandle, `Deleted file: ${name}${hasSanitised ? ' (raw and sanitised)' : ' (raw only)'}`);
    if (state.selectedFile === name && state.selectedCaseId === caseObj.id) {
      state.selectedFile = null;
      hideFileView();
    }
    await refreshCases();
    showToast(`Deleted ${name}.`);
  } catch (err) {
    showToast(`Could not delete: ${err.message}`, true);
  }
}

/**
 * Enhanced-detection toggle. First activation warns about the ~50 MB
 * model download, loads the pipeline, and persists the state. Turning
 * off keeps the loaded pipeline in memory so re-enabling is instant.
 */
async function onNerToggleChange(ev) {
  const enable = !!ev.target.checked;
  if (!state.handles) {
    showToast('Open a casework folder first so the setting can be saved.', true);
    ev.target.checked = false;
    return;
  }
  if (enable) {
    if (!state.nerPipeline) {
      const ok = confirm(
        'Turning on enhanced detection downloads a ~50 MB named-entity model from huggingface.co on first use. Subsequent uses are offline. Proceed?'
      );
      if (!ok) {
        ev.target.checked = false;
        return;
      }
      try {
        updateNerStatus('loading');
        await ensureNerPipeline((event) => {
          if (event && event.status === 'progress' && event.file) {
            updateNerStatus(`downloading ${event.file.split('/').pop()} ${Math.round(event.progress || 0)}%`);
          }
        });
        updateNerStatus('ready');
      } catch (err) {
        showToast(`Could not load NER model: ${err.message}`, true);
        ev.target.checked = false;
        updateNerStatus();
        return;
      }
    } else {
      updateNerStatus('ready');
    }
  } else {
    updateNerStatus();
  }
  state.globalSettings.nerEnabled = enable;
  await saveGlobalSettings(state.handles.root, state.globalSettings);
}

function updateNerStatus(label) {
  const el = document.getElementById('ner-status');
  if (!el) return;
  if (!label) { el.textContent = ''; return; }
  el.textContent = `(${label})`;
}

async function onDeleteOpenFile() {
  if (!state.selectedFile) return;
  const c = state.cases.find((x) => x.id === state.selectedCaseId);
  if (!c) return;
  await onDeleteFile(c, state.selectedFile);
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
