import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import StepsView from './StepsView'

const ICON_COLORS = { text: '#3b82f6', voice: '#a855f7', photo: '#22c55e', document: '#f97316', email: '#eab308' }
const TYPE_LABELS = { text: 'Σημείωση', voice: 'Ηχητικό', photo: 'Φωτογραφία', document: 'Αρχείο', email: 'Email' }

const SVG_ICONS = {
  text: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.1 3.9c.3.3.3.8 0 1.1L5.5 11.6l-2.1.5.5-2.1L10.5 3.4c.3-.3.8-.3 1.1 0l.5.5z"/></svg>,
  voice: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zM5 7a3 3 0 0 0 6 0h1a4 4 0 0 1-3.5 3.97V13H10v1H6v-1h1.5v-2.03A4 4 0 0 1 4 7h1z"/></svg>,
  photo: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7.5 6l-2.5-3-2 2.5L6 8.5 2.5 12H13l-.5-1z"/></svg>,
  document: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm5 1v3h3L9 2z"/></svg>,
  email: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm0 1l6 4 6-4H2zm0 1.5V12h12V5.5L8 9.5 2 5.5z"/></svg>,
  download: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v9m0 0L5 7m3 3l3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  close: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>,
}

function ReadMore({ text, limit = 120 }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  if (text.length <= limit) return <span>{text}</span>
  return (
    <span>
      {expanded ? text : text.slice(0, limit) + '...'}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        style={{
          background: 'none', border: 'none', color: 'var(--blue)',
          fontSize: 12, cursor: 'pointer', marginLeft: 4, padding: 0, fontWeight: 500
        }}
      >
        {expanded ? 'Λιγότερα' : 'Περισσότερα'}
      </button>
    </span>
  )
}

