import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import InputTab from './pages/InputTab'
import ProjectsTab from './pages/ProjectsTab'
import SummaryTab from './pages/SummaryTab'
import ProjectDetail from './pages/ProjectDetail'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('projects')
  const [selectedProject, setSelectedProject] = useState(null)

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
        <h1>AG Project</h1>
        {profile && <span className="user-badge">{profile.full_name}</span>}
      </header>

      <main className="app-main">
        {activeTab === 'input' && <InputTab profile={profile} />}
        {activeTab === 'projects' && (
          <ProjectsTab profile={profile} onSelectProject={setSelectedProject} />
        )}
        {activeTab === 'summary' && <SummaryTab profile={profile} />}
      </main>

      <nav className="tab-bar">
        <button 
          className={`tab ${activeTab === 'input' ? 'active' : ''}`}
          onClick={() => setActiveTab('input')}
        >
          <svg className="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Εισαγωγή</span>
        </button>
        <button 
          className={`tab ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          <svg className="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          <span>Έργα</span>
        </button>
        {profile?.role === 'owner' && (
          <button 
            className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            <svg className="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="14" width="4" height="6" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="16" rx="1"/></svg>
            <span>Σύνοψη</span>
          </button>
        )}
      </nav>
    </div>
  )
}
