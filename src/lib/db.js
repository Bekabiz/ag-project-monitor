import { supabase } from './supabase'

/**
 * Safe database wrapper. Supabase JS client NEVER throws on DB errors —
 * it returns { data, error }. This wrapper throws on error so callers
 * can use try/catch and the UI can show real failure messages.
 *
 * Usage:
 *   await db(supabase.from('steps').insert(payload))
 *   // throws Error if insert fails
 */
export async function db(query) {
  const result = await query
  if (result.error) {
    console.error('[DB Error]', result.error.message, result.error.details)
    throw new Error(result.error.message || 'Database operation failed')
  }
  return result.data
}

/**
 * Safe database write with specific error prefix for user-facing messages.
 */
export async function dbWrite(query, context = '') {
  const result = await query
  if (result.error) {
    const prefix = context ? `${context}: ` : ''
    console.error(`[DB Error] ${prefix}${result.error.message}`, result.error)
    throw new Error(`${prefix}${result.error.message}`)
  }
  return result.data
}

export { supabase }
