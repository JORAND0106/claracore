import { tokenActual } from '../../auth/tokenParaUi'
import { API_BASE } from '../../apiBase'

function mensajeDe(data, status) {
  const detail = data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (detail && typeof detail.mensaje === 'string') return detail.mensaje
  if (status === 403) return 'No tiene permiso para esta acción.'
  return 'No se pudo completar la operación.'
}

export function createCajaMenorApi(token) {
  const auth = () => ({ Authorization: `Bearer ${tokenActual() || token || ''}` })

  async function leer(res) {
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    if (!res.ok) {
      const err = new Error(mensajeDe(data, res.status))
      err.status = res.status
      err.payload = data
      throw err
    }
    return data
  }

  async function json(path, method, body) {
    const res = await fetch(`${API_BASE}/caja-menor${path}`, {
      method,
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    })
    return leer(res)
  }

  async function form(path, fd, method = 'POST') {
    const res = await fetch(`${API_BASE}/caja-menor${path}`, {
      method,
      headers: auth(),
      body: fd,
    })
    return leer(res)
  }

  async function blob(path, nombre) {
    const res = await fetch(`${API_BASE}/caja-menor${path}`, { headers: auth() })
    if (!res.ok) {
      const text = await res.text()
      let data = null
      try { data = JSON.parse(text) } catch { data = null }
      const err = new Error(mensajeDe(data, res.status))
      err.status = res.status
      throw err
    }
    const file = await res.blob()
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  return {
    listar: (contratoId) => json(`/${contratoId}/cajas`, 'GET'),
    responsables: (contratoId) => json(`/${contratoId}/responsables`, 'GET'),
    tercero: (contratoId, documento) => json(
      `/${contratoId}/terceros?documento=${encodeURIComponent(documento || '')}`,
      'GET',
    ),
    detalle: (contratoId, cajaId) => json(`/${contratoId}/cajas/${cajaId}`, 'GET'),
    crear: (contratoId, responsableId) => json(`/${contratoId}/cajas`, 'POST', { responsable_id: responsableId }),
    meta: (contratoId, cajaId, body) => json(`/${contratoId}/cajas/${cajaId}`, 'PATCH', body),
    cierre: (contratoId, cajaId) => json(`/${contratoId}/cajas/${cajaId}/cierre`, 'POST', {}),
    eliminar: (contratoId, cajaId) => json(`/${contratoId}/cajas/${cajaId}`, 'DELETE'),
    ingreso: (contratoId, cajaId, fd) => form(`/${contratoId}/cajas/${cajaId}/ingresos`, fd),
    eliminarIngreso: (contratoId, cajaId, ingresoId) => json(
      `/${contratoId}/cajas/${cajaId}/ingresos/${ingresoId}`,
      'DELETE',
    ),
    ocr: (contratoId, fd) => form(`/${contratoId}/ocr`, fd),
    gasto: (contratoId, cajaId, fd) => form(`/${contratoId}/cajas/${cajaId}/gastos`, fd),
    editarGasto: (contratoId, cajaId, gastoId, fd) => form(
      `/${contratoId}/cajas/${cajaId}/gastos/${gastoId}`,
      fd,
      'PATCH',
    ),
    eliminarGasto: (contratoId, cajaId, gastoId) => json(
      `/${contratoId}/cajas/${cajaId}/gastos/${gastoId}`,
      'DELETE',
    ),
    validar: (contratoId, cajaId, gastoId, body) => json(
      `/${contratoId}/cajas/${cajaId}/gastos/${gastoId}/validar`,
      'POST',
      body,
    ),
    excel: (contratoId, cajaId, nombre) => blob(`/${contratoId}/cajas/${cajaId}/export.xlsx`, nombre),
    pdf: (contratoId, cajaId, nombre) => blob(`/${contratoId}/cajas/${cajaId}/recibos.pdf`, nombre),
    async soporteUrl(contratoId, cajaId, kind, itemId) {
      const res = await fetch(
        `${API_BASE}/caja-menor/${contratoId}/cajas/${cajaId}/soportes/${kind}/${itemId}`,
        { headers: auth() },
      )
      if (!res.ok) throw new Error('No se pudo abrir la imagen.')
      const file = await res.blob()
      return URL.createObjectURL(file)
    },
  }
}

export function fdGasto(draft, file, confirmar) {
  const fd = new FormData()
  fd.append('fecha', draft.fecha || '')
  fd.append('tercero_razon_social', draft.tercero_razon_social || '')
  fd.append('tercero_documento', draft.tercero_documento || '')
  fd.append('descripcion', draft.descripcion || '')
  fd.append('documento_no', draft.documento_no || '')
  fd.append('centro_costos', draft.centro_costos || '')
  fd.append('valor_bruto', draft.valor_bruto === '' || draft.valor_bruto == null ? '0' : String(draft.valor_bruto))
  fd.append('iva', draft.iva === '' || draft.iva == null ? '0' : String(draft.iva))
  fd.append('retenciones', draft.retenciones === '' || draft.retenciones == null ? '0' : String(draft.retenciones))
  fd.append('impuesto_consumo', draft.impuesto_consumo === '' || draft.impuesto_consumo == null ? '0' : String(draft.impuesto_consumo))
  fd.append('otros_deducibles', draft.otros_deducibles === '' || draft.otros_deducibles == null ? '0' : String(draft.otros_deducibles))
  fd.append('confirmar_duplicado', confirmar ? '1' : '0')
  if (file) fd.append('soporte', file, file.name || 'soporte.jpg')
  return fd
}

export function fdIngreso(fecha, valor, file) {
  const fd = new FormData()
  fd.append('fecha', fecha || '')
  fd.append('valor', String(valor ?? ''))
  if (file) fd.append('soporte', file, file.name || 'consignacion.jpg')
  return fd
}
