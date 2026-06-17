import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function InputTab({ profile }) {
  const [projects, setProjects] = useState([])
  const [selected, setSelected] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [toast, setToast] = useState(null)
  const [recording, setRecording] = useState(false)
  const [mediaRec, setMediaRec] = useState(null)
  const [showFileModal, setShowFileModal] = useState(null)
  const [docName, setDocName] = useState('')
  const [docVersion, setDocVersion] = useState('')
  const [docNotes, setDocNotes] = useState('')

  // AI Confirmation state
  const [confirm, setConfirm] = useState(null) // { rawText, extracted }

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').eq('status', 'active').order('name')
    setProjects(data || [])
  }

  function showToast(msg, isError) {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 2500)
  }

  // TEXT SUBMIT - now goes through AI extraction first
  async function handleTextSubmit() {
    if (!selected || !text.trim()) return
    setExtracting(true)
    try {
      const projectNames = projects.map(p => p.name)
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), projectNames })
      })

      if (!res.ok) {
        // If AI fails, save raw text without extraction
        console.error('AI extraction failed, saving raw')
        await saveEntry(text.trim(), null)
        return
      }

      const { extracted } = await res.json()
      // Show confirmation screen
      setConfirm({ rawText: text.trim(), extracted, entryType: 'text' })
    } catch (err) {
      console.error('Extract error:', err)
      // Fallback: save without AI
      await saveEntry(text.trim(), null)
    }
    setExtracting(false)
  }

  // Save entry (with or without AI extraction)
  async function saveEntry(rawText, extracted, type = 'text') {
    setSending(true)
    try {
      const matchedProject = extracted?.project_name
        ? projects.find(p => p.name === extracted.project_name)
        : null
      const targetProject = matchedProject || selected

      const { error } = await supabase.from('entries').insert({
        project_id: targetProject.id,
        user_id: profile.id,
        entry_type: type,
        raw_text: rawText,
        ai_summary: extracted?.summary || rawText.substring(0, 200),
        ai_extracted: extracted ? {
          people: extracted.people,
          deadline_description: extracted.deadline_description,
          deadline_date: extracted.deadline_date,
          budget_change: extracted.budget_change,
          action_items: extracted.action_items
        } : null,
        is_team_visible: false
      })
      if (error) throw error

      // If deadline extracted, save to deadlines table
      if (extracted?.deadline_date && extracted?.deadline_description) {
        await supabase.from('deadlines').insert({
          project_id: targetProject.id,
          description: extracted.deadline_description,
          due_date: extracted.deadline_date,
          status: new Date(extracted.deadline_date) < new Date() ? 'overdue' : 'pending'
        })
      }

      setText('')
      setConfirm(null)
      showToast('Αποθηκεύτηκε')
    } catch (err) {
      showToast('Σφάλμα: ' + err.message, true)
    }
    setSending(false)
  }

  // Confirm AI extraction
  function handleConfirm() {
    if (!confirm) return
    saveEntry(confirm.rawText, confirm.extracted, confirm.entryType || 'text')
  }

  // Skip AI, save raw
  function handleSkipAI() {
    if (!confirm) return
    saveEntry(confirm.rawText, null, confirm.entryType || 'text')
  }

  // VOICE RECORDING
  async function toggleRecording() {
    if (recording && mediaRec) {
      mediaRec.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Try mp4 first (better compatibility), fallback to webm
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType })
      const chunks = []
      rec.ondataavailable = e => chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
        await transcribeAndExtract(blob)
      }
      rec.start()
      setMediaRec(rec)
      setRecording(true)
    } catch (err) {
      showToast('Δεν υπάρχει πρόσβαση στο μικρόφωνο', true)
    }
  }

  async function transcribeAndExtract(blob) {
    if (!selected) return
    setExtracting(true)
    try {
      // Step 1: Upload audio to Supabase storage (same as photos - this works)
      const fileName = `voice_${Date.now()}.webm`
      const path = `${selected.id}/${fileName}`
      const { error: upErr } = await supabase.storage.from('files').upload(path, blob)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
      const fileUrl = urlData.publicUrl

      // Step 2: Send URL to transcribe API
      const projectNames = projects.map(p => p.name)
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl, projectNames })
      })

      if (!res.ok) {
        // Clean up audio file
        await supabase.storage.from('files').remove([path])
        showToast('Η μεταγραφή απέτυχε', true)
        setExtracting(false)
        return
      }

      const { transcript, extracted } = await res.json()

      // Delete audio file - we only need the text
      await supabase.storage.from('files').remove([path])

      if (!transcript || transcript.trim().length === 0) {
        showToast('Δεν αναγνωρίστηκε ομιλία', true)
        setExtracting(false)
        return
      }

      // Show confirmation with transcript + extracted data
      setConfirm({
        rawText: transcript,
        extracted: extracted || null,
        entryType: 'voice'
      })
    } catch (err) {
      console.error('Transcribe error:', err)
      showToast('Σφάλμα μεταγραφής', true)
    }
    setExtracting(false)
  }

  // PHOTO UPLOAD
  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !selected) return
    setSending(true)
    try {
      const compressed = file.size > 1500000 ? await compressImage(file) : file
      const fileName = `photo_${Date.now()}.jpg`
      const path = `${selected.id}/${fileName}`
      const { error: upErr } = await supabase.storage.from('files').upload(path, compressed)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)

      await supabase.from('entries').insert({
        project_id: selected.id,
        user_id: profile.id,
        entry_type: 'photo',
        file_url: urlData.publicUrl,
        file_name: fileName,
        file_size: compressed.size,
        is_team_visible: true
      })
      showToast('Φωτογραφία αποθηκεύτηκε')
    } catch (err) {
      showToast('Σφάλμα: ' + err.message, true)
    }
    setSending(false)
    setShowFileModal(null)
  }

  // DOCUMENT UPLOAD
  async function handleDocUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !selected) return
    setSending(true)
    try {
      const fileName = file.name
      const path = `${selected.id}/${Date.now()}_${fileName}`
      const { error: upErr } = await supabase.storage.from('files').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)

      await supabase.from('entries').insert({
        project_id: selected.id,
        user_id: profile.id,
        entry_type: 'document',
        file_url: urlData.publicUrl,
        file_name: docName || fileName,
        file_size: file.size,
        doc_version: docVersion || null,
        doc_notes: docNotes || null,
        is_team_visible: true
      })
      setDocName(''); setDocVersion(''); setDocNotes('')
      showToast('Αρχείο αποθηκεύτηκε')
    } catch (err) {
      showToast('Σφάλμα: ' + err.message, true)
    }
    setSending(false)
    setShowFileModal(null)
  }

  async function compressImage(file) {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxW = 1200
        const scale = Math.min(1, maxW / img.width)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.8)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  // ============ RENDER ============
  return (
    <div>
      <p className="section-title">Επιλέξτε έργο</p>
      {projects.map(p => (
        <div
          key={p.id}
          className={`project-select ${selected?.id === p.id ? 'selected' : ''}`}
          onClick={() => setSelected(p)}
        >
          <div>
            <div className="project-select-name">{p.name}</div>
            <div className="project-select-loc">{p.location}{p.description ? `, ${p.description}` : ''}</div>
          </div>
          {selected?.id === p.id && <span style={{ color: 'var(--blue)' }}>✓</span>}
        </div>
      ))}

      {selected && !confirm && (
        <div className="input-area">
          <textarea
            className="text-input-box"
            placeholder="Γράψτε ενημέρωση... π.χ. Μίλησα με Νίκο, χάλυβας Πέμπτη, +2000€"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="input-actions">
            {profile?.role === 'owner' && (
              <button
                className={`action-btn ${recording ? 'recording' : ''}`}
                onClick={toggleRecording}
              >
                {recording ? '■ Stop' : <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zM5 7a3 3 0 0 0 6 0h1a4 4 0 0 1-3.5 3.97V13H10v1H6v-1h1.5v-2.03A4 4 0 0 1 4 7h1z"/></svg>}
              </button>
            )}
            <button
              className="action-btn primary"
              onClick={handleTextSubmit}
              disabled={!text.trim() || sending || extracting}
            >
              {extracting ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  AI...
                </span>
              ) : sending ? '...' : 'Αποστολή'}
            </button>
          </div>
          <div className="upload-row">
            <div className="upload-btn" onClick={() => setShowFileModal('photo')}>
              <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7.5 6l-2.5-3-2 2.5L6 8.5 2.5 12H13l-.5-1z"/></svg>
              Φωτογραφία
            </div>
            <div className="upload-btn" onClick={() => setShowFileModal('document')}>
              <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm5 1v3h3L9 2z"/></svg>
              Αρχείο
            </div>
          </div>
        </div>
      )}

      {/* ===== AI CONFIRMATION SCREEN ===== */}
      {confirm && (
        <div className="confirm-screen">
          <div className="confirm-header">
            <span className="confirm-badge">AI</span>
            <span className="confirm-title">Επιβεβαίωση δεδομένων</span>
          </div>

          <div className="confirm-original">
            <div className="confirm-label">Αρχικό κείμενο</div>
            <div className="confirm-text">{confirm.rawText}</div>
          </div>

          <div className="confirm-grid">
            {confirm.extracted.project_name && (
              <div className="confirm-field">
                <div className="confirm-label">Έργο</div>
                <div className="confirm-value">{confirm.extracted.project_name}</div>
              </div>
            )}

            {confirm.extracted.people?.length > 0 && (
              <div className="confirm-field">
                <div className="confirm-label">Άτομα</div>
                <div className="confirm-value">
                  {confirm.extracted.people.map((p, i) => (
                    <span key={i} className="confirm-tag">{p}</span>
                  ))}
                </div>
              </div>
            )}

            {confirm.extracted.deadline_description && (
              <div className="confirm-field">
                <div className="confirm-label">Προθεσμία</div>
                <div className="confirm-value">
                  {confirm.extracted.deadline_description}
                  {confirm.extracted.deadline_date && (
                    <span className="confirm-date"> — {new Date(confirm.extracted.deadline_date).toLocaleDateString('el-GR')}</span>
                  )}
                </div>
              </div>
            )}

            {confirm.extracted.budget_change !== 0 && confirm.extracted.budget_change != null && (
              <div className="confirm-field">
                <div className="confirm-label">Αλλαγή προϋπολογισμού</div>
                <div className="confirm-value" style={{ color: confirm.extracted.budget_change > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {confirm.extracted.budget_change > 0 ? '+' : ''}{confirm.extracted.budget_change.toLocaleString('el-GR')}€
                </div>
              </div>
            )}

            {confirm.extracted.action_items?.length > 0 && (
              <div className="confirm-field">
                <div className="confirm-label">Ενέργειες</div>
                <div className="confirm-value">
                  {confirm.extracted.action_items.map((a, i) => (
                    <div key={i} style={{ fontSize: 14, marginBottom: 2 }}>• {a}</div>
                  ))}
                </div>
              </div>
            )}

            {confirm.extracted.summary && (
              <div className="confirm-field">
                <div className="confirm-label">AI Σύνοψη</div>
                <div className="confirm-value" style={{ fontStyle: 'italic', color: 'var(--text2)' }}>
                  {confirm.extracted.summary}
                </div>
              </div>
            )}
          </div>

          <div className="confirm-actions">
            <button className="action-btn" onClick={() => setConfirm(null)} disabled={sending}>
              Ακύρωση
            </button>
            <button className="action-btn" onClick={handleSkipAI} disabled={sending} style={{ fontSize: 13 }}>
              Χωρίς AI
            </button>
            <button className="action-btn primary" onClick={handleConfirm} disabled={sending}>
              {sending ? '...' : '✓ Σωστό'}
            </button>
          </div>
        </div>
      )}

      {/* Photo Upload Modal */}
      {showFileModal === 'photo' && (
        <div className="modal-overlay" onClick={() => setShowFileModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <p className="modal-title">Φωτογραφία</p>
            <input
              type="file" accept="image/*" capture="environment"
              onChange={handlePhotoUpload}
              style={{ color: 'var(--text)' }}
            />
            <div className="modal-actions">
              <button className="action-btn" onClick={() => setShowFileModal(null)}>Ακύρωση</button>
            </div>
          </div>
        </div>
      )}

      {/* Document Upload Modal */}
      {showFileModal === 'document' && (
        <div className="modal-overlay" onClick={() => setShowFileModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <p className="modal-title">Ανέβασμα αρχείου</p>
            <input className="modal-input" placeholder="Όνομα εγγράφου" value={docName} onChange={e => setDocName(e.target.value)} />
            <input className="modal-input" placeholder="Έκδοση (π.χ. v3)" value={docVersion} onChange={e => setDocVersion(e.target.value)} />
            <input className="modal-input" placeholder="Σημειώσεις (προαιρετικά)" value={docNotes} onChange={e => setDocNotes(e.target.value)} />
            <input
              type="file" accept=".pdf,.dwg,.doc,.docx,.xls,.xlsx"
              onChange={handleDocUpload}
              style={{ color: 'var(--text)', marginTop: '10px' }}
            />
            <div className="modal-actions">
              <button className="action-btn" onClick={() => setShowFileModal(null)}>Ακύρωση</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.isError ? "toast-error" : "toast-success"}`}>{toast.msg}</div>}
    </div>
  )
}
