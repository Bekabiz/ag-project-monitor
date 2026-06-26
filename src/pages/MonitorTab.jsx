import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function MonitorTab({ profile }) {
  const [assignedTasks, setAssignedTasks] = useState([])
  const [taskNotes, setTaskNotes] = useState({})
  const [plans, setPlans] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('tasks')
  const [expandedTask, setExpandedTask] = useState(null)
  const [replyText, setReplyText] = useState('')

  // Plan creation
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [planText, setPlanText] = useState('')
  const [planDate, setPlanDate] = useState('')
  const [planSaving, setPlanSaving] = useState(false)

  // Voice for planner
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: tasks } = await supabase
      .from('steps')
      .select('*, projects:project_id(name)')
      .eq('created_by', profile.id)
      .neq('assigned_to', profile.id)
      .order('is_urgent', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
    setAssignedTasks(tasks || [])

    // Load notes for all tasks
    if (tasks && tasks.length > 0) {
      const ids = tasks.map(t => t.id)
      const { data: notes } = await supabase
        .from('step_notes').select('*').in('step_id', ids)
        .order('created_at', { ascending: false })
      const grouped = {}
      ;(notes || []).forEach(n => {
        if (!grouped[n.step_id]) grouped[n.step_id] = []
        grouped[n.step_id].push(n)
      })
      setTaskNotes(grouped)
    }

    const todayStr = new Date().toISOString().split('T')[0]
    const { data: myPlans } = await supabase
      .from('manager_plans').select('*')
      .eq('user_id', profile.id).gte('plan_date', todayStr)
      .eq('is_done', false).order('plan_date', { ascending: true })
    setPlans(myPlans || [])

    const { data: dls } = await supabase
      .from('deadlines').select('*, projects(name)')
      .in('status', ['overdue', 'pending']).order('due_date')
    setDeadlines(dls || [])

    const { data: projs } = await supabase
      .from('projects').select('*').eq('status', 'active').order('name')
    setProjects(projs || [])

    setLoading(false)
  }

  // === VOICE FOR PLANNER ===
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setIsTranscribing(true)
        try {
          const path = `voice-tasks/${Date.now()}.webm`
          await supabase.storage.from('files').upload(path, blob)
          const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
          const res = await fetch('/api/transcribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileUrl: urlData.publicUrl, transcribeOnly: true })
          })
          const data = await res.json()
          if (data.transcript) setPlanText(prev => prev ? prev + ' ' + data.transcript : data.transcript)
          await supabase.storage.from('files').remove([path])
        } catch (err) { console.error('Voice error:', err) }
        setIsTranscribing(false)
      }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
    } catch (err) { alert('Mic not available') }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    setIsRecording(false)
  }

  // === TASK HELPERS ===
  function getTasksByPerson() {
    const grouped = {}
    assignedTasks.forEach(t => {
      const name = t.assigned_to_name || 'Χωρίς ανάθεση'
      if (!grouped[name]) grouped[name] = { done: 0, active: 0, urgent: 0, tasks: [] }
      grouped[name].tasks.push(t)
      if (t.status === 'done') grouped[name].done++
      else grouped[name].active++
      if (t.is_urgent && t.status !== 'done') grouped[name].urgent++
    })
    return grouped
  }

  function getDaysText(step) {
    if (!step.due_date) return ''
    const now = new Date(); now.setHours(0,0,0,0)
    const due = new Date(step.due_date); due.setHours(0,0,0,0)
    const diff = Math.ceil((due - now) / 86400000)
    if (diff < 0) return `${Math.abs(diff)} ημ. καθυστ.`
    if (diff === 0) return 'Σήμερα'
    if (diff <= 3) return `${diff} ημ.`
    return due.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })
  }

  function getStatusColor(s) {
    if (s === 'done') return 'var(--green)'
    if (s === 'in_progress') return 'var(--blue)'
    if (s === 'waiting') return 'var(--yellow)'
    return 'var(--text3)'
  }

  function getStatusLabel(s) {
    return { not_started: 'Νέα', in_progress: 'Σε εξέλιξη', waiting: 'Αναμονή', done: 'Ολοκληρ.' }[s] || s
  }

  // === APPROVE / REJECT ===
  async function approveTask(task) {
    await supabase.from('steps').update({ is_reviewed: true, review_result: 'approved' }).eq('id', task.id)
    await supabase.from('step_notes').insert({
      step_id: task.id, user_id: profile.id,
      user_name: profile.full_name, text: '✓ Εγκρίθηκε'
    })
    await loadData()
  }

  async function rejectTask(task) {
    const comment = prompt('Σχόλιο απόρριψης:')
    if (comment === null) return
    await supabase.from('steps').update({
      status: 'in_progress', is_reviewed: false, review_result: 'rejected'
    }).eq('id', task.id)
    await supabase.from('step_notes').insert({
      step_id: task.id, user_id: profile.id,
      user_name: profile.full_name, text: '↩ Απόρριψη: ' + (comment || 'Χρειάζεται διόρθωση')
    })
    await loadData()
  }

  async function registerToTimeline(task) {
    if (!task.project_id) return
    const latestNote = taskNotes[task.id]?.[0]?.text || ''
    await supabase.from('entries').insert({
      project_id: task.project_id, user_id: profile.id, entry_type: 'text',
      raw_text: `✅ ${task.title}${latestNote ? ' \u2014 ' + latestNote : ''}`,
      ai_summary: `Ολοκλήρωση: ${task.title}. ${task.assigned_to_name || ''}`,
      is_team_visible: true, submitter_name: task.assigned_to_name || profile.full_name
    })
    await supabase.from('steps').update({ registered_to_timeline: true }).eq('id', task.id)
    await loadData()
  }

  async function skipRegister(taskId) {
    await supabase.from('steps').update({ registered_to_timeline: true }).eq('id', taskId)
    await loadData()
  }

  // === REPLY ===
  async function sendReply(taskId) {
    if (!replyText.trim()) return
    await supabase.from('step_notes').insert({
      step_id: taskId, user_id: profile.id,
      user_name: profile.full_name, text: replyText.trim()
    })
    setReplyText('')
    await loadData()
  }

  // === PLANS ===
  async function savePlan() {
    if (!planText.trim() || !planDate) return
    setPlanSaving(true)
    await supabase.from('manager_plans').insert({
      user_id: profile.id, plan_date: planDate, text: planText.trim()
    })
    setPlanText(''); setPlanDate(''); setShowPlanModal(false); setPlanSaving(false)
    await loadData()
  }

  async function markPlanDone(id) {
    await supabase.from('manager_plans').update({ is_done: true }).eq('id', id)
    await loadData()
  }

  async function deletePlan(id) {
    await supabase.from('manager_plans').delete().eq('id', id)
    await loadData()
  }

  if (loading) return <div className="loading-inline"><div className="spinner" /></div>
  if (profile?.role !== 'owner') return <div className="empty-state"><p>Μόνο ο διαχειριστής</p></div>

  const tasksByPerson = getTasksByPerson()
  const totalActive = assignedTasks.filter(t => t.status !== 'done').length
  const totalUrgent = assignedTasks.filter(t => t.is_urgent && t.status !== 'done').length
  const pendingReview = assignedTasks.filter(t => t.status === 'done' && !t.is_reviewed).length

  return (
    <div className="monitor-page">
      {/* Section Switcher */}
      <div className="monitor-switcher">
        <button className={`monitor-sw-btn ${activeSection === 'tasks' ? 'active' : ''}`} onClick={() => setActiveSection('tasks')}>
          Εργασίες
          {pendingReview > 0 && <span className="monitor-sw-count" style={{ background: 'var(--red)' }}>{pendingReview}</span>}
        </button>
        <button className={`monitor-sw-btn ${activeSection === 'planner' ? 'active' : ''}`} onClick={() => setActiveSection('planner')}>
          Σχεδιασμός
          {plans.length > 0 && <span className="monitor-sw-count">{plans.length}</span>}
        </button>
        <button className={`monitor-sw-btn ${activeSection === 'overview' ? 'active' : ''}`} onClick={() => setActiveSection('overview')}>
          Εποπτεία
        </button>
      </div>

      {/* ========== TASKS ========== */}
      {activeSection === 'tasks' && (
        <div>
          <div className="monitor-stats-bar">
            <div className="monitor-stat">
              <span className="monitor-stat-num">{totalActive}</span>
              <span className="monitor-stat-label">Ενεργές</span>
            </div>
            <div className="monitor-stat">
              <span className="monitor-stat-num" style={{ color: pendingReview > 0 ? 'var(--red)' : undefined }}>{pendingReview}</span>
              <span className="monitor-stat-label">Αξιολόγηση</span>
            </div>
            <div className="monitor-stat">
              <span className="monitor-stat-num" style={{ color: totalUrgent > 0 ? 'var(--red)' : undefined }}>{totalUrgent}</span>
              <span className="monitor-stat-label">Επείγοντα</span>
            </div>
          </div>

          {Object.keys(tasksByPerson).length === 0 && (
            <div className="empty-state" style={{ padding: '40px 16px' }}>Δεν έχεις αναθέσει εργασίες</div>
          )}

          {Object.entries(tasksByPerson).map(([personName, group]) => (
            <div key={personName} className="monitor-person-group">
              <div className="monitor-person-header">
                <div className="monitor-person-avatar">{personName.charAt(0)}</div>
                <div style={{ flex: 1 }}>
                  <div className="monitor-person-name">{personName}</div>
                  <div className="monitor-person-meta">
                    {group.active} ενεργές
                    {group.urgent > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>🔴 {group.urgent}</span>}
                    {group.done > 0 && <span style={{ color: 'var(--green)', marginLeft: 8 }}>✓ {group.done}</span>}
                  </div>
                </div>
              </div>

              {/* Active tasks */}
              {group.tasks.filter(t => t.status !== 'done').map(task => {
                const isExp = expandedTask === task.id
                const notes = taskNotes[task.id] || []
                return (
                  <div key={task.id} className={`monitor-task-card ${task.is_urgent ? 'monitor-task-urgent' : ''}`}
                    onClick={() => setExpandedTask(isExp ? null : task.id)}>
                    <div className="monitor-task-top">
                      {task.is_urgent && <span className="urgent-badge">!</span>}
                      <span className="monitor-task-title">{task.title}</span>
                      <span className="monitor-task-status" style={{ color: getStatusColor(task.status) }}>
                        {getStatusLabel(task.status)}
                      </span>
                    </div>
                    <div className="monitor-task-meta">
                      <span>{task.projects?.name || 'Προσωπικό'}</span>
                      {task.due_date && <><span className="step-sep">·</span>
                        <span style={{ color: getDaysText(task).includes('καθυστ') ? 'var(--red)' : undefined }}>{getDaysText(task)}</span></>}
                    </div>

                    {isExp && (
                      <div className="monitor-task-expanded" onClick={e => e.stopPropagation()}>
                        {task.description && <div className="monitor-exp-desc">{task.description}</div>}
                        {task.file_url && (
                          <a href={task.file_url} target="_blank" rel="noopener" className="step-file-link">
                            📎 {task.file_name || 'Αρχείο'}
                          </a>
                        )}
                        {notes.length > 0 && (
                          <div className="monitor-exp-notes">
                            {notes.slice(0, 5).map(n => (
                              <div key={n.id} className="step-note">
                                <span className="step-note-author">{n.user_name}:</span> {n.text}
                                <span className="step-note-time">{new Date(n.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="step-add-note">
                          <input className="step-note-input" placeholder="Απάντηση..." value={replyText}
                            onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply(task.id)} />
                          <button className="step-note-send" onClick={() => sendReply(task.id)} disabled={!replyText.trim()}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Completed tasks (pending review) */}
              {group.tasks.filter(t => t.status === 'done' && !t.is_reviewed).map(task => {
                const isExp = expandedTask === task.id
                const notes = taskNotes[task.id] || []
                return (
                  <div key={task.id} className="monitor-task-card monitor-task-done" onClick={() => setExpandedTask(isExp ? null : task.id)}>
                    <div className="monitor-task-top">
                      <span className="monitor-task-title" style={{ color: 'var(--green)' }}>✓ {task.title}</span>
                      <span className="monitor-review-badge">Αξιολόγηση</span>
                    </div>
                    <div className="monitor-task-meta">
                      <span>{task.projects?.name || ''}</span>
                    </div>

                    {isExp && (
                      <div className="monitor-task-expanded" onClick={e => e.stopPropagation()}>
                        {task.description && <div className="monitor-exp-desc">{task.description}</div>}
                        {task.file_url && (
                          <a href={task.file_url} target="_blank" rel="noopener" className="step-file-link">
                            📎 {task.file_name || 'Αρχείο'}
                          </a>
                        )}
                        {notes.length > 0 && (
                          <div className="monitor-exp-notes">
                            {notes.map(n => (
                              <div key={n.id} className="step-note">
                                <span className="step-note-author">{n.user_name}:</span> {n.text}
                                <span className="step-note-time">{new Date(n.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* APPROVE / REJECT */}
                        <div className="monitor-review-actions">
                          <button className="monitor-approve-btn" onClick={() => approveTask(task)}>✓ Εγκρίθηκε</button>
                          <button className="monitor-reject-btn" onClick={() => rejectTask(task)}>↩ Απόρριψη</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Approved: waiting for register decision */}
              {group.tasks.filter(t => t.status === 'done' && t.is_reviewed && t.review_result === 'approved' && !t.registered_to_timeline).map(task => (
                <div key={task.id} className="monitor-task-card monitor-task-approved">
                  <div className="monitor-task-top">
                    <span className="monitor-task-title">✓ {task.title}</span>
                    <div className="monitor-register-actions">
                      <button className="monitor-plus-btn" onClick={() => registerToTimeline(task)} title="Καταχώρηση στο έργο">➕</button>
                      <button className="monitor-skip-btn" onClick={() => skipRegister(task.id)} title="Παράλειψη">✕</button>
                    </div>
                  </div>
                  <div className="monitor-task-meta"><span>{task.projects?.name}</span></div>
                </div>
              ))}

              {/* Fully done */}
              {(() => {
                const fullyDone = group.tasks.filter(t => t.status === 'done' && t.is_reviewed && t.registered_to_timeline)
                return fullyDone.length > 0 && (
                  <div className="monitor-done-summary">✓ {fullyDone.length} ολοκληρωμέν{fullyDone.length > 1 ? 'ες' : 'η'}</div>
                )
              })()}
            </div>
          ))}
        </div>
      )}

      {/* ========== PLANNER ========== */}
      {activeSection === 'planner' && (
        <div>
          <button className="new-task-fab" onClick={() => setShowPlanModal(true)} style={{ marginBottom: 16 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Νέο σχέδιο
          </button>

          {plans.length === 0 && <div className="empty-state" style={{ padding: '40px 16px' }}>Κανένα σχέδιο</div>}

          {plans.map(plan => {
            const pd = new Date(plan.plan_date)
            const today = new Date(); today.setHours(0,0,0,0)
            const isToday = pd.toDateString() === today.toDateString()
            const isTomorrow = Math.ceil((pd - today) / 86400000) === 1
            const dl = isToday ? 'Σήμερα' : isTomorrow ? 'Αύριο' : pd.toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short' })
            return (
              <div key={plan.id} className={`plan-card ${isToday ? 'plan-card-today' : ''}`}>
                <div className="plan-card-date">{dl}</div>
                <div className="plan-card-text">{plan.text}</div>
                <div className="plan-card-actions">
                  <button className="plan-action-btn plan-done-btn" onClick={() => markPlanDone(plan.id)}>✓</button>
                  <button className="plan-action-btn plan-delete-btn" onClick={() => deletePlan(plan.id)}>✕</button>
                </div>
              </div>
            )
          })}

          {showPlanModal && (
            <div className="modal-overlay" onClick={() => setShowPlanModal(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <p className="modal-title">Νέο σχέδιο</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <textarea className="modal-input" placeholder="Τι πρέπει να γίνει..." value={planText}
                    onChange={e => setPlanText(e.target.value)} rows={3} autoFocus style={{ flex: 1, resize: 'vertical', fontFamily: 'inherit' }} />
                  <button className={`voice-btn ${isRecording ? 'voice-btn-recording' : ''}`}
                    onClick={isRecording ? stopRecording : startRecording} disabled={isTranscribing}>
                    {isTranscribing ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> :
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={isRecording ? 'white' : 'currentColor'}>
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM7 12a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.93V22h-2v-3.07A7 7 0 0 1 5 12h2z"/>
                      </svg>}
                  </button>
                </div>
                <input className="modal-input" type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} />
                <div className="modal-actions">
                  <button className="action-btn" onClick={() => setShowPlanModal(false)}>Ακύρωση</button>
                  <button className="action-btn primary" onClick={savePlan} disabled={!planText.trim() || !planDate || planSaving}>
                    {planSaving ? '...' : 'Αποθήκευση'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== OVERVIEW ========== */}
      {activeSection === 'overview' && (
        <div>
          <div className="monitor-overview-section">
            <div className="monitor-overview-title">Προθεσμίες {deadlines.filter(d => d.status === 'overdue').length > 0 && <span className="overdue-badge" style={{ marginLeft: 8 }}>{deadlines.filter(d => d.status === 'overdue').length}</span>}</div>
            {deadlines.length === 0 && <div className="monitor-overview-empty">Καμία εκκρεμότητα</div>}
            {deadlines.map(d => {
              const ov = d.status === 'overdue'
              const days = Math.ceil((new Date(d.due_date) - new Date()) / 86400000)
              return (
                <div key={d.id} className="monitor-deadline-card">
                  <span className="monitor-deadline-dot" style={{ background: ov ? 'var(--red)' : 'var(--yellow)' }} />
                  <div style={{ flex: 1 }}>
                    <div className="monitor-deadline-desc">{d.description}</div>
                    <div className="monitor-deadline-meta">{d.projects?.name}<span className="step-sep">·</span>
                      <span style={{ color: ov ? 'var(--red)' : undefined }}>{ov ? `${Math.abs(days)} ημ. καθυστ.` : new Date(d.due_date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {projects.filter(p => p.original_budget > 0).length > 0 && (
            <div className="monitor-overview-section">
              <div className="monitor-overview-title">Προϋπολογισμός</div>
              {projects.filter(p => p.original_budget > 0).map(p => {
                const drift = ((p.current_budget - p.original_budget) / p.original_budget * 100).toFixed(1)
                const c = Math.abs(drift) > 10 ? 'var(--red)' : drift > 5 ? 'var(--yellow)' : 'var(--green)'
                return (
                  <div key={p.id} className="monitor-budget-row">
                    <span className="monitor-budget-name">{p.name}</span>
                    <span className="monitor-budget-amount">{Number(p.current_budget).toLocaleString('el-GR')}€</span>
                    <span style={{ color: c, fontWeight: 600, fontSize: 13 }}>{drift > 0 ? '+' : ''}{drift}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
