import { useEffect, useRef } from 'react'
import { usuarioDebeSuscribirsePush } from '../utils/permisosContrato'
import {
  PROMPT_DELAY_MS,
  fetchPushConfig,
  markPushPromptHandled,
  pushSupported,
  subscribeAndRegisterPush,
  wasPushPromptHandled,
} from '../utils/webPush'
/**
 * Solicita permiso push (nativo del navegador) una vez por usuario elegible.
 * Tras aceptar, registra la suscripción en el backend.
 */
export function useWebPushSubscription({ usuario, contratoId }) {
  const startedRef = useRef(false)

  useEffect(() => {
    if (!usuario?.id || startedRef.current) return
    if (!usuarioDebeSuscribirsePush(usuario, contratoId)) return
    if (!pushSupported()) return
    if (wasPushPromptHandled(usuario.id)) {
      if (Notification.permission === 'granted') {
        void (async () => {
          const cfg = await fetchPushConfig()
          if (cfg.enabled) await subscribeAndRegisterPush(cfg.publicKey)
        })()
      }
      return
    }

    startedRef.current = true
    const timer = window.setTimeout(async () => {
      try {
        if (Notification.permission === 'denied') {
          markPushPromptHandled(usuario.id)
          return
        }
        const cfg = await fetchPushConfig()
        if (!cfg.enabled) return

        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission()
          markPushPromptHandled(usuario.id)
          if (perm !== 'granted') return
        } else if (Notification.permission !== 'granted') {
          markPushPromptHandled(usuario.id)
          return
        }

        await subscribeAndRegisterPush(cfg.publicKey)
      } catch {
        markPushPromptHandled(usuario.id)
      }
    }, PROMPT_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [usuario?.id, contratoId, usuario])
}
