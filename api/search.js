import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { query, projectId, category, person, dateFrom, dateTo, limit = 20 } = req.body
  if (!query) return res.status(400).json({ error: 'No query provided' })

  const apiKey = process.env.OPENAI_API_KEY

  try {
    let results = []

    // Layer 1: Tag and text search using ilike
    let tagQuery = supabase
      .from('entries')
      .select('*, projects:project_id(name)')
      .order('created_at', { ascending: false })
      .limit(limit)

    // Apply filters
    if (projectId) tagQuery = tagQuery.eq('project_id', projectId)
    if (category) tagQuery = tagQuery.eq('category', category)
    if (dateFrom) tagQuery = tagQuery.gte('created_at', dateFrom)
    if (dateTo) tagQuery = tagQuery.lte('created_at', dateTo)

    // Search in text fields and tags
    const searchTerms = query.split(/\s+/).filter(t => t.length > 1)
    const orConditions = searchTerms.map(term => 
      `raw_text.ilike.%${term}%,ai_summary.ilike.%${term}%,title.ilike.%${term}%`
    ).join(',')
    
    if (orConditions) {
      tagQuery = tagQuery.or(orConditions)
    }

    if (person) {
      tagQuery = tagQuery.ilike('submitter_name', `%${person}%`)
    }

    const { data: tagResults, error: tagErr } = await tagQuery
    if (tagErr) console.error('Tag search error:', tagErr.message)
    results = tagResults || []

    // Also search entries with matching tags
    if (searchTerms.length > 0) {
      const { data: taggedResults } = await supabase
        .from('entries')
        .select('*, projects:project_id(name)')
        .overlaps('tags', searchTerms)
        .order('created_at', { ascending: false })
        .limit(limit)
      
      if (taggedResults) {
        const existingIds = new Set(results.map(r => r.id))
        taggedResults.forEach(r => {
          if (!existingIds.has(r.id)) results.push(r)
        })
      }
    }

    // Layer 2: Semantic search with embeddings (if available)
    if (apiKey && results.length < limit) {
      try {
        const embRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: query
          })
        })

        if (embRes.ok) {
          const embData = await embRes.json()
          const queryEmbedding = embData.data?.[0]?.embedding

          if (queryEmbedding) {
            const { data: semanticResults } = await supabase.rpc('search_entries', {
              query_embedding: queryEmbedding,
              match_threshold: 0.3,
              match_count: limit,
              filter_project_id: projectId || null
            })

            if (semanticResults) {
              const existingIds = new Set(results.map(r => r.id))
              semanticResults.forEach(r => {
                if (!existingIds.has(r.id)) {
                  results.push({ ...r, semantic_match: true })
                }
              })
            }
          }
        }
      } catch (embErr) {
        console.log('Semantic search skipped:', embErr.message)
      }
    }

    // Sort: exact tag matches first, then by date
    results.sort((a, b) => {
      if (a.semantic_match && !b.semantic_match) return 1
      if (!a.semantic_match && b.semantic_match) return -1
      return new Date(b.created_at) - new Date(a.created_at)
    })

    return res.status(200).json({ results: results.slice(0, limit) })
  } catch (err) {
    console.error('Search error:', err)
    return res.status(500).json({ error: 'Search failed', message: err.message })
  }
}
