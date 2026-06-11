import { useState } from 'react'
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
      <h1>AG Project</h1>
      <p>Project Monitor</p>
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
          {loading ? 'Σύνδεση...' : 'Είσοδος'}
        </button>
      </form>
    </div>
  )
}
