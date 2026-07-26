import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { BarChart3, Bell, ChevronDown, FolderOpen, Home, LogOut, Menu, Mic, RefreshCw, X } from 'lucide-react'
import Login from './pages/Login'
import TodayTab from './pages/TodayTab'
import InputTab from './pages/InputTab'
import ProjectsTab from './pages/ProjectsTab'
import MonitorTab from './pages/MonitorTab'
import ProjectDetail from './pages/ProjectDetail'
import { ModalShell } from './components/ui'
import { isPushSupported, subscribeToPush, isSubscribed as checkPushSubscribed } from './lib/push'

const NAV_ITEMS = [
  { id: 'today', label: 'Σήμερα', description: 'Εργασίες και ενημερώσεις', icon: Home },
  { id: 'projects', label: 'Έργα', description: 'Όλα τα ενεργά έργα', icon: FolderOpen },
  { id: 'input', label: 'Νέα ενημέρωση', description: 'Φωνή, κείμενο και αρχεία', icon: Mic },
  { id: 'summary', label: 'Κέντρο διαχείρισης', description: 'Έλεγχος και προγραμματισμός', icon: BarChart3, ownerOnly: true },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('today')
  const [selectedProject, setSelectedProject] = useState(null)
  const [inputProject, setInputProject] = useState(null)
  const [todayBadge, setTodayBadge] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const profileMenuRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession)
      if (currentSession) loadProfile(currentSession.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      if (currentSession) loadProfile(currentSession.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Push notification auto-subscribe — runs whenever profile is available
  useEffect(() => {
    if (!profile) return
    console.log('[Push] Profile loaded, checking push support...')
    console.log('[Push] Support:', {
      sw: 'serviceWorker' in navigator,
      push: 'PushManager' in window,
      notif: 'Notification' in window,
      perm: 'Notification' in window ? Notification.permission : 'N/A'
    })
    if (!isPushSupported()) {
      console.log('[Push] Not supported')
      return
    }
    const timer = setTimeout(async () => {
      try {
        // Always re-save to server — browser may be subscribed but DB row missing
        console.log('[Push] Syncing subscription to server...')
        const result = await subscribeToPush(profile.id)
        console.log('[Push] Result:', result)
      } catch (err) {
        console.error('[Push] Error:', err)
      }
    }, 3000)
    return () => clearTimeout(timer)
  }, [profile?.id])

  // Browser back navigates within the app instead of closing the PWA.
  useEffect(() => {
    if (!window.history.state?.agTab) {
      window.history.replaceState({ agTab: 'today', agProject: null }, '')
    }
    function handlePopState(event) {
      const state = event.state || {}
      setActiveTab(state.agTab || 'today')
      setSelectedProject(state.agProject || null)
      setMobileMenuOpen(false)
      setProfileOpen(false)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function pushHistory(tab, project = null) {
    window.history.pushState({ agTab: tab, agProject: project }, '')
  }

  useEffect(() => {
    function closeTransientUi(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && profileMenuRef.current?.contains(event.target)) return
      setProfileOpen(false)
      if (event.type === 'keydown') setMobileMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeTransientUi)
    document.addEventListener('keydown', closeTransientUi)
    return () => {
      document.removeEventListener('pointerdown', closeTransientUi)
      document.removeEventListener('keydown', closeTransientUi)
    }
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [mobileMenuOpen])

  async function loadProfile(userId) {
    setProfileError(false)
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error || !data) {
      console.error('Profile load error:', error)
      setProfile(null)
      setProfileError(true)
      setLoading(false)
      return
    }
    setProfile(data)
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setLogoutOpen(false)
  }

  function changeTab(id) {
    setActiveTab(id)
    setSelectedProject(null)
    if (id !== 'input') setInputProject(null)
    setMobileMenuOpen(false)
    setProfileOpen(false)
    if (id === 'today') setTodayBadge(0)
    pushHistory(id)
  }

  function openProject(project) {
    setSelectedProject(project)
    pushHistory(activeTab, project)
  }

  function closeProject() {
    if (window.history.state?.agProject) window.history.back()
    else setSelectedProject(null)
  }

  function openInputForProject(project) {
    setInputProject(project || null)
    setSelectedProject(null)
    setActiveTab('input')
    setMobileMenuOpen(false)
    setProfileOpen(false)
  }

  const availableNav = NAV_ITEMS.filter(item => !item.ownerOnly || profile?.role === 'owner')
  const activeItem = availableNav.find(item => item.id === activeTab) || availableNav[0]
  const pageContext = selectedProject
    ? {
        label: selectedProject.name,
        description: selectedProject.location || 'Λεπτομέρειες και ιστορικό έργου',
        kicker: 'Έργα / Ενεργό έργο',
      }
    : {
        label: activeItem?.label,
        description: activeItem?.description,
        kicker: 'AG Project Monitor',
      }

  if (loading) {
    return (
      <div className="loading-screen app-boot-screen" role="status" aria-live="polite">
        <div className="ag-logo ag-logo-large" aria-hidden="true">AG</div>
        <div className="spinner" aria-hidden="true" />
        <p>Φόρτωση χώρου εργασίας…</p>
      </div>
    )
  }

  if (!session) return <Login />

  if (profileError || !profile) {
    return (
      <main className="loading-screen app-boot-screen profile-error-screen" role="alert">
        <div className="ag-logo ag-logo-large" aria-hidden="true">AG</div>
        <h1>Δεν φορτώθηκε το προφίλ</h1>
        <p>Η σύνδεση υπάρχει, αλλά τα στοιχεία χρήστη δεν ήταν διαθέσιμα.</p>
        <div className="profile-error-actions">
          <button type="button" className="action-btn primary" onClick={() => loadProfile(session.user.id)}>Δοκιμή ξανά</button>
          <button type="button" className="action-btn" onClick={handleLogout}>Αποσύνδεση</button>
        </div>
      </main>
    )
  }

  return (
    <div className={`app app-shell ${selectedProject ? 'is-project-view' : ''} ${profile?.role !== 'owner' ? 'team-theme' : ''}`}>
      <aside className={`desktop-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`} aria-label="Κύρια πλοήγηση">
        <div className="sidebar-brand">
          <div className="ag-logo" aria-hidden="true">AG</div>
          <div>
            <strong>AG Project</strong>
            <span>Χώρος διαχείρισης έργων</span>
          </div>
          <button type="button" className="mobile-sidebar-close" onClick={() => setMobileMenuOpen(false)} aria-label="Κλείσιμο μενού">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Χώρος εργασίας">
          <p className="sidebar-eyebrow">Χώρος εργασίας</p>
          {availableNav.map(item => {
            const Icon = item.icon
            const badge = item.id === 'today' && todayBadge > 0 ? (todayBadge > 9 ? '9+' : todayBadge) : null
            const isActive = !selectedProject && activeTab === item.id
            return (
              <button type="button" key={item.id} className={`sidebar-item ${isActive ? 'active' : ''}`} onClick={() => changeTab(item.id)} aria-current={isActive ? 'page' : undefined}>
                <span className="sidebar-item-icon" aria-hidden="true">
                  <Icon size={19} strokeWidth={1.5} />
                  {badge && <em>{badge}</em>}
                </span>
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-profile">
            <span className="profile-avatar" aria-hidden="true">{profile.full_name?.charAt(0) || 'A'}</span>
            <span><strong>{profile.full_name}</strong><small>{profile.role === 'owner' ? 'Διαχειριστής' : 'Μέλος ομάδας'}</small></span>
          </div>
          <button type="button" className="sidebar-logout" onClick={() => setLogoutOpen(true)}>
            <LogOut size={17} aria-hidden="true" /> Αποσύνδεση
          </button>
        </div>
      </aside>

      {mobileMenuOpen && <button type="button" className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Κλείσιμο μενού" />}

      <section className="app-workspace">
        <header className="workspace-header">
          <div className="workspace-title-group">
            <button type="button" className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Άνοιγμα μενού">
              <Menu size={21} aria-hidden="true" />
            </button>
            <div>
              <span className="workspace-kicker">{pageContext.kicker}</span>
              <h1>{pageContext.label}</h1>
              <p>{pageContext.description}</p>
            </div>
          </div>

          <div className="workspace-actions">
            <button type="button" className="header-quick-action" onClick={() => openInputForProject(selectedProject)}>
              <Mic size={17} strokeWidth={1.5} aria-hidden="true" /> Νέα ενημέρωση
            </button>
            <button type="button" className="header-icon-button" aria-label={todayBadge > 0 ? `${todayBadge} νέες ειδοποιήσεις` : 'Ειδοποιήσεις'} onClick={async () => {
              changeTab('today')
              if (isPushSupported() && profile) {
                const subscribed = await checkPushSubscribed()
                if (!subscribed) {
                  await subscribeToPush(profile.id)
                }
              }
            }}>
              <Bell size={18} aria-hidden="true" />
              {todayBadge > 0 && <span aria-hidden="true" />}
            </button>
            <div className="profile-menu-wrap" ref={profileMenuRef}>
              <button type="button" className="header-profile-button" onClick={event => { event.stopPropagation(); setProfileOpen(value => !value) }} aria-expanded={profileOpen} aria-haspopup="menu">
                <span className="profile-avatar" aria-hidden="true">{profile.full_name?.charAt(0) || 'A'}</span>
                <span className="header-profile-copy"><strong>{profile.full_name}</strong><small>{profile.role === 'owner' ? 'Διαχειριστής' : 'Μέλος ομάδας'}</small></span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              {profileOpen && (
                <div className="profile-dropdown" role="menu">
                  <div><strong>{profile.full_name}</strong><small>{session.user?.email}</small></div>
                  <button type="button" role="menuitem" onClick={async () => {
                    setProfileOpen(false)
                    if ('caches' in window) {
                      const names = await caches.keys()
                      for (const name of names) await caches.delete(name)
                    }
                    if (navigator.serviceWorker) {
                      const regs = await navigator.serviceWorker.getRegistrations()
                      for (const reg of regs) await reg.unregister()
                    }
                    window.location.reload()
                  }}><RefreshCw size={16} aria-hidden="true" /> Εκκαθάριση cache</button>
                  <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); setLogoutOpen(true) }}><LogOut size={16} aria-hidden="true" /> Αποσύνδεση</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-main workspace-main">
          {selectedProject ? (
            <ProjectDetail project={selectedProject} profile={profile} onBack={closeProject} onAddUpdate={() => openInputForProject(selectedProject)} />
          ) : (
            <>
              {activeTab === 'today' && <TodayTab profile={profile} onBadgeCount={setTodayBadge} />}
              {activeTab === 'input' && <InputTab profile={profile} initialProject={inputProject} onOpenProjects={() => changeTab('projects')} />}
              {activeTab === 'projects' && <ProjectsTab profile={profile} onSelectProject={openProject} />}
              {activeTab === 'summary' && <MonitorTab profile={profile} onOpenToday={() => changeTab('today')} />}
            </>
          )}
        </main>
      </section>

      {!selectedProject && (
        <nav className="tab-bar mobile-tab-bar" aria-label="Κύρια πλοήγηση">
          {availableNav.map(item => {
            const Icon = item.icon
            const badge = item.id === 'today' && todayBadge > 0 && activeTab !== 'today' ? (todayBadge > 9 ? '9+' : todayBadge) : null
            const isActive = activeTab === item.id
            return (
              <button type="button" key={item.id} className={`tab ${isActive ? 'active' : ''} ${item.id === 'input' ? 'mobile-primary-tab' : ''}`} onClick={() => changeTab(item.id)} aria-current={isActive ? 'page' : undefined}>
                <div className="tab-icon-wrap" aria-hidden="true"><Icon size={20} strokeWidth={1.5} />{badge && <span className="nav-badge">{badge}</span>}</div>
                <span>{item.id === 'input' ? 'Ενημέρωση' : item.label.replace('Κέντρο διαχείρισης', 'Κέντρο')}</span>
              </button>
            )
          })}
        </nav>
      )}

      <ModalShell
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Αποσύνδεση από το AG Project;"
        description="Θα χρειαστεί να συνδεθείτε ξανά για να συνεχίσετε."
        icon={LogOut}
        size="sm"
        actions={<><button type="button" className="action-btn" onClick={() => setLogoutOpen(false)}>Ακύρωση</button><button type="button" className="action-btn primary" onClick={handleLogout}>Αποσύνδεση</button></>}
      >
        <p className="logout-modal-copy">Η τρέχουσα εργασία σας έχει ήδη αποθηκευτεί όπου προβλέπεται.</p>
      </ModalShell>
    </div>
  )
}
