import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function StepsView({ project, profile }) {
  const [steps, setSteps] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editStep, setEditStep] = useState(null) // step object or null
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedStep, setExpandedStep] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [stepNotes, setStepNotes] = useState({})

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

    // Load notes for all steps
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

  function openAdd() {
    setTitle('')
    setAssignedTo('')
    setDueDate('')
    setEditStep(null)
    setShowAdd(true)
  }

  function openEdit(e, step) {
    e.stopPropagation()
    setTitle(step.title)
    setAssignedTo(step.assigned_to || '')
    setDueDate(step.due_date || '')
    setEditStep(step)
    setShowAdd(true)
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const assignedProfile = profiles.find(p => p.id === assignedTo)

    if (editStep) {
      await supabase.from('steps').update({
        title: title.trim(),
        assigned_to: assignedTo || null,
        assigned_to_name: assignedProfile?.full_name || null,
        due_date: dueDate || null
      }).eq('id', editStep.id)
    } else {
      const maxPos = steps.length > 0 ? Math.max(...steps.map(s => s.position || 0)) : 0
      await supabase.from('steps').insert({
        project_id: project.id,
        title: title.trim(),
        assigned_to: assignedTo || null,
        assigned_to_name: assignedProfile?.full_name || null,
        created_by: profile.id,
        created_by_name: profile.full_name,
        due_date: dueDate || null,
        status: 'not_started',
        position: maxPos + 1
      })
    }

    setShowAdd(false)
    setSaving(false)
    await loadSteps()
  }

  async function updateStatus(stepId, newStatus) {
    await supabase.from('steps').update({
      status: newStatus,
      assigned_to_name: profile.full_name // track who changed it
    }).eq('id', stepId)
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
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(step.due_date)
    const diff = Math.ceil((due - today) / 86400000)
    if (step.status === 'done') return { text: 'Done', className: 'step-done' }
    if (diff < 0) return { text: `${Math.abs(diff)}d late`, className: 'step-overdue' }
    if (diff === 0) return { text: 'Today', className: 'step-today' }
    if (diff <= 3) return { text: `${diff}d left`, className: 'step-soon' }
    return { text: due.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' }), className: '' }
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
    { value: 'not_started', label: 'Not started' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'waiting', label: 'Waiting' },
    { value: 'done', label: 'Done' }
  ]

  const doneCount = steps.filter(s => s.status === 'done').length
  const totalCount = steps.length

  if (loading) return <div className="loading-inline"><div className="spinner" /></div>

  return (
    <div>
      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="steps-progress">
          <div className="steps-progress-text">{doneCount}/{totalCount} steps</div>
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

        return (
          <div key={step.id} className={getStepBg(step)} onClick={() => setExpandedStep(isExpanded ? null : step.id)}>
            <div className="step-card-top">
              <div style={{ flex: 1 }}>
                <span className={`step-title ${step.status === 'done' ? 'step-title-done' : ''}`}>{step.title}</span>
                <div className="step-meta">
                  <span>{step.assigned_to_name || 'Unassigned'}</span>
                  {info.text && <><span className="step-sep">|</span><span>{info.text}</span></>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {notes.length > 0 && (
                  <span className="step-note-count">{notes.length}</span>
                )}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" onClick={e => openEdit(e, step)} style={{ cursor: 'pointer' }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
            </div>

            {/* Expanded: status change + notes */}
            {isExpanded && (
              <div className="step-expanded" onClick={e => e.stopPropagation()}>
                <div className="step-status-row">
                  {statusOptions.map(opt => (
                    <button
                      key={opt.value}
                      className={`step-status-btn ${step.status === opt.value ? 'step-status-active' : ''}`}
                      onClick={() => updateStatus(step.id, opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Notes */}
                {notes.map(n => (
                  <div key={n.id} className="step-note">
                    <span className="step-note-author">{n.user_name}:</span> {n.text}
                    <span className="step-note-time">{new Date(n.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</span>
                  </div>
                ))}

                <div className="step-add-note">
                  <input
                    className="step-note-input"
                    placeholder="Add note..."
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
        Add step
      </button>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <p className="modal-title">{editStep ? 'Edit step' : 'New step'}</p>
            <input className="modal-input" placeholder="Task title *" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
            <select className="modal-input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">Assign to...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <input className="modal-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            <div className="modal-actions">
              <button className="action-btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="action-btn primary" onClick={handleSave} disabled={!title.trim() || saving}>
                {saving ? '...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
