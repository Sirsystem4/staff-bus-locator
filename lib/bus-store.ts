import { promises as fs } from 'node:fs'
import path from 'node:path'

import { MAX_POSITIONS_PER_ZONE } from './layout'
import { SEED_BUSES, type Bus } from './buses'
import { getSupabaseServerClient } from './supabase/server'

/**
 * Server-only. Buses live in Supabase Postgres database.
 * Changes persist to Supabase, with local cache for offline resilience.
 */

const DATA_DIR = path.join(process.cwd(), 'data')
const DATA_FILE = path.join(DATA_DIR, 'buses.json')

const serialise = (buses: Bus[]) => `${JSON.stringify([...buses].sort((a, b) => a.number - b.number), null, 2)}\n`

const normalise = (raw: unknown): Bus | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.number !== 'number' || !Number.isInteger(record.number)) return null
  if (typeof record.route !== 'string') return null

  const zone = typeof record.zone === 'string' && record.zone.trim() ? record.zone.trim() : null
  const position =
    typeof record.position === 'number' &&
    Number.isInteger(record.position) &&
    record.position >= 1 &&
    record.position <= MAX_POSITIONS_PER_ZONE
      ? record.position
      : null

  return { number: record.number, route: record.route, zone, position }
}

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

async function writeLocalBusesBackup(buses: Bus[]): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const temporary = `${DATA_FILE}.${process.pid}.tmp`
    await fs.writeFile(temporary, serialise(buses), 'utf8')
    await replaceFile(temporary, DATA_FILE)
  } catch (error) {
    console.warn('Failed to write local buses backup:', error)
  }
}

async function readLocalBusesFallback(): Promise<Bus[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return SEED_BUSES
    const buses: Bus[] = []
    for (const record of parsed) {
      const bus = normalise(record)
      if (bus) buses.push(bus)
    }
    return buses.sort((a, b) => a.number - b.number)
  } catch {
    return SEED_BUSES
  }
}

export async function writeBuses(buses: Bus[]): Promise<void> {
  const supabase = getSupabaseServerClient()
  const payload = buses.map((b) => ({
    number: b.number,
    route: b.route.trim(),
    zone: b.zone,
    position: b.position,
    updated_at: new Date().toISOString(),
  }))

  try {
    if (payload.length > 0) {
      const { error: upsertError } = await supabase.from('buses').upsert(payload, { onConflict: 'number' })
      if (upsertError) {
        console.error('Supabase writeBuses error:', upsertError)
        throw upsertError
      }
      const numbers = buses.map((b) => b.number)
      await supabase.from('buses').delete().not('number', 'in', `(${numbers.join(',')})`)
    } else {
      await supabase.from('buses').delete().neq('number', -1)
    }
    await writeLocalBusesBackup(buses)
  } catch (err) {
    console.warn('Supabase writeBuses failed, updating local backup:', err)
    await writeLocalBusesBackup(buses)
  }
}

export async function readBuses(): Promise<Bus[]> {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('buses')
      .select('number, route, zone, position')
      .order('number', { ascending: true })

    if (error) {
      console.warn('Supabase readBuses error, falling back to local file:', error.message)
      return readLocalBusesFallback()
    }

    if (!data || data.length === 0) {
      // Initialize with seed buses if empty
      await writeBuses(SEED_BUSES)
      return [...SEED_BUSES].sort((a, b) => a.number - b.number)
    }

    const buses: Bus[] = data.map((row) => ({
      number: row.number,
      route: row.route,
      zone: row.zone,
      position: row.position,
    }))

    // Keep local backup synchronized
    writeLocalBusesBackup(buses).catch(() => {})
    return buses
  } catch (err) {
    console.warn('Supabase connection failed, falling back to local file:', err)
    return readLocalBusesFallback()
  }
}
