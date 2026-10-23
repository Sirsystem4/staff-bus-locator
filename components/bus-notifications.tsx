'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Bell,
  BusFront,
  CheckCircle2,
  Clock,
  History,
  MapPin,
  Navigation,
  Pencil,
  PlusCircle,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { pad2, type Bus } from '@/lib/buses'
import {
  playNotificationChime,
  type BusNotificationItem,
} from '@/lib/bus-events'

interface BusNotificationsProps {
  notifications: BusNotificationItem[]
  onDismiss: (id: string) => void
  onSelectBus?: (busNumber: number) => void
}

const TOAST_DURATION = 6500

export function BusNotificationToastList({
  notifications,
  onDismiss,
  onSelectBus,
}: BusNotificationsProps) {
  return (
    <div
      aria-live="polite"
      aria-label="Real-time bus updates"
      className="fixed top-4 right-4 z-50 flex max-w-sm w-full flex-col gap-3 pointer-events-none sm:top-5 sm:right-5"
    >
      {notifications.map((item) => (
        <SingleNotificationToast
          key={item.id}
          item={item}
          onDismiss={() => onDismiss(item.id)}
          onSelectBus={onSelectBus}
        />
      ))}
    </div>
  )
}

function SingleNotificationToast({
  item,
  onDismiss,
  onSelectBus,
}: {
  item: BusNotificationItem
  onDismiss: () => void
  onSelectBus?: (busNumber: number) => void
}) {
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(100)
  const startTimeRef = useRef(Date.now())
  const remainingTimeRef = useRef(TOAST_DURATION)

  useEffect(() => {
    if (isPaused) {
      remainingTimeRef.current -= Date.now() - startTimeRef.current
      return
    }

    startTimeRef.current = Date.now()
    const interval = 50

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const currentRemaining = Math.max(0, remainingTimeRef.current - elapsed)
      const pct = (currentRemaining / TOAST_DURATION) * 100
      setProgress(pct)

      if (currentRemaining <= 0) {
        clearInterval(timer)
        onDismiss()
      }
    }, interval)

    return () => clearInterval(timer)
  }, [isPaused, onDismiss])

  // Get color accents based on event type
  const isParkEvent = item.type === 'park_assigned' || item.type === 'park_moved'
  const isUnparkEvent = item.type === 'park_cleared'
  const isAddEvent = item.type === 'bus_created'
  const isEditEvent = item.type === 'bus_updated'
  const isDeleteEvent = item.type === 'bus_deleted'

  const getTheme = () => {
    if (isParkEvent) {
      return {
        badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        badgeDot: 'bg-emerald-400',
        iconBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
        progressBar: 'bg-emerald-500',
        roleLabel: 'Transport Admin · Location Update',
      }
    }
    if (isUnparkEvent) {
      return {
        badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        badgeDot: 'bg-amber-400',
        iconBg: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
        progressBar: 'bg-amber-500',
        roleLabel: 'Transport Admin · Location Cleared',
      }
    }
    if (isAddEvent) {
      return {
        badgeBg: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
        badgeDot: 'bg-blue-400',
        iconBg: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
        progressBar: 'bg-blue-500',
        roleLabel: 'Super Admin · New Bus Added',
      }
    }
    if (isEditEvent) {
      return {
        badgeBg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
        badgeDot: 'bg-indigo-400',
        iconBg: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
        progressBar: 'bg-indigo-500',
        roleLabel: 'Super Admin · Bus Details Edited',
      }
    }
    return {
      badgeBg: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      badgeDot: 'bg-rose-400',
      iconBg: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
      progressBar: 'bg-rose-500',
      roleLabel: 'Super Admin · Bus Deleted',
    }
  }

  const theme = getTheme()

  const renderIcon = () => {
    if (item.type === 'park_assigned') return <MapPin size={20} className="shrink-0" />
    if (item.type === 'park_moved') return <Navigation size={20} className="shrink-0" />
    if (item.type === 'park_cleared') return <Clock size={20} className="shrink-0" />
    if (item.type === 'bus_created') return <PlusCircle size={20} className="shrink-0" />
    if (item.type === 'bus_updated') return <Pencil size={20} className="shrink-0" />
    return <Trash2 size={20} className="shrink-0" />
  }

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="pointer-events-auto relative overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0f172a]/95 p-4 text-white shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-4"
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${theme.badgeBg}`}
        >
          <span className={`size-1.5 rounded-full animate-pulse ${theme.badgeDot}`} />
          {theme.roleLabel}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="cursor-pointer rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>

      {/* Main Content Row */}
      <div className="mt-3 flex items-start gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${theme.iconBg}`}
        >
          {renderIcon()}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
            {item.title}
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{item.message}</p>
        </div>
      </div>

      {/* Bottom Action Row */}
      <div className="mt-3.5 flex items-center justify-between border-t border-slate-800/80 pt-2.5">
        <span className="text-[11px] font-medium text-slate-400">
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>

        {onSelectBus && !isDeleteEvent && (
          <button
            type="button"
            onClick={() => {
              onSelectBus(item.busNumber)
              onDismiss()
            }}
            className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/20 active:scale-95"
          >
            <span>Locate Bus {pad2(item.busNumber)}</span>
            <ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* Animated countdown bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
        <div
          className={`h-full transition-[width] duration-75 ease-linear ${theme.progressBar}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Activity drawer button and popover for viewing recent updates from current session.
 */
export function BusActivityDrawer({
  history,
  onSelectBus,
  onClearHistory,
}: {
  history: BusNotificationItem[]
  onSelectBus?: (busNumber: number) => void
  onClearHistory?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('staff_bus_notifications_sound')
      if (stored !== null) {
        setSoundEnabled(stored === 'true')
      }
    } catch {}
  }, [])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    try {
      localStorage.setItem('staff_bus_notifications_sound', String(next))
    } catch {}
    if (next) {
      playNotificationChime()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View recent bus updates"
        title="Live car park & bus update activity"
        className="cursor-pointer relative flex items-center gap-1.5 rounded-lg border border-[#dce4ed] bg-white px-2.5 py-1.5 text-xs font-bold text-[#516176] transition hover:bg-[#f5f7fa] hover:text-[#0758a6] active:scale-95 sm:px-3 sm:py-2 sm:text-sm"
      >
        <Bell size={16} className={history.length > 0 ? 'text-[#0758a6]' : 'text-[#718096]'} />
        <span className="hidden sm:inline">Live Updates</span>
        {history.length > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-[#0758a6] text-[10px] font-extrabold text-white">
            {history.length > 9 ? '9+' : history.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17263d]/40 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#e2e8f0] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-[#e9f2fc] text-[#0758a6]">
                  <History size={19} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#17263d]">Live Update Activity</h3>
                  <p className="text-xs text-[#718095]">
                    Real-time log of transport and super admin actions
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleSound}
                  title={soundEnabled ? 'Chime sound is active' : 'Chime sound is muted'}
                  className="cursor-pointer rounded-lg p-2 text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0758a6]"
                >
                  {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="cursor-pointer rounded-lg p-2 text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#17263d]"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {history.length === 0 ? (
                <div className="py-10 text-center text-[#718095]">
                  <BusFront className="mx-auto text-[#94a3b8]" size={32} />
                  <p className="mt-3 text-sm font-bold text-[#334155]">No updates recorded yet</p>
                  <p className="mt-1 text-xs text-[#64748b]">
                    When transport admins update parking positions or super admins add/edit buses,
                    updates will pop up here live.
                  </p>
                </div>
              ) : (
                history.map((entry) => {
                  const isPark = entry.type === 'park_assigned' || entry.type === 'park_moved'
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5 transition hover:bg-[#f1f5f9]"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                            isPark
                              ? 'bg-[#dcfce7] text-[#166534]'
                              : entry.type === 'bus_created'
                              ? 'bg-[#dbeafe] text-[#1e40af]'
                              : 'bg-[#fef3c7] text-[#92400e]'
                          }`}
                        >
                          {pad2(entry.busNumber)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#17263d]">{entry.title}</span>
                            <span className="text-[10px] text-[#94a3b8]">
                              {new Date(entry.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-[#64748b]">{entry.message}</p>
                        </div>
                      </div>

                      {onSelectBus && entry.type !== 'bus_deleted' && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onSelectBus(entry.busNumber)
                          }}
                          className="cursor-pointer shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-[#0758a6] border border-[#cbd5e1] hover:bg-[#edf4fb] active:scale-95"
                        >
                          Locate
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[#e2e8f0] px-5 py-3 text-xs text-[#718095]">
              <span>Real-time sync active</span>
              {history.length > 0 && onClearHistory && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="cursor-pointer font-bold text-[#dc2626] hover:underline"
                >
                  Clear log
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
