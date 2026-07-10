import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { Home, FolderOpen, Mic, BarChart3, LogOut, ChevronDown } from 'lucide-react'
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="ag-logo">AG</div>
          <h1>Project</h1>
        </div>
        {profile && (
          <span className="user-badge" onClick={async () => {
            if (confirm('Αποσύνδεση;')) {
              await supabase.auth.signOut()
              setSession(null)
              setProfile(null)
            }
          }} style={{ cursor: 'pointer' }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
              {profile.full_name?.charAt(0)}
            </span>
            {profile.full_name}
            <ChevronDown size={14} strokeWidth={1.8} style={{ opacity: 0.5 }} />
          </span>
        )}
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
          <div className="tab-icon-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
            <Home size={20} strokeWidth={1.8} />
            {todayBadge > 0 && activeTab !== 'today' && <span className="nav-badge">{todayBadge > 9 ? '9+' : todayBadge}</span>}
          </div>
          <span>Σήμερα</span>
        </button>
        <button
          className={`tab ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          <div className="tab-icon-wrap">
            <FolderOpen size={20} strokeWidth={1.8} />
          </div>
          <span>Έργα</span>
        </button>
        <button
          className={`tab ${activeTab === 'input' ? 'active' : ''}`}
          onClick={() => setActiveTab('input')}
        >
          <div className="tab-icon-wrap">
            <Mic size={20} strokeWidth={1.8} />
          </div>
          <span>Εισαγωγή</span>
        </button>
        {profile?.role === 'owner' && (
          <button
            className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            <div className="tab-icon-wrap">
              <BarChart3 size={20} strokeWidth={1.8} />
            </div>
            <span>Κέντρο</span>
          </button>
        )}
      </nav>
    </div>
  )
}
