import { fmtFechaAlmacen, useAlmacenTheme } from './almacenShared'

function Segmento({ label, nombre, fecha }) {
  if (!nombre && !fecha) return null
  const partes = []
  if (label) partes.push(label)
  if (nombre) partes.push(nombre)
  if (fecha) partes.push(fecha)
  return (
    <span className="cc-almacen-trazabilidad-segment">
      {partes.join(' · ')}
    </span>
  )
}

/**
 * Trazabilidad compacta: quién creó/envió/aprobó y cuándo.
 */
export default function SolicitudTrazabilidadPanel({ sol }) {
  const ui = useAlmacenTheme()
  if (!sol) return null

  const fechaCreacion = fmtFechaAlmacen(sol.created_at)
  const fechaEnvio = fmtFechaAlmacen(sol.enviada_at)
  const fechaValidacion = fmtFechaAlmacen(sol.validada_at)
  const solicitante = sol.solicitante_nombre
  const validador = sol.validador_nombre

  const tieneEnvio = Boolean(sol.enviada_at && ['enviada', 'aprobada', 'rechazada'].includes(sol.estado))
  const tieneAprobacion = sol.estado === 'aprobada' && (validador || fechaValidacion)
  const tieneRechazo = sol.estado === 'rechazada' && (validador || fechaValidacion)
  const pendientes = sol.estado === 'enviada' && (sol.validadores_pendientes?.length > 0)

  if (!solicitante && !fechaCreacion && !tieneEnvio && !tieneAprobacion && !tieneRechazo && !pendientes) {
    return null
  }

  return (
    <div
      className="cc-almacen-trazabilidad-strip"
      style={{ color: ui.textMuted }}
    >
      <Segmento label="Generada" nombre={solicitante} fecha={fechaCreacion} />
      {tieneEnvio && <Segmento label="Enviada" nombre={solicitante} fecha={fechaEnvio} />}
      {tieneAprobacion && <Segmento label="Aprobada" nombre={validador} fecha={fechaValidacion} />}
      {tieneRechazo && <Segmento label="Rechazada" nombre={validador} fecha={fechaValidacion} />}
      {pendientes && (
        <span className="cc-almacen-trazabilidad-segment">
          Pendiente: {sol.validadores_pendientes.join(', ')}
        </span>
      )}
    </div>
  )
}
