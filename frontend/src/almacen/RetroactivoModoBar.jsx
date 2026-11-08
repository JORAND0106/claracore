/**
 * Interruptor Retroactivo | Actualizado + aviso de ventana y gestión gerencial.
 */
import { useMemo, useState } from 'react'
import CcConfirmModal from '../components/CcConfirmModal'
import {
  MODO_ACTUALIZADO,
  MODO_RETROACTIVO,
  guardarPreferenciaModo,
} from './retroactivoModo'

const pill = (active, color, bg) => ({
  border: active ? `2px solid ${color}` : '1px solid #cbd5e1',
  background: active ? bg : '#fff',
  color: active ? color : '#475569',
  fontWeight: 800,
  fontSize: 'var(--cc-sm, 0.9rem)',
  padding: '8px 12px',
  borderRadius: 10,
  cursor: 'pointer',
  minHeight: 40,
})

export default function RetroactivoModoBar({
  estado,
  modo,
  onModoChange,
  userId,
  contratoId,
  onAbrirHabilitaciones,
  pendientesCount = 0,
  onFiltrarPendientes,
  puedeValidar = false,
}) {
  const [askDefault, setAskDefault] = useState(null) // next modo pending confirm

  const horas = estado?.horas_restantes
  const aviso = Boolean(estado?.aviso_poco_tiempo)
  const puedeUsar = Boolean(estado?.puede_usar_modo)
  const puedeHab = Boolean(estado?.puede_habilitar)

  const hastaLabel = useMemo(() => {
    const h = estado?.habilitacion?.hasta
    if (!h) return ''
    try {
      return new Date(h).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
    } catch {
      return String(h)
    }
  }, [estado])

  if (!puedeUsar && !puedeHab && !(puedeValidar && pendientesCount > 0)) {
    return null
  }

  const pedirCambio = (next) => {
    if (next === modo) return
    setAskDefault(next)
  }

  const aplicar = (hacerDefault) => {
    const next = askDefault
    setAskDefault(null)
    if (!next) return
    onModoChange?.(next)
    if (hacerDefault) guardarPreferenciaModo(userId, contratoId, next)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        marginBottom: 10,
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${modo === MODO_RETROACTIVO ? '#c2410c' : '#94a3b8'}`,
        background: modo === MODO_RETROACTIVO ? '#fff7ed' : '#f8fafc',
      }}
      data-testid="retroactivo-modo-bar"
    >
      {puedeUsar && (
        <>
          <span style={{ fontWeight: 800, fontSize: 'var(--cc-sm, 0.85rem)', color: '#334155' }}>
            Modo
          </span>
          <button
            type="button"
            style={pill(modo === MODO_ACTUALIZADO, '#0f766e', '#ccfbf1')}
            onClick={() => pedirCambio(MODO_ACTUALIZADO)}
            data-testid="modo-actualizado"
          >
            Actualizado
          </button>
          <button
            type="button"
            style={pill(modo === MODO_RETROACTIVO, '#c2410c', '#ffedd5')}
            onClick={() => pedirCambio(MODO_RETROACTIVO)}
            data-testid="modo-retroactivo"
          >
            Retroactivo
          </button>
          {modo === MODO_RETROACTIVO && (
            <span style={{ fontSize: 'var(--cc-xs, 0.8rem)', color: '#9a3412', fontWeight: 700 }}>
              Fecha del hecho obligatoria
              {hastaLabel ? ` · vigente hasta ${hastaLabel}` : ''}
            </span>
          )}
          {aviso && (
            <span
              style={{
                fontSize: 'var(--cc-xs, 0.8rem)',
                color: '#b45309',
                fontWeight: 700,
                background: '#fef3c7',
                padding: '4px 8px',
                borderRadius: 8,
              }}
              data-testid="retroactivo-aviso-tiempo"
            >
              Quedan ~{Math.max(1, Math.round(horas || 0))} h de ventana Retroactivo
            </span>
          )}
        </>
      )}

      {puedeHab && (
        <button
          type="button"
          onClick={onAbrirHabilitaciones}
          style={{
            marginLeft: 'auto',
            border: '1px solid #64748b',
            background: '#fff',
            borderRadius: 8,
            padding: '6px 10px',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 'var(--cc-sm, 0.85rem)',
          }}
          data-testid="retroactivo-gestionar"
        >
          Habilitar Retroactivo…
        </button>
      )}

      {puedeValidar && pendientesCount > 0 && (
        <button
          type="button"
          onClick={onFiltrarPendientes}
          style={{
            border: '1px solid #c2410c',
            background: '#fff7ed',
            color: '#9a3412',
            borderRadius: 8,
            padding: '6px 10px',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: 'var(--cc-sm, 0.85rem)',
          }}
          data-testid="retroactivo-pendientes"
        >
          Retroactivos por validar · {pendientesCount}
        </button>
      )}

      {askDefault != null && (
        <CcConfirmModal
          titulo="¿Dejarlo como predeterminado?"
          confirmar="Sí, predeterminado"
          cancelar="Solo ahora"
          tipo="info"
          onConfirm={() => aplicar(true)}
          onCancel={() => aplicar(false)}
        >
          {askDefault === MODO_RETROACTIVO
            ? '¿Usar Retroactivo como modo predeterminado mientras su ventana esté vigente?'
            : '¿Usar Actualizado como modo predeterminado?'}
        </CcConfirmModal>
      )}
    </div>
  )
}

export function BadgeRetroactivo({ row, style }) {
  if (!row?.marca_retroactivo && !(row?.es_retroactivo && !row?.retroactivo_validado_at)) return null
  return (
    <span
      title="Registro retroactivo pendiente de validar"
      data-testid="badge-retroactivo"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#ffedd5',
        color: '#9a3412',
        border: '1px solid #fdba74',
        borderRadius: 6,
        padding: '1px 6px',
        fontSize: '0.72rem',
        fontWeight: 800,
        letterSpacing: 0.2,
        ...style,
      }}
    >
      ⏱ Retroactivo
    </span>
  )
}
