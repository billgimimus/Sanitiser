/**
 * Per-case plain-text audit log.
 *
 * Kept as simple appended lines with ISO date prefixes so the adviser can
 * open the file in any editor and read the history without tooling.
 *
 * Public surface: appendAudit.
 */

const AUDIT_FILENAME = '_audit.log';

export async function appendAudit(rawHandle, line) {
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
