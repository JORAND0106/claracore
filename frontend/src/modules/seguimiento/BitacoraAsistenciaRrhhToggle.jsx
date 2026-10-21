/**
 * Interruptor on/off (solo Desarrollador) del gate Bitácora↔RRHH
 * en el contrato exento (ID 3).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatFechaHoraColombia } from '../../utils/fechaColombia.js'
import {
  BITACORA_ASISTENCIA_RRHH_CORTE_ISO,
  BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID,
  esContratoExentoAsistenciaRrhh,
  policySnapshotAsistenciaRrhh,
} from './bitacoraAsistenciaRrhhPolicy'
import { createSeguimientoApi } from './seguimientoApi'

function IconPower({ on }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7.5 6.5a7 7 0 1 0 9 0"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity={on ? 1 : 0.55}
      />
    </svg>
  )
}

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
  const ultima = policy?.activa_en
    ? formatFechaHoraColombia(policy.activa_en, { withTime: true })
    : null

  const tooltip = activa
    ? 'Interruptor ENCENDIDO: Bitácora exige identificación individual y documentación Aprobada. Clic para apagar.'
    : 'Interruptor APAGADO: Bitácora permite registrar personal sin identificación individual ni estado Aprobado. Clic para encender.'

  const onToggle = async () => {
    if (!api?.setBitacoraAsistenciaRrhhActiva || busy) return
    const next = !activa
    const ok = window.confirm(
      next
        ? '¿Encender el interruptor? Bitácora exigirá identificación individual y documentación Aprobada en este contrato.'
        : '¿Apagar el interruptor? Bitácora volverá a permitir registrar personal sin identificación individual ni Aprobado. El personal nuevo registrado desde ahora solo se podrá aprobar de forma individual.',
    )
    if (!ok) return
    setBusy(true)
    setErr('')
    try {
      const data = await api.setBitacoraAsistenciaRrhhActiva(next)
      if (data && typeof data === 'object') setPolicy(data)
      else {
        setPolicy((p) => ({
          ...p,
          activa_en_exento: next,
          requiere_rrhh_aprobado: next && corte,
          permite_cargo_cuadrilla: !(next && corte),
          apagada_en: next ? p?.apagada_en : (p?.apagada_en || new Date().toISOString()),
        }))
      }
    } catch (e) {
      setErr(e?.message || 'No se pudo actualizar el interruptor')
    } finally {
      setBusy(false)
    }
  }

  const onColor = '#0F766E'
  const offColor = t.textMuted || '#64748B'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end',
      maxWidth: 380,
    }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onToggle()}
        title={tooltip}
        aria-label={activa ? 'Interruptor Bitácora RRHH encendido' : 'Interruptor Bitácora RRHH apagado'}
        aria-pressed={activa}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 8,
          border: `1px solid ${activa ? onColor : (t.border || '#94A3B8')}`,
          background: activa
            ? 'rgba(13,148,136,0.14)'
            : (t.bgCard || '#fff'),
          color: activa ? onColor : (t.text || '#0F172A'),
          fontWeight: 700,
          fontSize: 'var(--cc-xs)',
          cursor: busy ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ color: activa ? onColor : offColor, display: 'inline-flex' }}>
          <IconPower on={activa} />
        </span>
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, lineHeight: 1.2 }}>
          <span>
            Contrato {BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID}:{' '}
            {busy ? 'Guardando…' : (activa ? 'ON' : 'OFF')}
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: activa ? onColor : offColor,
          }}>
            {activa ? 'Restricción activa' : 'Sin restricción'}
          </span>
        </span>
        {/* Interruptor visual */}
        <span
          aria-hidden="true"
          style={{
            width: 40,
            height: 22,
            borderRadius: 999,
            background: activa ? onColor : (t.border || '#CBD5E1'),
            position: 'relative',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          <span style={{
            position: 'absolute',
            top: 2,
            left: activa ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            transition: 'left 0.15s',
          }}
          />
        </span>
      </button>
      <div style={{ fontSize: 11, color: t.textMuted, textAlign: 'right', lineHeight: 1.3 }}>
        {activa
          ? 'Asistencia individual + documentación Aprobada.'
          : (corte
            ? 'Apagado: se puede registrar personal sin identificación individual ni Aprobado.'
            : `El gate global inicia el ${BITACORA_ASISTENCIA_RRHH_CORTE_ISO.slice(8, 10)}-sep-${BITACORA_ASISTENCIA_RRHH_CORTE_ISO.slice(0, 4)}; este contrato permanece exento hasta encenderlo.`)}
        {ultima ? (
          <span style={{ display: 'block', marginTop: 2 }}>
            Último cambio: {ultima}
          </span>
        ) : null}
      </div>
      {err ? (
        <div style={{ fontSize: 11, color: '#B91C1C', textAlign: 'right' }}>{err}</div>
      ) : null}
    </div>
  )
}
