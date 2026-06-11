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
    if (!iso) return '—'
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
        <div className="icon"></div>
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
                <div className="card-location">{p.location} — {p.description}</div>
              </div>
              <span className={`status-dot status-${s.status || 'green'}`} />
            </div>
            {s.overdueCount > 0 && (
              <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 4 }}>
                ! {s.overdueCount} εκκρεμότητ{s.overdueCount > 1 ? 'ες' : 'α'}
              </div>
            )}
            {s.status === 'yellow' && (
              <div style={{ fontSize: 13, color: 'var(--yellow)', marginTop: 4 }}>
                {s.daysSinceUpdate} μέρες χωρίς ενημέρωση
              </div>
            )}
            <div className="card-meta">
              <span>Φωτο: {formatDate(s.lastPhoto)}</span>
              <span>Ενημ: {formatDate(s.lastUpdate)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
