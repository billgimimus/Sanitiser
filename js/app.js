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

  // Version-tag written into every sanitised file's header block, exposed
  // in the About panel, and recorded in the audit log for every action.
  // Bump when a shipped change alters detection, tokenisation, rehydration
  // or the on-disk format, so a later bug can be traced back to a specific
  // vintage of tool output.
  const TOOL_VERSION = '1.0';


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
  url: 'URL (auto-tokenised)',
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
 * Roles whose value is a person's name. When a mapping entry uses one of
 * these tokens the sanitiser seeds standard name variations (initials,
 * titles, first-name-only, etc.) as aliases so shorthand references get
 * caught alongside the full form.
 *
 * Roles that hold contact details, org names or venue names are excluded.
 */
const PERSON_NAME_ROLES = new Set([
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
  '[LANDLORD]',
  "[LANDLORD'S AGENT]",
  "[LANDLORD'S SOLICITOR]",
  '[LA HOUSING OFFICER]',
  '[LA HOMELESSNESS OFFICER]',
  '[LA REVIEWS OFFICER]',
  '[LA HB/UC DECISION MAKER]',
  '[SM]',
  '[SUPPORT WORKER]',
  '[CASEWORKER]',
  '[IDVA]',
  '[JUDGE]',
  '[BAILIFF]',
  '[DUTY SOLICITOR]',
  '[NEIGHBOUR]',
  '[WITNESS]',
  '[THIRD PARTY]',
  '[ADVISER]',
]);

/**
 * Titles/honorifics to prepend when generating standard name variations.
 * Neutral coverage — gender isn't inferrable from a name, so we seed
 * every common form; only the one that actually appears in the document
 * will match at replace time.
 */
