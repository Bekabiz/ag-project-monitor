import { useState, useEffect, useRef } from 'react'
import { db, dbRead, supabase } from '../lib/db'
import StepsView from './StepsView'

const CAT_CONFIG = {
  problem: { label: 'Problems', icon: 'M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96L13.75 4a2 2 0 00-3.5 0L3.32 16.04A2 2 0 005.07 19z', color: '#dc2626', bg: '#fef2f2' },
  decision: { label: 'Decisions', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: '#0d9488', bg: '#f0fdfa' },
  material: { label: 'Materials', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', color: '#7c3aed', bg: '#f5f3ff' },
  work_update: { label: 'Work updates', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', color: '#059669', bg: '#ecfdf5' },
  client_request: { label: 'Client requests', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', color: '#d97706', bg: '#fffbeb' },
  note: { label: 'Notes', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', color: '#6b7280', bg: '#f3f4f6' }
}

function CatIcon({ path, color, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={path}/></svg>
}

function StatusPill({ status }) {
  if (!status) return null
  const colors = { open: { bg: '#fef2f2', color: '#dc2626', label: 'Open' }, resolved: { bg: '#ecfdf5', color: '#059669', label: 'Resolved' } }
  const c = colors[status] || colors.open
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 100, background: c.bg, color: c.color }}>{c.label}</span>
}

function TagChip({ tag }) {
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280', fontWeight: 500 }}>{tag}</span>
}

export default function ProjectDetail({ project, profile, onBack }) {
  const [tab, setTab] = useState('overview')
  const [entries, setEntries] = useState([])
  const [areas, setAreas] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)
  const [areaFilter, setAreaFilter] = useState('all')
  const [catFilter, setCatFilter] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [parsedStructure, setParsedStructure] = useState(null)

  const [toast, setToast] = useState(null)
  function showToast(msg, isError) { setToast({ msg, isError }); setTimeout(() => setToast(null), 2500) }

  useEffect(() => { loadData() }, [project.id])

  async function loadData() {
    setLoading(true)
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
        alert('Could not read the document. Please copy the text from the PDF and save it as a .txt file, then upload that.')
        setTimeout(() => setUploadStatus(null), 3000)
        return
      }
      
      setUploadStatus('parsing')
      
      const res = await fetch('/api/parse-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textContent })
      })
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

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="app" style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <div className="detail-name">{project.name}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{project.location}</div>
        </div>
        {profile?.role === 'owner' && areas.length === 0 && (
          <label className="setup-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 5v14m-7-7h14"/></svg>
            Setup
            <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleTechDescUpload} hidden />
          </label>
        )}
      </div>

      {/* Upload status */}
      {uploadStatus && (
        <div className="upload-status-bar">
          {uploadStatus === 'reading' && 'Reading document...'}
          {uploadStatus === 'parsing' && 'AI extracting structure...'}
          {uploadStatus === 'saving' && 'Saving project areas...'}
          {uploadStatus === 'done' && 'Project structure ready!'}
          {uploadStatus === 'error' && 'Error parsing document'}
        </div>
      )}

      {/* Confirmation card after parsing */}
      {parsedStructure && (
        <div className="pd-confirm-overlay">
          <div className="pd-confirm-card">
            <div className="pd-confirm-title">AI found this structure</div>
            
            {parsedStructure.building_type && (
              <div className="pd-confirm-type">
                <span className="pd-confirm-label">Building type</span>
                <span className="pd-confirm-value">{parsedStructure.building_type.replace('_', ' ')}</span>
                {parsedStructure.building_type_confidence && (
                  <span className="pd-confirm-confidence">{parsedStructure.building_type_confidence}% confidence</span>
                )}
              </div>
            )}

            <div className="pd-confirm-label">Areas</div>
            {parsedStructure.buildings?.map((b, bi) => (
              <div key={bi} className="pd-confirm-building">
                <div className="pd-confirm-building-name">{b.name || `Building ${bi+1}`} {b.sqm ? `(${b.sqm} sqm)` : ''}</div>
                {b.floors?.map((f, fi) => (
                  <div key={fi} className="pd-confirm-floor">
                    <div className="pd-confirm-floor-name">{f.name}</div>
                    <div className="pd-confirm-rooms">
                      {f.rooms?.map((r, ri) => (
                        <span key={ri} className="pd-confirm-room-chip">{r.name} {r.sqm ? `${r.sqm}m2` : ''}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {parsedStructure.systems?.length > 0 && (
              <>
                <div className="pd-confirm-label" style={{ marginTop: 12 }}>Systems</div>
                <div className="pd-confirm-rooms">
                  {parsedStructure.systems.map((s, i) => (
                    <span key={i} className="pd-confirm-room-chip pd-confirm-system">{s.name}</span>
                  ))}
                </div>
              </>
            )}

            {parsedStructure.exterior?.length > 0 && (
              <>
                <div className="pd-confirm-label" style={{ marginTop: 12 }}>Exterior</div>
                <div className="pd-confirm-rooms">
                  {parsedStructure.exterior.map((e, i) => (
                    <span key={i} className="pd-confirm-room-chip pd-confirm-exterior">{e.name}</span>
                  ))}
                </div>
              </>
            )}

            <div className="pd-confirm-actions">
              <button className="pd-confirm-btn-cancel" onClick={() => setParsedStructure(null)}>Cancel</button>
              <button className="pd-confirm-btn-save" onClick={saveConfirmedStructure}>Confirm and save</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="detail-tabs">
        {['overview','memory','tasks','photos','timeline','report'].map(t => (
          <button key={t} className={`detail-tab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); setCatFilter(null) }}>
            {t === 'overview' && 'Overview'}
            {t === 'memory' && 'Memory'}
            {t === 'tasks' && 'Tasks'}
            {t === 'photos' && `Photos (${photos.length})`}
            {t === 'timeline' && 'Timeline'}
            {t === 'report' && 'Report'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* ========== OVERVIEW ========== */}
        {tab === 'overview' && (
          <div style={{ padding: '12px 16px' }}>
            {/* Stats */}
            <div className="pd-stats">
              <div className="pd-stat" onClick={() => { setTab('memory'); setCatFilter('problem') }}>
                <div className="pd-stat-n" style={{ color: '#dc2626' }}>{openProblems.length}</div>
                <div className="pd-stat-l">Open problems</div>
              </div>
              <div className="pd-stat" onClick={() => setTab('tasks')}>
                <div className="pd-stat-n" style={{ color: '#2563eb' }}>{entries.filter(e => e.category === 'work_update').length}</div>
                <div className="pd-stat-l">Work updates</div>
              </div>
              <div className="pd-stat" onClick={() => { setTab('memory'); setCatFilter('decision') }}>
                <div className="pd-stat-n" style={{ color: '#7c3aed' }}>{decisions.length}</div>
                <div className="pd-stat-l">Decisions</div>
              </div>
              <div className="pd-stat">
                <div className="pd-stat-n" style={{ color: '#d97706' }}>{overdueDeadlines.length}</div>
                <div className="pd-stat-l">Overdue</div>
              </div>
            </div>

            {/* Open problems */}
            {openProblems.length > 0 && (
              <div className="pd-section">
                <div className="pd-section-title">
                  <CatIcon path={CAT_CONFIG.problem.icon} color="#dc2626" />
                  Open problems
                </div>
                {openProblems.slice(0, 5).map(p => (
                  <div key={p.id} className="pd-entry-card pd-entry-problem">
                    <div className="pd-entry-top">
                      <span className="pd-entry-title">{p.title || p.ai_summary || p.raw_text?.slice(0, 60)}</span>
                      <StatusPill status={p.entry_status} />
                    </div>
                    <div className="pd-entry-meta">
                      <span>{p.submitter_name}</span>
                      <span className="pd-dot">.</span>
                      <span>{formatDate(p.created_at)}</span>
                    </div>
                    {(p.tags || []).length > 0 && (
                      <div className="pd-tags">{p.tags.map(t => <TagChip key={t} tag={t} />)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Recent activity */}
            <div className="pd-section">
              <div className="pd-section-title">Recent activity</div>
              {entries.slice(0, 8).map(e => {
                const cat = CAT_CONFIG[e.category] || CAT_CONFIG.note
                return (
                  <div key={e.id} className="pd-entry-card" style={{ borderLeftColor: cat.color }}>
                    <div className="pd-entry-top">
                      <CatIcon path={cat.icon} color={cat.color} size={14} />
                      <span className="pd-entry-title">{e.title || e.ai_summary || e.raw_text?.slice(0, 60)}</span>
                    </div>
                    <div className="pd-entry-meta">
                      <span>{e.submitter_name}</span>
                      <span className="pd-dot">.</span>
                      <span>{formatDate(e.created_at)}</span>
                      <span className="pd-dot">.</span>
                      <span style={{ color: cat.color }}>{cat.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ========== MEMORY ========== */}
        {tab === 'memory' && (
          <div style={{ padding: '12px 16px' }}>
            {/* Area filter chips */}
            {filterTags.length > 0 && (
              <div className="pd-area-chips">
                <button className={`pd-area-chip ${areaFilter === 'all' ? 'active' : ''}`} onClick={() => setAreaFilter('all')}>All</button>
                {filterTags.map(tag => (
                  <button key={tag} className={`pd-area-chip ${areaFilter === tag ? 'active' : ''}`} onClick={() => setAreaFilter(tag)}>{tag}</button>
                ))}
              </div>
            )}

            {/* Category rows */}
            {!catFilter && Object.entries(CAT_CONFIG).map(([key, config]) => {
              const count = areaFilter === 'all' ? catCounts[key] : entries.filter(e => e.category === key && (e.tags || []).includes(areaFilter)).length
              const openCount = key === 'problem' ? entries.filter(e => e.category === 'problem' && e.entry_status === 'open' && (areaFilter === 'all' || (e.tags || []).includes(areaFilter))).length : 0
              if (count === 0) return null
              return (
                <div key={key} className="pd-cat-row" onClick={() => setCatFilter(key)}>
                  <div className="pd-cat-icon" style={{ background: config.bg }}>
                    <CatIcon path={config.icon} color={config.color} size={16} />
                  </div>
                  <span className="pd-cat-name">{config.label}</span>
                  {openCount > 0 && <span className="pd-cat-badge" style={{ background: '#fef2f2', color: '#dc2626' }}>{openCount} open</span>}
                  <span className="pd-cat-count">{count}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              )
            })}

            {/* Category detail view */}
            {catFilter && (
              <div>
                <button className="pd-cat-back" onClick={() => setCatFilter(null)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  Back to categories
                </button>
                <div className="pd-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CatIcon path={CAT_CONFIG[catFilter].icon} color={CAT_CONFIG[catFilter].color} />
                  {CAT_CONFIG[catFilter].label}
                  <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 400 }}>({filteredEntries.filter(e => e.category === catFilter).length})</span>
                </div>
                {filteredEntries.filter(e => e.category === catFilter).map(e => (
                  <div key={e.id} className="pd-entry-card" style={{ borderLeftColor: CAT_CONFIG[catFilter].color }}>
                    <div className="pd-entry-top">
                      <span className="pd-entry-title">{e.title || e.ai_summary || e.raw_text?.slice(0, 80)}</span>
                      {e.entry_status && (
                        <button className="pd-status-toggle" onClick={() => toggleProblemStatus(e.id, e.entry_status)}>
                          <StatusPill status={e.entry_status} />
                        </button>
                      )}
                    </div>
                    {e.raw_text && e.raw_text !== e.title && (
                      <div className="pd-entry-body">{e.raw_text.slice(0, 200)}</div>
                    )}
                    <div className="pd-entry-meta">
                      <span>{e.submitter_name}</span>
                      <span className="pd-dot">.</span>
                      <span>{formatDate(e.created_at)}</span>
                    </div>
                    {(e.tags || []).length > 0 && (
                      <div className="pd-tags">{e.tags.map(t => <TagChip key={t} tag={t} />)}</div>
                    )}
                    {e.file_url && (
                      <a href={e.file_url} target="_blank" rel="noopener" className="pd-file-link">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                        {e.file_name || 'File'}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Photos category */}
            {!catFilter && photos.length > 0 && (
              <div className="pd-cat-row" onClick={() => setTab('photos')}>
                <div className="pd-cat-icon" style={{ background: '#ecfdf5' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                </div>
                <span className="pd-cat-name">Photos</span>
                <span className="pd-cat-count">{photos.length}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            )}
          </div>
        )}

        {/* ========== TASKS ========== */}
        {tab === 'tasks' && (
          <div style={{ padding: '12px 16px' }}>
            <StepsView project={project} profile={profile} />
          </div>
        )}

        {/* ========== PHOTOS ========== */}
        {tab === 'photos' && (
          <div style={{ padding: '12px 16px' }}>
            {photos.length === 0 && <div className="pd-empty">No photos yet</div>}
            <div className="pd-photo-grid">
              {photos.map(p => (
                <div key={p.id} className="pd-photo-card" onClick={() => setLightboxUrl(p.file_url)}>
                  <img src={p.file_url} alt="" className="pd-photo-img" loading="lazy" />
                  <div className="pd-photo-meta">
                    <span>{p.ai_summary?.slice(0, 40) || 'Photo'}</span>
                    <span style={{ color: '#9ca3af' }}>{formatDate(p.created_at)}</span>
                  </div>
                  {(p.tags || []).length > 0 && (
                    <div className="pd-tags" style={{ padding: '0 8px 8px' }}>{p.tags.slice(0, 3).map(t => <TagChip key={t} tag={t} />)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== TIMELINE ========== */}
        {tab === 'timeline' && (
          <div style={{ padding: '12px 16px' }}>
            {entries.map(e => {
              const cat = CAT_CONFIG[e.category] || CAT_CONFIG.note
              return (
                <div key={e.id} className="pd-timeline-item">
                  <div className="pd-timeline-dot" style={{ background: cat.color }} />
                  <div className="pd-timeline-content">
                    <div className="pd-timeline-time">{formatDate(e.created_at)} . {e.submitter_name}</div>
                    <div className="pd-timeline-text">{e.title || e.ai_summary || e.raw_text?.slice(0, 100)}</div>
                    {(e.tags || []).length > 0 && (
                      <div className="pd-tags">{e.tags.slice(0, 3).map(t => <TagChip key={t} tag={t} />)}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ========== REPORT ========== */}
        {tab === 'report' && (
          <div style={{ padding: '12px 16px' }}>
            <div className="pd-report">
              <div className="pd-report-header">
                <div className="pd-report-title">{project.name}</div>
                <div className="pd-report-sub">{project.location}</div>
                <div className="pd-report-date">Report generated: {new Date().toLocaleDateString('el-GR')}</div>
              </div>

              <div className="pd-report-section">
                <div className="pd-report-label">Summary</div>
                <div className="pd-report-row"><span>Total entries</span><span>{entries.length}</span></div>
                <div className="pd-report-row"><span>Work updates</span><span>{catCounts.work_update || 0}</span></div>
                <div className="pd-report-row"><span>Problems (open / total)</span><span>{openProblems.length} / {problems.length}</span></div>
                <div className="pd-report-row"><span>Decisions</span><span>{decisions.length}</span></div>
                <div className="pd-report-row"><span>Materials</span><span>{catCounts.material || 0}</span></div>
                <div className="pd-report-row"><span>Photos</span><span>{photos.length}</span></div>
                <div className="pd-report-row"><span>Deadlines (overdue)</span><span>{overdueDeadlines.length} / {deadlines.length}</span></div>
              </div>

              {openProblems.length > 0 && (
                <div className="pd-report-section">
                  <div className="pd-report-label">Open problems</div>
                  {openProblems.map(p => (
                    <div key={p.id} className="pd-report-item">
                      <span>{p.title || p.raw_text?.slice(0, 60)}</span>
                      <span style={{ color: '#9ca3af' }}>{formatDate(p.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}

              {decisions.length > 0 && (
                <div className="pd-report-section">
                  <div className="pd-report-label">Decisions made</div>
                  {decisions.map(d => (
                    <div key={d.id} className="pd-report-item">
                      <span>{d.title || d.raw_text?.slice(0, 60)}</span>
                      <span style={{ color: '#9ca3af' }}>{formatDate(d.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}

              {overdueDeadlines.length > 0 && (
                <div className="pd-report-section">
                  <div className="pd-report-label">Overdue deadlines</div>
                  {overdueDeadlines.map(d => (
                    <div key={d.id} className="pd-report-item">
                      <span>{d.description}</span>
                      <span style={{ color: '#dc2626' }}>{formatDate(d.due_date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="pd-lightbox" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" style={{ maxWidth: '95%', maxHeight: '85vh', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}
