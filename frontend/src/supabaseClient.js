import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './apiBase.js'

const url = typeof SUPABASE_URL === 'string' ? SUPABASE_URL.trim() : ''
const key = typeof SUPABASE_ANON_KEY === 'string' ? SUPABASE_ANON_KEY.trim() : ''

export const supabase = url && key ? createClient(url, key) : null
console.log('Supabase URL:', SUPABASE_URL ? 'disponible' : 'FALTA (VITE_SUPABASE_URL)')
console.log(
  'Supabase KEY:',
  SUPABASE_ANON_KEY ? 'disponible' : 'FALTA (VITE_SUPABASE_ANON_KEY o VITE_SUPABASE_KEY)',
)
console.log('Supabase client:', supabase ? 'inicializado' : 'NULL')