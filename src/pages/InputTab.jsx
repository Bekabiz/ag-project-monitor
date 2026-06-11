import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { buildExtractionPrompt } from '../lib/ai'

export default function InputTab({ profile }) {
  const [projects, setProjects] = useState([])
  const [selected, setSelected] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)
  const [recording, setRecording] = useState(false)
  const [mediaRec, setMediaRec] = useState(null)
  const [showFileModal, setShowFileModal] = useState(null) // 'photo' or 'document'
  const [docName, setDocName] = useState('')
  const [docVersion, setDocVersion] = useState('')
  const [docNotes, setDocNotes] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').eq('status', 'active').order('name')
    setProjects(data || [])
  }

  function showToast(msg, isError) {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 2500)
  }

  // TEXT SUBMIT
  async function handleTextSubmit() {
    if (!selected || !text.trim()) return
    setSending(true)
    try {
      // For now, save raw text. AI extraction will be added via edge function.
      const { error } = await supabase.from('entries').insert({
        project_id: selected.id,
        user_id: profile.id,
        entry_type: 'text',
        raw_text: text.trim(),
        ai_summary: text.trim().substring(0, 200),
        is_team_visible: false
      })
      if (error) throw error
      setText('')
      showToast('OK Αποθηκεύτηκε')
    } catch (err) {
      showToast('Σφάλμα: ' + err.message, true)
    }
    setSending(false)
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
      const rec = new MediaRecorder(stream)
      const chunks = []
      rec.ondataavailable = e => chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
        await uploadVoice(blob)
      }
      rec.start()
      setMediaRec(rec)
      setRecording(true)
    } catch (err) {
      showToast('Δεν υπάρχει πρόσβαση στο μικρόφωνο', true)
    }
  }

  async function uploadVoice(blob) {
    if (!selected) return
    setSending(true)
    try {
      const fileName = `voice_${Date.now()}.webm`
      const path = `${selected.id}/${fileName}`
      const { error: upErr } = await supabase.storage.from('files').upload(path, blob)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
      
      await supabase.from('entries').insert({
        project_id: selected.id,
        user_id: profile.id,
        entry_type: 'voice',
        file_url: urlData.publicUrl,
        file_name: fileName,
        file_size: blob.size,
        raw_text: '[Ηχητικό σημείωμα - αναμονή μεταγραφής]',
        ai_summary: 'Ηχητικό σημείωμα',
        is_team_visible: false
      })
      showToast('OK Ηχητικό αποθηκεύτηκε')
    } catch (err) {
      showToast('Σφάλμα: ' + err.message, true)
    }
    setSending(false)
  }

  // PHOTO UPLOAD
  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !selected) return
    setSending(true)
    try {
      // Compress if needed
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
      showToast('OK Φωτογραφία αποθηκεύτηκε')
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
      showToast('OK Αρχείο αποθηκεύτηκε')
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
            <div className="project-select-loc">{p.location}, {p.description}</div>
          </div>
          {selected?.id === p.id && <span style={{ color: 'var(--blue)' }}>✓</span>}
        </div>
      ))}

      {selected && (
        <div className="input-area">
          <textarea
            className="text-input-box"
            placeholder="Γράψτε ενημέρωση... π.χ. Μίλησα με Νίκο, χάλυβας Πέμπτη, +2000€"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="input-actions">
            <button 
              className={`action-btn ${recording ? 'recording' : ''}`}
              onClick={toggleRecording}
            >
              {recording ? '■ Stop' : <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zM5 7a3 3 0 0 0 6 0h1a4 4 0 0 1-3.5 3.97V13H10v1H6v-1h1.5v-2.03A4 4 0 0 1 4 7h1z"/></svg>}
            </button>
            <button 
              className="action-btn primary" 
              onClick={handleTextSubmit}
              disabled={!text.trim() || sending}
            >
              {sending ? '...' : 'Αποστολή'}
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
