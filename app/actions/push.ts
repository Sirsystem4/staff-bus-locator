'use server'

import {
  saveSubscription,
  removeSubscription,
  type StoredPushSubscription,
} from '@/lib/push-subscription-store'
import { sendPushToAll, sendPushToSingle } from '@/lib/push-service'

export async function savePushSubscriptionAction(
  subscription: StoredPushSubscription,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return { ok: false, error: 'Invalid push subscription payload' }
    }

    await saveSubscription(subscription)
    return { ok: true }
  } catch (err: any) {
    console.error('Failed to save push subscription:', err)
    return { ok: false, error: err?.message || 'Failed to register subscription' }
  }
}

export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!endpoint) return { ok: false, error: 'Missing subscription endpoint' }
    await removeSubscription(endpoint)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to remove subscription' }
  }
}

export async function sendTestPushNotificationAction(
  subscription?: StoredPushSubscription,
): Promise<{ ok: boolean; message: string }> {
  const testPayload = {
    title: 'Staff Bus Tracker · Test Notification',
    body: 'Push notifications are working properly! You will receive alerts when buses are parked, moved, or updated.',
    icon: '/apple-icon.png',
    badge: '/apple-icon.png',
    url: '/',
    tag: `test-push-${Date.now()}`,
  }

  try {
    if (subscription && subscription.endpoint) {
      // Also ensure it is saved in our store
      await saveSubscription(subscription).catch(() => {})
      const result = await sendPushToSingle(subscription, testPayload)
      if (result.ok) {
        return {
          ok: true,
          message: 'Test push notification sent successfully! Check your device notifications.',
        }
      }
      return {
        ok: false,
        message: result.error || 'Failed to send test push notification.',
      }
    }

    // Otherwise send to all registered devices
    const result = await sendPushToAll(testPayload)
    if (result.total === 0) {
      return {
        ok: false,
        message: 'No active push subscriptions found. Please enable notifications on this device first.',
      }
    }

    return {
      ok: true,
      message: `Test push sent to ${result.sent} of ${result.total} device(s). Check your system notification area.`,
    }
  } catch (err: any) {
    console.error('sendTestPushNotificationAction error:', err)
    return {
      ok: false,
      message: err?.message || 'An error occurred while dispatching the test notification.',
    }
  }
}

export async function getVapidPublicKeyAction(): Promise<string> {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
}
