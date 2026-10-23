'use server'

import { readBuses, writeBuses } from '@/lib/bus-store'
import { readLayout } from '@/lib/layout-store'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sendPushToAll } from '@/lib/push-service'
import {
  busAtPosition,
  nextBusNumber,
  pad2,
  validateBus,
  validateLocation,
  type Bus,
  type BusDraft,
  type LocationDraft,
} from '@/lib/buses'

export type BusActionResult = { ok: true; buses: Bus[] } | { ok: false; error: string }

const fail = (error: string): BusActionResult => ({ ok: false, error })
const numbersOf = (buses: Bus[]) => buses.map((bus) => bus.number)

/** Super admin: register a bus. It starts unparked until a transport admin places it. */
export async function createBus(draft: BusDraft): Promise<BusActionResult> {
  const buses = await readBuses()
  const error = validateBus(draft, numbersOf(buses))
  if (error) return fail(error)

  const supabase = getSupabaseServerClient()
  const { error: dbError } = await supabase.from('buses').insert({
    number: draft.number,
    route: draft.route.trim(),
    zone: null,
    position: null,
  })

  // Dispatch background push notification
  sendPushToAll({
    title: `New Bus Added · Bus ${pad2(draft.number)}`,
    body: `Bus ${pad2(draft.number)} (${draft.route.trim()}) was added to the register.`,
    url: '/',
    busNumber: draft.number,
  }).catch((err) => console.warn('Push delivery error in createBus:', err))

  if (dbError) {
    console.warn('Direct Supabase insert failed, using writeBuses fallback:', dbError.message)
    const next = [...buses, { number: draft.number, route: draft.route.trim(), zone: null, position: null }].sort(
      (a, b) => a.number - b.number,
    )
    await writeBuses(next)
    return { ok: true, buses: next }
  }

  const updated = await readBuses()
  return { ok: true, buses: updated }
}

/** Super admin: correct a route name. Location stays owned by the transport admins. */
export async function updateBusRoute(draft: BusDraft): Promise<BusActionResult> {
  const buses = await readBuses()
  if (!buses.some((bus) => bus.number === draft.number)) {
    return fail(`Bus ${pad2(draft.number)} no longer exists.`)
  }
  const error = validateBus(draft, numbersOf(buses.filter((bus) => bus.number !== draft.number)))
  if (error) return fail(error)

  const supabase = getSupabaseServerClient()
  const { error: dbError } = await supabase
    .from('buses')
    .update({ route: draft.route.trim(), updated_at: new Date().toISOString() })
    .eq('number', draft.number)

  // Dispatch background push notification
  sendPushToAll({
    title: `Bus Route Updated · Bus ${pad2(draft.number)}`,
    body: `Bus ${pad2(draft.number)} route was updated to "${draft.route.trim()}".`,
    url: '/',
    busNumber: draft.number,
  }).catch((err) => console.warn('Push delivery error in updateBusRoute:', err))

  if (dbError) {
    console.warn('Direct Supabase update failed, using writeBuses fallback:', dbError.message)
    const next = buses.map((bus) =>
      bus.number === draft.number ? { ...bus, route: draft.route.trim() } : bus,
    )
    await writeBuses(next)
    return { ok: true, buses: next }
  }

  const updated = await readBuses()
  return { ok: true, buses: updated }
}

export async function deleteBus(number: number): Promise<BusActionResult> {
  const buses = await readBuses()
  const busToRemove = buses.find((bus) => bus.number === number)
  if (!busToRemove) {
    return fail(`Bus ${pad2(number)} no longer exists.`)
  }

  const supabase = getSupabaseServerClient()
  const { error: dbError } = await supabase.from('buses').delete().eq('number', number)

  // Dispatch background push notification
  sendPushToAll({
    title: `Bus ${pad2(number)} Removed`,
    body: `Bus ${pad2(number)} (${busToRemove.route}) was removed from the bus register.`,
    url: '/',
    busNumber: number,
  }).catch((err) => console.warn('Push delivery error in deleteBus:', err))

  if (dbError) {
    console.warn('Direct Supabase delete failed, using writeBuses fallback:', dbError.message)
    const next = buses.filter((bus) => bus.number !== number)
    await writeBuses(next)
    return { ok: true, buses: next }
  }

  const updated = await readBuses()
  return { ok: true, buses: updated }
}

/** Transport admin: park, move or unpark a bus. */
export async function moveBus(number: number, location: LocationDraft | null): Promise<BusActionResult> {
  const buses = await readBuses()
  const existingBus = buses.find((bus) => bus.number === number)
  if (!existingBus) {
    return fail(`Bus ${pad2(number)} no longer exists.`)
  }
  if (location) {
    const error = validateLocation(location, await readLayout())
    if (error) return fail(error)

    // A position can only be occupied by a single bus in the same zone.
    const conflict = busAtPosition(buses, location.zone, location.position, number)
    if (conflict) {
      return fail(
        `Position ${pad2(location.position)} in Zone ${location.zone} is already taken by Bus ${pad2(conflict.number)}.`,
      )
    }
  }

  const supabase = getSupabaseServerClient()
  const { error: dbError } = await supabase
    .from('buses')
    .update({
      zone: location ? location.zone : null,
      position: location ? location.position : null,
      updated_at: new Date().toISOString(),
    })
    .eq('number', number)

  // Dispatch real background Web Push notification
  const busRoute = existingBus.route ? ` (${existingBus.route})` : ''
  if (location) {
    const isRelocated = Boolean(existingBus.zone && existingBus.position)
    const title = isRelocated ? `Bus ${pad2(number)} Moved` : `Bus ${pad2(number)} Parked`
    const body =
      isRelocated && existingBus.zone && existingBus.position
        ? `Bus ${pad2(number)}${busRoute} moved to Zone ${location.zone} · Bay ${pad2(location.position)} (was Zone ${existingBus.zone} · Bay ${pad2(existingBus.position)}).`
        : `Bus ${pad2(number)}${busRoute} is parked at Zone ${location.zone} · Bay ${pad2(location.position)}.`

    sendPushToAll({
      title,
      body,
      url: '/',
      busNumber: number,
      tag: `bus-location-${number}`,
    }).catch((err) => console.warn('Push delivery error in moveBus:', err))
  } else {
    sendPushToAll({
      title: `Bus ${pad2(number)} Unparked`,
      body: `Bus ${pad2(number)}${busRoute} has left its bay and is no longer parked.`,
      url: '/',
      busNumber: number,
      tag: `bus-location-${number}`,
    }).catch((err) => console.warn('Push delivery error in moveBus unpark:', err))
  }

  if (dbError) {
    console.warn('Direct Supabase moveBus failed, using writeBuses fallback:', dbError.message)
    const next = buses.map((bus) =>
      bus.number === number
        ? { ...bus, zone: location ? location.zone : null, position: location ? location.position : null }
        : bus,
    )
    await writeBuses(next)
    return { ok: true, buses: next }
  }

  const updated = await readBuses()
  return { ok: true, buses: updated }
}

export async function getBuses(): Promise<Bus[]> {
  return readBuses()
}

export async function getSuggestedBusNumber(): Promise<number> {
  return nextBusNumber(await readBuses())
}
