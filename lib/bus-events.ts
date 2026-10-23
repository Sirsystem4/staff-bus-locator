import { pad2, type Bus } from './buses'
import { supabase } from './supabase/client'

export type BusNotificationType =
  | 'park_assigned'
  | 'park_moved'
  | 'park_cleared'
  | 'bus_created'
  | 'bus_updated'
  | 'bus_deleted'

export interface BusNotificationItem {
  id: string
  type: BusNotificationType
  role: 'transport' | 'super_admin'
  title: string
  message: string
  busNumber: number
  route: string
  zone: string | null
  position: number | null
  prevZone?: string | null
  prevPosition?: number | null
  timestamp: number
}

const BROADCAST_CHANNEL_NAME = 'staff_bus_tracker_events'
const SUPABASE_CHANNEL_NAME = 'bus-tracker-realtime'

// In-memory cache of recent event signatures to prevent duplicate popups within 5 seconds
const recentSignatures = new Map<string, number>()

function getEventSignature(item: Partial<BusNotificationItem>): string {
  return `${item.type}-${item.busNumber}-${item.route}-${item.zone ?? 'none'}-${item.position ?? 'none'}-${item.prevZone ?? 'none'}-${item.prevPosition ?? 'none'}`
}

export function shouldShowEvent(item: BusNotificationItem): boolean {
  const sig = getEventSignature(item)
  const now = Date.now()
  const lastSeen = recentSignatures.get(sig)

  if (lastSeen && now - lastSeen < 5000) {
    return false
  }

  recentSignatures.set(sig, now)

  // Prune older signatures
  if (recentSignatures.size > 100) {
    for (const [key, time] of recentSignatures.entries()) {
      if (now - time > 15000) {
        recentSignatures.delete(key)
      }
    }
  }

  return true
}

export function markEventHandled(item: BusNotificationItem) {
  const sig = getEventSignature(item)
  recentSignatures.set(sig, Date.now())
}

/**
 * Creates notification item for transport admin parking updates.
 */
