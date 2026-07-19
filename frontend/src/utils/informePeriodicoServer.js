/** Registra en el servidor la copia del informe periódico (fire-and-forget). */
export function registrarInformePeriodicoCopiaServidor({ apiUrl, token, contratoId, slotId }) {
  if (!apiUrl || !token || !contratoId || !slotId) return
  fetch(`${apiUrl}/informe-periodico/copia`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contrato_id: Number(contratoId),
      slot_id: String(slotId),
    }),
  }).catch(() => {
    /* localStorage sigue siendo la fuente de verdad para reaparición en el navegador */
  })
}
