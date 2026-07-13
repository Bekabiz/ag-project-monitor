/**
 * Shared date/time and status helpers for AG Project Monitor.
 * Consolidates duplicate implementations from TodayTab, MonitorTab, StepsView.
 */

export function getDaysInfo(step) {
  if (!step.due_date) return { text: 'Χωρίς ημ/νία', className: '' }
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const dueDay = new Date(step.due_date); dueDay.setHours(0, 0, 0, 0)
  const diff = Math.ceil((dueDay - now) / 86400000)
  if (step.status === 'done') return { text: 'Έγινε', className: 'step-done' }
  if (diff < 0) return { text: `${Math.abs(diff)} ημ. καθυστ.`, className: 'step-overdue' }
  if (diff === 0) return { text: 'Σήμερα', className: 'step-today' }
  if (diff <= 3) return { text: `${diff} ημ.`, className: 'step-soon' }
  return { text: dueDay.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' }), className: '' }
}

export function getDaysText(step) {
  if (!step.due_date) return ''
  return getDaysInfo(step).text
}

export function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return 'Σήμερα'
  if (diff === 1) return 'Χθες'
  return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })
}

export function formatDateShort(iso) {
  return new Date(iso).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })
}

export function formatDueTime(step) {
  if (!step.due_date) return ''
  const d = new Date(step.due_date)
  const h = d.getHours(); const m = d.getMinutes()
  if (h === 0 && m === 0) return ''
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function getStatusLabel(s) {
  return { not_started: 'Νέα', in_progress: 'Σε εξέλιξη', waiting: 'Αναμονή', done: 'Ολοκληρ.' }[s] || s
}

export function getStatusColor(s) {
  if (s === 'done') return 'var(--green)'
  if (s === 'in_progress') return 'var(--blue)'
  if (s === 'waiting') return 'var(--yellow)'
  return 'var(--text3)'
}

export function getStepCardClass(step) {
  if (step.status === 'done') return 'step-card step-done'
  const info = getDaysInfo(step)
  if (info.className === 'step-overdue') return 'step-card step-overdue'
  if (info.className === 'step-today' || info.className === 'step-soon') return 'step-card step-soon'
  if (step.status === 'waiting') return 'step-card step-waiting'
  if (step.status === 'in_progress') return 'step-card step-progress'
  return 'step-card'
}

export function getOverdueCount(steps) {
  const now = new Date()
  return steps.filter(s => s.due_date && new Date(s.due_date) < now && s.status !== 'done').length
}
