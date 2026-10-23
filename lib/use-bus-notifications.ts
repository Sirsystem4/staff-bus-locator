'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getBuses } from '@/app/actions/buses'
import { type Bus } from '@/lib/buses'
import { supabase } from '@/lib/supabase/client'
import {
  broadcastBusNotification,
  diffBuses,
  playNotificationChime,
  shouldShowEvent,
  type BusNotificationItem,
} from '@/lib/bus-events'

const BROADCAST_CHANNEL_NAME = 'staff_bus_tracker_events'
const SUPABASE_CHANNEL_NAME = 'bus-tracker-realtime'

export function useBusLiveNotifications({
  buses,
  onBusesUpdated,
}: {
  buses: Bus[]
  onBusesUpdated: (freshBuses: Bus[]) => void
}) {
  const [toasts, setToasts] = useState<BusNotificationItem[]>([])
  const [history, setHistory] = useState<BusNotificationItem[]>([])
  const busesRef = useRef<Bus[]>(buses)

  // Keep busesRef in sync with latest buses
  useEffect(() => {
    busesRef.current = buses
  }, [buses])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const pushNotification = useCallback(
    (item: BusNotificationItem, broadcast = false) => {
      if (!shouldShowEvent(item)) return

      setToasts((prev) => [item, ...prev.slice(0, 4)])
      setHistory((prev) => [item, ...prev.slice(0, 49)])

      try {
        const soundPref = localStorage.getItem('staff_bus_notifications_sound')
        if (soundPref !== 'false') {
          playNotificationChime()
        }
      } catch {}

      if (broadcast) {
        broadcastBusNotification(item)
      }
    },
    [],
  )

  // Real-time synchronization
  useEffect(() => {
    let isSubscribed = true

    // 1. Local cross-tab BroadcastChannel listener
    let localChannel: BroadcastChannel | null = null
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        localChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
        localChannel.onmessage = async (event) => {
          if (!isSubscribed) return
          const item = event.data as BusNotificationItem
          if (item && item.id) {
            pushNotification(item, false)
            try {
              const fresh = await getBuses()
              if (isSubscribed && Array.isArray(fresh)) {
                onBusesUpdated(fresh)
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('BroadcastChannel setup error:', e)
    }

    // 2. Supabase Realtime channel with both postgres_changes and broadcast
    const realtimeChannel = supabase
      .channel(SUPABASE_CHANNEL_NAME)
      .on(
        'broadcast',
        { event: 'bus_notification' },
        async ({ payload }: { payload: BusNotificationItem }) => {
          if (!isSubscribed || !payload) return
          pushNotification(payload, false)
          try {
            const fresh = await getBuses()
            if (isSubscribed && Array.isArray(fresh)) {
              onBusesUpdated(fresh)
            }
          } catch {}
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buses' },
        async () => {
          if (!isSubscribed) return
          try {
            const fresh = await getBuses()
            if (!isSubscribed || !Array.isArray(fresh)) return

            // Diff against current buses snapshot
            const diffs = diffBuses(busesRef.current, fresh)
            for (const diff of diffs) {
              pushNotification(diff, false)
            }

            onBusesUpdated(fresh)
          } catch (err) {
            console.warn('Realtime sync handler error:', err)
          }
        },
      )
      .subscribe()

    // 3. Fallback periodic sync when tab is visible (every 7 seconds)
    const interval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (!isSubscribed) return

      try {
        const fresh = await getBuses()
        if (!isSubscribed || !Array.isArray(fresh)) return

        const diffs = diffBuses(busesRef.current, fresh)
        if (diffs.length > 0) {
          for (const diff of diffs) {
            pushNotification(diff, false)
          }
          onBusesUpdated(fresh)
        }
      } catch {}
    }, 7000)

    return () => {
      isSubscribed = false
      clearInterval(interval)
      if (localChannel) {
        try {
          localChannel.close()
        } catch {}
      }
      try {
        supabase.removeChannel(realtimeChannel)
      } catch {}
    }
  }, [onBusesUpdated, pushNotification])

  return {
    toasts,
    history,
    dismissToast,
    clearHistory,
    pushNotification,
  }
}