const PERSON_NAME_TITLES = [
  'Mr', 'Mrs', 'Ms', 'Miss', 'Mx', 'Dr', 'Prof', 'Sir', 'Dame',
];

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
 * URLs, including domain-only forms like www.natwest.co.uk. Captured
 * whole so the review dialog can offer to tokenise the entire URL when
 * the organisation name is embedded in it (e.g. a mortgage lender's
 * homepage). Trailing punctuation (.,;:) is trimmed off matches so a
 * URL at the end of a sentence does not include the full stop.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'()\[\]]+/gi;

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
  {
    name: 'url',
    run(text) {
      const out = [];
      for (const m of text.matchAll(URL_PATTERN)) {
        let matched = m[0];
        while (/[.,;:!?)\]]$/.test(matched)) matched = matched.slice(0, -1);
        if (matched.length < 6) continue;
        out.push({
          start: m.index,
          end: m.index + matched.length,
          text: matched,
          category: 'url',
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
 *   Casework/                     active raw
 *   Casework_sanitised/           active sanitised
 *   Casework_rehydrated/          active rehydrated (audit trail)
 *   Casework_closed/              closed raw
 *   Casework_sanitised_closed/    closed sanitised
 *   Casework_rehydrated_closed/   closed rehydrated
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
  activeRehy: 'Casework_rehydrated',
  closedRaw: 'Casework_closed',
  closedSan: 'Casework_sanitised_closed',
  closedRehy: 'Casework_rehydrated_closed',
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
async function pickRoot(existingRoot) {
  const root = existingRoot || await window.showDirectoryPicker({ mode: 'readwrite' });
  const activeRaw = await root.getDirectoryHandle(ROOTS.activeRaw, { create: true });
  const activeSan = await root.getDirectoryHandle(ROOTS.activeSan, { create: true });
  const activeRehy = await root.getDirectoryHandle(ROOTS.activeRehy, { create: true });
  const closedRaw = await root.getDirectoryHandle(ROOTS.closedRaw, { create: true });
  const closedSan = await root.getDirectoryHandle(ROOTS.closedSan, { create: true });
  const closedRehy = await root.getDirectoryHandle(ROOTS.closedRehy, { create: true });
  return { root, activeRaw, activeSan, activeRehy, closedRaw, closedSan, closedRehy };
}

/**
 * Persist and restore the casework root DirectoryHandle in IndexedDB
 * so the adviser does not need to grant folder access on every session.
 * File System Access API handles are transferable to IDB; on next visit
 * we read the handle back, then need a user gesture to call
 * requestPermission before we can read or write.
 */
const HANDLE_DB_NAME = 'sanitiser-handles';
const HANDLE_DB_STORE = 'handles';

function openHandleDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { resolve(null); return; }
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(HANDLE_DB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRootHandle(handle) {
  try {
    const db = await openHandleDB();
    if (!db) return;
    const tx = db.transaction(HANDLE_DB_STORE, 'readwrite');
    tx.objectStore(HANDLE_DB_STORE).put({ id: 'root', handle, savedAt: new Date().toISOString() });
    await new Promise((resolve) => { tx.oncomplete = resolve; tx.onerror = resolve; });
  } catch (_e) { /* non-fatal */ }
}

async function loadRootHandle() {
  try {
    const db = await openHandleDB();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction(HANDLE_DB_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_DB_STORE).get('root');
      req.onsuccess = () => resolve(req.result ? req.result.handle : null);
      req.onerror = () => resolve(null);
    });
  } catch (_e) { return null; }
}

async function clearRootHandle() {
  try {
    const db = await openHandleDB();
    if (!db) return;
    const tx = db.transaction(HANDLE_DB_STORE, 'readwrite');
    tx.objectStore(HANDLE_DB_STORE).delete('root');
    await new Promise((resolve) => { tx.oncomplete = resolve; tx.onerror = resolve; });
  } catch (_e) { /* non-fatal */ }
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
  const rehyParent = kind === 'closed' ? handles.closedRehy : handles.activeRehy;
  const cases = [];
  for await (const entry of rawParent.values()) {
    if (entry.kind !== 'directory') continue;
    const rawHandle = entry;
    let sanHandle = null;
    let rehyHandle = null;
    try {
      sanHandle = await sanParent.getDirectoryHandle(entry.name, { create: true });
    } catch (_e) {
      sanHandle = null;
    }
    if (rehyParent) {
      try { rehyHandle = await rehyParent.getDirectoryHandle(entry.name, { create: true }); }
      catch (_e) { rehyHandle = null; }
    }
    const mapping = await readJSON(rawHandle, '_mapping.json');
    const { files, aiReplies } = await listFiles(rawHandle, sanHandle, mapping);
    const rehydrated = rehyHandle ? await listRehydratedFiles(rehyHandle) : [];
    const meta = await tryReadClosure(rawHandle);
    const clientLabel = deriveClientLabel(mapping);
    cases.push({ id: entry.name, kind, rawHandle, sanHandle, rehyHandle, files, aiReplies, rehydrated, meta, clientLabel });
  }
  cases.sort((a, b) => a.id.localeCompare(b.id));
  return cases;
}

async function listRehydratedFiles(rehyHandle) {
  const out = [];
  for await (const s of rehyHandle.values()) {
    if (s.kind !== 'file') continue;
    if (s.name.startsWith('_')) continue;
    const f = await s.getFile();
    out.push({ name: s.name, size: f.size, lastModified: f.lastModified });
  }
  out.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  return out;
}

/**
 * Once a client name is known for a case (a [CL] or [CL_1] mapping entry
 * exists) return a short "F.Lastname" label to show next to the case ID
 * in the sidebar. Purely local rendering - the derived label never
 * touches the file system or any outbound payload. Returns '' when no
 * client entry exists yet.
 */
function deriveClientLabel(mapping) {
  const entries = (mapping && mapping.entries) || [];
  const cl = entries.find((e) => e && (e.token === '[CL]' || e.token === '[CL_1]'))
    || entries.find((e) => e && /^\[CL_\d+\]$/.test(e.token || ''));
  if (!cl || !cl.original) return '';
  const words = String(cl.original).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  // Strip a leading title (Mr / Mrs / Dr etc.) so "Mr Gary Martino"
  // still yields "G.Martino".
  const titleRx = new RegExp('^(?:' + PERSON_NAME_TITLES.join('|') + ')\\.?$', 'i');
  if (words.length > 1 && titleRx.test(words[0])) words.shift();
  if (!words.length) return '';
  if (words.length === 1) return words[0];
  const first = words[0];
  const last = words[words.length - 1];
  return `${first[0].toUpperCase()}.${last}`;
}

async function listFiles(rawHandle, sanHandle, mapping) {
  const out = [];
  const sanNames = new Set();
  if (sanHandle) {
    for await (const s of sanHandle.values()) {
      if (s.kind === 'file') sanNames.add(s.name);
    }
  }
  const referencedSan = new Set();
  const filemap = (mapping && mapping.sanitisedFilenames) || {};
  for await (const entry of rawHandle.values()) {
    if (entry.kind !== 'file') continue;
    if (entry.name === '_mapping.json' || entry.name === '_closure.json' || entry.name === '_audit.log' || entry.name === '_debug_export_block.log') continue;
    const file = await entry.getFile();
    // If the mapping remembers a safe-form sanitised name for this raw
    // file, use it; otherwise fall back to same-name pairing so files
    // sanitised before this feature keep showing up correctly.
    const sanName = filemap[entry.name] || entry.name;
    referencedSan.add(sanName);
    referencedSan.add(entry.name);
    out.push({
      name: entry.name,
      sanitisedName: sanName,
      size: file.size,
      lastModified: file.lastModified,
      hasSanitised: sanNames.has(sanName) || sanNames.has(entry.name),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  // AI-reply candidates: any file in the sanitised folder that isn't
  // referenced by a raw file (either directly or via the mapping's
  // filemap). Typically an AI reply the adviser saved into the folder
  // as .txt or .docx.
  const aiReplies = [];
  if (sanHandle) {
    for await (const s of sanHandle.values()) {
      if (s.kind !== 'file') continue;
      if (s.name.startsWith('_')) continue;
      if (referencedSan.has(s.name)) continue;
      const f = await s.getFile();
      aiReplies.push({
        name: s.name,
        size: f.size,
        lastModified: f.lastModified,
      });
    }
    aiReplies.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  }
  return { files: out, aiReplies };
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
  const rehyParent = closed ? handles.closedRehy : handles.activeRehy;
  const rawHandle = await rawParent.getDirectoryHandle(caseId, { create: true });
  const sanHandle = await sanParent.getDirectoryHandle(caseId, { create: true });
  const rehyHandle = rehyParent ? await rehyParent.getDirectoryHandle(caseId, { create: true }) : null;
  return { rawHandle, sanHandle, rehyHandle };
}

/**
 * Move a case between active and closed roots. Both raw and sanitised
 * mirrors are moved. Implemented as recursive copy plus delete, because
 * the File System Access API does not offer a cross-parent move.
 */
async function moveCase(handles, caseId, toClosed) {
  const fromRaw = toClosed ? handles.activeRaw : handles.closedRaw;
  const fromSan = toClosed ? handles.activeSan : handles.closedSan;
  const fromRehy = toClosed ? handles.activeRehy : handles.closedRehy;
  const toRaw = toClosed ? handles.closedRaw : handles.activeRaw;
  const toSan = toClosed ? handles.closedSan : handles.activeSan;
  const toRehy = toClosed ? handles.closedRehy : handles.activeRehy;
  await moveDirectory(fromRaw, toRaw, caseId);
  await moveDirectory(fromSan, toSan, caseId);
  if (fromRehy && toRehy) await moveDirectory(fromRehy, toRehy, caseId);
}

async function moveDirectory(fromParent, toParent, name) {
  let src;
  try { src = await fromParent.getDirectoryHandle(name); }
  catch (_e) { return; }
  const dst = await toParent.getDirectoryHandle(name, { create: true });
  await copyTree(src, dst);
  await fromParent.removeEntry(name, { recursive: true });
}

/**
 * Rename a directory inside the same parent. Uses the native
 * DirectoryHandle.move() when the browser supports it (Chrome 111+);
 * falls back to the copy-tree-and-delete pattern otherwise.
 */
async function renameDirectory(parent, oldName, newName) {
  const src = await parent.getDirectoryHandle(oldName);
  if (typeof src.move === 'function') {
    try { await src.move(newName); return; } catch (_e) { /* fall through */ }
  }
  const dst = await parent.getDirectoryHandle(newName, { create: true });
  await copyTree(src, dst);
  await parent.removeEntry(oldName, { recursive: true });
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
    if (!existing.sanitisedFilenames || typeof existing.sanitisedFilenames !== 'object') existing.sanitisedFilenames = {};
    // Backfill standard name variations for entries created before the
    // feature landed. `variationsSeeded` guards against re-adding
    // variants the adviser has since deleted.
    let backfilled = false;
    for (const entry of (existing.entries || [])) {
      if (entry && !entry.variationsSeeded && seedNameVariations(entry)) backfilled = true;
    }
    if (backfilled) {
      try { await saveMapping(rawHandle, existing); } catch { /* non-fatal */ }
    }
    return existing;
  }
  return {
    version: 1,
    caseId,
    createdAt: new Date().toISOString(),
    entries: [],
    safeList: [],
    sanitisedFilenames: {},
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
    // Chrome blocks fetch() from a file:// page to sibling file:// URLs,
    // which is how ORT normally loads its WASM. Route ORT at a Blob URL
    // built from the base64 bytes vendored in lib/ort-wasm-simd.b64.js.
    // Blob URLs count as same-origin as the page that created them, so
    // this bypasses the restriction without needing a local server.
    const wasmUrl = ensureOrtWasmBlobUrl();
    T.env.backends.onnx.wasm.wasmPaths = { 'ort-wasm-simd.wasm': wasmUrl };
    // SharedArrayBuffer is unavailable from file://, so any threaded
    // build cannot run. Force single-threaded.
    T.env.backends.onnx.wasm.numThreads = 1;
    T.env.allowLocalModels = false;
    const pipe = await T.pipeline('token-classification', NER_MODEL_ID, {
      quantized: true,
      progress_callback: onProgress,
    });
    state.nerPipeline = pipe;
    return pipe;
  } catch (err) {
    const wrapped = new Error(
      `${err && err.message ? err.message : String(err)}. `
      + `Check DevTools console for the underlying error. `
      + `Common causes: lib/ort-wasm-simd.b64.js failed to load (check the Network tab), `
      + `the browser is offline for the first-run model download, or the huggingface.co host is blocked.`
    );
    throw wrapped;
  } finally {
    state.nerLoading = false;
  }
}

/**
 * Build (once) a Blob URL that holds the ORT SIMD WASM bytes decoded
 * from the base64 wrapper in lib/ort-wasm-simd.b64.js. The URL persists
 * for the life of the session so re-toggling NER after switching it
 * off is instant.
 */
let ortWasmBlobUrl = null;
function ensureOrtWasmBlobUrl() {
  if (ortWasmBlobUrl) return ortWasmBlobUrl;
  const b64 = window.__ORT_WASM_SIMD_B64;
  if (!b64) throw new Error('lib/ort-wasm-simd.b64.js not loaded');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/wasm' });
  ortWasmBlobUrl = URL.createObjectURL(blob);
  return ortWasmBlobUrl;
}

/**
 * Run NER on a text and return spans in the same shape the regex
 * detectors produce. Chunks text on paragraph boundaries so a long
 * document stays inside the model's 512-token context. PER labels are
 * mapped to name_possible; LOC to address_line; ORG is treated as a
 * name_possible so it flows through the review as a judgement call.
 */
async function runNerOnText(text, mapping) {
  const pipe = state.nerPipeline;
  if (!pipe) return [];
  const chunks = chunkTextForNer(text, 1500);
  const out = [];
  for (const chunk of chunks) {
    const raw = await pipe(chunk.text, { aggregation_strategy: 'simple' });
    for (const r of raw) {
      const category = mapNerLabel(r.entity_group || r.entity);
      if (!category) continue;
      if (r.start == null || r.end == null || r.end <= r.start) continue;
      const start = chunk.offset + r.start;
      const end = chunk.offset + r.end;
      if (start < 0 || end > text.length) continue;
      const spanText = text.slice(start, end);
      if (!spanText.trim()) continue;
      const known = mapping ? findByOriginal(mapping, spanText) : null;
      out.push({
        start,
        end,
        text: spanText,
        category,
        source: 'ner',
        known: known ? { token: known.token, category: known.category } : null,
        contextBefore: text.slice(Math.max(0, start - 30), start),
        contextAfter: text.slice(end, Math.min(text.length, end + 30)),
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

/**
 * Safety net that runs after applySanitisation + rewriteVerbatimBlocks.
 * Scans the finished sanitised body for any mapping original (or
 * multi-word alias) that still appears literally and swaps it for the
 * token. Regions inside <verbatim-referral> blocks are left alone (they
 * are supposed to preserve the sanitised content byte-for-byte). This
 * catches the "detection missed one occurrence" case that would
 * otherwise trip checkOutgoing and block the export outright.
 *
 * Returns { text, sweptCount } so the caller can log what was caught.
 */
function postSanitiseSweep(sanitised, mapping) {
  const entries = ((mapping && mapping.entries) || []).filter((e) => e && e.token && e.original);
  if (!entries.length) return { text: sanitised, sweptCount: 0, swept: [] };
  const needles = [];
  for (const e of entries) {
    const originalTrimmed = (e.original || '').trim();
    if (originalTrimmed.length >= 2) {
      needles.push({ needle: originalTrimmed, token: e.token, source: 'original' });
    }
    // Only multi-word aliases in the sweep - single-word aliases like
    // the auto-seeded "Chris" match too many innocent words.
    for (const a of (e.aliases || [])) {
      const t = (a || '').trim();
      if (t.length >= 2 && /\s/.test(t)) {
        needles.push({ needle: t, token: e.token, source: 'alias' });
      }
    }
  }
  needles.sort((a, b) => b.needle.length - a.needle.length);
  // Split the sanitised body into replaceable and preserved chunks by
  // isolating <verbatim-referral> ... </verbatim-referral> regions.
  const verbatimRx = /<verbatim-referral\s+id="[^"]*">[\s\S]*?<\/verbatim-referral>/g;
  const chunks = [];
  let cursor = 0;
  let m;
  while ((m = verbatimRx.exec(sanitised)) !== null) {
    chunks.push({ text: sanitised.slice(cursor, m.index), replace: true });
    chunks.push({ text: m[0], replace: false });
    cursor = m.index + m[0].length;
  }
  chunks.push({ text: sanitised.slice(cursor), replace: true });
  const swept = [];
  const out = [];
  for (const c of chunks) {
    if (!c.replace) { out.push(c.text); continue; }
    let piece = c.text;
    for (const n of needles) {
      const escaped = n.needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const looksAlphaNum = /^[A-Za-z0-9 '\-]+$/.test(n.needle);
      const bounded = looksAlphaNum ? `\\b${escaped}\\b` : escaped;
      const rx = new RegExp(bounded, 'gi');
      let matched = false;
      piece = piece.replace(rx, (hit) => {
        matched = true;
        return n.token;
      });
      if (matched) swept.push({ needle: n.needle, token: n.token, source: n.source });
    }
    out.push(piece);
  }
  return { text: out.join(''), sweptCount: swept.length, swept };
}

function checkOutgoing(sanitisedText, mapping) {
  const offenders = [];
  for (const entry of mapping.entries) {
    const originalTrimmed = (entry.original || '').trim();
    if (originalTrimmed) {
      // Keep the "possible-name" exception on the original itself: a
      // single first name assumed as a person name is a soft flag; we
      // don't want to block export on it here.
      const skipOriginal = entry.category === 'name_possible' && !/\s/.test(originalTrimmed);
      if (!skipOriginal) {
        const rx = literalRegex(originalTrimmed);
        const m = rx.exec(sanitisedText);
        if (m) {
          offenders.push({
            original: m[0],
            token: entry.token,
            source: 'original',
            needle: originalTrimmed,
            category: entry.category,
            index: m.index,
            context: contextSlice(sanitisedText, m.index, m[0].length),
          });
        }
      }
    }
    // Aliases exist to widen detection (auto-seeded "Gary", "Mr Martino",
    // "G. Martino" et al.), NOT to widen outgoing verification. A
    // multi-word alias like "Mr Martino" still counts - if it slips
    // through detection we want to hear about it - but a single-word
    // alias like "Gary" or "Martino" reliably matches ordinary words in
    // verbatim blocks and produces a false trip. Skip those.
    for (const alias of (entry.aliases || [])) {
      const trimmed = (alias || '').trim();
      if (!trimmed) continue;
      if (!/\s/.test(trimmed)) continue;
      const rx = literalRegex(trimmed);
      const m = rx.exec(sanitisedText);
      if (m) {
        offenders.push({
          original: m[0],
          token: entry.token,
          source: 'alias',
          needle: trimmed,
          category: entry.category,
          index: m.index,
          context: contextSlice(sanitisedText, m.index, m[0].length),
        });
      }
    }
  }
  return offenders;
}

/**
 * Grab up to 60 characters either side of a match with the match itself
 * bracketed in ⟪ ⟫ so a log reader can see where the alleged leak
 * landed. Newlines are collapsed so a one-line entry survives.
 */
function contextSlice(text, index, length) {
  const from = Math.max(0, index - 60);
  const to = Math.min(text.length, index + length + 60);
  const before = text.slice(from, index).replace(/\s+/g, ' ');
  const hit = text.slice(index, index + length);
  const after = text.slice(index + length, to).replace(/\s+/g, ' ');
  return `${from > 0 ? '...' : ''}${before}⟪${hit}⟫${after}${to < text.length ? '...' : ''}`;
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
  // Mapping-hit pass: scan the text for the exact originals and aliases
  // of every mapping entry. This catches identifiers that no regex
  // detector recognises (a lender name added via Tokenise selection,
  // an unusual client surname) so they always show up as "known" and
  // get auto-tokenised - otherwise checkOutgoing would refuse export.
  const mappingHits = detectMappingHits(text, mapping);
  for (const s of mappingHits) raw.push({ ...s, order: -1 });
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
  return chosen
    .filter((s) => (s.text || '').trim().length > 0 && s.end > s.start)
    .map((s) => decorateWithMapping(s, mapping, text));
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

/**
 * Scan `text` for every mapping entry's original (and its aliases) and
 * emit a span per hit. Sorted-by-length prevention against overlap is
 * handled by the main detectEntities dedupe pass. Longest first so
 * "Anna Kowalski" wins over the "Anna" alias when both would match.
 */
function detectMappingHits(text, mapping) {
  const entries = ((mapping && mapping.entries) || []).filter((e) => e && e.original && e.token);
  if (!entries.length) return [];
  const out = [];
  const seen = new Set();
  const needles = [];
  for (const entry of entries) {
    const strings = [entry.original, ...((entry.aliases || []))];
    for (const s of strings) {
      if (!s || s.length < 2) continue;
      needles.push({ needle: s, entry });
    }
  }
  needles.sort((a, b) => b.needle.length - a.needle.length);
  for (const n of needles) {
    const escaped = n.needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'gi');
    let m;
    while ((m = rx.exec(text)) !== null) {
      const key = `${m.index}|${m[0].length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        category: n.entry.category || 'custom',
      });
      if (out.length > 5000) return out;
    }
  }
  return out;
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

function buildHeader({ caseId, sourceName, tokensUsed, sanitisedDateISO, verbatimCount, specialCategoryFlags }) {
  const uniqueTokens = Array.from(new Set(tokensUsed)).sort();
  const dateLabel = formatDate(sanitisedDateISO);
  const lines = [
    HEADER_START,
    `# Case: ${caseId}`,
    `# Source: ${sourceName}`,
    `# Sanitised: ${dateLabel}`,
    `# Tool version: ${TOOL_VERSION}`,
    `# Tokens: ${uniqueTokens.join(' ') || '(none)'}`,
  ];
  if (verbatimCount) {
    lines.push(`# Verbatim blocks: ${verbatimCount} (must be reproduced without alteration between <verbatim-referral> tags)`);
  }
  if (specialCategoryFlags && specialCategoryFlags.length) {
    lines.push(`# Special category signals: ${specialCategoryFlags.join(', ')} (UK GDPR Article 9). Adviser confirmed sanitisation before export.`);
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

/**
 * Rename a case in place: raw folder, sanitised mirror, and the caseId
 * field inside _mapping.json and _closure.json. Also updates any
 * watchlist entries pointing at the old case ID so cross-case checks
 * keep working. Files inside the case (test files, sanitised outputs,
 * audit log) keep their content unchanged.
 */
async function renameCase(handles, caseObj, newId, watchlist) {
  const closed = caseObj.kind === 'closed';
  const rawParent = closed ? handles.closedRaw : handles.activeRaw;
  const sanParent = closed ? handles.closedSan : handles.activeSan;
  // Collision check.
  try {
    await rawParent.getDirectoryHandle(newId);
    throw new Error(`A case called "${newId}" already exists.`);
  } catch (err) {
    if (err && err.name !== 'NotFoundError') throw err;
  }
  await renameDirectory(rawParent, caseObj.id, newId);
  try { await renameDirectory(sanParent, caseObj.id, newId); } catch (_e) { /* mirror not present yet */ }
  const newRawHandle = await rawParent.getDirectoryHandle(newId);
  const mapping = await loadMapping(newRawHandle, newId);
  const oldId = mapping.caseId;
  mapping.caseId = newId;
  await saveMapping(newRawHandle, mapping);
  const closure = await readJSON(newRawHandle, CLOSURE_FILENAME);
  if (closure) {
    closure.caseId = newId;
    closure.events = closure.events || [];
    closure.events.push({ type: 'renamed', at: new Date().toISOString(), from: oldId, to: newId });
    await writeJSON(newRawHandle, CLOSURE_FILENAME, closure);
  }
  if (watchlist && Array.isArray(watchlist.entries)) {
    for (const entry of watchlist.entries) {
      if (entry.caseId === caseObj.id) entry.caseId = newId;
    }
  }
  await appendAudit(newRawHandle, `Case renamed from ${caseObj.id} to ${newId}`);
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
        ${renderSpecialCategoryBanner(options.specialCategoryFlags)}
        ${options.autoAppliedCount ? `<div class="muted" style="background:var(--panel-alt);border:1px solid var(--border);border-radius:4px;padding:8px 12px;margin-bottom:10px;">${options.autoAppliedCount} identifier${options.autoAppliedCount === 1 ? '' : 's'} already in this case's mapping will be tokenised automatically. They are not shown below.</div>` : ''}
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
      // Any action change clears a stale "text not found" from
      // an earlier spurious input event.
      decisions[idx].textInvalid = false;
      markInvalidText(rowEl, false);
      refreshRow(rowEl, decisions[idx]);
      updateSummary(modal, decisions);
    });

    modal.addEventListener('input', (ev) => {
      const rowEl = ev.target.closest('tr[data-idx]');
      if (!rowEl) return;
      const idx = Number(rowEl.dataset.idx);
      if (ev.target.matches('input[data-role="custom"]')) {
        const custom = normaliseCustomToken(ev.target.value.trim());
        if (custom) {
          decisions[idx].token = custom;
        } else {
          const sel = rowEl.querySelector('select[data-role="token"]');
          decisions[idx].token = sel ? sel.value : '';
        }
        updateSummary(modal, decisions);
      } else if (ev.target.matches('input[data-role="span-text"]')) {
        const ok = repositionSpan(decisions[idx], ev.target.value, documentText);
        updateContextDisplay(rowEl, decisions[idx]);
        markInvalidText(rowEl, !ok && decisions[idx].action !== 'preserve');
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
          const text = (decisions[idx].text || '').trim();
          // Empty-text rows can still be dismissed via Safe: mark them
          // preserve so they don't block save. Only push to the actual
          // safe list when there is real text to record.
          if (text && !safeListUpdates.some((u) => u.text.toLowerCase() === text.toLowerCase() && u.scope === scope)) {
            safeListUpdates.push({ text, scope });
          }
          decisions[idx].action = 'preserve';
          decisions[idx].textInvalid = false;
          refreshRow(rowEl, decisions[idx]);
          markSafeChip(rowEl, scope);
          markInvalidText(rowEl, false);
          updateSummary(modal, decisions);
          return;
        }
      }
      const action = ev.target.dataset && ev.target.dataset.action;
      if (action === 'cancel') {
        cleanup();
        resolve(null);
      } else if (action === 'save') {
        const unresolvedIdxs = [];
        const invalidIdxs = [];
        decisions.forEach((d, i) => {
          if (isUnresolved(d)) unresolvedIdxs.push(i);
          else if ((d.action === 'tokenise' || d.action === 'partial') && d.textInvalid) invalidIdxs.push(i);
        });
        if (unresolvedIdxs.length || invalidIdxs.length) {
          highlightUnresolved(tbody, decisions);
          const summary = modal.querySelector('#review-summary');
          const firstBlocker = (unresolvedIdxs[0] != null ? unresolvedIdxs[0] : invalidIdxs[0]);
          const firstRow = tbody.children[firstBlocker];
          const firstText = decisions[firstBlocker] && decisions[firstBlocker].text;
          const parts = [];
          if (unresolvedIdxs.length) parts.push(`${unresolvedIdxs.length} still need a decision`);
          if (invalidIdxs.length) parts.push(`${invalidIdxs.length} have edited text that no longer matches the document`);
          const rowLabel = firstText ? ` The first is "${firstText}" (row ${firstBlocker + 1} of ${decisions.length}).` : '';
          summary.textContent = parts.join(' and ') + '.' + rowLabel;
          summary.classList.add('warning');
          if (firstRow) {
            firstRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstRow.style.transition = 'outline-color 200ms ease';
            firstRow.style.outline = '2px solid var(--warning-border)';
            firstRow.style.outlineOffset = '-2px';
            setTimeout(() => { firstRow.style.outline = ''; firstRow.style.outlineOffset = ''; }, 1600);
          }
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
  const origStart = decision.originalStart != null ? decision.originalStart : decision.start;
  const origEnd = decision.originalEnd != null ? decision.originalEnd : decision.end;
  const found = findClosestOccurrence(documentText, trimmed, origStart, origEnd);
  if (found == null) { decision.textInvalid = true; return false; }
  decision.start = found;
  decision.end = found + trimmed.length;
  decision.text = documentText.slice(decision.start, decision.end);
  decision.contextBefore = documentText.slice(Math.max(0, decision.start - 30), decision.start);
  decision.contextAfter = documentText.slice(decision.end, Math.min(documentText.length, decision.end + 30));
  decision.textInvalid = false;
  return true;
}

/**
 * Find the occurrence of `needle` in `haystack` closest to the anchor
 * span. Tries case-sensitive first, then case-insensitive, and searches
 * the whole document rather than a narrow window so a text that
 * happens to match elsewhere is still accepted. Reduces false
 * "edited text not found" chips.
 */
function findClosestOccurrence(haystack, needle, origStart, origEnd) {
  const anchor = Math.floor(((origStart != null ? origStart : 0) + (origEnd != null ? origEnd : needle.length)) / 2);
  const scan = (hay, nee) => {
    const positions = [];
    let idx = 0;
    while (true) {
      const p = hay.indexOf(nee, idx);
      if (p === -1) break;
      positions.push(p);
      idx = p + 1;
      if (positions.length > 40) break;
    }
    return positions;
  };
  let positions = scan(haystack, needle);
  if (!positions.length) positions = scan(haystack.toLowerCase(), needle.toLowerCase());
  if (!positions.length) return null;
  let best = positions[0];
  let bestDist = Math.abs(best - anchor);
  for (let i = 1; i < positions.length; i++) {
    const d = Math.abs(positions[i] - anchor);
    if (d < bestDist) { best = positions[i]; bestDist = d; }
  }
  return best;
}

/**
 * Render the top-of-review banner listing prior appearances of any
 * detected identifier in other cases. Silent when there are none.
 * Deliberately lightweight: this is a passive trigger, not a formal
 * conflicts policy. Shelter's substantive conflict rules govern the
 * actual decision.
 */
function renderSpecialCategoryBanner(flags) {
  if (!flags || !flags.length) return '';
  const labels = flags.map((f) => (SPECIAL_CATEGORY_LABELS[f.category] || f.category)).join(', ');
  return `
    <div class="integrity-block">
      <strong>Special category signals detected: ${escapeHtml(labels)}.</strong>
      Under UK GDPR Article 9 this is a heightened-risk category. Review with extra care. On export you will be asked to confirm the sanitisation is complete for this content; the confirmation is recorded in the case audit log.
    </div>`;
}

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
      <input class="entity-original" style="width:100%;font-family:var(--mono);font-size:12px;padding:4px 6px;" data-role="span-text" type="text" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" value="${escapeHtml(decision.text)}">
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
  if (decision.action === 'preserve') markInvalidText(rowEl, false);
  // Backfill token from the freshly-rendered dropdown. When the user
  // just changed action from 'unresolved' to 'tokenise', the earlier
  // updateDecisionFromRow could not read the token select because it
  // did not exist in the DOM yet. Adopt whatever the visible dropdown
  // now shows as its default so the internal state matches the UI.
  if (decision.action === 'tokenise' && !decision.token) {
    const sel = tokenCell.querySelector('select[data-role="token"]');
    if (sel && sel.value) decision.token = sel.value;
  }
}

function isUnresolved(d) {
  if (!(d.text || '').trim()) return false;
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
      const newEntry = {
        original: intent.text,
        token: tok,
        category: intent.category,
        aliases: [],
        createdAt: now,
      };
      seedNameVariations(newEntry);
      mapping.entries.push(newEntry);
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
  selectedForBatch: new Set(),
};

document.addEventListener('DOMContentLoaded', init);

/**
 * Refuse to open when the startup self-test fails. Disables the primary
 * action button and shows a red banner naming the failure so the
 * adviser cannot start processing casework with a broken vintage.
 */
function blockOnSelfTestFailure(err) {
  const btn = document.getElementById('btn-open-root');
  if (btn) { btn.disabled = true; btn.textContent = 'Tool blocked'; }
  const welcome = document.getElementById('welcome');
  if (welcome) {
    const banner = document.createElement('div');
    banner.className = 'error';
    banner.style.marginBottom = '12px';
    banner.innerHTML = `<strong>Startup self-test failed.</strong> The tool refuses to open because sanitisation is not operating correctly. Reload after replacing js/app.js with a known-good version, or run <code>git pull</code> and hard-refresh.<br>Reason: ${escapeHtml(err && err.message ? err.message : String(err))}.`;
    welcome.prepend(banner);
  }
}

function init() {
  if (!hasFileSystemAccess()) {
    document.getElementById('browser-warning').hidden = false;
    document.getElementById('btn-open-root').disabled = true;
    return;
  }
  try {
    runSanitiserSelfTest();
  } catch (err) {
    blockOnSelfTestFailure(err);
    return;
  }
  document.getElementById('btn-open-root').addEventListener('click', onOpenRoot);
  primeReopenButton();
  document.getElementById('btn-new-case').addEventListener('click', onNewCase);
  document.getElementById('btn-paste-rehydrate').addEventListener('click', onPasteRehydrate);
  const refreshBtn = document.getElementById('btn-refresh-cases');
  if (refreshBtn) refreshBtn.addEventListener('click', onRefreshCases);
  const searchBtn = document.getElementById('btn-search');
  if (searchBtn) searchBtn.addEventListener('click', onOpenSearch);
  const helpRailBtn = document.querySelector('.icon-rail-item[title="Help"]');
  if (helpRailBtn) helpRailBtn.addEventListener('click', openAboutPanel);
  const recentBtn = document.querySelector('.icon-rail-item[title="Recent activity"]');
  if (recentBtn) recentBtn.addEventListener('click', openRecentActivityPanel);
  const watchBtn = document.querySelector('.icon-rail-item[title="Watchlist & conflicts"]');
  if (watchBtn) watchBtn.addEventListener('click', openWatchlistPanel);
  const auditRailBtn = document.querySelector('.icon-rail-item[title="Audit log"]');
  if (auditRailBtn) auditRailBtn.addEventListener('click', openGlobalAuditPanel);
  const settingsBtn = document.querySelector('.icon-rail-item[title="Settings"]');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettingsPanel);
  installFloatingTokeniseButton();
  document.querySelectorAll('#sidebar .tab').forEach((btn) => {
    btn.addEventListener('click', () => switchSidebarView(btn.dataset.view));
  });
  document.getElementById('btn-sanitise').addEventListener('click', onSanitise);
  document.getElementById('btn-copy-sanitised').addEventListener('click', onCopySanitised);
  document.getElementById('btn-resanitise').addEventListener('click', onSanitise);
  document.getElementById('btn-delete-file').addEventListener('click', onDeleteOpenFile);
  const btnTokSel = document.getElementById('btn-tokenise-selection');
  if (btnTokSel) btnTokSel.addEventListener('click', onTokeniseSelection);
  document.getElementById('ner-toggle').addEventListener('change', onNerToggleChange);
  document.querySelectorAll('#file-view .tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => switchFileTab(btn.dataset.tab));
  });
}

async function onOpenRoot() {
  try {
    const btn = document.getElementById('btn-open-root');
    let rootHandle = null;
    // If the button is in "reopen" mode from a previous session, try
    // the stored handle first. This click is a user gesture, so
    // requestPermission is allowed to prompt the OS folder-access
    // dialog if the browser has not remembered the grant.
    if (btn && btn.dataset.reopen === 'true') {
      const stored = await loadRootHandle();
      if (stored) {
        let perm = 'prompt';
        try { perm = await stored.queryPermission({ mode: 'readwrite' }); } catch (_e) {}
        if (perm !== 'granted') {
          try { perm = await stored.requestPermission({ mode: 'readwrite' }); } catch (_e) {}
        }
        if (perm === 'granted') rootHandle = stored;
      }
      // If the restore did not work, fall through to the picker below.
      btn.dataset.reopen = '';
    }
    state.handles = await pickRoot(rootHandle);
    await saveRootHandle(state.handles.root);
    state.globalSettings = await loadGlobalSettings(state.handles.root);
    state.watchlist = await loadWatchlist(state.handles.root);
    document.getElementById('root-path').textContent = state.handles.root.name || 'Casework folder ready';
    if (btn) { btn.textContent = 'Change folder'; }
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.innerHTML = renderReadyWelcome();
    const toggle = document.getElementById('ner-toggle');
    toggle.checked = !!state.globalSettings.nerEnabled;
    updateNerStatus();
    await refreshCases();
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    // NotFoundError typically means the stored folder has been moved
    // or deleted since last time. Drop the stale handle so we do not
    // keep tripping on it.
    if (err && (err.name === 'NotFoundError' || err.name === 'NotAllowedError')) {
      await clearRootHandle();
    }
    showToast(`Could not open folder: ${err.message}`, true);
  }
}

/**
 * If a directory handle from a previous session is stored, put the
 * Change folder button into "Reopen" mode so the first click restores
 * the last folder rather than opening a fresh picker.
 */
async function primeReopenButton() {
  const btn = document.getElementById('btn-open-root');
  if (!btn) return;
  const stored = await loadRootHandle();
  if (!stored) return;
  btn.textContent = `Reopen ${stored.name}`;
  btn.dataset.reopen = 'true';
  btn.title = `Restore access to ${stored.name}. Chrome will prompt once, then remember.`;
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
    const clientSuffix = c.clientLabel
      ? ` <span class="case-client" title="Client name (local only - never leaves this machine)">${escapeHtml(c.clientLabel)}</span>`
      : '';
    item.innerHTML = `
      <div class="case-id">${escapeHtml(c.id)}${clientSuffix}</div>
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
        const renamedBadge = f.hasSanitised && f.sanitisedName && f.sanitisedName !== f.name ? `<span class="file-badge" title="Sanitised copy saved as ${escapeHtml(f.sanitisedName)}">renamed</span>` : '';
        const badge = f.hasSanitised ? `${renamedBadge}<span class="file-badge done">sanitised</span>` : '<span class="file-badge">raw</span>';
        const checked = state.selectedForBatch && state.selectedForBatch.has(`${c.id}::${f.name}`) ? ' checked' : '';
        const ckAttrs = f.hasSanitised ? '' : ' disabled title="This file has not been sanitised yet."';
        fitem.innerHTML = `<label class="file-item-batch" style="display:inline-flex;align-items:center;margin-right:6px;" title="Include this file in the multi-file Copy sanitised."><input type="checkbox" data-role="batch"${ckAttrs}${checked} style="cursor:pointer;"></label><span class="file-item-name">${escapeHtml(f.name)}</span><span class="file-item-right">${badge}<button class="file-item-del" data-role="delete" title="Delete this file from the case" type="button">×</button></span>`;
        fitem.addEventListener('click', (ev) => {
          if (ev.target.dataset && ev.target.dataset.role === 'delete') {
            ev.stopPropagation();
            onDeleteFile(c, f.name);
            return;
          }
          if (ev.target.dataset && ev.target.dataset.role === 'batch') {
            ev.stopPropagation();
            toggleBatchSelection(c.id, f.name, ev.target.checked);
            renderBatchBar();
            return;
          }
          if (ev.target.tagName === 'LABEL') { ev.stopPropagation(); return; }
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
      if ((c.aiReplies || []).length) {
        const heading = document.createElement('div');
        heading.className = 'ai-replies-heading';
        heading.textContent = `AI replies in sanitised folder (${c.aiReplies.length})`;
        heading.title = 'Files saved into the sanitised folder that do not pair with a raw case file - most likely an AI reply the adviser dropped in for rehydration.';
        files.appendChild(heading);
        for (const r of c.aiReplies) {
          const ritem = document.createElement('div');
          ritem.className = 'file-item ai-reply-item';
          ritem.innerHTML = `<span class="file-item-name">${escapeHtml(r.name)}</span><span class="file-item-right"><button class="ai-reply-rehy" data-role="rehy" type="button" title="Rehydrate this AI reply back to real identifiers and copy the result to the clipboard.">Rehydrate</button></span>`;
          ritem.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (ev.target.dataset && ev.target.dataset.role === 'rehy') {
              onRehydrateSanFile(c, r.name);
            }
          });
          files.appendChild(ritem);
        }
      }
      if ((c.rehydrated || []).length) {
        const heading = document.createElement('div');
        heading.className = 'ai-replies-heading';
        heading.textContent = `Rehydrated outputs (${c.rehydrated.length})`;
        heading.title = 'Rehydrated text that was written back into the Casework_rehydrated folder. Kept as an audit trail so a reviewer can pair each rehydrated file with its tokenised source in the sanitised folder.';
        files.appendChild(heading);
        for (const r of c.rehydrated) {
          const ritem = document.createElement('div');
          ritem.className = 'file-item ai-reply-item rehydrated-item';
          ritem.innerHTML = `<span class="file-item-name">${escapeHtml(r.name)}</span><span class="file-item-right"><span class="file-badge done">rehydrated</span></span>`;
          files.appendChild(ritem);
        }
      }
      const actions = document.createElement('div');
      actions.style.padding = '8px 12px';
      actions.style.display = 'flex';
      actions.style.gap = '6px';
      actions.style.flexWrap = 'wrap';
      if (c.kind === 'open') {
        const btnPaste = document.createElement('button');
        btnPaste.textContent = 'Paste text as new file';
        btnPaste.title = 'Failsafe for content the tool cannot yet extract from PDFs or .msg files. Paste in the text, name the file, and the tool saves it as a .txt inside the case.';
        btnPaste.addEventListener('click', (ev) => { ev.stopPropagation(); onPasteTextToCase(c); });
        actions.appendChild(btnPaste);
        const btnRename = document.createElement('button');
        btnRename.textContent = 'Rename';
        btnRename.title = 'Rename the case, for example when an R-number is escalated to an A-number.';
        btnRename.addEventListener('click', (ev) => { ev.stopPropagation(); onRenameCase(c); });
        actions.appendChild(btnRename);
        const btnAudit = document.createElement('button');
        btnAudit.textContent = 'Audit log';
        btnAudit.title = 'View the case audit log inside the tool.';
        btnAudit.addEventListener('click', (ev) => { ev.stopPropagation(); onViewAuditLog(c); });
        actions.appendChild(btnAudit);
        const btnMapping = document.createElement('button');
        btnMapping.textContent = 'Mapping';
        btnMapping.title = 'View and edit this case\'s token mapping. Token renames are propagated across every sanitised file.';
        btnMapping.addEventListener('click', (ev) => { ev.stopPropagation(); onViewMapping(c); });
        actions.appendChild(btnMapping);
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
  if (/\.(png|jpg|jpeg|bmp|webp|gif)$/.test(lower)) {
    if (!window.Tesseract) {
      const buf = await file.arrayBuffer();
      const savedName = await writeRawUnique(caseObj.rawHandle, file.name, buf);
      showToast('Image OCR requires lib/tesseract.min.js in the same folder. Saved raw for now.', true);
      return savedName;
    }
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseImageOcr(buf, file.name, (label) => {
        showToast(`OCR: ${label}`);
      });
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
      showToast(`Could not OCR ${file.name} (${err.message}); saved raw. First OCR needs an internet connection to download the language model.`, true);
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
      const parsed = await parsePdf(buf, file.name, (label) => {
        showToast(`OCR: ${label}`);
      });
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
/**
 * OCR an image file using Tesseract.js. The library and its runtime
 * dependencies (worker, WASM, English language data) are fetched from
 * jsdelivr and tessdata.projectnaptha.com on first use. Both are
 * CORS-permissive so this works from a file:// origin. Subsequent OCRs
 * hit the browser's Cache and IndexedDB caches and are offline.
 *
 * Returns a `{ text, warnings }` payload in the shape formatEmlAsText
 * consumers expect.
 */
async function parseImageOcr(arrayBuffer, sourceName, updateProgress) {
  const blob = new Blob([arrayBuffer]);
  const { text: rawText, confidence } = await ocrBlob(blob, updateProgress);
  const warnings = [];
  if (!rawText.trim()) warnings.push('OCR returned no text. The image may be blank, blurry, or non-textual.');
  if (confidence != null && confidence < 60) warnings.push(`Overall OCR confidence is low (${confidence.toFixed(1)}%). Cross-check the extracted text against the source image before sanitising.`);
  const headerLines = [`# OCR extracted from image: ${sourceName}`];
  if (confidence != null) headerLines.push(`# OCR confidence: ${confidence.toFixed(1)}%`);
  headerLines.push('# Review the extracted text against the source image before sanitising.', '');
  return { text: headerLines.join('\n') + rawText, warnings, confidence };
}

/**
 * Run Tesseract over any Blob (image file or a canvas.toBlob output for
 * a rasterised PDF page). Central call so the two OCR entry points share
 * a single loader, error message and progress protocol.
 */
async function ocrBlob(blob, updateProgress) {
  if (typeof window.Tesseract !== 'function' && typeof window.Tesseract !== 'object') {
    throw new Error('Tesseract.js not loaded (check lib/tesseract.min.js).');
  }
  const url = URL.createObjectURL(blob);
  try {
    const result = await window.Tesseract.recognize(url, 'eng', {
      logger: (m) => {
        if (updateProgress && m && typeof m.status === 'string') {
          const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : null;
          updateProgress(pct != null ? `${m.status} ${pct}%` : m.status);
        }
      },
    });
    const confidence = result && result.data && typeof result.data.confidence === 'number'
      ? result.data.confidence
      : null;
    const text = result && result.data && result.data.text ? result.data.text : '';
    return { text, confidence };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function parsePdf(arrayBuffer, sourceName, updateProgress) {
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
  const ocrConfidences = [];
  let ocrPageCount = 0;
  const canOcr = typeof window.Tesseract === 'function' || typeof window.Tesseract === 'object';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    let pageText = joinPdfLines(text.items);
    let pageMarker = `--- Page ${i} ---`;
    if (!pageText.trim()) {
      if (canOcr) {
        try {
          if (updateProgress) updateProgress(`page ${i}/${doc.numPages} — rasterising`);
          const rendered = await renderPdfPageToBlob(page);
          if (updateProgress) updateProgress(`page ${i}/${doc.numPages} — running OCR`);
          const { text: ocrText, confidence } = await ocrBlob(rendered, (label) => {
            if (updateProgress) updateProgress(`page ${i}/${doc.numPages} — ${label}`);
          });
          pageText = ocrText || '';
          ocrPageCount++;
          if (typeof confidence === 'number') ocrConfidences.push(confidence);
          const confNote = typeof confidence === 'number' ? ` (OCR ${confidence.toFixed(1)}% confidence)` : '';
          pageMarker = `--- Page ${i} (OCR${confNote}) ---`;
          if (!pageText.trim()) warnings.push(`Page ${i} OCR returned no text.`);
          else if (typeof confidence === 'number' && confidence < 60) warnings.push(`Page ${i} OCR confidence is low (${confidence.toFixed(1)}%).`);
        } catch (err) {
          warnings.push(`Page ${i} OCR failed: ${err.message}. Text layer was empty.`);
        }
      } else {
        warnings.push(`Page ${i} produced no text (image or scanned page). Tesseract is not loaded so OCR fallback was skipped.`);
      }
    }
    parts.push(pageMarker, pageText, '');
  }
  if (ocrPageCount) {
    const avg = ocrConfidences.length
      ? ocrConfidences.reduce((a, b) => a + b, 0) / ocrConfidences.length
      : null;
    const avgNote = avg != null ? ` (average confidence ${avg.toFixed(1)}%)` : '';
    parts.splice(2, 0, `# OCR fallback used on ${ocrPageCount} page${ocrPageCount === 1 ? '' : 's'}${avgNote}. Review the OCR text before sanitising.`);
  }
  return { text: parts.join('\n'), warnings };
}

/**
 * Rasterise a PDF.js page to a PNG blob at 2x scale so Tesseract has
 * enough resolution to read small print. 2x is a compromise between
 * accuracy and memory - most scanned casework letters are A4 at
 * ~100dpi, so 2x lands around 200dpi which is Tesseract's sweet spot.
 */
async function renderPdfPageToBlob(page) {
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not rasterise PDF page to image.'));
    }, 'image/png');
  });
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
    const fileObj = (c.files || []).find((f) => f.name === name);
    // Mapping is authoritative: after a re-sanitise the raw filename may
    // resolve to a different safe form, but the in-memory `c.files` entry
    // still carries the previous scan's `sanitisedName`. Prefer the fresh
    // mapping and fall back to the stale file entry only if the mapping
    // doesn't remember this raw file yet.
    const filemap = (state.currentMapping.sanitisedFilenames || {});
    const sanName = filemap[name] || (fileObj && fileObj.sanitisedName) || name;
    try {
      const { text: sText, lastModified: sMtime } = await readFileText(c.sanHandle, sanName);
      sanitisedText = sText;
      state.currentSanitised = sText;
      state.currentSanitisedMtime = sMtime;
    } catch (_e) {
      // Backward compatibility: if the mapped name is missing, try the raw name.
      if (sanName !== name) {
        try {
          const { text: sText, lastModified: sMtime } = await readFileText(c.sanHandle, name);
          sanitisedText = sText;
          state.currentSanitised = sText;
          state.currentSanitisedMtime = sMtime;
        } catch (_e2) { /* not yet sanitised */ }
      }
    }
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
    ['.pdf', 'PDFs need to be extracted to text before sanitisation.'],
    ['.msg', 'Outlook .msg files are binary; the tool needs to parse them to text first.'],
    ['.eml', 'Email files need to be parsed to a text form before sanitisation.'],
    ['.png', 'Image files need OCR before sanitisation.'],
    ['.jpg', 'Image files need OCR before sanitisation.'],
    ['.jpeg', 'Image files need OCR before sanitisation.'],
    ['.bmp', 'Image files need OCR before sanitisation.'],
    ['.webp', 'Image files need OCR before sanitisation.'],
    ['.gif', 'Image files need OCR before sanitisation.'],
    ['.doc', 'Legacy .doc format is not supported. Copy the text out and paste it back in.'],
    ['.docx', '.docx files are not yet parsed. Copy the text out and paste it back in.'],
    ['.xls', 'Excel files are not supported.'],
    ['.xlsx', 'Excel files are not supported.'],
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
  const lower = name.toLowerCase();
  const isImage = /\.(png|jpg|jpeg|bmp|webp|gif)$/.test(lower);
  const extractable = lower.endsWith('.pdf') || lower.endsWith('.msg') || lower.endsWith('.eml') || isImage;
  const extractLabel = isImage ? 'Extract text with OCR' : 'Extract to text';
  const banner = extractable
    ? (isImage
        ? `${escapeHtml(reason)} Click <strong>Extract text with OCR</strong> below to run Tesseract on ${escapeHtml(name)} and save the recognised text as a .txt sibling. Wait for the download the first time (the English OCR model is fetched from the CDN once, then cached). If it fails, use "Paste text as new file" instead.`
        : `${escapeHtml(reason)} Click <strong>Extract to text</strong> below to run the tool's parser on ${escapeHtml(name)} and save the result as a .txt sibling ready to sanitise. If extraction fails, use "Paste text as new file" on the case row instead.`)
    : `This file cannot be shown or sanitised in its current form. ${escapeHtml(reason)} As a failsafe, use "Paste text as new file" on the case row: open ${escapeHtml(name)} in its native viewer, copy the text you want to send to Claude, and paste it in. The tool saves the pasted text as a .txt inside the case and sanitises it normally.`;
  const pre = document.getElementById('original-content');
  pre.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'warning';
  div.innerHTML = banner;
  pre.appendChild(div);
  if (extractable) {
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.style.marginTop = '12px';
    btn.textContent = extractLabel;
    btn.addEventListener('click', () => onExtractExistingFile(caseObj, name));
    pre.appendChild(btn);
  }
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
  pre.innerHTML = renderHighlightedOriginalHtml(text || '', state.currentMapping);
  const sanEl = document.getElementById('sanitised-content');
  sanEl.innerHTML = renderHighlightedSanitisedHtml(sanitisedText || '', state.currentMapping);
  document.getElementById('sanitised-status').textContent = sanitisedText
    ? 'This file has been sanitised. Highlighted tokens: hover to see the original identifier they replaced.'
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
  const diffTab = document.getElementById('tab-diff');
  if (diffTab) diffTab.hidden = which !== 'diff';
  if (which === 'diff') renderDiffView();
}

/**
 * Render the sanitised text with every token annotated with the
 * original identifier it replaced. Tokens are wrapped in a <mark> with
 * a title tooltip so the adviser can hover and see the mapping without
 * flipping between tabs. Any token not found in the mapping (e.g. the
 * preserved [DOB] pseudo-token) is highlighted differently so it stands
 * out as unmapped.
 */
function renderDiffView() {
  const container = document.getElementById('diff-content');
  const status = document.getElementById('diff-status');
  if (!container || !status) return;
  if (!state.currentSanitised) {
    status.textContent = 'No sanitised copy exists yet. Sanitise this file first to see a diff.';
    container.innerHTML = '';
    return;
  }
  const mapping = state.currentMapping || { entries: [] };
  const tokenIndex = new Map();
  for (const entry of (mapping.entries || [])) {
    if (entry && entry.token) tokenIndex.set(entry.token, entry.original || '');
  }
  const sanitised = state.currentSanitised;
  const tokenRegex = /\[[A-Z0-9'\/ _\-.]+?\]/g;
  const parts = [];
  let last = 0;
  let m;
  let mappedCount = 0;
  let unmappedCount = 0;
  while ((m = tokenRegex.exec(sanitised)) !== null) {
    parts.push({ type: 'text', text: sanitised.slice(last, m.index) });
    const original = tokenIndex.get(m[0]);
    if (original) { mappedCount++; parts.push({ type: 'token', token: m[0], original }); }
    else { unmappedCount++; parts.push({ type: 'unmapped', token: m[0] }); }
    last = m.index + m[0].length;
  }
  parts.push({ type: 'text', text: sanitised.slice(last) });
  container.innerHTML = parts.map((p) => {
    if (p.type === 'text') return escapeHtml(p.text);
    if (p.type === 'token') return `<mark title="was: ${escapeHtml(p.original)}" style="background:var(--warning-bg);color:var(--warning-text-strong);padding:0 3px;border-radius:2px;">${escapeHtml(p.token)}</mark>`;
    return `<mark title="Token not in this case\'s mapping. Preserved as-is; will not rehydrate here." style="background:var(--panel-sunken);color:var(--muted);border:1px dashed var(--border-strong);padding:0 3px;border-radius:2px;">${escapeHtml(p.token)}</mark>`;
  }).join('');
  const parts2 = [`${mappedCount} token${mappedCount === 1 ? '' : 's'} mapped to originals (hover to see them)`];
  if (unmappedCount) parts2.push(`${unmappedCount} unmapped token${unmappedCount === 1 ? '' : 's'} (dashed border) - these will not rehydrate`);
  status.textContent = parts2.join(', ') + '.';
}

// =====================================================================
// compliance patch: self-test, special category, About, highlighting
// =====================================================================

/**
 * Startup self-test. Sanitises a built-in fixture, verifies the raw
 * identifiers do not appear in the output, rehydrates, and confirms
 * the originals return. Any failure aborts init: the tool refuses to
 * open and shows the error, so a broken vintage can never quietly
 * process real casework.
 */
function runSanitiserSelfTest() {
  const input = 'Contact test.person@example.com or 07700 900123. NI: JT 12 34 56 A.';
  const mapping = {
    version: 1,
    entries: [
      { original: 'test.person@example.com', token: "[CL'S EMAIL]", category: 'email' },
      { original: '07700 900123', token: "[CL'S PHONE]", category: 'phone' },
      { original: 'JT 12 34 56 A', token: '[NI NUMBER]', category: 'ni_number' },
    ],
    safeList: [],
  };
  const detected = detectEntities(input, mapping, new Set());
  if (!detected.length) throw new Error('detection returned no entities');
  const decisions = detected.map((e) => (e.known
    ? { ...e, action: 'tokenise', token: e.known.token }
    : { ...e, action: 'preserve' }));
  const sanitised = applySanitisation(input, decisions);
  if (sanitised.includes('test.person@example.com')) throw new Error('email leaked into sanitised output');
  if (sanitised.includes('07700 900123')) throw new Error('phone leaked into sanitised output');
  if (sanitised.includes('JT 12 34 56 A')) throw new Error('NI number leaked into sanitised output');
  const { replaced } = rehydrate(sanitised, mapping);
  if (!replaced.includes('test.person@example.com')) throw new Error('rehydration failed to restore email');
  if (!replaced.includes('07700 900123')) throw new Error('rehydration failed to restore phone');
  if (!replaced.includes('JT 12 34 56 A')) throw new Error('rehydration failed to restore NI');
  return true;
}

/**
 * Detect signals that the material contains UK GDPR Article 9 special
 * category data: health, ethnicity, sexuality, religion, trade union
 * membership, criminal offence data. This is deliberately noisy - the
 * point is friction, not a block. The consequence of a sanitisation
 * failure on this category of data is materially more serious, so the
 * adviser is asked to confirm at export.
 */
const SPECIAL_CATEGORY_PATTERNS = {
  health: /\b(mental\s+health|depression|anxiety|PTSD|self[-\s]?harm|suicid(?:e|al|ality)|disab(?:led|ility)|impairment|cancer|diabet(?:es|ic)|HIV|AIDS|epilep(?:sy|tic)|dementia|autis(?:m|tic)|ADHD|OCD|schizophreni(?:a|c)|bipolar|psychosis|medication|prescrib(?:ed|ing)|therap(?:y|ist)|GP|(?:mental\s+)?health\s+practitioner|hospital|chronic|illness|(?:hospital\s+)?admission|drug\s+use|substance\s+misuse|addiction)\b/gi,
  ethnicity: /\b(ethnicity|black\s+british|african|caribbean|mixed\s+(?:heritage|race)|south\s+asian|roma|traveller|gypsy|somali|kurdish|refugee\s+status|asylum\s+seeker|indefinite\s+leave|BRP|nationality)\b/gi,
  sexuality: /\b(gay|lesbian|bisexual|trans(?:gender|sexual)?|non[-\s]?binary|LGBT(?:Q\+?)?|homosexual|same[-\s]sex|sexual\s+orientation|coming\s+out|homophobi(?:a|c))\b/gi,
  religion: /\b(muslim|islamic|jewish|hindu|sikh|buddhist|christian|catholic|protestant|orthodox|atheist|agnostic|religion|religious\s+belief|mosque|synagogue|church|temple|gurdwara|faith|ramadan|shabbat)\b/gi,
  trade_union: /\b(trade\s+union|unions?\s+member(?:ship)?|shop\s+steward|union\s+rep(?:resentative)?)\b/gi,
  criminal_offence: /\b(convict(?:ed|ion|ions)|arrest(?:ed)?|prison|imprisoned|custody|probation|police\s+caution|criminal\s+record|criminal\s+offence|prosecution|charged\s+with|remand(?:ed)?|magistrat|crown\s+court|sentence(?:d)?|CRB|DBS|Rehabilitation\s+of\s+Offenders)\b/gi,
};

function detectSpecialCategorySignals(text) {
  const flags = [];
  for (const [name, rx] of Object.entries(SPECIAL_CATEGORY_PATTERNS)) {
    const hits = text.match(rx);
    if (hits && hits.length) {
      const sample = Array.from(new Set(hits.map((h) => h.toLowerCase()))).slice(0, 5);
      flags.push({ category: name, hits: hits.length, sample });
    }
  }
  return flags;
}

const SPECIAL_CATEGORY_LABELS = {
  health: 'health',
  ethnicity: 'ethnicity',
  sexuality: 'sexuality',
  religion: 'religion',
  trade_union: 'trade union membership',
  criminal_offence: 'criminal offence',
};

function summariseSpecialCategoryFlags(flags) {
  return flags.map((f) => SPECIAL_CATEGORY_LABELS[f.category] || f.category);
}

/**
 * Confirmation prompt shown before writing the sanitised file when
 * special category signals were detected. Not a block - Article 9 data
 * is often essential to the casework - but a friction point that
 * ensures the adviser has actively considered whether the sanitisation
 * done above is adequate for this specific content.
 */
function confirmSpecialCategoryExport(flags) {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root');
    root.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.width = '640px';
    backdrop.appendChild(modal);
    const labels = summariseSpecialCategoryFlags(flags);
    const samples = flags.map((f) => `<li><strong>${escapeHtml(SPECIAL_CATEGORY_LABELS[f.category] || f.category)}</strong> - ${f.hits} match${f.hits === 1 ? '' : 'es'}: ${escapeHtml(f.sample.join(', '))}</li>`).join('');
    modal.innerHTML = `
      <div class="modal-header">Special category data present</div>
      <div class="modal-body">
        <p>This material contains signals of <strong>${escapeHtml(labels.join(', '))}</strong>. Under UK GDPR Article 9 this is special category data. The consequence of a sanitisation failure on this content is materially more serious than a failure on ordinary casework.</p>
        <p><strong>Confirm sanitisation is complete and no identifying details remain attached to this content.</strong></p>
        <ul style="font-size:12px;">${samples}</ul>
        <p class="muted">This confirmation is recorded in the case audit log.</p>
      </div>
      <div class="modal-footer">
        <button data-action="cancel">Cancel export</button>
        <button class="primary" data-action="confirm">Sanitisation complete, export</button>
      </div>
    `;
    root.appendChild(backdrop);
    modal.addEventListener('click', (ev) => {
      const a = ev.target.dataset && ev.target.dataset.action;
      if (a === 'cancel' || a === 'confirm') {
        backdrop.remove();
        resolve(a === 'confirm');
      }
    });
  });
}

/**
 * About panel. Documents the tool as required by the compliance patch:
 * what it does, its guarantee, residual risks, what it does not do,
 * compliance boundary. Content is exportable as a plain-text document
 * so it can be shared with Information Governance without needing
 * a screenshot of the tool.
 */
function openAboutPanel() {
  const root = document.getElementById('dialog-root');
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.width = '720px';
  backdrop.appendChild(modal);
  const body = aboutTextBody();
  modal.innerHTML = `
    <div class="modal-header">About this tool</div>
    <div class="modal-body">
      ${body}
    </div>
    <div class="modal-footer">
      <button data-action="export">Export as plain text</button>
      <button class="primary" data-action="ok">Close</button>
    </div>
  `;
  root.appendChild(backdrop);
  modal.addEventListener('click', (ev) => {
    const a = ev.target.dataset && ev.target.dataset.action;
    if (a === 'ok') backdrop.remove();
    if (a === 'export') exportAboutText();
  });
}

function aboutTextBody() {
  return `
    <p><strong>Casework Sanitisation Tool</strong> · version ${TOOL_VERSION}</p>
    <h3 style="font-size:14px;margin-top:16px;">What this tool does</h3>
    <p>Pseudonymises housing casework material before it leaves this machine. It sits between the case file and an external AI service, replacing real identifiers with role-based tokens (for example, "Ms Anna Kowalski" becomes "[CL_1]"). The adviser reviews every replacement. Sanitised output is copied to the clipboard for pasting into the AI service. The AI's response is pasted back and the tokens are converted back to real identifiers before it reaches a client-facing system.</p>
    <h3 style="font-size:14px;margin-top:16px;">The pseudonymisation guarantee</h3>
    <p>Identifying data does not reach the external AI service. The tool refuses to export a sanitised file if any real identifier from the case's mapping is still present in the output. On rehydration, a reverse check scans the pasted AI reply for real identifiers that may have leaked; matches are surfaced to the adviser before rehydration completes. A startup self-test runs sanitise-then-rehydrate on a built-in fixture at every launch; a failure blocks the tool from opening.</p>
    <h3 style="font-size:14px;margin-top:16px;">Residual risks</h3>
    <ul>
      <li>Adviser error in the review step. The tool detects candidates; the adviser decides. A wrong decision at review propagates into the sanitised output.</li>
      <li>Named-entity recognition model limitations. The optional NER layer improves detection of names the regex layer misses but is known to be weaker on non-Western names.</li>
      <li>Dependency on the mapping being correct. If the mapping is edited to remove an entry, existing sanitised text keeps the token but rehydration cannot restore the original.</li>
      <li>Special category data. The tool flags it and asks for confirmation but does not treat it differently at the technical level.</li>
    </ul>
    <h3 style="font-size:14px;margin-top:16px;">What this tool does not do</h3>
    <ul>
      <li>It is not a legal opinion.</li>
      <li>It is not an authorisation for AI-assisted casework. Whether the adviser's use of AI has been sanctioned by Shelter is a separate question.</li>
      <li>It is not a substitute for professional judgement about what may or may not be shared with an external system.</li>
    </ul>
    <h3 style="font-size:14px;margin-top:16px;">Compliance boundary</h3>
    <p>The tool addresses the technical question of preventing identifying data reaching an external AI service. It does not, and cannot, address:</p>
    <ul>
      <li>Whether Shelter has sanctioned the use of external AI tools for casework support.</li>
      <li>Whether the AI Governance Group has assessed the specific AI service in use.</li>
      <li>Whether the client privacy notice needs to reference AI-assisted casework processing.</li>
      <li>Whether the adviser's use of the tool has been disclosed to line management.</li>
    </ul>
    <p>These questions sit outside the tool's scope. The adviser is responsible for handling them through the appropriate organisational channels.</p>
    <h3 style="font-size:14px;margin-top:16px;">Data on this machine</h3>
    <p>All persistent state is on the local filesystem. Nothing is transmitted anywhere by the tool itself. The only outbound flow is the adviser's deliberate act of copying sanitised text to an external AI service.</p>
    <p class="muted" style="font-size:11px;margin-top:20px;">Version ${TOOL_VERSION}. Last updated automatically on every code change.</p>
  `;
}

function exportAboutText() {
  const text = aboutPlainText();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `casework-sanitiser-about-v${TOOL_VERSION}.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

function renderReadyWelcome() {
  return `
    <div class="welcome-eyebrow">Ready</div>
    <h1 style="font-size:18px;margin-top:0;">Casework folder ready.</h1>
    <p class="welcome-lead">Pick a case from the sidebar to open a file, or add a new one with <strong>New case</strong>. Files added to the folder externally (SharePoint sync) will appear after clicking <strong>Refresh</strong>.</p>
  `;
}

function openRecentActivityPanel() {
  aggregateAuditModal('Recent activity across all cases', 200);
}

function openGlobalAuditPanel() {
  aggregateAuditModal('Audit log across all cases', 500);
}

async function aggregateAuditModal(title, maxRows) {
  if (!state.handles) { showToast('Open a casework folder first.', true); return; }
  const root = document.getElementById('dialog-root');
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.width = '820px';
  backdrop.appendChild(modal);
  modal.innerHTML = `<div class="modal-header">${escapeHtml(title)}</div><div class="modal-body"><div class="muted">Reading audit logs...</div></div><div class="modal-footer"><button class="primary" data-action="ok">Close</button></div>`;
  root.appendChild(backdrop);
  modal.addEventListener('click', (ev) => { if (ev.target.dataset && ev.target.dataset.action === 'ok') backdrop.remove(); });
  const rows = [];
  const cases = [
    ...(await listCases(state.handles, 'open')),
    ...(await listCases(state.handles, 'closed')),
  ];
  for (const c of cases) {
    try {
      const { text } = await readFileText(c.rawHandle, '_audit.log');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const idx = line.indexOf('\t');
        rows.push({ stamp: idx > 0 ? line.slice(0, idx) : '', text: idx > 0 ? line.slice(idx + 1) : line, caseId: c.id });
      }
    } catch (_e) { /* no audit yet */ }
  }
  rows.sort((a, b) => (a.stamp > b.stamp ? -1 : 1));
  const shown = rows.slice(0, maxRows);
  const body = modal.querySelector('.modal-body');
  if (!shown.length) {
    body.innerHTML = '<div class="muted">No audit entries yet across any case.</div>';
    return;
  }
  body.innerHTML = `
    <p class="muted">Newest first. Showing ${shown.length} of ${rows.length}.</p>
    <table style="width:100%;border-collapse:collapse;">
      ${shown.map((r) => `<tr><td style="white-space:nowrap;font-family:var(--mono);font-size:11px;color:var(--muted);padding:4px 8px;">${escapeHtml(r.stamp)}</td><td style="padding:4px 8px;font-weight:600;">${escapeHtml(r.caseId)}</td><td style="padding:4px 8px;">${escapeHtml(r.text)}</td></tr>`).join('')}
    </table>`;
}

async function openWatchlistPanel() {
  if (!state.handles) { showToast('Open a casework folder first.', true); return; }
  const root = document.getElementById('dialog-root');
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.width = '820px';
  backdrop.appendChild(modal);
  const entries = (state.watchlist && state.watchlist.entries) || [];
  const rows = entries.length
    ? [...entries].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')).map((e) => `
      <tr>
        <td style="padding:4px 8px;font-family:var(--mono);font-size:12px;">${escapeHtml(e.original)}</td>
        <td style="padding:4px 8px;"><span class="chip">${escapeHtml(e.category || '')}</span></td>
        <td style="padding:4px 8px;"><span class="chip">${escapeHtml(e.matchStrength || 'soft')}</span></td>
        <td style="padding:4px 8px;font-weight:600;">${escapeHtml(e.caseId)}</td>
        <td style="padding:4px 8px;font-family:var(--mono);font-size:11px;color:var(--muted);">${escapeHtml((e.addedAt || '').slice(0, 10))}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="muted" style="padding:12px;">No watchlist entries yet. Each successful sanitisation appends the case\'s mapping originals here so cross-case matches surface on the next sanitisation.</td></tr>';
  modal.innerHTML = `
    <div class="modal-header">Cross-case watchlist (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})</div>
    <div class="modal-body">
      <p class="muted">Every real identifier ever tokenised in any case, open or closed. On the next sanitisation of a different case, matches here surface at the top of the review dialog. Match strength is graded lightly (hard for addresses, phones, refs; medium for name-only; soft otherwise) and stored on each entry.</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="padding:6px 8px;text-align:left;">Original</th><th style="padding:6px 8px;text-align:left;">Category</th><th style="padding:6px 8px;text-align:left;">Strength</th><th style="padding:6px 8px;text-align:left;">Case</th><th style="padding:6px 8px;text-align:left;">Added</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="primary" data-action="ok">Close</button>
    </div>
  `;
  root.appendChild(backdrop);
  modal.addEventListener('click', (ev) => { if (ev.target.dataset && ev.target.dataset.action === 'ok') backdrop.remove(); });
}

function openSettingsPanel() {
  const root = document.getElementById('dialog-root');
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.width = '760px';
  backdrop.appendChild(modal);
  const g = state.globalSettings || { safeList: [], nerEnabled: false };
  const nerLabel = g.nerEnabled ? 'on' : 'off';
  modal.innerHTML = `
    <div class="modal-header">Settings and help</div>
    <div class="modal-body">
      <h3 style="font-size:14px;margin-top:0;">Options</h3>
      <ul>
        <li><strong>Enhanced detection (NER):</strong> ${nerLabel}. Toggle from the switch in the topbar. First activation downloads a ~50 MB model from huggingface.co.</li>
        <li><strong>Global safe list:</strong> ${(g.safeList || []).length} entr${(g.safeList || []).length === 1 ? 'y' : 'ies'}. Strings on this list are skipped by detection in every case. Manage per-item via the "Safe everywhere" button in the review dialog.</li>
        <li><strong>Casework folder:</strong> remembered across sessions in IndexedDB. Reload the page and the topbar button reads "Reopen [folder]".</li>
      </ul>
      <h3 style="font-size:14px;margin-top:20px;">Help guide</h3>
      <h4 style="font-size:13px;margin-bottom:4px;">Daily workflow</h4>
      <ol>
        <li>Open the casework folder from the topbar.</li>
        <li>Pick a case, drop or open a file.</li>
        <li>Click <strong>Sanitise this file</strong>. The review dialog shows any items needing a decision.</li>
        <li>Click <strong>Copy sanitised</strong> and paste to your AI service.</li>
        <li>Copy the AI reply, click <strong>Paste rehydrate</strong>, paste result into Outlook or the CRM.</li>
      </ol>
      <h4 style="font-size:13px;margin-bottom:4px;">Adding a token by hand</h4>
      <p>Highlight the text in the Original tab and click <strong>Tokenise selection</strong> in the file header (or the floating button that appears near the highlight). Custom tokens can be typed without brackets - "LENDER" becomes "[LENDER]" automatically.</p>
      <h4 style="font-size:13px;margin-bottom:4px;">Verbatim block for CRM referral notes</h4>
      <p>Wrap the section you need reproduced word-for-word in <code>&lt;verbatim&gt;...&lt;/verbatim&gt;</code> in the raw source. On sanitise it becomes <code>&lt;verbatim-referral id="v_..."&gt;...&lt;/verbatim-referral&gt;</code>; on rehydrate it is byte-matched against the recorded original. Any change from the AI is flagged.</p>
      <h4 style="font-size:13px;margin-bottom:4px;">Rename a case (R-number to A-number)</h4>
      <p>Every open case has a <strong>Rename</strong> button. Renaming updates both the raw and sanitised folders, the case ID in the mapping and closure log, and any watchlist entries pointing at the old ID.</p>
      <h4 style="font-size:13px;margin-bottom:4px;">Files added by SharePoint or Explorer</h4>
      <p>The tool cannot watch the filesystem. Click <strong>Refresh</strong> in the sidebar to re-scan. New case folders and new files added externally show up straight away.</p>
      <h4 style="font-size:13px;margin-bottom:4px;">Extracting binary files</h4>
      <p>PDFs, .msg, .eml, and images (OCR) can be extracted in-place: open the file and click <strong>Extract to text</strong>. The result is saved as a .txt sibling ready to sanitise.</p>
      <h4 style="font-size:13px;margin-bottom:4px;">Mapping edits</h4>
      <p>Every case has a <strong>Mapping</strong> button showing an editable table. Renaming a token propagates the rename across every already-sanitised file in the case.</p>
      <p style="margin-top:20px;"><a href="#" data-action="about">Open About panel</a> for the pseudonymisation guarantee, residual risks, and the compliance boundary statement.</p>
    </div>
    <div class="modal-footer">
      <button class="primary" data-action="ok">Close</button>
    </div>
  `;
  root.appendChild(backdrop);
  modal.addEventListener('click', (ev) => {
    const a = ev.target.dataset && ev.target.dataset.action;
    if (a === 'ok') backdrop.remove();
    if (a === 'about') { backdrop.remove(); openAboutPanel(); }
  });
}

/**
 * A small floating "Tokenise selection" button that follows the current
 * highlight when the adviser marks text inside the file view. Uses
 * mouseup so the caret rectangle has been finalised. The selection
 * text is captured at button-creation time so opening the modal does
 * not lose it to a focus change.
 */
let floatingTokBtn = null;
let floatingTokText = '';
function installFloatingTokeniseButton() {
  document.addEventListener('mouseup', () => {
    setTimeout(handleSelectionForFloating, 0);
  });
  // selectionchange fires whenever the caret or selection changes for
  // any reason (mouse, keyboard, script). Without this the button hangs
  // around after the highlight is cleared by anything other than a
  // fresh mouseup.
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!text || text.length < 2) hideFloatingTokBtn();
  });
  document.addEventListener('keyup', (ev) => {
    if (ev.key === 'Escape') hideFloatingTokBtn();
  });
  // Any mousedown outside the floating button dismisses it. We used to
  // only hide when the selection cleared, but that left it hanging over
  // the file when the adviser started a new selection or clicked a UI
  // control that doesn't disturb the selection. If they still want it,
  // it re-appears on the next mouseup.
  document.addEventListener('mousedown', (ev) => {
    if (!floatingTokBtn || floatingTokBtn.hidden) return;
    if (ev.target === floatingTokBtn) return;
    hideFloatingTokBtn();
  }, true);
  window.addEventListener('scroll', hideFloatingTokBtn, true);
}

function handleSelectionForFloating() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return hideFloatingTokBtn();
  const text = sel.toString().trim();
  if (!text || text.length < 2) return hideFloatingTokBtn();
  const range = sel.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const el = container.nodeType === 1 ? container : container.parentElement;
  if (!el || !el.closest('#file-view')) return hideFloatingTokBtn();
  const rect = range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return hideFloatingTokBtn();
  floatingTokText = text;
  showFloatingTokBtn(rect);
}

function showFloatingTokBtn(rect) {
  if (!floatingTokBtn) {
    floatingTokBtn = document.createElement('button');
    floatingTokBtn.className = 'primary';
    floatingTokBtn.textContent = 'Tokenise selection';
    floatingTokBtn.style.cssText = 'position:fixed;z-index:250;box-shadow:var(--shadow-toast);font-size:11px;padding:3px 10px;height:26px;';
    floatingTokBtn.addEventListener('mousedown', (e) => { e.preventDefault(); });
    floatingTokBtn.addEventListener('click', () => {
      const captured = floatingTokText;
      hideFloatingTokBtn();
      onTokeniseSelection(captured);
    });
    document.body.appendChild(floatingTokBtn);
  }
  const left = Math.min(window.innerWidth - 160, Math.max(4, rect.right + 6));
  const top = Math.max(4, rect.top - 4);
  floatingTokBtn.style.left = `${left}px`;
  floatingTokBtn.style.top = `${top}px`;
  floatingTokBtn.hidden = false;
}

function hideFloatingTokBtn() {
  if (floatingTokBtn) floatingTokBtn.hidden = true;
  floatingTokText = '';
}

function aboutPlainText() {
  return [
    `Casework Sanitisation Tool - version ${TOOL_VERSION}`,
    '',
    'WHAT THIS TOOL DOES',
    'Pseudonymises housing casework material before it leaves this machine. It sits between the case file and an external AI service, replacing real identifiers with role-based tokens. The adviser reviews every replacement. Sanitised output is copied to the clipboard for pasting into the AI service. The AI reply is pasted back and tokens are converted back to real identifiers before reaching a client-facing system.',
    '',
    'THE PSEUDONYMISATION GUARANTEE',
    'Identifying data does not reach the external AI service. The tool refuses to export a sanitised file if any real identifier from the case mapping is still present in the output. On rehydration, a reverse check scans the pasted AI reply for real identifiers that may have leaked; matches are surfaced to the adviser before rehydration completes. A startup self-test runs sanitise-then-rehydrate on a built-in fixture at every launch; a failure blocks the tool from opening.',
    '',
    'RESIDUAL RISKS',
    '- Adviser error in the review step. The tool detects candidates; the adviser decides.',
    '- NER model limitations - weaker on non-Western names.',
    '- Dependency on the mapping being correct.',
    '- Special category data is flagged with confirmation but not technically treated differently.',
    '',
    'WHAT THIS TOOL DOES NOT DO',
    '- It is not a legal opinion.',
    '- It is not an authorisation for AI-assisted casework.',
    '- It is not a substitute for professional judgement.',
    '',
    'COMPLIANCE BOUNDARY',
    'The tool addresses the technical question of preventing identifying data reaching an external AI service. It does not, and cannot, address:',
    '- Whether Shelter has sanctioned the use of external AI tools for casework support.',
    '- Whether the AI Governance Group has assessed the specific AI service in use.',
    '- Whether the client privacy notice needs to reference AI-assisted casework processing.',
    '- Whether the adviser\'s use of the tool has been disclosed to line management.',
    '',
    'DATA ON THIS MACHINE',
    'All persistent state is on the local filesystem. Nothing is transmitted anywhere by the tool itself. The only outbound flow is the adviser\'s deliberate act of copying sanitised text to an external AI service.',
    '',
    `Version ${TOOL_VERSION}.`,
  ].join('\n');
}

/**
 * Wrap every occurrence of a mapping entry's original text (and its
 * aliases) in a highlighted <mark> so the adviser can see at a glance
 * which parts of the raw text are already tokenised in the mapping.
 * Longest strings match first so shorter aliases never chew into
 * longer names.
 */
/**
 * Substitute mapping entries into a filename so real names do not leak
 * into the sanitised file's "# Source:" header line. Only entries with
 * both an original and a token are considered. Case-insensitive.
 * Longest originals first so short aliases do not partially match.
 */
/**
 * Wrap a bare role name with square brackets so the adviser can type
 * "LENDER" and get "[LENDER]" without being blocked. Existing brackets
 * (partial or full) are respected. Whitespace-only input returns
 * unchanged so callers can distinguish empty from unresolved.
 */
function normaliseCustomToken(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  let out = trimmed;
  if (out.startsWith('[') && !out.endsWith(']')) out = out + ']';
  else if (!out.startsWith('[') && out.endsWith(']')) out = '[' + out;
  else if (!out.startsWith('[') && !out.endsWith(']')) out = '[' + out + ']';
  return out;
}

/**
 * Split a name into first / middle(s) / last, stripping any leading
 * title. Returns null for a single-word name (no useful variants) or an
 * empty string. Trailing suffixes like "Jr" / "III" are treated as part
 * of the last-name segment so the surname still matches literally.
 */
function splitNameParts(name) {
  const raw = String(name || '').trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  const words = raw.split(' ');
  // Peel off a leading title so the variant generator doesn't stack them.
  const titleRx = new RegExp('^(' + PERSON_NAME_TITLES.join('|') + ')\\.?$', 'i');
  if (words.length > 1 && titleRx.test(words[0])) words.shift();
  if (words.length < 2) return null;
  const first = words[0];
  const last = words[words.length - 1];
  const middles = words.slice(1, -1);
  return { first, middles, last, full: words.join(' ') };
}

/**
 * Generate standard name variations for a person's name so shorthand
 * references get sanitised alongside the full form. E.g. from
 * "Gary Michael Martino" we seed:
 *   Gary, Gary Martino, Gary Michael Martino,
 *   Mr Gary Michael Martino, Mr Gary Martino, Mr Martino,
 *   Mr G Martino, Mr G. Martino, Mr GM Martino, Mr G M Martino,
 *   Mr G.M. Martino, Mr G. M. Martino, ... (across all common titles)
 *
 * The bare last name alone ("Martino") is deliberately NOT included:
 * it's too prone to matching unrelated words. The adviser can add it
 * manually via the mapping editor if the case warrants it.
 */
function generateNameVariations(name) {
  const parts = splitNameParts(name);
  if (!parts) return [];
  const { first, middles, last, full } = parts;
  const firstInitial = first[0];
  const middleInitials = middles.map((m) => m[0]).filter(Boolean);
  const out = new Set();

  out.add(first);
  out.add(`${first} ${last}`);
  out.add(full);

  const bases = [full, `${first} ${last}`, last];
  const initialForms = [
    `${firstInitial} ${last}`,
    `${firstInitial}. ${last}`,
  ];
  if (middleInitials.length) {
    const spacedInitials = [firstInitial, ...middleInitials].join(' ');
    const joinedInitials = [firstInitial, ...middleInitials].join('');
    const dottedSpaced = [firstInitial, ...middleInitials].map((i) => i + '.').join(' ');
    const dottedJoined = [firstInitial, ...middleInitials].map((i) => i + '.').join('');
    initialForms.push(
      `${spacedInitials} ${last}`,
      `${joinedInitials} ${last}`,
      `${dottedSpaced} ${last}`,
      `${dottedJoined} ${last}`,
    );
  }

  for (const title of PERSON_NAME_TITLES) {
    for (const base of bases) out.add(`${title} ${base}`);
    for (const form of initialForms) out.add(`${title} ${form}`);
  }

  const originalLc = full.toLowerCase();
  return Array.from(out).filter((v) => v.toLowerCase() !== originalLc);
}

/**
 * Merge freshly generated variations into an entry's alias list without
 * duplicating anything the user (or a prior run) already added.
 * Returns true if aliases were added.
 */
function seedNameVariations(entry) {
  if (!entry || !entry.token || !entry.original) return false;
  // Numbered person-role tokens ([CL_1], [LANDLORD_2]) collapse to their
  // base role for the person-check.
  const baseTok = entry.token.replace(/_\d+\]$/, ']');
  if (!PERSON_NAME_ROLES.has(baseTok)) return false;
  const variants = generateNameVariations(entry.original);
  if (!variants.length) return false;
  if (!entry.aliases) entry.aliases = [];
  const have = new Set([entry.original.toLowerCase(), ...entry.aliases.map((a) => a.toLowerCase())]);
  let added = 0;
  for (const v of variants) {
    if (have.has(v.toLowerCase())) continue;
    have.add(v.toLowerCase());
    entry.aliases.push(v);
    added++;
  }
  // Mark so backfill on later loads doesn't re-add variants the adviser
  // has since deleted from the mapping editor.
  entry.variationsSeeded = true;
  return added > 0;
}

/**
 * Generate common separator variants of a multi-word identifier so the
 * filename check catches forms like "DaleMuntzArrearsLetter" where the
 * client's name has been jammed together with no separator. For a
 * single word the only variant is the word itself.
 */
function filenameNeedleVariants(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [trimmed];
  return [
    trimmed,
    parts.join(''),
    parts.join('_'),
    parts.join('-'),
    parts.join('.'),
  ];
}

function sanitiseFilenameForHeader(filename, mapping) {
  if (!filename) return filename;
  let out = String(filename);
  const needles = [];
  const entries = ((mapping && mapping.entries) || []).filter((e) => e && e.original && e.token);
  for (const e of entries) {
    const strings = [e.original, ...((e.aliases || []))];
    for (const s of strings) {
      if (!s || s.length < 2) continue;
      for (const v of filenameNeedleVariants(s)) {
        if (v && v.length >= 2) needles.push({ needle: v, token: e.token });
      }
    }
  }
  // Try longer variants first so "DaleMuntz" beats an alias "Dale" and
  // "Dale Muntz" beats an alias "Muntz".
  needles.sort((a, b) => b.needle.length - a.needle.length);
  const seen = new Set();
  for (const n of needles) {
    const key = n.needle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const escaped = n.needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'gi');
    out = out.replace(rx, n.token);
  }
  return out;
}

function renderHighlightedOriginalHtml(text, mapping) {
  const entries = (mapping && mapping.entries) || [];
  const needles = [];
  for (const e of entries) {
    if (e.original) needles.push({ needle: e.original, token: e.token, kind: 'original' });
    for (const a of (e.aliases || [])) {
      if (a) needles.push({ needle: a, token: e.token, kind: 'alias' });
    }
  }
  needles.sort((a, b) => b.needle.length - a.needle.length);
  return highlightWithNeedles(text, needles);
}

function highlightWithNeedles(text, needles) {
  if (!text) return '';
  if (!needles.length) return escapeHtml(text);
  const matches = [];
  for (const n of needles) {
    if (!n.needle) continue;
    const escaped = n.needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'gi');
    let m;
    while ((m = rx.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, match: m[0], token: n.token, kind: n.kind });
      if (matches.length > 5000) break;
    }
    if (matches.length > 5000) break;
  }
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const chosen = [];
  let cursor = -1;
  for (const m of matches) {
    if (m.start < cursor) continue;
    chosen.push(m);
    cursor = m.end;
  }
  let out = '';
  let last = 0;
  for (const c of chosen) {
    out += escapeHtml(text.slice(last, c.start));
    const title = `will become: ${c.token}${c.kind === 'alias' ? ' (alias)' : ''}`;
    out += `<mark title="${escapeHtml(title)}" style="background:var(--warning-bg);color:var(--warning-text-strong);padding:0 3px;border-radius:2px;">${escapeHtml(c.match)}</mark>`;
    last = c.end;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

/**
 * Wrap every [TOKEN] occurrence in the sanitised text with a highlighted
 * <mark>. Hovering shows the original identifier from the mapping.
 * Unmapped tokens (dashed border) stand out so it is obvious which
 * would not rehydrate.
 */
function renderHighlightedSanitisedHtml(text, mapping) {
  if (!text) return '';
  const tokenIndex = new Map();
  for (const e of (mapping && mapping.entries) || []) {
    if (e.token) tokenIndex.set(e.token, e.original || '');
  }
  const rx = /\[[A-Z0-9'\/ _\-.]+?\]/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = rx.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index));
    const original = tokenIndex.get(m[0]);
    if (original) {
      out += `<mark title="${escapeHtml('was: ' + original)}" style="background:var(--warning-bg);color:var(--warning-text-strong);padding:0 3px;border-radius:2px;">${escapeHtml(m[0])}</mark>`;
    } else {
      out += `<mark title="Token not in this case\'s mapping" style="background:var(--panel-sunken);color:var(--muted);border:1px dashed var(--border-strong);padding:0 3px;border-radius:2px;">${escapeHtml(m[0])}</mark>`;
    }
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out;
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
      const nerSpans = (await runNerOnText(state.currentText, mapping))
        .filter((s) => !safeSet.has((s.text || '').toLowerCase().trim()));
      mergedEntities = mergeNerSpans(rawEntities, nerSpans);
      updateNerStatus('ready');
    } catch (err) {
      updateNerStatus('ready');
      showToast(`NER run failed, continuing with regex only: ${err.message}`, true);
    }
  }
  const entities = crossCheckWatchlist(mergedEntities, state.watchlist, c.id);
  // Entities already recorded in the case mapping are auto-tokenised
  // without appearing in the review dialog. The adviser has already
  // approved these; showing them again is noise.
  const knownEntities = entities.filter((e) => e.known && e.known.token);
  const unknownEntitiesAll = entities.filter((e) => !e.known || !e.known.token);
  // URLs are auto-tokenised without review. The domain, path, or query
  // string can carry identifying material (a lender's brand in a
  // hostname, a client's name in a share link) which the review layer
  // would otherwise ask the adviser about one URL at a time. Numbered
  // [URL_N] tokens keep the mapping consistent and let rehydration
  // recover the original URL.
  const urlAutoDecisions = [];
  const nonUrlUnknowns = [];
  {
    let urlCounter = 0;
    for (const entry of mapping.entries) {
      const m = /^\[URL_(\d+)\]$/.exec(entry.token || '');
      if (m) urlCounter = Math.max(urlCounter, parseInt(m[1], 10));
    }
    const urlTokenByText = new Map();
    const now = new Date().toISOString();
    for (const e of unknownEntitiesAll) {
      if (e.category !== 'url') { nonUrlUnknowns.push(e); continue; }
      const key = (e.text || '').trim();
      if (!key) continue;
      let token = urlTokenByText.get(key.toLowerCase());
      if (!token) {
        const existing = findByOriginal(mapping, key);
        if (existing && existing.token) {
          token = existing.token;
        } else {
          urlCounter++;
          token = `[URL_${urlCounter}]`;
          mapping.entries.push({
            original: key,
            token,
            category: 'url',
            aliases: [],
            createdAt: now,
          });
        }
        urlTokenByText.set(key.toLowerCase(), token);
      }
      urlAutoDecisions.push({ ...e, action: 'tokenise', token });
    }
  }
  // Dedupe non-URL unknowns by (case-insensitive) text: the review dialog
  // should ask about "Kieran Beatham" once, not once per occurrence in the
  // document. After the adviser decides, that decision is expanded back
  // to every occurrence during application.
  const occurrencesByKey = new Map();
  const unknownEntities = [];
  for (const e of nonUrlUnknowns) {
    const key = (e.text || '').toLowerCase().trim();
    if (!key) continue;
    if (occurrencesByKey.has(key)) {
      occurrencesByKey.get(key).push(e);
    } else {
      occurrencesByKey.set(key, [e]);
      unknownEntities.push(e);
    }
  }
  const priorSummary = summarisePriorAppearances(entities);
  const earlySpecialFlags = detectSpecialCategorySignals(state.currentText);
  const result = await openReviewDialog(unknownEntities, mapping, {
    title: state.selectedFile,
    documentText: state.currentText,
    priorSummary,
    autoAppliedCount: knownEntities.length + urlAutoDecisions.length,
    specialCategoryFlags: earlySpecialFlags,
  });
  if (!result) return;
  for (const upd of result.mappingUpdates) {
    if (upd.aliasFor) addAlias(mapping, upd.aliasFor, upd.alias);
  }
  const safeAudit = await persistSafeListUpdates(mapping, result.safeListUpdates || []);
  // Expand the one-per-text decisions the adviser made back onto every
  // occurrence in the document, using the occurrencesByKey map built above.
  const expandedReviewedDecisions = [];
  for (const d of result.decisions) {
    const key = (d.text || '').toLowerCase().trim();
    const occurrences = occurrencesByKey.get(key) || [d];
    for (const occ of occurrences) {
      expandedReviewedDecisions.push({
        ...d,
        start: occ.start,
        end: occ.end,
        text: occ.text,
        contextBefore: occ.contextBefore,
        contextAfter: occ.contextAfter,
      });
    }
  }
  const autoDecisions = knownEntities.map((e) => ({
    ...e,
    action: 'tokenise',
    token: e.known.token,
  }));
  const allDecisions = [...autoDecisions, ...urlAutoDecisions, ...expandedReviewedDecisions].sort((a, b) => a.start - b.start);
  const sanitisedRaw = applySanitisation(state.currentText, allDecisions);
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
  // Safety net: sweep the finished sanitised body for any mapping
  // originals that the decision list missed (e.g. a name detected in
  // one place but not another because of an OCR quirk or a longer
  // overlapping detector). Verbatim regions are exempt.
  const sweepResult = postSanitiseSweep(sanitised, mapping);
  sanitised = sweepResult.text;
  if (sweepResult.sweptCount) {
    const summary = sweepResult.swept.slice(0, 5).map((s) => `${s.needle} -> ${s.token}`).join('; ');
    await appendAudit(c.rawHandle, `Post-sanitise sweep replaced ${sweepResult.sweptCount} missed occurrence(s): ${summary}${sweepResult.swept.length > 5 ? ', ...' : ''}.`);
  }
  const offenders = checkOutgoing(sanitised, mapping);
  if (offenders.length) {
    const logName = await writeExportBlockDebug(c, state.selectedFile, offenders, sanitised, mapping);
    const detail = offenders.slice(0, 3).map((o) => `${o.source}:"${o.needle}"->${o.token}`).join(', ');
    showToast(`Sanitisation blocked. ${offenders.length} identifier${offenders.length === 1 ? '' : 's'} still present (${detail}${offenders.length > 3 ? ', ...' : ''}). See ${logName} in the case folder for full details.`, true);
    return;
  }
  const specialFlags = detectSpecialCategorySignals(state.currentText);
  if (specialFlags.length) {
    const proceed = await confirmSpecialCategoryExport(specialFlags);
    if (!proceed) {
      showToast('Export cancelled by adviser after special-category confirmation prompt.', true);
      await appendAudit(c.rawHandle, `Special-category export cancelled by adviser: ${summariseSpecialCategoryFlags(specialFlags).join(', ')}`);
      return;
    }
    await appendAudit(c.rawHandle, `Special-category confirmed by adviser: ${summariseSpecialCategoryFlags(specialFlags).join(', ')}`);
  }
  const sanitisedSourceName = sanitiseFilenameForHeader(state.selectedFile, mapping);
  const header = buildHeader({
    caseId: c.id,
    sourceName: sanitisedSourceName,
    tokensUsed: allDecisions.filter((d) => d.action === 'tokenise').map((d) => d.token),
    sanitisedDateISO: new Date().toISOString(),
    verbatimCount: verbatimIds.length,
    specialCategoryFlags: summariseSpecialCategoryFlags(specialFlags),
  });
  const output = header + sanitised;
  // Rename the sanitised file if the raw filename contains identifiers.
  // Raw file is left alone (adviser may want to keep it, and SharePoint
  // sync may propagate renames). Track the raw -> safe pairing in the
  // mapping so listFiles keeps the sidebar showing "sanitised" next to
  // the raw file.
  const outputSanitisedName = sanitisedSourceName || state.selectedFile;
  await writeFileText(c.sanHandle, outputSanitisedName, output);
  if (!mapping.sanitisedFilenames) mapping.sanitisedFilenames = {};
  const previousSanName = mapping.sanitisedFilenames[state.selectedFile];
  if (previousSanName && previousSanName !== outputSanitisedName) {
    try { await deleteEntry(c.sanHandle, previousSanName); } catch (_e) { /* already gone */ }
  }
  if (outputSanitisedName !== state.selectedFile) {
    // Also sweep a legacy same-name sanitised file that pre-dates this fix.
    try { await deleteEntry(c.sanHandle, state.selectedFile); } catch (_e) { /* nothing to clean */ }
  }
  mapping.sanitisedFilenames[state.selectedFile] = outputSanitisedName;
  await saveMapping(c.rawHandle, mapping);
  // Refresh the in-memory file entry so the sidebar and selectFile see
  // the new safe name straight away, without waiting for a full case
  // re-scan.
  const fileEntry = (c.files || []).find((f) => f.name === state.selectedFile);
  if (fileEntry) {
    fileEntry.sanitisedName = outputSanitisedName;
    fileEntry.hasSanitised = true;
  }
  // Update the case's local client label. If the review dialog just
  // committed a [CL] entry this will populate the sidebar suffix
  // immediately without a full re-scan.
  c.clientLabel = deriveClientLabel(mapping);
  const added = accumulateWatchlist(state.watchlist, mapping, c.id);
  if (added) await saveWatchlist(state.handles.root, state.watchlist);
  const verbatimAudit = verbatimIds.length ? `; ${verbatimIds.length} verbatim block(s)` : '';
  const watchlistAudit = added ? `; ${added} new watchlist entrie(s)` : '';
  const autoNote = autoDecisions.length ? `; ${autoDecisions.length} auto-applied from mapping` : '';
  const urlNote = urlAutoDecisions.length ? `; ${urlAutoDecisions.length} URL(s) auto-tokenised` : '';
  const specialAudit = specialFlags.length ? `; special-category signals: ${summariseSpecialCategoryFlags(specialFlags).join(', ')}` : '';
  await appendAudit(c.rawHandle, `Sanitised (v${TOOL_VERSION}): ${state.selectedFile} (${result.decisions.length} reviewed decisions, ${result.mappingUpdates.length} new mapping entries)${autoNote}${urlNote}${safeAudit ? `; ${safeAudit}` : ''}${verbatimAudit}${watchlistAudit}${specialAudit}`);
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

/**
 * Multi-file clipboard: tick sanitised files in the sidebar, then Copy
 * concatenates them into one clipboard payload with clear file-separator
 * headers. Rehydration then works against whichever case they came from.
 */
function toggleBatchSelection(caseId, fileName, checked) {
  const key = `${caseId}::${fileName}`;
  if (checked) state.selectedForBatch.add(key);
  else state.selectedForBatch.delete(key);
}

function renderBatchBar() {
  const existing = document.getElementById('batch-bar');
  if (existing) existing.remove();
  if (state.selectedForBatch.size === 0) return;
  const bar = document.createElement('div');
  bar.id = 'batch-bar';
  bar.style.cssText = 'position:fixed;bottom:32px;right:24px;background:var(--topbar);color:#fff;padding:8px 12px;border-radius:6px;box-shadow:var(--shadow-toast);display:flex;gap:8px;align-items:center;z-index:150;';
  bar.innerHTML = `
    <span style="font-size:12px;">${state.selectedForBatch.size} file${state.selectedForBatch.size === 1 ? '' : 's'} selected</span>
    <button id="batch-copy" class="primary" style="height:26px;padding:0 10px;">Copy sanitised (concat)</button>
    <button id="batch-clear" style="height:26px;padding:0 10px;">Clear</button>
  `;
  document.body.appendChild(bar);
  bar.querySelector('#batch-copy').addEventListener('click', onCopySanitisedBatch);
  bar.querySelector('#batch-clear').addEventListener('click', () => {
    state.selectedForBatch.clear();
    renderBatchBar();
    renderSidebar();
  });
}

async function onCopySanitisedBatch() {
  if (state.selectedForBatch.size === 0) return;
  const chunks = [];
  const missing = [];
  for (const key of state.selectedForBatch) {
    const [caseId, name] = key.split('::');
    const c = state.cases.find((x) => x.id === caseId);
    if (!c) { missing.push(key); continue; }
    const fileObj = (c.files || []).find((f) => f.name === name) || {};
    const sanName = fileObj.sanitisedName || name;
    try {
      let text;
      try { ({ text } = await readFileText(c.sanHandle, sanName)); }
      catch (_e) { ({ text } = await readFileText(c.sanHandle, name)); }
      chunks.push(`\n\n===== ${caseId} / ${sanName} =====\n\n${text}`);
    } catch (_e) {
      missing.push(key);
    }
  }
  if (!chunks.length) {
    showToast('Nothing to copy: none of the ticked files have a sanitised version yet.', true);
    return;
  }
  const payload = `# Multi-file sanitised bundle: ${chunks.length} file(s)\n${chunks.join('')}`;
  try {
    await copyText(payload, `${chunks.length} sanitised files`);
    showToast(`Copied ${chunks.length} sanitised file${chunks.length === 1 ? '' : 's'}${missing.length ? `, ${missing.length} skipped` : ''}.`);
  } catch (err) {
    showToast(err.message, true);
  }
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
  const text = await openRehydrateInputDialog();
  if (text == null) return;
  if (!text.trim()) { showToast('Nothing to rehydrate - the input was empty.', true); return; }
  await rehydrateTextForCase(c, text, { origin: 'paste' });
}

/**
 * Rehydrate a file the adviser has saved into the case's sanitised
 * folder (typically Claude's reply as .txt or .docx). Reads the file,
 * extracts text if it is a .docx, then hands off to the shared
 * rehydrate pipeline. Same integrity checks as paste-rehydrate. The
 * input already lives in the sanitised folder so the shared pipeline
 * skips duplicating it there.
 */
async function onRehydrateSanFile(caseObj, name) {
  if (!caseObj || !caseObj.sanHandle) return;
  try {
    const h = await caseObj.sanHandle.getFileHandle(name);
    const file = await h.getFile();
    const lower = name.toLowerCase();
    let text;
    if (lower.endsWith('.docx')) {
      const buf = await file.arrayBuffer();
      text = await extractDocxText(buf);
    } else {
      text = await file.text();
    }
    if (!text.trim()) { showToast(`${name} is empty.`, true); return; }
    await rehydrateTextForCase(caseObj, text, { origin: 'file', sourceName: name });
  } catch (err) {
    showToast(`Could not read ${name}: ${err.message}`, true);
  }
}

/**
 * Shared rehydrate pipeline: mapping load, integrity/verbatim checks,
 * copy-to-clipboard, audit trail, and disk persistence. For paste-driven
 * rehydrates the tokenised input is written to the sanitised folder so a
 * later reviewer can see what Claude produced. The rehydrated output
 * always lands in the rehydrated folder alongside a matching basename.
 * `opts.origin` is 'paste' or 'file'; `opts.sourceName` is the sanitised
 * file the adviser clicked, if any.
 */
async function rehydrateTextForCase(c, text, opts) {
  const origin = (opts && opts.origin) || 'paste';
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
  } catch (err) {
    showToast(err.message, true);
    return;
  }
  // Persist the trail. Paste-driven rehydrates need both artefacts on
  // disk; file-driven rehydrates already have the tokenised input in
  // the sanitised folder and only need the rehydrated output written.
  let sanitisedName = opts && opts.sourceName ? opts.sourceName : null;
  let rehydratedName = null;
  try {
    if (origin === 'paste') {
      const stamp = timestampSlug();
      const baseName = `paste_${stamp}.txt`;
      await writeFileText(c.sanHandle, baseName, text);
      sanitisedName = baseName;
      // Refresh cached list so the sidebar picks up the new sanitised entry.
      if (c.aiReplies) c.aiReplies.unshift({ name: baseName, size: text.length, lastModified: Date.now() });
    }
    if (c.rehyHandle && sanitisedName) {
      rehydratedName = pairedRehydratedName(sanitisedName);
      await writeFileText(c.rehyHandle, rehydratedName, replaced);
      if (!c.rehydrated) c.rehydrated = [];
      c.rehydrated.unshift({ name: rehydratedName, size: replaced.length, lastModified: Date.now() });
    }
  } catch (err) {
    showToast(`Rehydrated text copied but could not be saved to disk: ${err.message}`, true);
  }
  const mismatchNote = verbatimMismatches && verbatimMismatches.length ? `; ${verbatimMismatches.length} verbatim mismatch(es) overridden` : '';
  const tokenCount = (text.match(/\[[A-Z_]+.*?\]/g) || []).length;
  const originLabel = origin === 'file' ? `file ${opts.sourceName}` : 'clipboard paste';
  const savedNote = rehydratedName ? `; saved as ${rehydratedName}` : '';
  await appendAudit(c.rawHandle, `Rehydrated ${text.length} chars from ${originLabel} (${tokenCount} tokens)${mismatchNote}${savedNote}.`);
  showToast(rehydratedName
    ? `Rehydrated text copied and saved to Casework_rehydrated as ${rehydratedName}.`
    : 'Rehydrated text copied. Paste into Outlook or CRM.');
  renderSidebar();
}

/**
 * Persist a diagnostic file when checkOutgoing blocks the export.
 * Written to the case's raw folder so the adviser can paste it back to
 * whoever is debugging without hunting for it. Includes every offender
 * with its context, the mapping entry it matched, and a snippet of the
 * sanitised body around each hit. Overwrites on each block so the file
 * is always the most recent state.
 */
async function writeExportBlockDebug(caseObj, sourceFile, offenders, sanitised, mapping) {
  const name = '_debug_export_block.log';
  try {
    const lines = [];
    lines.push('=== Sanitiser export block diagnostic ===');
    lines.push(`When:        ${new Date().toISOString()}`);
    lines.push(`Case:        ${caseObj ? caseObj.id : '(unknown)'}`);
    lines.push(`Source file: ${sourceFile || '(unknown)'}`);
    lines.push(`Tool ver:    ${TOOL_VERSION}`);
    lines.push(`Offenders:   ${offenders.length}`);
    lines.push('');
    offenders.forEach((o, i) => {
      const entry = (mapping.entries || []).find((e) => e.token === o.token) || {};
      lines.push(`--- Offender ${i + 1} ---`);
      lines.push(`Matched text : "${o.original}"`);
      lines.push(`Source       : ${o.source}   (mapping ${o.source === 'alias' ? 'alias' : 'original'})`);
      lines.push(`Needle       : "${o.needle}"`);
      lines.push(`Token        : ${o.token}`);
      lines.push(`Category     : ${o.category || entry.category || '(none)'}`);
      lines.push(`Sanitised pos: ${o.index}`);
      lines.push(`Entry origin : "${entry.original || '(none)'}"`);
      const aliasCount = (entry.aliases || []).length;
      lines.push(`Entry aliases: ${aliasCount} (${aliasCount ? entry.aliases.slice(0, 10).map((a) => `"${a}"`).join(', ') + (aliasCount > 10 ? ', ...' : '') : ''})`);
      lines.push(`Variations seeded: ${entry.variationsSeeded ? 'yes' : 'no'}`);
      lines.push(`Context      : ${o.context}`);
      // Is this hit inside a verbatim block?
      const before = sanitised.slice(0, o.index);
      const opens = (before.match(/<verbatim-referral\s/g) || []).length;
      const closes = (before.match(/<\/verbatim-referral>/g) || []).length;
      const inVerbatim = opens > closes;
      lines.push(`Inside verbatim block: ${inVerbatim ? 'YES (verbatim blocks preserve raw text byte-for-byte)' : 'no'}`);
      lines.push('');
    });
    lines.push('=== Mapping summary ===');
    const entries = (mapping.entries || []);
    lines.push(`Total mapping entries: ${entries.length}`);
    entries.slice(0, 40).forEach((e) => {
      lines.push(`  ${e.token}  <-  "${e.original}"  (category=${e.category || '?'}, aliases=${(e.aliases || []).length}${e.variationsSeeded ? ', seeded' : ''})`);
    });
    if (entries.length > 40) lines.push(`  (+${entries.length - 40} more not shown)`);
    lines.push('');
    lines.push('=== Sanitised body (leading 800 chars) ===');
    lines.push(sanitised.slice(0, 800));
    lines.push('');
    lines.push('=== Sanitised body (trailing 800 chars) ===');
    lines.push(sanitised.slice(Math.max(0, sanitised.length - 800)));
    await writeFileText(caseObj.rawHandle, name, lines.join('\n'));
  } catch (_e) { /* logging failure is non-fatal */ }
  return name;
}

/**
 * Compact filesystem-safe timestamp for auto-generated filenames:
 * YYYYMMDD_HHMMSS in local time.
 */
function timestampSlug() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Given a sanitised filename ("reply.docx", "paste_20260713_142201.txt"),
 * return the paired rehydrated filename in the rehydrated folder. Keeps
 * the basename so a reviewer can eyeball the pairing at a glance; always
 * writes as .txt (rehydrated output is plain text regardless of source
 * format).
 */
function pairedRehydratedName(sanitisedName) {
  const dot = sanitisedName.lastIndexOf('.');
  const base = dot > 0 ? sanitisedName.slice(0, dot) : sanitisedName;
  return `${base}.rehydrated.txt`;
}

/**
 * Ask the adviser for the AI reply as either a paste into a textarea or
 * a dropped .txt / .docx file. Ctrl+V into the textarea always works,
 * so this sidesteps the "document not focused" clipboard-read failure
 * that the old direct-read path hit whenever the tool tab was not the
 * active window. Resolves to the text or null on cancel.
 */
function openRehydrateInputDialog() {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root');
    root.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.width = '760px';
    backdrop.appendChild(modal);
    modal.innerHTML = `
      <div class="modal-header">Paste the AI reply to rehydrate</div>
      <div class="modal-body">
        <p class="muted" style="margin-top:0;">Ctrl+V into the box, or drop a <code>.txt</code> or <code>.docx</code> file. Rehydration runs against the selected case's mapping.</p>
        <textarea id="rehy-textarea" spellcheck="false" style="width:100%;min-height:260px;font-family:var(--mono);font-size:12px;padding:8px;border:1px solid var(--border);border-radius:4px;box-sizing:border-box;" placeholder="Paste the AI reply here..."></textarea>
        <div id="rehy-dropzone" style="margin-top:8px;padding:14px;border:2px dashed var(--border);border-radius:6px;text-align:center;color:var(--muted);font-size:12px;">
          Or drop a <strong>.txt</strong> or <strong>.docx</strong> file here.
          <div style="margin-top:6px;"><input id="rehy-file" type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="font-size:12px;"></div>
        </div>
        <div id="rehy-status" class="muted" style="margin-top:6px;font-size:12px;"></div>
      </div>
      <div class="modal-footer">
        <button data-action="cancel">Cancel</button>
        <button class="primary" data-action="ok">Rehydrate</button>
      </div>
    `;
    root.appendChild(backdrop);
    const ta = modal.querySelector('#rehy-textarea');
    const status = modal.querySelector('#rehy-status');
    const dropzone = modal.querySelector('#rehy-dropzone');
    const fileInput = modal.querySelector('#rehy-file');
    // Best-effort autofill from clipboard: silent on failure so the
    // adviser can still paste manually.
    (async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const cb = await navigator.clipboard.readText();
          if (cb && !ta.value) {
            ta.value = cb;
            status.textContent = `Prefilled ${cb.length} characters from the clipboard. Edit or replace as needed.`;
          }
        }
      } catch (_e) { /* focus / permission - user pastes manually */ }
    })();
    setTimeout(() => ta.focus(), 30);
    async function loadFile(file) {
      if (!file) return;
      const name = file.name.toLowerCase();
      status.textContent = `Reading ${file.name}...`;
      try {
        if (name.endsWith('.docx')) {
          const buf = await file.arrayBuffer();
          const text = await extractDocxText(buf);
          ta.value = text;
          status.textContent = `Loaded ${file.name} (${text.length} characters extracted from .docx).`;
        } else {
          const text = await file.text();
          ta.value = text;
          status.textContent = `Loaded ${file.name} (${text.length} characters).`;
        }
      } catch (err) {
        status.textContent = `Could not read ${file.name}: ${err.message}`;
      }
    }
    fileInput.addEventListener('change', () => loadFile(fileInput.files && fileInput.files[0]));
    dropzone.addEventListener('dragover', (ev) => { ev.preventDefault(); dropzone.style.borderColor = 'var(--accent)'; });
    dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = ''; });
    dropzone.addEventListener('drop', (ev) => {
      ev.preventDefault();
      dropzone.style.borderColor = '';
      const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f) loadFile(f);
    });
    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => { backdrop.remove(); resolve(null); });
    modal.querySelector('[data-action="ok"]').addEventListener('click', () => { const v = ta.value; backdrop.remove(); resolve(v); });
  });
}

