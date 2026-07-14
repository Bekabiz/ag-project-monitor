import { useState } from 'react'
import { Building2, ClipboardCheck, LogIn, Mic, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ButtonSpinner, InlineNotice } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(event) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (loginError) setError('Το email ή ο κωδικός δεν είναι σωστός. Δοκιμάστε ξανά.')
    setLoading(false)
  }

  return (
    <main className="login-screen">
      <section className="login-brand-panel" aria-label="AG Project Monitor">
        <div className="login-brand-mark">
          <div className="login-logo" aria-hidden="true">AG</div>
          <div><strong>AG Project</strong><span>Χώρος διαχείρισης τεχνικών έργων</span></div>
        </div>

        <div className="login-brand-copy">
          <div className="eyebrow">Project intelligence for the construction office</div>
          <h1>Όλη η πορεία κάθε έργου, σε ένα καθαρό σημείο.</h1>
          <p>Εργασίες, αποφάσεις, φωτογραφίες και ενημερώσεις οργανωμένες ώστε η ομάδα να γνωρίζει τι έγινε, τι εκκρεμεί και τι χρειάζεται προσοχή.</p>
        </div>

        <div className="login-benefits" aria-label="Βασικές δυνατότητες">
          <div className="login-benefit"><Building2 size={19} strokeWidth={1.7} aria-hidden="true" /><strong>Έλεγχος έργων</strong><span>Καθαρή εικόνα προόδου, προβλημάτων και επόμενων ενεργειών.</span></div>
          <div className="login-benefit"><ClipboardCheck size={19} strokeWidth={1.7} aria-hidden="true" /><strong>Οργάνωση ομάδας</strong><span>Αναθέσεις, προθεσμίες και αξιολόγηση εργασιών χωρίς χαμένη πληροφορία.</span></div>
          <div className="login-benefit"><Mic size={19} strokeWidth={1.7} aria-hidden="true" /><strong>Γρήγορη ενημέρωση</strong><span>Φωνή, κείμενο, φωτογραφίες και έγγραφα από γραφείο ή εργοτάξιο.</span></div>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-card">
          <div className="login-card-heading">
            <div className="mobile-brand" aria-hidden="true">
              <div className="login-logo">AG</div>
              <div className="login-brand-mark-copy"><strong>AG Project</strong><span>Project Monitor</span></div>
            </div>
            <h1 className="login-title">Καλώς ήρθατε</h1>
            <p className="login-subtitle">Συνδεθείτε στον χώρο εργασίας του γραφείου.</p>
          </div>

          <form className="login-form" onSubmit={handleLogin} noValidate>
            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <input id="login-email" type="email" inputMode="email" placeholder="name@company.gr" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" autoFocus required />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Κωδικός πρόσβασης</label>
              <input id="login-password" type="password" placeholder="Εισαγωγή κωδικού" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required />
            </div>
            {error && <InlineNotice tone="danger">{error}</InlineNotice>}
            <button type="submit" disabled={loading || !email.trim() || !password}>
              {loading ? <ButtonSpinner label="Σύνδεση…" /> : <><LogIn size={17} strokeWidth={1.8} aria-hidden="true" /> Σύνδεση</>}
            </button>
          </form>

          <p className="login-security-note"><ShieldCheck size={14} strokeWidth={1.7} aria-hidden="true" /> Πρόσβαση μόνο για εξουσιοδοτημένα μέλη της ομάδας.</p>
        </div>
      </section>
    </main>
  )
}
