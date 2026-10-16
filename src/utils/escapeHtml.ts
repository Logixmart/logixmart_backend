/**
 * Escape untrusted values before interpolating them into HTML email bodies.
 * Returns an empty string for null/undefined so optional fields stay clean.
 */
export function escapeHtml(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** True for http/https URLs; used before linking in emails. */
export function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}
