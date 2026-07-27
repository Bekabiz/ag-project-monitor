#!/usr/bin/env node
/**
 * AG Project Monitor — database migration.
 *
 * Copies all public-schema data and storage files from one Supabase project
 * to another, preserving every UUID so foreign keys stay intact, and rewrites
 * storage URLs to point at the target project.
 *
 * Auth users are NOT handled here — password hashes don't survive an API copy.
 * Run the SQL block in docs/MIGRATION.md first, so profiles have rows to
 * reference. See that file for the full runbook.
 *
 * Usage:
 *   SOURCE_URL=https://oldref.supabase.co \
 *   SOURCE_KEY=<old service_role key> \
 *   TARGET_URL=https://newref.supabase.co \
 *   TARGET_KEY=<new service_role key> \
 *   node scripts/migrate.mjs [--dry-run] [--skip-storage]
 */

import { createClient } from '@supabase/supabase-js'

const { SOURCE_URL, SOURCE_KEY, TARGET_URL, TARGET_KEY } = process.env
const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_STORAGE = process.argv.includes('--skip-storage')

for (const [k, v] of Object.entries({ SOURCE_URL, SOURCE_KEY, TARGET_URL, TARGET_KEY })) {
  if (!v) {
    console.error(`Missing env var: ${k}`)
    process.exit(1)
  }
}

const source = createClient(SOURCE_URL, SOURCE_KEY, { auth: { persistSession: false } })
const target = createClient(TARGET_URL, TARGET_KEY, { auth: { persistSession: false } })

const sourceRef = new URL(SOURCE_URL).hostname.split('.')[0]
const targetRef = new URL(TARGET_URL).hostname.split('.')[0]

// Order matters: parents before children, or foreign keys reject the rows.
const TABLES = [
  'projects',
  'profiles',
  'project_access',
  'entries',
  'steps',
  'step_notes',
  'project_areas',
  'deadlines',
  'announcements',
  'general_updates',
  'manager_plans',
  'ai_summaries',
]

// Columns holding storage URLs that contain the project ref.
const URL_COLUMNS = {
  entries: ['file_url'],
  steps: ['file_url'],
  general_updates: ['file_url'],
  announcements: ['voice_url'],
}

// Regenerated on the target, never copied.
const SKIP_COLUMNS = {
  entries: ['embedding'],
}

const BUCKET = 'files'
const PAGE = 500

function rewrite(value) {
  return typeof value === 'string' && value.includes(sourceRef)
    ? value.replaceAll(sourceRef, targetRef)
    : value
}

function prepare(table, row) {
  const out = { ...row }
  for (const col of SKIP_COLUMNS[table] || []) delete out[col]
  for (const col of URL_COLUMNS[table] || []) {
    if (out[col]) out[col] = rewrite(out[col])
  }
  return out
}

async function copyTable(table) {
  let from = 0
  let copied = 0

  for (;;) {
    const { data, error } = await source
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1)

    if (error) {
      if (error.code === '42P01') {
        console.log(`  ${table.padEnd(18)} — not present in source, skipped`)
        return { table, copied: 0, skipped: true }
      }
      throw new Error(`read ${table}: ${error.message}`)
    }
    if (!data.length) break

    const rows = data.map(r => prepare(table, r))

    if (!DRY_RUN) {
      const { error: writeErr } = await target
        .from(table)
        .upsert(rows, { onConflict: 'id' })
      if (writeErr) throw new Error(`write ${table}: ${writeErr.message}`)
    }

    copied += rows.length
    from += PAGE
    if (data.length < PAGE) break
  }

  console.log(`  ${table.padEnd(18)} ${copied} rows${DRY_RUN ? ' (dry run)' : ''}`)
  return { table, copied }
}

async function listFiles(prefix = '') {
  const found = []
  const { data, error } = await source.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw new Error(`list ${prefix || '/'}: ${error.message}`)

  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name
    // Folders come back without metadata.
    if (item.id === null || !item.metadata) {
      found.push(...(await listFiles(path)))
    } else {
      found.push(path)
    }
  }
  return found
}

