'use client'

import {
  getVapidPublicKeyAction,
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  sendTestPushNotificationAction,
} from '@/app/actions/push'
import type { StoredPushSubscription } from '@/lib/push-subscription-store'

/**
 * Converts a base64 string to a Uint8Array for applicationServerKey.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function isPushNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(ua)
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

/**
 * Registers the service worker at /sw.js.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushNotificationSupported()) return null

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    return registration
  } catch (error) {
    console.warn('Service worker registration failed:', error)
    return null
  }
}

/**
 * Subscribes the current device to Web Push notifications.
 */
export async function subscribeToPushNotifications(): Promise<{
  ok: boolean
  error?: string
  subscription?: StoredPushSubscription
}> {
  if (!isPushNotificationSupported()) {
    return {
      ok: false,
      error: 'Push notifications are not supported by this browser.',
    }
  }

  try {
    // 1. Request native browser notification permission
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return {
        ok: false,
        error:
          permission === 'denied'
            ? 'Notification permission was denied. Please allow notifications in your browser or site settings.'
            : 'Notification permission was dismissed.',
      }
    }

    // 2. Fetch VAPID public key
    const vapidPublicKey = await getVapidPublicKeyAction()
    if (!vapidPublicKey) {
      return {
        ok: false,
        error: 'VAPID public key is missing on the server.',
      }
    }

    // 3. Ensure service worker is registered & ready
    await registerServiceWorker()
    const reg = await navigator.serviceWorker.ready

    // 4. Create push subscription via PushManager
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)
    let pushSub = await reg.pushManager.getSubscription()

    if (!pushSub) {
      pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
    }

    // 5. Convert keys to base64
    const rawP256dh = pushSub.getKey('p256dh')
    const rawAuth = pushSub.getKey('auth')

    if (!rawP256dh || !rawAuth) {
      return { ok: false, error: 'Could not extract encryption keys from push subscription.' }
    }

    const p256dh = window.btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawP256dh))))
    const auth = window.btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawAuth))))

    const storedSub: StoredPushSubscription = {
      endpoint: pushSub.endpoint,
      expirationTime: pushSub.expirationTime,
      keys: {
        p256dh,
        auth,
      },
    }

    // 6. Save to backend database
    const saveResult = await savePushSubscriptionAction(storedSub)
    if (!saveResult.ok) {
      return { ok: false, error: saveResult.error }
    }

    return { ok: true, subscription: storedSub }
  } catch (err: any) {
    console.error('subscribeToPushNotifications error:', err)
    return {
      ok: false,
      error: err?.message || 'An unexpected error occurred while subscribing.',
    }
  }
}

/**
 * Unsubscribes the current device.
 */
export async function unsubscribeFromPushNotifications(): Promise<{
  ok: boolean
  error?: string
}> {
  if (!isPushNotificationSupported()) return { ok: true }

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      await removePushSubscriptionAction(endpoint)
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to unsubscribe.' }
  }
}

/**
 * Dispatches a test push notification to this device.
 */
export async function sendTestPushToCurrentDevice(): Promise<{
  ok: boolean
  message: string
}> {
  if (!isPushNotificationSupported()) {
    return { ok: false, message: 'Push notifications are not supported on this browser.' }
  }

  try {
    const reg = await navigator.serviceWorker.ready
    const pushSub = await reg.pushManager.getSubscription()

    if (!pushSub) {
      return {
        ok: false,
        message: 'No active push subscription found on this browser. Click "Enable Notifications" first.',
      }
    }

    const rawP256dh = pushSub.getKey('p256dh')
    const rawAuth = pushSub.getKey('auth')

    if (!rawP256dh || !rawAuth) {
      return { ok: false, message: 'Unable to read device encryption keys.' }
    }

    const p256dh = window.btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawP256dh))))
    const auth = window.btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawAuth))))

    const sub: StoredPushSubscription = {
      endpoint: pushSub.endpoint,
      expirationTime: pushSub.expirationTime,
      keys: { p256dh, auth },
    }

    return await sendTestPushNotificationAction(sub)
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Failed to send test push notification.' }
  }
}
