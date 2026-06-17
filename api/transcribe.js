import OpenAI, { toFile } from 'openai';

export const config = {
  maxDuration: 30,
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const openai = new OpenAI({ apiKey });

  try {
    // Read raw binary body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length < 100) {
      return res.status(400).json({ error: 'Audio too small or empty' });
    }

    // Get metadata from headers
    const mimeType = req.headers['x-audio-type'] || 'audio/webm';
    const projectNames = req.headers['x-project-names'] ? JSON.parse(req.headers['x-project-names']) : [];
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';

    console.log(`Audio received: ${audioBuffer.length} bytes, type: ${mimeType}`);

    // Use OpenAI toFile with raw buffer
    const file = await toFile(audioBuffer, `recording.${ext}`, { type: mimeType });

    // Step 1: Transcribe
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'gpt-4o-mini-transcribe',
      language: 'el',
    });

    const transcript = transcription.text;
    console.log(`Transcript: ${transcript}`);

    if (!transcript || transcript.trim().length === 0) {
      return res.status(200).json({ transcript: '', extracted: null });
    }

    // Step 2: Extract
    const names = projectNames.join(', ');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        { role: 'system', content: `You extract structured project data from Greek construction office notes.
Active projects: ${names}
Rules:
- project_name MUST match one from active projects (closest match)
- deadline_date: ISO YYYY-MM-DD or null
- budget_change: number (positive=increase, negative=decrease, 0=none)
- summary: 1-2 sentences in Greek
- action_items: specific tasks in Greek
- people: first names only
Return ONLY valid JSON:
{"project_name":"string or null","people":["string"],"deadline_description":"string or empty","deadline_date":"YYYY-MM-DD or null","budget_change":0,"action_items":["string"],"summary":"Greek summary"}` },
        { role: 'user', content: transcript }
      ]
    });

    let extracted = null;
    const raw = completion.choices?.[0]?.message?.content || '';
    try {
      extracted = JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
    } catch (e) {}

    return res.status(200).json({ transcript, extracted });

  } catch (err) {
    console.error('Transcribe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
