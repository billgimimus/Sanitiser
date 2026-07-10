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

export const ROLE_GROUPS = [
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

export const ALL_ROLES = ROLE_GROUPS.flatMap((g) => g.roles);

export const CATEGORY_LABELS = {
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
export const JUDGEMENT_CATEGORIES = new Set([
  'name_possible',
  'address_line',
]);

/**
 * When a category has an obvious default role assignment, offer it in the
 * review dialog rather than asking the adviser to pick from scratch. The
 * adviser can override.
 */
export const CATEGORY_DEFAULT_ROLE = {
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
export const SAFE_IDENTITIES = new Set([
  '[ADVISER]',
  '[ADVISER EMAIL]',
  '[SHELTER]',
]);

/**
 * Categories that should never be shown as "unresolved" flags: they are
 * preserved verbatim and do not need review.
 */
export const PRESERVED_CATEGORIES = new Set([
  'currency',
  'date',
  'postcode_outward',
]);
