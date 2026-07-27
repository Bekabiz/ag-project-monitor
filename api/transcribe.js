import OpenAI, { toFile } from 'openai';

export const config = {
  maxDuration: 30,
};

/**
 * /api/transcribe — Whisper transcription ONLY.
 * One job: audio → text. No GPT extraction here.
 * All structured extraction goes through /api/extract (one brain, two input modes).
 */
/**
 * Whisper mishears proper nouns badly — "Κατάκολο" came back as "Kakatkolo".
 * Its `prompt` parameter biases decoding toward supplied vocabulary, so we feed
 * it the office's real project names, locations and staff names.
 *
 * Cached in module scope: Vercel reuses warm instances, so this is usually
 * zero extra latency.
 */
let vocabCache = { value: '', at: 0 };
const VOCAB_TTL = 10 * 60 * 1000; // 10 minutes

async function getVocabulary() {
  if (vocabCache.value && Date.now() - vocabCache.at < VOCAB_TTL) {
    return vocabCache.value;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return '';

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const [projRes, profRes] = await Promise.all([
      fetch(`${url}/rest/v1/projects?status=eq.active&select=name,location`, { headers }),
      fetch(`${url}/rest/v1/profiles?select=full_name`, { headers }),
    ]);

    const projects = projRes.ok ? await projRes.json() : [];
    const profiles = profRes.ok ? await profRes.json() : [];

    const terms = [
      ...projects.flatMap(p => [p.name, p.location]),
      ...profiles.map(p => p.full_name),
    ].filter(Boolean);

    // Whisper's prompt works best as natural text, not a bare list.
    const value = terms.length
      ? `Τεχνικό γραφείο Αδαμόπουλος. Έργα και τοποθεσίες: ${[...new Set(terms)].join(', ')}.`
      : '';

    vocabCache = { value, at: Date.now() };
    return value;
  } catch {
    return '';
  }
}

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

    const vocabulary = await getVocabulary();

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'el',
      ...(vocabulary ? { prompt: vocabulary } : {}),
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
