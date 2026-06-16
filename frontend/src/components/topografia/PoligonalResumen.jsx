import { chipEstadoValidacion, useTopoTheme } from './topografiaShared'
import { fmtRatio } from '../../utils/topografia_angular'

function fmtFecha(iso, { hora = false } = {}) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString('es-CO', hora
      ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return null
  }
}

function ChipVal({ label, chip, ui }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, fontWeight: 600 }}>{label}</span>
      <span
        style={{
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 'var(--cc-xs)',
          fontWeight: 600,
          background: chip.bg,
          color: chip.color,
          lineHeight: 1.4,
        }}
      >
        {chip.label}
      </span>
    </span>
  )
}

function BloqueValidacion({ titulo, chip, usuario, fecha, ui }) {
  const xs = 'var(--cc-xs)'
  const tieneAccion = fecha || usuario
  const esAprobado = (chip.label || '') === 'Aprobado'
  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
        background: ui.t?.bgCard || '#f8fafc',
        minWidth: 0,
      }}
    >
      <ChipVal label={titulo} chip={chip} ui={ui} />
      <div style={{ marginTop: 6, fontSize: xs, color: ui.textMuted, lineHeight: 1.45 }}>
        {tieneAccion ? (
          <>
            {usuario && (
              <div>
                <span style={{ color: ui.textMuted }}>{esAprobado ? 'Aprobó' : 'Por'}: </span>
                <span style={{ color: ui.text, fontWeight: 500 }}>{usuario}</span>
              </div>
            )}
            {fecha && (
              <div>
                <span style={{ color: ui.textMuted }}>{esAprobado ? 'Fecha' : 'Registro'}: </span>
                <span style={{ color: ui.text }}>{fecha}</span>
              </div>
            )}
          </>
        ) : (
          <span>Sin registro de validación</span>
        )}
      </div>
    </div>
  )
}

function MetaLine({ label, value, ui }) {
  if (!value) return null
  return (
    <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 600 }}>{label}: </span>
      <span style={{ color: ui.text }}>{value}</span>
    </span>
  )
}

/** Vista compacta al seleccionar una poligonal. */
export default function PoligonalResumen({ poligonal, cierre }) {
  const ui = useTopoTheme()
  const pol = poligonal || {}
  const n1 = chipEstadoValidacion(pol.nivel1_estado)
  const n2 = chipEstadoValidacion(pol.nivel2_estado)
  const sellada = (pol.nivel2_estado || '') === 'Aprobado' || Boolean(pol.biblioteca_at)
  const xs = 'var(--cc-xs)'

  const tipoLabel = pol.tipo === 'abierta' ? 'Abierta' : 'Cerrada'
  const estadoLabel = pol.estado === 'cerrado' ? 'Terminada' : 'En libreta'
  const extras = [estadoLabel, sellada ? 'Sellada' : null, pol.biblioteca_at ? 'Biblioteca' : null].filter(Boolean)

  const creacion = fmtFecha(pol.created_at)
  const fechaN1 = fmtFecha(pol.nivel1_fecha, { hora: true })
  const fechaN2 = fmtFecha(pol.nivel2_fecha, { hora: true }) || (pol.biblioteca_at ? fmtFecha(pol.biblioteca_at, { hora: true }) : null)

  const metricas = cierre
    ? [
        { label: 'Cierre', value: cierre.admisible_lineal ? 'Admisible' : 'Revisar' },
        fmtRatio(cierre.precision) !== '—' ? { label: 'Precisión', value: fmtRatio(cierre.precision) } : null,
        cierre.perimetro != null ? { label: 'Perímetro', value: `${Number(cierre.perimetro).toFixed(2)} m` } : null,
      ].filter(Boolean)
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, flex: '1 1 320px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', lineHeight: 1.3 }}>
        <strong style={{ fontSize: 'var(--cc-sm)', fontWeight: 700 }}>{pol.nombre}</strong>
        <span
          style={{
            fontSize: xs,
            padding: '1px 8px',
            borderRadius: 999,
            background: ui.accentSoft,
            color: ui.accent,
            fontWeight: 600,
          }}
        >
          {tipoLabel}
        </span>
        {extras.length > 0 && (
          <span style={{ fontSize: xs, color: ui.textMuted }}>{extras.join(' · ')}</span>
        )}
      </div>

      {creacion && (
        <div style={{ fontSize: xs, color: ui.textMuted }}>
          <span style={{ fontWeight: 600 }}>Creación: </span>
          <span style={{ color: ui.text }}>{creacion}</span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        <BloqueValidacion
          titulo="Contratista"
          chip={n1}
          usuario={pol.nivel1_usuario_nombre}
          fecha={fechaN1}
          ui={ui}
        />
        <BloqueValidacion
          titulo="Interventoría"
          chip={n2}
          usuario={pol.nivel2_usuario_nombre}
          fecha={fechaN2}
          ui={ui}
        />
      </div>

      {metricas.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 20px',
            paddingTop: 2,
            borderTop: `1px solid ${ui.t?.border || '#e2e8f0'}`,
          }}
        >
          {metricas.map((m) => (
            <MetaLine key={m.label} label={m.label} value={m.value} ui={ui} />
          ))}
        </div>
      )}
    </div>
  )
}
