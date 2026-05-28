/**
 * Clasificación CPM: ruta crítica real vs actividad final del tramo.
 */
export function clasificarNodoCpm(r) {
  if (!r) {
    return { tipo: 'normal', label: null, holguraCero: false, bgCritico: false, bgFinal: false }
  }
  const holgura = Number(r.holgura_total)
  const holguraCero = Number.isFinite(holgura) && holgura <= 0

  if (r.es_actividad_final_tramo || (holguraCero && r.tiene_sucesores === false)) {
    return {
      tipo: 'final_tramo',
      label: '🏁 Actividad final del tramo',
      holguraCero: true,
      bgCritico: false,
      bgFinal: true,
    }
  }
  if (r.es_ruta_critica || (holguraCero && r.tiene_sucesores !== false)) {
    return {
      tipo: 'critica',
      label: '⚠ Ruta crítica',
      holguraCero: true,
      bgCritico: true,
      bgFinal: false,
    }
  }
  if (holguraCero) {
    return {
      tipo: 'final_tramo',
      label: '🏁 Actividad final del tramo',
      holguraCero: true,
      bgCritico: false,
      bgFinal: true,
    }
  }
  return {
    tipo: 'holgura',
    label: `🟡 Con holgura`,
    holguraCero: false,
    bgCritico: false,
    bgFinal: false,
  }
}

export function cpmTooltipClasificacion(clasif, holguraDias) {
  if (!clasif) return null
  if (clasif.tipo === 'critica') {
    return '⚠ Ruta crítica — cuello de botella (holgura 0, bloquea actividades posteriores)'
  }
  if (clasif.tipo === 'final_tramo') {
    return '🏁 Actividad final del tramo — define la fecha de entrega (holgura 0, sin sucesores)'
  }
  if (holguraDias > 0) {
    return `Holgura: ${holguraDias} día${holguraDias !== 1 ? 's' : ''} hábiles`
  }
  return null
}