/**
 * Extract plain text from a .docx file. A .docx is a ZIP archive whose
 * document body lives in word/document.xml. We parse the ZIP central
 * directory by hand and inflate the payload with the browser's
 * DecompressionStream API, then pull the text runs out of the XML.
 * No external library.
 */
async function extractDocxText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  // End-of-central-directory record: signature 0x06054b50, within the
  // last ~64 KB (EOCD comment field caps at 65535 bytes).
  let eocd = -1;
  const searchStart = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Not a valid ZIP/.docx file (no EOCD record).');
  const cdEntries = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  let p = cdOffset;
  for (let n = 0; n < cdEntries; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Central directory record signature mismatch.');
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const filenameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const filename = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + filenameLen));
    if (filename === 'word/document.xml') {
      const lhFilenameLen = view.getUint16(localHeaderOffset + 26, true);
      const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lhFilenameLen + lhExtraLen;
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
      let xmlBytes;
      if (method === 0) {
        xmlBytes = compressed;
      } else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('DecompressionStream not available; cannot inflate .docx in this browser.');
        }
        const blob = new Blob([compressed]);
        const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
        xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error(`Unsupported ZIP compression method ${method} for word/document.xml.`);
      }
      const xml = new TextDecoder().decode(xmlBytes);
      return docxXmlToText(xml);
    }
    p += 46 + filenameLen + extraLen + commentLen;
  }
  throw new Error('No word/document.xml in the archive - is this really a .docx?');
}

