export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { text, projectNames, projectAreas } = req.body
  if (!text) return res.status(400).json({ error: 'No text provided' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  const today = new Date().toISOString().split('T')[0]
  const areasContext = projectAreas ? `\nKnown project areas: ${projectAreas.join(', ')}` : ''
  
  const systemPrompt = `You extract structured project data from Greek or English construction office notes.
Active projects: ${(projectNames || []).join(', ')}${areasContext}

TODAY'S DATE: ${today}

Rules:
- project_name MUST match one from the active projects list above (pick the closest match even if there are typos)
- If no project matches, set project_name to null
- deadline_date must be ISO format YYYY-MM-DD or null
- IMPORTANT: When a date is mentioned without a year (e.g. "20 Ιουλίου", "Παρασκευή"), assume the NEXT upcoming occurrence from TODAY'S DATE
- deadline_description must be SPECIFIC and descriptive in Greek
- budget_change is a number (positive = increase, negative = decrease, 0 = no change)
- summary should be 1-2 sentences in Greek describing the update
- NEVER write commentary, apologies, or explanations in summary or title. These
  fields describe what the user said, nothing else. If no project matches, set
  project_name to null and still summarise the content normally — do not write
  a sentence saying nothing matched.
- action_items should be specific actionable tasks in Greek
- people should be first names only

STRUCTURED CLASSIFICATION (NEW):
- category: classify as exactly ONE of: work_update, problem, decision, material, client_request, note
- tags: generate 2-4 tags describing the topic. IMPORTANT: If "Known project areas" are listed above, you MUST use those EXACT area names as tags when the content relates to one of those areas (e.g. if areas include "B1 GF Kitchen" and the text mentions kitchen work, use "B1 GF Kitchen" as a tag, NOT "κουζίνα"). You may add additional descriptive tags in Greek alongside the area tag (e.g. ["B1 GF Kitchen", "υδραυλικά"]). If no area matches, use normalized Greek keywords.
- entry_status: for problems set "open", for decisions set null, for everything else set null
- title: a short Greek title (5-10 words) summarizing the entry
- If the input contains MULTIPLE distinct topics (e.g. a material delivery AND a problem), split into multiple entries in the "entries" array.

Return ONLY valid JSON, no markdown fences, no explanation. Exact format:
{"project_name":"string or null","people":["string"],"deadline_description":"string or empty","deadline_date":"YYYY-MM-DD or null","budget_change":0,"action_items":["string"],"summary":"Greek summary","entries":[{"category":"work_update","title":"short Greek title","text":"Greek description","tags":["tag1","tag2"],"entry_status":null}]}`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ]
      })
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('OpenAI API error:', response.status, errBody)
      return res.status(502).json({ error: 'AI service error', details: response.status })
    }

    const data = await response.json()
    const rawText = data.choices?.[0]?.message?.content || ''

    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const extracted = JSON.parse(cleaned)

    return res.status(200).json({ extracted, usage: data.usage })
  } catch (err) {
    console.error('Extract error:', err)
    return res.status(500).json({ error: 'Extraction failed', message: err.message })
  }
}
