import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './apiBase.js'

const url = typeof SUPABASE_URL === 'string' ? SUPABASE_URL.trim() : ''
const key = typeof SUPABASE_ANON_KEY === 'string' ? SUPABASE_ANON_KEY.trim() : ''

export const supabase = url && key ? createClient(url, key) : null
