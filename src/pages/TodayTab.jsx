import { useState, useEffect, useRef } from 'react'
import { Bell, X, Plus, ClipboardCheck, MessageCircle, AlertTriangle, Paperclip, ChevronDown, Send, Mic, Sparkles, CircleDot, Clock, Square, CheckCircle2, User, Users } from 'lucide-react'
import { db, dbRead, supabase } from '../lib/db'
import { getDaysInfo, formatDueTime, getOverdueCount } from '../lib/dates'
import { extractText } from '../lib/voice'

export default function TodayTab({ profile, onBadgeCount }) {
  const [mySteps, setMySteps] = useState([])
  const [updates, setUpdates] = useState([])
  const [generalUpdates, setGeneralUpdates] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [todayPlans, setTodayPlans] = useState([])
  const [profiles, setProfiles] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showAddUpdate, setShowAddUpdate] = useState(false)
  const [updateText, setUpdateText] = useState('')
  const [updateFile, setUpdateFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [expandedPerson, setExpandedPerson] = useState(null)

  // Inline task expand
  const [expandedTask, setExpandedTask] = useState(null)
  const [taskNoteText, setTaskNoteText] = useState('')
  const [taskNotes, setTaskNotes] = useState({})

  // New task modal
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskProject, setTaskProject] = useState('')
  const [taskAssignees, setTaskAssignees] = useState([]) // multi-select
  const [taskDate, setTaskDate] = useState('')
  const [taskTime, setTaskTime] = useState('17:00')
  const [taskFile, setTaskFile] = useState(null)
  const [taskUrgent, setTaskUrgent] = useState(false)
  const [taskSaving, setTaskSaving] = useState(false)

  // Announcement modal
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [annText, setAnnText] = useState('')
  const [annSaving, setAnnSaving] = useState(false)
  const [toast, setToast] = useState(null)

  // Voice recording (shared for task title + announcements)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceTarget, setVoiceTarget] = useState(null) // 'task' | 'announcement' | 'update'
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => { loadData() }, [])

  function showToast(msg, isError) {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 2500)
  }

  async function loadData() {
    setLoading(true)
    try {
      setLoadError(false)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const profs = await dbRead(supabase.from('profiles').select('*'))
    setProfiles(profs)

    const projs = await dbRead(supabase.from('projects').select('*').eq('status', 'active').order('name'))
    setProjects(projs)

    // Active announcements
    const anns = await dbRead(supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false }))
    setAnnouncements(anns)

    // Today's plan reminders (owner only)
    if (profile?.role === 'owner') {
      const todayStr = new Date().toISOString().split('T')[0]
      const plans = await dbRead(supabase
        .from('manager_plans')
        .select('*')
        .eq('user_id', profile.id)
        .eq('plan_date', todayStr)
        .eq('is_done', false))
      setTodayPlans(plans)
    }

    // My assigned steps
    const steps = await dbRead(supabase
      .from('steps')
      .select('*, projects:project_id(name)')
      .eq('assigned_to', profile.id)
      .neq('status', 'done')
      .order('is_urgent', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false }))
    setMySteps(steps)

    // Load notes
    if (steps.length > 0) {
      const stepIds = steps.map(s => s.id)
      const notes = await dbRead(supabase
        .from('step_notes').select('*').in('step_id', stepIds)
        .order('created_at', { ascending: false }))
      const grouped = {}
      notes.forEach(n => {
        if (!grouped[n.step_id]) grouped[n.step_id] = []
        grouped[n.step_id].push(n)
      })
      setTaskNotes(grouped)
    }

    // Today's completed steps
    const recentSteps = await dbRead(supabase
      .from('steps').select('*, projects:project_id(name)')
      .gte('updated_at', today.toISOString())
      .lt('updated_at', tomorrow.toISOString())
      .eq('status', 'done')
      .order('updated_at', { ascending: false }))
    setUpdates(recentSteps)

    // Today's general updates
    const genUpdates = await dbRead(supabase
      .from('general_updates').select('*')
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())
      .order('created_at', { ascending: false }))
    setGeneralUpdates(genUpdates)

    // Notification badge
    const lastSeen = localStorage.getItem('ag_last_seen') || new Date(0).toISOString()
    const { count } = await supabase
      .from('steps')
      .select('*', { count: 'exact', head: true })
      .gt('updated_at', lastSeen)
      .neq('updated_by', profile.id)
    if (onBadgeCount) onBadgeCount(count || 0)
    localStorage.setItem('ag_last_seen', new Date().toISOString())
    } catch (err) {
      console.error('Load error:', err)
      setLoadError(true)
      showToast('Σφάλμα φόρτωσης', true)
    } finally {
      setLoading(false)
    }
  }

  // === VOICE RECORDING ===
  async function startRecording(target) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await transcribeAudio(blob, target)
      }
      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setVoiceTarget(target)
      setIsRecording(true)
    } catch (err) { alert('Δεν μπορώ να ανοίξω το μικρόφωνο') }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    setIsRecording(false)
  }

  async function transcribeAudio(blob, target) {
    setIsTranscribing(true)
    try {
      const path = `voice-tasks/${Date.now()}.webm`
      const { error: upErr } = await supabase.storage.from('files').upload(path, blob)
      if (upErr) throw new Error('Σφάλμα αποστολής ήχου')
      const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: urlData.publicUrl })
      })
      // Always clean up audio file
      await supabase.storage.from('files').remove([path]).catch(() => {})

      if (!res.ok) throw new Error('Η μεταγραφή απέτυχε')
      const data = await res.json()
      if (!data.transcript?.trim()) {
        showToast('Δεν αναγνωρίστηκε ομιλία', true)
        return
      }

      if (target === 'task') {
        // Use the SAME extraction pipeline as text input (one brain, two mouths)
        const extracted = await extractText(data.transcript, projects.map(p => p.name))
        if (extracted) {
          setTaskTitle(extracted.summary || data.transcript)
          if (extracted.project_name) {
            const matchedProj = projects.find(p =>
              p.name.toLowerCase().includes(extracted.project_name.toLowerCase()) ||
              extracted.project_name.toLowerCase().includes(p.name.toLowerCase())
            )
            if (matchedProj) setTaskProject(matchedProj.id)
          }
          if (extracted.people?.length > 0) {
            const matchedIds = []
            extracted.people.forEach(personName => {
              const match = profiles.find(p =>
                p.full_name?.toLowerCase().includes(personName.toLowerCase()) ||
                personName.toLowerCase().includes(p.full_name?.split(' ')[0]?.toLowerCase() || '')
              )
              if (match) matchedIds.push(match.id)
            })
            if (matchedIds.length > 0) setTaskAssignees(matchedIds)
          }
          if (extracted.deadline_date) setTaskDate(extracted.deadline_date)
          if (extracted.action_items?.length > 0) setTaskDesc(extracted.action_items.join(', '))
        } else {
          setTaskTitle(prev => prev ? prev + ' ' + data.transcript : data.transcript)
        }
      } else if (target === 'announcement') {
        setAnnText(prev => prev ? prev + ' ' + data.transcript : data.transcript)
      } else if (target === 'update') {
        setUpdateText(prev => prev ? prev + ' ' + data.transcript : data.transcript)
      }
    } catch (err) {
      console.error('Voice error:', err)
      showToast(err.message || 'Σφάλμα φωνής', true)
    } finally {
      setIsTranscribing(false)
      setVoiceTarget(null)
    }
  }

  // === ANNOUNCEMENTS ===
  async function saveAnnouncement() {
    if (!annText.trim()) return
    setAnnSaving(true)
    try {
      await db(supabase.from('announcements').insert({
        user_id: profile.id,
        user_name: profile.full_name,
        text: annText.trim()
      }))
      setAnnText('')
      setShowAnnouncementModal(false)
      await loadData()
    } catch (err) {
      showToast('Σφάλμα αποθήκευσης ανακοίνωσης', true)
    } finally {
      setAnnSaving(false)
    }
  }

  async function dismissAnnouncement(id) {
    try {
      await db(supabase.from('announcements').update({ is_active: false }).eq('id', id))
      await loadData()
    } catch (err) {
      showToast('Σφάλμα', true)
    }
  }

  // === TASK CREATION ===
  function openTaskModal() {
    setTaskTitle(''); setTaskDesc(''); setTaskProject('')
    setTaskAssignees([]); setTaskDate(''); setTaskTime('17:00')
    setTaskFile(null); setTaskUrgent(false)
    setShowTaskModal(true)
  }

  function toggleAssignee(personId) {
    setTaskAssignees(prev =>
      prev.includes(personId) ? prev.filter(id => id !== personId) : [...prev, personId]
    )
  }

  function selectAllAssignees() {
    if (taskAssignees.length === profiles.length) setTaskAssignees([])
    else setTaskAssignees(profiles.map(p => p.id))
  }

  async function handleSaveTask() {
    if (!taskTitle.trim()) return
    setTaskSaving(true)
    try {
      let fileUrl = null, fileName = null
      if (taskFile) {
        const ext = taskFile.name.split('.').pop()
        const path = `task-files/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('files').upload(path, taskFile)
        if (upErr) throw new Error('Σφάλμα μεταφόρτωσης αρχείου')
        const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
        fileUrl = urlData.publicUrl
        fileName = taskFile.name
      }

      let dueDate = null
      if (taskDate) dueDate = `${taskDate}T${taskTime || '17:00'}:00`

      const isPersonal = taskProject === 'personal'
      const isStaff = taskProject === 'staff'
      const projectId = (isPersonal || isStaff) ? null : (taskProject || null)

      let assigneeList = []
      if (isPersonal) {
        assigneeList = [{ id: profile.id, name: profile.full_name }]
      } else if (isStaff) {
        assigneeList = profiles.map(p => ({ id: p.id, name: p.full_name }))
      } else if (taskAssignees.length > 0) {
        assigneeList = taskAssignees.map(id => {
          const p = profiles.find(pr => pr.id === id)
          return { id, name: p?.full_name || '' }
        })
      } else {
        assigneeList = [{ id: null, name: null }]
      }

      let maxPos = 0
      if (projectId) {
        const ex = await db(supabase.from('steps').select('position')
          .eq('project_id', projectId).order('position', { ascending: false }).limit(1))
        maxPos = ex?.[0]?.position || 0
      }

      const groupId = assigneeList.length > 1 ? crypto.randomUUID() : null

      // Multi-assign: each insert checked — if one fails, user is told immediately
      for (let i = 0; i < assigneeList.length; i++) {
        await db(supabase.from('steps').insert({
          project_id: projectId,
          title: taskTitle.trim(),
          description: taskDesc.trim() || null,
          assigned_to: assigneeList[i].id,
          assigned_to_name: assigneeList[i].name,
          created_by: profile.id,
          created_by_name: profile.full_name,
          due_date: dueDate,
          status: 'not_started',
          position: maxPos + 1 + i,
          file_url: fileUrl,
          file_name: fileName,
          updated_by: profile.id,
          is_urgent: taskUrgent,
          group_id: groupId
        }))
      }

      setShowTaskModal(false)
      await loadData()
    } catch (err) {
      console.error('Save task error:', err)
      showToast('Σφάλμα αποθήκευσης εργασίας: ' + err.message, true)
    } finally {
      setTaskSaving(false)
    }
  }

  // === INLINE TASK STATUS ===
  async function updateTaskStatus(step, newStatus) {
    try {
      await db(supabase.from('steps').update({ status: newStatus, updated_by: profile.id }).eq('id', step.id))
      await loadData()
    } catch (err) {
      showToast('Σφάλμα ενημέρωσης κατάστασης', true)
    }
  }

  async function addTaskNote(stepId) {
    if (!taskNoteText.trim()) return
    try {
      await db(supabase.from('step_notes').insert({
        step_id: stepId, user_id: profile.id,
        user_name: profile.full_name, text: taskNoteText.trim()
      }))
      setTaskNoteText('')
      await loadData()
    } catch (err) {
      showToast('Σφάλμα αποθήκευσης σημείωσης', true)
    }
  }

  // === GENERAL UPDATE ===
  async function handleAddUpdate() {
    if (!updateText.trim()) return
    setSending(true)
    try {
      let fileUrl = null
      if (updateFile) {
        const ext = updateFile.name.split('.').pop()
        const path = `general/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('files').upload(path, updateFile)
        if (upErr) throw new Error('Σφάλμα μεταφόρτωσης')
        const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
        fileUrl = urlData.publicUrl
      }
      await db(supabase.from('general_updates').insert({
        user_id: profile.id, user_name: profile.full_name,
        text: updateText.trim(), file_url: fileUrl
      }))
      setUpdateText(''); setUpdateFile(null); setShowAddUpdate(false)
      await loadData()
    } catch (err) {
      showToast('Σφάλμα αποθήκευσης', true)
    } finally {
      setSending(false)
    }
  }

  // === PLAN REMINDERS ===
  async function markPlanDone(planId) {
    try {
      await db(supabase.from('manager_plans').update({ is_done: true }).eq('id', planId))
      await loadData()
    } catch (err) {
      showToast('Σφάλμα', true)
    }
  }

  // === HELPERS ===

  function getStatusClass(step) {
    if (step.status === 'done') return 'step-done'
    const info = getDaysInfo(step)
    if (info.className === 'step-overdue') return 'step-overdue'
    if (info.className === 'step-today' || info.className === 'step-soon') return 'step-soon'
    if (step.status === 'waiting') return 'step-waiting'
    if (step.status === 'in_progress') return 'step-progress'
    return ''
  }

  function getPersonUpdates() {
    const people = {}
    updates.forEach(u => {
      const name = u.assigned_to_name || 'Unknown'
      if (!people[name]) people[name] = []
      people[name].push({ type: 'task_done', text: u.title, project: u.projects?.name,
        time: new Date(u.updated_at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) })
    })
    generalUpdates.forEach(u => {
      const name = u.user_name || 'Unknown'
      if (!people[name]) people[name] = []
      people[name].push({ type: 'general', text: u.text, file_url: u.file_url,
        time: new Date(u.created_at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) })
    })
    return people
  }

  const statusOptions = [
    { value: 'not_started', label: 'Νέα', icon: '○' },
    { value: 'in_progress', label: 'Σε εξέλιξη', icon: '◐' },
    { value: 'waiting', label: 'Αναμονή', icon: '⏸' },
    { value: 'done', label: 'Έγινε', icon: '✓' }
  ]

  if (loading) return <div className="loading-inline"><div className="spinner" /></div>

  if (loadError) return (
    <div className="empty-state" style={{ padding: '40px 20px' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ marginBottom: 12 }}>Σφάλμα φόρτωσης</p>
      <button className="action-btn primary" onClick={loadData}>Δοκιμή ξανά</button>
    </div>
  )

  const overdueCount = getOverdueCount(mySteps)
  const personUpdates = getPersonUpdates()
  const otherProfiles = profiles.filter(p => p.id !== profile.id)
  const isPersonalTask = taskProject === 'personal'
  const isStaffTask = taskProject === 'staff'

  return (
    <div>
      {/* ===== GREETING HEADER ===== */}
      <div className="today-greeting">
        <div>
          <div className="today-date">{new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h2 className="today-hello">Καλημέρα, {profile?.full_name?.split(' ')[0] || ''}</h2>
        </div>
        {profile?.role === 'owner' && (
          <button className="announcement-add-compact" onClick={() => setShowAnnouncementModal(true)}>
            <Bell size={15} strokeWidth={1.8} /> Ανακοίνωση
          </button>
        )}
      </div>

      {/* ===== ANNOUNCEMENTS (pinned) ===== */}
      {announcements.length > 0 && (
        <div className="announcements-section">
          {announcements.map(ann => (
            <div key={ann.id} className="announcement-card">
              <div className="announcement-icon"><Bell size={18} strokeWidth={1.6} /></div>
              <div style={{ flex: 1 }}>
                <div className="announcement-text">{ann.text}</div>
                <div className="announcement-meta">
                  {ann.user_name} · {new Date(ann.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}
                </div>
              </div>
              {profile?.role === 'owner' && (
                <button className="announcement-dismiss" onClick={() => dismissAnnouncement(ann.id)}><X size={14} strokeWidth={1.6} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== PLAN REMINDERS (owner only) ===== */}
      {todayPlans.length > 0 && (
        <div className="today-section">
          <div className="today-section-header">
            <Sparkles size={16} strokeWidth={1.6} color="var(--purple)" />
            <span>Υπενθυμίσεις σήμερα</span>
          </div>
          {todayPlans.map(plan => (
            <div key={plan.id} className="plan-reminder-card">
              <span className="plan-reminder-text">{plan.text}</span>
              <button className="plan-action-btn plan-done-btn" onClick={() => markPlanDone(plan.id)}><CheckCircle2 size={16} strokeWidth={1.6} /></button>
            </div>
          ))}
        </div>
      )}

      {/* ===== NEW TASK BUTTON ===== */}
      <button className="new-task-fab" onClick={openTaskModal}>
        <Plus size={18} strokeWidth={1.6} />
        Νέα εργασία
      </button>

      {/* ===== MY TASKS ===== */}
      <div className="today-section">
        <div className="today-section-header">
          <ClipboardCheck size={16} strokeWidth={1.6} />
          <span>Οι εργασίες μου ({mySteps.length})</span>
          {overdueCount > 0 && <span className="overdue-badge">{overdueCount} εκπρόθεσμ{overdueCount > 1 ? 'ες' : 'η'}</span>}
        </div>

        {mySteps.length === 0 && <div className="empty-state" style={{ padding: '24px 16px' }}><CheckCircle2 size={20} strokeWidth={1.6} color="var(--green)" style={{ marginRight: 6 }} /> Δεν έχεις εκκρεμείς εργασίες</div>}

        {mySteps.map(step => {
          const info = getDaysInfo(step)
          const cls = getStatusClass(step)
          const isExpanded = expandedTask === step.id
          const notes = taskNotes[step.id] || []
          const dueTime = formatDueTime(step)

          return (
            <div key={step.id} className={`step-card ${cls}`} onClick={() => setExpandedTask(isExpanded ? null : step.id)}>
              <div className="step-card-top">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {step.is_urgent && <span className="urgent-badge">!</span>}
                    <span className="step-title">{step.title}</span>
                  </div>
                  {step.description && <div className="step-desc-preview">{step.description}</div>}
                  <div className="step-meta">
                    <span>{step.projects?.name || 'Προσωπικό'}</span>
                    {step.due_date && <><span className="step-sep">·</span><span>{info.text}</span></>}
                    {dueTime && <><span className="step-sep">·</span><span>{dueTime}</span></>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {step.file_url && <Paperclip size={12} strokeWidth={1.6} color="var(--text3)" />}
                  {notes.length > 0 && <span className="step-note-count">{notes.length}</span>}
                  <ChevronDown size={14} strokeWidth={1.6} color="var(--text3)" style={{ transform: isExpanded ? 'rotate(180deg)' : '', transition: '0.2s' }} />
                </div>
              </div>

              {isExpanded && (
                <div className="step-expanded" onClick={e => e.stopPropagation()}>
                  <div className="step-status-row">
                    {statusOptions.map(opt => (
                      <button key={opt.value}
                        className={`step-status-btn ${step.status === opt.value ? 'step-status-active' : ''}`}
                        onClick={() => updateTaskStatus(step, opt.value)}
                      >{opt.icon} {opt.label}</button>
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
                    <input className="step-note-input" placeholder="Σημείωση..." value={taskNoteText}
                      onChange={e => setTaskNoteText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTaskNote(step.id)} />
                    <button className="step-note-send" onClick={() => addTaskNote(step.id)} disabled={!taskNoteText.trim()}>
                      <Send size={14} strokeWidth={1.6} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ===== UPDATES BY PERSON ===== */}
      <div className="today-section">
        <div className="today-section-header">
          <MessageCircle size={16} strokeWidth={1.6} />
          <span>Ενημερώσεις σήμερα</span>
        </div>
        {Object.keys(personUpdates).length === 0 && <div className="updates-quiet-note">Καμία ενημέρωση ακόμη σήμερα</div>}
        {Object.entries(personUpdates).map(([name, items]) => (
          <div key={name} className="person-update-card" onClick={() => setExpandedPerson(expandedPerson === name ? null : name)}>
            <div className="person-update-header">
              <div className="person-avatar">{name.charAt(0)}</div>
              <span className="person-name">{name}</span>
              <span className="person-count">{items.length} ενημ.</span>
              <ChevronDown size={14} strokeWidth={1.6} style={{ transform: expandedPerson === name ? 'rotate(180deg)' : '', transition: '0.2s' }} />
            </div>
            {expandedPerson === name && (
              <div className="person-update-list">
                {items.map((item, i) => (
                  <div key={i} className="person-update-item">
                    <div className="update-time">{item.time}</div>
                    {item.type === 'task_done' ? (
                      <div className="update-text update-done">
                        <CheckCircle2 size={12} strokeWidth={2} color="var(--green)" />
                        {item.text} <span className="update-project">({item.project})</span>
                      </div>
                    ) : <div className="update-text">{item.text}</div>}
                    {item.file_url && <a href={item.file_url} target="_blank" rel="noopener" className="update-file"><Paperclip size={12} strokeWidth={1.6} style={{ marginRight: 3 }} /> Αρχείο</a>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {otherProfiles.filter(p => !personUpdates[p.full_name]).map(p => (
          <div key={p.id} className="person-update-card person-no-update">
            <div className="person-update-header">
              <div className="person-avatar person-avatar-inactive">{p.full_name?.charAt(0)}</div>
              <span className="person-name" style={{ opacity: 0.5 }}>{p.full_name}</span>
              <span className="person-count" style={{ opacity: 0.4 }}>Χωρίς ενημ.</span>
            </div>
          </div>
        ))}
      </div>

      {/* ===== GENERAL UPDATE ===== */}
      {showAddUpdate ? (
        <div className="today-add-update">
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <textarea className="today-update-textarea" placeholder="Γενική ενημέρωση..." value={updateText}
              onChange={e => setUpdateText(e.target.value)} rows={3} autoFocus style={{ flex: 1 }} />
            <button
              className={`voice-btn ${isRecording && voiceTarget === 'update' ? 'voice-btn-recording' : ''}`}
              onClick={isRecording && voiceTarget === 'update' ? stopRecording : () => startRecording('update')}
              disabled={isTranscribing} style={{ marginTop: 2, width: 40, height: 40, minWidth: 40 }}
            >
              {isTranscribing && voiceTarget === 'update' ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> :
                <Mic size={16} strokeWidth={1.6} />}
            </button>
          </div>
          <div className="today-update-actions">
            <label className="today-file-btn">
              <Paperclip size={14} strokeWidth={1.6} /> <input type="file" accept="image/*" onChange={e => setUpdateFile(e.target.files[0])} hidden />
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="action-btn" onClick={() => { setShowAddUpdate(false); setUpdateText(''); setUpdateFile(null) }}>Ακύρωση</button>
              <button className="action-btn primary" onClick={handleAddUpdate} disabled={!updateText.trim() || sending}>{sending ? '...' : 'Δημοσίευση'}</button>
            </div>
          </div>
          {updateFile && <div className="today-file-name">{updateFile.name}</div>}
        </div>
      ) : (
        <button className="today-add-btn" onClick={() => setShowAddUpdate(true)}>
          <Plus size={16} strokeWidth={1.6} />
          Γενική ενημέρωση
        </button>
      )}

      {/* ===== ANNOUNCEMENT MODAL ===== */}
      {showAnnouncementModal && (
        <div className="modal-overlay" onClick={() => setShowAnnouncementModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <p className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bell size={18} strokeWidth={1.6} /> Νέα ανακοίνωση</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea className="modal-input" placeholder="Γράψε ή μίλα..." value={annText}
                onChange={e => setAnnText(e.target.value)} rows={3} autoFocus style={{ flex: 1, resize: 'vertical', fontFamily: 'inherit' }} />
              <button
                className={`voice-btn ${isRecording && voiceTarget === 'announcement' ? 'voice-btn-recording' : ''}`}
                onClick={isRecording && voiceTarget === 'announcement' ? stopRecording : () => startRecording('announcement')}
                disabled={isTranscribing}
              >
                {isTranscribing && voiceTarget === 'announcement' ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> :
                  <Mic size={18} strokeWidth={1.6} />}
              </button>
            </div>
            <div className="modal-actions">
              <button className="action-btn" onClick={() => setShowAnnouncementModal(false)}>Ακύρωση</button>
              <button className="action-btn primary" onClick={saveAnnouncement} disabled={!annText.trim() || annSaving}>{annSaving ? '...' : 'Δημοσίευση'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NEW TASK MODAL ===== */}
      {showTaskModal && (
        <div className="modal-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="modal-content task-modal" onClick={e => e.stopPropagation()}>
            <p className="modal-title">Νέα εργασία</p>

            {/* Title + voice */}
            <div className="task-title-row">
              <input className="modal-input" placeholder="Τίτλος εργασίας *" value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)} autoFocus style={{ flex: 1 }} />
              <button className={`voice-btn ${isRecording && voiceTarget === 'task' ? 'voice-btn-recording' : ''}`}
                onClick={isRecording && voiceTarget === 'task' ? stopRecording : () => startRecording('task')}
                disabled={isTranscribing}>
                {isTranscribing && voiceTarget === 'task' ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> :
                  <Mic size={18} strokeWidth={1.6} />}
              </button>
            </div>

            {/* Description */}
            <textarea className="modal-input" placeholder="Περιγραφή (προαιρετικά)" value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)} rows={2} style={{ resize: 'vertical', fontFamily: 'inherit' }} />

            {/* Project */}
            <select className="modal-input" value={taskProject} onChange={e => { setTaskProject(e.target.value); if (e.target.value === 'personal' || e.target.value === 'staff') setTaskAssignees([]) }}>
              <option value="">Έργο...</option>
              <option value="personal">👤 Για εμένα</option>
              <option value="staff">👥 Όλο το γραφείο</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {/* Assign to: hidden for personal, multi-select for others */}
            {!isPersonalTask && !isStaffTask && (
              <div className="assignee-picker">
                <div className="assignee-picker-label">
                  Ανάθεση σε
                  {profile?.role === 'owner' && (
                    <button className="assignee-all-btn" onClick={selectAllAssignees}>
                      {taskAssignees.length === profiles.length ? 'Κανένας' : 'Όλοι'}
                    </button>
                  )}
                </div>
                <div className="assignee-list">
                  {profiles.map(p => (
                    <label key={p.id} className={`assignee-chip ${taskAssignees.includes(p.id) ? 'assignee-chip-active' : ''}`}>
                      <input type="checkbox" checked={taskAssignees.includes(p.id)} onChange={() => toggleAssignee(p.id)} hidden />
                      <span className="assignee-chip-avatar">{p.full_name?.charAt(0)}</span>
                      {p.full_name?.split(' ')[0]}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Date + Time */}
            <div className="task-datetime-row">
              <input className="modal-input" type="date" value={taskDate} onChange={e => setTaskDate(e.target.value)} style={{ flex: 1 }} />
              <input className="modal-input" type="time" value={taskTime} onChange={e => setTaskTime(e.target.value)} style={{ width: 110 }} />
            </div>

            {/* Urgent toggle + File */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`urgent-toggle ${taskUrgent ? 'urgent-toggle-on' : ''}`}
                onClick={() => setTaskUrgent(!taskUrgent)}
              >
                <AlertTriangle size={16} strokeWidth={1.6} /> Επείγον
              </button>
              <label className="task-attach-btn" style={{ flex: 1 }}>
                <Paperclip size={16} strokeWidth={1.6} />
                {taskFile ? taskFile.name : 'Αρχείο'}
                <input type="file" onChange={e => setTaskFile(e.target.files[0])} hidden />
              </label>
            </div>

            <div className="modal-actions">
              <button className="action-btn" onClick={() => setShowTaskModal(false)}>Ακύρωση</button>
              <button className="action-btn primary" onClick={handleSaveTask} disabled={!taskTitle.trim() || taskSaving}>
                {taskSaving ? '...' : 'Αποθήκευση'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.isError ? "toast-error" : "toast-success"}`}>{toast.msg}</div>}
    </div>
  )
}
