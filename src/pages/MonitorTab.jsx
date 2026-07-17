import { useState, useEffect } from 'react'
import { Check, X, PlusCircle, AlertTriangle, Paperclip, ChevronDown, Send, Mic, Plus, CheckCircle2, Search, CalendarDays, Eye, Users, ClipboardCheck, Gauge, RefreshCw, Clock3, FileText, Sparkles, Mail, ExternalLink } from 'lucide-react'
import { db, dbRead, supabase } from '../lib/db'
import { getDaysInfo, getStatusColor, getStatusLabel } from '../lib/dates'
import { useVoiceRecorder } from '../lib/voice'
import { ButtonSpinner, EmptyState, LoadingState, ModalShell } from '../components/ui'

export default function MonitorTab({ profile, onOpenToday }) {
  const [assignedTasks, setAssignedTasks] = useState([])
  const [taskNotes, setTaskNotes] = useState({})
  const [plans, setPlans] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('tasks')
  const [expandedTask, setExpandedTask] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [rejectingTask, setRejectingTask] = useState(null)
  const [rejectComment, setRejectComment] = useState('')
  const [rejectSaving, setRejectSaving] = useState(false)

  // Plan creation
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [planText, setPlanText] = useState('')
  const [planDate, setPlanDate] = useState('')
  const [planSaving, setPlanSaving] = useState(false)

  // Voice for planner
  const voice = useVoiceRecorder()

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchFilter, setSearchFilter] = useState({ category: null, project: null })
  const [toast, setToast] = useState(null)

  // Email entries (unassigned)
  const [emailEntries, setEmailEntries] = useState([])
  const [emailSaving, setEmailSaving] = useState(null)

  function showToast(msg, isError) {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
    const tasks = await dbRead(supabase
      .from('steps')
      .select('*, projects:project_id(name)')
      .eq('created_by', profile.id)
      .neq('assigned_to', profile.id)
      .order('is_urgent', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false }))
    setAssignedTasks(tasks)

    if (tasks.length > 0) {
      const ids = tasks.map(t => t.id)
      const notes = await dbRead(supabase
        .from('step_notes').select('*').in('step_id', ids)
        .order('created_at', { ascending: false }))
      const grouped = {}
      notes.forEach(n => {
        if (!grouped[n.step_id]) grouped[n.step_id] = []
        grouped[n.step_id].push(n)
      })
      setTaskNotes(grouped)
    }

    const todayStr = new Date().toISOString().split('T')[0]
    const myPlans = await dbRead(supabase
      .from('manager_plans').select('*')
      .eq('user_id', profile.id).gte('plan_date', todayStr)
      .eq('is_done', false).order('plan_date', { ascending: true }))
    setPlans(myPlans)

    const dls = await dbRead(supabase
      .from('deadlines').select('*, projects(name)')
      .in('status', ['overdue', 'pending']).order('due_date'))
    setDeadlines(dls)

    const projs = await dbRead(supabase
      .from('projects').select('*').eq('status', 'active').order('name'))
    setProjects(projs)

    // Load unassigned email entries
    const emails = await dbRead(supabase
      .from('entries').select('*')
      .eq('entry_type', 'email')
      .is('project_id', null)
      .order('created_at', { ascending: false })
      .limit(50))
    setEmailEntries(emails)
    } catch (err) {
      console.error('Load error:', err)
      showToast('Σφάλμα φόρτωσης', true)
    } finally {
      setLoading(false)
    }
  }

  // === EMAIL ASSIGN TO PROJECT ===
  async function assignEmailToProject(entryId, projectId) {
    if (!projectId) return
    setEmailSaving(entryId)
    try {
      await db(supabase.from('entries').update({ project_id: projectId }).eq('id', entryId))
      setEmailEntries(prev => prev.filter(e => e.id !== entryId))
      showToast('Αντιστοιχίστηκε στο έργο')
    } catch (err) {
      showToast('Σφάλμα: ' + err.message, true)
    }
    setEmailSaving(null)
  }

  // === VOICE FOR PLANNER (shared hook) ===
  async function handlePlanVoice() {
    try {
      const blob = await voice.startRecording()
      const transcript = await voice.transcribeBlob(blob)
      setPlanText(prev => prev ? prev + ' ' + transcript : transcript)
    } catch (err) {
      showToast(err.message || 'Σφάλμα μικροφώνου', true)
    }
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
    return getDaysInfo(step).text
  }

  // === APPROVE / REJECT ===
  async function approveTask(task) {
    try {
      await db(supabase.from('steps').update({ is_reviewed: true, review_result: 'approved' }).eq('id', task.id))
      await db(supabase.from('step_notes').insert({
        step_id: task.id, user_id: profile.id,
        user_name: profile.full_name, text: 'Εγκρίθηκε'
      }))
      await loadData()
    } catch (err) {
      showToast('Σφάλμα έγκρισης', true)
    }
  }

  function rejectTask(task) {
    setRejectingTask(task)
    setRejectComment('')
  }

  async function confirmRejectTask() {
    if (!rejectingTask) return
    setRejectSaving(true)
    try {
      await db(supabase.from('steps').update({
        status: 'in_progress', is_reviewed: false, review_result: 'rejected'
      }).eq('id', rejectingTask.id))
      await db(supabase.from('step_notes').insert({
        step_id: rejectingTask.id, user_id: profile.id,
        user_name: profile.full_name, text: 'Απόρριψη: ' + (rejectComment.trim() || 'Χρειάζεται διόρθωση')
      }))
      setRejectingTask(null)
      setRejectComment('')
      showToast('Η εργασία επέστρεψε για διόρθωση')
      await loadData()
    } catch (err) {
      showToast('Σφάλμα απόρριψης', true)
    } finally {
      setRejectSaving(false)
    }
  }

  async function registerToTimeline(task) {
    if (!task.project_id) return
    try {
      const latestNote = taskNotes[task.id]?.[0]?.text || ''
      const fullText = `Η εργασία ολοκληρώθηκε: ${task.title}${latestNote ? '. Σημείωση: ' + latestNote : ''}`
      
      let category = 'work_update'
      let tags = []
      let title = task.title
      try {
        const projs = await dbRead(supabase.from('projects').select('name').eq('status', 'active'))
        const areas = await dbRead(supabase.from('project_areas').select('area_name').eq('project_id', task.project_id))
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: fullText,
            projectNames: projs.map(p => p.name),
            projectAreas: areas.map(a => a.area_name)
          })
        })
        if (res.ok) {
          const { extracted } = await res.json()
          if (extracted?.entries?.[0]) {
            category = extracted.entries[0].category || 'work_update'
            tags = extracted.entries[0].tags || []
            title = extracted.entries[0].title || task.title
          }
        }
      } catch (aiErr) { console.log('AI categorize skipped:', aiErr) }

      await db(supabase.from('entries').insert({
        project_id: task.project_id, user_id: profile.id, entry_type: 'text',
        raw_text: fullText, ai_summary: title, title: title,
        category: category, tags: tags.length > 0 ? tags : null,
        is_team_visible: true, submitter_name: task.assigned_to_name || profile.full_name
      }))
      await db(supabase.from('steps').update({ registered_to_timeline: true }).eq('id', task.id))
      await loadData()
    } catch (err) {
      showToast('Σφάλμα καταχώρησης', true)
    }
  }

  async function skipRegister(taskId) {
    try {
      await db(supabase.from('steps').update({ registered_to_timeline: true }).eq('id', taskId))
      await loadData()
    } catch (err) {
      showToast('Σφάλμα', true)
    }
  }

  // === REPLY ===
  async function sendReply(taskId) {
    if (!replyText.trim()) return
    try {
      await db(supabase.from('step_notes').insert({
        step_id: taskId, user_id: profile.id,
        user_name: profile.full_name, text: replyText.trim()
      }))
      setReplyText('')
      await loadData()
    } catch (err) {
      showToast('Σφάλμα αποστολής', true)
    }
  }

  // === PLANS ===
  async function savePlan() {
    if (!planText.trim() || !planDate) return
    setPlanSaving(true)
    try {
      await db(supabase.from('manager_plans').insert({
        user_id: profile.id, plan_date: planDate, text: planText.trim()
      }))
      setPlanText(''); setPlanDate(''); setShowPlanModal(false)
      await loadData()
    } catch (err) {
      showToast('Σφάλμα αποθήκευσης', true)
    } finally {
      setPlanSaving(false)
    }
  }

  async function markPlanDone(id) {
    try {
      await db(supabase.from('manager_plans').update({ is_done: true }).eq('id', id))
      await loadData()
    } catch (err) {
      showToast('Σφάλμα', true)
    }
  }

  async function deletePlan(id) {
    try {
      await db(supabase.from('manager_plans').delete().eq('id', id))
      await loadData()
    } catch (error) {
      showToast('Δεν διαγράφηκε το σχέδιο', true)
    }
  }

  async function performSearch() {
    if (!searchQuery.trim() || searching) return
    setSearching(true)
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery.trim(),
          projectId: searchFilter.project || undefined,
          category: searchFilter.category || undefined
        })
      })
      if (!response.ok) throw new Error('Search failed')
      const data = await response.json()
      setSearchResults(data.results || [])
    } catch (error) {
      showToast('Η αναζήτηση δεν ολοκληρώθηκε', true)
    } finally {
      setSearching(false)
    }
  }

  if (loading) return <LoadingState label="Φόρτωση κέντρου διαχείρισης…" cards={5} />

  if (profile?.role !== 'owner') {
    return <EmptyState icon={Gauge} title="Πρόσβαση διαχειριστή" description="Το Κέντρο Διαχείρισης είναι διαθέσιμο μόνο στον υπεύθυνο του γραφείου." />
  }

  const tasksByPerson = getTasksByPerson()
  const activeTasks = assignedTasks.filter(task => task.status !== 'done')
  const reviewTasks = assignedTasks.filter(task => task.status === 'done' && !task.is_reviewed)
  const registerTasks = assignedTasks.filter(task => task.status === 'done' && task.is_reviewed && task.review_result === 'approved' && !task.registered_to_timeline)
  const totalUrgent = activeTasks.filter(task => task.is_urgent).length
  const overdueDeadlines = deadlines.filter(deadline => deadline.status === 'overdue')

  const sectionItems = [
    { id: 'tasks', label: 'Εργασίες', description: 'Αναθέσεις και αξιολόγηση', icon: ClipboardCheck, badge: reviewTasks.length },
    { id: 'emails', label: 'Email', description: 'Αντιστοίχιση σε έργο', icon: Mail, badge: emailEntries.length },
    { id: 'search', label: 'Αναζήτηση', description: 'Μνήμη όλων των έργων', icon: Search },
    { id: 'planner', label: 'Σχεδιασμός', description: 'Πλάνο και υπενθυμίσεις', icon: CalendarDays, badge: plans.length },
    { id: 'overview', label: 'Εποπτεία', description: 'Προθεσμίες και κόστος', icon: Gauge, badge: overdueDeadlines.length },
  ]

  const categoryLabels = {
    problem: 'Προβλήματα',
    decision: 'Αποφάσεις',
    material: 'Υλικά',
    work_update: 'Εργασίες',
    client_request: 'Αιτήματα πελάτη',
    note: 'Σημειώσεις',
  }

  function renderTaskDetails(task, mode = 'active') {
    const notes = taskNotes[task.id] || []
    return (
      <div className="center-task-details">
        {task.description && <p className="center-task-description">{task.description}</p>}
        {task.file_url && <a href={task.file_url} target="_blank" rel="noopener noreferrer" className="center-file-link"><Paperclip size={14} strokeWidth={1.5} aria-hidden="true" />{task.file_name || 'Άνοιγμα αρχείου'}</a>}
        {notes.length > 0 && (
          <div className="center-note-list">
            {notes.slice(0, 6).map(note => <div key={note.id} className="center-note"><p><strong>{note.user_name}</strong>{note.text}</p><time>{new Date(note.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</time></div>)}
          </div>
        )}
        {mode === 'active' && (
          <div className="center-reply-composer">
            <label className="sr-only" htmlFor={`reply-${task.id}`}>Απάντηση στην εργασία</label>
            <input id={`reply-${task.id}`} value={replyText} onChange={event => setReplyText(event.target.value)} onKeyDown={event => event.key === 'Enter' && sendReply(task.id)} placeholder="Απάντηση ή διευκρίνιση…" />
            <button type="button" onClick={() => sendReply(task.id)} disabled={!replyText.trim()} aria-label="Αποστολή απάντησης"><Send size={15} strokeWidth={1.5} aria-hidden="true" /></button>
          </div>
        )}
        {mode === 'review' && (
          <div className="center-review-actions">
            <button type="button" className="center-reject-button" onClick={() => rejectTask(task)}><X size={15} strokeWidth={1.5} aria-hidden="true" />Επιστροφή για διόρθωση</button>
            <button type="button" className="center-approve-button" onClick={() => approveTask(task)}><Check size={15} strokeWidth={1.5} aria-hidden="true" />Έγκριση εργασίας</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="management-center-page">
      <section className="management-center-hero">
        <div className="management-center-copy">
          <span>Κέντρο ελέγχου γραφείου</span>
          <h2>Αποφάσεις και προτεραιότητες σε μία εικόνα</h2>
          <p>Ελέγξτε πρώτα ό,τι περιμένει έγκριση, μετά τις ενεργές αναθέσεις και τις προθεσμίες των έργων.</p>
        </div>
        <button type="button" className="management-refresh" onClick={loadData}><RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" />Ανανέωση δεδομένων</button>
      </section>

      <section className="management-kpi-grid" aria-label="Σύνοψη διαχείρισης">
        <article><span className="is-primary" aria-hidden="true"><ClipboardCheck size={19} strokeWidth={1.5} /></span><div><strong>{activeTasks.length}</strong><small>Ενεργές αναθέσεις</small></div></article>
        <article className={reviewTasks.length ? 'is-attention' : ''}><span className="is-purple" aria-hidden="true"><Eye size={19} strokeWidth={1.5} /></span><div><strong>{reviewTasks.length}</strong><small>Περιμένουν αξιολόγηση</small></div></article>
        <article className={totalUrgent ? 'is-attention' : ''}><span className="is-danger" aria-hidden="true"><AlertTriangle size={19} strokeWidth={1.5} /></span><div><strong>{totalUrgent}</strong><small>Επείγουσες εργασίες</small></div></article>
        <article className={overdueDeadlines.length ? 'is-attention' : ''}><span className="is-warning" aria-hidden="true"><Clock3 size={19} strokeWidth={1.5} /></span><div><strong>{overdueDeadlines.length}</strong><small>Εκπρόθεσμες προθεσμίες</small></div></article>
      </section>

      <nav className="management-section-nav" aria-label="Ενότητες κέντρου διαχείρισης">
        {sectionItems.map(item => {
          const Icon = item.icon
          return (
            <button type="button" key={item.id} className={activeSection === item.id ? 'is-active' : ''} onClick={() => setActiveSection(item.id)} aria-current={activeSection === item.id ? 'page' : undefined}>
              <span aria-hidden="true"><Icon size={18} strokeWidth={1.5} /></span>
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              {item.badge > 0 && <em>{item.badge}</em>}
            </button>
          )
        })}
      </nav>

      {activeSection === 'tasks' && (
        <div className="management-section-stack">
          <section className="management-panel management-review-panel">
            <div className="management-panel-heading">
              <div><span className="is-purple" aria-hidden="true"><Eye size={18} strokeWidth={1.5} /></span><div><h3>Περιμένουν τη δική σας αξιολόγηση</h3><p>Ολοκληρωμένες εργασίες που χρειάζονται έγκριση ή επιστροφή.</p></div></div>
              <span className="management-count">{reviewTasks.length}</span>
            </div>
            {reviewTasks.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Δεν υπάρχει εργασία για αξιολόγηση" description="Όταν ένα μέλος ολοκληρώσει εργασία, θα εμφανιστεί εδώ πρώτη." compact />
            ) : (
              <div className="management-review-grid">
                {reviewTasks.map(task => {
                  const isExpanded = expandedTask === task.id
                  return (
                    <article key={task.id} className={`center-review-card ${isExpanded ? 'is-expanded' : ''}`}>
                      <button type="button" className="center-task-summary" onClick={() => setExpandedTask(isExpanded ? null : task.id)} aria-expanded={isExpanded}>
                        <span className="center-task-status-icon is-done" aria-hidden="true"><Check size={16} strokeWidth={1.5} /></span>
                        <span className="center-task-copy"><strong>{task.title}</strong><small>{task.assigned_to_name} · {task.projects?.name || 'Προσωπικό'}</small></span>
                        <span className="center-review-label">Αξιολόγηση</span>
                        <ChevronDown size={17} strokeWidth={1.5} aria-hidden="true" className={isExpanded ? 'is-rotated' : ''} />
                      </button>
                      {isExpanded && renderTaskDetails(task, 'review')}
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {registerTasks.length > 0 && (
            <section className="management-panel">
              <div className="management-panel-heading"><div><span className="is-success" aria-hidden="true"><PlusCircle size={18} strokeWidth={1.5} /></span><div><h3>Καταχώρηση στη μνήμη έργου</h3><p>Εγκεκριμένες εργασίες που μπορούν να γίνουν μόνιμη ενημέρωση.</p></div></div><span className="management-count">{registerTasks.length}</span></div>
              <div className="center-register-list">
                {registerTasks.map(task => <article key={task.id}><span className="center-task-status-icon is-done" aria-hidden="true"><Check size={15} strokeWidth={1.5} /></span><div><strong>{task.title}</strong><small>{task.projects?.name || 'Χωρίς έργο'} · {task.assigned_to_name}</small></div><div><button type="button" className="center-skip-button" onClick={() => skipRegister(task.id)}>Παράλειψη</button><button type="button" className="center-register-button" onClick={() => registerToTimeline(task)}><PlusCircle size={14} strokeWidth={1.5} aria-hidden="true" />Καταχώρηση</button></div></article>)}
              </div>
            </section>
          )}

          <section className="management-panel">
            <div className="management-panel-heading"><div><span className="is-primary" aria-hidden="true"><Users size={18} strokeWidth={1.5} /></span><div><h3>Φόρτος και εργασίες ομάδας</h3><p>Ενεργές αναθέσεις ανά μέλος, με επείγον και προθεσμία.</p></div></div><button type="button" className="management-heading-action" onClick={onOpenToday}><Plus size={15} strokeWidth={1.5} aria-hidden="true" />Νέα ανάθεση</button></div>

            {Object.keys(tasksByPerson).length === 0 ? (
              <EmptyState icon={Users} title="Δεν έχουν ανατεθεί εργασίες" description="Δημιουργήστε την πρώτη ανάθεση από τη σελίδα Σήμερα." actionLabel={onOpenToday ? 'Μετάβαση στη δημιουργία εργασίας' : undefined} onAction={onOpenToday} compact />
            ) : (
              <div className="management-person-grid">
                {Object.entries(tasksByPerson).map(([personName, group]) => {
                  const activePersonTasks = group.tasks.filter(task => task.status !== 'done')
                  return (
                    <section key={personName} className="management-person-card">
                      <header><span className="management-person-avatar" aria-hidden="true">{personName.charAt(0)}</span><div><h4>{personName}</h4><p>{group.active} ενεργές · {group.done} ολοκληρωμένες</p></div>{group.urgent > 0 && <span className="management-urgent-count"><AlertTriangle size={12} strokeWidth={1.5} aria-hidden="true" />{group.urgent}</span>}</header>
                      <div className="management-person-tasks">
                        {activePersonTasks.length === 0 ? <p className="management-no-active">Δεν υπάρχει ενεργή εργασία.</p> : activePersonTasks.map(task => {
                          const isExpanded = expandedTask === task.id
                          const daysText = getDaysText(task)
                          return (
                            <article key={task.id} className={`center-active-task ${task.is_urgent ? 'is-urgent' : ''} ${isExpanded ? 'is-expanded' : ''}`}>
                              <button type="button" className="center-task-summary" onClick={() => setExpandedTask(isExpanded ? null : task.id)} aria-expanded={isExpanded}>
                                <span className={`center-task-status-icon status-${task.status}`} aria-hidden="true"><span /></span>
                                <span className="center-task-copy"><strong>{task.title}</strong><small>{task.projects?.name || 'Προσωπικό'}{task.due_date ? ` · ${daysText}` : ''}</small></span>
                                <span className="center-status-label" style={{ color: getStatusColor(task.status) }}>{getStatusLabel(task.status)}</span>
                                <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" className={isExpanded ? 'is-rotated' : ''} />
                              </button>
                              {isExpanded && renderTaskDetails(task)}
                            </article>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {activeSection === 'emails' && (
        <section className="management-panel management-email-panel">
          <div className="management-panel-heading">
            <div><span className="is-blue" aria-hidden="true"><Mail size={18} strokeWidth={1.5} /></span><div><h3>Email χωρίς έργο</h3><p>Αντιστοιχίστε κάθε email στο σωστό έργο.</p></div></div>
            <button type="button" className="management-heading-action" onClick={loadData}><RefreshCw size={15} strokeWidth={1.5} aria-hidden="true" />Ανανέωση</button>
          </div>
          {emailEntries.length === 0 ? (
            <EmptyState icon={Mail} title="Δεν υπάρχουν email χωρίς έργο" description="Τα νέα business email θα εμφανιστούν εδώ αυτόματα." compact />
          ) : (
            <div className="management-email-list">
              {emailEntries.map(entry => (
                <article key={entry.id} className="management-email-card">
                  <div className="management-email-header">
                    <Mail size={16} strokeWidth={1.5} aria-hidden="true" />
                    <div>
                      <h3>{entry.title || entry.raw_text?.slice(0, 80)}</h3>
                      <p className="management-email-meta">
                        <span>{entry.submitter_name}</span>
                        <time>{new Date(entry.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                      </p>
                    </div>
                  </div>
                  {entry.ai_summary && <p className="management-email-summary">{entry.ai_summary}</p>}
                  {entry.tags?.length > 0 && <div className="management-result-tags">{entry.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
                  <div className="management-email-assign">
                    <select
                      defaultValue=""
                      onChange={event => assignEmailToProject(entry.id, event.target.value)}
                      disabled={emailSaving === entry.id}
                    >
                      <option value="" disabled>Επιλογή έργου…</option>
                      {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                    {emailSaving === entry.id && <ButtonSpinner label="Αποθήκευση…" />}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeSection === 'search' && (
        <section className="management-panel management-search-panel">
          <div className="management-search-hero">
            <span className="management-search-icon" aria-hidden="true"><Search size={22} strokeWidth={1.5} /></span>
            <h2>Αναζήτηση στη μνήμη των έργων</h2>
            <p>Βρείτε προβλήματα, αποφάσεις, υλικά, αιτήματα πελατών και παλιές ενημερώσεις.</p>
            <div className="management-search-box"><Search size={18} strokeWidth={1.5} aria-hidden="true" /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && performSearch()} placeholder="π.χ. πλακάκια μπάνιου, άδεια οικοδομής, αίτημα πελάτη…" /><button type="button" onClick={performSearch} disabled={searching || !searchQuery.trim()}>{searching ? <ButtonSpinner label="Αναζήτηση…" /> : 'Αναζήτηση'}</button></div>
          </div>

          <div className="management-search-tools">
            <div className="management-filter-chips">{['problem','decision','material','work_update','client_request'].map(category => <button type="button" key={category} className={searchFilter.category === category ? 'is-active' : ''} onClick={() => setSearchFilter(previous => ({ ...previous, category: previous.category === category ? null : category }))}>{categoryLabels[category]}</button>)}</div>
            <select aria-label="Φίλτρο έργου" value={searchFilter.project || ''} onChange={event => setSearchFilter(previous => ({ ...previous, project: event.target.value || null }))}><option value="">Όλα τα έργα</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          </div>

          {searching ? <LoadingState label="Αναζήτηση στη μνήμη…" cards={3} /> : searchResults.length > 0 ? (
            <div className="management-search-results">
              {searchResults.map(result => <article key={result.id} className={`management-search-result category-${result.category || 'note'}`}><div className="management-result-top"><span>{categoryLabels[result.category] || 'Σημείωση'}</span><time>{new Date(result.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</time></div><h3>{result.title || result.ai_summary || result.raw_text?.slice(0,100)}</h3><p>{result.raw_text || result.ai_summary}</p><div className="management-result-meta"><span>{result.projects?.name || 'Χωρίς έργο'}</span>{result.submitter_name && <span>{result.submitter_name}</span>}</div>{result.tags?.length > 0 && <div className="management-result-tags">{result.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}</article>)}
            </div>
          ) : searchQuery ? <EmptyState icon={Search} title="Δεν βρέθηκαν αποτελέσματα" description="Δοκιμάστε διαφορετικές λέξεις ή αφαιρέστε κάποιο φίλτρο." compact /> : (
            <div className="management-search-suggestions"><span>Δοκιμάστε:</span><button type="button" onClick={() => setSearchQuery('Άδεια οικοδομής')}>Άδεια οικοδομής</button><button type="button" onClick={() => setSearchQuery('Προβλήματα μπάνιου')}>Προβλήματα μπάνιου</button><button type="button" onClick={() => setSearchQuery('Αιτήματα πελάτη')}>Αιτήματα πελάτη</button></div>
          )}
        </section>
      )}

      {activeSection === 'planner' && (
        <section className="management-panel management-planner-panel">
          <div className="management-panel-heading"><div><span className="is-purple" aria-hidden="true"><CalendarDays size={18} strokeWidth={1.5} /></span><div><h3>Σχεδιασμός επόμενων ενεργειών</h3><p>Προσωπικό πλάνο, υπενθυμίσεις και προτεραιότητες.</p></div></div><button type="button" className="management-heading-action" onClick={() => setShowPlanModal(true)}><Plus size={15} strokeWidth={1.5} aria-hidden="true" />Νέο σχέδιο</button></div>
          {plans.length === 0 ? <EmptyState icon={CalendarDays} title="Δεν υπάρχουν σχέδια ακόμη" description="Προσθέστε την πρώτη ενέργεια ή υπενθύμιση." actionLabel="Προσθήκη σχεδίου" onAction={() => setShowPlanModal(true)} compact /> : <div className="management-plan-list">{plans.map(plan => {
            const planDateObject = new Date(`${plan.plan_date}T00:00:00`)
            const today = new Date(); today.setHours(0,0,0,0)
            const difference = Math.round((planDateObject - today) / 86400000)
            const dateLabel = difference === 0 ? 'Σήμερα' : difference === 1 ? 'Αύριο' : planDateObject.toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short' })
            return <article key={plan.id} className={difference === 0 ? 'is-today' : ''}><span className="management-plan-date">{dateLabel}</span><p>{plan.text}</p><div><button type="button" className="management-plan-done" onClick={() => markPlanDone(plan.id)} aria-label={`Ολοκλήρωση ${plan.text}`}><Check size={15} strokeWidth={1.5} aria-hidden="true" /></button><button type="button" className="management-plan-delete" onClick={() => deletePlan(plan.id)} aria-label={`Διαγραφή ${plan.text}`}><X size={15} strokeWidth={1.5} aria-hidden="true" /></button></div></article>
          })}</div>}
        </section>
      )}

      {activeSection === 'overview' && (
        <div className="management-overview-grid">
          <section className="management-panel">
            <div className="management-panel-heading"><div><span className="is-warning" aria-hidden="true"><Clock3 size={18} strokeWidth={1.5} /></span><div><h3>Προθεσμίες έργων</h3><p>Εκπρόθεσμες και επερχόμενες δεσμεύσεις.</p></div></div><span className="management-count">{deadlines.length}</span></div>
            {deadlines.length === 0 ? <EmptyState icon={CheckCircle2} title="Καμία εκκρεμής προθεσμία" description="Όλες οι καταγεγραμμένες προθεσμίες είναι τακτοποιημένες." compact /> : <div className="management-deadline-list">{deadlines.map(deadline => {
              const overdue = deadline.status === 'overdue'
              const days = Math.ceil((new Date(deadline.due_date) - new Date()) / 86400000)
              return <article key={deadline.id} className={overdue ? 'is-overdue' : ''}><span className="management-deadline-dot" aria-hidden="true" /><div><strong>{deadline.description}</strong><small>{deadline.projects?.name || 'Χωρίς έργο'}</small></div><span>{overdue ? `${Math.abs(days)} ημέρες καθυστέρηση` : new Date(deadline.due_date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</span></article>
            })}</div>}
          </section>

          <section className="management-panel">
            <div className="management-panel-heading"><div><span className="is-success" aria-hidden="true"><Gauge size={18} strokeWidth={1.5} /></span><div><h3>Προϋπολογισμός</h3><p>Μεταβολή από τον αρχικό προϋπολογισμό.</p></div></div></div>
            {projects.filter(project => project.original_budget > 0).length === 0 ? <EmptyState icon={FileText} title="Δεν υπάρχουν στοιχεία κόστους" description="Οι προϋπολογισμοί έργων θα εμφανιστούν εδώ." compact /> : <div className="management-budget-list">{projects.filter(project => project.original_budget > 0).map(project => {
              const drift = ((project.current_budget - project.original_budget) / project.original_budget * 100)
              return <article key={project.id}><div><strong>{project.name}</strong><small>Αρχικός: {Number(project.original_budget).toLocaleString('el-GR')} €</small></div><span>{Number(project.current_budget).toLocaleString('el-GR')} €</span><em className={Math.abs(drift) > 10 ? 'is-danger' : drift > 5 ? 'is-warning' : 'is-success'}>{drift > 0 ? '+' : ''}{drift.toFixed(1)}%</em></article>
            })}</div>}
          </section>
        </div>
      )}

      <ModalShell
        open={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        title="Νέο σχέδιο"
        description="Προσθέστε μια προσωπική ενέργεια ή υπενθύμιση στο πλάνο σας."
        icon={CalendarDays}
        size="md"
        actions={<><button type="button" className="action-btn" onClick={() => setShowPlanModal(false)}>Ακύρωση</button><button type="button" className="action-btn primary" onClick={savePlan} disabled={!planText.trim() || !planDate || planSaving}>{planSaving ? <ButtonSpinner label="Αποθήκευση…" /> : 'Προσθήκη στο πλάνο'}</button></>}
      >
        <div className="management-plan-form">
          <div><label htmlFor="plan-text">Τι πρέπει να γίνει;</label><div className="management-plan-text-wrap"><textarea id="plan-text" value={planText} onChange={event => setPlanText(event.target.value)} placeholder="Περιγράψτε την επόμενη ενέργεια…" rows={4} autoFocus /><button type="button" className={voice.recording ? 'is-recording' : ''} onClick={voice.recording ? voice.stopRecording : handlePlanVoice} disabled={voice.transcribing} aria-label="Φωνητική καταχώρηση σχεδίου">{voice.transcribing ? <span className="spinner" /> : <Mic size={18} strokeWidth={1.5} aria-hidden="true" />}</button></div></div>
          <div><label htmlFor="plan-date">Ημερομηνία</label><input id="plan-date" type="date" value={planDate} onChange={event => setPlanDate(event.target.value)} /></div>
        </div>
      </ModalShell>

      <ModalShell
        open={Boolean(rejectingTask)}
        onClose={() => !rejectSaving && setRejectingTask(null)}
        title="Επιστροφή εργασίας για διόρθωση"
        description={rejectingTask?.title}
        icon={X}
        size="sm"
        actions={<><button type="button" className="action-btn" onClick={() => setRejectingTask(null)} disabled={rejectSaving}>Ακύρωση</button><button type="button" className="action-btn primary" onClick={confirmRejectTask} disabled={rejectSaving}>{rejectSaving ? <ButtonSpinner label="Αποθήκευση…" /> : 'Επιστροφή για διόρθωση'}</button></>}
      >
        <div className="management-plan-form"><div><label htmlFor="reject-comment">Σχόλιο προς το μέλος της ομάδας</label><textarea id="reject-comment" value={rejectComment} onChange={event => setRejectComment(event.target.value)} placeholder="Τι χρειάζεται να διορθωθεί;" rows={4} autoFocus /></div></div>
      </ModalShell>

      {toast && <div className={`toast ${toast.isError ? 'toast-error' : 'toast-success'}`} role="status">{toast.msg}</div>}
    </div>
  )
}