/**
 * Reduce Word's document.xml to plain text. Preserves paragraph breaks
 * (`</w:p>`), soft line breaks (`<w:br/>`) and tabs (`<w:tab/>`), and
 * concatenates each paragraph's `<w:t>...</w:t>` runs in document order.
 * XML entities are decoded so tokens like `[LANDLORD'S SOLICITOR]`
 * survive intact through &apos; -> ' conversion.
 */
function docxXmlToText(xml) {
  const paragraphs = xml.split(/<\/w:p>/);
  const out = [];
  const partRx = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/?>|<w:tab\s*\/?>/g;
  for (const para of paragraphs) {
    let buf = '';
    let m;
    partRx.lastIndex = 0;
    while ((m = partRx.exec(para)) !== null) {
      if (m[1] !== undefined) buf += decodeXmlEntities(m[1]);
      else if (m[0].startsWith('<w:br')) buf += '\n';
      else if (m[0].startsWith('<w:tab')) buf += '\t';
    }
    out.push(buf);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
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
 * Refresh the case list, reading whatever is now on disk. Used after
 * external tools (SharePoint sync, Explorer) add or remove case
 * folders or files, since a browser cannot watch the filesystem for
 * changes.
 */
async function onRefreshCases() {
  if (!state.handles) {
    showToast('Open a casework folder first.', true);
    return;
  }
  await refreshCases();
  showToast('Case list refreshed.');
}

/**
 * Rename an open or closed case. Prompts for the new ID, validates,
 * and writes through to the raw folder, sanitised mirror, mapping,
 * closure log, and watchlist.
 */
/**
 * Full-text search across every sanitised file in every case, open or
 * closed. Only sanitised material is searched; the raw case files are
 * never touched. Case-insensitive; a hit list shows the case, filename,
 * up to three excerpt lines per file with the query highlighted, and
 * an Open button that jumps to the file.
 */
async function onOpenSearch() {
  if (!state.handles) { showToast('Open a casework folder first.', true); return; }
  const root = document.getElementById('dialog-root');
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.width = '820px';
  backdrop.appendChild(modal);
  modal.innerHTML = `
    <div class="modal-header">Search sanitised material</div>
    <div class="modal-body">
      <p class="muted">Case-insensitive. Only sanitised files are searched. Raw casework is never touched by search.</p>
      <div class="form-row">
        <input id="search-query" type="text" placeholder="Type at least 2 characters..." autofocus spellcheck="false" autocomplete="off">
      </div>
      <div id="search-results" class="muted" style="min-height:120px;">Type a query.</div>
    </div>
    <div class="modal-footer">
      <button class="primary" data-action="ok">Close</button>
    </div>
  `;
  root.appendChild(backdrop);
  const input = modal.querySelector('#search-query');
  const resultsEl = modal.querySelector('#search-results');
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) { resultsEl.innerHTML = '<div class="muted">Type at least 2 characters.</div>'; return; }
      resultsEl.innerHTML = '<div class="muted">Searching...</div>';
      try {
        const results = await searchAllSanitised(q);
        resultsEl.innerHTML = renderSearchResults(q, results);
        resultsEl.querySelectorAll('[data-action="open-hit"]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const caseId = btn.dataset.case;
            const name = btn.dataset.name;
            const kind = btn.dataset.kind;
            backdrop.remove();
            if (state.view !== kind) switchSidebarView(kind);
            await refreshCases();
            await selectCase(caseId);
            await selectFile(name);
          });
        });
      } catch (err) {
        resultsEl.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
      }
    }, 200);
  });
  modal.addEventListener('click', (ev) => {
    if (ev.target.dataset && ev.target.dataset.action === 'ok') backdrop.remove();
  });
}