export default function ProjectDetail({ project, profile, onBack }) {
  const [tab, setTab] = useState('steps')
  const [entries, setEntries] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshDisabled, setRefreshDisabled] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)

  useEffect(() => { loadData() }, [project.id])

  async function loadData() {
    let entriesQuery = supabase.from('entries').select('*').eq('project_id', project.id)
      .order('created_at', { ascending: false }).limit(100)
    
    // Team members only see team-visible entries (no voice, no email, no budget)
    if (profile?.role === 'team') {
      entriesQuery = entriesQuery.eq('is_team_visible', true)
    }

    const [entriesRes, deadlinesRes, summaryRes] = await Promise.all([
      entriesQuery,
      supabase.from('deadlines').select('*').eq('project_id', project.id)
        .order('due_date'),
      supabase.from('ai_summaries').select('*').eq('project_id', project.id)
        .eq('scope', 'project').order('generated_at', { ascending: false }).limit(1)
    ])
    setEntries(entriesRes.data || [])
    setDeadlines(deadlinesRes.data || [])
    setSummary(summaryRes.data?.[0] || null)
    setLoading(false)
  }

  function getFirstName(fullName) {
    if (!fullName) return ''
    return fullName.split(' ')[0]
  }

  async function refreshSummary() {
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
        body: JSON.stringify({
          entries: recentEntries,
          projectName: project.name,
          scope: 'project'
        })
      })

      if (res.ok) {
        const { summary: summaryText } = await res.json()
        // Save to Supabase
        await supabase.from('ai_summaries').upsert({
          project_id: project.id,
          scope: 'project',
          summary_text: summaryText,
          generated_at: new Date().toISOString()
        }, { onConflict: 'project_id,scope' })
        setSummary({ summary_text: summaryText })
      }
    } catch (err) {
      console.error('Summary refresh error:', err)
    }
    setTimeout(() => setRefreshDisabled(false), 300000)
  }

  function groupByDate(items) {
    const groups = {}
    items.forEach(e => {
      const date = new Date(e.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })
      if (!groups[date]) groups[date] = []
      groups[date].push(e)
    })
    return groups
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
  }

  async function markDeadlineComplete(deadlineId) {
    await supabase.from('deadlines').update({ status: 'completed' }).eq('id', deadlineId)
    setDeadlines(deadlines.map(d => d.id === deadlineId ? { ...d, status: 'completed' } : d))
  }

  async function reopenDeadline(deadlineId, dueDate) {
    const newStatus = new Date(dueDate) < new Date() ? 'overdue' : 'pending'
    await supabase.from('deadlines').update({ status: newStatus }).eq('id', deadlineId)
    setDeadlines(deadlines.map(d => d.id === deadlineId ? { ...d, status: newStatus } : d))
  }

  function formatFileSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  const photos = entries.filter(e => e.entry_type === 'photo')
  const documents = entries.filter(e => e.entry_type === 'document')
  
  const currentItems = tab === 'photos' ? photos : tab === 'documents' ? documents : entries
  const grouped = groupByDate(currentItems)

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="app" style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M14 4l-6 6 6 6"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <div className="detail-name">{project.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>{project.location}</div>
        </div>
      </div>

      {/* Tabs: Steps, Timeline, Photos, Documents */}
      <div className="detail-tabs">
        <button className={`detail-tab ${tab === 'steps' ? 'active' : ''}`} onClick={() => setTab('steps')}>
          Βήματα
        </button>
        <button className={`detail-tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>
          Χρονολόγιο
        </button>
        <button className={`detail-tab ${tab === 'deadlines' ? 'active' : ''}`} onClick={() => setTab('deadlines')}>
          Προθεσμίες {deadlines.filter(d => d.status === 'overdue').length > 0 && <span className="tab-badge">{deadlines.filter(d => d.status === 'overdue').length}</span>}
        </button>
        <button className={`detail-tab ${tab === 'photos' ? 'active' : ''}`} onClick={() => setTab('photos')}>
          Φωτο ({photos.length})
        </button>
        <button className={`detail-tab ${tab === 'documents' ? 'active' : ''}`} onClick={() => setTab('documents')}>
          Αρχεία ({documents.length})
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Steps View */}
        {tab === 'steps' && (
          <div style={{ padding: '12px 16px' }}>
            <StepsView project={project} profile={profile} />
          </div>
        )}

        {/* AI Summary - timeline tab only, owner only */}
        {tab === 'timeline' && profile?.role === 'owner' && (
          <div className="ai-summary-box">
            <div className="ai-summary-label">AI Σύνοψη</div>
            <div className="ai-summary-text">
              {summary?.summary_text || 'Δεν υπάρχει ακόμα σύνοψη. Θα δημιουργηθεί μετά τις πρώτες ενημερώσεις.'}
            </div>
            <button className="ai-refresh" onClick={refreshSummary} disabled={refreshDisabled}>
              Ανανέωση {refreshDisabled ? '(5 λεπτά)' : ''}
            </button>
          </div>
        )}

        {/* Overdue Alerts */}
        {tab === 'timeline' && deadlines.filter(d => d.status === 'overdue').map(d => (
          <div key={d.id} className="alert-entry" style={{ margin: '8px 16px' }}>
            <div className="alert-title">{d.description}</div>
            <div className="alert-text">
              <strong style={{ fontWeight: 600 }}>Προθεσμία</strong> {new Date(d.due_date).toLocaleDateString('el-GR')}
              {d.alert_summary && <><span style={{ margin: '0 6px', color: 'var(--text3)' }}>|</span>{d.alert_summary}</>}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {Object.entries(grouped).length === 0 && (
          <div className="empty-state">
            <div className="icon">
              {tab === 'photos' ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              ) : tab === 'documents' ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              )}
            </div>
            <p>{tab === 'photos' ? 'Δεν υπάρχουν φωτογραφίες' : tab === 'documents' ? 'Δεν υπάρχουν αρχεία' : 'Δεν υπάρχουν ενημερώσεις'}</p>
          </div>
        )}

        {/* === TIMELINE VIEW === center line, alternating left/right */}
        {tab === 'timeline' && Object.entries(grouped).length > 0 && (
          <div className="center-timeline">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <div className="ct-date-label">{date}</div>
                {items.map((e, i) => {
                  const isLeft = i % 2 === 0
                  const color = ICON_COLORS[e.entry_type] || '#3b82f6'
                  const displayText = e.ai_summary || e.raw_text || ''
                  return (
                    <div key={e.id} className={`ct-row ${isLeft ? 'ct-left' : 'ct-right'}`}>
                      {/* Left content */}
                      <div className="ct-content-left">
                        {isLeft && (
                          <div className="ct-card" style={{ borderTop: `3px solid ${color}` }}>
                            <div className="ct-card-header">
                              <span className="ct-badge" style={{ background: color }}>
                                {SVG_ICONS[e.entry_type]}
                              </span>
                              <span className="ct-type-label">{TYPE_LABELS[e.entry_type]}</span>
                              {e.submitter_name && <span className="ct-submitter">{getFirstName(e.submitter_name)}</span>}
                              <span className="ct-time">{formatTime(e.created_at)}</span>
                            </div>
                            {displayText && (
                              <div className="ct-card-body">
                                <ReadMore text={displayText} limit={100} />
                              </div>
                            )}
                            {e.entry_type === 'photo' && e.file_url && (
                              <img src={e.file_url} className="ct-photo" alt=""
                                onClick={() => setLightboxUrl(e.file_url)} />
                            )}
                            {e.entry_type === 'document' && (
                              <div className="ct-doc-info">
                                <div className="ct-doc-name">{e.file_name}</div>
                                {e.doc_version && <span className="ct-doc-version">{e.doc_version}</span>}
                                {e.doc_notes && <div className="ct-doc-notes"><ReadMore text={e.doc_notes} limit={80} /></div>}
                                {e.file_size && <div className="ct-doc-size">{formatFileSize(e.file_size)}</div>}
                                {e.file_url && (
                                  <a href={e.file_url} target="_blank" rel="noopener" className="ct-doc-link">
                                    Άνοιγμα αρχείου
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2L7 9"/></svg>
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Center dot */}
                      <div className="ct-center">
                        <div className="ct-dot" style={{ background: color }} />
                      </div>

                      {/* Right content */}
                      <div className="ct-content-right">
                        {!isLeft && (
                          <div className="ct-card" style={{ borderTop: `3px solid ${color}` }}>
                            <div className="ct-card-header">
                              <span className="ct-badge" style={{ background: color }}>
                                {SVG_ICONS[e.entry_type]}
                              </span>
                              <span className="ct-type-label">{TYPE_LABELS[e.entry_type]}</span>
                              {e.submitter_name && <span className="ct-submitter">{getFirstName(e.submitter_name)}</span>}
                              <span className="ct-time">{formatTime(e.created_at)}</span>
                            </div>
                            {displayText && (
                              <div className="ct-card-body">
                                <ReadMore text={displayText} limit={100} />
                              </div>
                            )}
                            {e.entry_type === 'photo' && e.file_url && (
                              <img src={e.file_url} className="ct-photo" alt=""
                                onClick={() => setLightboxUrl(e.file_url)} />
                            )}
                            {e.entry_type === 'document' && (
                              <div className="ct-doc-info">
                                <div className="ct-doc-name">{e.file_name}</div>
                                {e.doc_version && <span className="ct-doc-version">{e.doc_version}</span>}
                                {e.doc_notes && <div className="ct-doc-notes"><ReadMore text={e.doc_notes} limit={80} /></div>}
                                {e.file_size && <div className="ct-doc-size">{formatFileSize(e.file_size)}</div>}
                                {e.file_url && (
                                  <a href={e.file_url} target="_blank" rel="noopener" className="ct-doc-link">
                                    Άνοιγμα αρχείου
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2L7 9"/></svg>
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* === PHOTOS VIEW === grid with lightbox */}
        {tab === 'photos' && Object.entries(grouped).length > 0 && (
          <div className="photos-grid">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <div className="photos-date">{date}</div>
                <div className="photos-row">
                  {items.map(e => (
                    <div key={e.id} className="photo-thumb-wrap" onClick={() => setLightboxUrl(e.file_url)}>
                      <img src={e.file_url} className="photo-thumb" alt="" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* === DOCUMENTS VIEW === file cards with metadata */}
        {tab === 'documents' && Object.entries(grouped).length > 0 && (
          <div style={{ padding: '12px 16px' }}>
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <div className="photos-date">{date}</div>
                {items.map(e => (
                  <div key={e.id} className="doc-card">
                    <div className="doc-card-icon">
                      <span className="ct-badge" style={{ background: '#f97316', width: 36, height: 36, borderRadius: 10 }}>
                        {SVG_ICONS.document}
                      </span>
                    </div>
                    <div className="doc-card-info">
                      <div className="doc-card-name">{e.file_name || 'Αρχείο'}</div>
                      <div className="doc-card-meta">
                        {e.doc_version && <span className="doc-card-version">{e.doc_version}</span>}
                        {e.file_size && <span>{formatFileSize(e.file_size)}</span>}
                        <span>{formatTime(e.created_at)}</span>
                      </div>
                      {e.doc_notes && (
                        <div className="doc-card-notes">
                          <ReadMore text={e.doc_notes} limit={100} />
                        </div>
                      )}
                    </div>
                    {e.file_url && (
                      <a href={e.file_url} target="_blank" rel="noopener" className="doc-card-open" title="Άνοιγμα">
                        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2L7 9"/></svg>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* === DEADLINES VIEW === */}
        {tab === 'deadlines' && (
          <div style={{ padding: '12px 16px' }}>
            {deadlines.length === 0 && (
              <div className="empty-state">
                <div className="icon">📅</div>
                <p>Δεν υπάρχουν προθεσμίες</p>
              </div>
            )}
            {['overdue', 'pending', 'completed'].map(status => {
              const items = deadlines.filter(d => d.status === status)
              if (items.length === 0) return null
              const statusLabels = { overdue: 'Εκπρόθεσμες', pending: 'Εκκρεμείς', completed: 'Ολοκληρωμένες' }
              return (
                <div key={status} style={{ marginBottom: 20 }}>
                  <div className="deadline-section-label">{statusLabels[status]} ({items.length})</div>
                  {items.map(d => (
                    <div key={d.id} className={`deadline-card deadline-${d.status}`}>
                      <div className="deadline-card-main">
                        <div className="deadline-card-desc">{d.description}</div>
                        <div className="deadline-card-date">
                          {new Date(d.due_date).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })}
                          {d.status === 'overdue' && (
                            <span className="deadline-overdue-tag">
                              {Math.floor((new Date() - new Date(d.due_date)) / 86400000)} μέρες
                            </span>
                          )}
                        </div>
                        {d.alert_summary && d.status === 'overdue' && (
                          <div className="deadline-alert-text">{d.alert_summary}</div>
                        )}
                      </div>
                      {d.status === 'completed' ? (
                        <button className="deadline-reopen" onClick={() => reopenDeadline(d.id, d.due_date)}>
                          Επαναφορά
                        </button>
                      ) : (
                        <button className="deadline-complete" onClick={() => markDeadlineComplete(d.id)}>
                          ✓ Έγινε
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Photo Lightbox */}
      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button className="lightbox-close" onClick={() => setLightboxUrl(null)}>
            {SVG_ICONS.close}
          </button>
          <img src={lightboxUrl} className="lightbox-img" alt="" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
