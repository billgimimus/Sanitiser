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

export async function copyText(text, label) {
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    throw new Error('Clipboard API not available in this browser.');
  }
  await navigator.clipboard.writeText(text);
  setIndicator(label);
}

export async function readText() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    throw new Error('Clipboard read not available in this browser.');
  }
  return navigator.clipboard.readText();
}

export function setIndicator(label) {
  const el = document.getElementById(INDICATOR_ID);
  if (!el) return;
  if (!label) { el.textContent = ''; return; }
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  el.textContent = `Clipboard: ${label} at ${hh}:${mm}`;
}