async function searchAllSanitised(query) {
  const q = query.toLowerCase();
  const results = [];
  const openCases = await listCases(state.handles, 'open');
  const closedCases = await listCases(state.handles, 'closed');
  for (const c of [...openCases, ...closedCases]) {
    if (!c.sanHandle) continue;
    for await (const entry of c.sanHandle.values()) {
      if (entry.kind !== 'file') continue;
      try {
        const { text } = await readFileText(c.sanHandle, entry.name);
        const lc = text.toLowerCase();
        const positions = [];
        let idx = 0;
        while (true) {
          const p = lc.indexOf(q, idx);
          if (p === -1) break;
          positions.push(p);
          idx = p + q.length;
          if (positions.length > 20) break;
        }
        if (positions.length) {
          results.push({
            caseId: c.id,
            kind: c.kind,
            name: entry.name,
            hits: positions.map((p) => ({
              excerpt: text.slice(Math.max(0, p - 40), Math.min(text.length, p + 80 + q.length)),
              offset: p,
            })),
          });
        }
      } catch (_e) { /* skip unreadable */ }
    }
  }
  results.sort((a, b) => (b.hits.length - a.hits.length) || a.caseId.localeCompare(b.caseId));
  return results;
}

function renderSearchResults(query, results) {
  if (!results.length) return '<div class="muted">No matches.</div>';
  const total = results.reduce((s, r) => s + r.hits.length, 0);
  const header = `<div style="margin-bottom:8px;font-weight:600;">${total} match${total === 1 ? '' : 'es'} in ${results.length} file${results.length === 1 ? '' : 's'}</div>`;
  return header + results.map((r) => `
    <div style="margin-bottom:14px;padding:8px;background:var(--panel-alt);border-radius:4px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <strong>${escapeHtml(r.caseId)}</strong>
        ${r.kind === 'closed' ? '<span class="chip">closed</span>' : ''}
        <code style="font-size:12px;">${escapeHtml(r.name)}</code>
        <button data-action="open-hit" data-case="${escapeHtml(r.caseId)}" data-name="${escapeHtml(r.name)}" data-kind="${escapeHtml(r.kind)}" style="margin-left:auto;font-size:11px;padding:2px 8px;">Open</button>
      </div>
      ${r.hits.slice(0, 3).map((h) => `<div style="font-family:var(--mono);font-size:12px;margin:2px 0;">...${highlightExcerpt(h.excerpt, query)}...</div>`).join('')}
      ${r.hits.length > 3 ? `<div class="muted">+ ${r.hits.length - 3} more in this file</div>` : ''}
    </div>
  `).join('');
}

