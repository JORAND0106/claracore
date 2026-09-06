/**
 * LineaResumenEconomico — ahora delega en tabla Excel (compat).
 */
import LineaResumenExcelTable from './LineaResumenExcelTable'

export default function LineaResumenEconomico({
  analisis,
  compact = false,
  color,
  verEconomicos = true,
  ctx = null,
  ctxNeg = null,
  supera = false,
  superaNegociado = false,
  esPrincipal = true,
  sinPrecio = false,
}) {
  if (!verEconomicos && !ctx && !ctxNeg?.tiene_negociado) return null
  return (
    <LineaResumenExcelTable
      ctx={ctx}
      ctxNeg={ctxNeg}
      analisis={analisis}
      supera={supera}
      superaNegociado={superaNegociado}
      esPrincipal={esPrincipal}
      sinPrecio={sinPrecio}
      verEconomicos={verEconomicos}
    />
  )
}
