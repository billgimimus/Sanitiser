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
