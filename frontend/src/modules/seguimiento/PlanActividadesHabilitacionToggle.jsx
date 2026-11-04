import { useCallback, useEffect, useState } from 'react'
import { ToggleLeft, ToggleRight } from 'lucide-react'

/**
 * Interruptor Desarrollador: habilita/deshabilita Plan de actividades por contrato.
 */
export default function PlanActividadesHabilitacionToggle({
  t,
  api,
  esDesarrollador = false,
  onChanged,
}) {
  const [habilitado, setHabilitado] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!api?.getPlanHabilitacion) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const row = await api.getPlanHabilitacion()
      setHabilitado(Boolean(row?.habilitado))
      onChanged?.(row)
    } catch {
      setHabilitado(false)
      onChanged?.({ habilitado: false })
    } finally {
      setLoading(false)
    }
  }, [api, onChanged])

  useEffect(() => { load() }, [load])

  if (!esDesarrollador) return null

  async function toggle() {
    if (busy || !api?.setPlanHabilitacion) return
    setBusy(true)
    try {
      const row = await api.setPlanHabilitacion(!habilitado)
      setHabilitado(Boolean(row?.habilitado))
      onChanged?.(row)
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert(e?.message || 'No se pudo cambiar la habilitación')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || loading}
      title={
        habilitado
          ? 'Plan de actividades: habilitado en este contrato (clic para deshabilitar). Solo Desarrollador.'
          : 'Plan de actividades: deshabilitado (clic para habilitar). Solo Desarrollador.'
      }
      aria-label={habilitado ? 'Deshabilitar Plan de actividades' : 'Habilitar Plan de actividades'}
      style={{
        width: 34,
        height: 34,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        border: `1px solid ${habilitado ? t.primary : t.border}`,
        background: habilitado ? `${t.primary}22` : 'transparent',
        color: t.text,
        cursor: busy || loading ? 'wait' : 'pointer',
      }}
    >
      {habilitado
        ? <ToggleRight size={18} strokeWidth={2.3} aria-hidden />
        : <ToggleLeft size={18} strokeWidth={2.3} aria-hidden />}
    </button>
  )
}