async function copyStorage() {
  console.log('\nStorage')
  let paths
  try {
    paths = await listFiles()
  } catch (err) {
    console.log(`  could not list bucket "${BUCKET}": ${err.message}`)
    return { copied: 0, failed: 0 }
  }

  console.log(`  ${paths.length} files found`)
  if (DRY_RUN) return { copied: 0, failed: 0 }

  let copied = 0
  let failed = 0

  for (const path of paths) {
    try {
      const { data: blob, error: dlErr } = await source.storage.from(BUCKET).download(path)
      if (dlErr) throw dlErr

      const { error: upErr } = await target.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: blob.type || undefined })
      if (upErr) throw upErr

      copied++
      if (copied % 25 === 0) console.log(`  ${copied}/${paths.length}`)
    } catch (err) {
      failed++
      console.log(`  FAILED ${path}: ${err.message}`)
    }
  }

  console.log(`  ${copied} copied, ${failed} failed`)
  return { copied, failed }
}

async function verify() {
  console.log('\nVerification (source → target)')
  let mismatches = 0

  for (const table of TABLES) {
    const [srcRes, tgtRes] = await Promise.all([
      source.from(table).select('*', { count: 'exact', head: true }),
      target.from(table).select('*', { count: 'exact', head: true }),
    ])

    // A rejected key or missing table must fail loudly, not look like "0 rows".
    for (const [side, res] of [['source', srcRes], ['target', tgtRes]]) {
      if (res.error && res.error.code !== '42P01') {
        console.log(`  FAIL ${table.padEnd(18)} ${side}: ${res.error.message}`)
        mismatches++
      }
    }
    if (srcRes.error || tgtRes.error) continue

    const src = srcRes.count
    const tgt = tgtRes.count
    if (src === null && tgt === null) continue

    const ok = src === tgt
    if (!ok) mismatches++
    console.log(`  ${ok ? 'ok  ' : 'DIFF'} ${table.padEnd(18)} ${src ?? '-'} → ${tgt ?? '-'}`)
  }

  const staleRes = await target
    .from('entries')
    .select('*', { count: 'exact', head: true })
    .like('file_url', `%${sourceRef}%`)

  if (staleRes.error) {
    console.log(`  FAIL ${'stale urls'.padEnd(18)} ${staleRes.error.message}`)
    mismatches++
  } else {
    const stale = staleRes.count ?? 0
    console.log(`  ${stale ? 'DIFF' : 'ok  '} ${'stale urls'.padEnd(18)} ${stale}`)
    if (stale) mismatches++
  }

  return mismatches
}

async function preflight() {
  for (const [label, client, url] of [['SOURCE', source, SOURCE_URL], ['TARGET', target, TARGET_URL]]) {
    const { error } = await client.from('projects').select('id', { count: 'exact', head: true })
    if (error) {
      console.error(`${label} unreachable (${url})`)
      console.error(`  ${error.message}`)
      console.error(`  Check the key matches this project ref and is the service_role key.`)
      process.exit(1)
    }
  }
}

async function main() {
  console.log(`AG Project Monitor migration`)
  console.log(`  ${sourceRef} → ${targetRef}${DRY_RUN ? '  [DRY RUN]' : ''}\n`)

  await preflight()
  console.log('Tables')

  for (const table of TABLES) await copyTable(table)

  if (!SKIP_STORAGE) await copyStorage()
  else console.log('\nStorage skipped (--skip-storage)')

  const mismatches = await verify()

  if (mismatches) {
    console.log(`\n${mismatches} mismatch(es) — investigate before switching env vars.`)
    process.exit(1)
  }

  console.log('\nComplete. Next: update env vars, then re-run the embedding backfill.')
}

main().catch(err => {
  console.error(`\nFailed: ${err.message}`)
  process.exit(1)
})
