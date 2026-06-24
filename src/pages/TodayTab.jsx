import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function TodayTab({ profile }) {
  const [mySteps, setMySteps] = useState([])
  const [updates, setUpdates] = useState([])
  const [generalUpdates, setGeneralUpdates] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState('today')
  const [showAddUpdate, setShowAddUpdate] = useState(false)
  const [updateText, setUpdateText] = useState('')
  const [updateFile, setUpdateFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [expandedPerson, setExpandedPerson] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Get all team profiles
    const { data: profs } = await supabase.from('profiles').select('*')
    setProfiles(profs || [])

    // My assigned steps (all active, not just today)
    const { data: steps } = await supabase
      .from('steps')
      .select('*, projects:project_id(name)')
      .eq('assigned_to', profile.id)
      .neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false })
    setMySteps(steps || [])

    // Today's step updates (steps marked done today or updated today)
    const { data: recentSteps } = await supabase
      .from('steps')
      .select('*, projects:project_id(name)')
      .gte('updated_at', today.toISOString())
      .lt('updated_at', tomorrow.toISOString())
      .eq('status', 'done')
      .order('updated_at', { ascending: false })
    setUpdates(recentSteps || [])

    // Today's general updates
    const { data: genUpdates } = await supabase
      .from('general_updates')
      .select('*')
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())
      .order('created_at', { ascending: false })
    setGeneralUpdates(genUpdates || [])

    setLoading(false)
  }

  async function handleAddUpdate() {
    if (!updateText.trim()) return
    setSending(true)

    let fileUrl = null
    if (updateFile) {
      const ext = updateFile.name.split('.').pop()
      const path = `general/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('files').upload(path, updateFile)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
        fileUrl = urlData.publicUrl
      }
    }

    await supabase.from('general_updates').insert({
      user_id: profile.id,
      user_name: profile.full_name,
      text: updateText.trim(),
      file_url: fileUrl
    })

    setUpdateText('')
    setUpdateFile(null)
    setShowAddUpdate(false)
    setSending(false)
    await loadData()
  }

  function getOverdueCount() {
    const today = new Date().toISOString().split('T')[0]
    return mySteps.filter(s => s.due_date && s.due_date < today && s.status !== 'done').length
  }

  function getDaysInfo(step) {
    if (!step.due_date) return { text: 'No date', className: '' }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(step.due_date)
    const diff = Math.ceil((due - today) / 86400000)
    if (diff < 0) return { text: `${Math.abs(diff)} days late`, className: 'step-overdue' }
    if (diff === 0) return { text: 'Due today', className: 'step-today' }
    if (diff <= 3) return { text: `${diff} days left`, className: 'step-soon' }
    return { text: due.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' }), className: '' }
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

  // Group updates by person
  function getPersonUpdates() {
    const people = {}
    // Add completed step updates
    updates.forEach(u => {
      const name = u.assigned_to_name || 'Unknown'
      if (!people[name]) people[name] = []
      people[name].push({
        type: 'task_done',
        text: u.title,
        project: u.projects?.name,
        time: new Date(u.updated_at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      })
    })
    // Add general updates
    generalUpdates.forEach(u => {
      const name = u.user_name || 'Unknown'
      if (!people[name]) people[name] = []
      people[name].push({
        type: 'general',
        text: u.text,
        file_url: u.file_url,
        time: new Date(u.created_at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      })
    })
    return people
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return <div className="loading-inline"><div className="spinner" /></div>

  const overdueCount = getOverdueCount()
  const personUpdates = getPersonUpdates()
  const otherProfiles = profiles.filter(p => p.id !== profile.id)

  return (
    <div>
      {/* MY TASKS SECTION */}
      <div className="today-section">
        <div className="today-section-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>
          <span>Οι εργασίες μου ({mySteps.length})</span>
          {overdueCount > 0 && <span className="overdue-badge">{overdueCount} εκπρόθεσμ{overdueCount > 1 ? 'ες' : 'η'}</span>}
        </div>

        {mySteps.length === 0 && (
          <div className="empty-state">Δεν έχεις εκκρεμείς εργασίες</div>
        )}

        {mySteps.map(step => {
          const info = getDaysInfo(step)
          const cls = getStatusClass(step)
          return (
            <div key={step.id} className={`step-card ${cls}`}>
              <div className="step-card-top">
                <span className="step-title">{step.title}</span>
              </div>
              <div className="step-meta">
                <span>{step.projects?.name || 'General'}</span>
                {step.due_date && (
                  <>
                    <span className="step-sep">|</span>
                    <span>{info.text}</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* TODAY'S UPDATES - BY PERSON */}
      <div className="today-section">
        <div className="today-section-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Ενημερώσεις σήμερα</span>
        </div>

        {Object.keys(personUpdates).length === 0 && (
          <div className="empty-state">Δεν υπάρχουν ενημερώσεις σήμερα</div>
        )}

        {Object.entries(personUpdates).map(([name, items]) => (
          <div key={name} className="person-update-card" onClick={() => setExpandedPerson(expandedPerson === name ? null : name)}>
            <div className="person-update-header">
              <div className="person-avatar">{name.charAt(0)}</div>
              <span className="person-name">{name}</span>
              <span className="person-count">{items.length} ενημ.</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: expandedPerson === name ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {expandedPerson === name && (
              <div className="person-update-list">
                {items.map((item, i) => (
                  <div key={i} className="person-update-item">
                    <div className="update-time">{item.time}</div>
                    {item.type === 'task_done' ? (
                      <div className="update-text update-done">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                        {item.text} <span className="update-project">({item.project})</span>
                      </div>
                    ) : (
                      <div className="update-text">{item.text}</div>
                    )}
                    {item.file_url && (
                      <a href={item.file_url} target="_blank" rel="noopener" className="update-file">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                        Attachment
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* People who haven't updated today */}
        {otherProfiles
          .filter(p => !personUpdates[p.full_name])
          .map(p => (
            <div key={p.id} className="person-update-card person-no-update">
              <div className="person-update-header">
                <div className="person-avatar person-avatar-inactive">{p.full_name?.charAt(0)}</div>
                <span className="person-name" style={{ opacity: 0.5 }}>{p.full_name}</span>
                <span className="person-count" style={{ opacity: 0.4 }}>No updates</span>
              </div>
            </div>
          ))
        }
      </div>

      {/* ADD GENERAL UPDATE */}
      {showAddUpdate ? (
        <div className="today-add-update">
          <textarea
            className="today-update-textarea"
            placeholder="General update..."
            value={updateText}
            onChange={e => setUpdateText(e.target.value)}
            rows={3}
            autoFocus
          />
          <div className="today-update-actions">
            <label className="today-file-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              <input type="file" accept="image/*" onChange={e => setUpdateFile(e.target.files[0])} hidden />
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="action-btn" onClick={() => { setShowAddUpdate(false); setUpdateText(''); setUpdateFile(null) }}>Cancel</button>
              <button className="action-btn primary" onClick={handleAddUpdate} disabled={!updateText.trim() || sending}>
                {sending ? '...' : 'Post'}
              </button>
            </div>
          </div>
          {updateFile && <div className="today-file-name">{updateFile.name}</div>}
        </div>
      ) : (
        <button className="today-add-btn" onClick={() => setShowAddUpdate(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Γενική ενημέρωση
        </button>
      )}
    </div>
  )
}
