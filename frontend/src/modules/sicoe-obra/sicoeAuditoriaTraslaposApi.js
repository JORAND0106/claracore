import { usuarioVeAuditoriaTraslapos } from './sicoeAuditoriaTraslapos'

/**
 * Construye el candidato de auditoría a partir del estado de la hoja / registro.
 */
export function candidatoAuditoriaDesdeHoja({
  registro,
  itemNumero,
  locApi = {},
  cantidadTotal,
  vlrUnitario,
}) {
  return {
    id: registro?.id ?? null,
    numero_registro: registro?.numero_registro ?? null,
    reporte_id: registro?.reporte_id ?? null,
    item_numero: String(itemNumero || registro?.item_numero || '').trim(),
    tramo: locApi.tramo ?? registro?.tramo ?? null,
    infraestructura: locApi.infraestructura ?? registro?.infraestructura ?? null,
    calzada: locApi.calzada ?? registro?.calzada ?? null,
    margen: locApi.margen ?? registro?.margen ?? null,
    sector: locApi.sector ?? registro?.sector ?? null,
    abs_inicio: locApi.abs_inicio ?? registro?.abs_inicio ?? null,
    abs_final: locApi.abs_final ?? registro?.abs_final ?? null,
    pk_id_id: locApi.pk_id_id ?? registro?.pk_id_id ?? null,
    cantidad_total: cantidadTotal ?? registro?.cantidad_total ?? null,
    vlr_unitario: vlrUnitario ?? registro?.vlr_unitario ?? null,
  }
}

/**
 * Llama al motor de auditoría del servidor.
 * Resuelve { ok:true } si verde / rol oculto / sin ítem.
 * Si hay alerta, el caller debe mostrar el modal con `analisis`.
 */
export async function fetchAuditoriaTraslaposAnalizar({
  API_URL,
  contratoId,
  hdrs,
  candidatos,
  usuario,
}) {
  if (!usuarioVeAuditoriaTraslapos(usuario)) {
    return { ok: true, omitido: true }
  }
  const list = (candidatos || []).filter((c) => String(c?.item_numero || '').trim())
  if (!list.length) return { ok: true, omitido: true }

  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/auditoria-traslapos/analizar`, {
    method: 'POST',
    headers: { ...hdrs, 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidatos: list }),
  })
  if (!res.ok) {
    // No bloquear asignación por fallo de auditoría
    console.warn('auditoria-traslapos analizar', res.status)
    return { ok: true, error: true }
  }
  const data = await res.json().catch(() => null)
  if (!data || data.oculto_por_rol || data.semaforo === 'verde') {
    return { ok: true, analisis: data }
  }
  return { ok: false, requiereModal: true, analisis: data }
}

export async function fetchAuditoriaTraslaposRegistrarDecision({
  API_URL,
  contratoId,
  hdrs,
  registroId,
  analisisResultado,
  decision,
  justificacion,
}) {
  const body = {
    registro_id: registroId,
    semaforo: analisisResultado?.semaforo,
    hallazgos: analisisResultado?.hallazgos || [],
    decision,
    justificacion: justificacion || null,
    item_numero: analisisResultado?.item_numero || null,
  }
  try {
    await fetch(`${API_URL}/sicoe-obra/${contratoId}/auditoria-traslapos/registrar-decision`, {
      method: 'POST',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    console.warn('auditoria-traslapos registrar-decision', e)
  }
}
