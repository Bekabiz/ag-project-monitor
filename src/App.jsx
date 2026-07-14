import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { Home, FolderOpen, Mic, BarChart3, LogOut, ChevronDown, Menu, X, Bell } from 'lucide-react'
import Login from './pages/Login'
import TodayTab from './pages/TodayTab'
import InputTab from './pages/InputTab'
import ProjectsTab from './pages/ProjectsTab'
import MonitorTab from './pages/MonitorTab'
import ProjectDetail from './pages/ProjectDetail'

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

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

  if (loading) return (
    <div className="loading-screen app-boot-screen">
      <div className="ag-logo ag-logo-large">AG</div>
      <div className="spinner" />
      <p>Φόρτωση χώρου εργασίας…</p>
    </div>
  )
  if (!session) return <Login />

  if (profileError || !profile) return (
    <div className="loading-screen app-boot-screen profile-error-screen">
      <div className="ag-logo ag-logo-large">AG</div>
      <h2>Δεν φορτώθηκε το προφίλ</h2>
      <p>Η σύνδεση υπάρχει, αλλά τα στοιχεία χρήστη δεν ήταν διαθέσιμα.</p>
      <div className="profile-error-actions">
        <button className="action-btn primary" onClick={() => loadProfile(session.user.id)}>Δοκιμή ξανά</button>
        <button className="action-btn" onClick={handleLogout}>Αποσύνδεση</button>
      </div>
    </div>
  )

  if (selectedProject) {
    return <ProjectDetail project={selectedProject} profile={profile} onBack={() => setSelectedProject(null)} onAddUpdate={() => openInputForProject(selectedProject)} />
  }

  return (
    <div className="app app-shell">
      <aside className={`desktop-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="ag-logo">AG</div>
          <div>
            <strong>AG Project</strong>
            <span>Χώρος διαχείρισης έργων</span>
          </div>
          <button className="mobile-sidebar-close" onClick={() => setMobileMenuOpen(false)} aria-label="Κλείσιμο μενού"><X size={20} /></button>
        </div>

        <nav className="sidebar-nav" aria-label="Κύρια πλοήγηση">
          <p className="sidebar-eyebrow">Χώρος εργασίας</p>
          {availableNav.map(item => {
            const Icon = item.icon
            const badge = item.id === 'today' && todayBadge > 0 ? (todayBadge > 9 ? '9+' : todayBadge) : null
            return (
              <button key={item.id} className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`} onClick={() => changeTab(item.id)}>
                <span className="sidebar-item-icon"><Icon size={19} strokeWidth={1.8} />{badge && <em>{badge}</em>}</span>
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-profile">
            <span className="profile-avatar">{profile?.full_name?.charAt(0) || 'A'}</span>
            <span><strong>{profile?.full_name}</strong><small>{profile?.role === 'owner' ? 'Διαχειριστής' : 'Μέλος ομάδας'}</small></span>
          </div>
          <button className="sidebar-logout" onClick={() => setLogoutOpen(true)}><LogOut size={17} /> Αποσύνδεση</button>
        </div>
      </aside>

      {mobileMenuOpen && <button className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Κλείσιμο μενού" />}

      <section className="app-workspace">
        <header className="workspace-header">
          <div className="workspace-title-group">
            <button className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Άνοιγμα μενού"><Menu size={21} /></button>
            <div>
              <span className="workspace-kicker">AG Project Monitor</span>
              <h1>{activeItem.label}</h1>
              <p>{activeItem.description}</p>
            </div>
          </div>
          <div className="workspace-actions">
            <button className="header-icon-button" aria-label="Ειδοποιήσεις" onClick={() => changeTab('today')}><Bell size={18} />{todayBadge > 0 && <span />}</button>
            <div className="profile-menu-wrap">
              <button className="header-profile-button" onClick={() => setProfileOpen(v => !v)} aria-expanded={profileOpen}>
                <span className="profile-avatar">{profile?.full_name?.charAt(0) || 'A'}</span>
                <span className="header-profile-copy"><strong>{profile?.full_name}</strong><small>{profile?.role === 'owner' ? 'Διαχειριστής' : 'Μέλος ομάδας'}</small></span>
                <ChevronDown size={15} />
              </button>
              {profileOpen && (
                <div className="profile-dropdown">
                  <div><strong>{profile?.full_name}</strong><small>{session?.user?.email}</small></div>
                  <button onClick={() => { setProfileOpen(false); setLogoutOpen(true) }}><LogOut size={16} /> Αποσύνδεση</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-main workspace-main">
          {activeTab === 'today' && <TodayTab profile={profile} onBadgeCount={setTodayBadge} />}
          {activeTab === 'input' && <InputTab profile={profile} initialProject={inputProject} onOpenProjects={() => changeTab('projects')} />}
          {activeTab === 'projects' && <ProjectsTab profile={profile} onSelectProject={setSelectedProject} />}
          {activeTab === 'summary' && <MonitorTab profile={profile} onOpenToday={() => changeTab('today')} />}
        </main>
      </section>

      <nav className="tab-bar mobile-tab-bar" aria-label="Κύρια πλοήγηση">
        {availableNav.map(item => {
          const Icon = item.icon
          const badge = item.id === 'today' && todayBadge > 0 && activeTab !== 'today' ? (todayBadge > 9 ? '9+' : todayBadge) : null
          return (
            <button key={item.id} className={`tab ${activeTab === item.id ? 'active' : ''} ${item.id === 'input' ? 'mobile-primary-tab' : ''}`} onClick={() => changeTab(item.id)}>
              <div className="tab-icon-wrap"><Icon size={20} strokeWidth={1.8} />{badge && <span className="nav-badge">{badge}</span>}</div>
              <span>{item.id === 'input' ? 'Ενημέρωση' : item.label.replace('Κέντρο διαχείρισης','Κέντρο')}</span>
            </button>
          )
        })}
      </nav>

      {logoutOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setLogoutOpen(false)}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title" onMouseDown={e => e.stopPropagation()}>
            <div className="confirm-dialog-icon"><LogOut size={22} /></div>
            <h2 id="logout-title">Αποσύνδεση από το AG Project;</h2>
            <p>Θα χρειαστεί να συνδεθείτε ξανά για να συνεχίσετε.</p>
            <div className="confirm-dialog-actions">
              <button className="action-btn" onClick={() => setLogoutOpen(false)}>Ακύρωση</button>
              <button className="action-btn primary" onClick={handleLogout}>Αποσύνδεση</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
