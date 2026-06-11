import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ICON_COLORS = { text: '#3b82f6', voice: '#a855f7', photo: '#22c55e', document: '#f97316', email: '#eab308' }

const SVG_ICONS = {
  text: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.1 3.9c.3.3.3.8 0 1.1L5.5 11.6l-2.1.5.5-2.1L10.5 3.4c.3-.3.8-.3 1.1 0l.5.5z"/></svg>,
  voice: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zM5 7a3 3 0 0 0 6 0h1a4 4 0 0 1-3.5 3.97V13H10v1H6v-1h1.5v-2.03A4 4 0 0 1 4 7h1z"/></svg>,
  photo: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7.5 6l-2.5-3-2 2.5L6 8.5 2.5 12H13l-.5-1z"/></svg>,
  document: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm5 1v3h3L9 2z"/></svg>,
  email: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm0 1l6 4 6-4H2zm0 1.5V12h12V5.5L8 9.5 2 5.5z"/></svg>
}

export default function ProjectDetail({ project, profile, onBack }) {
  const [tab, setTab] = useState('timeline')
  const [entries, setEntries] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshDisabled, setRefreshDisabled] = useState(false)

  useEffect(() => { loadData() }, [project.id])

  async function loadData() {
    const [entriesRes, deadlinesRes, summaryRes] = await Promise.all([
      supabase.from('entries').select('*').eq('project_id', project.id)
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('deadlines').select('*').eq('project_id', project.id)
        .in('status', ['overdue', 'pending']).order('due_date'),
      supabase.from('ai_summaries').select('*').eq('project_id', project.id)
        .eq('scope', 'project').order('generated_at', { ascending: false }).limit(1)
    ])
    setEntries(entriesRes.data || [])
    setDeadlines(deadlinesRes.data || [])
    setSummary(summaryRes.data?.[0] || null)
    setLoading(false)
  }

  function refreshSummary() {
    // For now, placeholder. Will connect to edge function later.
    setRefreshDisabled(true)
    setTimeout(() => setRefreshDisabled(false), 300000) // 5 min
  }

  // Group entries by date
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

  const photos = entries.filter(e => e.entry_type === 'photo')
  const grouped = groupByDate(tab === 'timeline' ? entries : photos)

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="app" style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <div>
          <div className="detail-name">{project.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>{project.location}</div>
        </div>
      </div>

      <div className="detail-tabs">
        <button className={`detail-tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>
          Χρονολόγιο
        </button>
        <button className={`detail-tab ${tab === 'photos' ? 'active' : ''}`} onClick={() => setTab('photos')}>
          Φωτο ({photos.length})
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* AI Summary */}
        {tab === 'timeline' && profile?.role === 'owner' && (
          <div className="ai-summary-box">
            <div className="ai-summary-label">AI Σύνοψη</div>
            <div className="ai-summary-text">
              {summary?.summary_text || 'Δεν υπάρχει ακόμα σύνοψη. Θα δημιουργηθεί μετά τις πρώτες ενημερώσεις.'}
            </div>
            <button className="ai-refresh" onClick={refreshSummary} disabled={refreshDisabled}>
              ↻ Ανανέωση {refreshDisabled ? '(5 λεπτά)' : ''}
            </button>
          </div>
        )}

        {/* Overdue Alerts */}
        {tab === 'timeline' && deadlines.filter(d => d.status === 'overdue').map(d => (
          <div key={d.id} className="alert-entry" style={{ margin: '8px 20px' }}>
            <div className="alert-title">Εκκρεμότητα: {d.description}</div>
            <div className="alert-text">
              Προθεσμία: {new Date(d.due_date).toLocaleDateString('el-GR')}
              {d.alert_summary && <> — {d.alert_summary}</>}
            </div>
          </div>
        ))}

        {/* Timeline / Photos */}
        <div className={tab === 'photos' ? 'photos-grid' : 'timeline'}>
          {Object.entries(grouped).length === 0 && (
            <div className="empty-state">
              <div className="icon">{tab === 'photos' ? '📷' : '📋'}</div>
              <p>{tab === 'photos' ? 'Δεν υπάρχουν φωτογραφίες' : 'Δεν υπάρχουν ενημερώσεις'}</p>
            </div>
          )}

          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className={tab === 'photos' ? 'photos-date' : 'timeline-date'}>{date}</div>
              
              {tab === 'photos' ? (
                <div className="photos-row">
                  {items.map(e => (
                    <img key={e.id} src={e.file_url} className="photo-thumb" alt=""
                      onClick={() => window.open(e.file_url, '_blank')} />
                  ))}
                </div>
              ) : (
                items.map(e => (
                  <div key={e.id} className="timeline-entry">
                    <span className="entry-badge" style={{ background: ICON_COLORS[e.entry_type] || '#3b82f6' }}>{SVG_ICONS[e.entry_type] || '?'}</span>
                    <div className="entry-content">
                      <div className="entry-time">{formatTime(e.created_at)}</div>
                      {e.ai_summary && <div className="entry-text">{e.ai_summary}</div>}
                      {!e.ai_summary && e.raw_text && <div className="entry-text">{e.raw_text}</div>}
                      {e.entry_type === 'document' && (
                        <div className="entry-file">
                          {e.file_name}{e.doc_version ? ` (${e.doc_version})` : ''}
                          {e.doc_notes && <div style={{ color: 'var(--text2)', fontSize: 12 }}>{e.doc_notes}</div>}
                        </div>
                      )}
                      {e.entry_type === 'photo' && e.file_url && (
                        <img src={e.file_url} className="entry-photo" alt=""
                          onClick={() => window.open(e.file_url, '_blank')} />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
