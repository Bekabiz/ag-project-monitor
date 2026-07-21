let vapidPublicKey = null

async function getVapidKey() {
  if (vapidPublicKey) return vapidPublicKey
  try {
    const res = await fetch('/api/notify')
    const data = await res.json()
    vapidPublicKey = data.publicKey
    return vapidPublicKey
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushPermission() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

export async function subscribeToPush(userId) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  const publicKey = await getVapidKey()
  if (!publicKey) return { ok: false, reason: 'no_vapid_key' }

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      })
    }

    const res = await fetch('/api/notify?subscribe=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), userId })
    })

    if (!res.ok) return { ok: false, reason: 'server_error' }
    return { ok: true }
  } catch (err) {
    console.error('Push subscribe error:', err)
    return { ok: false, reason: err.message }
  }
}

export async function isSubscribed() {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return Boolean(subscription)
  } catch {
    return false
  }
}
