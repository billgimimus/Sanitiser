# Test data

Fictitious files for exercising the tool. No real client information is present. Names are invented; identifiers are invented but plausible.

Use them by:

1. Opening the tool and pointing it at a fresh empty folder as the casework root.
2. Creating a case with a matching ID (for example, `R-DEMO-01`).
3. Dragging one of the folders below onto the case row in the sidebar, or manually copying the files into `Casework/R-DEMO-01/` on disk.
4. Selecting each file and sanitising it.

Files are grouped by scenario. Names include British, Polish, Somali, Ukrainian, Bengali, Arabic, and Roma origins so the review step can be exercised across NER blind spots.

## Scenarios

- `possession/` a straightforward Section 21 possession letter and reply thread.
- `homelessness/` a household of four applying under Part 7. Contains multiple names, benefits references, NHS numbers, and a BRP number.
- `verbatim/` a referral form narrative meant to be reproduced verbatim by the CRM.
- `conflict/` a follow-up referral that shares the tenant address with the possession case, used to demonstrate the passive conflict banner in phase 2.
