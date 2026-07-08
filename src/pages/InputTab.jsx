import { useState, useEffect, useRef } from 'react'
import { Lock, Users, Mic, Camera, FileText, Check, RefreshCw } from 'lucide-react'
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
  const [teamVisible, setTeamVisible] = useState(false) // false = private (owner only), true = team can see

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

  // TEXT SUBMIT - AI extraction for owner only, raw save for team
  async function handleTextSubmit() {
    if (!selected || !text.trim()) return
    
    // All users go through AI extraction for structured data
    setExtracting(true)
    try {
      const projectNames = projects.map(p => p.name)
      // Load project areas for the selected project
      let projectAreas = []
      if (selected) {
        const { data: areas } = await supabase.from('project_areas').select('area_name').eq('project_id', selected.id)
        projectAreas = (areas || []).map(a => a.area_name)
      }
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), projectNames, projectAreas })
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

  // Save entry (with or without AI extraction) - now with structured fields
  async function saveEntry(rawText, extracted, type = 'text') {
    setSending(true)
    try {
      const matchedProject = extracted?.project_name
        ? projects.find(p => p.name === extracted.project_name)
        : null
      const targetProject = matchedProject || selected

      // Handle multiple entries from AI (one voice message can produce multiple entries)
      const entries = extracted?.entries || []
      
      if (entries.length > 0) {
        // Save each structured entry
        for (const entry of entries) {
          await supabase.from('entries').insert({
            project_id: targetProject.id,
            user_id: profile.id,
            entry_type: type,
            raw_text: entry.text || rawText,
            ai_summary: extracted?.summary || entry.text?.substring(0, 200),
            title: entry.title || null,
            category: entry.category || null,
            tags: entry.tags || null,
            entry_status: entry.entry_status || null,
            ai_extracted: extracted ? {
              people: extracted.people,
              deadline_description: extracted.deadline_description,
              deadline_date: extracted.deadline_date,
              budget_change: extracted.budget_change,
              action_items: extracted.action_items
            } : null,
            is_team_visible: teamVisible,
            submitter_name: profile.full_name
          })
        }
      } else {
        // Fallback: save as single entry (no AI entries array)
        await supabase.from('entries').insert({
          project_id: targetProject.id,
          user_id: profile.id,
          entry_type: type,
          raw_text: rawText,
          ai_summary: extracted?.summary || rawText.substring(0, 200),
          title: extracted?.summary?.substring(0, 80) || null,
          category: null,
          tags: null,
          ai_extracted: extracted ? {
            people: extracted.people,
            deadline_description: extracted.deadline_description,
            deadline_date: extracted.deadline_date,
            budget_change: extracted.budget_change,
            action_items: extracted.action_items
          } : null,
          is_team_visible: teamVisible,
          submitter_name: profile.full_name
        })
      }

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

  // Update a single field in the confirmed extraction
  function updateExtracted(field, value) {
    setConfirm(prev => ({
      ...prev,
      extracted: { ...prev.extracted, [field]: value }
    }))
  }

  // Re-run AI extraction on the (possibly edited) original text
  async function handleReExtract() {
    if (!confirm) return
    setExtracting(true)
    try {
      const projectNames = projects.map(p => p.name)
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: confirm.rawText, projectNames })
      })
      if (res.ok) {
        const { extracted } = await res.json()
        setConfirm(prev => ({ ...prev, extracted }))
      }
    } catch (err) {
      console.error('Re-extract error:', err)
    }
    setExtracting(false)
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

  // PHOTO UPLOAD - supports multiple
  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !selected) return
    setSending(true)
    try {
      for (const file of files) {
        const compressed = file.size > 1500000 ? await compressImage(file) : file
        const fileName = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
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
          is_team_visible: profile?.role === 'owner' ? teamVisible : true
        })
      }
      showToast(`${files.length} φωτογραφία${files.length > 1 ? 'ες' : ''} αποθηκεύτηκ${files.length > 1 ? 'αν' : 'ε'}`)
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
        is_team_visible: profile?.role === 'owner' ? teamVisible : true
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
            <div className="project-select-loc">{p.location}{p.description ? <><span style={{ margin: '0 5px', color: 'var(--text3)' }}>|</span>{p.description}</> : ''}</div>
          </div>
          {selected?.id === p.id && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3.5 8 6.5 11 12.5 5"/></svg>
          )}
        </div>
      ))}

      {selected && !confirm && (
        <div className="input-area">
          {/* Visibility toggle - owner only */}
          {profile?.role === 'owner' && (
            <div className="visibility-toggle">
              <span className="visibility-label">Ποιος βλέπει:</span>
              <button
                className={`vis-btn ${!teamVisible ? 'active' : ''}`}
                onClick={() => setTeamVisible(false)}
              >
                <Lock size={14} strokeWidth={1.6} /> Μόνο εγώ
              </button>
              <button
                className={`vis-btn ${teamVisible ? 'active' : ''}`}
                onClick={() => setTeamVisible(true)}
              >
                <Users size={14} strokeWidth={1.6} /> Η ομάδα
              </button>
            </div>
          )}

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
                {recording ? '■ Stop' : <Mic size={18} strokeWidth={1.6} />}
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
              <Camera size={20} strokeWidth={1.6} />
              Φωτογραφία
            </div>
            <div className="upload-btn" onClick={() => setShowFileModal('document')}>
              <FileText size={20} strokeWidth={1.6} />
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
            <button
              className="action-btn"
              onClick={handleReExtract}
              disabled={extracting}
              style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
              title="Επανάληψη ανάλυσης AI"
            >
              {extracting ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : (
                <RefreshCw size={14} strokeWidth={1.6} />
              )}
              AI
            </button>
          </div>

          <div className="confirm-original">
            <div className="confirm-label">Αρχικό κείμενο</div>
            <textarea
              className="confirm-edit-textarea"
              value={confirm.rawText}
              onChange={e => setConfirm(prev => ({ ...prev, rawText: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="confirm-grid">
            {confirm.extracted.project_name && (
              <div className="confirm-field">
                <div className="confirm-label">Έργο</div>
                <select
                  className="confirm-edit-input"
                  value={confirm.extracted.project_name}
                  onChange={e => updateExtracted('project_name', e.target.value)}
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Structured entries from AI */}
            {confirm.extracted.entries?.length > 0 && (
              <div className="confirm-field">
                <div className="confirm-label">AI found {confirm.extracted.entries.length} {confirm.extracted.entries.length === 1 ? 'entry' : 'entries'}</div>
                {confirm.extracted.entries.map((entry, i) => (
                  <div key={i} className="confirm-entry-card">
                    <div className="confirm-entry-header">
                      <span className={`confirm-cat-pill confirm-cat-${entry.category}`}>
                        {entry.category === 'work_update' ? 'Work update' : 
                         entry.category === 'problem' ? 'Problem' :
                         entry.category === 'decision' ? 'Decision' :
                         entry.category === 'material' ? 'Material' :
                         entry.category === 'client_request' ? 'Client' :
                         'Note'}
                      </span>
                      {entry.entry_status && (
                        <span className="confirm-status-pill">{entry.entry_status}</span>
                      )}
                    </div>
                    <div className="confirm-entry-title">{entry.title}</div>
                    <div className="confirm-entry-text">{entry.text}</div>
                    {entry.tags?.length > 0 && (
                      <div className="confirm-entry-tags">
                        {entry.tags.map(t => <span key={t} className="confirm-tag">{t}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {confirm.extracted.people?.length > 0 && (
              <div className="confirm-field">
                <div className="confirm-label">Άτομα</div>
                <input
                  className="confirm-edit-input"
                  value={confirm.extracted.people.join(', ')}
                  onChange={e => updateExtracted('people', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                />
              </div>
            )}

            {confirm.extracted.deadline_description && (
              <div className="confirm-field">
                <div className="confirm-label">Προθεσμία</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="confirm-edit-input"
                    value={confirm.extracted.deadline_description}
                    onChange={e => updateExtracted('deadline_description', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {confirm.extracted.deadline_date && (
                    <input
                      className="confirm-edit-input"
                      type="date"
                      value={confirm.extracted.deadline_date}
                      onChange={e => updateExtracted('deadline_date', e.target.value)}
                      style={{ width: 140 }}
                    />
                  )}
                </div>
              </div>
            )}

            {confirm.extracted.budget_change !== 0 && confirm.extracted.budget_change != null && (
              <div className="confirm-field">
                <div className="confirm-label">Αλλαγή προϋπολογισμού (€)</div>
                <input
                  className="confirm-edit-input"
                  type="number"
                  value={confirm.extracted.budget_change}
                  onChange={e => updateExtracted('budget_change', Number(e.target.value))}
                />
              </div>
            )}

            {confirm.extracted.action_items?.length > 0 && (
              <div className="confirm-field">
                <div className="confirm-label">Ενέργειες</div>
                <textarea
                  className="confirm-edit-textarea"
                  value={confirm.extracted.action_items.join('\n')}
                  onChange={e => updateExtracted('action_items', e.target.value.split('\n').filter(Boolean))}
                  rows={Math.min(confirm.extracted.action_items.length + 1, 4)}
                />
              </div>
            )}

            {confirm.extracted.summary && (
              <div className="confirm-field">
                <div className="confirm-label">AI Σύνοψη</div>
                <input
                  className="confirm-edit-input"
                  value={confirm.extracted.summary}
                  onChange={e => updateExtracted('summary', e.target.value)}
                  style={{ fontStyle: 'italic', color: 'var(--text2)' }}
                />
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
              {sending ? '...' : <><Check size={14} strokeWidth={2} style={{ marginRight: 3 }} /> Σωστό</>}
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
              type="file" accept="image/*" capture="environment" multiple
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
