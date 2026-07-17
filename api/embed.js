import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'No OpenAI key' })
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'No Supabase config' })

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Mode 1: Webhook from Supabase (single entry)
  // Mode 2: Batch backfill (all entries without embeddings)
  const { record, backfill } = req.body

  try {
    if (backfill) {
      // Backfill: process all entries without embeddings
      const { data: entries, error } = await supabase
        .from('entries')
        .select('id, title, raw_text, ai_summary, category, tags')
        .is('embedding', null)
        .limit(50)

      if (error) return res.status(500).json({ error: error.message })
      if (!entries || entries.length === 0) return res.json({ message: 'No entries to backfill', count: 0 })

      let count = 0
      for (const entry of entries) {
        const success = await generateAndStore(supabase, entry, apiKey)
        if (success) count++
      }

      return res.json({ message: `Backfilled ${count}/${entries.length} entries`, count })
    }

    // Single entry (webhook or manual)
    const entry = record || req.body
    if (!entry?.id) return res.status(400).json({ error: 'No entry id' })

    const success = await generateAndStore(supabase, entry, apiKey)
    return res.json({ success, id: entry.id })

  } catch (err) {
    console.error('Embedding error:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function generateAndStore(supabase, entry, apiKey) {
  // Build text to embed
  const parts = [
    entry.title || '',
    entry.raw_text || '',
    entry.ai_summary || '',
    entry.category || '',
    ...(entry.tags || [])
  ].filter(Boolean)

  const textToEmbed = parts.join(' ').substring(0, 8000)
  if (!textToEmbed.trim()) return false

  try {
    const embRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: textToEmbed
      })
    })

    if (!embRes.ok) {
      console.error('OpenAI embedding error:', await embRes.text())
      return false
    }

    const embData = await embRes.json()
    const embedding = embData.data?.[0]?.embedding

    if (!embedding) return false

    const { error } = await supabase
      .from('entries')
      .update({ embedding })
      .eq('id', entry.id)

    if (error) {
      console.error('Supabase update error:', error.message)
      return false
    }

    return true
  } catch (err) {
    console.error('Embedding generation failed:', err)
    return false
  }
}
