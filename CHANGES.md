# Changes

## Phase 1: minimum viable tool

Scope: file management, regex sanitisation, review, mapping, clipboard, rehydration integrity check, case lifecycle.

Built:

- Project skeleton: vanilla HTML, CSS, and ES modules. No framework, no build step. Open `index.html` directly.
- File System Access API integration. Adviser grants access to a casework root; the tool materialises `Casework`, `Casework_sanitised`, `Casework_closed`, and `Casework_sanitised_closed` subfolders on demand.
- Sidebar with open and closed case views. Click a case to expand it and see its files. Drag files onto a case row to add them.
- One-file-two-tabs interface. Original and Sanitised tabs, with a stale warning when the raw file has been modified after its sanitised counterpart.
- Regex detection layer covering postcodes, phone numbers, email addresses, NI, NHS, passport, BRP, HMCTS, UC/HB references, VRMs, dates, currency amounts, and heuristic name candidates. Address lines and name candidates are marked for judgement-call review.
- Review dialog. Adviser assigns roles from the predefined vocabulary or a custom token. Judgement-call rows cannot be left unresolved. Sanitisation is blocked if any real identifier is still present in the proposed output.
- Deterministic mapping persistence in `_mapping.json` inside each raw case folder. Aliases and numbered role tokens (`[LANDLORD_1]`, `[LANDLORD_2]`) allocated only under genuine ambiguity.
- Sanitised files carry a header block naming the case, source file, sanitisation date, and tokens present. The header must be actively removed before use in client-facing systems.
- Copy sanitised and Paste rehydrate buttons. Rehydration runs a reverse check first: if the pasted AI output contains a real identifier from the mapping, the adviser gets three options: abort, view both texts, or auto-correct and copy.
- Case lifecycle: create, close, reopen. Closure reason from the fixed vocabulary; optional note. Soft reopen within seven days removes the closure event; substantive reopen after that records a reopen event.
- Per-case plain-text `_audit.log` capturing file adds, sanitisation events, closure and reopen events, and rehydration activity.
- Fictitious test data covering possession, homelessness with multiple household members, a verbatim referral narrative, and a shared-address second referral.

Deferrals and known limitations:

- No named-entity recognition. Detection of non-Western names relies on the heuristic name detector plus the review step. Non-Latin scripts are not currently detected at all; the review step is where they are caught.
- No email drag-drop. `.msg` and `.eml` support arrives in phase 2.
- No cross-case conflict banner. Watchlist accumulation arrives in phase 2.
- No verbatim byte-match verification. Verbatim block handling arrives in phase 2.
- `_mapping.json` uses a simple linear scan for lookups. If a case ever grew to thousands of entries, this would become a bottleneck; it will not in practice.
- The heuristic name detector is deliberately noisy. Signal-noise tuning is a review-step trade-off; the alternative is quieter detection at the cost of misses.

Deviations from the spec:

- The project is laid out at the git repository root rather than inside a `casework-sanitiser/` subdirectory. The repository is dedicated to this tool, so the extra nesting adds nothing.
- The JavaScript is shipped as a single concatenated `js/app.js` rather than a tree of ES modules under `js/`. The briefing asked for both "ES modules split across files" and "must run by opening index.html directly", which are in genuine conflict: Chromium browsers refuse to load ES modules from `file://` URLs. Given the choice between shipping module structure and needing a local static server, or shipping one flat file and having double-click work, we chose the latter. Section markers in `js/app.js` preserve the module boundaries for navigation. Any future editing happens in `app.js` directly.
- A fallback banner in `index.html` shows a visible error if `js/app.js` fails to load or execute, so the failure mode observed on first ship is not silent again.

## Phase 1.1: failsafe paste input and unsupported-file handling

Prompted by first real-use feedback: dragging PDFs and `.msg` files into a case produced garbled bytes in the Original tab because the tool tried to decode them as UTF-8 text.

Built:

- **Paste text as new file** button on every open case. Opens a modal with a filename field, an optional source note (recorded in the audit log), and a text area. Saves the pasted content as a plain `.txt` inside the case and opens it ready for sanitisation.
- Extension-aware unsupported-file detection. Opening a `.pdf`, `.msg`, `.docx`, `.xls*`, or image file now shows a clear explanation and points the adviser at the paste-text failsafe instead of trying to render the raw bytes.
- Binary heuristic fallback for files with unfamiliar extensions: if the first kilobyte contains more than 5% control characters (excluding tab, CR, LF), the file is treated as unsupported.
- Audit log now records paste-text events with the optional source note.

