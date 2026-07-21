/**
 * TEMPORAL — cliente API para probar correo resumen jornada bajo demanda.
 * Eliminar tras validar en producción (junto con TempPruebaResumenJornadaDev).
 */

function parseApiError(data, status) {
  const d = data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d.map((x) => x.msg || x.message || JSON.stringify(x)).join('; ')
  }
  return data?.error || `Error ${status}`
}

/**
 * @param {{ apiUrl: string, getToken: () => string|null, contratoId: number|string, periodo: 'manana'|'tarde' }} opts
 */
export async function enviarPruebaResumenJornada({ apiUrl, getToken, contratoId, periodo }) {
  const tok = getToken?.()
  if (!tok) throw new Error('Sesión no válida. Vuelva a iniciar sesión.')

  const q = new URLSearchParams({
    contrato_id: String(contratoId),
    periodo,
  })
  const r = await fetch(
    `${apiUrl.replace(/\/$/, '')}/internal/temp/notificaciones-email/prueba-resumen-jornada?${q}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}` },
    },
  )
  let data = {}
  try {
    data = await r.json()
  } catch {
    data = {}
  }
  if (!r.ok) {
    throw new Error(parseApiError(data, r.status))
  }
  if (!data.enviado) {
    throw new Error(data.error || 'El servidor no pudo enviar el correo (SMTP no configurado o fallo de envío).')
  }
  return data
}
