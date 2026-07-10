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

export const ROOTS = {
  activeRaw: 'Casework',
  activeSan: 'Casework_sanitised',
  closedRaw: 'Casework_closed',
  closedSan: 'Casework_sanitised_closed',
};

export function hasFileSystemAccess() {
  return typeof window !== 'undefined'
    && typeof window.showDirectoryPicker === 'function';
}

/**
 * Prompt the user to pick a root folder and materialise the four mirrors
 * inside it. Returns an object holding the four directory handles plus
 * the top-level root handle for later re-lookup.
 */
export async function pickRoot() {
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
export async function listCases(handles, kind) {
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

export async function readFileText(dirHandle, name) {
  const h = await dirHandle.getFileHandle(name);
  const f = await h.getFile();
  return { text: await f.text(), lastModified: f.lastModified };
}

export async function writeFileText(dirHandle, name, text) {
  const h = await dirHandle.getFileHandle(name, { create: true });
  const w = await h.createWritable();
  await w.write(text);
  await w.close();
}

export async function readJSON(dirHandle, name) {
  try {
    const { text } = await readFileText(dirHandle, name);
    return JSON.parse(text);
  } catch (_e) {
    return null;
  }
}

export async function writeJSON(dirHandle, name, obj) {
  await writeFileText(dirHandle, name, JSON.stringify(obj, null, 2));
}

/**
 * Ensure both raw and sanitised case folders exist for the given case ID.
 * Returns the two directory handles.
 */
export async function ensureCaseFolders(handles, caseId, closed = false) {
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
export async function moveCase(handles, caseId, toClosed) {
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

export async function deleteEntry(dirHandle, name) {
  await dirHandle.removeEntry(name);
}

export async function getFileHandle(dirHandle, name, create = false) {
  return dirHandle.getFileHandle(name, { create });
}
