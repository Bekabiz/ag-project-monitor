import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ProjectsTab({ profile, onSelectProject }) {
  const [projects, setProjects] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    const { data: projs } = await supabase
      .from('projects').select('*').eq('status', 'active').order('name')
    
    if (!projs) { setLoading(false); return }

    // Load stats for each project
    const statsMap = {}
    for (const p of projs) {
      const { data: entries } = await supabase
        .from('entries').select('entry_type, created_at')
        .eq('project_id', p.id).order('created_at', { ascending: false }).limit(50)

      const { data: deadlines } = await supabase
        .from('deadlines').select('*')
        .eq('project_id', p.id).eq('status', 'overdue')

      const lastEntry = entries?.[0]
      const lastPhoto = entries?.find(e => e.entry_type === 'photo')
      const overdueCount = deadlines?.length || 0
      const daysSinceUpdate = lastEntry 
        ? Math.floor((Date.now() - new Date(lastEntry.created_at)) / 86400000) 
        : 999

      let status = 'green'
      if (overdueCount > 0) status = 'red'
      else if (daysSinceUpdate >= 7) status = 'yellow'

      statsMap[p.id] = {
        status,
        overdueCount,
        daysSinceUpdate,
        lastUpdate: lastEntry?.created_at,
        lastPhoto: lastPhoto?.created_at,
        totalEntries: entries?.length || 0
      }
    }

    setProjects(projs)
    setStats(statsMap)
    setLoading(false)
  }

  function formatDate(iso) {
    if (!iso) return '-'
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.floor((now - d) / 86400000)
    if (diff === 0) return 'Σήμερα'
    if (diff === 1) return 'Χθες'
    return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
        </div>
        <p>Δεν υπάρχουν έργα</p>
      </div>
    )
  }

  return (
    <div>
      {projects.map(p => {
        const s = stats[p.id] || {}
        return (
          <div key={p.id} className="project-card" onClick={() => onSelectProject(p)}>
            <div className="card-top">
              <div>
                <span className="card-name">{p.name}</span>
                <div className="card-location">{p.location}{p.description ? <span style={{ margin: '0 5px', color: 'var(--text3)' }}>|</span> : ''}{p.description}</div>
              </div>
              <span className={`status-dot status-${s.status || 'green'}`} />
            </div>
            {s.overdueCount > 0 && (
              <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6, fontWeight: 500 }}>
                {s.overdueCount} εκκρεμότητ{s.overdueCount > 1 ? 'ες' : 'α'}
              </div>
            )}
            {s.status === 'yellow' && (
              <div style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 6, fontWeight: 500 }}>
                {s.daysSinceUpdate} μέρες χωρίς ενημέρωση
              </div>
            )}
            <div className="card-meta">
              <span><strong style={{ fontWeight: 600 }}>Φωτο</strong> {formatDate(s.lastPhoto)}</span>
              <span><strong style={{ fontWeight: 600 }}>Ενημ</strong> {formatDate(s.lastUpdate)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
