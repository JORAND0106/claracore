import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getActiveInformePeriodicoSlotId,
  markInformePeriodicoSlotCompleted,
  shouldShowInformePeriodicoReminder,
} from '../utils/informePeriodicoSchedule'
import { registrarInformePeriodicoCopiaServidor } from '../utils/informePeriodicoServer'
import { usuarioDebeVerInformePeriodicoPopup } from '../utils/permisosContrato'

/**
 * Controla cuándo mostrar el modal de informe periódico.
 * Una sola ventana diaria (9:00, lun–vie) para cargos con editar en Dashboard
 * de validación, excluyendo Operativo/Contratista Gerencial.
 * Reaparece al cambiar de módulo / recargar hasta copiar la captura del día.
 */
export function useInformePeriodicoReminder({
  usuario,
  contratoId,
  apiUrl,
  getAuthToken,
  moduloActivo,
  showAdmin,
  showContabilidad,
}) {
  const [open, setOpen] = useState(false)
  const [copiedInModal, setCopiedInModal] = useState(false)
  const pendingRef = useRef(false)
  const slotRef = useRef(null)

  const eligible = usuarioDebeVerInformePeriodicoPopup(usuario, contratoId)

  const evaluate = useCallback(() => {
    if (!eligible || !usuario?.id || !contratoId) {
      pendingRef.current = false
      slotRef.current = null
      return false
    }
    const now = new Date()
    const slotId = getActiveInformePeriodicoSlotId(now)
    slotRef.current = slotId
    const force = shouldShowInformePeriodicoReminder(usuario.id, contratoId, now)
    pendingRef.current = force
    return force
  }, [eligible, usuario?.id, contratoId])

  const openIfPending = useCallback(() => {
    if (evaluate()) {
      setCopiedInModal(false)
      setOpen(true)
    } else {
      setOpen(false)
      pendingRef.current = false
    }
  }, [evaluate])

  // Carga inicial y recarga de página
  useEffect(() => {
    openIfPending()
  }, [openIfPending])

  // Cada cambio de módulo (incl. admin / contabilidad)
  useEffect(() => {
    if (evaluate()) {
      setCopiedInModal(false)
      setOpen(true)
    }
  }, [moduloActivo, showAdmin, showContabilidad, evaluate])

  // Cruce de ventana horaria mientras la app permanece abierta
  useEffect(() => {
    const tick = () => {
      const prevSlot = slotRef.current
      const force = evaluate()
      const nextSlot = slotRef.current
      if (force && nextSlot !== prevSlot) {
        setCopiedInModal(false)
        setOpen(true)
      } else if (!force) {
        setOpen(false)
      }
    }
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [evaluate])

  /** Cierra el modal; si aún no copió, volverá a abrirse al cambiar de módulo o recargar. */
  const dismissWithoutCopy = useCallback(() => {
    setOpen(false)
  }, [])

  const onCopySuccess = useCallback(() => {
    const slotId = slotRef.current || getActiveInformePeriodicoSlotId(new Date())
    if (usuario?.id && contratoId && slotId) {
      markInformePeriodicoSlotCompleted(usuario.id, contratoId, slotId)
      const token = typeof getAuthToken === 'function' ? getAuthToken() : null
      registrarInformePeriodicoCopiaServidor({
        apiUrl,
        token,
        contratoId,
        slotId,
      })
    }
    pendingRef.current = false
    setCopiedInModal(true)
  }, [usuario?.id, contratoId, apiUrl, getAuthToken])

  const onOk = useCallback(() => {
    setOpen(false)
  }, [])

  return {
    open: open && eligible,
    copiedInModal,
    dismissWithoutCopy,
    onCopySuccess,
    onOk,
  }
}
