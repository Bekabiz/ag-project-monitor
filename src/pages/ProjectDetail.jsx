import { useState, useEffect } from 'react'
import { AlertTriangle, ArrowLeft, Building2, CalendarDays, Camera, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, FileDown, FileText, FolderTree, Image, LayoutDashboard, ListTree, MapPin, Mic, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { db, dbRead, supabase } from '../lib/db'
import StepsView from './StepsView'
import { ButtonSpinner, EmptyState, InlineNotice, LoadingState, ModalShell } from '../components/ui'

const CAT_CONFIG = {
  problem: { label: 'Προβλήματα', icon: 'M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96L13.75 4a2 2 0 00-3.5 0L3.32 16.04A2 2 0 005.07 19z', color: '#dc2626', bg: '#fef2f2' },
  decision: { label: 'Αποφάσεις', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: '#0d9488', bg: '#f0fdfa' },
  material: { label: 'Υλικά', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', color: '#7c3aed', bg: '#f5f3ff' },
  work_update: { label: 'Ενημερώσεις εργασιών', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', color: '#059669', bg: '#ecfdf5' },
  client_request: { label: 'Αιτήματα πελάτη', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', color: '#d97706', bg: '#fffbeb' },
  note: { label: 'Σημειώσεις', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', color: '#6b7280', bg: '#f3f4f6' }
}

function CatIcon({ path, color, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={path}/></svg>
}

function StatusPill({ status }) {
  if (!status) return null
  const label = status === 'resolved' ? 'Επιλύθηκε' : 'Ανοιχτό'
  return <span className={`project-status-pill is-${status}`}>{label}</span>
}

function TagChip({ tag }) {
  return <span className="project-tag-chip">{tag}</span>
}

export default function ProjectDetail({ project, profile, onBack, onAddUpdate }) {
  const [tab, setTab] = useState('overview')
  const [entries, setEntries] = useState([])
  const [areas, setAreas] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [areaFilter, setAreaFilter] = useState('all')
  const [catFilter, setCatFilter] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [parsedStructure, setParsedStructure] = useState(null)

  const [toast, setToast] = useState(null)
  function showToast(msg, isError) { setToast({ msg, isError }); setTimeout(() => setToast(null), 2500) }

  useEffect(() => { loadData() }, [project.id])

  async function loadData() {
    setLoading(true)
    setLoadError(false)
    try {
      const [entriesData, areasData, deadlinesData] = await Promise.all([
        dbRead(supabase.from('entries').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(200)),
        dbRead(supabase.from('project_areas').select('*').eq('project_id', project.id).order('area_type', { ascending: true })),
        dbRead(supabase.from('deadlines').select('*').eq('project_id', project.id).order('due_date'))
      ])
      setEntries(entriesData)
      setAreas(areasData)
      setDeadlines(deadlinesData)
    } catch (err) {
      console.error('Load error:', err)
      setLoadError(true)
      showToast('Σφάλμα φόρτωσης', true)
    } finally {
      setLoading(false)
    }
  }

  // Upload Technical Description
  async function handleTechDescUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadStatus('reading')
    
    try {
      let textContent = ''
      
      if (file.name.endsWith('.txt')) {
        // Plain text: read directly
        textContent = await file.text()
      } else {
        // PDF or Word: upload to Supabase, send URL to API for processing
        const ext = file.name.split('.').pop()
        const path = `tech-descriptions/${project.id}.${ext}`
        const { error: upErr } = await supabase.storage.from('files').upload(path, file, { upsert: true })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
        
        // For PDFs: extract text on the client by reading as array buffer
        if (file.name.endsWith('.pdf')) {
          // Read the raw bytes and extract visible text using a simple pattern
          const arrayBuf = await file.arrayBuffer()
          const bytes = new Uint8Array(arrayBuf)
          let raw = ''
          for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i]
            if ((b >= 32 && b <= 126) || b === 10 || b === 13) raw += String.fromCharCode(b)
            else if (b >= 192) {
              // Try to decode UTF-8 Greek characters
              if (i + 1 < bytes.length) {
                const b2 = bytes[i + 1]
                if (b >= 0xCE && b <= 0xCF && b2 >= 0x80 && b2 <= 0xBF) {
                  try {
                    const decoder = new TextDecoder('utf-8')
                    const char = decoder.decode(new Uint8Array([b, b2]))
                    raw += char
                    i++
                  } catch { raw += ' ' }
                }
              }
            }
          }
          // Clean: remove PDF operators and keep readable text
          const lines = raw.split(/[\r\n]+/)
          const readableLines = lines.filter(line => {
            const trimmed = line.trim()
            if (trimmed.length < 3) return false
            if (/^[0-9\s.%<>\/\[\](){}]+$/.test(trimmed)) return false
            if (/^(obj|endobj|stream|endstream|xref|trailer|startxref)/.test(trimmed)) return false
            if (trimmed.includes('/Type') || trimmed.includes('/Font') || trimmed.includes('/Page')) return false
            // Keep lines with Greek or enough Latin text
            return /[α-ωΑ-Ωά-ώa-zA-Z]{3,}/.test(trimmed)
          })
          textContent = readableLines.join('\n')
        } else {
          // For docx and other formats, try reading as text
          textContent = await file.text()
        }
      }
      
      if (!textContent || textContent.trim().length < 50) {
        // Fallback: if text extraction failed, tell user
        setUploadStatus('error')
        showToast('Δεν ήταν δυνατή η ανάγνωση του εγγράφου. Αντιγράψτε το κείμενο σε αρχείο .txt και δοκιμάστε ξανά.', true)
        setTimeout(() => setUploadStatus(null), 3000)
        return
      }
      
      setUploadStatus('parsing')
      
      const res = await fetch('/api/parse-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textContent })
      })
      if (!res.ok) throw new Error('Η ανάλυση του εγγράφου απέτυχε')
      const data = await res.json()
      
      if (data.structure) {
        setUploadStatus(null)
        setParsedStructure(data.structure)
      }
    } catch (err) {
      console.error('Tech desc upload error:', err)
      setUploadStatus('error')
      setTimeout(() => setUploadStatus(null), 3000)
    }
  }

  // Save confirmed structure
  async function saveConfirmedStructure() {
    if (!parsedStructure) return
    setUploadStatus('saving')
    const structure = parsedStructure
    const areasToInsert = []

    const totalBuildings = structure.buildings?.length || 0

    structure.buildings?.forEach((building, bi) => {
      const bLabel = totalBuildings > 1 ? `B${bi+1}` : ''
      
      building.floors?.forEach(floor => {
        // Short floor label: Ground floor -> GF, First floor -> F1, etc.
        const fName = floor.name || ''
        let fLabel = fName
        if (/ground|ισόγειο|isog/i.test(fName)) fLabel = 'GF'
        else if (/first|1st|α.*όροφ/i.test(fName)) fLabel = 'F1'
        else if (/second|2nd|β.*όροφ/i.test(fName)) fLabel = 'F2'
        else if (/basement|υπόγ/i.test(fName)) fLabel = 'BS'
        else if (/roof|δώμα|στέγ/i.test(fName)) fLabel = 'RF'
        
        const prefix = [bLabel, fLabel].filter(Boolean).join(' ')
        
        floor.rooms?.forEach(room => {
          const fullName = prefix ? `${prefix} ${room.name}` : room.name
          areasToInsert.push({
            project_id: project.id,
            area_type: 'room',
            area_name: fullName,
            parent_area: `${building.name || 'Building ' + (bi+1)} - ${floor.name}`,
            sqm: room.sqm || null,
            details: { floor: floor.name, building: building.name }
          })
        })
      })
    })

    structure.systems?.forEach(sys => {
      areasToInsert.push({
        project_id: project.id,
        area_type: 'system',
        area_name: sys.name,
        details: { description: sys.description }
      })
    })

    structure.exterior?.forEach(ext => {
      areasToInsert.push({
        project_id: project.id,
        area_type: 'exterior',
        area_name: ext.name,
        details: { description: ext.details }
      })
    })

    try {
      if (areasToInsert.length > 0) {
        await db(supabase.from('project_areas').insert(areasToInsert))
      }

      const updateData = {}
      if (structure.building_type) updateData.building_type = structure.building_type
      if (structure.project_info?.location) updateData.location = structure.project_info.location
      if (Object.keys(updateData).length > 0) {
        await db(supabase.from('projects').update(updateData).eq('id', project.id))
      }

      setParsedStructure(null)
      setUploadStatus('done')
      await loadData()
      setTimeout(() => setUploadStatus(null), 2000)
    } catch (err) {
      showToast('Σφάλμα αποθήκευσης δομής: ' + err.message, true)
      setUploadStatus(null)
    }
  }

  async function toggleDeadline(d) {
    const newStatus = d.status === 'completed' ? (new Date(d.due_date) < new Date() ? 'overdue' : 'pending') : 'completed'
    try {
      await db(supabase.from('deadlines').update({ status: newStatus }).eq('id', d.id))
      setDeadlines(deadlines.map(dl => dl.id === d.id ? { ...dl, status: newStatus } : dl))
    } catch (err) {
      showToast('Σφάλμα', true)
    }
  }

  async function toggleProblemStatus(entryId, currentStatus) {
    const newStatus = currentStatus === 'open' ? 'resolved' : 'open'
    try {
      await db(supabase.from('entries').update({ entry_status: newStatus }).eq('id', entryId))
      setEntries(entries.map(e => e.id === entryId ? { ...e, entry_status: newStatus } : e))
    } catch (err) {
      showToast('Σφάλμα', true)
    }
  }

  // Filters
  const filteredEntries = entries.filter(e => {
    if (areaFilter !== 'all' && !(e.tags || []).includes(areaFilter)) return false
    if (catFilter && e.category !== catFilter) return false
    return true
  })

  const photos = entries.filter(e => e.entry_type === 'photo')
  const problems = entries.filter(e => e.category === 'problem')
  const openProblems = problems.filter(e => e.entry_status === 'open')
  const decisions = entries.filter(e => e.category === 'decision')
  const overdueDeadlines = deadlines.filter(d => d.status === 'overdue')

  // Unique tags for area filter
  const allTags = [...new Set(entries.flatMap(e => e.tags || []))]
  const areaNames = areas.map(a => a.area_name)
  const filterTags = [...new Set([...areaNames, ...allTags])].slice(0, 15)

  // Category counts
  const catCounts = {}
  Object.keys(CAT_CONFIG).forEach(cat => {
    catCounts[cat] = entries.filter(e => e.category === cat).length
  })

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })
  }

  if (loading) return <LoadingState label="Φόρτωση χώρου έργου…" cards={5} />

  if (loadError) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="Δεν φορτώθηκε το έργο"
        description="Οι πληροφορίες του έργου δεν είναι διαθέσιμες αυτή τη στιγμή. Δοκιμάστε ξανά."
        actionLabel="Δοκιμή ξανά"
        onAction={loadData}
      />
    )
  }

  const lastEntry = entries[0]
  const projectHealth = openProblems.length > 0 || overdueDeadlines.length > 0 ? 'attention' : entries.length === 0 ? 'empty' : 'healthy'
  const tabItems = [
    { id: 'overview', label: 'Επισκόπηση', icon: LayoutDashboard },
    { id: 'memory', label: 'Μνήμη έργου', icon: ListTree, badge: entries.length },
    { id: 'tasks', label: 'Εργασίες', icon: ClipboardCheck },
    { id: 'photos', label: 'Φωτογραφίες', icon: Camera, badge: photos.length },
    { id: 'timeline', label: 'Χρονολόγιο', icon: Clock3 },
    { id: 'report', label: 'Αναφορά', icon: FileText },
  ]

  const uploadMessages = {
    reading: { tone: 'info', text: 'Ανάγνωση του εγγράφου…' },
    parsing: { tone: 'info', text: 'Ανάλυση της δομής του έργου…' },
    saving: { tone: 'info', text: 'Αποθήκευση χώρων και συστημάτων…' },
    done: { tone: 'success', text: 'Η δομή του έργου είναι έτοιμη.' },
    error: { tone: 'danger', text: 'Δεν ήταν δυνατή η επεξεργασία του εγγράφου.' },
  }

  function entryTitle(entry) {
    return entry.title || entry.ai_summary || entry.raw_text?.slice(0, 100) || 'Καταχώρηση έργου'
  }

  function renderEntry(entry, { detailed = false } = {}) {
    const category = CAT_CONFIG[entry.category] || CAT_CONFIG.note
    return (
      <article key={entry.id} className={`project-entry-card category-${entry.category || 'note'}`}>
        <div className="project-entry-heading">
          <span className="project-entry-category" style={{ '--category-color': category.color, '--category-bg': category.bg }} aria-hidden="true">
            <CatIcon path={category.icon} color={category.color} size={15} />
          </span>
          <div><h4>{entryTitle(entry)}</h4><p>{category.label}</p></div>
          {entry.entry_status && (
            entry.category === 'problem'
              ? <button type="button" className="project-status-button" onClick={() => toggleProblemStatus(entry.id, entry.entry_status)} aria-label="Αλλαγή κατάστασης προβλήματος"><StatusPill status={entry.entry_status} /></button>
              : <StatusPill status={entry.entry_status} />
          )}
        </div>
        {detailed && entry.raw_text && entry.raw_text !== entry.title && <p className="project-entry-body">{entry.raw_text}</p>}
        <div className="project-entry-meta"><span>{entry.submitter_name || 'Άγνωστο μέλος'}</span><span>{formatDate(entry.created_at)}</span></div>
        {(entry.tags || []).length > 0 && <div className="project-tag-list">{entry.tags.map(tag => <TagChip key={tag} tag={tag} />)}</div>}
        {entry.file_url && <a href={entry.file_url} target="_blank" rel="noopener noreferrer" className="project-entry-file"><FileDown size={14} strokeWidth={1.8} aria-hidden="true" />{entry.file_name || 'Άνοιγμα αρχείου'}</a>}
      </article>
    )
  }

  return (
    <div className="project-workspace-page">
      <section className="project-hero-card">
        <div className="project-hero-top">
          <button type="button" className="project-back-button" onClick={onBack}><ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" /><span>Όλα τα έργα</span></button>
          <div className={`project-health-badge is-${projectHealth}`}>
            <span aria-hidden="true" />
            {projectHealth === 'attention' ? 'Χρειάζεται προσοχή' : projectHealth === 'empty' ? 'Χωρίς ενημερώσεις' : 'Σε καλή πορεία'}
          </div>
        </div>
        <div className="project-hero-main">
          <div className="project-hero-icon" aria-hidden="true"><Building2 size={25} strokeWidth={1.6} /></div>
          <div className="project-hero-copy">
            <span>Ενεργό έργο</span>
            <h2>{project.name}</h2>
            <p><MapPin size={14} strokeWidth={1.7} aria-hidden="true" />{project.location || 'Δεν έχει οριστεί τοποθεσία'}{project.building_type ? ` · ${project.building_type.replaceAll('_', ' ')}` : ''}</p>
          </div>
          <div className="project-hero-actions">
            {profile?.role === 'owner' && areas.length === 0 && (
              <label className="project-structure-button">
                <FolderTree size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>Εισαγωγή δομής</span>
                <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleTechDescUpload} hidden />
              </label>
            )}
            {onAddUpdate && <button type="button" className="project-add-update-button" onClick={onAddUpdate}><Mic size={16} strokeWidth={1.8} aria-hidden="true" />Νέα ενημέρωση</button>}
          </div>
        </div>
        <div className="project-hero-meta">
          <span><Clock3 size={14} strokeWidth={1.7} aria-hidden="true" />Τελευταία ενημέρωση: {lastEntry ? formatDate(lastEntry.created_at) : 'Δεν υπάρχει'}</span>
          <span><ListTree size={14} strokeWidth={1.7} aria-hidden="true" />{entries.length} καταχωρήσεις</span>
          <span><Camera size={14} strokeWidth={1.7} aria-hidden="true" />{photos.length} φωτογραφίες</span>
        </div>
      </section>

      {uploadStatus && uploadMessages[uploadStatus] && <InlineNotice tone={uploadMessages[uploadStatus].tone}>{uploadMessages[uploadStatus].text}</InlineNotice>}

      <nav className="project-tab-navigation" aria-label="Ενότητες έργου">
        {tabItems.map(item => {
          const Icon = item.icon
          return (
            <button type="button" key={item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => { setTab(item.id); setCatFilter(null) }} aria-current={tab === item.id ? 'page' : undefined}>
              <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
              <span>{item.label}</span>
              {item.badge > 0 && <em>{item.badge}</em>}
            </button>
          )
        })}
      </nav>

      {tab === 'overview' && (
        <div className="project-overview-layout">
          <section className="project-overview-main">
            <div className="project-stat-grid">
              <button type="button" className="project-stat-card is-danger" onClick={() => { setTab('memory'); setCatFilter('problem') }}><span aria-hidden="true"><AlertTriangle size={18} strokeWidth={1.8} /></span><strong>{openProblems.length}</strong><small>Ανοιχτά προβλήματα</small></button>
              <button type="button" className="project-stat-card is-primary" onClick={() => setTab('tasks')}><span aria-hidden="true"><ClipboardCheck size={18} strokeWidth={1.8} /></span><strong>{catCounts.work_update || 0}</strong><small>Ενημερώσεις εργασιών</small></button>
              <button type="button" className="project-stat-card is-purple" onClick={() => { setTab('memory'); setCatFilter('decision') }}><span aria-hidden="true"><CheckCircle2 size={18} strokeWidth={1.8} /></span><strong>{decisions.length}</strong><small>Αποφάσεις</small></button>
              <button type="button" className="project-stat-card is-warning" onClick={() => setTab('report')}><span aria-hidden="true"><CalendarDays size={18} strokeWidth={1.8} /></span><strong>{overdueDeadlines.length}</strong><small>Εκπρόθεσμες προθεσμίες</small></button>
            </div>

            {openProblems.length > 0 && (
              <section className="project-content-panel">
                <div className="project-panel-heading"><div><span className="is-danger" aria-hidden="true"><AlertTriangle size={18} strokeWidth={1.8} /></span><div><h3>Ανοιχτά προβλήματα</h3><p>Θέματα που χρειάζονται απόφαση ή ενέργεια.</p></div></div><button type="button" onClick={() => { setTab('memory'); setCatFilter('problem') }}>Προβολή όλων <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" /></button></div>
                <div className="project-entry-list">{openProblems.slice(0, 5).map(entry => renderEntry(entry))}</div>
              </section>
            )}

            <section className="project-content-panel">
              <div className="project-panel-heading"><div><span className="is-primary" aria-hidden="true"><Clock3 size={18} strokeWidth={1.8} /></span><div><h3>Πρόσφατη δραστηριότητα</h3><p>Οι πιο πρόσφατες πληροφορίες που καταχωρήθηκαν.</p></div></div>{entries.length > 8 && <button type="button" onClick={() => setTab('timeline')}>Πλήρες χρονολόγιο <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" /></button>}</div>
              {entries.length === 0 ? <EmptyState icon={Sparkles} title="Δεν υπάρχουν ενημερώσεις ακόμη" description="Η πρώτη καταχώρηση θα δημιουργήσει τη μνήμη και το χρονολόγιο του έργου." actionLabel={onAddUpdate ? 'Προσθήκη πρώτης ενημέρωσης' : undefined} onAction={onAddUpdate} compact /> : <div className="project-entry-list">{entries.slice(0, 8).map(entry => renderEntry(entry))}</div>}
            </section>
          </section>

          <aside className="project-overview-side">
            <section className="project-content-panel">
              <div className="project-panel-heading"><div><span className="is-warning" aria-hidden="true"><CalendarDays size={18} strokeWidth={1.8} /></span><div><h3>Προθεσμίες</h3><p>Επόμενες και εκπρόθεσμες δεσμεύσεις.</p></div></div><span className="project-panel-count">{deadlines.length}</span></div>
              {deadlines.length === 0 ? <EmptyState icon={CalendarDays} title="Δεν υπάρχουν προθεσμίες" description="Οι προθεσμίες του έργου θα εμφανιστούν εδώ." compact /> : <div className="project-deadline-list">{deadlines.slice(0, 6).map(deadline => <article key={deadline.id} className={deadline.status === 'overdue' ? 'is-overdue' : deadline.status === 'completed' ? 'is-completed' : ''}><button type="button" onClick={() => toggleDeadline(deadline)} aria-label="Αλλαγή κατάστασης προθεσμίας"><CheckCircle2 size={16} strokeWidth={1.8} aria-hidden="true" /></button><div><strong>{deadline.description}</strong><small>{formatDate(deadline.due_date)}</small></div></article>)}</div>}
            </section>

            <section className="project-content-panel">
              <div className="project-panel-heading"><div><span className="is-purple" aria-hidden="true"><FolderTree size={18} strokeWidth={1.8} /></span><div><h3>Δομή έργου</h3><p>Χώροι, συστήματα και εξωτερικές περιοχές.</p></div></div><span className="project-panel-count">{areas.length}</span></div>
              {areas.length === 0 ? <EmptyState icon={FolderTree} title="Δεν έχει εισαχθεί δομή" description={profile?.role === 'owner' ? 'Χρησιμοποιήστε την τεχνική περιγραφή για να δημιουργηθούν χώροι και συστήματα.' : 'Ο διαχειριστής δεν έχει εισαγάγει ακόμη τη δομή του έργου.'} compact /> : <div className="project-area-preview">{areas.slice(0, 10).map(area => <span key={area.id}>{area.area_name}</span>)}</div>}
            </section>
          </aside>
        </div>
      )}

      {tab === 'memory' && (
        <section className="project-memory-layout">
          <header className="project-memory-header">
            <div><h2>Μνήμη έργου</h2><p>Όλες οι αποφάσεις, τα προβλήματα, τα υλικά και οι ενημερώσεις οργανωμένα ανά κατηγορία και χώρο.</p></div>
            {onAddUpdate && <button type="button" onClick={onAddUpdate}><Plus size={16} strokeWidth={2} aria-hidden="true" />Νέα καταχώρηση</button>}
          </header>

          {entries.length === 0 ? <EmptyState icon={ListTree} title="Η μνήμη του έργου είναι κενή" description="Προσθέστε την πρώτη ενημέρωση για να ξεκινήσει η οργάνωση της γνώσης του έργου." actionLabel={onAddUpdate ? 'Προσθήκη ενημέρωσης' : undefined} onAction={onAddUpdate} /> : (
            <>
              {filterTags.length > 0 && <div className="project-filter-chips"><button type="button" className={areaFilter === 'all' ? 'is-active' : ''} onClick={() => setAreaFilter('all')}>Όλοι οι χώροι</button>{filterTags.map(tag => <button type="button" key={tag} className={areaFilter === tag ? 'is-active' : ''} onClick={() => setAreaFilter(tag)}>{tag}</button>)}</div>}

              {!catFilter ? (
                <div className="project-category-grid">
                  {Object.entries(CAT_CONFIG).map(([key, config]) => {
                    const count = areaFilter === 'all' ? catCounts[key] : entries.filter(entry => entry.category === key && (entry.tags || []).includes(areaFilter)).length
                    const openCount = key === 'problem' ? entries.filter(entry => entry.category === 'problem' && entry.entry_status === 'open' && (areaFilter === 'all' || (entry.tags || []).includes(areaFilter))).length : 0
                    if (count === 0) return null
                    return <button type="button" key={key} className="project-category-card" onClick={() => setCatFilter(key)}><span style={{ '--category-bg': config.bg }} aria-hidden="true"><CatIcon path={config.icon} color={config.color} size={19} /></span><div><strong>{config.label}</strong><small>{openCount > 0 ? `${openCount} ανοιχτά` : `${count} καταχωρήσεις`}</small></div><em>{count}</em><ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" /></button>
                  })}
                  {photos.length > 0 && <button type="button" className="project-category-card" onClick={() => setTab('photos')}><span className="is-photo" aria-hidden="true"><Camera size={19} strokeWidth={1.8} /></span><div><strong>Φωτογραφίες</strong><small>{photos.length} αρχεία εικόνας</small></div><em>{photos.length}</em><ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" /></button>}
                </div>
              ) : (
                <div className="project-category-detail">
                  <button type="button" className="project-category-back" onClick={() => setCatFilter(null)}><ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />Πίσω στις κατηγορίες</button>
                  <div className="project-category-detail-heading"><span style={{ '--category-bg': CAT_CONFIG[catFilter].bg }} aria-hidden="true"><CatIcon path={CAT_CONFIG[catFilter].icon} color={CAT_CONFIG[catFilter].color} size={19} /></span><div><h3>{CAT_CONFIG[catFilter].label}</h3><p>{filteredEntries.filter(entry => entry.category === catFilter).length} καταχωρήσεις</p></div></div>
                  <div className="project-entry-grid">{filteredEntries.filter(entry => entry.category === catFilter).map(entry => renderEntry(entry, { detailed: true }))}</div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'tasks' && <StepsView project={project} profile={profile} />}

      {tab === 'photos' && (
        <section className="project-gallery-panel">
          <header className="project-memory-header"><div><h2>Φωτογραφίες έργου</h2><p>Οπτικό ιστορικό από εργοτάξιο, έγγραφα και επιμέρους χώρους.</p></div>{onAddUpdate && <button type="button" onClick={onAddUpdate}><Plus size={16} strokeWidth={2} aria-hidden="true" />Προσθήκη φωτογραφίας</button>}</header>
          {photos.length === 0 ? <EmptyState icon={Image} title="Δεν υπάρχουν φωτογραφίες" description="Οι φωτογραφίες του έργου θα εμφανιστούν εδώ μαζί με ημερομηνία και ετικέτες." actionLabel={onAddUpdate ? 'Προσθήκη φωτογραφίας' : undefined} onAction={onAddUpdate} /> : <div className="project-photo-grid">{photos.map(photo => <button type="button" key={photo.id} className="project-photo-card" onClick={() => setLightboxUrl(photo.file_url)}><img src={photo.file_url} alt={photo.ai_summary || `Φωτογραφία έργου ${project.name}`} loading="lazy" /><span><strong>{photo.ai_summary?.slice(0, 70) || 'Φωτογραφία έργου'}</strong><small>{formatDate(photo.created_at)}</small></span>{(photo.tags || []).length > 0 && <em>{photo.tags.slice(0, 2).join(' · ')}</em>}</button>)}</div>}
        </section>
      )}

      {tab === 'timeline' && (
        <section className="project-timeline-panel">
          <header className="project-memory-header"><div><h2>Χρονολόγιο έργου</h2><p>Η πλήρης σειρά των καταχωρήσεων από την πιο πρόσφατη προς την παλαιότερη.</p></div>{onAddUpdate && <button type="button" onClick={onAddUpdate}><Plus size={16} strokeWidth={2} aria-hidden="true" />Νέα ενημέρωση</button>}</header>
          {entries.length === 0 ? <EmptyState icon={Clock3} title="Το χρονολόγιο είναι κενό" description="Η πρώτη ενημέρωση θα δημιουργήσει το ιστορικό του έργου." actionLabel={onAddUpdate ? 'Προσθήκη ενημέρωσης' : undefined} onAction={onAddUpdate} /> : <div className="project-timeline-list">{entries.map(entry => { const category = CAT_CONFIG[entry.category] || CAT_CONFIG.note; return <article key={entry.id}><span className="project-timeline-marker" style={{ '--marker-color': category.color }} aria-hidden="true" /><div><time>{formatDate(entry.created_at)} · {entry.submitter_name || 'Άγνωστο μέλος'}</time><h3>{entryTitle(entry)}</h3><p>{category.label}</p>{(entry.tags || []).length > 0 && <div className="project-tag-list">{entry.tags.slice(0, 4).map(tag => <TagChip key={tag} tag={tag} />)}</div>}</div></article>})}</div>}
        </section>
      )}

      {tab === 'report' && (
        <section className="project-report-workspace">
          <header className="project-memory-header"><div><h2>Αναφορά έργου</h2><p>Συνοπτική εικόνα κατάστασης για εκτύπωση ή παρουσίαση.</p></div><button type="button" onClick={() => window.print()}><FileDown size={16} strokeWidth={1.8} aria-hidden="true" />Εκτύπωση / PDF</button></header>
          <article className="project-report-sheet">
            <header><div><span>AG Project Monitor</span><h2>{project.name}</h2><p>{project.location || 'Χωρίς τοποθεσία'}</p></div><time>Δημιουργήθηκε {new Date().toLocaleDateString('el-GR')}</time></header>
            <section><h3>Σύνοψη</h3><div className="project-report-metrics"><div><strong>{entries.length}</strong><span>Σύνολο καταχωρήσεων</span></div><div><strong>{openProblems.length}/{problems.length}</strong><span>Ανοιχτά / συνολικά προβλήματα</span></div><div><strong>{decisions.length}</strong><span>Αποφάσεις</span></div><div><strong>{photos.length}</strong><span>Φωτογραφίες</span></div><div><strong>{overdueDeadlines.length}/{deadlines.length}</strong><span>Εκπρόθεσμες / προθεσμίες</span></div></div></section>
            {openProblems.length > 0 && <section><h3>Ανοιχτά προβλήματα</h3><div className="project-report-list">{openProblems.map(problem => <div key={problem.id}><span>{entryTitle(problem)}</span><time>{formatDate(problem.created_at)}</time></div>)}</div></section>}
            {decisions.length > 0 && <section><h3>Ληφθείσες αποφάσεις</h3><div className="project-report-list">{decisions.map(decision => <div key={decision.id}><span>{entryTitle(decision)}</span><time>{formatDate(decision.created_at)}</time></div>)}</div></section>}
            {overdueDeadlines.length > 0 && <section><h3>Εκπρόθεσμες προθεσμίες</h3><div className="project-report-list is-danger">{overdueDeadlines.map(deadline => <div key={deadline.id}><span>{deadline.description}</span><time>{formatDate(deadline.due_date)}</time></div>)}</div></section>}
          </article>
        </section>
      )}

      <ModalShell
        open={Boolean(parsedStructure)}
        onClose={() => setParsedStructure(null)}
        title="Επιβεβαίωση δομής έργου"
        description="Ελέγξτε τους χώρους και τα συστήματα που αναγνώρισε η εφαρμογή πριν αποθηκευτούν."
        icon={FolderTree}
        size="lg"
        actions={<><button type="button" className="action-btn" onClick={() => setParsedStructure(null)}>Ακύρωση</button><button type="button" className="action-btn primary" onClick={saveConfirmedStructure} disabled={uploadStatus === 'saving'}>{uploadStatus === 'saving' ? <ButtonSpinner label="Αποθήκευση…" /> : 'Επιβεβαίωση και αποθήκευση'}</button></>}
      >
        {parsedStructure && <div className="project-structure-review">
          {parsedStructure.building_type && <div className="project-structure-type"><span>Τύπος κτιρίου</span><strong>{parsedStructure.building_type.replaceAll('_', ' ')}</strong>{parsedStructure.building_type_confidence && <em>{parsedStructure.building_type_confidence}% βεβαιότητα</em>}</div>}
          <div className="project-structure-sections">
            {parsedStructure.buildings?.map((building, buildingIndex) => <section key={buildingIndex}><h3>{building.name || `Κτίριο ${buildingIndex + 1}`}{building.sqm ? ` · ${building.sqm} m²` : ''}</h3>{building.floors?.map((floor, floorIndex) => <div key={floorIndex}><strong>{floor.name}</strong><div>{floor.rooms?.map((room, roomIndex) => <span key={roomIndex}>{room.name}{room.sqm ? ` · ${room.sqm} m²` : ''}</span>)}</div></div>)}</section>)}
          </div>
          {parsedStructure.systems?.length > 0 && <div className="project-structure-tags"><h3>Συστήματα</h3><div>{parsedStructure.systems.map((system, index) => <span key={index}>{system.name}</span>)}</div></div>}
          {parsedStructure.exterior?.length > 0 && <div className="project-structure-tags"><h3>Εξωτερικοί χώροι</h3><div>{parsedStructure.exterior.map((area, index) => <span key={index}>{area.name}</span>)}</div></div>}
        </div>}
      </ModalShell>

      <ModalShell open={Boolean(lightboxUrl)} onClose={() => setLightboxUrl(null)} title="Προβολή φωτογραφίας" icon={Image} size="xl" className="project-lightbox-modal">
        {lightboxUrl && <img src={lightboxUrl} alt={`Μεγέθυνση φωτογραφίας έργου ${project.name}`} className="project-lightbox-image" />}
      </ModalShell>

      {toast && <div className={`toast ${toast.isError ? 'toast-error' : 'toast-success'}`} role="status">{toast.msg}</div>}
    </div>
  )
}
