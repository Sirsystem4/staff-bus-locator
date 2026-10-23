import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getSupabaseServerClient } from './supabase/server'

export interface StoredPushSubscription {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
  createdAt?: string
}

const DATA_DIR = path.join(process.cwd(), 'data')
const DATA_FILE = path.join(DATA_DIR, 'push-subscriptions.json')

async function ensureDataFile(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    try {
      await fs.access(DATA_FILE)
    } catch {
      await fs.writeFile(DATA_FILE, '[]\n', 'utf8')
    }
  } catch (err) {
    console.warn('Failed to ensure push subscriptions data directory:', err)
  }
}

async function readLocalSubscriptions(): Promise<StoredPushSubscription[]> {
  try {
    await ensureDataFile()
    const raw = await fs.readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (sub): sub is StoredPushSubscription =>
        Boolean(sub && typeof sub.endpoint === 'string' && sub.keys && sub.keys.p256dh && sub.keys.auth),
    )
  } catch {
    return []
  }
}

async function writeLocalSubscriptions(subs: StoredPushSubscription[]): Promise<void> {
  try {
    await ensureDataFile()
    const tempFile = `${DATA_FILE}.${process.pid}.tmp`
    await fs.writeFile(tempFile, `${JSON.stringify(subs, null, 2)}\n`, 'utf8')
    try {
      await fs.rename(tempFile, DATA_FILE)
    } catch {
      await fs.copyFile(tempFile, DATA_FILE)
      await fs.rm(tempFile, { force: true })
    }
  } catch (err) {
    console.warn('Failed to write local push subscriptions backup:', err)
  }
}

export async function readSubscriptions(): Promise<StoredPushSubscription[]> {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.from('push_subscriptions' as any).select('*')

    if (!error && Array.isArray(data) && data.length > 0) {
      const subs = data.map((row: any) => ({
        endpoint: row.endpoint,
        expirationTime: row.expiration_time,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
        createdAt: row.created_at,
      }))
      // Sync local file backup
      writeLocalSubscriptions(subs).catch(() => {})
      return subs
    }
  } catch {
    // Supabase table does not exist or network unavailable; use local file
  }

  return readLocalSubscriptions()
}

export async function saveSubscription(subscription: StoredPushSubscription): Promise<void> {
  const all = await readLocalSubscriptions()
  const filtered = all.filter((s) => s.endpoint !== subscription.endpoint)
  const updated: StoredPushSubscription = {
    ...subscription,
    createdAt: subscription.createdAt || new Date().toISOString(),
  }
  const next = [...filtered, updated]

  // Persist locally
  await writeLocalSubscriptions(next)

  // Persist to Supabase if table is configured
  try {
    const supabase = getSupabaseServerClient()
    await supabase.from('push_subscriptions' as any).upsert(
      {
        endpoint: subscription.endpoint,
        expiration_time: subscription.expirationTime ?? null,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
  } catch (err) {
    // Fallback is already saved locally
  }
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const all = await readLocalSubscriptions()
  const next = all.filter((s) => s.endpoint !== endpoint)
  await writeLocalSubscriptions(next)

  try {
    const supabase = getSupabaseServerClient()
    await supabase.from('push_subscriptions' as any).delete().eq('endpoint', endpoint)
  } catch {
    // Graceful fallback
  }
}

export async function removeSubscriptions(endpoints: string[]): Promise<void> {
  if (!endpoints.length) return
  const all = await readLocalSubscriptions()
  const set = new Set(endpoints)
  const next = all.filter((s) => !set.has(s.endpoint))
  await writeLocalSubscriptions(next)

  try {
    const supabase = getSupabaseServerClient()
    await supabase.from('push_subscriptions' as any).delete().in('endpoint', endpoints)
  } catch {
    // Graceful fallback
  }
}
