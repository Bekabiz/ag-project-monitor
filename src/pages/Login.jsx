import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Λάθος email ή κωδικός')
    setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">AG</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: 'var(--text)' }}>AG Project</h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', margin: '0 0 28px' }}>Project Monitor</p>
        <form className="login-form" onSubmit={handleLogin}>
          <input
            type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} autoComplete="email"
          />
          <input
            type="password" placeholder="Κωδικός" value={password}
            onChange={e => setPassword(e.target.value)} autoComplete="current-password"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading || !email || !password}>
            {loading ? 'Σύνδεση...' : <><LogIn size={16} strokeWidth={1.6} style={{ marginRight: 6 }} /> Είσοδος</>}
          </button>
        </form>
      </div>
    </div>
  )
}
