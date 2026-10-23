/// <reference lib="webworker" />

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}

  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = {
        title: 'Staff Bus Tracker',
        body: event.data.text(),
      }
    }
  }

  const title = payload.title || 'Staff Bus Update'
  const options = {
    body: payload.body || 'A bus park position or route update was recorded.',
    icon: payload.icon || '/apple-icon.png',
    badge: payload.badge || '/apple-icon.png',
    tag: payload.tag || `bus-update-${Date.now()}`,
    renotify: true,
    data: {
      url: payload.url || '/',
      timestamp: Date.now(),
      busNumber: payload.busNumber,
    },
    actions: [
      { action: 'view', title: 'View Bus' },
      { action: 'close', title: 'Dismiss' },
    ],
    vibrate: [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'close') {
    return
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          // If a tab is already open, focus it and navigate if needed
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})
