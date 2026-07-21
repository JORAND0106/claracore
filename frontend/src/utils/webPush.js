/** Web Push — suscripción del navegador con VAPID. */

import { fetchConFallback } from '../fetchConFallback'

const PROMPT_DELAY_MS = 45_000
const PROMPT_STORAGE_PREFIX = 'cc_push_prompt_v1'

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function fetchPushConfig() {
  const data = await fetchConFallback('/notificaciones/push/config')
  if (data?._error) return { enabled: false, publicKey: null }
  return {
    enabled: Boolean(data?.enabled && data?.publicKey),
    publicKey: data?.publicKey || null,
  }
}

export async function subscribeAndRegisterPush(publicKey) {
  if (!pushSupported() || !publicKey) return { ok: false, reason: 'unsupported' }
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }
  const json = sub.toJSON()
  const res = await fetchConFallback('/notificaciones/push/subscribe', {
    method: 'POST',
    body: {
      endpoint: json.endpoint,
      keys: json.keys,
      user_agent: navigator.userAgent?.slice(0, 512) || null,
    },
  })
  if (res?._error) return { ok: false, reason: res.detail || 'subscribe_failed' }
  return { ok: true, endpoint: json.endpoint }
}

export async function sendPushTest() {
  return fetchConFallback('/notificaciones/push/test', { method: 'POST', body: {} })
}

export function pushPromptStorageKey(userId) {
  return `${PROMPT_STORAGE_PREFIX}_${userId}`
}

export function wasPushPromptHandled(userId) {
  try {
    return localStorage.getItem(pushPromptStorageKey(userId)) === '1'
  } catch {
    return false
  }
}

export function markPushPromptHandled(userId) {
  try {
    localStorage.setItem(pushPromptStorageKey(userId), '1')
  } catch {
    /* ignore */
  }
}

export { PROMPT_DELAY_MS }
