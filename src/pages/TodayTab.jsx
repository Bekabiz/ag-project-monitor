import { useState, useEffect, useRef } from 'react'

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().split('T')[0]
}
import { Megaphone, Plus, ClipboardCheck, MessageCircle, AlertTriangle, Paperclip, ChevronDown, Send, Mic, Sparkles, Circle, Play, Pause, Check, CheckCircle2, User, Users, RefreshCw, FileText, CalendarDays, Zap } from 'lucide-react'
import { db, dbRead, supabase } from '../lib/db'
import { getDaysInfo, formatDueTime, getOverdueCount } from '../lib/dates'
import { extractText } from '../lib/voice'
import { sortProfiles } from '../lib/people'
import { isPushSupported, subscribeToPush, isSubscribed as checkPushSubscribed } from '../lib/push'
import { ButtonSpinner, EmptyState, LoadingState, ModalShell } from '../components/ui'

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
  const [selectedDate, setSelectedDate] = useState(() => localDateValue())
  const [showAddUpdate, setShowAddUpdate] = useState(false)
  const [updateProject, setUpdateProject] = useState('')
  const [updateText, setUpdateText] = useState('')
  const [updateFile, setUpdateFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [expandedPerson, setExpandedPerson] = useState(null)
  const [seenUpdates, setSeenUpdates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ag_seen_updates') || '{}') } catch { return {} }
  })

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
  const [taskAsap, setTaskAsap] = useState(false)
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
  const [pushEnabled, setPushEnabled] = useState(false)

  useEffect(() => { loadData() }, [selectedDate])

  // Auto-refresh every 15 seconds — only when not interacting
  useEffect(() => {
    const interval = setInterval(() => {
      if (showTaskModal || isRecording || taskSaving) return
      loadData(true) // true = silent mode, no loading spinner
    }, 15000)
    return () => clearInterval(interval)
  }, [selectedDate, showTaskModal, isRecording, taskSaving])

  useEffect(() => {
    if (isPushSupported()) checkPushSubscribed().then(setPushEnabled)
  }, [])

  async function handleTogglePush() {
    if (pushEnabled) return
    const result = await subscribeToPush(profile.id)
    if (result.ok) {
      setPushEnabled(true)
      showToast('Οι ειδοποιήσεις ενεργοποιήθηκαν')
    } else if (result.reason === 'denied') {
      showToast('Οι ειδοποιήσεις δεν επιτρέπονται από το πρόγραμμα περιήγησης', true)
    } else if (result.reason !== 'unsupported') {
      showToast('Σφάλμα ενεργοποίησης ειδοποιήσεων', true)
    }
  }

  function showToast(msg, isError) {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 2500)
  }

  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    try {
      setLoadError(false)
    const today = new Date(`${selectedDate}T00:00:00`)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const profs = await dbRead(supabase.from('profiles').select('*'))
    setProfiles(sortProfiles(profs))

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
      const todayStr = selectedDate
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

    // Office updates and project-memory updates for the selected day
    const [officeUpdates, projectUpdates] = await Promise.all([
      dbRead(supabase.from('general_updates').select('*')
        .gte('created_at', today.toISOString()).lt('created_at', tomorrow.toISOString())
        .order('created_at', { ascending: false })),
      dbRead(supabase.from('entries').select('*, projects:project_id(name)')
        .eq('category', 'work_update')
        .gte('created_at', today.toISOString()).lt('created_at', tomorrow.toISOString())
        .order('created_at', { ascending: false }))
    ])
    const normalizedProjectUpdates = projectUpdates.map(entry => ({
      ...entry,
      text: entry.raw_text || entry.ai_summary || entry.title || '',
      user_name: entry.submitter_name,
      project_name: entry.projects?.name || null,
      source: 'project'
    }))
    setGeneralUpdates([...officeUpdates, ...normalizedProjectUpdates]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))

    // Notification badge
    const lastSeen = localStorage.getItem('ag_last_seen') || new Date(0).toISOString()
    const { count, error: countError } = await supabase
      .from('steps')
      .select('*', { count: 'exact', head: true })
      .gt('updated_at', lastSeen)
      .neq('updated_by', profile.id)
    if (countError) console.warn('Notification count error:', countError)
    else if (onBadgeCount) onBadgeCount(count || 0)
    localStorage.setItem('ag_last_seen', new Date().toISOString())
    } catch (err) {
      console.error('Load error:', err)
      if (!silent) {
        setLoadError(true)
        showToast('Σφάλμα φόρτωσης', true)
      }
    } finally {
      if (!silent) setLoading(false)
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
    } catch (err) { showToast('Δεν ήταν δυνατή η πρόσβαση στο μικρόφωνο. Ελέγξτε την άδεια του browser.', true) }
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
      } else if (target === 'taskDesc') {
        setTaskDesc(prev => prev ? prev + ' ' + data.transcript : data.transcript)
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
    setTaskFile(null); setTaskUrgent(false); setTaskAsap(false)
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
      if (!taskAsap && taskDate) dueDate = `${taskDate}T${taskTime || '17:00'}:00`

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
          is_urgent: taskAsap || taskUrgent,
          group_id: groupId
        }))
      }

      setShowTaskModal(false)
      await loadData()

      // Send push notification to assigned people
      for (const person of assigneeList) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: person.id,
            title: 'Νέα εργασία',
            body: taskTitle.trim(),
            url: '/',
            tag: 'task-new'
          })
        })
          .then(r => r.json())
          .then(data => console.log('[Notify] Sent to', person.name, '→', data))
          .catch(err => console.error('[Notify] Failed for', person.name, err))
      }
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

      // Notify owner when team completes a task
      if (newStatus === 'done' && profile.role !== 'owner') {
        const owners = await dbRead(supabase.from('profiles').select('id').eq('role', 'owner'))
        for (const owner of (owners || [])) {
          fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: owner.id,
              title: 'Εργασία ολοκληρώθηκε',
              body: `${profile.full_name}: ${step.title}`,
              url: '/',
              tag: 'task-done'
            })
          }).catch(() => {})
        }
      }
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
      if (updateProject) {
        await db(supabase.from('entries').insert({
          project_id: updateProject,
          user_id: profile.id,
          entry_type: updateFile ? 'photo' : 'text',
          raw_text: updateText.trim(),
          ai_summary: updateText.trim().substring(0, 200),
          title: updateText.trim().substring(0, 80),
          category: 'work_update',
          tags: null,
          entry_status: null,
          submitter_name: profile.full_name,
          file_url: fileUrl,
          file_name: updateFile?.name || null,
          is_team_visible: true
        }))
      } else {
        await db(supabase.from('general_updates').insert({
          user_id: profile.id, user_name: profile.full_name,
          text: updateText.trim(), file_url: fileUrl
        }))
        await db(supabase.from('entries').insert({
          project_id: null,
          user_id: profile.id,
          entry_type: 'general',
          raw_text: updateText.trim(),
          ai_summary: updateText.trim().substring(0, 200),
          title: updateText.trim().substring(0, 80),
          category: 'note',
          tags: ['general', 'update'],
          submitter_name: profile.full_name,
          file_url: fileUrl,
          is_team_visible: true
        }))
      }
      setUpdateText(''); setUpdateFile(null); setUpdateProject(''); setShowAddUpdate(false)
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

  function markPersonSeen(name, items) {
    const latest = items.reduce((max, item) => {
      const t = item.rawTime || 0
      return t > max ? t : max
    }, 0)
    if (latest > 0) {
      const next = { ...seenUpdates, [name]: latest }
      setSeenUpdates(next)
      try { localStorage.setItem('ag_seen_updates', JSON.stringify(next)) } catch {}
    }
  }

  function getUnreadCount(name, items) {
    const lastSeen = seenUpdates[name] || 0
    return items.filter(item => (item.rawTime || 0) > lastSeen).length
  }

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
      const name = u.assigned_to_name || 'Άγνωστο μέλος'
      if (!people[name]) people[name] = []
      people[name].push({ type: 'task_done', text: u.title, project: u.projects?.name,
        rawTime: new Date(u.updated_at).getTime(),
        time: new Date(u.updated_at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) })
    })
    generalUpdates.forEach(u => {
      const name = u.user_name || 'Άγνωστο μέλος'
      if (!people[name]) people[name] = []
      people[name].push({ type: 'general', text: u.text, file_url: u.file_url, project: u.project_name,
        rawTime: new Date(u.created_at).getTime(),
        time: new Date(u.created_at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) })
    })
    return people
  }

  const statusOptions = [
    { value: 'not_started', label: 'Δεν ξεκίνησε', icon: Circle },
    { value: 'in_progress', label: 'Σε εξέλιξη', icon: Play },
    { value: 'waiting', label: 'Σε αναμονή', icon: Pause },
    { value: 'done', label: 'Ολοκληρώθηκε', icon: Check }
  ]

  if (loading) return <LoadingState label="Φόρτωση σημερινής εικόνας…" cards={4} />

  if (loadError) return (
    <EmptyState
      icon={RefreshCw}
      title="Δεν φορτώθηκε η σημερινή εικόνα"
      description="Ελέγξτε τη σύνδεση και δοκιμάστε ξανά. Δεν έχει αλλάξει κανένα αποθηκευμένο δεδομένο."
      actionLabel="Δοκιμή ξανά"
      onAction={loadData}
    />
  )

  const overdueCount = getOverdueCount(mySteps)
  const personUpdates = getPersonUpdates()
  const otherProfiles = profiles.filter(p => p.id !== profile.id)
  const isPersonalTask = taskProject === 'personal'
  const isStaffTask = taskProject === 'staff'
  const totalTodayUpdates = updates.length + generalUpdates.length
  const activeTeamMembers = Object.keys(personUpdates).length
  const firstName = profile?.full_name?.split(' ')[0] || ''
  const todayDateValue = localDateValue()
  const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayDateValue = localDateValue(yesterdayDate)
  const selectedDayLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className={`today-page today-command-page ${profile?.role === 'owner' ? 'today-owner' : 'today-member'}`}>
      <section className="today-command-header">
        <div className="today-command-copy">
          <div className="today-date">{selectedDayLabel}</div>
          <h2 className="today-hello">Καλημέρα, {firstName}</h2>
          <p>Η σημερινή εικόνα του γραφείου, οι προτεραιότητες και ό,τι χρειάζεται ενέργεια.</p>
        </div>
        <div className="today-command-actions">
          <div className="today-history-control" aria-label="Επιλογή ημέρας">
            <button type="button" className={selectedDate === yesterdayDateValue ? 'is-active' : ''} onClick={() => setSelectedDate(yesterdayDateValue)}>Χθες</button>
            <button type="button" className={selectedDate === todayDateValue ? 'is-active' : ''} onClick={() => setSelectedDate(todayDateValue)}>Σήμερα</button>
            <label className="today-date-picker" aria-label="Επιλογή ημερομηνίας"><CalendarDays size={15} strokeWidth={1.5} aria-hidden="true" /><input type="date" value={selectedDate} max={todayDateValue} onChange={event => setSelectedDate(event.target.value)} /></label>
          </div>
          {profile?.role === 'owner' && (
            <button type="button" className="today-secondary-action" onClick={() => setShowAnnouncementModal(true)}>
              <Megaphone size={16} strokeWidth={1.5} aria-hidden="true" />
              <span>Νέα ανακοίνωση</span>
            </button>
          )}
          <button type="button" className="today-primary-action" onClick={openTaskModal}>
            <Plus size={17} strokeWidth={1.5} aria-hidden="true" />
            <span>Νέα εργασία</span>
          </button>
        </div>
      </section>

      <section className="today-kpi-grid" aria-label="Σύνοψη ημέρας">
        <article className="today-kpi-card">
          <span className="today-kpi-icon is-primary" aria-hidden="true"><ClipboardCheck size={19} strokeWidth={1.5} /></span>
          <div><strong>{mySteps.length}</strong><span>Ενεργές εργασίες</span></div>
        </article>
        <article className={`today-kpi-card ${overdueCount > 0 ? 'is-attention' : ''}`}>
          <span className="today-kpi-icon is-danger" aria-hidden="true"><AlertTriangle size={19} strokeWidth={1.5} /></span>
          <div><strong>{overdueCount}</strong><span>Εκπρόθεσμες</span></div>
        </article>
        <article className="today-kpi-card">
          <span className="today-kpi-icon is-info" aria-hidden="true"><MessageCircle size={19} strokeWidth={1.5} /></span>
          <div><strong>{totalTodayUpdates}</strong><span>{selectedDate === todayDateValue ? 'Ενημερώσεις σήμερα' : 'Ενημερώσεις ημέρας'}</span></div>
        </article>
        <article className="today-kpi-card">
          <span className="today-kpi-icon is-success" aria-hidden="true"><Users size={19} strokeWidth={1.5} /></span>
          <div><strong>{activeTeamMembers}</strong><span>Μέλη με δραστηριότητα</span></div>
        </article>
      </section>

      <div className="today-dashboard-grid">
        <div className="today-main-column">
          {announcements.length > 0 && (
            <section className="today-panel today-announcements-panel">
              <div className="today-panel-heading">
                <div><span className="today-panel-icon is-warning" aria-hidden="true"><Megaphone size={17} strokeWidth={1.5} /></span><div><h3>Ανακοινώσεις</h3><p>Σημαντικά μηνύματα προς την ομάδα</p></div></div>
                <span className="today-panel-count">{announcements.length}</span>
              </div>
              <div className="today-announcement-list">
                {announcements.map(announcement => (
                  <article key={announcement.id} className="today-announcement-item">
                    <div className="today-announcement-copy">
                      <p>{announcement.text}</p>
                      <span>{announcement.user_name} · {new Date(announcement.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    {profile?.role === 'owner' && (
                      <button type="button" className="today-text-action is-danger" onClick={() => dismissAnnouncement(announcement.id)}>Αρχειοθέτηση</button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {todayPlans.length > 0 && (
            <section className="today-panel today-plans-panel">
              <div className="today-panel-heading">
                <div><span className="today-panel-icon is-purple" aria-hidden="true"><Sparkles size={17} strokeWidth={1.5} /></span><div><h3>Υπενθυμίσεις σήμερα</h3><p>Προσωπικό πλάνο και επόμενες ενέργειες</p></div></div>
                <span className="today-panel-count">{todayPlans.length}</span>
              </div>
              <div className="today-plan-list">
                {todayPlans.map(plan => (
                  <div key={plan.id} className="today-plan-row">
                    <span>{plan.text}</span>
                    <button type="button" className="today-complete-button" onClick={() => markPlanDone(plan.id)} aria-label={`Ολοκλήρωση: ${plan.text}`}>
                      <CheckCircle2 size={17} strokeWidth={1.5} aria-hidden="true" /> Ολοκληρώθηκε
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="today-panel today-tasks-panel">
            <div className="today-panel-heading">
              <div><span className="today-panel-icon is-primary" aria-hidden="true"><ClipboardCheck size={17} strokeWidth={1.5} /></span><div><h3>Οι εργασίες μου</h3><p>Ταξινομημένες με βάση επείγον και προθεσμία</p></div></div>
              <div className="today-heading-actions">
                {overdueCount > 0 && <span className="today-attention-pill">{overdueCount} εκπρόθεσμ{overdueCount === 1 ? 'η' : 'ες'}</span>}
                <button type="button" className="today-icon-action" onClick={loadData} aria-label="Ανανέωση εργασιών"><RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" /></button>
              </div>
            </div>

            {mySteps.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Δεν υπάρχουν εκκρεμείς εργασίες" description="Η λίστα σας είναι καθαρή. Μια νέα ανάθεση θα εμφανιστεί εδώ." compact />
            ) : (
              <div className="today-task-list">
                {mySteps.map(step => {
                  const info = getDaysInfo(step)
                  const cls = getStatusClass(step)
                  const isExpanded = expandedTask === step.id
                  const notes = taskNotes[step.id] || []
                  const dueTime = formatDueTime(step)

                  return (
                    <article key={step.id} className={`today-task-card ${cls} ${isExpanded ? 'is-expanded' : ''}`}>
                      <button type="button" className="today-task-summary" onClick={() => setExpandedTask(isExpanded ? null : step.id)} aria-expanded={isExpanded}>
                        <span className={`today-task-priority ${step.is_urgent ? 'is-urgent' : ''}`} aria-hidden="true">{step.is_urgent ? '!' : ''}</span>
                        <span className="today-task-copy">
                          <span className="today-task-title-row"><strong>{step.title}</strong>{step.is_urgent && <em className={!step.due_date ? 'is-asap' : ''}>{!step.due_date ? 'ASAP' : 'Επείγον'}</em>}</span>
                          {step.description && <span className="today-task-description">{step.description}</span>}
                          <span className="today-task-meta">
                            <span>{step.projects?.name || 'Προσωπικό'}</span>
                            {step.due_date && <span className={info.className === 'step-overdue' ? 'is-overdue' : ''}>{info.text}</span>}
                            {dueTime && <span>{dueTime}</span>}
                            {notes.length > 0 && <span>{notes.length} σημειώσεις</span>}
                          </span>
                        </span>
                        <span className="today-task-end">
                          {step.file_url && <Paperclip size={14} strokeWidth={1.5} aria-label="Υπάρχει συνημμένο" />}
                          <ChevronDown size={17} strokeWidth={1.5} aria-hidden="true" className={isExpanded ? 'is-rotated' : ''} />
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="today-task-details">
                          <div className="today-task-detail-label">Κατάσταση εργασίας</div>
                          <div className="today-status-options">
                            {statusOptions.map(option => {
                              const StatusIcon = option.icon
                              return (
                                <button key={option.value} type="button" className={`today-status-button status-${option.value} ${step.status === option.value ? 'is-active' : ''}`} onClick={() => updateTaskStatus(step, option.value)} aria-pressed={step.status === option.value}>
                                  <StatusIcon size={14} strokeWidth={1.5} aria-hidden="true" />
                                  <span>{option.label}</span>
                                </button>
                              )
                            })}
                          </div>

                          {step.file_url && (
                            <a href={step.file_url} target="_blank" rel="noopener noreferrer" className="today-file-link"><Paperclip size={15} strokeWidth={1.5} aria-hidden="true" />{step.file_name || 'Άνοιγμα αρχείου'}</a>
                          )}

                          {notes.length > 0 && (
                            <div className="today-note-list">
                              {notes.map(note => (
                                <div key={note.id} className="today-note-row"><p><strong>{note.user_name}</strong>{note.text}</p><time>{new Date(note.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</time></div>
                              ))}
                            </div>
                          )}

                          <div className="today-note-composer">
                            <label htmlFor={`task-note-${step.id}`} className="sr-only">Προσθήκη σημείωσης</label>
                            <input id={`task-note-${step.id}`} placeholder="Γράψτε μια σύντομη σημείωση…" value={taskNoteText} onChange={event => setTaskNoteText(event.target.value)} onKeyDown={event => event.key === 'Enter' && addTaskNote(step.id)} />
                            <button type="button" onClick={() => addTaskNote(step.id)} disabled={!taskNoteText.trim()} aria-label="Αποστολή σημείωσης"><Send size={16} strokeWidth={1.5} aria-hidden="true" /></button>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="today-side-column">
          <section className="today-panel today-team-panel">
            <div className="today-panel-heading">
              <div><span className="today-panel-icon is-info" aria-hidden="true"><Users size={17} strokeWidth={1.5} /></span><div><h3>Κίνηση ομάδας</h3><p>Ποιος ενημέρωσε σήμερα</p></div></div>
            </div>

            <div className="today-team-list">
              {Object.entries(personUpdates).map(([name, items]) => {
                const isExpanded = expandedPerson === name
                const unread = getUnreadCount(name, items)
                return (
                  <article key={name} className={`today-person-card ${isExpanded ? 'is-expanded' : ''}`}>
                    <button type="button" className="today-person-summary" onClick={() => { setExpandedPerson(isExpanded ? null : name); if (!isExpanded) markPersonSeen(name, items) }} aria-expanded={isExpanded}>
                      <span className="today-person-avatar" aria-hidden="true">{name.charAt(0)}</span>
                      <span className="today-person-copy"><strong>{name}</strong><small>{items.length} ενημέρωσ{items.length === 1 ? 'η' : 'εις'}</small></span>
                      {unread > 0 ? <span className="today-unread-badge">{unread}</span> : <span className="today-activity-dot" aria-label="Υπάρχει δραστηριότητα" />}
                      <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" className={isExpanded ? 'is-rotated' : ''} />
                    </button>
                    {isExpanded && (
                      <div className="today-person-updates">
                        {items.map((item, index) => (
                          <div key={`${name}-${index}`} className="today-person-update">
                            <time>{item.time}</time>
                            <div>{item.type === 'task_done' && <CheckCircle2 size={13} strokeWidth={1.5} aria-hidden="true" />}<span>{item.text}{item.project ? ` · ${item.project}` : ''}</span></div>
                            {item.file_url && <a href={item.file_url} target="_blank" rel="noopener noreferrer">Αρχείο</a>}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                )
              })}

              {otherProfiles.filter(person => !personUpdates[person.full_name]).map(person => (
                <div key={person.id} className="today-person-card is-quiet">
                  <div className="today-person-summary">
                    <span className="today-person-avatar" aria-hidden="true">{person.full_name?.charAt(0)}</span>
                    <span className="today-person-copy"><strong>{person.full_name}</strong><small>{selectedDate === todayDateValue ? 'Χωρίς ενημέρωση σήμερα' : 'Χωρίς ενημέρωση αυτή την ημέρα'}</small></span>
                    <span className="today-quiet-dot" aria-hidden="true" />
                  </div>
                </div>
              ))}

              {profiles.length <= 1 && <p className="today-quiet-message">Δεν υπάρχουν άλλα μέλη στην ομάδα.</p>}
            </div>
          </section>

          <section className="today-panel today-update-panel">
            <div className="today-panel-heading">
              <div><span className="today-panel-icon is-success" aria-hidden="true"><MessageCircle size={17} strokeWidth={1.5} /></span><div><h3>Ενημέρωση γραφείου ή έργου</h3><p>Η πληροφορία αποθηκεύεται εκεί που ανήκει</p></div></div>
            </div>

            {!showAddUpdate ? (
              <button type="button" className="today-open-composer" onClick={() => setShowAddUpdate(true)}><Plus size={17} strokeWidth={1.5} aria-hidden="true" />Προσθήκη ενημέρωσης</button>
            ) : (
              <div className="today-update-composer">
                <label htmlFor="update-project">Πού αφορά</label><select id="update-project" className="today-update-project" value={updateProject} onChange={event => setUpdateProject(event.target.value)}><option value="">Γενική ενημέρωση γραφείου</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><label htmlFor="general-update">Κείμενο ενημέρωσης</label>
                <div className="today-update-input-wrap">
                  <textarea id="general-update" placeholder="Τι πρέπει να γνωρίζει η ομάδα;" value={updateText} onChange={event => setUpdateText(event.target.value)} rows={4} autoFocus />
                  <button type="button" className={`today-voice-button ${isRecording && voiceTarget === 'update' ? 'is-recording' : ''}`} onClick={isRecording && voiceTarget === 'update' ? stopRecording : () => startRecording('update')} disabled={isTranscribing} aria-label={isRecording ? 'Διακοπή εγγραφής' : 'Φωνητική ενημέρωση'}>
                    {isTranscribing && voiceTarget === 'update' ? <span className="spinner" /> : <Mic size={17} strokeWidth={1.5} aria-hidden="true" />}
                  </button>
                </div>
                {updateFile && <div className="today-selected-file"><Paperclip size={14} strokeWidth={1.5} aria-hidden="true" />{updateFile.name}</div>}
                <div className="today-composer-footer">
                  <label className="today-attach-button"><Paperclip size={15} strokeWidth={1.5} aria-hidden="true" />Επισύναψη<input type="file" accept="image/*" onChange={event => setUpdateFile(event.target.files[0])} hidden /></label>
                  <div><button type="button" className="action-btn" onClick={() => { setShowAddUpdate(false); setUpdateText(''); setUpdateFile(null); setUpdateProject('') }}>Ακύρωση</button><button type="button" className="action-btn primary" onClick={handleAddUpdate} disabled={!updateText.trim() || sending}>{sending ? <ButtonSpinner label="Δημοσίευση…" /> : 'Δημοσίευση'}</button></div>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      <ModalShell
        open={showAnnouncementModal}
        onClose={() => setShowAnnouncementModal(false)}
        title="Νέα ανακοίνωση"
        description="Η ανακοίνωση θα εμφανιστεί στην κορυφή της σημερινής σελίδας για όλη την ομάδα."
        icon={Megaphone}
        size="md"
        actions={<><button type="button" className="action-btn" onClick={() => setShowAnnouncementModal(false)}>Ακύρωση</button><button type="button" className="action-btn primary" onClick={saveAnnouncement} disabled={!annText.trim() || annSaving}>{annSaving ? <ButtonSpinner label="Δημοσίευση…" /> : 'Δημοσίευση'}</button></>}
      >
        <div className="today-modal-field">
          <label htmlFor="announcement-text">Μήνυμα ανακοίνωσης</label>
          <div className="today-update-input-wrap">
            <textarea id="announcement-text" placeholder="Γράψτε ή υπαγορεύστε το μήνυμα…" value={annText} onChange={event => setAnnText(event.target.value)} rows={5} autoFocus />
            <button type="button" className={`today-voice-button ${isRecording && voiceTarget === 'announcement' ? 'is-recording' : ''}`} onClick={isRecording && voiceTarget === 'announcement' ? stopRecording : () => startRecording('announcement')} disabled={isTranscribing} aria-label={isRecording ? 'Διακοπή εγγραφής' : 'Υπαγόρευση ανακοίνωσης'}>
              {isTranscribing && voiceTarget === 'announcement' ? <span className="spinner" /> : <Mic size={18} strokeWidth={1.5} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        title="Νέα εργασία"
        description="Ορίστε τίτλο, υπεύθυνο και επιλέξτε ASAP ή συγκεκριμένη προθεσμία."
        icon={ClipboardCheck}
        size="lg"
        actions={<><button type="button" className="action-btn" onClick={() => setShowTaskModal(false)}>Ακύρωση</button><button type="button" className="action-btn primary" onClick={handleSaveTask} disabled={!taskTitle.trim() || taskSaving}>{taskSaving ? <ButtonSpinner label="Αποθήκευση…" /> : 'Δημιουργία εργασίας'}</button></>}
      >
        <div className="today-task-form">
          <div className="today-form-field is-full">
            <label htmlFor="task-title">Τίτλος εργασίας <span>*</span></label>
            <div className="today-update-input-wrap">
              <input id="task-title" placeholder="π.χ. Επιβεβαίωση σχεδίων με τον μηχανικό" value={taskTitle} onChange={event => setTaskTitle(event.target.value)} autoFocus />
              <button type="button" className={`today-voice-button ${isRecording && voiceTarget === 'task' ? 'is-recording' : ''}`} onClick={isRecording && voiceTarget === 'task' ? stopRecording : () => startRecording('task')} disabled={isTranscribing} aria-label={isRecording ? 'Διακοπή εγγραφής' : 'Υπαγόρευση τίτλου'}>
                {isTranscribing && voiceTarget === 'task' ? <span className="spinner" /> : <Mic size={18} strokeWidth={1.5} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="today-form-field is-full"><label htmlFor="task-description">Περιγραφή</label><div className="today-update-input-wrap"><textarea id="task-description" placeholder="Προσθέστε τις απαραίτητες λεπτομέρειες…" value={taskDesc} onChange={event => setTaskDesc(event.target.value)} rows={3} /><button type="button" className={`today-voice-button ${isRecording && voiceTarget === 'taskDesc' ? 'is-recording' : ''}`} onClick={isRecording && voiceTarget === 'taskDesc' ? stopRecording : () => startRecording('taskDesc')} disabled={isTranscribing} aria-label={isRecording ? 'Διακοπή εγγραφής' : 'Υπαγόρευση περιγραφής'}>{isTranscribing && voiceTarget === 'taskDesc' ? <span className="spinner" /> : <Mic size={17} strokeWidth={1.5} aria-hidden="true" />}</button></div></div>

          <div className="today-form-field is-full"><label htmlFor="task-project">Έργο ή τύπος εργασίας</label><select id="task-project" value={taskProject} onChange={event => { setTaskProject(event.target.value); if (event.target.value === 'personal' || event.target.value === 'staff') setTaskAssignees([]) }}><option value="">Επιλέξτε έργο</option><option value="personal">Για εμένα</option><option value="staff">Όλο το γραφείο</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>

          {!isPersonalTask && !isStaffTask && (
            <fieldset className="today-assignee-field is-full">
              <legend>Ανάθεση σε</legend>
              <div className="today-assignee-toolbar"><span>{taskAssignees.length ? `${taskAssignees.length} επιλεγμέν${taskAssignees.length === 1 ? 'ος' : 'οι'}` : 'Επιλέξτε τουλάχιστον ένα άτομο'}</span>{profile?.role === 'owner' && <button type="button" onClick={selectAllAssignees}>{taskAssignees.length === profiles.length ? 'Καθαρισμός' : 'Επιλογή όλων'}</button>}</div>
              <div className="today-assignee-grid">{profiles.map(person => <label key={person.id} className={`today-assignee-option ${taskAssignees.includes(person.id) ? 'is-selected' : ''}`}><input type="checkbox" checked={taskAssignees.includes(person.id)} onChange={() => toggleAssignee(person.id)} /><span className="today-person-avatar" aria-hidden="true">{person.full_name?.charAt(0)}</span><span>{person.full_name}</span></label>)}</div>
            </fieldset>
          )}

          <div className="today-form-field is-full"><label>Χρόνος εκτέλεσης</label><div className="task-timing-choice"><button type="button" className={taskAsap ? 'is-active is-asap' : ''} onClick={() => { setTaskAsap(true); setTaskDate(''); setTaskUrgent(true) }} aria-pressed={taskAsap}><Zap size={17} strokeWidth={1.5} aria-hidden="true" /><span><strong>ASAP</strong><small>Να γίνει το συντομότερο δυνατό</small></span></button><button type="button" className={!taskAsap ? 'is-active' : ''} onClick={() => setTaskAsap(false)} aria-pressed={!taskAsap}><CalendarDays size={17} strokeWidth={1.5} aria-hidden="true" /><span><strong>Προγραμματισμός</strong><small>Ορισμός ημερομηνίας και ώρας</small></span></button></div></div>

          {!taskAsap && <><div className="today-form-field"><label htmlFor="task-date">Ημερομηνία</label><div className="today-field-with-icon"><CalendarDays size={16} strokeWidth={1.5} aria-hidden="true" /><input id="task-date" type="date" value={taskDate} onChange={event => setTaskDate(event.target.value)} /></div></div><div className="today-form-field"><label htmlFor="task-time">Ώρα</label><input id="task-time" type="time" value={taskTime} onChange={event => setTaskTime(event.target.value)} /></div></>}

          <div className="today-form-field is-full"><label>Προτεραιότητα και αρχείο</label><div className="today-form-actions-row">{taskAsap ? <div className="task-asap-summary"><Zap size={16} strokeWidth={1.5} aria-hidden="true" /><span><strong>ASAP</strong><small>Θα εμφανίζεται πρώτο στις επείγουσες εργασίες.</small></span></div> : <button type="button" className={`today-urgent-toggle ${taskUrgent ? 'is-active' : ''}`} onClick={() => setTaskUrgent(value => !value)} aria-pressed={taskUrgent}><AlertTriangle size={16} strokeWidth={1.5} aria-hidden="true" />{taskUrgent ? 'Έχει οριστεί ως επείγον' : 'Ορισμός ως επείγον'}</button>}<label className="today-attach-button is-wide"><FileText size={16} strokeWidth={1.5} aria-hidden="true" />{taskFile ? taskFile.name : 'Επισύναψη αρχείου'}<input type="file" onChange={event => setTaskFile(event.target.files[0])} hidden /></label></div></div>
        </div>
      </ModalShell>

      {toast && <div className={`toast ${toast.isError ? 'toast-error' : 'toast-success'}`} role="status">{toast.msg}</div>}
    </div>
  )
}
