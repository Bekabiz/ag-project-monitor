export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { text, fileUrl } = req.body
  if (!text && !fileUrl) return res.status(400).json({ error: 'No text or file provided' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  const systemPrompt = `You are an expert at reading Greek construction Technical Descriptions (Τεχνική Περιγραφή) and architectural studies (Αρχιτεκτονική Μελέτη).

Extract the complete building structure from this document. Return a JSON object with:

1. building_type: detect the type from context. One of: house, apartment_building, cafe, hotel, office, warehouse, commercial, mixed_use, other
2. building_type_confidence: 0-100 how confident you are
3. project_info: basic project details (title, location, owner, total_sqm, building_count, max_height)
4. buildings: array of buildings, each with floors and rooms
5. systems: mechanical/electrical systems mentioned (plumbing, electrical, heating, insulation, ventilation, etc.)
6. exterior: outdoor areas (parking, garden, pool, paths, etc.)
7. materials: key construction materials mentioned
8. construction_phases: main phases of work described

For each room include: name, sqm if mentioned, floor.
For each system include: name, type, description.

Return ONLY valid JSON. No markdown fences. Exact format:
{
  "building_type": "house",
  "building_type_confidence": 95,
  "project_info": {
    "title": "string",
    "location": "string",
    "owner": "string or null",
    "total_sqm": number,
    "building_count": number,
    "max_height": "string or null"
  },
  "buildings": [
    {
      "name": "Building 1",
      "sqm": number,
      "floors": [
        {
          "name": "Ground floor",
          "rooms": [
            {"name": "Kitchen", "sqm": number or null},
            {"name": "Bathroom 1", "sqm": number or null}
          ]
        }
      ]
    }
  ],
  "systems": [
    {"name": "Plumbing", "description": "short description"},
    {"name": "Electrical", "description": "short description"},
    {"name": "Heating", "description": "short description"}
  ],
  "exterior": [
    {"name": "Swimming pool", "details": "31.85 sqm, 1.5m deep"},
    {"name": "Parking", "details": "wooden pergola"}
  ],
  "materials": ["natural stone masonry", "concrete C30/37", "aluminum windows RAL 9005"],
  "construction_phases": ["Foundation excavation", "Stone masonry walls", "Roof construction", "Installations", "Exterior landscaping"]
}`

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text || 'Parse the uploaded document.' }
    ]

    // If fileUrl is provided (image/PDF), use vision
    if (fileUrl && !text) {
      messages[1] = {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: fileUrl } },
          { type: 'text', text: 'Parse this Technical Description document and extract the building structure.' }
        ]
      }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 4000,
        messages
      })
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('OpenAI API error:', response.status, errBody)
      return res.status(502).json({ error: 'AI service error' })
    }

    const data = await response.json()
    const rawText = data.choices?.[0]?.message?.content || ''
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const structure = JSON.parse(cleaned)

    return res.status(200).json({ structure, usage: data.usage })
  } catch (err) {
    console.error('Parse error:', err)
    return res.status(500).json({ error: 'Parsing failed', message: err.message })
  }
}
