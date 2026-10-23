import webpush from 'web-push'
import {
  readSubscriptions,
  removeSubscriptions,
  type StoredPushSubscription,
} from './push-subscription-store'

export interface PushNotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  url?: string
  tag?: string
  busNumber?: number
}

let vapidConfigured = false

function ensureVapidConfig() {
  if (vapidConfigured) return

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@staffbustracker.local'

  if (!publicKey || !privateKey) {
    console.warn('Web Push VAPID keys are missing from environment variables.')
    return
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    vapidConfigured = true
  } catch (err) {
    console.error('Failed to configure VAPID details:', err)
  }
}

/**
 * Sends a push notification to all registered subscriptions.
 * Automatically cleans up expired/unsubscribed endpoints (HTTP 404/410).
 */
export async function sendPushToAll(payload: PushNotificationPayload): Promise<{
  total: number
  sent: number
  failed: number
}> {
  ensureVapidConfig()

  const subscriptions = await readSubscriptions()
  if (!subscriptions.length) {
    return { total: 0, sent: 0, failed: 0 }
  }

  const stringifiedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/apple-icon.png',
    badge: payload.badge || '/apple-icon.png',
    url: payload.url || '/',
    tag: payload.tag || `bus-update-${Date.now()}`,
    busNumber: payload.busNumber,
  })

  const expiredEndpoints: string[] = []
  let sentCount = 0
  let failedCount = 0

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          stringifiedPayload,
          {
            TTL: 60 * 60 * 24, // 24 hours
            urgency: 'high',
          },
        )
        sentCount++
      } catch (error: any) {
        failedCount++
        const statusCode = error?.statusCode
        // 404 Not Found or 410 Gone indicates the subscription has expired or was revoked
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(sub.endpoint)
        } else {
          console.warn(`Web push delivery error for ${sub.endpoint.slice(0, 30)}...:`, error?.message || error)
        }
      }
    }),
  )

  // Prune any dead subscriptions
  if (expiredEndpoints.length > 0) {
    removeSubscriptions(expiredEndpoints).catch((err) => {
      console.warn('Failed to prune expired push subscriptions:', err)
    })
  }

  return {
    total: subscriptions.length,
    sent: sentCount,
    failed: failedCount,
  }
}

/**
 * Sends a push notification to a specific single subscription (used for testing).
 */
export async function sendPushToSingle(
  sub: StoredPushSubscription,
  payload: PushNotificationPayload,
): Promise<{ ok: boolean; error?: string }> {
  ensureVapidConfig()

  const stringifiedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/apple-icon.png',
    badge: payload.badge || '/apple-icon.png',
    url: payload.url || '/',
    tag: payload.tag || `test-${Date.now()}`,
    busNumber: payload.busNumber,
  })

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      stringifiedPayload,
      {
        TTL: 60 * 60,
        urgency: 'high',
      },
    )
    return { ok: true }
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to deliver push notification' }
  }
}
