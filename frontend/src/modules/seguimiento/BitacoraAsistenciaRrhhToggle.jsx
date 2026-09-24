/**
 * Botón Desarrollador: activa/desactiva el gate Bitácora↔RRHH en el contrato exento (ID 3).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID,
  esContratoExentoAsistenciaRrhh,
  policySnapshotAsistenciaRrhh,
} from './bitacoraAsistenciaRrhhPolicy'
import { createSeguimientoApi } from './seguimientoApi'

export default function BitacoraAsistenciaRrhhToggle({
  t,
  token,
  contratoId,
  esDesarrollador = false,
}) {
  const cid = Number(contratoId)
  const visible = esDesarrollador && esContratoExentoAsistenciaRrhh(cid)
  const api = useMemo(() => createSeguimientoApi(cid, token), [cid, token])
  const [policy, setPolicy] = useState(() => policySnapshotAsistenciaRrhh({ contratoId: cid }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!visible || !token || !api?.getBitacoraAsistenciaRrhhPolicy) return
    try {
      const data = await api.getBitacoraAsistenciaRrhhPolicy()
      if (data && typeof data === 'object') setPolicy(data)
    } catch {
      setPolicy(policySnapshotAsistenciaRrhh({ contratoId: cid }))
    }
  }, [api, cid, token, visible])

  useEffect(() => {
    void load()
  }, [load])

  if (!visible) return null

  const activa = Boolean(policy?.activa_en_exento)
  const corte = Boolean(policy?.corte_activo)

  const onToggle = async () => {
    if (!api?.setBitacoraAsistenciaRrhhActiva) return
    setBusy(true)
    setErr('')
    try {
      const next = !activa
      const data = await api.setBitacoraAsistenciaRrhhActiva(next)
      if (data && typeof data === 'object') setPolicy(data)
      else {
        setPolicy((p) => ({
          ...p,
          activa_en_exento: next,
          requiere_rrhh_aprobado: next && corte,
          permite_cargo_cuadrilla: !(next && corte),
        }))
      }
    } catch (e) {
      setErr(e?.message || 'No se pudo actualizar la activación')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end',
      maxWidth: 360,
    }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onToggle()}
        title={activa
          ? 'Desactivar gate RRHH (vuelve a cargo/cuadrilla en este contrato)'
          : 'Activar identificación individual + documentación Aprobada en este contrato'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 8,
          border: `1px solid ${activa ? '#0F766E' : (t.border || '#94A3B8')}`,
          background: activa
            ? 'rgba(13,148,136,0.12)'
            : (t.bgCard || '#fff'),
          color: activa ? '#0F766E' : (t.text || '#0F172A'),
          fontWeight: 700,
          fontSize: 'var(--cc-xs)',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy
          ? 'Guardando…'
          : (activa
            ? `Contrato ${BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID}: gate RRHH ON`
            : `Contrato ${BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID}: activar gate RRHH`)}
      </button>
      <div style={{ fontSize: 11, color: t.textMuted, textAlign: 'right', lineHeight: 1.3 }}>
        {activa
          ? 'Asistencia individual + documentación Aprobada (como el resto de contratos).'
          : (corte
            ? 'Exento: sigue en cargo/cuadrilla hasta que active este botón.'
            : `El gate global inicia el ${BITACORA_ASISTENCIA_RRHH_CORTE_ISO.slice(8, 10)}-sep-${BITACORA_ASISTENCIA_RRHH_CORTE_ISO.slice(0, 4)}; este contrato permanece exento hasta activarlo.`)}
      </div>
      {err ? (
        <div style={{ fontSize: 11, color: '#B91C1C', textAlign: 'right' }}>{err}</div>
      ) : null}
    </div>
  )
}
