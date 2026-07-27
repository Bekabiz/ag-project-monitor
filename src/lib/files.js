/**
 * Supabase Storage object keys accept a restricted character set. A file named
 * "!TE 4202 (2).pdf" is rejected outright with "Invalid key", which surfaced as
 * a failed upload with no obvious cause.
 *
 * These helpers build a safe key while the original filename is kept separately
 * in file_name, so the user still sees what they uploaded.
 */

/** Extension only, lowercased, letters and digits — or empty if there isn't one. */
export function safeExtension(name) {
  const str = String(name || '')
  const dot = str.lastIndexOf('.')
  // No dot, or a leading dot like ".gitignore", means there is no extension.
  if (dot < 1) return ''
  const ext = str.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext && ext.length <= 8 ? ext : ''
}

/**
 * A storage-safe filename that still resembles the original.
 * Greek and other non-Latin characters are stripped rather than transliterated —
 * the readable name lives in file_name, this only has to be valid and unique.
 */
export function safeFileName(name, { prefix = '' } = {}) {
  const original = String(name || '')
  const ext = safeExtension(original)
  const stem = ext ? original.slice(0, original.length - ext.length - 1) : original

  let base = stem
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // drop accents
    .replace(/[^a-zA-Z0-9._-]+/g, '-') // anything else becomes a hyphen
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)

  if (!base) base = 'file'

  const stamp = Date.now()
  const head = prefix ? `${prefix}_` : ''
  return ext ? `${head}${stamp}_${base}.${ext}` : `${head}${stamp}_${base}`
}
