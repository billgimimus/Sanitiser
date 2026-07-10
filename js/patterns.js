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
export const DETECTORS = [
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
