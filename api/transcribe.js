export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { audioBase64, projectNames } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'No audio provided' });
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Build form data for OpenAI
    const boundary = '----FormBoundary' + Date.now();
    const fileName = 'recording.webm';

    const formParts = [];
    // File part
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: audio/webm\r\n\r\n`
    );
    formParts.push(audioBuffer);
    formParts.push('\r\n');
    // Model part
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `gpt-4o-mini-transcribe\r\n`
    );
    // Language part
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `el\r\n`
    );
    formParts.push(`--${boundary}--\r\n`);

    // Combine into single buffer
    const bodyParts = formParts.map(p =>
      typeof p === 'string' ? Buffer.from(p) : p
    );
    const body = Buffer.concat(bodyParts);

    // Step 1: Transcribe
    const transcribeRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: body
    });

    if (!transcribeRes.ok) {
      const errText = await transcribeRes.text();
      console.error('Transcription error:', transcribeRes.status, errText);
      return res.status(502).json({ error: 'Transcription failed', details: errText });
    }

    const transcribeData = await transcribeRes.json();
    const transcript = transcribeData.text;

    if (!transcript || transcript.trim().length === 0) {
      return res.status(200).json({ transcript: '', extracted: null });
    }

    // Step 2: Extract structured data
    const names = (projectNames || []).join(', ');
    const systemPrompt = `You extract structured project data from Greek construction office notes.
Active projects: ${names}

Rules:
- project_name MUST match one from the active projects list (closest match, handle typos)
- If no project matches, set project_name to null
- deadline_date: ISO YYYY-MM-DD or null
- budget_change: number (positive=increase, negative=decrease, 0=none)
- summary: 1-2 sentences in Greek
- action_items: specific tasks in Greek
- people: first names only

Return ONLY valid JSON:
{"project_name":"string or null","people":["string"],"deadline_description":"string or empty","deadline_date":"YYYY-MM-DD or null","budget_change":0,"action_items":["string"],"summary":"Greek summary"}`;

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
          { role: 'system', content: systemPrompt },
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
        console.error('Extract parse error:', e);
      }
    }

    return res.status(200).json({ transcript, extracted });

  } catch (err) {
    console.error('Transcribe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
