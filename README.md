# Casework Sanitisation Tool

A single-user, browser-based tool that pseudonymises housing casework material before the user pastes sanitised text into an external AI service, and rehydrates the AI's output back to real identifiers before it reaches client-facing systems.

The tool runs entirely locally in a modern Chromium browser tab. No case data is transmitted anywhere. The only inbound network call in future phases is an optional one-time named-entity model download.

This build implements the phase 1 scope described in the design spec: filesystem-backed cases, regex sanitisation with a review step, deterministic role tokens, sanitised header block, bidirectional integrity check on rehydration, and case open, close, and reopen lifecycle.

## Open the tool

Double-click `index.html`. It opens in Chrome, Edge, or Opera. Other browsers do not expose the File System Access API. There is no server, no build step, and no dependencies to install.

If the page shows a red banner saying the tool did not start, one of two things is likely: `js/app.js` was not copied across into the same folder as `index.html`, or the browser is out of date. Press F12 to open the developer tools; the Console tab shows the exact error.

## First run

1. Click **Open casework folder**. Pick an empty folder anywhere on your machine that you are happy to use as the casework root. The tool will create `Casework`, `Casework_sanitised`, `Casework_closed`, and `Casework_sanitised_closed` subfolders inside it. Existing folders with those names are reused.
2. Click **New case** and enter the Shelter R-number or action number.
3. Drag one or more files onto the case row in the sidebar to add them to the case.
4. Click a file to open it. The Original tab shows the raw text; the Sanitised tab shows the tokenised copy once you sanitise it.

## Sanitise a document

With a file open, click **Sanitise this file**. The review dialog lists every detected identifier along with a suggested action. Address lines and possible names start unresolved and must be given a decision. You can change any suggestion, add a custom role, or preserve an item as-is.

When you click **Save sanitised file**:

- The mapping records every new identifier so subsequent files in the case use the same tokens.
- A header block is prepended to the sanitised output, warning that the file must be rehydrated before reaching client-facing systems.
- The tool refuses to save if the proposed output still contains any real identifier from the case's mapping.

## Send to an AI service

Open the Sanitised tab and click **Copy sanitised**. The full sanitised file, header included, is placed on the clipboard. Paste into your AI service of choice.

## Rehydrate a response

Copy the AI's reply, return to the tool with the same case selected, and click **Paste rehydrate**. The tool performs two passes:

- A reverse check that scans the pasted text for real identifiers from the case mapping. Anything found is presented before rehydration continues. Options are Abort, View both texts, or Auto-replace and copy.
- A forward pass that swaps tokens back to real names and copies the result to the clipboard.

If the reverse check is clean, the rehydrated text is copied straight to the clipboard. Paste into Outlook or the CRM.

## Case lifecycle

Every case row exposes **Close case** (open cases) or **Reopen** (closed cases). Closure records the reason and any note in `_closure.json` inside the case folder and moves the raw and sanitised folders to `_closed` mirrors. Reopens within seven days are treated as soft reopens and the closure event is removed. Reopens after that record a substantive reopen event with reason and note.

## On-disk layout

```
<root>/
  Casework/
    R-XXXXXX/
      _mapping.json       Case's persistent token allocations
      _closure.json       Lifecycle events (created, closed, reopened)
      _audit.log          Human-readable audit trail
      <raw files as-is>
  Casework_sanitised/
    R-XXXXXX/
      <sanitised files, each carrying a visible header block>
  Casework_closed/          Same layout as Casework/ but for closed cases
  Casework_sanitised_closed/  Same layout as Casework_sanitised/ but for closed cases
```

Everything is plain JSON, plain text, and plain filenames. There is no database. You can inspect, back up, move, or supersede the data without the tool.

## Test data

The `test-data/` folder contains fictitious cases with a mix of British and non-British names, NHS and BRP numbers, tenancy references, and a verbatim referral narrative. Use them to explore the tool without touching real casework.

## Data protection posture

The tool is a pseudonymisation mechanism as defined in Article 4(5) UK GDPR. Sanitised output cannot identify a data subject without the mapping file, which stays on the adviser's machine. The tool assists; every material decision, and every audit entry, is the adviser's.

## What is not yet built

Phase 1 stops here. Phase 2 will add Outlook `.msg` and `.eml` drag-drop, NER model detection for names, passive cross-case conflict banner, and verbatim block byte-match verification. Phase 3 will add full-text search, mapping edit propagation, and audit log surfacing. See `CHANGES.md` for the record of what has been built.