function highlightExcerpt(excerpt, query) {
  const lc = excerpt.toLowerCase();
  const q = query.toLowerCase();
  let out = '';
  let last = 0;
  let idx = 0;
  while (true) {
    const p = lc.indexOf(q, idx);
    if (p === -1) break;
    out += escapeHtml(excerpt.slice(last, p));
    out += `<mark>${escapeHtml(excerpt.slice(p, p + query.length))}</mark>`;
    last = p + query.length;
    idx = last;
  }
  out += escapeHtml(excerpt.slice(last));
  return out;
}

/**
 * Mapping editor for a case. Presents every mapping entry as an
 * editable row. On save, token renames are propagated across every
 * already-sanitised file in the case so old tokens stop appearing.
 * Original text, aliases, and category can also be edited; those
 * changes affect future sanitisations but not existing sanitised output.
 */
async function onViewMapping(caseObj) {
  const mapping = await loadMapping(caseObj.rawHandle, caseObj.id);
  const originalTokens = mapping.entries.map((e) => e.token);
  const root = document.getElementById('dialog-root');
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.width = '1000px';
  backdrop.appendChild(modal);
  const renderBody = () => mapping.entries.map((e, i) => `
    <tr data-idx="${i}">
      <td><input data-role="original" type="text" value="${escapeHtml(e.original)}" spellcheck="false" autocomplete="off" style="width:100%;font-family:var(--mono);font-size:12px;"></td>
      <td><input data-role="token" type="text" value="${escapeHtml(e.token)}" spellcheck="false" autocomplete="off" style="width:100%;font-family:var(--mono);font-size:12px;"></td>
      <td><span class="entity-category">${escapeHtml(e.category || '')}</span></td>
      <td><input data-role="aliases" type="text" value="${escapeHtml((e.aliases || []).join(', '))}" spellcheck="false" autocomplete="off" placeholder="comma-separated" style="width:100%;font-family:var(--mono);font-size:12px;"></td>
      <td><button data-action="delete-entry" data-idx="${i}" class="danger" style="font-size:11px;padding:2px 8px;height:auto;">Delete</button></td>
    </tr>
  `).join('');
  modal.innerHTML = `
    <div class="modal-header">Mapping: ${escapeHtml(caseObj.id)} (${mapping.entries.length} entr${mapping.entries.length === 1 ? 'y' : 'ies'})</div>
    <div class="modal-body">
      <p class="muted">Every real identifier this case has tokenised so far. Edit any cell to change it. Renaming a token also rewrites it across every already-sanitised file in the case, so nothing goes stale. Deleting an entry removes it from the mapping only; already-sanitised text keeps the token intact and will not rehydrate until you undo the deletion.</p>
      <table class="entity-table">
        <thead>
          <tr>
            <th style="width:28%">Original</th>
            <th style="width:20%">Token</th>
            <th style="width:14%">Category</th>
            <th style="width:26%">Aliases</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="mapping-body">${renderBody()}</tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button data-action="cancel">Cancel</button>
      <button class="primary" data-action="save">Save and propagate</button>
    </div>
  `;
  root.appendChild(backdrop);
  modal.addEventListener('click', async (ev) => {
    const action = ev.target.dataset && ev.target.dataset.action;
    if (action === 'cancel') { backdrop.remove(); return; }
    if (action === 'delete-entry') {
      const i = Number(ev.target.dataset.idx);
      const entry = mapping.entries[i];
      if (!entry) return;
      if (confirm(`Delete "${entry.original}" -> ${entry.token}?\n\nThe token stays in already-sanitised text but rehydration of that text will leave the token in place because the mapping no longer has it.`)) {
        mapping.entries.splice(i, 1);
        originalTokens.splice(i, 1);
        modal.querySelector('#mapping-body').innerHTML = renderBody();
      }
      return;
    }
    if (action === 'save') {
      const rows = modal.querySelectorAll('tr[data-idx]');
      const tokenChanges = [];
      rows.forEach((row) => {
        const i = Number(row.dataset.idx);
        const e = mapping.entries[i];
        if (!e) return;
        const oldToken = originalTokens[i];
        const newToken = row.querySelector('input[data-role="token"]').value.trim();
        if (oldToken !== newToken && newToken) {
          tokenChanges.push({ old: oldToken, new: newToken });
        }
        e.original = row.querySelector('input[data-role="original"]').value.trim();
        e.token = newToken || oldToken;
        e.aliases = row.querySelector('input[data-role="aliases"]').value.split(',').map((s) => s.trim()).filter(Boolean);
      });
      await saveMapping(caseObj.rawHandle, mapping);
      let propagatedCount = 0;
      if (tokenChanges.length) {
        propagatedCount = await propagateTokenChanges(caseObj, tokenChanges);
      }
      const auditParts = ['Mapping edited'];
      if (tokenChanges.length) auditParts.push(`${tokenChanges.length} token rename(s) propagated to ${propagatedCount} sanitised file(s)`);
      await appendAudit(caseObj.rawHandle, auditParts.join('; '));
      backdrop.remove();
      showToast(tokenChanges.length
        ? `Mapping saved. ${tokenChanges.length} token rename(s) applied across ${propagatedCount} sanitised file(s).`
        : 'Mapping saved.');
      if (state.currentMapping && state.selectedCaseId === caseObj.id) {
        state.currentMapping = mapping;
        if (state.selectedFile) await selectFile(state.selectedFile);
      }
      await refreshCases();
    }
  });
}

