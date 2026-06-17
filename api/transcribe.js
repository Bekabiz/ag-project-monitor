export const config = {
  maxDuration: 30, // seconds - transcription can take time
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { audioBase64, projectNames } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'No audio provided' });

    // Convert base64 to buffer then to File
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const file = new File([audioBuffer], 'recording.webm', { type: 'audio/webm' });

    // Use native FormData
    const form = new FormData();
    form.append('file', file);
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('language', 'el');

    // Step 1: Transcribe
    const transcribeRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form
    });

    if (!transcribeRes.ok) {
      const errText = await transcribeRes.text();
      console.error('Transcription error:', transcribeRes.status, errText);
      return res.status(502).json({ error: 'Transcription failed', status: transcribeRes.status, details: errText });
    }

    const transcribeData = await transcribeRes.json();
    const transcript = transcribeData.text;

    if (!transcript || transcript.trim().length === 0) {
      return res.status(200).json({ transcript: '', extracted: null });
    }

    // Step 2: Extract structured data
    const names = (projectNames || []).join(', ');
    const extractRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          { role: 'system', content: `You extract structured project data from Greek construction office notes.
Active projects: ${names}

Rules:
- project_name MUST match one from the active projects list (closest match)
- If no project matches, set project_name to null
- deadline_date: ISO YYYY-MM-DD or null
- budget_change: number (positive=increase, negative=decrease, 0=none)
- summary: 1-2 sentences in Greek
- action_items: specific tasks in Greek
- people: first names only

Return ONLY valid JSON:
{"project_name":"string or null","people":["string"],"deadline_description":"string or empty","deadline_date":"YYYY-MM-DD or null","budget_change":0,"action_items":["string"],"summary":"Greek summary"}` },
          { role: 'user', content: transcript }
        ]
      })
    });

    let extracted = null;
    if (extractRes.ok) {
      const extractData = await extractRes.json();
      const raw = extractData.choices?.[0]?.message?.content || '';
      try {
        extracted = JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
      } catch (e) {
        console.error('Parse error:', e);
      }
    }

    return res.status(200).json({ transcript, extracted });

  } catch (err) {
    console.error('Transcribe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