## Phase 2.2: verbatim block handling for CRM referral notes

Housing casework has a specific rule that the referral narrative in the CRM entry must reproduce the referral form byte-for-byte. To enforce this when the AI is drafting the CRM entry:

- Source text wrapped in `<verbatim>...</verbatim>` markers by the adviser (typed directly, or included when using paste-text as new file).
- On sanitisation, each block is rewritten in the sanitised output as `<verbatim-referral id="v_TIMESTAMP_N">...</verbatim-referral>` and the exact raw content is recorded in `_mapping.json` under a new `verbatimBlocks` array. The N-th block in the source pairs with the N-th block in the sanitised output because the marker tags survive `applySanitisation` untouched.
- The sanitised file's header block names the count so the adviser can prompt the AI accordingly.
- On rehydration, `<verbatim-referral>` blocks are found in the AI reply, rehydrated with real identifiers, and compared byte-for-byte against the recorded original. If a block differs, a dialog shows the expected and actual side by side. The rehydrated text does not reach the clipboard until the adviser explicitly overrides or aborts. Both outcomes are recorded in the audit log.
- Successful blocks have the marker tags stripped from the final output so what reaches the clipboard is client-facing text.

## Phase 2.1: .eml drag-drop with inline parser

First feature of phase 2. Drop one or more `.eml` files onto a case row and the tool now:

- Parses the file as MIME text: headers with continuation, RFC 2047 encoded-word subjects, multipart / multipart-alternative bodies, nested multipart, quoted-printable and base64 transfer encodings.
- Prefers `text/plain` in a multipart/alternative body; falls back to a minimal HTML → text conversion when only HTML is available.
- Extracts attachment metadata (filename, content type, approximate size) and records each attachment in the saved text file as "present, not processed by the tool". Attachment binaries are not yet extracted; PDF and image support arrive later in phase 2.
- Saves the parsed content as `<basename>.txt` inside the case's raw folder, with a stable, readable header block. If the destination name already exists, a numeric suffix is added.
- Shows a summary modal after the drop listing each imported email, its attachments, and any parser warnings.
- Records the import in the case audit log.
- Falls back to a raw `.eml` copy if parsing fails, so real emails are never lost.

Deliberate limits at this stage:

- No Outlook `.msg` support yet (compound binary, needs vendored `msgreader`). The paste-text failsafe covers this in the meantime.
- Character sets other than UTF-8 decode as UTF-8. This is fine for casework English but would garble non-UTF-8 accents.
- Nested multipart with attachments deep inside is handled, but complex threading (In-Reply-To / References chains across many messages) is not consolidated across files; each `.eml` is imported independently.

## Phase 1.3: delete file

- Every file in the sidebar shows a small × on hover. Clicking it prompts for confirmation, then removes the raw copy and the sanitised mirror if one exists.
- The file view header has a **Delete file** button styled in the same danger colour, for the currently open file.
- The case mapping is intentionally left alone on delete: tokens already assigned may still be referenced by other files in the case, and removing them would silently break rehydration of those.
- Audit log records the deletion, noting whether the sanitised mirror was present.

## Phase 1.2: editable spans, safe lists, and more stopwords

Prompted by feedback that "Hi Kieran" was being picked up as a name when only "Kieran" was the name, and that there was no way to teach the tool about names that are known-safe:

- The **detected text on each review row is now editable**. Type a corrected boundary and the tool re-anchors the span to the new text within a 100-character window either side of the original position. Anchoring uses the original position rather than the last-edited one, so successive edits do not drift.
- Two new per-row buttons: **Safe here** and **Safe everywhere**. Both switch the row's action to Preserve. Safe here adds the text to a new `safeList` array in the case's `_mapping.json`. Safe everywhere additionally adds it to a global `_settings.json` at the casework root. Detection consults both lists before every review.
- Common salutation words added to the built-in stopword list: Hi, Hello, Hey, Cheers, Best, Thanks, Thank, Warm, Warmest, Also, Please, Attn, FAO. "Hi Kieran" no longer surfaces as a name candidate at all.
- Audit log records the safe-list additions alongside the sanitisation event.
- `_settings.json` file schema is versioned so future settings additions can be handled without breaking existing installations.