/**
 * Walk the sanitised mirror for a case and replace every occurrence of
 * each old token with its new token in every file. Returns the number
 * of files that actually changed. Ordering: longest oldToken first so
 * shorter tokens do not partially match inside longer ones (e.g. avoid
 * "[CL]" chewing up "[CL_1]" if both are renamed in the same pass).
 */
async function propagateTokenChanges(caseObj, changes) {
  if (!caseObj.sanHandle || !changes.length) return 0;
  const ordered = [...changes].sort((a, b) => b.old.length - a.old.length);
  let count = 0;
  for await (const entry of caseObj.sanHandle.values()) {
    if (entry.kind !== 'file') continue;
    try {
      const { text } = await readFileText(caseObj.sanHandle, entry.name);
      let next = text;
      for (const ch of ordered) {
        if (ch.old && ch.old !== ch.new) next = next.split(ch.old).join(ch.new);
      }
      if (next !== text) {
        await writeFileText(caseObj.sanHandle, entry.name, next);
        count++;
      }
    } catch (_e) { /* skip */ }
  }
  return count;
}

/**
 * Show the case's audit log (_audit.log) in a scrollable modal so the
 * adviser can inspect what has happened to the case without leaving
 * the tool. Each entry is one tab-separated line "ISO_TIMESTAMP\ttext".
 */
