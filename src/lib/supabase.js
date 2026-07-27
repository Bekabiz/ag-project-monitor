import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hnppkypreyywouwqydvv.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhucHBreXByZXl5d291d3F5ZHZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMjg5OTUsImV4cCI6MjEwMDcwNDk5NX0.z92QuULquDvygVpZ-nsCIILkTSB6M6A9pTU14_KZ33M'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
