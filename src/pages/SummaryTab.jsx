import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SummaryTab({ profile }) {
  const [projects, setProjects] = useState([])
  const [entries, setEntries] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshDisabled, setRefreshDisabled] = useState(false)

  // Date range: default last 7 days
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(weekAgo)
  const [dateTo, setDateTo] = useState(today)

  useEffect(() => { loadData() }, [dateFrom, dateTo])

  async function loadData() {
    setLoading(true)
    try {
      const fromISO = new Date(dateFrom).toISOString()
      const toISO = new Date(dateTo + 'T23:59:59').toISOString()

      const [projRes, entryRes, dlRes, sumRes] = await Promise.all([
        supabase.from('projects').select('*').eq('status', 'active'),
        supabase.from('entries').select('*').gte('created_at', fromISO).lte('created_at', toISO),
        supabase.from('deadlines').select('*, projects(name)').in('status', ['overdue', 'pending']).order('due_date'),
        supabase.from('ai_summaries').select('*').eq('scope', 'overall').order('generated_at', { ascending: false }).limit(1)
      ])

      setProjects(projRes.data || [])
      setEntries(entryRes.data || [])
      setDeadlines(dlRes.data || [])
      setSummary(sumRes.data?.[0] || null)
    } catch (err) {
      console.error('Load error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (profile?.role !== 'owner') return <div className="empty-state"><p>Μόνο ο διαχειριστής</p></div>

  // Calculate stats
  const visitsByProject = {}
  const activityCounts = { text: 0, voice: 0, photo: 0, document: 0, email: 0 }
  
  entries.forEach(e => {
    activityCounts[e.entry_type] = (activityCounts[e.entry_type] || 0) + 1
    if (!visitsByProject[e.project_id]) visitsByProject[e.project_id] = 0
    if (e.entry_type === 'text' || e.entry_type === 'voice') visitsByProject[e.project_id]++
  })

  const maxVisits = Math.max(1, ...Object.values(visitsByProject))

  return (
    <div>
      {/* Date Range */}
      <div className="date-range">
        <input type="date" className="date-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className="date-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
      </div>

      {/* Visit Counts */}
      <div className="summary-section">
        <p className="summary-label">Ενημερώσεις ανά έργο</p>
        {projects.map(p => {
          const count = visitsByProject[p.id] || 0
          return (
            <div key={p.id} className="stat-row">
              <span className="stat-name">{p.name}</span>
              <div className="stat-bar">
                <div className="stat-bar-fill" style={{ width: `${(count / maxVisits) * 100}%` }} />
              </div>
              <span className="stat-value">{count}</span>
            </div>
          )
        })}
      </div>

      {/* Budget Overview */}
      <div className="summary-section">
        <p className="summary-label">Προϋπολογισμός</p>
        {projects.filter(p => p.original_budget > 0).map(p => {
          const drift = p.original_budget > 0 
            ? ((p.current_budget - p.original_budget) / p.original_budget * 100).toFixed(1) 
            : 0
          const color = Math.abs(drift) > 10 ? 'var(--red)' : drift > 5 ? 'var(--yellow)' : 'var(--green)'
          return (
            <div key={p.id} className="budget-row">
              <span>{p.name}</span>
              <span>{Number(p.current_budget).toLocaleString('el-GR')}€</span>
              <span className="budget-drift" style={{ color }}>{drift > 0 ? '+' : ''}{drift}%</span>
            </div>
          )
        })}
        {projects.filter(p => p.original_budget > 0).length === 0 && (
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>Δεν έχει οριστεί προϋπολογισμός</p>
        )}
      </div>

      {/* Pending Actions */}
      <div className="summary-section">
        <p className="summary-label">Εκκρεμότητες</p>
        {deadlines.length === 0 && (
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>Καμία εκκρεμότητα</p>
        )}
        {deadlines.map(d => {
          const isOverdue = d.status === 'overdue'
          const daysUntil = Math.ceil((new Date(d.due_date) - new Date()) / 86400000)
          return (
            <div key={d.id} className="pending-item">
              <div className="pending-desc" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOverdue ? 'var(--red)' : 'var(--yellow)', flexShrink: 0 }} />
                {d.description}
              </div>
              <div className="pending-meta">
                <strong style={{ fontWeight: 600 }}>{d.projects?.name}</strong>
                <span style={{ margin: '0 5px', color: 'var(--text3)' }}>|</span>
                {isOverdue ? `${Math.abs(daysUntil)} μέρες καθυστέρηση` : `Έως ${new Date(d.due_date).toLocaleDateString('el-GR')}`}
              </div>
            </div>
          )
        })}
      </div>

      {/* Activity Counts */}
      <div className="summary-section">
        <p className="summary-label">Δραστηριότητα περιόδου</p>
        <div className="stat-row"><span className="stat-name">Σημειώσεις</span><span className="stat-value">{activityCounts.text}</span></div>
        <div className="stat-row"><span className="stat-name">Ηχητικά</span><span className="stat-value">{activityCounts.voice}</span></div>
        <div className="stat-row"><span className="stat-name">Φωτογραφίες</span><span className="stat-value">{activityCounts.photo}</span></div>
        <div className="stat-row"><span className="stat-name">Έγγραφα</span><span className="stat-value">{activityCounts.document}</span></div>
        <div className="stat-row"><span className="stat-name">Email</span><span className="stat-value">{activityCounts.email}</span></div>
      </div>

      {/* AI Summary */}
      <div className="ai-summary-box" style={{ marginBottom: 20 }}>
        <div className="ai-summary-label">AI Σύνοψη</div>
        <div className="ai-summary-text">
          {summary?.summary_text || 'Θα δημιουργηθεί μετά τις πρώτες ενημερώσεις.'}
        </div>
        <button className="ai-refresh" onClick={async () => {
          setRefreshDisabled(true)
          try {
            const recentEntries = entries.slice(0, 15).map(e => ({
              created_at: e.created_at,
              entry_type: e.entry_type,
              ai_summary: e.ai_summary,
              raw_text: e.raw_text,
              file_name: e.file_name
            }))
            const res = await fetch('/api/summary', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ entries: recentEntries, scope: 'overall' })
            })
            if (res.ok) {
              const { summary: summaryText } = await res.json()
              await supabase.from('ai_summaries').upsert({
                scope: 'overall',
                summary_text: summaryText,
                generated_at: new Date().toISOString()
              }, { onConflict: 'scope' })
              setSummary({ summary_text: summaryText })
            }
          } catch (err) { console.error('Summary error:', err) }
          setTimeout(() => setRefreshDisabled(false), 300000)
        }} disabled={refreshDisabled}>
          Ανανέωση {refreshDisabled ? '(5 λεπτά)' : ''}
        </button>
      </div>
    </div>
  )
}
