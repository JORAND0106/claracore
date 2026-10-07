import { formatCOP } from '../utils/formatCOP'

/**
 * Aviso informativo cuando el costo directo + AIU del contrato
 * no coincide con la versión vigente del presupuesto.
 */
export default function DashAlertaContratoPresupuesto({ confrontacion, t, fontSize = 11 }) {
  if (!confrontacion || confrontacion.coincide !== false) return null
  const version = confrontacion.etiquetaVersion || 'vigente'
  const dif = Number(confrontacion.diferencia) || 0
  const quien = dif > 0 ? 'el presupuesto es mayor' : 'el contrato es mayor'
  const borde = t?.border || '#FDE68A'
  return (
    <div
      role="status"
      data-testid="alerta-contrato-presupuesto"
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'color-mix(in srgb, #F59E0B 14%, transparent)',
        border: `1px solid color-mix(in srgb, #D97706 45%, ${borde})`,
        color: t?.text || '#78350F',
        fontSize,
        lineHeight: 1.45,
        fontWeight: 600,
      }}
    >
      El costo directo + AIU del contrato no coincide con el presupuesto {version}.
      {' '}Contrato: {formatCOP(confrontacion.valorContrato)}.
      {' '}Presupuesto {version}: {formatCOP(confrontacion.valorPresupuesto)}.
      {' '}Diferencia: {formatCOP(Math.abs(dif))} ({quien}).
    </div>
  )
}
