export const config = {
  api: {
    bodyParser: false, // Need raw body for file upload
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    // Read raw body as buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Parse multipart form data manually
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return res.status(400).json({ error: 'No boundary in content-type' });
    }

    const boundary = boundaryMatch[1];
    const parts = parseMultipart(buffer, boundary);

    const audioPart = parts.find(p => p.name === 'audio');
    const projectNamesPart = parts.find(p => p.name === 'projectNames');

    if (!audioPart) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    let projectNames = [];
    if (projectNamesPart) {
      try { projectNames = JSON.parse(projectNamesPart.data.toString()); } catch (e) {}
    }

    // Step 1: Transcribe with OpenAI
    const formData = new FormData();
    const audioBlob = new Blob([audioPart.data], { type: audioPart.contentType || 'audio/webm' });
    formData.append('file', audioBlob, audioPart.filename || 'audio.webm');
    formData.append('model', 'gpt-4o-mini-transcribe');
    formData.append('language', 'el'); // Greek

    const transcribeRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData
    });

    if (!transcribeRes.ok) {
      const errText = await transcribeRes.text();
      console.error('Transcription error:', transcribeRes.status, errText);
      return res.status(502).json({ error: 'Transcription failed', details: transcribeRes.status });
    }

    const transcribeData = await transcribeRes.json();
    const transcript = transcribeData.text;

    if (!transcript || transcript.trim().length === 0) {
      return res.status(200).json({ transcript: '', extracted: null, message: 'No speech detected' });
    }

    // Step 2: Extract structured data from transcript
    const systemPrompt = `You extract structured project data from Greek or English construction office notes.
Active projects: ${projectNames.join(', ')}

Rules:
- project_name MUST match one from the active projects list above (pick the closest match even if there are typos)
- If no project matches, set project_name to null
- deadline_date must be ISO format YYYY-MM-DD or null
- budget_change is a number (positive = increase, negative = decrease, 0 = no change)
- summary should be 1-2 sentences in Greek describing the update
- action_items should be specific actionable tasks in Greek
- people should be first names only

Return ONLY valid JSON, no markdown fences, no explanation. Exact format:
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
      const rawText = extractData.choices?.[0]?.message?.content || '';
      try {
        const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        extracted = JSON.parse(cleaned);
      } catch (e) {
        console.error('Extract parse error:', e);
      }
    }

    return res.status(200).json({ transcript, extracted });

  } catch (err) {
    console.error('Transcribe handler error:', err);
    return res.status(500).json({ error: 'Transcription failed', message: err.message });
  }
}

// Simple multipart parser
function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from('--' + boundary);
  const str = buffer.toString('binary');
  const sections = str.split('--' + boundary);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    if (section.startsWith('--')) break; // End boundary

    const headerEnd = section.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headerStr = section.substring(0, headerEnd);
    const bodyStr = section.substring(headerEnd + 4);
    // Remove trailing \r\n
    const body = bodyStr.endsWith('\r\n') ? bodyStr.slice(0, -2) : bodyStr;

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);

    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: filenameMatch ? filenameMatch[1] : '',
      contentType: ctMatch ? ctMatch[1].trim() : '',
      data: Buffer.from(body, 'binary')
    });
  }
  return parts;
}
