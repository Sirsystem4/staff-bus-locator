import { promises as fs } from 'node:fs'
import path from 'node:path'

import { SEED_LAYOUT, type Layout, type Zone } from './layout'
import { getSupabaseServerClient } from './supabase/server'

/**
 * Server-only. Car park layout (zones and positions) lives in Supabase.
 * Changes persist to Supabase, with local cache for offline resilience.
 */

const DATA_DIR = path.join(process.cwd(), 'data')
const DATA_FILE = path.join(DATA_DIR, 'layout.json')

const serialise = (layout: Layout) => `${JSON.stringify(layout, null, 2)}\n`

async function replaceFile(temporary: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(temporary, target)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const locked = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
      if (!locked || attempt >= 4) {
        if (locked) {
          await fs.copyFile(temporary, target)
          await fs.rm(temporary, { force: true })
          return
        }
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)))
    }
  }
}

const normaliseZone = (raw: unknown): Zone | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.name !== 'string' || !record.name.trim()) return null
  if (typeof record.positions !== 'number' || !Number.isInteger(record.positions) || record.positions < 1) {
    return null
  }
  return { name: record.name.trim(), positions: record.positions }
}

async function writeLocalLayoutBackup(layout: Layout): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const temporary = `${DATA_FILE}.${process.pid}.tmp`
    await fs.writeFile(temporary, serialise(layout), 'utf8')
    await replaceFile(temporary, DATA_FILE)
  } catch (error) {
    console.warn('Failed to write local layout backup:', error)
  }
}

async function readLocalLayoutFallback(): Promise<Layout> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    const rawZones = parsed && typeof parsed === 'object' && Array.isArray(parsed.zones) ? parsed.zones : null
    if (!rawZones) return SEED_LAYOUT

    const zones: Zone[] = []
    for (const candidate of rawZones) {
      const zone = normaliseZone(candidate)
      if (zone) zones.push(zone)
    }
    return zones.length > 0 ? { zones } : SEED_LAYOUT
  } catch {
    return SEED_LAYOUT
  }
}

export async function writeLayout(layout: Layout): Promise<void> {
  const supabase = getSupabaseServerClient()
  const payload = layout.zones.map((z) => ({
    name: z.name.trim(),
    positions: z.positions,
  }))

  try {
    if (payload.length > 0) {
      const { error: upsertError } = await supabase.from('zones').upsert(payload, { onConflict: 'name' })
      if (upsertError) {
        console.error('Supabase writeLayout error:', upsertError)
        throw upsertError
      }
      const names = layout.zones.map((z) => `'${z.name.replace(/'/g, "''")}'`)
      await supabase.from('zones').delete().not('name', 'in', `(${names.join(',')})`)
    }
    await writeLocalLayoutBackup(layout)
  } catch (err) {
    console.warn('Supabase writeLayout failed, updating local backup:', err)
    await writeLocalLayoutBackup(layout)
  }
}

export async function readLayout(): Promise<Layout> {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('zones')
      .select('name, positions')
      .order('name', { ascending: true })

    if (error) {
      console.warn('Supabase readLayout error, falling back to local file:', error.message)
      return readLocalLayoutFallback()
    }

    if (!data || data.length === 0) {
      await writeLayout(SEED_LAYOUT)
      return structuredClone(SEED_LAYOUT)
    }

    const zones: Zone[] = data.map((row) => ({
      name: row.name,
      positions: row.positions,
    }))

    const layout: Layout = { zones }
    writeLocalLayoutBackup(layout).catch(() => {})
    return layout
  } catch (err) {
    console.warn('Supabase connection failed, falling back to local file:', err)
    return readLocalLayoutFallback()
  }
}
