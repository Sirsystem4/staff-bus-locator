import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qiqxunyhyaxavmoiinuj.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpcXh1bnloeWF4YXZtb2lpbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MzU1NDYsImV4cCI6MjEwNjAxMTU0Nn0.1sbYOb8O3JxTY9REfUc4GYhkS9r_iCzs5YCnadxS0Kc'

// In-memory fallback to prevent SecurityError exceptions on iOS Safari (Private Browsing / strict cookie policies)
class MemoryStorage {
  private store: Record<string, string> = {}
  getItem(key: string): string | null {
    return this.store[key] ?? null
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value)
  }
  removeItem(key: string): void {
    delete this.store[key]
  }
}

const getSafeStorage = () => {
  if (typeof window === 'undefined') return undefined
  try {
    const testKey = '__sb_test__'
    window.localStorage.setItem(testKey, testKey)
    window.localStorage.removeItem(testKey)
    return window.localStorage
  } catch {
    return new MemoryStorage()
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storage: getSafeStorage(),
  },
})
