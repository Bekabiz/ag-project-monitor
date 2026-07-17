// Vercel Cron Job - runs daily at 8am Athens time
// Checks for overdue deadlines, generates AI alerts in Greek
// Add to vercel.json: { "crons": [{ "path": "/api/cron-deadlines", "schedule": "0 6 * * *" }] }

export default async function handler(req, res) {
  // Secure the cron endpoint
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase config missing' })
  }

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  }

  try {
    const today = new Date().toISOString().split('T')[0]

    // 1. Find all pending deadlines that are now overdue
    const dlRes = await fetch(
      `${supabaseUrl}/rest/v1/deadlines?status=eq.pending&due_date=lt.${today}&select=*,projects(id,name)`,
      { headers }
    )
    const overdueDeadlines = await dlRes.json()

    let alertsCreated = 0

    for (const deadline of overdueDeadlines) {
      // Mark as overdue
      await fetch(
        `${supabaseUrl}/rest/v1/deadlines?id=eq.${deadline.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'overdue' })
        }
      )

      // Generate AI alert summary in Greek (if OpenAI key available)
      let alertSummary = `Η προθεσμία "${deadline.description}" έχει παρέλθει.`

      if (openaiKey) {
        try {
          const daysOverdue = Math.floor(
            (new Date() - new Date(deadline.due_date)) / 86400000
          )

          const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              max_tokens: 150,
              messages: [
                {
                  role: 'system',
                  content: 'You write short urgent alerts in Greek for a civil engineering office. 1-2 sentences max. Direct and clear.'
                },
                {
                  role: 'user',
                  content: `Project: ${deadline.projects?.name}\nOverdue task: ${deadline.description}\nDays overdue: ${daysOverdue}\n\nWrite a short alert in Greek.`
                }
              ]
            })
          })

          if (aiRes.ok) {
            const aiData = await aiRes.json()
            alertSummary = aiData.choices?.[0]?.message?.content?.trim() || alertSummary
          }
        } catch (aiErr) {
          console.error('AI alert error:', aiErr)
          // Keep default message, don't fail
        }
      }

      // Save alert summary back to deadline
      await fetch(
        `${supabaseUrl}/rest/v1/deadlines?id=eq.${deadline.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ alert_summary: alertSummary })
        }
      )

      alertsCreated++
    }

    // 2. Flag projects with no activity for 7+ days (set status to yellow)
    const projectsRes = await fetch(
      `${supabaseUrl}/rest/v1/projects?status=eq.active&select=id,name`,
      { headers }
    )
    const projects = await projectsRes.json()

    let inactiveCount = 0
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    for (const project of projects) {
      const entryRes = await fetch(
        `${supabaseUrl}/rest/v1/entries?project_id=eq.${project.id}&created_at=gte.${sevenDaysAgo}&select=id&limit=1`,
        { headers }
      )
      const recentEntries = await entryRes.json()

      // If no entries in last 7 days, the project card will show yellow
      // (status dot logic is already in ProjectsTab.jsx — nothing to update)
      if (recentEntries.length === 0) inactiveCount++
    }

    // 3. Auto-generate embeddings for entries that don't have one yet
    let embeddingsCreated = 0
    if (openaiKey) {
      try {
        const noEmbRes = await fetch(
          `${supabaseUrl}/rest/v1/entries?embedding=is.null&select=id,title,raw_text,ai_summary,category,tags&limit=50`,
          { headers }
        )
        const noEmbEntries = await noEmbRes.json()

        for (const entry of noEmbEntries) {
          const parts = [entry.title, entry.raw_text, entry.ai_summary, entry.category, ...(entry.tags || [])].filter(Boolean)
          const textToEmbed = parts.join(' ').substring(0, 8000)
          if (!textToEmbed.trim()) continue

          const embRes = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
            body: JSON.stringify({ model: 'text-embedding-3-small', input: textToEmbed })
          })
          if (!embRes.ok) continue
          const embData = await embRes.json()
          const embedding = embData.data?.[0]?.embedding
          if (!embedding) continue

          await fetch(`${supabaseUrl}/rest/v1/entries?id=eq.${entry.id}`, {
            method: 'PATCH', headers,
            body: JSON.stringify({ embedding })
          })
          embeddingsCreated++
        }
      } catch (embErr) {
        console.error('Embedding backfill error:', embErr)
      }
    }

    console.log(`Cron complete: ${alertsCreated} overdue deadlines flagged, ${inactiveCount} inactive projects, ${embeddingsCreated} embeddings created`)

    return res.status(200).json({
      success: true,
      overdue_flagged: alertsCreated,
      inactive_projects: inactiveCount,
      embeddings_created: embeddingsCreated,
      ran_at: new Date().toISOString()
    })

  } catch (err) {
    console.error('Cron error:', err)
    return res.status(500).json({ error: err.message })
  }
}
