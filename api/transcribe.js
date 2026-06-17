import OpenAI, { toFile } from 'openai';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const openai = new OpenAI({ apiKey });
  let tmpPath = null;

  try {
    const { audioBase64, mimeType, projectNames } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'No audio' });

    // Write to temp file to preserve binary integrity
    const ext = (mimeType || '').includes('mp4') ? 'mp4' : 'webm';
    tmpPath = join(tmpdir(), `voice_${Date.now()}.${ext}`);
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    writeFileSync(tmpPath, audioBuffer);

    // Use OpenAI's toFile to create proper file from buffer
    const file = await toFile(readFileSync(tmpPath), `recording.${ext}`, {
      type: mimeType || 'audio/webm',
    });

    // Step 1: Transcribe Greek audio
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'gpt-4o-mini-transcribe',
      language: 'el',
    });

    const transcript = transcription.text;

    if (!transcript || transcript.trim().length === 0) {
      return res.status(200).json({ transcript: '', extracted: null });
    }

    // Step 2: Extract structured data
    const names = (projectNames || []).join(', ');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        { role: 'system', content: `You extract structured project data from Greek construction office notes.
Active projects: ${names}

Rules:
- project_name MUST match one from active projects list (closest match)
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
    } catch (e) {
      console.error('Parse error:', e);
    }

    return res.status(200).json({ transcript, extracted });

  } catch (err) {
    console.error('Transcribe error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    // Clean up temp file
    if (tmpPath) try { unlinkSync(tmpPath); } catch (e) {}
  }
}
