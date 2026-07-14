import { useState, useEffect, useRef } from 'react'
import { Mic, Camera, FileUp, Check, RotateCcw, FolderPlus, Search, Sparkles, LockKeyhole, Users, Send, RefreshCw, FileText, ChevronRight } from 'lucide-react'
import { db, dbRead, supabase } from '../lib/db'
import { ButtonSpinner, EmptyState, LoadingState, ModalShell } from '../components/ui'

export default function InputTab({ profile, initialProject, onOpenProjects }) {
  const [projects, setProjects] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState(false)
  const [selected, setSelected] = useState(null)
  const [projectSearch, setProjectSearch] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [toast, setToast] = useState(null)
  const [recording, setRecording] = useState(false)
  const [mediaRec, setMediaRec] = useState(null)
  const [showFileModal, setShowFileModal] = useState(null)
  const [docName, setDocName] = useState('')
  const [docVersion, setDocVersion] = useState('')
  const [docNotes, setDocNotes] = useState('')
  const [teamVisible, setTeamVisible] = useState(false) // false = private (owner only), true = team can see

  // AI Confirmation state
  const [confirm, setConfirm] = useState(null) // { rawText, extracted }

  useEffect(() => { loadProjects() }, [initialProject?.id])

  async function loadProjects() {
    setProjectsLoading(true)
    setProjectsError(false)
    try {
      const data = await dbRead(supabase.from('projects').select('*').eq('status', 'active').order('name'))
      setProjects(data)
      if (initialProject?.id) {
        setSelected(data.find(p => p.id === initialProject.id) || null)
      } else {
        setSelected(prev => data.find(p => p.id === prev?.id) || null)
      }
    } catch (err) {
      console.error('Project load error:', err)
      setProjectsError(true)
    } finally {
      setProjectsLoading(false)
    }
  }

  function showToast(msg, isError) {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 2500)
  }

  // TEXT SUBMIT - AI extraction for owner only, raw save for team
  async function handleTextSubmit() {
    if (!selected || !text.trim() || extracting) return

    setExtracting(true)
    try {
      const projectNames = projects.map(project => project.name)
      const areas = await dbRead(supabase.from('project_areas').select('area_name').eq('project_id', selected.id))
      const projectAreas = areas.map(area => area.area_name)
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), projectNames, projectAreas })
      })

      if (!response.ok) {
        console.error('AI extraction failed, saving raw text')
        await saveEntry(text.trim(), null)
        return
      }

      const { extracted } = await response.json()
      setConfirm({ rawText: text.trim(), extracted, entryType: 'text' })
    } catch (error) {
      console.error('Extract error:', error)
      await saveEntry(text.trim(), null)
    } finally {
      setExtracting(false)
    }
  }

  // Save entry (with or without AI extraction) - now with structured fields
  async function saveEntry(rawText, extracted, type = 'text') {
    setSending(true)
    try {
      const matchedProject = extracted?.project_name
        ? projects.find(p => p.name === extracted.project_name)
        : null
      const targetProject = selected

      // Handle multiple entries from AI (one voice message can produce multiple entries)
      const entries = extracted?.entries || []
      
      if (entries.length > 0) {
        // Save each structured entry
        for (const entry of entries) {
          await db(supabase.from('entries').insert({
            project_id: targetProject.id,
            user_id: profile.id,
            entry_type: type,
            raw_text: entry.text || rawText,
            ai_summary: extracted?.summary || entry.text?.substring(0, 200),
            title: entry.title || null,
            category: entry.category || null,
            tags: entry.tags || null,
            entry_status: entry.entry_status || null,
            ai_extracted: extracted ? {
              people: extracted.people,
              deadline_description: extracted.deadline_description,
              deadline_date: extracted.deadline_date,
              budget_change: extracted.budget_change,
              action_items: extracted.action_items
            } : null,
            is_team_visible: profile?.role === 'owner' ? teamVisible : true,
            submitter_name: profile.full_name
          }))
        }
      } else {
        await db(supabase.from('entries').insert({
          project_id: targetProject.id,
          user_id: profile.id,
          entry_type: type,
          raw_text: rawText,
          ai_summary: extracted?.summary || rawText.substring(0, 200),
          title: extracted?.summary?.substring(0, 80) || null,
          category: null,
          tags: null,
          ai_extracted: extracted ? {
            people: extracted.people,
            deadline_description: extracted.deadline_description,
            deadline_date: extracted.deadline_date,
            budget_change: extracted.budget_change,
            action_items: extracted.action_items
          } : null,
          is_team_visible: profile?.role === 'owner' ? teamVisible : true,
          submitter_name: profile.full_name
        }))
      }

      // If deadline extracted, save to deadlines table
      if (extracted?.deadline_date && extracted?.deadline_description) {
        await db(supabase.from('deadlines').insert({
          project_id: targetProject.id,
          description: extracted.deadline_description,
          due_date: extracted.deadline_date,
          status: new Date(extracted.deadline_date) < new Date() ? 'overdue' : 'pending'
        }))
      }

      setText('')
      // setTimeout prevents React DOM "removeChild" crash
      // when confirmation card unmounts during render cycle
      setTimeout(() => setConfirm(null), 100)
      showToast('Αποθηκεύτηκε')
    } catch (err) {
      showToast('Σφάλμα: ' + err.message, true)
    }
    setSending(false)
  }

  // Confirm AI extraction
  function handleConfirm() {
    if (!confirm) return
    saveEntry(confirm.rawText, confirm.extracted, confirm.entryType || 'text')
  }

  // Skip AI, save raw
  function handleSkipAI() {
    if (!confirm) return
    saveEntry(confirm.rawText, null, confirm.entryType || 'text')
  }

  // Update a single field in the confirmed extraction
  function updateExtracted(field, value) {
    setConfirm(prev => ({
      ...prev,
      extracted: { ...prev.extracted, [field]: value }
    }))
  }

  // Re-run AI extraction on the (possibly edited) original text
  async function handleReExtract() {
    if (!confirm) return
    setExtracting(true)
    try {
      const projectNames = projects.map(p => p.name)
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: confirm.rawText, projectNames })
      })
      if (res.ok) {
        const { extracted } = await res.json()
        setConfirm(prev => ({ ...prev, extracted }))
      }
    } catch (err) {
      console.error('Re-extract error:', err)
    }
    setExtracting(false)
  }

  // VOICE RECORDING
  async function toggleRecording() {
    if (recording && mediaRec) {
      mediaRec.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Try mp4 first (better compatibility), fallback to webm
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType })
      const chunks = []
      rec.ondataavailable = e => chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        const blob = new Blob(chunks, { type: mimeType })
        setMediaRec(null)
        await transcribeAndExtract(blob)
      }
      rec.start()
      setMediaRec(rec)
      setRecording(true)
    } catch (err) {
      showToast('Δεν υπάρχει πρόσβαση στο μικρόφωνο', true)
    }
  }

  async function transcribeAndExtract(blob) {
    if (!selected) return
    setExtracting(true)
    try {
      // Step 1: Upload audio to Supabase storage (same as photos - this works)
      const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const fileName = `voice_${Date.now()}.${extension}`
      const path = `${selected.id}/${fileName}`
      const { error: upErr } = await supabase.storage.from('files').upload(path, blob)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)
      const fileUrl = urlData.publicUrl

      // Step 2: Transcribe audio (Whisper only)
      const transRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl })
      })

      // Always clean up audio file
      await supabase.storage.from('files').remove([path]).catch(() => {})

      if (!transRes.ok) {
        showToast('Η μεταγραφή απέτυχε', true)
        setExtracting(false)
        return
      }

      const { transcript } = await transRes.json()

      if (!transcript || transcript.trim().length === 0) {
        showToast('Δεν αναγνωρίστηκε ομιλία', true)
        setExtracting(false)
        return
      }

      // Step 3: Extract structured data (same pipeline as text — one brain, two mouths)
      const projectNames = projects.map(p => p.name)
      let projectAreas = []
      if (selected) {
        const areas = await dbRead(supabase.from('project_areas').select('area_name').eq('project_id', selected.id))
        projectAreas = areas.map(a => a.area_name)
      }
      const extRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, projectNames, projectAreas })
      })
      let extracted = null
      if (extRes.ok) {
        const extData = await extRes.json()
        extracted = extData.extracted || null
      }

      // Show confirmation with transcript + extracted data
      setConfirm({
        rawText: transcript,
        extracted,
        entryType: 'voice'
      })
    } catch (err) {
      console.error('Transcribe error:', err)
      showToast('Σφάλμα μεταγραφής', true)
    }
    setExtracting(false)
  }

  // PHOTO UPLOAD - supports multiple
  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !selected) return
    setSending(true)
    try {
      for (const file of files) {
        const compressed = file.size > 1500000 ? await compressImage(file) : file
        const fileName = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
        const path = `${selected.id}/${fileName}`
        const { error: upErr } = await supabase.storage.from('files').upload(path, compressed)
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)

        await db(supabase.from('entries').insert({
          project_id: selected.id,
          user_id: profile.id,
          entry_type: 'photo',
          file_url: urlData.publicUrl,
          file_name: fileName,
          file_size: compressed.size,
          is_team_visible: profile?.role === 'owner' ? teamVisible : true
        }))
      }
      showToast(`${files.length} φωτογραφία${files.length > 1 ? 'ες' : ''} αποθηκεύτηκ${files.length > 1 ? 'αν' : 'ε'}`)
    } catch (err) {
      showToast('Σφάλμα: ' + err.message, true)
    }
    setSending(false)
    setShowFileModal(null)
  }

  // DOCUMENT UPLOAD
  async function handleDocUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !selected) return
    setSending(true)
    try {
      const fileName = file.name
      const path = `${selected.id}/${Date.now()}_${fileName}`
      const { error: upErr } = await supabase.storage.from('files').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('files').getPublicUrl(path)

      await db(supabase.from('entries').insert({
        project_id: selected.id,
        user_id: profile.id,
        entry_type: 'document',
        file_url: urlData.publicUrl,
        file_name: docName || fileName,
        file_size: file.size,
        doc_version: docVersion || null,
        doc_notes: docNotes || null,
        is_team_visible: profile?.role === 'owner' ? teamVisible : true
      }))
      setDocName(''); setDocVersion(''); setDocNotes('')
      showToast('Αρχείο αποθηκεύτηκε')
    } catch (err) {
      showToast('Σφάλμα: ' + err.message, true)
    }
    setSending(false)
    setShowFileModal(null)
  }

  async function compressImage(file) {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxW = 1200
        const scale = Math.min(1, maxW / img.width)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.8)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  // ============ RENDER ============
  if (projectsLoading) return <LoadingState label="Φόρτωση έργων και εργαλείων καταχώρησης…" cards={4} />

  if (projectsError) return (
    <EmptyState
      icon={RefreshCw}
      title="Δεν φορτώθηκαν τα έργα"
      description="Χρειάζεται ενεργό έργο πριν καταχωρηθεί νέα πληροφορία. Δοκιμάστε ξανά."
      actionLabel="Δοκιμή ξανά"
      onAction={loadProjects}
    />
  )

  if (projects.length === 0) return (
    <EmptyState
      icon={FolderPlus}
      title="Χρειάζεται πρώτα ένα έργο"
      description={profile?.role === 'owner' ? 'Δημιουργήστε το πρώτο έργο και μετά προσθέστε ενημερώσεις, φωτογραφίες και αρχεία.' : 'Δεν υπάρχει ακόμη ενεργό έργο για καταχώρηση ενημέρωσης.'}
      actionLabel={profile?.role === 'owner' && onOpenProjects ? 'Μετάβαση στα έργα' : undefined}
      onAction={profile?.role === 'owner' ? onOpenProjects : undefined}
    />
  )

  const normalizedSearch = projectSearch.trim().toLocaleLowerCase('el-GR')
  const filteredProjects = normalizedSearch
    ? projects.filter(project => [project.name, project.location, project.description]
        .filter(Boolean)
        .some(value => value.toLocaleLowerCase('el-GR').includes(normalizedSearch)))
    : projects
  const extracted = confirm?.extracted || {}
  const categoryLabels = {
    work_update: 'Ενημέρωση εργασιών',
    problem: 'Πρόβλημα',
    decision: 'Απόφαση',
    material: 'Υλικό',
    client_request: 'Αίτημα πελάτη',
    note: 'Σημείωση',
  }
  const statusLabels = {
    open: 'Ανοιχτό',
    pending: 'Σε αναμονή',
    resolved: 'Επιλύθηκε',
    completed: 'Ολοκληρώθηκε',
    in_progress: 'Σε εξέλιξη',
  }

  return (
    <div className="input-command-page">
      <aside className="input-project-rail" aria-label="Επιλογή έργου">
        <div className="input-project-rail-heading">
          <div><span>Ενεργά έργα</span><strong>{projects.length}</strong></div>
          <p>Επιλέξτε πού θα αποθηκευτεί η νέα πληροφορία.</p>
        </div>
        <label className="input-project-search">
          <Search size={15} strokeWidth={1.8} aria-hidden="true" />
          <span className="sr-only">Αναζήτηση έργου</span>
          <input value={projectSearch} onChange={event => setProjectSearch(event.target.value)} placeholder="Αναζήτηση έργου…" />
        </label>
        <div className="input-project-list">
          {filteredProjects.map(project => (
            <button
              type="button"
              key={project.id}
              className={`input-project-option ${selected?.id === project.id ? 'is-selected' : ''}`}
              onClick={() => { setSelected(project); setConfirm(null) }}
              aria-pressed={selected?.id === project.id}
            >
              <span className="input-project-option-icon" aria-hidden="true">{project.name.charAt(0)}</span>
              <span className="input-project-option-copy"><strong>{project.name}</strong><small>{project.location || 'Χωρίς τοποθεσία'}</small></span>
              <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ))}
          {filteredProjects.length === 0 && <p className="input-project-no-results">Δεν βρέθηκε έργο.</p>}
        </div>
      </aside>

      <section className="input-workspace-panel">
        {!selected ? (
          <div className="input-start-state">
            <span className="input-start-icon" aria-hidden="true"><FolderPlus size={29} strokeWidth={1.6} /></span>
            <h2>Επιλέξτε έργο για να ξεκινήσετε</h2>
            <p>Κάθε φωνητική ενημέρωση, κείμενο, φωτογραφία ή αρχείο θα οργανωθεί μέσα στο επιλεγμένο έργο.</p>
          </div>
        ) : !confirm ? (
          <>
            <header className="input-workspace-header">
              <div className="input-selected-project">
                <span className="input-selected-project-icon" aria-hidden="true">{selected.name.charAt(0)}</span>
                <div><span>Νέα καταχώρηση στο έργο</span><h2>{selected.name}</h2><p>{selected.location || 'Δεν έχει οριστεί τοποθεσία'}{selected.description ? ` · ${selected.description}` : ''}</p></div>
              </div>

              {profile?.role === 'owner' && (
                <div className="input-visibility-control" role="group" aria-label="Ορατότητα καταχώρησης">
                  <button type="button" className={!teamVisible ? 'is-active' : ''} onClick={() => setTeamVisible(false)} aria-pressed={!teamVisible}><LockKeyhole size={14} strokeWidth={1.8} aria-hidden="true" /><span>Μόνο εγώ</span></button>
                  <button type="button" className={teamVisible ? 'is-active' : ''} onClick={() => setTeamVisible(true)} aria-pressed={teamVisible}><Users size={14} strokeWidth={1.8} aria-hidden="true" /><span>Η ομάδα</span></button>
                </div>
              )}
            </header>

            <div className="input-composer-layout">
              <section className="input-primary-composer">
                <div className="input-composer-heading">
                  <span className="input-composer-icon" aria-hidden="true"><Sparkles size={19} strokeWidth={1.7} /></span>
                  <div><h3>Τι συνέβη στο έργο;</h3><p>Γράψτε φυσικά. Η εφαρμογή θα οργανώσει προβλήματα, αποφάσεις, υλικά και επόμενες ενέργειες.</p></div>
                </div>

                <label htmlFor="project-update-text" className="sr-only">Κείμενο ενημέρωσης</label>
                <textarea
                  id="project-update-text"
                  className="input-professional-textarea"
                  placeholder="π.χ. Μίλησα με τον Νίκο. Ο χάλυβας θα φτάσει την Πέμπτη και υπάρχει επιπλέον κόστος 2.000 €."
                  value={text}
                  onChange={event => setText(event.target.value)}
                  onKeyDown={event => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') handleTextSubmit()
                  }}
                />

                <div className="input-composer-actions">
                  <div className="input-composer-hint">Ctrl/⌘ + Enter για αποστολή</div>
                  <div>
                    {profile?.role === 'owner' && (
                      <button type="button" className={`input-record-button ${recording ? 'is-recording' : ''}`} onClick={toggleRecording} disabled={extracting}>
                        <Mic size={17} strokeWidth={1.8} aria-hidden="true" />
                        <span>{recording ? 'Διακοπή εγγραφής' : 'Φωνητική ενημέρωση'}</span>
                      </button>
                    )}
                    <button type="button" className="input-submit-button" onClick={handleTextSubmit} disabled={!text.trim() || sending || extracting}>
                      {extracting ? <ButtonSpinner label="Ανάλυση…" /> : sending ? <ButtonSpinner label="Αποθήκευση…" /> : <><Send size={16} strokeWidth={1.9} aria-hidden="true" />Ανάλυση και συνέχεια</>}
                    </button>
                  </div>
                </div>
              </section>

              <aside className="input-attachment-panel">
                <div className="input-attachment-heading"><h3>Γρήγορη προσθήκη</h3><p>Υλικό από το εργοτάξιο ή το γραφείο.</p></div>
                <button type="button" className="input-attachment-action is-photo" onClick={() => setShowFileModal('photo')}>
                  <span aria-hidden="true"><Camera size={20} strokeWidth={1.7} /></span>
                  <span><strong>Φωτογραφίες</strong><small>Λήψη ή επιλογή πολλών εικόνων</small></span>
                  <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <button type="button" className="input-attachment-action is-file" onClick={() => setShowFileModal('document')}>
                  <span aria-hidden="true"><FileUp size={20} strokeWidth={1.7} /></span>
                  <span><strong>Έγγραφο ή σχέδιο</strong><small>PDF, Word, Excel ή DWG</small></span>
                  <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <div className="input-visibility-note">
                  {profile?.role === 'owner' && !teamVisible ? <LockKeyhole size={15} strokeWidth={1.8} aria-hidden="true" /> : <Users size={15} strokeWidth={1.8} aria-hidden="true" />}
                  <span>{profile?.role === 'owner' && !teamVisible ? 'Η καταχώρηση θα είναι ιδιωτική για τον διαχειριστή.' : 'Η καταχώρηση θα είναι διαθέσιμη στην ομάδα.'}</span>
                </div>
              </aside>
            </div>
          </>
        ) : (
          <section className="input-review-workspace">
            <header className="input-review-header">
              <div className="input-review-title">
                <span className="input-ai-mark" aria-hidden="true"><Sparkles size={19} strokeWidth={1.8} /></span>
                <div><span>Έλεγχος πριν την αποθήκευση</span><h2>Επιβεβαίωση ανάλυσης</h2><p>Ελέγξτε όσα αναγνώρισε η εφαρμογή. Το αρχικό κείμενο παραμένει πάντα διαθέσιμο.</p></div>
              </div>
              <button type="button" className="input-reanalyse-button" onClick={handleReExtract} disabled={extracting}><RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />{extracting ? 'Ανάλυση…' : 'Νέα ανάλυση'}</button>
            </header>

            <div className="input-review-grid">
              <div className="input-review-main">
                <section className="input-review-card">
                  <div className="input-review-card-heading"><div><h3>Αρχική πληροφορία</h3><p>Μπορείτε να διορθώσετε το κείμενο πριν την αποθήκευση.</p></div><span>{confirm.entryType === 'voice' ? 'Φωνή' : 'Κείμενο'}</span></div>
                  <textarea value={confirm.rawText} onChange={event => setConfirm(previous => ({ ...previous, rawText: event.target.value }))} rows={5} />
                </section>

                {extracted.entries?.length > 0 ? (
                  <section className="input-review-card">
                    <div className="input-review-card-heading"><div><h3>Οργανωμένες καταχωρήσεις</h3><p>{extracted.entries.length} διαφορετικ{extracted.entries.length === 1 ? 'ή πληροφορία' : 'ές πληροφορίες'} θα αποθηκευτ{extracted.entries.length === 1 ? 'εί' : 'ούν'}.</p></div><span>{extracted.entries.length}</span></div>
                    <div className="input-extracted-list">
                      {extracted.entries.map((entry, index) => (
                        <article key={`${entry.title || 'entry'}-${index}`} className={`input-extracted-card category-${entry.category || 'note'}`}>
                          <div className="input-extracted-card-top"><span className="input-category-badge">{categoryLabels[entry.category] || 'Σημείωση'}</span>{entry.entry_status && <span className="input-status-badge">{statusLabels[entry.entry_status] || entry.entry_status}</span>}</div>
                          <h4>{entry.title || `Καταχώρηση ${index + 1}`}</h4>
                          <p>{entry.text || confirm.rawText}</p>
                          {entry.tags?.length > 0 && <div className="input-tag-list">{entry.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
                        </article>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="input-review-card">
                    <EmptyState icon={FileText} title="Δεν δημιουργήθηκαν ξεχωριστές κατηγορίες" description="Μπορείτε να αποθηκεύσετε το αρχικό κείμενο ως μία γενική καταχώρηση." compact />
                  </section>
                )}
              </div>

              <aside className="input-review-details">
                <section className="input-review-card">
                  <div className="input-review-card-heading"><div><h3>Στοιχεία καταχώρησης</h3><p>Διορθώστε ό,τι χρειάζεται.</p></div></div>
                  <div className="input-review-fields">
                    <div className="input-review-field"><label htmlFor="review-project">Έργο</label><select id="review-project" value={extracted.project_name || selected.name} onChange={event => updateExtracted('project_name', event.target.value)}>{projects.map(project => <option key={project.id} value={project.name}>{project.name}</option>)}</select></div>
                    {extracted.people?.length > 0 && <div className="input-review-field"><label htmlFor="review-people">Άτομα</label><input id="review-people" value={extracted.people.join(', ')} onChange={event => updateExtracted('people', event.target.value.split(',').map(value => value.trim()).filter(Boolean))} /></div>}
                    {extracted.deadline_description && <div className="input-review-field"><label htmlFor="review-deadline">Προθεσμία</label><input id="review-deadline" value={extracted.deadline_description} onChange={event => updateExtracted('deadline_description', event.target.value)} />{extracted.deadline_date && <input type="date" value={extracted.deadline_date} onChange={event => updateExtracted('deadline_date', event.target.value)} />}</div>}
                    {extracted.budget_change !== 0 && extracted.budget_change != null && <div className="input-review-field"><label htmlFor="review-budget">Μεταβολή προϋπολογισμού (€)</label><input id="review-budget" type="number" value={extracted.budget_change} onChange={event => updateExtracted('budget_change', Number(event.target.value))} /></div>}
                    {extracted.action_items?.length > 0 && <div className="input-review-field"><label htmlFor="review-actions">Επόμενες ενέργειες</label><textarea id="review-actions" value={extracted.action_items.join('\n')} onChange={event => updateExtracted('action_items', event.target.value.split('\n').filter(Boolean))} rows={4} /></div>}
                    {extracted.summary && <div className="input-review-field"><label htmlFor="review-summary">Σύντομη σύνοψη</label><textarea id="review-summary" value={extracted.summary} onChange={event => updateExtracted('summary', event.target.value)} rows={3} /></div>}
                  </div>
                </section>
              </aside>
            </div>

            <footer className="input-review-actions">
              <button type="button" className="action-btn" onClick={() => setConfirm(null)} disabled={sending}>Πίσω για αλλαγές</button>
              <button type="button" className="action-btn" onClick={handleSkipAI} disabled={sending}>Αποθήκευση μόνο του κειμένου</button>
              <button type="button" className="action-btn primary" onClick={handleConfirm} disabled={sending}>{sending ? <ButtonSpinner label="Αποθήκευση…" /> : <><Check size={15} strokeWidth={2} aria-hidden="true" />Επιβεβαίωση και αποθήκευση</>}</button>
            </footer>
          </section>
        )}
      </section>

      <ModalShell
        open={showFileModal === 'photo'}
        onClose={() => setShowFileModal(null)}
        title="Προσθήκη φωτογραφιών"
        description={`Οι φωτογραφίες θα αποθηκευτούν στο έργο «${selected?.name || ''}».`}
        icon={Camera}
        size="sm"
        actions={<button type="button" className="action-btn" onClick={() => setShowFileModal(null)}>Ακύρωση</button>}
      >
        <label className="input-file-dropzone">
          <span aria-hidden="true"><Camera size={24} strokeWidth={1.6} /></span>
          <strong>Λήψη ή επιλογή φωτογραφιών</strong>
          <small>Μπορείτε να επιλέξετε πολλές εικόνες μαζί.</small>
          <input type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoUpload} />
        </label>
        {sending && <div className="input-upload-progress"><ButtonSpinner label="Μεταφόρτωση φωτογραφιών…" /></div>}
      </ModalShell>

      <ModalShell
        open={showFileModal === 'document'}
        onClose={() => setShowFileModal(null)}
        title="Προσθήκη εγγράφου ή σχεδίου"
        description={`Το αρχείο θα συνδεθεί με το έργο «${selected?.name || ''}».`}
        icon={FileUp}
        size="md"
        actions={<button type="button" className="action-btn" onClick={() => setShowFileModal(null)}>Ακύρωση</button>}
      >
        <div className="input-document-form">
          <div><label htmlFor="document-name">Όνομα εγγράφου</label><input id="document-name" value={docName} onChange={event => setDocName(event.target.value)} placeholder="π.χ. Αρχιτεκτονικό σχέδιο ισογείου" /></div>
          <div><label htmlFor="document-version">Έκδοση</label><input id="document-version" value={docVersion} onChange={event => setDocVersion(event.target.value)} placeholder="π.χ. v3" /></div>
          <div className="is-full"><label htmlFor="document-notes">Σημειώσεις</label><textarea id="document-notes" value={docNotes} onChange={event => setDocNotes(event.target.value)} placeholder="Προαιρετική σύντομη περιγραφή…" rows={3} /></div>
          <label className="input-file-dropzone is-full"><span aria-hidden="true"><FileUp size={24} strokeWidth={1.6} /></span><strong>Επιλογή αρχείου</strong><small>PDF, DWG, Word ή Excel</small><input type="file" accept=".pdf,.dwg,.doc,.docx,.xls,.xlsx" onChange={handleDocUpload} /></label>
        </div>
        {sending && <div className="input-upload-progress"><ButtonSpinner label="Μεταφόρτωση αρχείου…" /></div>}
      </ModalShell>

      {toast && <div className={`toast ${toast.isError ? 'toast-error' : 'toast-success'}`} role="status">{toast.msg}</div>}
    </div>
  )
}