async function onViewAuditLog(caseObj) {
  let lines = [];
  try {
    const { text } = await readFileText(caseObj.rawHandle, '_audit.log');
    lines = text.split('\n').filter((l) => l.trim());
  } catch (_e) {
    lines = [];
  }
  const root = document.getElementById('dialog-root');
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.width = '780px';
  backdrop.appendChild(modal);
  const rows = lines.length
    ? lines.map((line) => {
        const idx = line.indexOf('\t');
        const stamp = idx > 0 ? line.slice(0, idx) : '';
        const rest = idx > 0 ? line.slice(idx + 1) : line;
        return `<tr><td style="white-space:nowrap;font-family:var(--mono);font-size:11px;color:var(--muted);padding:4px 8px;">${escapeHtml(stamp)}</td><td style="padding:4px 8px;">${escapeHtml(rest)}</td></tr>`;
      }).reverse().join('')
    : '<tr><td colspan="2" class="muted" style="padding:12px;">No audit entries yet.</td></tr>';
  modal.innerHTML = `
    <div class="modal-header">Audit log: ${escapeHtml(caseObj.id)}</div>
    <div class="modal-body">
      <p class="muted">Newest first. The log is written on every sanitisation, rehydration, file add, delete, and lifecycle event. It lives at <code>_audit.log</code> inside the case folder if you want a copy.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>
    <div class="modal-footer">
      <button class="primary" data-action="ok">Close</button>
    </div>
  `;
  modal.addEventListener('click', (ev) => {
    if (ev.target.dataset && ev.target.dataset.action === 'ok') backdrop.remove();
  });
  root.appendChild(backdrop);
}

async function onRenameCase(caseObj) {
  const raw = prompt(`Rename case "${caseObj.id}" to:\n\n(For example, updating an R-number to an A-number when a case is escalated. Letters, digits and hyphens only.)`, caseObj.id);
  if (raw == null) return;
  const trimmed = raw.trim();
  if (!trimmed) return;
  if (trimmed === caseObj.id) return;
  if (!/^[A-Z0-9\-]{2,32}$/i.test(trimmed)) {
    showToast('Case IDs may only contain letters, digits, and hyphens.', true);
    return;
  }
  if (state.cases.some((c) => c.id.toLowerCase() === trimmed.toLowerCase() && c.kind === caseObj.kind)) {
    showToast(`A case called "${trimmed}" already exists in this view.`, true);
    return;
  }
  try {
    await renameCase(state.handles, caseObj, trimmed, state.watchlist);
    if (state.watchlist) await saveWatchlist(state.handles.root, state.watchlist);
    if (state.selectedCaseId === caseObj.id) state.selectedCaseId = trimmed;
    await refreshCases();
    showToast(`Renamed to ${trimmed}.`);
  } catch (err) {
    showToast(`Could not rename: ${err.message}`, true);
  }
}

/**
 * Extract a supported binary file (PDF, .msg, .eml) that already lives
 * inside a case folder, saving the parsed text as a `.txt` sibling and
 * opening it for sanitisation. Same code path as the drop handler; the
 * only difference is the source (an existing file in the case rather
 * than a File object from a drop event).
 */
async function onExtractExistingFile(caseObj, name) {
  const lower = name.toLowerCase();
  const isImage = /\.(png|jpg|jpeg|bmp|webp|gif)$/.test(lower);
  if (!(lower.endsWith('.pdf') || lower.endsWith('.msg') || lower.endsWith('.eml') || isImage)) {
    showToast('This file cannot be extracted automatically. Use "Paste text as new file" to bring its content in.', true);
    return;
  }
  try {
    const handle = await caseObj.rawHandle.getFileHandle(name);
    const file = await handle.getFile();
    const summaries = [];
    const savedName = await handleDroppedFile(caseObj, file, summaries);
    await appendAudit(caseObj.rawHandle, `Extracted: ${name} -> ${savedName}`);
    await refreshCases();
    await selectCase(caseObj.id);
    await selectFile(savedName);
    if (summaries.length) showEmailImportSummary(summaries);
    else showToast(`Extracted ${name} to ${savedName}.`);
  } catch (err) {
    showToast(`Could not extract ${name}: ${err.message}`, true);
  }
}

/**
 * Delete a file from a case. Removes the raw copy and, if present, the
 * sanitised mirror. The case mapping is left alone: tokens already
 * allocated may still be referenced by other files in the case, and
 * removing them would silently break rehydration of those.
 */
async function onDeleteFile(caseObj, name) {
  const fileObj = caseObj.files.find((f) => f.name === name) || {};
  const hasSanitised = fileObj.hasSanitised;
  const sanName = fileObj.sanitisedName || name;
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
      try { await deleteEntry(caseObj.sanHandle, sanName); } catch (_e) { /* mirror already missing */ }
      if (sanName !== name) {
        try { await deleteEntry(caseObj.sanHandle, name); } catch (_e) { /* nothing to sweep */ }
      }
    }
    // Also remove the sanitised-name entry from the mapping so a
    // re-added file does not inherit the stale pairing.
    try {
      const mapping = await loadMapping(caseObj.rawHandle, caseObj.id);
      if (mapping.sanitisedFilenames && mapping.sanitisedFilenames[name]) {
        delete mapping.sanitisedFilenames[name];
        await saveMapping(caseObj.rawHandle, mapping);
      }
    } catch (_e) { /* no mapping yet */ }
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

/**
 * Manual tokenise-from-selection. The adviser highlights any text in
 * the Original tab (or the Sanitised tab as an alias) and clicks
 * "Tokenise selection". A modal prompts for the token; on confirm the
 * text is added to the case mapping and applied across every occurrence
 * in the file. The updated file is written back through the same
 * sanitisation path so integrity checks (checkOutgoing, verbatim,
 * special category) run.
 */
async function onTokeniseSelection(providedSelection) {
  const selection = String(providedSelection != null ? providedSelection : (window.getSelection ? window.getSelection().toString() : '')).trim();
  if (!selection) {
    showToast('Highlight some text in the Original tab first, then click Tokenise selection.', true);
    return;
  }
  if (!state.selectedCaseId || !state.selectedFile) {
    showToast('Open a file first.', true);
    return;
  }
  if (!state.currentText || !state.currentText.includes(selection)) {
    // Case-insensitive fallback: warn but allow if it appears in a different case.
    const ci = state.currentText && state.currentText.toLowerCase().includes(selection.toLowerCase());
    if (!ci) {
      showToast('The highlighted text does not appear in the Original view of this file.', true);
      return;
    }
  }
  const token = await promptForToken(selection);
  if (!token) return;
  const c = state.cases.find((x) => x.id === state.selectedCaseId);
  if (!c) return;
  const mapping = state.currentMapping || (await loadMapping(c.rawHandle, c.id));
  const existing = findByOriginal(mapping, selection);
  if (existing) {
    if (!confirm(`"${selection}" is already mapped to ${existing.token}. Add "${selection}" as an alias for ${token}?`)) return;
    if (!existing.aliases) existing.aliases = [];
    if (!existing.aliases.some((a) => a.toLowerCase() === selection.toLowerCase())) existing.aliases.push(selection);
    existing.token = token;
  } else {
    addEntry(mapping, {
      original: selection,
      token,
      category: 'manual',
    });
  }
  await saveMapping(c.rawHandle, mapping);
  state.currentMapping = mapping;
  // Now trigger a normal sanitisation which will auto-apply the new
  // entry (it is a known mapping now) and re-write the sanitised copy.
  await appendAudit(c.rawHandle, `Manual token added: "${selection}" -> ${token}`);
  await onSanitise();
}

/**
 * Modal token prompt with the standard role vocabulary + a custom
 * text field. Kept small; returns the picked token, or null if the
 * adviser cancels.
 */
function promptForToken(sampleText) {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root');
    root.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.width = '520px';
    backdrop.appendChild(modal);
    modal.innerHTML = `
      <div class="modal-header">Tokenise "${escapeHtml(sampleText.slice(0, 80))}${sampleText.length > 80 ? '...' : ''}"</div>
      <div class="modal-body">
        <div class="form-row">
          <label>Pick a role from the vocabulary</label>
          <select id="tokenise-role">
            ${ROLE_GROUPS.map((g) => `<optgroup label="${escapeHtml(g.label)}">${g.roles.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('')}</optgroup>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>...or type a custom token like [LENDER] or [PROPERTY MANAGER]</label>
          <input id="tokenise-custom" type="text" spellcheck="false" autocomplete="off" placeholder="[LENDER]">
        </div>
      </div>
      <div class="modal-footer">
        <button data-action="cancel">Cancel</button>
        <button class="primary" data-action="ok">Add to mapping and re-sanitise</button>
      </div>
    `;
    root.appendChild(backdrop);
    setTimeout(() => modal.querySelector('#tokenise-custom').focus(), 0);
    modal.addEventListener('click', (ev) => {
      const a = ev.target.dataset && ev.target.dataset.action;
      if (a === 'cancel') { backdrop.remove(); resolve(null); return; }
      if (a === 'ok') {
        const custom = modal.querySelector('#tokenise-custom').value.trim();
        const role = modal.querySelector('#tokenise-role').value;
        const picked = normaliseCustomToken(custom || role);
        if (!/^\[[^\]]+\]$/.test(picked)) {
          showToast('Token must contain a role name, for example CL or LENDER.', true);
          return;
        }
        backdrop.remove();
        resolve(picked);
      }
    });
  });
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