export function createParkNotification(
  bus: Bus,
  prevBus?: Bus | null,
): BusNotificationItem {
  const now = Date.now()
  const busNum = pad2(bus.number)

  if (bus.zone && bus.position) {
    if (prevBus && prevBus.zone && prevBus.position) {
      return {
        id: `move-${bus.number}-${now}-${Math.random().toString(36).substring(2, 7)}`,
        type: 'park_moved',
        role: 'transport',
        title: `Bus ${busNum} Moved`,
        message: `Bus ${busNum} (${bus.route}) moved to Lane ${bus.zone} · Bay ${pad2(bus.position)} (previously Lane ${prevBus.zone} · Bay ${pad2(prevBus.position)}).`,
        busNumber: bus.number,
        route: bus.route,
        zone: bus.zone,
        position: bus.position,
        prevZone: prevBus.zone,
        prevPosition: prevBus.position,
        timestamp: now,
      }
    }

    return {
      id: `park-${bus.number}-${now}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'park_assigned',
      role: 'transport',
      title: `Bus ${busNum} Parked`,
      message: `Bus ${busNum} (${bus.route}) is parked at Lane ${bus.zone} · Bay ${pad2(bus.position)}.`,
      busNumber: bus.number,
      route: bus.route,
      zone: bus.zone,
      position: bus.position,
      timestamp: now,
    }
  }

  // Unparked
  return {
    id: `unpark-${bus.number}-${now}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'park_cleared',
    role: 'transport',
    title: `Bus ${busNum} Unparked`,
    message: `Bus ${busNum} (${bus.route}) has left ${prevBus?.zone ? `Lane ${prevBus.zone}` : 'its bay'} and is no longer parked.`,
    busNumber: bus.number,
    route: bus.route,
    zone: null,
    position: null,
    prevZone: prevBus?.zone ?? null,
    prevPosition: prevBus?.position ?? null,
    timestamp: now,
  }
}

/**
 * Creates notification for super admin adding a new bus.
 */
export function createBusAddedNotification(bus: Bus): BusNotificationItem {
  const now = Date.now()
  const busNum = pad2(bus.number)

  return {
    id: `create-${bus.number}-${now}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'bus_created',
    role: 'super_admin',
    title: `New Bus Added · Bus ${busNum}`,
    message: `Bus ${busNum} (${bus.route}) was added to the register by Super Admin.`,
    busNumber: bus.number,
    route: bus.route,
    zone: bus.zone,
    position: bus.position,
    timestamp: now,
  }
}

/**
 * Creates notification for super admin editing a bus.
 */
export function createBusEditedNotification(bus: Bus, prevBus?: Bus | null): BusNotificationItem {
  const now = Date.now()
  const busNum = pad2(bus.number)

  return {
    id: `edit-${bus.number}-${now}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'bus_updated',
    role: 'super_admin',
    title: `Bus Route Updated · Bus ${busNum}`,
    message: prevBus?.route
      ? `Bus ${busNum} route updated to "${bus.route}" (was "${prevBus.route}").`
      : `Bus ${busNum} route updated to "${bus.route}".`,
    busNumber: bus.number,
    route: bus.route,
    zone: bus.zone,
    position: bus.position,
    timestamp: now,
  }
}

/**
 * Creates notification for super admin removing a bus.
 */
export function createBusDeletedNotification(bus: Bus): BusNotificationItem {
  const now = Date.now()
  const busNum = pad2(bus.number)

  return {
    id: `delete-${bus.number}-${now}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'bus_deleted',
    role: 'super_admin',
    title: `Bus ${busNum} Removed`,
    message: `Bus ${busNum} (${bus.route}) was removed from the register.`,
    busNumber: bus.number,
    route: bus.route,
    zone: bus.zone,
    position: bus.position,
    timestamp: now,
  }
}

/**
 * Compares two snapshots of buses and detects any changes.
 */
export function diffBuses(prevBuses: Bus[], nextBuses: Bus[]): BusNotificationItem[] {
  if (!prevBuses || !prevBuses.length || !nextBuses || !nextBuses.length) {
    return []
  }

  const events: BusNotificationItem[] = []
  const prevMap = new Map<number, Bus>()
  for (const b of prevBuses) {
    prevMap.set(b.number, b)
  }

  const nextMap = new Map<number, Bus>()
  for (const b of nextBuses) {
    nextMap.set(b.number, b)
  }

  // Check added or updated buses
  for (const [number, nextBus] of nextMap.entries()) {
    const prevBus = prevMap.get(number)

    if (!prevBus) {
      // Added
      const item = createBusAddedNotification(nextBus)
      if (shouldShowEvent(item)) {
        events.push(item)
      }
      continue
    }

    // Check route edit by super admin
    if (prevBus.route.trim() !== nextBus.route.trim()) {
      const item = createBusEditedNotification(nextBus, prevBus)
      if (shouldShowEvent(item)) {
        events.push(item)
      }
    }

    // Check location update by transport admin
    const locChanged = prevBus.zone !== nextBus.zone || prevBus.position !== nextBus.position
    if (locChanged) {
      const item = createParkNotification(nextBus, prevBus)
      if (shouldShowEvent(item)) {
        events.push(item)
      }
    }
  }

  // Check deleted buses
  for (const [number, prevBus] of prevMap.entries()) {
    if (!nextMap.has(number)) {
      const item = createBusDeletedNotification(prevBus)
      if (shouldShowEvent(item)) {
        events.push(item)
      }
    }
  }

  return events
}

let localBroadcastChannel: BroadcastChannel | null = null

function getLocalBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  if (!('BroadcastChannel' in window)) return null
  if (!localBroadcastChannel) {
    try {
      localBroadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    } catch {
      return null
    }
  }
  return localBroadcastChannel
}

/**
 * Broadcasts a bus notification event across all browser tabs and via Supabase realtime.
 */
export function broadcastBusNotification(item: BusNotificationItem) {
  markEventHandled(item)

  // 1. Cross-tab local broadcast
  try {
    const channel = getLocalBroadcastChannel()
    channel?.postMessage(item)
  } catch (err) {
    console.warn('Local broadcast error:', err)
  }

  // 2. Supabase Realtime broadcast channel (cross-device)
  try {
    const realtimeChannel = supabase.channel(SUPABASE_CHANNEL_NAME)
    realtimeChannel.send({
      type: 'broadcast',
      event: 'bus_notification',
      payload: item,
    }).catch((err) => {
      console.warn('Supabase broadcast send error:', err)
    })
  } catch (err) {
    console.warn('Supabase broadcast channel error:', err)
  }
}

/**
 * Plays a gentle, pleasant synthetic chime using Web Audio API.
 */
export function playNotificationChime() {
  if (typeof window === 'undefined') return
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    const ctx = new AudioContextClass()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    // Gentle melodic 2-note chime: F5 (698.46Hz) to A5 (880Hz)
    osc.frequency.setValueAtTime(698.46, now)
    osc.frequency.setValueAtTime(880, now + 0.09)

    // Soft gentle volume envelope
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.09)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.4)
  } catch {
    // Audio autoplay or permissions prevented sound; gracefully ignore
  }
}
