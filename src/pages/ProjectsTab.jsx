import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Building2, Clock3, FileText, MapPin, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { db, dbRead, supabase } from '../lib/db'
import { ButtonSpinner, EmptyState, InlineNotice, LoadingState, ModalShell } from '../components/ui'

const STATUS_COPY = {
  green: { label: 'Σε εξέλιξη', description: 'Η ενημέρωση του έργου είναι πρόσφατη' },
  yellow: { label: 'Χρειάζεται ενημέρωση', description: 'Δεν υπάρχει πρόσφατη καταχώρηση' },
  red: { label: 'Απαιτεί προσοχή', description: 'Υπάρχουν εκπρόθεσμες εκκρεμότητες' },
}

export default function ProjectsTab({ profile, onSelectProject }) {
  const [projects, setProjects] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [modalName, setModalName] = useState('')
  const [modalLocation, setModalLocation] = useState('')
  const [modalDesc, setModalDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [toast, setToast] = useState(null)

  function showToast(message, isError = false) {
    setToast({ message, isError })
    window.setTimeout(() => setToast(null), 2800)
  }

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    setLoading(true)
    setLoadError(false)
    try {
      const projs = await dbRead(supabase
        .from('project_dashboard_stats')
        .select('*')
        .eq('status', 'active'))

      // Postgres orders by byte value, which puts every Latin name above every
      // Greek one. Sort in the browser with Greek collation so it reads
      // alphabetically to the office.
      projs.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'el', { sensitivity: 'base' }))

      const statsMap = {}
      for (const project of projs) {
        const daysSinceUpdate = project.last_entry_at
          ? Math.floor((Date.now() - new Date(project.last_entry_at)) / 86400000)
          : null

        let health = 'green'
        if ((project.overdue_deadlines || 0) > 0) health = 'red'
        else if (daysSinceUpdate === null || daysSinceUpdate >= 7) health = 'yellow'

        statsMap[project.id] = {
          status: health,
          overdueCount: project.overdue_deadlines || 0,
          daysSinceUpdate,
          lastUpdate: project.last_entry_at,
          lastPhoto: project.last_photo_at,
          totalEntries: project.total_entries || 0,
        }
      }

      setProjects(projs)
      setStats(statsMap)
    } catch (error) {
      console.error('Project load error:', error)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  function formatDate(iso) {
    if (!iso) return 'Δεν υπάρχει'
    const date = new Date(iso)
    const diff = Math.floor((Date.now() - date.getTime()) / 86400000)
    if (diff === 0) return 'Σήμερα'
    if (diff === 1) return 'Χθες'
    if (diff < 7) return `${diff} ημέρες πριν`
    return date.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })
  }

  function openAddModal() {
    setModalName('')
    setModalLocation('')
    setModalDesc('')
    setSaveError('')
    setShowModal('add')
  }

  function openEditModal(event, project) {
    event.stopPropagation()
    setModalName(project.name)
    setModalLocation(project.location || '')
    setModalDesc(project.description || '')
    setSaveError('')
    setShowModal(project)
  }

  async function handleSaveProject() {
    if (!modalName.trim() || saving) return
    setSaving(true)
    setSaveError('')
    try {
      const payload = {
        name: modalName.trim(),
        location: modalLocation.trim() || null,
        description: modalDesc.trim() || null,
      }

      if (showModal === 'add') {
        await db(supabase.from('projects').insert({ ...payload, status: 'active' }))
      } else {
        await db(supabase.from('projects').update(payload).eq('id', showModal.id))
      }

      setShowModal(false)
      showToast(showModal === 'add' ? 'Το έργο δημιουργήθηκε.' : 'Οι αλλαγές αποθηκεύτηκαν.')
      await loadProjects()
    } catch (error) {
      const message = error.message || 'Δεν ήταν δυνατή η αποθήκευση του έργου.'
      setSaveError(message)
      showToast(message, true)
    } finally {
      setSaving(false)
    }
  }

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('el-GR')
    if (!query) return projects
    return projects.filter(project => [project.name, project.location, project.description]
      .filter(Boolean)
      .some(value => value.toLocaleLowerCase('el-GR').includes(query)))
  }, [projects, search])

  const healthCounts = useMemo(() => projects.reduce((result, project) => {
    const health = stats[project.id]?.status || 'green'
    result[health] += 1
    return result
  }, { green: 0, yellow: 0, red: 0 }), [projects, stats])

  if (loading) return <LoadingState label="Φόρτωση έργων…" cards={6} />

  if (loadError) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="Δεν φορτώθηκαν τα έργα"
        description="Η λίστα έργων δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκιμάστε ξανά χωρίς να χαθεί καμία αλλαγή."
        actionLabel="Δοκιμή ξανά"
        onAction={loadProjects}
      />
    )
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Δεν υπάρχουν έργα ακόμη"
        description="Δημιουργήστε το πρώτο έργο για να ξεκινήσει η οργάνωση εργασιών, ενημερώσεων και αρχείων."
        actionLabel="Δημιουργία πρώτου έργου"
        onAction={openAddModal}
      />
    )
  }

  return (
    <div className="projects-command-page">
      <section className="projects-overview-bar">
        <div className="projects-overview-copy">
          <span className="projects-eyebrow">Χαρτοφυλάκιο ενεργών έργων</span>
          <h2>{projects.length} ενεργά έργα</h2>
          <p>Συγκρίνετε γρήγορα την κατάσταση, την τελευταία ενημέρωση και τις εκκρεμότητες κάθε έργου.</p>
        </div>
        <div className="projects-health-summary" aria-label="Κατάσταση έργων">
          <div><span className="project-health-dot is-green" /><strong>{healthCounts.green}</strong><small>Σε εξέλιξη</small></div>
          <div><span className="project-health-dot is-yellow" /><strong>{healthCounts.yellow}</strong><small>Χρειάζονται ενημέρωση</small></div>
          <div><span className="project-health-dot is-red" /><strong>{healthCounts.red}</strong><small>Απαιτούν προσοχή</small></div>
        </div>
      </section>

      <section className="projects-toolbar" aria-label="Εργαλεία έργων">
        <label className="projects-search">
          <Search size={17} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Αναζήτηση έργων</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Αναζήτηση με όνομα, τοποθεσία ή περιγραφή…" />
        </label>
        <div className="projects-toolbar-actions">
          <button type="button" className="projects-refresh-button" onClick={loadProjects} aria-label="Ανανέωση έργων"><RefreshCw size={17} strokeWidth={1.5} aria-hidden="true" /></button>
          <button type="button" className="projects-add-button" onClick={openAddModal}><Plus size={17} strokeWidth={1.5} aria-hidden="true" />Νέο έργο</button>
        </div>
      </section>

      {filteredProjects.length === 0 ? (
        <EmptyState icon={Search} title="Δεν βρέθηκε έργο" description={`Δεν υπάρχει ενεργό έργο που να ταιριάζει με «${search}».`} compact />
      ) : (
        <section className="projects-professional-grid" aria-label="Ενεργά έργα">
          {filteredProjects.map(project => {
            const projectStats = stats[project.id] || {}
            const health = projectStats.status || 'green'
            const healthCopy = STATUS_COPY[health]

            return (
              <article key={project.id} className={`project-professional-card is-${health}`}>
                <div className="project-card-accent" aria-hidden="true" />
                <div className="project-card-header">
                  <div className="project-card-icon" aria-hidden="true"><Building2 size={20} strokeWidth={1.5} /></div>
                  <div className="project-health-label"><span className={`project-health-dot is-${health}`} /><span>{healthCopy.label}</span></div>
                  {profile?.role === 'owner' && (
                    <button type="button" className="project-card-edit" onClick={event => openEditModal(event, project)} aria-label={`Επεξεργασία έργου ${project.name}`}>
                      <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <button type="button" className="project-card-main" onClick={() => onSelectProject(project)}>
                  <span className="project-card-title">{project.name}</span>
                  <span className="project-card-location"><MapPin size={14} strokeWidth={1.5} aria-hidden="true" />{project.location || 'Δεν έχει οριστεί τοποθεσία'}</span>
                  {project.description && <span className="project-card-description">{project.description}</span>}

                  {(projectStats.overdueCount > 0 || health === 'yellow') && (
                    <span className={`project-card-alert is-${health}`}>
                      {health === 'red' ? <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" /> : <Clock3 size={14} strokeWidth={1.5} aria-hidden="true" />}
                      {health === 'red'
                        ? `${projectStats.overdueCount} εκπρόθεσμ${projectStats.overdueCount === 1 ? 'η εκκρεμότητα' : 'ες εκκρεμότητες'}`
                        : projectStats.daysSinceUpdate === null
                          ? 'Δεν υπάρχουν ακόμη ενημερώσεις'
                          : projectStats.daysSinceUpdate > 30
                            ? 'Πάνω από 30 ημέρες χωρίς ενημέρωση'
                            : `${projectStats.daysSinceUpdate} ημέρες χωρίς ενημέρωση`}
                    </span>
                  )}

                  <span className="project-card-metrics">
                    <span><FileText size={14} strokeWidth={1.5} aria-hidden="true" /><strong>{projectStats.totalEntries || 0}</strong><small>Καταχωρήσεις</small></span>
                    <span><Clock3 size={14} strokeWidth={1.5} aria-hidden="true" /><strong>{formatDate(projectStats.lastUpdate)}</strong><small>Τελευταία ενημέρωση</small></span>
                  </span>

                  <span className="project-card-footer">
                    <span>{healthCopy.description}</span>
                    <span>Άνοιγμα έργου <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" /></span>
                  </span>
                </button>
              </article>
            )
          })}
        </section>
      )}

      <ModalShell
        open={Boolean(showModal)}
        onClose={() => setShowModal(false)}
        title={showModal === 'add' ? 'Νέο έργο' : 'Επεξεργασία έργου'}
        description={showModal === 'add' ? 'Προσθέστε τα βασικά στοιχεία. Περισσότερες πληροφορίες μπορούν να οργανωθούν μέσα στο έργο.' : 'Οι αλλαγές θα ενημερωθούν σε όλες τις προβολές του έργου.'}
        icon={Building2}
        size="md"
        actions={
          <>
            <button type="button" className="action-btn" onClick={() => setShowModal(false)}>Ακύρωση</button>
            <button type="button" className="action-btn primary" onClick={handleSaveProject} disabled={!modalName.trim() || saving}>
              {saving ? <ButtonSpinner label="Αποθήκευση…" /> : showModal === 'add' ? 'Δημιουργία έργου' : 'Αποθήκευση αλλαγών'}
            </button>
          </>
        }
      >
        <div className="project-modal-form">
          <div className="project-modal-field"><label htmlFor="project-name">Όνομα έργου <span>*</span></label><input id="project-name" value={modalName} onChange={event => setModalName(event.target.value)} placeholder="π.χ. Κατασκευή τριών τουριστικών κατοικιών" autoFocus /></div>
          <div className="project-modal-field"><label htmlFor="project-location">Τοποθεσία</label><input id="project-location" value={modalLocation} onChange={event => setModalLocation(event.target.value)} placeholder="π.χ. Κατάκολο, Ηλεία" /></div>
          <div className="project-modal-field"><label htmlFor="project-description">Σύντομη περιγραφή</label><textarea id="project-description" value={modalDesc} onChange={event => setModalDesc(event.target.value)} placeholder="Τύπος έργου ή χρήσιμη σύντομη πληροφορία…" rows={4} /></div>
          {saveError && <InlineNotice tone="danger">{saveError}</InlineNotice>}
        </div>
      </ModalShell>
      {toast && <div className={`toast ${toast.isError ? 'toast-error' : 'toast-success'}`} role="status">{toast.message}</div>}
    </div>
  )
}
