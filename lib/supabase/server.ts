import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qiqxunyhyaxavmoiinuj.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpcXh1bnloeWF4YXZtb2lpbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MzU1NDYsImV4cCI6MjEwNjAxMTU0Nn0.1sbYOb8O3JxTY9REfUc4GYhkS9r_iCzs5YCnadxS0Kc'

export function getSupabaseServerClient() {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  })
}
