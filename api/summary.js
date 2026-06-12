export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { entries, projectName, scope } = req.body
  if (!entries || !entries.length) return res.status(400).json({ error: 'No entries provided' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  const recent = entries.slice(0, 15).map(e =>
    `[${e.created_at?.split('T')[0]}] ${e.entry_type}: ${e.ai_summary || e.raw_text || e.file_name || ''}`
  ).join('\n')

  const systemPrompt = scope === 'overall'
    ? `You summarize the overall status of a construction office's projects in Greek. Be concise: 4-5 sentences max. Highlight which projects need attention, any overdue deadlines, budget concerns, and recent activity patterns. Write naturally as if briefing the office owner.`
    : `You summarize a single construction project's status in Greek. Be concise: 3-4 sentences max. Mention recent activity, any deadlines or delays, budget changes, and what needs attention next. Write naturally.`

  const userMsg = scope === 'overall'
    ? `Τελευταίες ενημερώσεις από όλα τα έργα:\n${recent}\n\nΓράψε συνολική σύνοψη στα ελληνικά.`
    : `Έργο: ${projectName}\nΤελευταίες ενημερώσεις:\n${recent}\n\nΓράψε σύνοψη στα ελληνικά.`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 512,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg }
        ]
      })
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('OpenAI API error:', response.status, errBody)
      return res.status(502).json({ error: 'AI service error' })
    }

    const data = await response.json()
    const summaryText = data.choices?.[0]?.message?.content || ''

    return res.status(200).json({ summary: summaryText.trim(), usage: data.usage })
  } catch (err) {
    console.error('Summary error:', err)
    return res.status(500).json({ error: 'Summary failed', message: err.message })
  }
}
