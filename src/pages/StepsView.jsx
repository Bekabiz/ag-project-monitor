import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

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
  const [saving, setSaving] = useState(false)
  const [expandedStep, setExpandedStep] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [stepNotes, setStepNotes] = useState({})

  // Voice recording
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => { loadSteps() }, [project.id])

  async function loadSteps() {
    setLoading(true)
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
    setLoading(false)
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
    setEditStep(step)
    setShowAdd(true)
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)

    const assignedProfile = profiles.find(p => p.id === assignedTo)

    // Handle file upload
    let fileUrl = editStep?.file_url || null
    let fileName = editStep?.file_name || null
    if (stepFile) {
      const ext = stepFile.name.split('.').pop()
      const path = `task-files/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('files').upload(path, stepFile)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
        fileUrl = urlData.publicUrl
        fileName = stepFile.name
      }
    }

    // Build due datetime
    let dueDatetime = null
    if (dueDate) {
      dueDatetime = `${dueDate}T${dueTime || '17:00'}:00`
    }

    if (editStep) {
      await supabase.from('steps').update({
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo || null,
        assigned_to_name: assignedProfile?.full_name || null,
        due_date: dueDatetime,
        file_url: fileUrl,
        file_name: fileName,
        updated_by: profile.id
      }).eq('id', editStep.id)
    } else {
      const maxPos = steps.length > 0 ? Math.max(...steps.map(s => s.position || 0)) : 0
      await supabase.from('steps').insert({
        project_id: project.id,
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo || null,
        assigned_to_name: assignedProfile?.full_name || null,
        created_by: profile.id,
        created_by_name: profile.full_name,
        due_date: dueDatetime,
        status: 'not_started',
        position: maxPos + 1,
        file_url: fileUrl,
        file_name: fileName,
        updated_by: profile.id
      })
    }

    setShowAdd(false)
    setSaving(false)
    await loadSteps()
  }

  async function updateStatus(stepId, newStatus) {
    const step = steps.find(s => s.id === stepId)
    await supabase.from('steps').update({
      status: newStatus,
      updated_by: profile.id
    }).eq('id', stepId)

    // Auto-feed to timeline when done
    if (newStatus === 'done' && step) {
      const latestNote = stepNotes[stepId]?.[0]?.text || ''
      await supabase.from('entries').insert({
        project_id: project.id,
        user_id: profile.id,
        entry_type: 'text',
        raw_text: `✅ Ολοκληρώθηκε: ${step.title}${latestNote ? ' — ' + latestNote : ''}`,
        ai_summary: `Ολοκλήρωση εργασίας: ${step.title}. ${step.assigned_to_name || profile.full_name}${latestNote ? '. ' + latestNote : ''}`,
        is_team_visible: true,
        submitter_name: profile.full_name
      })
    }

    await loadSteps()
  }

  async function addNote(stepId) {
    if (!noteText.trim()) return
    await supabase.from('step_notes').insert({
      step_id: stepId,
      user_id: profile.id,
      user_name: profile.full_name,
      text: noteText.trim()
    })
    setNoteText('')
    await loadSteps()
  }

  function getDaysInfo(step) {
    if (!step.due_date) return { text: '', className: '' }
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const due = new Date(step.due_date)
    const dueDay = new Date(due)
    dueDay.setHours(0, 0, 0, 0)
    const diff = Math.ceil((dueDay - now) / 86400000)
    if (step.status === 'done') return { text: 'Έγινε', className: 'step-done' }
    if (diff < 0) return { text: `${Math.abs(diff)} ημ.`, className: 'step-overdue' }
    if (diff === 0) return { text: 'Σήμερα', className: 'step-today' }
    if (diff <= 3) return { text: `${diff} ημ.`, className: 'step-soon' }
    return { text: dueDay.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' }), className: '' }
  }

  function formatDueTime(step) {
    if (!step.due_date) return ''
    const d = new Date(step.due_date)
    const h = d.getHours(); const m = d.getMinutes()
    if (h === 0 && m === 0) return ''
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }

  function getStepBg(step) {
    if (step.status === 'done') return 'step-card step-done'
    const info = getDaysInfo(step)
    if (info.className === 'step-overdue') return 'step-card step-overdue'
    if (info.className === 'step-today' || info.className === 'step-soon') return 'step-card step-soon'
    if (step.status === 'waiting') return 'step-card step-waiting'
    if (step.status === 'in_progress') return 'step-card step-progress'
    return 'step-card'
  }

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
          <div key={step.id} className={getStepBg(step)} onClick={() => setExpandedStep(isExpanded ? null : step.id)}>
            <div className="step-card-top">
              <div style={{ flex: 1 }}>
                <span className={`step-title ${step.status === 'done' ? 'step-title-done' : ''}`}>{step.title}</span>
                {step.description && <div className="step-desc-preview">{step.description}</div>}
                <div className="step-meta">
                  <span>{step.assigned_to_name || 'Χωρίς ανάθεση'}</span>
                  {info.text && <><span className="step-sep">·</span><span>{info.text}</span></>}
                  {dueTime && <><span className="step-sep">·</span><span>{dueTime}</span></>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {step.file_url && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                )}
                {notes.length > 0 && <span className="step-note-count">{notes.length}</span>}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" onClick={e => openEdit(e, step)} style={{ cursor: 'pointer' }}>
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add step button */}
      <button className="today-add-btn" onClick={openAdd}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={isRecording ? 'white' : 'currentColor'}>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM7 12a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.93V22h-2v-3.07A7 7 0 0 1 5 12h2z"/>
                  </svg>
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
            <label className="task-attach-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              {stepFile ? stepFile.name : (editStep?.file_name || 'Επισύναψη αρχείου')}
              <input type="file" onChange={e => setStepFile(e.target.files[0])} hidden />
            </label>

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
