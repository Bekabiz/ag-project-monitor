import { useState, useEffect } from 'react'
import { Plus, Pencil, Building2, MapPin } from 'lucide-react'
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
    try {
      // Single query via SQL view — replaces N+1 loop (was 2 queries per project)
      const { data: projs } = await supabase
        .from('project_dashboard_stats').select('*').eq('status', 'active').order('name')

      if (!projs) { setLoading(false); return }

      const statsMap = {}
      for (const p of projs) {
        const daysSinceUpdate = p.last_entry_at
          ? Math.floor((Date.now() - new Date(p.last_entry_at)) / 86400000)
          : 999

        let status = 'green'
        if ((p.overdue_deadlines || 0) > 0) status = 'red'
        else if (daysSinceUpdate >= 7) status = 'yellow'

        statsMap[p.id] = {
          status,
          overdueCount: p.overdue_deadlines || 0,
          daysSinceUpdate,
          lastUpdate: p.last_entry_at,
          lastPhoto: p.last_photo_at,
          totalEntries: p.total_entries || 0
        }
      }

      setProjects(projs)
      setStats(statsMap)
    } catch (err) {
      console.error('Load error:', err)
    } finally {
      setLoading(false)
    }
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
          <Building2 size={32} strokeWidth={1.5} />
        </div>
        <p>Δεν υπάρχουν έργα</p>
      </div>
    )
  }

  return (
    <div>
      <div className="projects-grid">
      {/* Add Project button - owner only */}
      {profile?.role === 'owner' && (
        <div
          className="project-card"
          onClick={openAddModal}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', border: '2px dashed var(--border)', background: 'transparent' }}
        >
          <Plus size={20} strokeWidth={1.6} color="var(--blue)" />
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
                    <Pencil size={16} strokeWidth={1.6} color="var(--text3)" />
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
      </div>

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
