'use server'

import { readBuses, writeBuses } from '@/lib/bus-store'
import { readLayout, writeLayout } from '@/lib/layout-store'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  validateZone,
  zoneNames,
  type Layout,
  type Zone,
} from '@/lib/layout'
import type { Bus } from '@/lib/buses'

export type LayoutActionResult =
  | { ok: true; layout: Layout; buses: Bus[]; affected: number }
  | { ok: false; error: string }

const fail = (error: string): LayoutActionResult => ({ ok: false, error })

const check = (draft: Zone, layout: Layout, editing: string | null): string | null =>
  validateZone(draft, zoneNames(layout).filter((name) => name !== editing))

export async function addZone(draft: Zone): Promise<LayoutActionResult> {
  const layout = await readLayout()
  const error = check(draft, layout, null)
  if (error) return fail(error)

  const supabase = getSupabaseServerClient()
  const { error: dbError } = await supabase.from('zones').insert({
    name: draft.name.trim(),
    positions: draft.positions,
  })

  if (dbError) {
    console.warn('Direct Supabase addZone failed, using writeLayout fallback:', dbError.message)
    const next: Layout = { zones: [...layout.zones, { name: draft.name.trim(), positions: draft.positions }] }
    await writeLayout(next)
    const buses = await readBuses()
    return { ok: true, layout: next, buses, affected: 0 }
  }

  const [updatedLayout, buses] = await Promise.all([readLayout(), readBuses()])
  return { ok: true, layout: updatedLayout, buses, affected: 0 }
}

/**
 * Renaming a zone cascades to buses parked there, and shrinking it un-parks any bus
 * left beyond the new last position. Both are reported back so the UI can say so.
 */
export async function updateZone(previousName: string, draft: Zone): Promise<LayoutActionResult> {
  const layout = await readLayout()
  if (!layout.zones.some((zone) => zone.name === previousName)) {
    return fail(`Zone "${previousName}" no longer exists.`)
  }
  const error = check(draft, layout, previousName)
  if (error) return fail(error)

  const supabase = getSupabaseServerClient()
  const busesBefore = await readBuses()

  // 1. Update the zone in Supabase. FK ON UPDATE CASCADE will update buses.zone automatically if renamed.
  const { error: dbError } = await supabase
    .from('zones')
    .update({ name: draft.name.trim(), positions: draft.positions })
    .eq('name', previousName)

  if (dbError) {
    console.warn('Direct Supabase updateZone failed, using local settle fallback:', dbError.message)
    const next: Layout = {
      zones: layout.zones.map((zone) =>
        zone.name === previousName ? { name: draft.name.trim(), positions: draft.positions } : zone,
      ),
    }

    const updated = busesBefore.map((bus) => {
      if (bus.zone !== previousName) return bus
      if (bus.position !== null && bus.position > draft.positions) {
        return { ...bus, zone: null, position: null }
      }
      return { ...bus, zone: draft.name.trim() }
    })

    const affected = updated.filter((bus, index) => {
      const before = busesBefore[index]
      return before.zone !== bus.zone || before.position !== bus.position
    }).length

    await writeBuses(updated)
    await writeLayout(next)
    return { ok: true, layout: next, buses: updated, affected }
  }

  // 2. Unpark any bus left beyond the new position limit
  await supabase
    .from('buses')
    .update({ zone: null, position: null, updated_at: new Date().toISOString() })
    .eq('zone', draft.name.trim())
    .gt('position', draft.positions)

  const [updatedLayout, updatedBuses] = await Promise.all([readLayout(), readBuses()])

  const affected = updatedBuses.filter((bus) => {
    const before = busesBefore.find((b) => b.number === bus.number)
    if (!before) return false
    return before.zone !== bus.zone || before.position !== bus.position
  }).length

  return { ok: true, layout: updatedLayout, buses: updatedBuses, affected }
}

/** Removing a zone un-parks every bus that was in it rather than leaving dangling references. */
export async function deleteZone(name: string): Promise<LayoutActionResult> {
  const layout = await readLayout()
  if (layout.zones.length <= 1) {
    return fail('A car park needs at least one zone, so the last zone cannot be removed.')
  }
  if (!layout.zones.some((zone) => zone.name === name)) {
    return fail(`Zone "${name}" no longer exists.`)
  }

  const supabase = getSupabaseServerClient()
  const busesBefore = await readBuses()
  const affected = busesBefore.filter((b) => b.zone === name).length

  // 1. Unpark buses in the deleted zone
  const { error: unparkError } = await supabase
    .from('buses')
    .update({ zone: null, position: null, updated_at: new Date().toISOString() })
    .eq('zone', name)

  // 2. Delete zone
  const { error: deleteError } = await supabase.from('zones').delete().eq('name', name)

  if (unparkError || deleteError) {
    console.warn('Direct Supabase deleteZone failed, using fallback:', unparkError || deleteError)
    const next: Layout = { zones: layout.zones.filter((zone) => zone.name !== name) }
    const updated = busesBefore.map((bus) => (bus.zone === name ? { ...bus, zone: null, position: null } : bus))
    await writeBuses(updated)
    await writeLayout(next)
    return { ok: true, layout: next, buses: updated, affected }
  }

  const [updatedLayout, updatedBuses] = await Promise.all([readLayout(), readBuses()])
  return { ok: true, layout: updatedLayout, buses: updatedBuses, affected }
}

export async function getLayout(): Promise<Layout> {
  return readLayout()
}
