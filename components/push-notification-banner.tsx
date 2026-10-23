'use client'

import { useEffect, useState } from 'react'
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Send,
  Smartphone,
  X,
} from 'lucide-react'
import {
  isIosDevice,
  isPushNotificationSupported,
  isStandalonePwa,
  registerServiceWorker,
  sendTestPushToCurrentDevice,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '@/lib/push-client'

export function PushNotificationBanner() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  // Initialize service worker and check permission state on mount
  useEffect(() => {
    if (!isPushNotificationSupported()) {
      setPermission('unsupported')
      setIsIos(isIosDevice())
      setIsStandalone(isStandalonePwa())
      return
    }

    setIsIos(isIosDevice())
    setIsStandalone(isStandalonePwa())
    setPermission(Notification.permission)

    registerServiceWorker().then((reg) => {
      if (reg) {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(Boolean(sub))
        })
      }
    })
  }, [])

  const handleEnable = async () => {
    setLoading(true)
    setFeedback(null)
    const result = await subscribeToPushNotifications()
    setLoading(false)

    if (result.ok) {
      setPermission('granted')
      setIsSubscribed(true)
      setFeedback({
        type: 'success',
        message: 'Push notifications enabled! You will receive live updates even when the site is closed.',
      })
    } else {
      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission)
      }
      setFeedback({
        type: 'error',
        message: result.error || 'Could not enable push notifications.',
      })
    }
  }

  const handleDisable = async () => {
    setLoading(true)
    setFeedback(null)
    await unsubscribeFromPushNotifications()
    setIsSubscribed(false)
    setLoading(false)
    setFeedback({
      type: 'success',
      message: 'Push notifications disabled for this device.',
    })
  }

  const handleSendTest = async () => {
    setTesting(true)
    setFeedback(null)
    const result = await sendTestPushToCurrentDevice()
    setTesting(false)

    setFeedback({
      type: result.ok ? 'success' : 'error',
      message: result.message,
    })
  }

  // If dismissed or unsupported non-iOS, do not render banner
  if (dismissed) return null

  // iPhone Safari outside PWA standalone mode requires Add to Home Screen for Web Push
  if (isIos && !isStandalone && permission !== 'granted') {
    return (
      <div className="relative mb-5 overflow-hidden rounded-2xl border border-sky-200 bg-sky-50 p-4 text-[#0c4a6e] shadow-xs">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-[#0758a6]">
            <Smartphone size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold">Enable Push Notifications on iPhone/iPad</h4>
            <p className="mt-1 text-xs leading-relaxed text-sky-800">
              Apple requires web apps to be installed to the Home Screen for push notifications. Tap the{' '}
              <span className="font-semibold underline">Share button</span> in Safari, then choose{' '}
              <span className="font-semibold underline">&quot;Add to Home Screen&quot;</span>. Open the app from your home screen to activate notifications!
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
            className="cursor-pointer rounded-lg p-1 text-sky-600 hover:bg-sky-100"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="relative mb-5 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[#78350f] shadow-xs">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <BellOff size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold">Push notifications are blocked in your browser</h4>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              To receive parking bay updates when you are away from this page, click the lock icon in your address bar and change Notifications to <span className="font-bold">&quot;Allow&quot;</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
            className="cursor-pointer rounded-lg p-1 text-amber-700 hover:bg-amber-100"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    )
  }

  if (permission === 'granted' && isSubscribed) {
    return (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-[#064e3b] shadow-xs">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span className="text-xs font-bold sm:text-sm">
            Push notifications are active on this device
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSendTest}
            disabled={testing}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100/50 active:scale-95 disabled:opacity-50"
          >
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            <span>{testing ? 'Sending...' : 'Send Test Notification'}</span>
          </button>
          <button
            type="button"
            onClick={handleDisable}
            disabled={loading}
            className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:underline"
          >
            Disable
          </button>
        </div>

        {feedback && (
          <div className="w-full text-xs font-semibold pt-1 text-emerald-900 border-t border-emerald-200/60 mt-1">
            {feedback.message}
          </div>
        )}
      </div>
    )
  }

  // Default state: Permission not yet granted -> prominent "Enable Notifications" prompt
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-[#0758a6]/25 bg-gradient-to-r from-[#edf4fb] to-white p-4 text-[#17263d] shadow-[0_4px_20px_rgba(7,88,166,0.06)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#0758a6] text-white shadow-md shadow-[#0758a6]/20">
            <BellRing size={22} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#17263d]">Get Live Bus Notifications</h3>
              <span className="rounded-full bg-[#0758a6]/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#0758a6]">
                Real Push
              </span>
            </div>
            <p className="mt-1 text-xs text-[#516176] max-w-xl leading-relaxed sm:text-sm">
              Never miss your shuttle! Receive operating-system alerts on your phone or PC whenever a transport admin updates a bus park position or a route changes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleEnable}
            disabled={loading}
            className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-[#0758a6] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-[#0758a6]/20 transition hover:bg-[#064984] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
            <span>{loading ? 'Enabling...' : 'Enable Notifications'}</span>
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss notification prompt"
            className="cursor-pointer rounded-xl p-2 text-[#718096] hover:bg-[#dce4ed]/40 active:scale-95"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-3 rounded-lg p-2.5 text-xs font-semibold ${
            feedback.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  )
}

/**
 * Push notification management section inside the Live Updates drawer.
 */
export function PushNotificationSettingsCard() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!isPushNotificationSupported()) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission)
    registerServiceWorker().then((reg) => {
      if (reg) {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(Boolean(sub))
        })
      }
    })
  }, [])

  const handleToggle = async () => {
    setLoading(true)
    setFeedback(null)
    if (isSubscribed) {
      await unsubscribeFromPushNotifications()
      setIsSubscribed(false)
      setFeedback({ type: 'success', message: 'Push notifications turned off.' })
    } else {
      const result = await subscribeToPushNotifications()
      if (result.ok) {
        setPermission('granted')
        setIsSubscribed(true)
        setFeedback({ type: 'success', message: 'Push notifications activated!' })
      } else {
        if (typeof Notification !== 'undefined') {
          setPermission(Notification.permission)
        }
        setFeedback({ type: 'error', message: result.error || 'Failed to enable.' })
      }
    }
    setLoading(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setFeedback(null)
    const result = await sendTestPushToCurrentDevice()
    setTesting(false)
    setFeedback({
      type: result.ok ? 'success' : 'error',
      message: result.message,
    })
  }

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4 text-[#17263d]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#e9f2fc] text-[#0758a6]">
            <Bell size={17} />
          </div>
          <div>
            <h4 className="text-xs font-bold sm:text-sm">OS Push Notifications</h4>
            <p className="text-[11px] text-[#64748b]">
              Receive alerts on lockscreen & desktop when bus spots change
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggle}
          disabled={loading || permission === 'denied' || permission === 'unsupported'}
          className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-95 disabled:opacity-50 ${
            isSubscribed
              ? 'bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]'
              : 'bg-[#0758a6] text-white hover:bg-[#064984]'
          }`}
        >
          {loading ? 'Updating...' : isSubscribed ? 'Active' : 'Enable'}
        </button>
      </div>

      {isSubscribed && (
        <div className="mt-3 flex items-center justify-between border-t border-[#e2e8f0] pt-2.5">
          <span className="text-[11px] text-[#64748b]">Test system notification:</span>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="cursor-pointer inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-bold text-[#0758a6] border border-[#cbd5e1] hover:bg-[#edf4fb] active:scale-95 disabled:opacity-50"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            <span>{testing ? 'Sending...' : 'Send Test Notification'}</span>
          </button>
        </div>
      )}

      {feedback && (
        <p
          className={`mt-2 text-[11px] font-semibold ${
            feedback.type === 'success' ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  )
}
