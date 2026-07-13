import OpenAI, { toFile } from 'openai';

export const config = {
  maxDuration: 30,
};

/**
 * /api/transcribe — Whisper transcription ONLY.
 * One job: audio → text. No GPT extraction here.
 * All structured extraction goes through /api/extract (one brain, two input modes).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const openai = new OpenAI({ apiKey });

  try {
    const { fileUrl } = req.body;
    if (!fileUrl) return res.status(400).json({ error: 'No file URL' });

    // Download audio from Supabase storage URL
    const audioRes = await fetch(fileUrl);
    if (!audioRes.ok) {
      return res.status(400).json({ error: 'Could not download audio' });
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    // Detect format from URL extension
    const isM4a = fileUrl.includes('.m4a') || fileUrl.includes('.mp4')
    const fileName = isM4a ? 'recording.m4a' : 'recording.webm'
    const fileType = isM4a ? 'audio/mp4' : 'audio/webm'

    const file = await toFile(audioBuffer, fileName, { type: fileType });

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'el',
    });

    const transcript = transcription.text;

    if (!transcript || transcript.trim().length === 0) {
      return res.status(200).json({ transcript: '' });
    }

    return res.status(200).json({ transcript });

  } catch (err) {
    console.error('Transcribe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
