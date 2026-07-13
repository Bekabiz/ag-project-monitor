import { useState, useRef, useCallback } from 'react'
import { supabase } from './supabase'

/**
 * Shared voice recording hook for AG Project Monitor.
 * Consolidates 4 duplicate implementations (TodayTab, MonitorTab, StepsView, InputTab).
 * Includes iOS Safari mp4 fallback for broader device support.
 *
 * Usage:
 *   const voice = useVoiceRecorder()
 *
 *   // Start recording — returns a promise that resolves with the audio Blob when stopped
 *   const blob = await voice.startRecording()
 *
 *   // Stop recording (usually called from a different button)
 *   voice.stopRecording()
 *
 *   // Transcribe the blob (uploads to Supabase, calls Whisper, cleans up)
 *   const transcript = await voice.transcribeBlob(blob)
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recRef = useRef(null)
  const chunksRef = useRef([])
  const resolveRef = useRef(null)

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    // Best mime type for compatibility: mp4 for iOS Safari, webm for everything else
    const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
      : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const rec = new MediaRecorder(stream, { mimeType })
    chunksRef.current = []
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }

    return new Promise((resolve) => {
      resolveRef.current = resolve
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        blob._ext = ext  // carry the correct extension for upload
        resolve(blob)
      }
      rec.start()
      recRef.current = rec
      setRecording(true)
    })
  }, [])

  const stopRecording = useCallback(() => {
    if (recRef.current?.state === 'recording') {
      recRef.current.stop()
    }
    setRecording(false)
  }, [])

  /**
   * Upload audio blob to Supabase storage, call /api/transcribe (Whisper only),
   * clean up the audio file, and return the transcript string.
   * Throws on failure.
   */
  const transcribeBlob = useCallback(async (blob) => {
    setTranscribing(true)
    const ext = blob._ext || (blob.type?.includes('mp4') ? 'm4a' : 'webm')
    const path = `voice/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
    try {
      const { error: upErr } = await supabase.storage.from('files').upload(path, blob, {
        contentType: blob.type || 'audio/webm'
      })
      if (upErr) throw new Error('Σφάλμα αποστολής ήχου')

      const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: urlData.publicUrl })
      })

      if (!res.ok) throw new Error('Η μεταγραφή απέτυχε')
      const data = await res.json()
      if (!data.transcript?.trim()) throw new Error('Δεν αναγνωρίστηκε ομιλία')
      return data.transcript
    } finally {
      // Always clean up audio file
      await supabase.storage.from('files').remove([path]).catch(() => {})
      setTranscribing(false)
    }
  }, [])

  return { recording, transcribing, startRecording, stopRecording, transcribeBlob }
}

/**
 * Call /api/extract with text and get structured AI extraction.
 * One extraction brain for both voice and text input.
 */
export async function extractText(text, projectNames, projectAreas) {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, projectNames, projectAreas })
  })
  if (!res.ok) return null
  const { extracted } = await res.json()
  return extracted
}
