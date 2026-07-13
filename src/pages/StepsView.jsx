import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Plus, Paperclip, ChevronDown, Send, Mic, Clock, Flag } from 'lucide-react'
import { db, supabase } from '../lib/db'
import { getDaysInfo, formatDueTime, getStepCardClass } from '../lib/dates'

export default function StepsView({ project, profile }) {
  const [steps, setSteps] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editStep, setEditStep] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('17:00')
  const [stepFile, setStepFile] = useState(null)
  const [isUrgent, setIsUrgent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedStep, setExpandedStep] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [stepNotes, setStepNotes] = useState({})

  // Voice recording
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const [toast, setToast] = useState(null)
  function showToast(msg, isError) { setToast({ msg, isError }); setTimeout(() => setToast(null), 2500) }

  useEffect(() => { loadSteps() }, [project.id])

  async function loadSteps() {
    setLoading(true)
    try {
    const { data: stps } = await supabase
      .from('steps')
      .select('*')
      .eq('project_id', project.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    setSteps(stps || [])

    const { data: profs } = await supabase.from('profiles').select('id, full_name')
    setProfiles(profs || [])

    if (stps && stps.length > 0) {
      const stepIds = stps.map(s => s.id)
      const { data: notes } = await supabase
        .from('step_notes')
        .select('*')
        .in('step_id', stepIds)
        .order('created_at', { ascending: false })
      const grouped = {}
      ;(notes || []).forEach(n => {
        if (!grouped[n.step_id]) grouped[n.step_id] = []
        grouped[n.step_id].push(n)
      })
      setStepNotes(grouped)
    }
    } catch (err) {
      console.error('Load error:', err)
      showToast('Σφάλμα φόρτωσης', true)
    } finally {
      setLoading(false)
    }
  }

  // === VOICE ===
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await transcribeAudio(blob)
      }
      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
    } catch (err) { alert('Δεν μπορώ να ανοίξω το μικρόφωνο') }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    setIsRecording(false)
  }

  async function transcribeAudio(blob) {
    setIsTranscribing(true)
    try {
      const path = `voice-tasks/${Date.now()}.webm`
      await supabase.storage.from('files').upload(path, blob)
      const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: urlData.publicUrl, transcribeOnly: true })
      })
      const data = await res.json()
      if (data.transcript) setTitle(prev => prev ? prev + ' ' + data.transcript : data.transcript)
      await supabase.storage.from('files').remove([path])
    } catch (err) { console.error('Voice error:', err) }
    setIsTranscribing(false)
  }

  function openAdd() {
    setTitle('')
    setDescription('')
    setAssignedTo('')
    setDueDate('')
    setDueTime('17:00')
    setStepFile(null)
    setIsUrgent(false)
    setEditStep(null)
    setShowAdd(true)
  }

  function openEdit(e, step) {
    e.stopPropagation()
    setTitle(step.title)
    setDescription(step.description || '')
    setAssignedTo(step.assigned_to || '')
    // Parse existing due_date
    if (step.due_date) {
      const d = new Date(step.due_date)
      setDueDate(d.toISOString().split('T')[0])
      const h = d.getHours()
      const m = d.getMinutes()
      setDueTime(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
    } else {
      setDueDate('')
      setDueTime('17:00')
    }
    setStepFile(null)
    setIsUrgent(step.is_urgent || false)
    setEditStep(step)
    setShowAdd(true)
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const assignedProfile = profiles.find(p => p.id === assignedTo)

      let fileUrl = editStep?.file_url || null
      let fileName = editStep?.file_name || null
      if (stepFile) {
        const ext = stepFile.name.split('.').pop()
        const path = `task-files/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('files').upload(path, stepFile)
        if (upErr) throw new Error('Σφάλμα μεταφόρτωσης')
        const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
        fileUrl = urlData.publicUrl
        fileName = stepFile.name
      }

      let dueDatetime = null
      if (dueDate) dueDatetime = `${dueDate}T${dueTime || '17:00'}:00`

      if (editStep) {
        await db(supabase.from('steps').update({
          title: title.trim(),
          description: description.trim() || null,
          assigned_to: assignedTo || null,
          assigned_to_name: assignedProfile?.full_name || null,
          due_date: dueDatetime,
          file_url: fileUrl, file_name: fileName,
          updated_by: profile.id, is_urgent: isUrgent
        }).eq('id', editStep.id))
      } else {
        const maxPos = steps.length > 0 ? Math.max(...steps.map(s => s.position || 0)) : 0
        await db(supabase.from('steps').insert({
          project_id: project.id,
          title: title.trim(),
          description: description.trim() || null,
          assigned_to: assignedTo || null,
          assigned_to_name: assignedProfile?.full_name || null,
          created_by: profile.id, created_by_name: profile.full_name,
          due_date: dueDatetime, status: 'not_started',
          position: maxPos + 1,
          file_url: fileUrl, file_name: fileName,
          updated_by: profile.id, is_urgent: isUrgent
        }))
      }

      setShowAdd(false)
      await loadSteps()
    } catch (err) {
      showToast('Σφάλμα αποθήκευσης: ' + err.message, true)
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(stepId, newStatus) {
    try {
      await db(supabase.from('steps').update({ status: newStatus, updated_by: profile.id }).eq('id', stepId))
      await loadSteps()
    } catch (err) {
      showToast('Σφάλμα ενημέρωσης', true)
    }
  }

  async function addNote(stepId) {
    if (!noteText.trim()) return
    try {
      await db(supabase.from('step_notes').insert({
        step_id: stepId, user_id: profile.id,
        user_name: profile.full_name, text: noteText.trim()
      }))
      setNoteText('')
      await loadSteps()
    } catch (err) {
      showToast('Σφάλμα σημείωσης', true)
    }
  }

  // getDaysInfo, formatDueTime, getStepCardClass imported from lib/dates

  const statusOptions = [
    { value: 'not_started', label: 'Νέα', icon: '○' },
    { value: 'in_progress', label: 'Σε εξέλιξη', icon: '◐' },
    { value: 'waiting', label: 'Αναμονή', icon: '⏸' },
    { value: 'done', label: 'Έγινε', icon: '✓' }
  ]

  const doneCount = steps.filter(s => s.status === 'done').length
  const totalCount = steps.length

  if (loading) return <div className="loading-inline"><div className="spinner" /></div>

  return (
    <div>
      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="steps-progress">
          <div className="steps-progress-text">{doneCount}/{totalCount} βήματα</div>
          <div className="steps-progress-bar">
            <div className="steps-progress-fill" style={{ width: `${(doneCount / totalCount) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Steps list */}
      {steps.map(step => {
        const info = getDaysInfo(step)
        const notes = stepNotes[step.id] || []
        const isExpanded = expandedStep === step.id
        const dueTime = formatDueTime(step)

        return (
          <div key={step.id} className={getStepCardClass(step)} onClick={() => setExpandedStep(isExpanded ? null : step.id)}>
            <div className="step-card-top">
              <div style={{ flex: 1 }}>
                <span className={`step-title ${step.status === 'done' ? 'step-title-done' : ''}`}>
                  {step.is_urgent && <span className="urgent-badge" style={{ marginRight: 4 }}>!</span>}
                  {step.title}
                </span>
                {step.description && <div className="step-desc-preview">{step.description}</div>}
                <div className="step-meta">
                  <span>{step.assigned_to_name || 'Χωρίς ανάθεση'}</span>
                  {info.text && <><span className="step-sep">·</span><span>{info.text}</span></>}
                  {dueTime && <><span className="step-sep">·</span><span>{dueTime}</span></>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {step.file_url && (
                  <Paperclip size={12} strokeWidth={1.6} color="var(--text3)" />
                )}
                {notes.length > 0 && <span className="step-note-count">{notes.length}</span>}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" onClick={e => openEdit(e, step)} style={{ cursor: 'pointer' }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
            </div>

            {isExpanded && (
              <div className="step-expanded" onClick={e => e.stopPropagation()}>
                <div className="step-status-row">
                  {statusOptions.map(opt => (
                    <button
                      key={opt.value}
                      className={`step-status-btn ${step.status === opt.value ? 'step-status-active' : ''}`}
                      onClick={() => updateStatus(step.id, opt.value)}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>

                {step.file_url && (
                  <a href={step.file_url} target="_blank" rel="noopener" className="step-file-link">
                    <Paperclip size={14} strokeWidth={1.6} />
                    {step.file_name || 'Αρχείο'}
                  </a>
                )}

                {notes.map(n => (
                  <div key={n.id} className="step-note">
                    <span className="step-note-author">{n.user_name}:</span> {n.text}
                    <span className="step-note-time">{new Date(n.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</span>
                  </div>
                ))}

                <div className="step-add-note">
                  <input
                    className="step-note-input"
                    placeholder="Σημείωση..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addNote(step.id)}
                  />
                  <button className="step-note-send" onClick={() => addNote(step.id)} disabled={!noteText.trim()}>
                    <Send size={14} strokeWidth={1.6} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add step button */}
      <button className="today-add-btn" onClick={openAdd}>
        <Plus size={16} strokeWidth={1.6} />
        Νέο βήμα
      </button>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content task-modal" onClick={e => e.stopPropagation()}>
            <p className="modal-title">{editStep ? 'Επεξεργασία' : 'Νέο βήμα'}</p>

            {/* Title + voice */}
            <div className="task-title-row">
              <input className="modal-input" placeholder="Τίτλος *" value={title} onChange={e => setTitle(e.target.value)} autoFocus style={{ flex: 1 }} />
              <button
                className={`voice-btn ${isRecording ? 'voice-btn-recording' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing}
              >
                {isTranscribing ? (
                  <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                ) : (
                  <Mic size={18} strokeWidth={1.6} />
                )}
              </button>
            </div>

            {/* Description */}
            <textarea
              className="modal-input"
              placeholder="Περιγραφή (προαιρετικά)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />

            {/* Assign */}
            <select className="modal-input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">Ανάθεση σε...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>

            {/* Date + Time */}
            <div className="task-datetime-row">
              <input className="modal-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ flex: 1 }} />
              <input className="modal-input" type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} style={{ width: 110 }} />
            </div>

            {/* File */}
            {/* Urgent + File */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`urgent-toggle ${isUrgent ? 'urgent-toggle-on' : ''}`}
                onClick={() => setIsUrgent(!isUrgent)}>
                <AlertTriangle size={16} strokeWidth={1.6} /> Επείγον
              </button>
              <label className="task-attach-btn" style={{ flex: 1 }}>
                <Paperclip size={16} strokeWidth={1.6} />
                {stepFile ? stepFile.name : (editStep?.file_name || 'Αρχείο')}
                <input type="file" onChange={e => setStepFile(e.target.files[0])} hidden />
              </label>
            </div>

            <div className="modal-actions">
              <button className="action-btn" onClick={() => setShowAdd(false)}>Ακύρωση</button>
              <button className="action-btn primary" onClick={handleSave} disabled={!title.trim() || saving}>
                {saving ? '...' : 'Αποθήκευση'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
