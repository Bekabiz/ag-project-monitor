import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ProjectsTab({ profile, onSelectProject }) {
  const [projects, setProjects] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  // Add/Edit project modal
  const [showModal, setShowModal] = useState(false) // 'add' | project object for edit | false
  const [modalName, setModalName] = useState('')
  const [modalLocation, setModalLocation] = useState('')
  const [modalDesc, setModalDesc] = useState('')
  const [saving, setSaving] = useState(false)

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

  function openAddModal() {
    setModalName('')
    setModalLocation('')
    setModalDesc('')
    setShowModal('add')
  }

  function openEditModal(e, project) {
    e.stopPropagation()
    setModalName(project.name)
    setModalLocation(project.location || '')
    setModalDesc(project.description || '')
    setShowModal(project)
  }

  async function handleSaveProject() {
    if (!modalName.trim()) return
    setSaving(true)
    try {
      if (showModal === 'add') {
        const { error } = await supabase.from('projects').insert({
          name: modalName.trim(),
          location: modalLocation.trim() || null,
          description: modalDesc.trim() || null,
          status: 'active'
        })
        if (error) throw error
      } else {
        // Edit existing
        const { error } = await supabase.from('projects').update({
          name: modalName.trim(),
          location: modalLocation.trim() || null,
          description: modalDesc.trim() || null
        }).eq('id', showModal.id)
        if (error) throw error
      }
      setShowModal(false)
      await loadProjects()
    } catch (err) {
      alert('Σφάλμα: ' + err.message)
    }
    setSaving(false)
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
      {/* Add Project button - owner only */}
      {profile?.role === 'owner' && (
        <div
          className="project-card"
          onClick={openAddModal}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', border: '2px dashed var(--border)', background: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 14 }}>Προσθήκη Έργου</span>
        </div>
      )}

      {projects.map(p => {
        const s = stats[p.id] || {}
        return (
          <div key={p.id} className="project-card" onClick={() => onSelectProject(p)}>
            <div className="card-top">
              <div style={{ flex: 1 }}>
                <span className="card-name">{p.name}</span>
                <div className="card-location">{p.location}{p.description ? <span style={{ margin: '0 5px', color: 'var(--text3)' }}>|</span> : ''}{p.description}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {profile?.role === 'owner' && (
                  <span
                    onClick={(e) => openEditModal(e, p)}
                    style={{ cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </span>
                )}
                <span className={`status-dot status-${s.status || 'green'}`} />
              </div>
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

      {/* Add/Edit Project Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <p className="modal-title">{showModal === 'add' ? 'Νέο Έργο' : 'Επεξεργασία Έργου'}</p>
            <input
              className="modal-input"
              placeholder="Όνομα έργου *"
              value={modalName}
              onChange={e => setModalName(e.target.value)}
              autoFocus
            />
            <input
              className="modal-input"
              placeholder="Τοποθεσία (π.χ. Πύργος)"
              value={modalLocation}
              onChange={e => setModalLocation(e.target.value)}
            />
            <input
              className="modal-input"
              placeholder="Περιγραφή (προαιρετικά)"
              value={modalDesc}
              onChange={e => setModalDesc(e.target.value)}
            />
            <div className="modal-actions">
              <button className="action-btn" onClick={() => setShowModal(false)}>Ακύρωση</button>
              <button
                className="action-btn primary"
                onClick={handleSaveProject}
                disabled={!modalName.trim() || saving}
              >
                {saving ? '...' : 'Αποθήκευση'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
