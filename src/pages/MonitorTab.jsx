import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function MonitorTab({ profile }) {
  const [assignedTasks, setAssignedTasks] = useState([])
  const [plans, setPlans] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('tasks')

  // Plan creation
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [planText, setPlanText] = useState('')
  const [planDate, setPlanDate] = useState('')
  const [planSaving, setPlanSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)

    // Tasks I created for others (not assigned to me)
    const { data: tasks } = await supabase
      .from('steps')
      .select('*, projects:project_id(name)')
      .eq('created_by', profile.id)
      .neq('assigned_to', profile.id)
      .order('is_urgent', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
    setAssignedTasks(tasks || [])

    // My plans (upcoming + recent)
    const today = new Date().toISOString().split('T')[0]
    const { data: myPlans } = await supabase
      .from('manager_plans')
      .select('*')
      .eq('user_id', profile.id)
      .gte('plan_date', today)
      .eq('is_done', false)
      .order('plan_date', { ascending: true })
    setPlans(myPlans || [])

    // Deadlines
    const { data: dls } = await supabase
      .from('deadlines')
      .select('*, projects(name)')
      .in('status', ['overdue', 'pending'])
      .order('due_date')
    setDeadlines(dls || [])

    // Projects for budget
    const { data: projs } = await supabase
      .from('projects')
      .select('*')
      .eq('status', 'active')
      .order('name')
    setProjects(projs || [])

    setLoading(false)
  }

  // Group tasks by person
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
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const due = new Date(step.due_date)
    due.setHours(0, 0, 0, 0)
    const diff = Math.ceil((due - now) / 86400000)
    if (diff < 0) return `${Math.abs(diff)} ημ. καθυστ.`
    if (diff === 0) return 'Σήμερα'
    if (diff <= 3) return `${diff} ημ.`
    return due.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })
  }

  function getStatusColor(status) {
    if (status === 'done') return 'var(--green)'
    if (status === 'in_progress') return 'var(--blue)'
    if (status === 'waiting') return 'var(--yellow)'
    return 'var(--text3)'
  }

  function getStatusLabel(status) {
    const map = { not_started: 'Νέα', in_progress: 'Σε εξέλιξη', waiting: 'Αναμονή', done: 'Έγινε' }
    return map[status] || status
  }

  async function savePlan() {
    if (!planText.trim() || !planDate) return
    setPlanSaving(true)
    await supabase.from('manager_plans').insert({
      user_id: profile.id,
      plan_date: planDate,
      text: planText.trim()
    })
    setPlanText('')
    setPlanDate('')
    setShowPlanModal(false)
    setPlanSaving(false)
    await loadData()
  }

  async function markPlanDone(planId) {
    await supabase.from('manager_plans').update({ is_done: true }).eq('id', planId)
    await loadData()
  }

  async function deletePlan(planId) {
    await supabase.from('manager_plans').delete().eq('id', planId)
    await loadData()
  }

  if (loading) return <div className="loading-inline"><div className="spinner" /></div>
  if (profile?.role !== 'owner') return <div className="empty-state"><p>Μόνο ο διαχειριστής</p></div>

  const tasksByPerson = getTasksByPerson()
  const totalActive = assignedTasks.filter(t => t.status !== 'done').length
  const totalUrgent = assignedTasks.filter(t => t.is_urgent && t.status !== 'done').length
  const overdueDeadlines = deadlines.filter(d => d.status === 'overdue')

  return (
    <div className="monitor-page">
      {/* Section Switcher */}
      <div className="monitor-switcher">
        <button
          className={`monitor-sw-btn ${activeSection === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveSection('tasks')}
        >
          Εργασίες
          {totalActive > 0 && <span className="monitor-sw-count">{totalActive}</span>}
        </button>
        <button
          className={`monitor-sw-btn ${activeSection === 'planner' ? 'active' : ''}`}
          onClick={() => setActiveSection('planner')}
        >
          Σχεδιασμός
          {plans.length > 0 && <span className="monitor-sw-count">{plans.length}</span>}
        </button>
        <button
          className={`monitor-sw-btn ${activeSection === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSection('overview')}
        >
          Εποπτεία
        </button>
      </div>

      {/* ========== TASKS I ASSIGNED ========== */}
      {activeSection === 'tasks' && (
        <div>
          {/* Quick stats bar */}
          <div className="monitor-stats-bar">
            <div className="monitor-stat">
              <span className="monitor-stat-num">{totalActive}</span>
              <span className="monitor-stat-label">Ενεργές</span>
            </div>
            <div className="monitor-stat">
              <span className="monitor-stat-num" style={{ color: totalUrgent > 0 ? 'var(--red)' : undefined }}>{totalUrgent}</span>
              <span className="monitor-stat-label">Επείγοντα</span>
            </div>
            <div className="monitor-stat">
              <span className="monitor-stat-num" style={{ color: 'var(--green)' }}>{assignedTasks.filter(t => t.status === 'done').length}</span>
              <span className="monitor-stat-label">Ολοκληρ.</span>
            </div>
          </div>

          {Object.keys(tasksByPerson).length === 0 && (
            <div className="empty-state" style={{ padding: '40px 16px' }}>
              Δεν έχεις αναθέσει εργασίες
            </div>
          )}

          {Object.entries(tasksByPerson).map(([personName, group]) => (
            <div key={personName} className="monitor-person-group">
              <div className="monitor-person-header">
                <div className="monitor-person-avatar">{personName.charAt(0)}</div>
                <div style={{ flex: 1 }}>
                  <div className="monitor-person-name">{personName}</div>
                  <div className="monitor-person-meta">
                    {group.active} ενεργές
                    {group.urgent > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>🔴 {group.urgent} επείγ.</span>}
                    {group.done > 0 && <span style={{ color: 'var(--green)', marginLeft: 8 }}>✓ {group.done}</span>}
                  </div>
                </div>
              </div>

              {group.tasks.filter(t => t.status !== 'done').map(task => (
                <div key={task.id} className={`monitor-task-card ${task.is_urgent ? 'monitor-task-urgent' : ''}`}>
                  <div className="monitor-task-top">
                    {task.is_urgent && <span className="urgent-badge">!</span>}
                    <span className="monitor-task-title">{task.title}</span>
                    <span className="monitor-task-status" style={{ color: getStatusColor(task.status) }}>
                      {getStatusLabel(task.status)}
                    </span>
                  </div>
                  {task.description && <div className="monitor-task-desc">{task.description}</div>}
                  <div className="monitor-task-meta">
                    <span>{task.projects?.name || 'Προσωπικό'}</span>
                    {task.due_date && (
                      <>
                        <span className="step-sep">·</span>
                        <span style={{ color: getDaysText(task).includes('καθυστ') ? 'var(--red)' : undefined }}>
                          {getDaysText(task)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* Completed tasks (collapsed) */}
              {group.done > 0 && (
                <div className="monitor-done-summary">
                  ✓ {group.done} ολοκληρωμέν{group.done > 1 ? 'ες' : 'η'}
                </div>
              )}
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

          {plans.length === 0 && (
            <div className="empty-state" style={{ padding: '40px 16px' }}>
              Κανένα προγραμματισμένο σχέδιο
            </div>
          )}

          {plans.map(plan => {
            const planDay = new Date(plan.plan_date)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const isToday = planDay.toDateString() === today.toDateString()
            const isTomorrow = Math.ceil((planDay - today) / 86400000) === 1
            const dateLabel = isToday ? 'Σήμερα' : isTomorrow ? 'Αύριο' : planDay.toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short' })

            return (
              <div key={plan.id} className={`plan-card ${isToday ? 'plan-card-today' : ''}`}>
                <div className="plan-card-date">{dateLabel}</div>
                <div className="plan-card-text">{plan.text}</div>
                <div className="plan-card-actions">
                  <button className="plan-action-btn plan-done-btn" onClick={() => markPlanDone(plan.id)}>
                    ✓ Έγινε
                  </button>
                  <button className="plan-action-btn plan-delete-btn" onClick={() => deletePlan(plan.id)}>
                    ✕
                  </button>
                </div>
              </div>
            )
          })}

          {/* Plan Modal */}
          {showPlanModal && (
            <div className="modal-overlay" onClick={() => setShowPlanModal(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <p className="modal-title">Νέο σχέδιο</p>
                <textarea
                  className="modal-input"
                  placeholder="Τι πρέπει να γίνει..."
                  value={planText}
                  onChange={e => setPlanText(e.target.value)}
                  rows={3}
                  autoFocus
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
                <input
                  className="modal-input"
                  type="date"
                  value={planDate}
                  onChange={e => setPlanDate(e.target.value)}
                />
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

      {/* ========== OVERVIEW (from old Summary) ========== */}
      {activeSection === 'overview' && (
        <div>
          {/* Deadlines */}
          <div className="monitor-overview-section">
            <div className="monitor-overview-title">
              Προθεσμίες
              {overdueDeadlines.length > 0 && <span className="overdue-badge" style={{ marginLeft: 8 }}>{overdueDeadlines.length} εκπρόθ.</span>}
            </div>
            {deadlines.length === 0 && <div className="monitor-overview-empty">Καμία εκκρεμότητα</div>}
            {deadlines.map(d => {
              const isOverdue = d.status === 'overdue'
              const daysUntil = Math.ceil((new Date(d.due_date) - new Date()) / 86400000)
              return (
                <div key={d.id} className="monitor-deadline-card">
                  <span className="monitor-deadline-dot" style={{ background: isOverdue ? 'var(--red)' : 'var(--yellow)' }} />
                  <div style={{ flex: 1 }}>
                    <div className="monitor-deadline-desc">{d.description}</div>
                    <div className="monitor-deadline-meta">
                      {d.projects?.name}
                      <span className="step-sep">·</span>
                      <span style={{ color: isOverdue ? 'var(--red)' : undefined }}>
                        {isOverdue ? `${Math.abs(daysUntil)} ημ. καθυστ.` : new Date(d.due_date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Budget */}
          {projects.filter(p => p.original_budget > 0).length > 0 && (
            <div className="monitor-overview-section">
              <div className="monitor-overview-title">Προϋπολογισμός</div>
              {projects.filter(p => p.original_budget > 0).map(p => {
                const drift = ((p.current_budget - p.original_budget) / p.original_budget * 100).toFixed(1)
                const color = Math.abs(drift) > 10 ? 'var(--red)' : drift > 5 ? 'var(--yellow)' : 'var(--green)'
                return (
                  <div key={p.id} className="monitor-budget-row">
                    <span className="monitor-budget-name">{p.name}</span>
                    <span className="monitor-budget-amount">{Number(p.current_budget).toLocaleString('el-GR')}€</span>
                    <span style={{ color, fontWeight: 600, fontSize: 13 }}>{drift > 0 ? '+' : ''}{drift}%</span>
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
