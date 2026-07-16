import { useState, useEffect } from 'react'
import { AlertTriangle, Plus, Paperclip, ChevronDown, Send, Mic, Circle, Play, Pause, Check, CheckCircle2, ClipboardCheck, Clock3, FileText, Pencil, RefreshCw, Search, UserRound, Zap, CalendarDays } from 'lucide-react'
import { db, dbRead, supabase } from '../lib/db'
import { getDaysInfo, formatDueTime, getStepCardClass } from '../lib/dates'
import { useVoiceRecorder } from '../lib/voice'
import { sortProfiles } from '../lib/people'
import { ButtonSpinner, EmptyState, LoadingState, ModalShell } from '../components/ui'

export default function StepsView({ project, profile }) {
  const [steps, setSteps] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editStep, setEditStep] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('17:00')
  const [stepFile, setStepFile] = useState(null)
  const [isUrgent, setIsUrgent] = useState(false)
  const [isAsap, setIsAsap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedStep, setExpandedStep] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [stepNotes, setStepNotes] = useState({})

  // Voice recording (shared hook) — voiceField tracks which input is dictating
  const voice = useVoiceRecorder()
  const [voiceField, setVoiceField] = useState(null)

  const [toast, setToast] = useState(null)
  function showToast(msg, isError) { setToast({ msg, isError }); setTimeout(() => setToast(null), 2500) }

  useEffect(() => { loadSteps() }, [project.id])

  async function loadSteps() {
    setLoading(true)
    setLoadError(false)
    try {
    const stps = await dbRead(supabase
      .from('steps')
      .select('*')
      .eq('project_id', project.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }))
    setSteps(stps)

    const profs = await dbRead(supabase.from('profiles').select('id, full_name'))
    setProfiles(sortProfiles(profs))

    if (stps.length > 0) {
      const stepIds = stps.map(s => s.id)
      const notes = await dbRead(supabase
        .from('step_notes')
        .select('*')
        .in('step_id', stepIds)
        .order('created_at', { ascending: false }))
      const grouped = {}
      notes.forEach(n => {
        if (!grouped[n.step_id]) grouped[n.step_id] = []
        grouped[n.step_id].push(n)
      })
      setStepNotes(grouped)
    }
    } catch (err) {
      console.error('Load error:', err)
      setLoadError(true)
      showToast('Σφάλμα φόρτωσης', true)
    } finally {
      setLoading(false)
    }
  }

  // === VOICE (shared hook) ===
  async function handleFieldVoice(field) {
    setVoiceField(field)
    try {
      const blob = await voice.startRecording()
      const transcript = await voice.transcribeBlob(blob)
      const apply = field === 'description' ? setDescription : setTitle
      apply(prev => prev ? prev + ' ' + transcript : transcript)
    } catch (err) {
      showToast(err.message || 'Σφάλμα μικροφώνου', true)
    } finally {
      setVoiceField(null)
    }
  }

  function openAdd() {
    setTitle('')
    setDescription('')
    setAssignedTo('')
    setDueDate('')
    setDueTime('17:00')
    setStepFile(null)
    setIsUrgent(false)
    setIsAsap(false)
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
    setIsAsap(Boolean(step.is_urgent && !step.due_date))
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
      if (!isAsap && dueDate) dueDatetime = `${dueDate}T${dueTime || '17:00'}:00`

      if (editStep) {
        await db(supabase.from('steps').update({
          title: title.trim(),
          description: description.trim() || null,
          assigned_to: assignedTo || null,
          assigned_to_name: assignedProfile?.full_name || null,
          due_date: dueDatetime,
          file_url: fileUrl, file_name: fileName,
          updated_by: profile.id, is_urgent: isAsap || isUrgent
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
          updated_by: profile.id, is_urgent: isAsap || isUrgent
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
    { value: 'not_started', label: 'Δεν ξεκίνησε', icon: Circle },
    { value: 'in_progress', label: 'Σε εξέλιξη', icon: Play },
    { value: 'waiting', label: 'Σε αναμονή', icon: Pause },
    { value: 'done', label: 'Ολοκληρώθηκε', icon: Check }
  ]

  const doneCount = steps.filter(step => step.status === 'done').length
  const totalCount = steps.length
  const activeCount = totalCount - doneCount
  const urgentCount = steps.filter(step => step.is_urgent && step.status !== 'done').length
  const overdueCount = steps.filter(step => getDaysInfo(step).className === 'step-overdue' && step.status !== 'done').length
  const progress = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0

  const normalizedSearch = search.trim().toLocaleLowerCase('el-GR')
  const visibleSteps = steps.filter(step => {
    if (filter === 'active' && step.status === 'done') return false
    if (filter === 'done' && step.status !== 'done') return false
    if (filter === 'urgent' && (!step.is_urgent || step.status === 'done')) return false
    if (normalizedSearch && ![step.title, step.description, step.assigned_to_name].filter(Boolean).some(value => value.toLocaleLowerCase('el-GR').includes(normalizedSearch))) return false
    return true
  })

  if (loading) return <LoadingState label="Φόρτωση εργασιών έργου…" cards={4} />

  if (loadError) {
    return <EmptyState icon={RefreshCw} title="Δεν φορτώθηκαν οι εργασίες" description="Δοκιμάστε ξανά χωρίς να χαθεί καμία αλλαγή." actionLabel="Δοκιμή ξανά" onAction={loadSteps} />
  }

  return (
    <section className="project-tasks-workspace">
      <header className="project-tasks-header">
        <div className="project-tasks-title">
          <span aria-hidden="true"><ClipboardCheck size={20} strokeWidth={1.5} /></span>
          <div><h2>Εργασίες έργου</h2><p>Αναθέσεις, πρόοδος, σημειώσεις και προθεσμίες για το συγκεκριμένο έργο.</p></div>
        </div>
        <button type="button" className="project-task-add" onClick={openAdd}><Plus size={16} strokeWidth={1.5} aria-hidden="true" />Νέα εργασία</button>
      </header>

      <div className="project-task-summary-grid">
        <article><span className="is-primary" aria-hidden="true"><ClipboardCheck size={18} strokeWidth={1.5} /></span><div><strong>{activeCount}</strong><small>Ενεργές</small></div></article>
        <article><span className="is-success" aria-hidden="true"><CheckCircle2 size={18} strokeWidth={1.5} /></span><div><strong>{doneCount}</strong><small>Ολοκληρωμένες</small></div></article>
        <article className={urgentCount ? 'is-attention' : ''}><span className="is-danger" aria-hidden="true"><AlertTriangle size={18} strokeWidth={1.5} /></span><div><strong>{urgentCount}</strong><small>Επείγουσες</small></div></article>
        <article className={overdueCount ? 'is-attention' : ''}><span className="is-warning" aria-hidden="true"><Clock3 size={18} strokeWidth={1.5} /></span><div><strong>{overdueCount}</strong><small>Εκπρόθεσμες</small></div></article>
      </div>

      <section className="project-progress-panel" aria-label={`Πρόοδος εργασιών ${progress}%`}>
        <div><span>Συνολική πρόοδος</span><strong>{doneCount} από {totalCount} εργασίες</strong></div>
        <div className="project-progress-track"><span style={{ width: `${progress}%` }} /></div>
        <em>{progress}%</em>
      </section>

      <div className="project-task-toolbar">
        <div className="project-task-filters" role="group" aria-label="Φίλτρο εργασιών">
          <button type="button" className={filter === 'active' ? 'is-active' : ''} onClick={() => setFilter('active')}>Ενεργές <span>{activeCount}</span></button>
          <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>Όλες <span>{totalCount}</span></button>
          <button type="button" className={filter === 'urgent' ? 'is-active' : ''} onClick={() => setFilter('urgent')}>Επείγουσες <span>{urgentCount}</span></button>
          <button type="button" className={filter === 'done' ? 'is-active' : ''} onClick={() => setFilter('done')}>Ολοκληρωμένες <span>{doneCount}</span></button>
        </div>
        <label className="project-task-search"><Search size={15} strokeWidth={1.5} aria-hidden="true" /><span className="sr-only">Αναζήτηση εργασιών</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Αναζήτηση εργασίας…" /></label>
      </div>

      {totalCount === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Δεν υπάρχουν εργασίες ακόμη" description="Δημιουργήστε την πρώτη σαφή ανάθεση για αυτό το έργο." actionLabel="Δημιουργία πρώτης εργασίας" onAction={openAdd} />
      ) : visibleSteps.length === 0 ? (
        <EmptyState icon={Search} title="Δεν βρέθηκε εργασία" description="Αλλάξτε φίλτρο ή όρο αναζήτησης." compact />
      ) : (
        <div className="project-task-list">
          {visibleSteps.map(step => {
            const info = getDaysInfo(step)
            const notes = stepNotes[step.id] || []
            const isExpanded = expandedStep === step.id
            const dueTime = formatDueTime(step)
            const currentStatus = statusOptions.find(option => option.value === step.status) || statusOptions[0]
            const CurrentIcon = currentStatus.icon

            return (
              <article key={step.id} className={`project-task-card ${getStepCardClass(step)} ${isExpanded ? 'is-expanded' : ''}`}>
                <div className="project-task-card-summary">
                  <button type="button" className="project-task-toggle" onClick={() => setExpandedStep(isExpanded ? null : step.id)} aria-expanded={isExpanded}>
                    <span className={`project-task-status status-${step.status}`} aria-hidden="true"><CurrentIcon size={16} strokeWidth={1.5} /></span>
                    <span className="project-task-card-copy">
                      <span className="project-task-card-title"><strong className={step.status === 'done' ? 'is-done' : ''}>{step.title}</strong>{step.is_urgent && <em className={!step.due_date ? 'is-asap' : ''}>{!step.due_date ? 'ASAP' : 'Επείγον'}</em>}</span>
                      {step.description && <span className="project-task-card-description">{step.description}</span>}
                      <span className="project-task-card-meta"><span><UserRound size={12} strokeWidth={1.5} aria-hidden="true" />{step.assigned_to_name || 'Χωρίς ανάθεση'}</span>{info.text && <span className={info.className === 'step-overdue' ? 'is-overdue' : ''}><Clock3 size={12} strokeWidth={1.5} aria-hidden="true" />{info.text}{dueTime ? ` · ${dueTime}` : ''}</span>}{notes.length > 0 && <span>{notes.length} σημειώσεις</span>}</span>
                    </span>
                  </button>
                  <span className="project-task-card-tools">
                    {step.file_url && <Paperclip size={14} strokeWidth={1.5} aria-label="Υπάρχει συνημμένο" />}
                    <button type="button" className="project-task-edit" onClick={event => openEdit(event, step)} aria-label={`Επεξεργασία εργασίας ${step.title}`}><Pencil size={15} strokeWidth={1.5} aria-hidden="true" /></button>
                    <button type="button" className="project-task-expand-button" onClick={() => setExpandedStep(isExpanded ? null : step.id)} aria-label={isExpanded ? 'Σύμπτυξη εργασίας' : 'Άνοιγμα εργασίας'} aria-expanded={isExpanded}><ChevronDown size={17} strokeWidth={1.5} aria-hidden="true" className={isExpanded ? 'is-rotated' : ''} /></button>
                  </span>
                </div>

                {isExpanded && (
                  <div className="project-task-expanded">
                    <div className="project-task-expanded-label">Κατάσταση εργασίας</div>
                    <div className="project-task-status-options">
                      {statusOptions.map(option => {
                        const StatusIcon = option.icon
                        return <button type="button" key={option.value} className={`status-${option.value} ${step.status === option.value ? 'is-active' : ''}`} onClick={() => updateStatus(step.id, option.value)} aria-pressed={step.status === option.value}><StatusIcon size={14} strokeWidth={1.5} aria-hidden="true" />{option.label}</button>
                      })}
                    </div>

                    {step.file_url && <a href={step.file_url} target="_blank" rel="noopener noreferrer" className="project-task-file"><FileText size={15} strokeWidth={1.5} aria-hidden="true" />{step.file_name || 'Άνοιγμα αρχείου'}</a>}

                    {notes.length > 0 && <div className="project-task-note-list">{notes.map(note => <div key={note.id}><p><strong>{note.user_name}</strong>{note.text}</p><time>{new Date(note.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}</time></div>)}</div>}

                    <div className="project-task-note-composer">
                      <label className="sr-only" htmlFor={`project-task-note-${step.id}`}>Προσθήκη σημείωσης</label>
                      <input id={`project-task-note-${step.id}`} placeholder="Προσθήκη σημείωσης ή ενημέρωσης…" value={noteText} onChange={event => setNoteText(event.target.value)} onKeyDown={event => event.key === 'Enter' && addNote(step.id)} />
                      <button type="button" onClick={() => addNote(step.id)} disabled={!noteText.trim()} aria-label="Αποστολή σημείωσης"><Send size={15} strokeWidth={1.5} aria-hidden="true" /></button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <ModalShell
        open={showAdd}
        onClose={() => !saving && setShowAdd(false)}
        title={editStep ? 'Επεξεργασία εργασίας' : 'Νέα εργασία έργου'}
        description={editStep ? 'Οι αλλαγές θα ενημερωθούν άμεσα για το υπεύθυνο μέλος.' : 'Ορίστε τίτλο, υπεύθυνο και επιλέξτε ASAP ή συγκεκριμένη προθεσμία.'}
        icon={ClipboardCheck}
        size="lg"
        actions={<><button type="button" className="action-btn" onClick={() => setShowAdd(false)} disabled={saving}>Ακύρωση</button><button type="button" className="action-btn primary" onClick={handleSave} disabled={!title.trim() || saving}>{saving ? <ButtonSpinner label="Αποθήκευση…" /> : editStep ? 'Αποθήκευση αλλαγών' : 'Δημιουργία εργασίας'}</button></>}
      >
        <div className="project-task-form">
          <div className="project-task-form-field is-full"><label htmlFor="project-step-title">Τίτλος εργασίας <span>*</span></label><div className="project-task-title-input"><input id="project-step-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="π.χ. Επιβεβαίωση ηλεκτρολογικού σχεδίου" autoFocus /><button type="button" className={voice.recording && voiceField === 'title' ? 'is-recording' : ''} onClick={voice.recording ? voice.stopRecording : () => handleFieldVoice('title')} disabled={voice.transcribing || (voice.recording && voiceField !== 'title')} aria-label="Υπαγόρευση τίτλου">{voice.transcribing && voiceField === 'title' ? <span className="spinner" /> : <Mic size={18} strokeWidth={1.5} aria-hidden="true" />}</button></div></div>
          <div className="project-task-form-field is-full"><label htmlFor="project-step-description">Περιγραφή</label><div className="project-task-title-input"><textarea id="project-step-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="Προσθέστε λεπτομέρειες, παραδοτέο ή κριτήριο ολοκλήρωσης…" rows={4} /><button type="button" className={voice.recording && voiceField === 'description' ? 'is-recording' : ''} onClick={voice.recording ? voice.stopRecording : () => handleFieldVoice('description')} disabled={voice.transcribing || (voice.recording && voiceField !== 'description')} aria-label="Υπαγόρευση περιγραφής">{voice.transcribing && voiceField === 'description' ? <span className="spinner" /> : <Mic size={18} strokeWidth={1.5} aria-hidden="true" />}</button></div></div>

          <fieldset className="project-assignee-selector is-full"><legend>Ανάθεση σε</legend><div>{profiles.map(person => <label key={person.id} className={assignedTo === person.id ? 'is-selected' : ''}><input type="radio" name="project-assignee" value={person.id} checked={assignedTo === person.id} onChange={() => setAssignedTo(person.id)} /><span className="project-assignee-avatar" aria-hidden="true">{person.full_name?.charAt(0)}</span><span>{person.full_name}</span></label>)}<label className={!assignedTo ? 'is-selected' : ''}><input type="radio" name="project-assignee" value="" checked={!assignedTo} onChange={() => setAssignedTo('')} /><span className="project-assignee-avatar is-empty" aria-hidden="true">—</span><span>Χωρίς ανάθεση</span></label></div></fieldset>

          <div className="project-task-form-field is-full"><label>Χρόνος εκτέλεσης</label><div className="task-timing-choice"><button type="button" className={isAsap ? 'is-active is-asap' : ''} onClick={() => { setIsAsap(true); setDueDate(''); setIsUrgent(true) }} aria-pressed={isAsap}><Zap size={17} strokeWidth={1.5} aria-hidden="true" /><span><strong>ASAP</strong><small>Να γίνει το συντομότερο δυνατό</small></span></button><button type="button" className={!isAsap ? 'is-active' : ''} onClick={() => setIsAsap(false)} aria-pressed={!isAsap}><CalendarDays size={17} strokeWidth={1.5} aria-hidden="true" /><span><strong>Προγραμματισμός</strong><small>Ορισμός ημερομηνίας και ώρας</small></span></button></div></div>
          {!isAsap && <><div className="project-task-form-field"><label htmlFor="project-step-date">Ημερομηνία</label><input id="project-step-date" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></div><div className="project-task-form-field"><label htmlFor="project-step-time">Ώρα</label><input id="project-step-time" type="time" value={dueTime} onChange={event => setDueTime(event.target.value)} /></div></>}
          <div className="project-task-form-field is-full"><label>Προτεραιότητα και αρχείο</label><div className="project-task-form-actions">{isAsap ? <div className="task-asap-summary"><Zap size={16} strokeWidth={1.5} aria-hidden="true" /><span><strong>ASAP</strong><small>Θα εμφανίζεται πρώτο στις επείγουσες εργασίες.</small></span></div> : <button type="button" className={`project-urgent-toggle ${isUrgent ? 'is-active' : ''}`} onClick={() => setIsUrgent(value => !value)} aria-pressed={isUrgent}><AlertTriangle size={16} strokeWidth={1.5} aria-hidden="true" />{isUrgent ? 'Έχει οριστεί ως επείγον' : 'Ορισμός ως επείγον'}</button>}<label className="project-task-attach"><Paperclip size={16} strokeWidth={1.5} aria-hidden="true" />{stepFile ? stepFile.name : editStep?.file_name || 'Επισύναψη αρχείου'}<input type="file" onChange={event => setStepFile(event.target.files[0])} hidden /></label></div></div>
        </div>
      </ModalShell>

      {toast && <div className={`toast ${toast.isError ? 'toast-error' : 'toast-success'}`} role="status">{toast.msg}</div>}
    </section>
  )
}
