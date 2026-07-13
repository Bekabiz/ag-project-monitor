import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://elanqwsguvlnstjzfpmv.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsYW5xd3NndXZsbnN0anpmcG12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNTY2ODcsImV4cCI6MjA5NjczMjY4N30.t0hPmuJCagKEaXn-qQ1mnX4lJIi7POyiAS9rEs86i8I'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
