import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import TodayTab from './pages/TodayTab'
import InputTab from './pages/InputTab'
import ProjectsTab from './pages/ProjectsTab'
import MonitorTab from './pages/MonitorTab'
import ProjectDetail from './pages/ProjectDetail'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('today')
  const [selectedProject, setSelectedProject] = useState(null)
  const [todayBadge, setTodayBadge] = useState(0)

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
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>AG Project</p></div>
  if (!session) return <Login />

  // If viewing a specific project
  if (selectedProject) {
    return <ProjectDetail 
      project={selectedProject} 
      profile={profile}
      onBack={() => setSelectedProject(null)} 
    />
  }

  return (
    <div className="app">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="ag-logo">AG</div>
          <h1>Project</h1>
        </div>
        {profile && <span className="user-badge" onClick={async () => {
          if (confirm('Αποσύνδεση;')) {
            await supabase.auth.signOut()
            setSession(null)
            setProfile(null)
          }
        }} style={{ cursor: 'pointer' }}>{profile.full_name}</span>}
      </header>

      <main className="app-main">
        {activeTab === 'today' && <TodayTab profile={profile} onBadgeCount={setTodayBadge} />}
        {activeTab === 'input' && <InputTab profile={profile} />}
        {activeTab === 'projects' && (
          <ProjectsTab profile={profile} onSelectProject={setSelectedProject} />
        )}
        {activeTab === 'summary' && <MonitorTab profile={profile} />}
      </main>

      <nav className="tab-bar">
        <button 
          className={`tab ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => { setActiveTab('today'); setTodayBadge(0) }}
        >
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <svg className="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {todayBadge > 0 && activeTab !== 'today' && <span className="nav-badge">{todayBadge > 9 ? '9+' : todayBadge}</span>}
          </div>
          <span>Σήμερα</span>
        </button>
        <button 
          className={`tab ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          <svg className="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          <span>Έργα</span>
        </button>
        <button 
          className={`tab ${activeTab === 'input' ? 'active' : ''}`}
          onClick={() => setActiveTab('input')}
        >
          <svg className="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Εισαγωγή</span>
        </button>
        {profile?.role === 'owner' && (
          <button 
            className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            <svg className="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Κέντρο</span>
          </button>
        )}
      </nav>
    </div>
  )
}
