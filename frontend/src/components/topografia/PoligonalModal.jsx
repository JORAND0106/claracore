import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TopoAngularInput from './TopoAngularInput'
import PoligonalCalculoTable from './PoligonalCalculoTable'
import PoligonalCierrePanel from './PoligonalCierrePanel'
import PoligonalGrafico from './PoligonalGrafico'
import PoligonalValidacionPanel from './PoligonalValidacionPanel'
import FirmaPerfilTopo from './FirmaPerfilTopo'
import {
  useTopoTheme,
  parseApiError,
  puede,
} from './topografiaShared'
import { decimalToGms, fmtRatio, validarGms } from '../../utils/topografia_angular'

/** Metros desde input (acepta coma decimal). */
function parseMetrosInput(v) {
  if (v === '' || v == null) return null
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const th = { textAlign: 'left', padding: 8, borderBottom: '2px solid #cbd5e1', fontSize: 'var(--cc-xs)' }
const td = { padding: 8, fontSize: 'var(--cc-xs)', borderBottom: '1px solid #e2e8f0' }

function CampoLabel({ texto, ayuda }) {
  return (
    <span
      style={{
        fontSize: 'var(--cc-xs)',
        color: '#64748b',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        minHeight: 16,
      }}
    >
      {texto}
      {ayuda && (
        <span
          title={ayuda}
          aria-label={ayuda}
          style={{
            display: 'inline-flex',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#cbd5e1',
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'help',
            flexShrink: 0,
          }}
        >
          ?
        </span>
      )}
    </span>
  )
}

const setupField = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }

const emptyForm = {
  nombre: '',
  tipo: 'cerrada',
  sentido: 'antihorario',
  tolerancia_relativa: 20000,
  tolerancia_cota_mm_km: 12,
  precision_angular_seg: 10,
  longitud_max_delta_m: 300,
  amarreModo: 'inline',
  punto_inicial_id: '',
  amarre: { nombre: '', norte: '', este: '', cota: '' },
  visadoModo: 'inline',
  punto_visado_id: '',
  visado: { nombre: '', norte: '', este: '', cota: '' },
  finalModo: 'inline',
  punto_final_id: '',
  llegada: { nombre: '', norte: '', este: '', cota: '' },
  operador: '',
  fecha_campo: '',
  observaciones: '',
  equipo_marca: '',
  equipo_referencia: '',
  equipo_serial: '',
}

export default function PoligonalModal({
  open,
  onClose,
  onSaved,
  contratoId,
  api,
  permisos,
  theme: themeProp,
  poligonalId: initialPoligonalId = null,
  initialDetalle = null,
  puntosVerificados = [],
  modoInicial = 'editar',
  usuario = null,
  token = null,
}) {
  const ui = useTopoTheme()
  const theme = themeProp || ui.t
  const [step, setStep] = useState('chooseTipo')
  const [poligonalId, setPoligonalId] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [errorModal, setErrorModal] = useState(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState(emptyForm)
  const [operadores, setOperadores] = useState([])

  const [estForm, setEstForm] = useState({
    tipo_punto: 'auxiliar',
    nombre_punto: '',
    angulo_gms: '',
    angulo_vertical_gms: '',
    distancia: '',
    altura_objetivo: '',
  })

  const resetEstForm = () => ({
    tipo_punto: 'auxiliar',
    nombre_punto: '',
    angulo_gms: '',
    angulo_vertical_gms: '',
    distancia: '',
    altura_objetivo: '',
  })

  const [editandoId, setEditandoId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [ultimaSync, setUltimaSync] = useState(null)
  const [syncMsg, setSyncMsg] = useState(null)
  const [modo, setModo] = useState('editar')
  const formRef = useRef(null)
  const [armadaForm, setArmadaForm] = useState({ estacion_nombre: '', visado_nombre: '', altura_instrumento: '' })
  const [mostrarCambioArmada, setMostrarCambioArmada] = useState(false)

  const showError = useCallback((err) => {
    const parsed = parseApiError(err?.message || String(err))
    setErrorModal(parsed)
  }, [])

  const aplicarDetalle = useCallback((data, id) => {
    setDetalle(data)
    setPoligonalId(id)
    setStep('estaciones')
    setEditandoId(null)
    setEstForm(resetEstForm())
    setUltimaSync(Date.now())
    if (!data?.poligonal) return
    const pi = data.punto_inicial
    const pv = data.punto_visado
    setForm({
      nombre: data.poligonal.nombre || '',
      tipo: data.poligonal.tipo || 'cerrada',
      sentido: data.poligonal.sentido || 'antihorario',
      tolerancia_relativa: data.poligonal.tolerancia_relativa ?? 20000,
      tolerancia_cota_mm_km: data.poligonal.tolerancia_cota_mm_km ?? 12,
      precision_angular_seg: data.poligonal.precision_angular_seg ?? 10,
      longitud_max_delta_m: data.poligonal.longitud_max_delta_m ?? 300,
      amarreModo: pi?.verificado ? 'biblioteca' : 'inline',
      punto_inicial_id: data.poligonal.punto_inicial_id || '',
      amarre: {
        nombre: pi?.nombre || '',
        norte: pi?.norte ?? '',
        este: pi?.este ?? '',
        cota: pi?.cota ?? '',
      },
      visadoModo: pv?.verificado ? 'biblioteca' : 'inline',
      punto_visado_id: data.poligonal.punto_visado_id || '',
      visado: {
        nombre: pv?.nombre || '',
        norte: pv?.norte ?? '',
        este: pv?.este ?? '',
        cota: pv?.cota ?? '',
      },
      finalModo: data.punto_final?.verificado ? 'biblioteca' : 'inline',
      punto_final_id: data.poligonal.punto_final_id || '',
      llegada: {
        nombre: data.punto_final?.nombre || '',
        norte: data.punto_final?.norte ?? '',
        este: data.punto_final?.este ?? '',
        cota: data.punto_final?.cota ?? '',
      },
      operador: data.poligonal.operador || '',
      fecha_campo: data.poligonal.fecha_campo || '',
      observaciones: data.poligonal.observaciones || '',
      equipo_marca: data.poligonal.equipo_marca || '',
      equipo_referencia: data.poligonal.equipo_referencia || '',
      equipo_serial: data.poligonal.equipo_serial || '',
    })
  }, [])

  const cargarDetalle = useCallback(async (id, opts = {}) => {
    const { silencioso = false } = opts
    if (!silencioso) setRefreshing(true)
    try {
      const data = await api(`/poligonales/${id}?_=${Date.now()}`)
      aplicarDetalle(data, id)
    } finally {
      if (!silencioso) setRefreshing(false)
    }
  }, [api, aplicarDetalle])

  const sincronizarDetalle = useCallback(async (mensaje) => {
    if (!poligonalId) return
    await cargarDetalle(poligonalId)
    onSaved?.(poligonalId)
    if (mensaje) {
      setSyncMsg(mensaje)
      window.setTimeout(() => setSyncMsg(null), 4500)
    }
  }, [poligonalId, cargarDetalle, onSaved])

  const ajustarPoligonal = async () => {
    if (!poligonalId) return
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/calcular`, { method: 'POST' })
      await sincronizarDetalle('Poligonal corregida y ajustada. Coordenadas listas para validación.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (open) setModo(modoInicial || 'editar')
    if (!open) return
    setResultado(null)
    setErrorModal(null)
    api('/operadores')
      .then((rows) => setOperadores(Array.isArray(rows) ? rows : []))
      .catch(() => setOperadores([]))
    if (initialPoligonalId) {
      const cacheOk = initialDetalle?.poligonal?.id === initialPoligonalId
      if (cacheOk) {
        aplicarDetalle(initialDetalle, initialPoligonalId)
        cargarDetalle(initialPoligonalId, { silencioso: true }).catch(showError)
      } else {
        cargarDetalle(initialPoligonalId).catch(showError)
      }
    } else {
      setStep('chooseTipo')
      setPoligonalId(null)
      setDetalle(null)
      setForm(emptyForm)
      setEstForm(resetEstForm())
      setEditandoId(null)
      setMostrarCambioArmada(false)
      setArmadaForm({ estacion_nombre: '', visado_nombre: '', altura_instrumento: '' })
    }
  }, [open, initialPoligonalId, initialDetalle, modoInicial, aplicarDetalle, cargarDetalle, showError, api])

  const puntoBiblioteca = useMemo(
    () => puntosVerificados.find((p) => p.id === form.punto_inicial_id),
    [puntosVerificados, form.punto_inicial_id],
  )

  const previewBase = useMemo(() => {
    const ne = Number(form.amarre.norte)
    const ee = Number(form.amarre.este)
    const nv = Number(form.visado.norte)
    const ev = Number(form.visado.este)
    if (form.amarre.norte === '' || form.amarre.este === '' || form.visado.norte === '' || form.visado.este === '') return null
    if (![ne, ee, nv, ev].every(Number.isFinite)) return null
    const dn = nv - ne
    const de = ev - ee
    const distancia = Math.sqrt(dn * dn + de * de)
    if (distancia === 0) return null
    let az = (Math.atan2(de, dn) * 180) / Math.PI
    if (az < 0) az += 360
    return { azimutDecimal: az, azimutTexto: decimalToGms(az), distancia }
  }, [form.amarre.norte, form.amarre.este, form.visado.norte, form.visado.este])

  const seleccionarBmBiblioteca = (id) => {
    const p = puntosVerificados.find((x) => x.id === id)
    if (!p) {
      setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '' })
      return
    }
    setForm({
      ...form,
      amarreModo: 'biblioteca',
      punto_inicial_id: id,
      amarre: {
        nombre: p.nombre,
        norte: p.norte ?? '',
        este: p.este ?? '',
        cota: p.cota ?? '',
      },
    })
  }

  const seleccionarVisadoBiblioteca = (id) => {
    const p = puntosVerificados.find((x) => x.id === id)
    if (!p) {
      setForm({ ...form, visadoModo: 'inline', punto_visado_id: '' })
      return
    }
    setForm({
      ...form,
      visadoModo: 'biblioteca',
      punto_visado_id: id,
      visado: {
        nombre: p.nombre,
        norte: p.norte ?? '',
        este: p.este ?? '',
        cota: p.cota ?? '',
      },
    })
  }

  const seleccionarLlegadaBiblioteca = (id) => {
    const p = puntosVerificados.find((x) => x.id === id)
    if (!p) {
      setForm({ ...form, finalModo: 'inline', punto_final_id: '' })
      return
    }
    setForm({
      ...form,
      finalModo: 'biblioteca',
      punto_final_id: id,
      llegada: {
        nombre: p.nombre,
        norte: p.norte ?? '',
        este: p.este ?? '',
        cota: p.cota ?? '',
      },
    })
  }

  const elegirTipoPoligonal = (tipo) => {
    setForm({ ...emptyForm, tipo, nombre: form.nombre || '' })
    setStep('setup')
  }

  const iniciarPoligonal = async () => {
    if (!form.nombre.trim()) {
      setErrorModal({
        titulo: 'Nombre requerido',
        mensaje: 'Indique un nombre para identificar la poligonal (ej. Poligonal 1).',
      })
      return
    }
    if (form.amarreModo === 'biblioteca') {
      if (!form.punto_inicial_id) {
        setErrorModal({
          titulo: 'Punto de amarre requerido',
          mensaje: 'Seleccione un BM verificado de la biblioteca o ingrese las coordenadas del punto de amarre.',
        })
        return
      }
    } else if (!form.amarre.nombre.trim() || form.amarre.norte === '' || form.amarre.este === '' || form.amarre.cota === '') {
      setErrorModal({
        titulo: 'Punto de estacion requerido',
        mensaje: 'Indique nombre, Norte, Este y Cota del punto de estacion. La cota es necesaria para el calculo trigonométrico.',
      })
      return
    }
    if (form.visadoModo === 'biblioteca') {
      if (!form.punto_visado_id) {
        setErrorModal({
          titulo: 'Punto de visado requerido',
          mensaje: 'Seleccione un BM verificado de la biblioteca o ingrese las coordenadas del punto de visado.',
        })
        return
      }
    } else if (!form.visado.nombre.trim() || form.visado.norte === '' || form.visado.este === '') {
      setErrorModal({
        titulo: 'Punto de visado requerido',
        mensaje: 'Indique nombre, Norte y Este del punto de visado. Con estas coordenadas se calcula el azimut de partida de la base.',
      })
      return
    }
    if (form.tipo === 'abierta') {
      if (form.finalModo === 'biblioteca') {
        if (!form.punto_final_id) {
          setErrorModal({
            titulo: 'Punto de llegada requerido',
            mensaje: 'Seleccione el BM de llegada o ingrese sus coordenadas.',
          })
          return
        }
      } else if (!form.llegada.nombre.trim() || form.llegada.norte === '' || form.llegada.este === '') {
        setErrorModal({
          titulo: 'Llegada requerida',
          mensaje: 'Indique nombre, Norte y Este del punto de llegada (cierre de la poligonal abierta).',
        })
        return
      }
    }
    setBusy(true)
    try {
      const payload = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        sentido: form.sentido,
        metodo: 'trigonometrica',
        tolerancia_relativa: Number(form.tolerancia_relativa) || 20000,
        tolerancia_cota_mm_km: Number(form.tolerancia_cota_mm_km) || 12,
        precision_angular_seg: Number(form.precision_angular_seg) || 10,
        longitud_max_delta_m: Number(form.longitud_max_delta_m) || 300,
        operador: form.operador || null,
        fecha_campo: form.fecha_campo || null,
        observaciones: form.observaciones || null,
        equipo_marca: form.equipo_marca?.trim() || null,
        equipo_referencia: form.equipo_referencia?.trim() || null,
        equipo_serial: form.equipo_serial?.trim() || null,
      }
      if (form.amarreModo === 'biblioteca') {
        payload.punto_inicial_id = form.punto_inicial_id
      } else {
        payload.amarre_inicial = {
          nombre: form.amarre.nombre.trim(),
          norte: Number(form.amarre.norte),
          este: Number(form.amarre.este),
          cota: form.amarre.cota === '' ? null : Number(form.amarre.cota),
        }
      }
      if (form.tipo === 'abierta') {
        if (form.finalModo === 'biblioteca') {
          payload.punto_final_id = form.punto_final_id
        } else {
          payload.amarre_final = {
            nombre: form.llegada.nombre.trim(),
            norte: Number(form.llegada.norte),
            este: Number(form.llegada.este),
            cota: form.llegada.cota === '' ? null : Number(form.llegada.cota),
          }
        }
      }
      if (form.visadoModo === 'biblioteca') {
        payload.punto_visado_id = form.punto_visado_id
      } else {
        payload.amarre_visado = {
          nombre: form.visado.nombre.trim(),
          norte: Number(form.visado.norte),
          este: Number(form.visado.este),
          cota: form.visado.cota === '' ? null : Number(form.visado.cota),
        }
      }
      const row = await api('/poligonales', { method: 'POST', body: JSON.stringify(payload) })
      if (row?.id) {
        await cargarDetalle(row.id)
        onSaved?.(row.id)
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const agregarPunto = async () => {
    if (!poligonalId) return
    if (!estForm.nombre_punto.trim()) {
      setErrorModal({ titulo: 'Nombre del punto', mensaje: 'Escriba el nombre del punto observado (estacion auxiliar o vertice).' })
      return
    }
    if (!estForm.angulo_gms) {
      setErrorModal({ titulo: 'Angulo horizontal requerido', mensaje: 'Ingrese el angulo horizontal observado en formato GG.MMSS.' })
      return
    }
    if (estForm.distancia !== '' && Number(estForm.distancia) < 0) {
      setErrorModal({ titulo: 'Distancia invalida', mensaje: 'La distancia horizontal no puede ser negativa (metros).' })
      return
    }
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/estaciones`, {
        method: 'POST',
        body: JSON.stringify({
          tipo_punto: estForm.tipo_punto,
          nombre_punto: estForm.nombre_punto.trim(),
          angulo_gms: Number(estForm.angulo_gms),
          angulo_vertical_gms: estForm.angulo_vertical_gms === '' || estForm.angulo_vertical_gms == null ? null : Number(estForm.angulo_vertical_gms),
          distancia: estForm.distancia === '' || estForm.distancia == null ? null : Number(estForm.distancia),
          altura_objetivo: estForm.altura_objetivo === '' ? 0 : Number(estForm.altura_objetivo),
        }),
      })
      setEstForm(resetEstForm())
      setResultado(null)
      await sincronizarDetalle('Punto agregado. Cartera actualizada.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const iniciarEdicion = (p) => {
    setEditandoId(p.id)
    setEstForm({
      tipo_punto: p.tipo_punto || 'auxiliar',
      nombre_punto: p.nombre_punto || '',
      angulo_gms: p.angulo_observado_gms ?? '',
      angulo_vertical_gms: p.angulo_vertical_gms ?? '',
      distancia: p.distancia ?? '',
      altura_objetivo: p.altura_objetivo ?? '',
    })
    setTimeout(() => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 50)
  }

  const cancelarEdicion = () => {
    setEditandoId(null)
    setEstForm(resetEstForm())
  }

  const guardarEdicion = async () => {
    if (!poligonalId || !editandoId) return
    if (!estForm.nombre_punto.trim()) {
      setErrorModal({ titulo: 'Nombre del punto', mensaje: 'Escriba el nombre del punto observado.' })
      return
    }
    if (estForm.angulo_gms === '' || estForm.angulo_gms == null) {
      setErrorModal({ titulo: 'Angulo requerido', mensaje: 'Ingrese el angulo horizontal observado (GG.MMSS).' })
      return
    }
    const angGms = Number(estForm.angulo_gms)
    if (!Number.isFinite(angGms) || !validarGms(angGms)) {
      setErrorModal({ titulo: 'Angulo invalido', mensaje: 'Use formato GG.MMSS (minutos y segundos menores a 60).' })
      return
    }
    const dist = parseMetrosInput(estForm.distancia)
    if (estForm.distancia !== '' && estForm.distancia != null && dist == null) {
      setErrorModal({ titulo: 'Distancia invalida', mensaje: 'Ingrese la distancia en metros (use punto o coma decimal).' })
      return
    }
    if (dist != null && dist < 0) {
      setErrorModal({ titulo: 'Distancia invalida', mensaje: 'La distancia horizontal no puede ser negativa (metros).' })
      return
    }
    setBusy(true)
    try {
      const av =
        estForm.angulo_vertical_gms === '' || estForm.angulo_vertical_gms == null
          ? null
          : Number(estForm.angulo_vertical_gms)
      const payload = {
        tipo_punto: estForm.tipo_punto,
        nombre_punto: estForm.nombre_punto.trim(),
        angulo_gms: angGms,
        angulo_vertical_gms: av != null && Number.isFinite(av) ? av : null,
        distancia: dist,
        altura_objetivo: parseMetrosInput(estForm.altura_objetivo) ?? 0,
      }
      await api(`/poligonales/${poligonalId}/estaciones/${editandoId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setResultado(null)
      await sincronizarDetalle('Punto guardado. Revise la cartera consolidada abajo.')
      cancelarEdicion()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const cerrarCircuito = async () => {
    if (!poligonalId) return
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/cerrar`, { method: 'POST' })
      setResultado(null)
      await sincronizarDetalle('Poligonal terminada. Pendiente validación contratista e interventoría.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const eliminarPunto = async (estacionId) => {
    if (!poligonalId || !estacionId) return
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/estaciones/${estacionId}`, { method: 'DELETE' })
      setResultado(null)
      await sincronizarDetalle('Punto eliminado.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const cambiarSentido = async (nuevo) => {
    if (!poligonalId) return
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/sentido`, { method: 'POST', body: JSON.stringify({ sentido: nuevo }) })
      setForm((f) => ({ ...f, sentido: nuevo }))
      setResultado(null)
      await sincronizarDetalle()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const crearArmada = async () => {
    if (!poligonalId) return
    if (!armadaForm.estacion_nombre || !armadaForm.visado_nombre) {
      setErrorModal({ titulo: 'Cambio de armada', mensaje: 'Seleccione la nueva estacion (punto tipo estacion ya radiado) y el visado de atras.' })
      return
    }
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/armadas`, {
        method: 'POST',
        body: JSON.stringify({
          estacion_nombre: armadaForm.estacion_nombre,
          visado_nombre: armadaForm.visado_nombre,
          altura_instrumento: armadaForm.altura_instrumento === '' ? null : Number(armadaForm.altura_instrumento),
        }),
      })
      setArmadaForm({ estacion_nombre: '', visado_nombre: '', altura_instrumento: '' })
      setMostrarCambioArmada(false)
      setResultado(null)
      await sincronizarDetalle('Armada creada.')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const actualizarHIArmada = async (armadaId, hi) => {
    if (!poligonalId || !armadaId) return
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/armadas/${armadaId}`, {
        method: 'PUT',
        body: JSON.stringify({ altura_instrumento: hi === '' ? null : Number(hi) }),
      })
      setResultado(null)
      await sincronizarDetalle()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const guardarAmarres = async () => {
    if (!poligonalId) return
    const build = (a, etiqueta) => {
      if (!a.nombre?.trim()) {
        setErrorModal({ titulo: 'Amarre incompleto', mensaje: `Indique el nombre del punto de ${etiqueta}.` })
        return null
      }
      const norte = parseMetrosInput(a.norte)
      const este = parseMetrosInput(a.este)
      if (norte == null || este == null) {
        setErrorModal({ titulo: 'Coordenadas requeridas', mensaje: `Norte y Este del ${etiqueta} son obligatorios (metros).` })
        return null
      }
      const cotaRaw = a.cota === '' || a.cota == null ? null : parseMetrosInput(a.cota)
      if (a.cota !== '' && a.cota != null && cotaRaw == null) {
        setErrorModal({ titulo: 'Cota invalida', mensaje: `Revise la cota del ${etiqueta}.` })
        return null
      }
      return { nombre: a.nombre.trim(), norte, este, cota: cotaRaw }
    }
    const estacion = build(form.amarre, 'estación (amarre)')
    if (!estacion) return
    const visado = build(form.visado, 'visado')
    if (!visado) return
    const payload = { estacion, visado }
    if (detalle?.poligonal?.tipo === 'abierta') {
      const llegada = build(form.llegada, 'llegada')
      if (!llegada) return
      payload.llegada = llegada
    }
    const teniaAjuste = Boolean(detalle?.poligonal?.ajustada_at)
    setBusy(true)
    try {
      const data = await api(`/poligonales/${poligonalId}/amarres`, {
        method: 'PUT',
        body: JSON.stringify({ estacion, visado }),
      })
      if (data?.poligonal) {
        aplicarDetalle(data, poligonalId)
        onSaved?.(poligonalId)
      } else {
        await sincronizarDetalle()
      }
      setSyncMsg(
        teniaAjuste
          ? 'Amarres actualizados. Ejecute «Corregir y ajustar» para recalcular la poligonal.'
          : 'Coordenadas de amarre actualizadas. Cartera recalculada.'
      )
      window.setTimeout(() => setSyncMsg(null), 5000)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const overlay = {
    position: 'fixed',
    inset: 0,
    zIndex: 100010,
    background: 'rgba(15, 23, 42, 0.5)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '24px 16px',
    overflowY: 'auto',
  }

  const panel = {
    width: '100%',
    maxWidth: 1560,
    background: ui.card.background,
    borderRadius: 14,
    border: ui.card.border,
    boxShadow: theme?.shadow || ui.t?.shadow || '0 24px 64px rgba(0,0,0,0.25)',
    color: ui.text,
    padding: 20,
  }

  return (
    <>
      <div style={overlay} onClick={onClose}>
        <div style={panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--cc-lg)' }}>
                {step === 'chooseTipo'
                  ? 'Nueva poligonal'
                  : step === 'setup'
                    ? `Nueva poligonal ${form.tipo === 'abierta' ? 'abierta' : 'cerrada'}`
                    : (() => {
                        const p = detalle?.poligonal
                        const selladaT = (p?.nivel2_estado || '') === 'Aprobado' || Boolean(p?.biblioteca_at)
                        const terminadaT = p?.estado === 'cerrado'
                        const nombre = p?.nombre || 'Poligonal'
                        if (terminadaT && selladaT) return `Ver · ${nombre}`
                        if (terminadaT) return `Validar · ${nombre}`
                        return `Editar · ${nombre}`
                      })()}
              </h2>
              {step === 'estaciones' && (
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 'var(--cc-sm)' }}>
                  {detalle?.poligonal?.estado === 'cerrado'
                    ? 'Coordenadas calculadas y validación.'
                    : 'Libreta de cálculo — ingrese observaciones y termine cuando el cierre sea admisible.'}
                </p>
              )}
              {step !== 'estaciones' && (
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 'var(--cc-sm)' }}>
                Poligonal trigonométrica — ingrese estaciones con angulos horizontal/vertical, HI y distancia.
              </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {step === 'estaciones' && poligonalId && (
                <button
                  type="button"
                  style={ui.btnSecondary}
                  title="Vuelve a leer la poligonal del servidor y recalcula la cartera"
                  onClick={() => sincronizarDetalle('Cartera actualizada desde el servidor.')}
                  disabled={busy || refreshing}
                >
                  {refreshing ? 'Actualizando…' : 'Actualizar'}
                </button>
              )}
              <button type="button" style={ui.btnSecondary} onClick={onClose}>Cerrar</button>
            </div>
          </div>
          {syncMsg && (
            <p style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, background: '#ecfdf5', color: '#047857', fontSize: 'var(--cc-sm)' }}>
              {syncMsg}
            </p>
          )}

          {step === 'chooseTipo' && (
            <div>
              <p style={{ margin: '0 0 16px', fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                Elija el tipo de circuito. La libreta, cálculos y PDF comparten el mismo formato; la abierta cierra al punto de llegada.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => elegirTipoPoligonal('cerrada')}
                  style={{
                    textAlign: 'left',
                    padding: 16,
                    borderRadius: 10,
                    border: `2px solid ${ui.accent}`,
                    background: ui.accentSoft,
                    cursor: 'pointer',
                    color: ui.text,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: ui.accent, marginBottom: 6 }}>Poligonal cerrada</div>
                  <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                    Inicio = estación + visado. El circuito regresa al punto inicial. Cierre angular y lineal al amarre de partida.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => elegirTipoPoligonal('abierta')}
                  style={{
                    textAlign: 'left',
                    padding: 16,
                    borderRadius: 10,
                    border: `2px solid ${ui.accent}`,
                    background: ui.accentSoft,
                    cursor: 'pointer',
                    color: ui.text,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: ui.accent, marginBottom: 6 }}>Poligonal abierta</div>
                  <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                    Inicio = estación + visado + <strong>llegada</strong> (coordenada objetivo). El cierre se calcula contra la llegada, no al inicio.
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === 'setup' && (
            <div>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={ui.btnSecondary} onClick={() => setStep('chooseTipo')}>← Cambiar tipo</button>
                <span style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: ui.accentSoft, color: ui.accent }}>
                  {form.tipo === 'abierta' ? 'Abierta' : 'Cerrada'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 10, marginBottom: 16, alignItems: 'end' }}>
                <label style={setupField}>
                  <CampoLabel texto="Nombre" ayuda="Nombre del circuito en la libreta de cálculo." />
                  <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={ui.inputStyle} placeholder="Poligonal 1" />
                </label>
                <label style={setupField}>
                  <CampoLabel
                    texto="Sentido"
                    ayuda="Sentido de recorrido de la poligonal. Horario aplica ángulos exteriores (n+2)×180°; antihorario aplica interiores (n−2)×180°."
                  />
                  <select value={form.sentido} onChange={(e) => setForm({ ...form, sentido: e.target.value })} style={ui.inputStyle}>
                    <option value="antihorario">Antihorario (interiores)</option>
                    <option value="horario">Horario (exteriores)</option>
                  </select>
                </label>
                <label style={setupField}>
                  <CampoLabel
                    texto="Plano"
                    ayuda="Tolerancia de cierre lineal en planta (1:N). Res. 643 Tabla 2: menor a 1 000 m² → 1:20 000; hasta 1 ha → 1:15 000; hasta 10 ha → 1:10 000; ≥10 ha → 1:5 000."
                  />
                  <input type="number" value={form.tolerancia_relativa} onChange={(e) => setForm({ ...form, tolerancia_relativa: e.target.value })} style={ui.inputStyle} />
                </label>
                <label style={setupField}>
                  <CampoLabel
                    texto="Angular"
                    ayuda={'Precisión angular del equipo (segundos). Tolerancia angular = este valor × √vértices (Res. 643 §9.2.2).'}
                  />
                  <input type="number" step="0.1" value={form.precision_angular_seg} onChange={(e) => setForm({ ...form, precision_angular_seg: e.target.value })} style={ui.inputStyle} placeholder="10" />
                </label>
                <label style={setupField}>
                  <CampoLabel
                    texto="Deltas"
                    ayuda="Longitud máxima recomendada entre deltas consecutivos (m). Referencia técnica 250–300 m; configurable."
                  />
                  <input type="number" value={form.longitud_max_delta_m} onChange={(e) => setForm({ ...form, longitud_max_delta_m: e.target.value })} style={ui.inputStyle} placeholder="300" />
                </label>
                <label style={setupField}>
                  <CampoLabel
                    texto="Cota"
                    ayuda="Tolerancia de cierre en cota (mm/km de recorrido)."
                  />
                  <input type="number" value={form.tolerancia_cota_mm_km} onChange={(e) => setForm({ ...form, tolerancia_cota_mm_km: e.target.value })} style={ui.inputStyle} />
                </label>
                <label style={setupField}>
                  <CampoLabel texto="Operador" ayuda="Profesional responsable del levantamiento en campo." />
                  <select value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} style={ui.inputStyle}>
                    <option value="">— Seleccione —</option>
                    {operadores.map((u) => (
                      <option key={u.id} value={u.nombre}>{u.nombre}{u.cargo ? ` (${u.cargo})` : ''}</option>
                    ))}
                    {form.operador && !operadores.some((u) => u.nombre === form.operador) && (
                      <option value={form.operador}>{form.operador}</option>
                    )}
                  </select>
                </label>
                <label style={setupField}>
                  <CampoLabel texto="Fecha" ayuda="Fecha en que se realizó el trabajo de campo." />
                  <input type="date" value={form.fecha_campo} onChange={(e) => setForm({ ...form, fecha_campo: e.target.value })} style={ui.inputStyle} />
                </label>
              </div>

              <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 14, marginBottom: 16, background: '#fff' }}>
                <h4 style={{ margin: '0 0 8px' }}>Equipo de medición</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
                  <label style={setupField}>
                    <CampoLabel texto="Marca" ayuda="Fabricante del instrumento (estación total, GPS, etc.)." />
                    <input value={form.equipo_marca} onChange={(e) => setForm({ ...form, equipo_marca: e.target.value })} style={ui.inputStyle} placeholder="Ej. Leica" />
                  </label>
                  <label style={setupField}>
                    <CampoLabel texto="Modelo" ayuda="Referencia o modelo del equipo usado en campo." />
                    <input value={form.equipo_referencia} onChange={(e) => setForm({ ...form, equipo_referencia: e.target.value })} style={ui.inputStyle} placeholder="Ej. TS16" />
                  </label>
                  <label style={setupField}>
                    <CampoLabel texto="Serie" ayuda="Número de serie del instrumento según placa o factura." />
                    <input value={form.equipo_serial} onChange={(e) => setForm({ ...form, equipo_serial: e.target.value })} style={ui.inputStyle} placeholder="Ej. 123456" />
                  </label>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fafc' }}>
                <h4 style={{ margin: '0 0 8px' }}>Puntos de amarre (estacion y visado)</h4>
                <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', color: '#64748b' }}>
                  Defina el punto de estacion (inicio del circuito) y el punto de visado (referencia). Con ambas coordenadas se calcula el azimut y la distancia de la base de partida. Al terminar con cierre admisible, la poligonal queda lista para validación; la biblioteca se publica cuando interventoría aprueba.
                </p>

                {puntosVerificados.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 12, alignItems: 'end' }}>
                    <label style={setupField}>
                      <CampoLabel texto="Estación" ayuda="Seleccione un BM verificado como punto de estación (amarre inicial), o ingrese coordenadas manualmente abajo." />
                      <select
                        value={form.amarreModo === 'biblioteca' ? form.punto_inicial_id : ''}
                        onChange={(e) => seleccionarBmBiblioteca(e.target.value)}
                        style={ui.inputStyle}
                      >
                        <option value="">— Manual —</option>
                        {puntosVerificados.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
                        ))}
                      </select>
                    </label>
                    <label style={setupField}>
                      <CampoLabel texto="Visado" ayuda="Seleccione un BM verificado como punto de visado (referencia atrás), o ingrese coordenadas manualmente abajo." />
                      <select
                        value={form.visadoModo === 'biblioteca' ? form.punto_visado_id : ''}
                        onChange={(e) => seleccionarVisadoBiblioteca(e.target.value)}
                        style={ui.inputStyle}
                      >
                        <option value="">— Manual —</option>
                        {puntosVerificados.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
                        ))}
                      </select>
                    </label>
                    {form.tipo === 'abierta' && (
                      <label style={setupField}>
                        <CampoLabel texto="Llegada" ayuda="Seleccione un BM verificado como punto de llegada (objetivo del cierre), o ingrese coordenadas manualmente abajo." />
                        <select
                          value={form.finalModo === 'biblioteca' ? form.punto_final_id : ''}
                          onChange={(e) => seleccionarLlegadaBiblioteca(e.target.value)}
                          style={ui.inputStyle}
                        >
                          <option value="">— Manual —</option>
                          {puntosVerificados.map((p) => (
                            <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: 560, width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={th}>Rol</th>
                        <th style={th}>Punto</th>
                        <th style={th}>Norte</th>
                        <th style={th}>Este</th>
                        <th style={th}>Cota</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ ...td, fontWeight: 600 }}>Estacion</td>
                        <td style={td}>
                          <input
                            value={form.amarre.nombre}
                            disabled={form.amarreModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, nombre: e.target.value } })}
                            style={ui.inputStyle}
                            placeholder="EST-1"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={form.amarre.norte}
                            disabled={form.amarreModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, norte: e.target.value } })}
                            style={ui.inputStyle}
                            placeholder="0.000"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={form.amarre.este}
                            disabled={form.amarreModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, este: e.target.value } })}
                            style={ui.inputStyle}
                            placeholder="0.000"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={form.amarre.cota}
                            disabled={form.amarreModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, cota: e.target.value } })}
                            style={ui.inputStyle}
                            placeholder="Cota"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ ...td, fontWeight: 600 }}>Visado</td>
                        <td style={td}>
                          <input
                            value={form.visado.nombre}
                            disabled={form.visadoModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, visadoModo: 'inline', punto_visado_id: '', visado: { ...form.visado, nombre: e.target.value } })}
                            style={ui.inputStyle}
                            placeholder="VIS-1"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={form.visado.norte}
                            disabled={form.visadoModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, visadoModo: 'inline', punto_visado_id: '', visado: { ...form.visado, norte: e.target.value } })}
                            style={ui.inputStyle}
                            placeholder="0.000"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={form.visado.este}
                            disabled={form.visadoModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, visadoModo: 'inline', punto_visado_id: '', visado: { ...form.visado, este: e.target.value } })}
                            style={ui.inputStyle}
                            placeholder="0.000"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={form.visado.cota}
                            disabled={form.visadoModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, visadoModo: 'inline', punto_visado_id: '', visado: { ...form.visado, cota: e.target.value } })}
                            style={ui.inputStyle}
                            placeholder="Opcional"
                          />
                        </td>
                      </tr>
                      {form.tipo === 'abierta' && (
                        <tr>
                          <td style={{ ...td, fontWeight: 600, color: ui.accent }}>Llegada</td>
                          <td style={td}>
                            <input
                              value={form.llegada.nombre}
                              disabled={form.finalModo === 'biblioteca'}
                              onChange={(e) => setForm({ ...form, finalModo: 'inline', punto_final_id: '', llegada: { ...form.llegada, nombre: e.target.value } })}
                              style={ui.inputStyle}
                              placeholder="FIN"
                            />
                          </td>
                          <td style={td}>
                            <input
                              value={form.llegada.norte}
                              disabled={form.finalModo === 'biblioteca'}
                              onChange={(e) => setForm({ ...form, finalModo: 'inline', punto_final_id: '', llegada: { ...form.llegada, norte: e.target.value } })}
                              style={ui.inputStyle}
                              placeholder="0.000"
                            />
                          </td>
                          <td style={td}>
                            <input
                              value={form.llegada.este}
                              disabled={form.finalModo === 'biblioteca'}
                              onChange={(e) => setForm({ ...form, finalModo: 'inline', punto_final_id: '', llegada: { ...form.llegada, este: e.target.value } })}
                              style={ui.inputStyle}
                              placeholder="0.000"
                            />
                          </td>
                          <td style={td}>
                            <input
                              value={form.llegada.cota}
                              disabled={form.finalModo === 'biblioteca'}
                              onChange={(e) => setForm({ ...form, finalModo: 'inline', punto_final_id: '', llegada: { ...form.llegada, cota: e.target.value } })}
                              style={ui.inputStyle}
                              placeholder="Opcional"
                            />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {previewBase && (
                  <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontSize: 'var(--cc-sm)', color: '#1e3a8a', fontWeight: 600 }}>
                      Base {form.amarre.nombre || 'EST'} → {form.visado.nombre || 'VIS'}
                    </span>
                    <span style={{ fontSize: 'var(--cc-sm)', color: '#1e40af', marginLeft: 10 }}>
                      Azimut: {previewBase.azimutTexto} · Distancia: {previewBase.distancia.toFixed(3)} m
                    </span>
                  </div>
                )}

                <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: '#64748b' }}>
                  Formula altimetrica: ΔZ = HI + D·tan(angulo vertical) − HT
                </p>

                {form.amarreModo === 'biblioteca' && puntoBiblioteca && (
                  <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: '#166534' }}>
                    Estacion usando BM verificado: {puntoBiblioteca.nombre}
                  </p>
                )}
              </div>

              {form.tipo === 'abierta' && (
                <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: ui.accent }}>
                  La llegada es la coordenada objetivo: al terminar el circuito se compara la posición calculada contra este punto.
                </p>
              )}

              {puede(permisos, 'crear') && (
                <button type="button" style={ui.btnPrimary} onClick={iniciarPoligonal} disabled={busy}>
                  {busy ? 'Creando…' : 'Iniciar poligonal'}
                </button>
              )}
            </div>
          )}

          {step === 'estaciones' && detalle && (() => {
            const pol = detalle.poligonal || {}
            const sellada = (pol.nivel2_estado || '') === 'Aprobado' || Boolean(pol.biblioteca_at)
            const terminada = pol.estado === 'cerrado'
            const soloVer = sellada
            const editableLibreta = puede(permisos, 'editar') && !terminada && !soloVer
            const armadas = detalle.armadas || []
            const armadaActual = armadas.length ? armadas[armadas.length - 1] : null
            const estDisp = detalle.puntos_estacion_disponibles || []
            const visDisp = detalle.puntos_visado_disponibles || []
            const fmt = (v, d = 3) => (v === null || v === undefined || v === '') ? '—' : Number(v).toFixed(d)
            return (
            <div>
              {!terminada && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ fontSize: 'var(--cc-sm)', color: '#475569' }} title="Datos generales del circuito">
                    Libreta · {pol.tipo} · Tol. {fmtRatio(pol.tolerancia_relativa ?? 20000)}
                  </span>
                  {editableLibreta && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <CampoLabel
                      texto="Sentido"
                      ayuda="Horario = ángulos exteriores; antihorario = interiores."
                    />
                    <select
                      value={pol.sentido || 'antihorario'}
                      onChange={(e) => cambiarSentido(e.target.value)}
                      disabled={busy}
                      style={{ ...ui.inputStyle, width: 'auto', padding: '6px 8px' }}
                    >
                      <option value="antihorario">Antihorario (interiores)</option>
                      <option value="horario">Horario (exteriores)</option>
                    </select>
                  </label>
                  )}
                </div>
              </div>
              )}

              {editableLibreta && (() => {
                const amarreInp = { ...ui.inputStyle, padding: '3px 6px', fontSize: 'var(--cc-xs)', minWidth: 0 }
                const filaGrid = {
                  display: 'grid',
                  gridTemplateColumns: '52px repeat(4, minmax(0, 1fr))',
                  gap: 6,
                  alignItems: 'end',
                }
                return (
              <div
                style={{
                  border: `1px solid ${ui.accent}66`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  marginBottom: 12,
                  background: ui.accentSoft,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--cc-xs)', color: ui.accent }}>
                    Amarres
                    {detalle.base && (
                      <span style={{ fontWeight: 500, color: ui.textMuted, marginLeft: 8 }}>
                        · Base Az {detalle.base.azimut_texto ?? '—'} · {fmt(detalle.base.distancia, 3)} m
                      </span>
                    )}
                  </span>
                  {editableLibreta && (
                    <button
                      type="button"
                      style={{ ...ui.btnPrimary, padding: '4px 10px', fontSize: 'var(--cc-xs)' }}
                      onClick={guardarAmarres}
                      disabled={busy}
                      title="Coordenadas provisorias o definitivas; recalcula la cartera"
                    >
                      {busy ? '…' : 'Guardar'}
                    </button>
                  )}
                </div>
                <div style={{ ...filaGrid, marginBottom: 4, color: ui.textMuted, fontSize: 'var(--cc-xs)' }}>
                  <span />
                  <span>Punto</span>
                  <span>Norte</span>
                  <span>Este</span>
                  <span>Cota</span>
                </div>
                <div style={{ ...filaGrid, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--cc-xs)', color: ui.accent, paddingBottom: 4 }} title="Estación (amarre inicial)">
                    Est.{detalle.punto_inicial?.verificado ? ' ✓' : ''}
                  </span>
                  <label>
                    <input
                      value={form.amarre.nombre}
                      disabled={!editableLibreta || busy || Boolean(detalle.punto_inicial?.verificado)}
                      onChange={(e) => setForm({ ...form, amarre: { ...form.amarre, nombre: e.target.value } })}
                      style={amarreInp}
                      title="Nombre estación / amarre inicial"
                      placeholder="BM1"
                    />
                  </label>
                  <label>
                    <input
                      value={form.amarre.norte}
                      disabled={!editableLibreta || busy}
                      onChange={(e) => setForm({ ...form, amarre: { ...form.amarre, norte: e.target.value } })}
                      style={amarreInp}
                      title="Norte (m)"
                      placeholder="N"
                    />
                  </label>
                  <label>
                    <input
                      value={form.amarre.este}
                      disabled={!editableLibreta || busy}
                      onChange={(e) => setForm({ ...form, amarre: { ...form.amarre, este: e.target.value } })}
                      style={amarreInp}
                      title="Este (m)"
                      placeholder="E"
                    />
                  </label>
                  <label>
                    <input
                      value={form.amarre.cota}
                      disabled={!editableLibreta || busy}
                      onChange={(e) => setForm({ ...form, amarre: { ...form.amarre, cota: e.target.value } })}
                      style={amarreInp}
                      title="Cota (m)"
                      placeholder="Z"
                    />
                  </label>
                </div>
                <div style={filaGrid}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--cc-xs)', color: ui.accent, paddingBottom: 4 }} title="Visado (referencia atrás)">
                    Vis.{detalle.punto_visado?.verificado ? ' ✓' : ''}
                  </span>
                  <label>
                    <input
                      value={form.visado.nombre}
                      disabled={!editableLibreta || busy || Boolean(detalle.punto_visado?.verificado)}
                      onChange={(e) => setForm({ ...form, visado: { ...form.visado, nombre: e.target.value } })}
                      style={amarreInp}
                      title="Nombre visado"
                      placeholder="VIS"
                    />
                  </label>
                  <label>
                    <input
                      value={form.visado.norte}
                      disabled={!editableLibreta || busy}
                      onChange={(e) => setForm({ ...form, visado: { ...form.visado, norte: e.target.value } })}
                      style={amarreInp}
                      title="Norte (m)"
                      placeholder="N"
                    />
                  </label>
                  <label>
                    <input
                      value={form.visado.este}
                      disabled={!editableLibreta || busy}
                      onChange={(e) => setForm({ ...form, visado: { ...form.visado, este: e.target.value } })}
                      style={amarreInp}
                      title="Este (m)"
                      placeholder="E"
                    />
                  </label>
                  <label>
                    <input
                      value={form.visado.cota}
                      disabled={!editableLibreta || busy}
                      onChange={(e) => setForm({ ...form, visado: { ...form.visado, cota: e.target.value } })}
                      style={amarreInp}
                      title="Cota (m)"
                      placeholder="Z"
                    />
                  </label>
                </div>
                {pol.tipo === 'abierta' && (
                  <div style={{ ...filaGrid, marginTop: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 'var(--cc-xs)', color: '#15803d', paddingBottom: 4 }} title="Punto de llegada (objetivo)">
                      Llg.{detalle.punto_final?.verificado ? ' ✓' : ''}
                    </span>
                    <label>
                      <input
                        value={form.llegada.nombre}
                        disabled={!editableLibreta || busy || Boolean(detalle.punto_final?.verificado)}
                        onChange={(e) => setForm({ ...form, llegada: { ...form.llegada, nombre: e.target.value } })}
                        style={amarreInp}
                        placeholder="FIN"
                      />
                    </label>
                    <label>
                      <input
                        value={form.llegada.norte}
                        disabled={!editableLibreta || busy}
                        onChange={(e) => setForm({ ...form, llegada: { ...form.llegada, norte: e.target.value } })}
                        style={amarreInp}
                        placeholder="N"
                      />
                    </label>
                    <label>
                      <input
                        value={form.llegada.este}
                        disabled={!editableLibreta || busy}
                        onChange={(e) => setForm({ ...form, llegada: { ...form.llegada, este: e.target.value } })}
                        style={amarreInp}
                        placeholder="E"
                      />
                    </label>
                    <label>
                      <input
                        value={form.llegada.cota}
                        disabled={!editableLibreta || busy}
                        onChange={(e) => setForm({ ...form, llegada: { ...form.llegada, cota: e.target.value } })}
                        style={amarreInp}
                        placeholder="Z"
                      />
                    </label>
                  </div>
                )}
              </div>
                )
              })()}

              {editableLibreta && (
              <>
              {/* Armadas (compactas, 2+ columnas segun ancho) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8, marginBottom: 14 }}>
                {armadas.map((arm) => {
                  const esActual = armadaActual && arm.id === armadaActual.id
                  const ec = arm.estacion_coords || {}
                  return (
                    <div key={arm.id} style={{ padding: '8px 10px', border: `1px solid ${esActual ? '#1e40af' : '#e2e8f0'}`, borderRadius: 8, background: esActual ? '#eff6ff' : '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 'var(--cc-xs)' }}>Armada {arm.orden}{esActual ? ' ·actual' : ''}</span>
                        <span style={{ fontSize: 'var(--cc-xs)', color: '#1e40af', fontWeight: 700, marginLeft: 'auto' }}>
                          Az {arm.base_azimut_texto ?? '—'}
                        </span>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CampoLabel texto="HI" ayuda="Altura del instrumento de esta armada, en metros." />
                          <input
                            defaultValue={arm.altura_instrumento ?? ''}
                            onBlur={(e) => { if (editableLibreta && String(e.target.value) !== String(arm.altura_instrumento ?? '')) actualizarHIArmada(arm.id, e.target.value) }}
                            disabled={!editableLibreta || busy}
                            style={{ ...ui.inputStyle, width: 70, padding: '3px 6px', fontSize: 'var(--cc-xs)' }}
                            placeholder="1.50"
                          />
                        </label>
                      </div>
                      <div style={{ fontSize: 'var(--cc-xs)', color: '#475569', marginTop: 3 }}>
                        Est <strong>{arm.estacion_nombre || '—'}</strong>
                        {ec.norte != null ? ` (N ${fmt(ec.norte, 2)} E ${fmt(ec.este, 2)} Z ${fmt(ec.cota, 2)})` : ''}
                        {' → Vis '}<strong>{arm.visado_nombre || '—'}</strong>
                        <span style={{ color: '#64748b' }}> · {(arm.puntos || []).length} pto</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {editableLibreta && (editandoId || armadaActual) && (
                <div ref={formRef} style={{ border: `1px solid ${editandoId ? '#2563eb' : '#e2e8f0'}`, borderRadius: 10, padding: 14, marginBottom: 16, background: editandoId ? '#eff6ff' : '#fff' }}>
                  <h4 style={{ marginTop: 0, marginBottom: 8 }} title="Obligatorio: punto y ángulo observado. Distancia y ángulo vertical opcionales.">
                    {editandoId ? 'Editar punto' : `Agregar punto (armada ${armadaActual?.orden ?? '—'})`}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, alignItems: 'end' }}>
                    <label style={setupField}>
                      <CampoLabel texto="Punto" ayuda="Nombre del punto observado adelante (o radiado)." />
                      <input value={estForm.nombre_punto} onChange={(e) => setEstForm({ ...estForm, nombre_punto: e.target.value })} style={ui.inputStyle} placeholder="Ej. P1" />
                    </label>
                    <label style={setupField}>
                      <CampoLabel texto="Tipo" ayuda="Estación = vértice por donde pasará el equipo. Auxiliar = punto de detalle radiado." />
                      <select value={estForm.tipo_punto} onChange={(e) => setEstForm({ ...estForm, tipo_punto: e.target.value })} style={ui.inputStyle}>
                        <option value="auxiliar">Auxiliar</option>
                        <option value="estacion">Estacion</option>
                      </select>
                    </label>
                    <TopoAngularInput label="Ang. observado (ceros atras GG.MMSS)" value={estForm.angulo_gms} onChange={(_, v) => setEstForm((f) => ({ ...f, angulo_gms: v }))} />
                    <TopoAngularInput label="Ang. vertical cenital (GG.MMSS)" value={estForm.angulo_vertical_gms} onChange={(_, v) => setEstForm((f) => ({ ...f, angulo_vertical_gms: v }))} />
                    <label style={setupField}>
                      <CampoLabel texto="Prisma" ayuda="HT: altura del prisma u objetivo sobre el punto observado, en metros." />
                      <input value={estForm.altura_objetivo} onChange={(e) => setEstForm({ ...estForm, altura_objetivo: e.target.value })} style={ui.inputStyle} placeholder="0" />
                    </label>
                    <label style={setupField}>
                      <CampoLabel texto="Distancia" ayuda="Distancia horizontal medida al punto observado, en metros." />
                      <input value={estForm.distancia} onChange={(e) => setEstForm({ ...estForm, distancia: e.target.value })} style={ui.inputStyle} placeholder="0.000" />
                    </label>
                    {editandoId ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" style={{ ...ui.btnPrimary, height: 38 }} onClick={guardarEdicion} disabled={busy}>Guardar</button>
                        <button type="button" style={{ ...ui.btnSecondary, height: 38 }} onClick={cancelarEdicion} disabled={busy}>Cancelar</button>
                      </div>
                    ) : (
                      <button type="button" style={{ ...ui.btnPrimary, height: 38 }} onClick={agregarPunto} disabled={busy}>
                        Agregar punto
                      </button>
                    )}
                  </div>
                  {armadaActual?.altura_instrumento == null && (
                    <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: '#b45309' }} title="Defina el HI en la cabecera de la armada">
                      Falta HI en la armada actual.
                    </p>
                  )}
                </div>
              )}

              {editableLibreta && (
                <div style={{ marginBottom: 16 }}>
                  {!mostrarCambioArmada ? (
                    <button type="button" style={ui.btnSecondary} onClick={() => setMostrarCambioArmada(true)} disabled={busy} title="Traslade el equipo a otra estación">
                      Cambiar armada
                    </button>
                  ) : (
                    <div style={{ border: '1px solid #1e40af', borderRadius: 10, padding: 14, background: '#eff6ff' }}>
                      <h4 style={{ marginTop: 0, marginBottom: 8 }} title="Elija estación (amarre o vértice radiado) y visado de atrás conocido.">
                        Nueva armada
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
                        <label style={setupField}>
                          <CampoLabel texto="Estación" ayuda="Punto donde se planta el equipo. Debe tener coordenadas (amarre o estación ya radiada)." />
                          <select value={armadaForm.estacion_nombre} onChange={(e) => setArmadaForm({ ...armadaForm, estacion_nombre: e.target.value })} style={ui.inputStyle}>
                            <option value="">— Seleccione —</option>
                            {estDisp.map((p) => (<option key={p.nombre} value={p.nombre}>{p.nombre}</option>))}
                          </select>
                        </label>
                        <label style={setupField}>
                          <CampoLabel texto="Visado" ayuda="Punto de atrás al que se encera (0°). Debe tener coordenadas conocidas." />
                          <select value={armadaForm.visado_nombre} onChange={(e) => setArmadaForm({ ...armadaForm, visado_nombre: e.target.value })} style={ui.inputStyle}>
                            <option value="">— Seleccione —</option>
                            {visDisp.map((p) => (<option key={p.nombre} value={p.nombre}>{p.nombre}</option>))}
                          </select>
                        </label>
                        <label style={setupField}>
                          <CampoLabel texto="HI" ayuda="Altura del instrumento en la nueva estación, en metros." />
                          <input value={armadaForm.altura_instrumento} onChange={(e) => setArmadaForm({ ...armadaForm, altura_instrumento: e.target.value })} style={ui.inputStyle} placeholder="1.500" />
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" style={{ ...ui.btnPrimary, height: 38 }} onClick={crearArmada} disabled={busy}>Crear armada</button>
                          <button type="button" style={{ ...ui.btnSecondary, height: 38 }} onClick={() => { setMostrarCambioArmada(false); setArmadaForm({ estacion_nombre: '', visado_nombre: '', altura_instrumento: '' }) }} disabled={busy}>Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                  <h4 style={{ margin: 0 }}>Cartera consolidada</h4>
                  <button
                    type="button"
                    style={{ ...ui.btnSecondary, padding: '4px 10px', fontSize: 'var(--cc-xs)' }}
                    onClick={() => sincronizarDetalle('Cartera recalculada.')}
                    disabled={busy || refreshing}
                    title="Recalcular desde el servidor"
                  >
                    {refreshing ? '…' : 'Actualizar'}
                  </button>
                </div>
                <PoligonalCalculoTable
                  key={ultimaSync || 'cartera'}
                  estaciones={detalle.estaciones}
                  poligonal={detalle.poligonal}
                  cierre={detalle.cierre}
                  modoAjuste={!!detalle.poligonal?.ajustada_at}
                  editandoId={editandoId}
                  onEliminar={editableLibreta ? eliminarPunto : null}
                  onEditar={editableLibreta ? iniciarEdicion : null}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <PoligonalGrafico
                  estaciones={detalle.estaciones}
                  puntoInicial={detalle.punto_inicial}
                  puntoFinal={detalle.punto_final}
                  cierre={detalle.cierre}
                />
              </div>

              {detalle.cierre && (
                <div style={{ marginTop: 16 }}>
                  <PoligonalCierrePanel cierre={detalle.cierre} />
                </div>
              )}

              {editableLibreta && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  <button
                    type="button"
                    style={{ ...ui.btnPrimary, opacity: (detalle.cierre?.cerrado && detalle.cierre?.admisible_lineal) ? 1 : 0.5 }}
                    onClick={cerrarCircuito}
                    disabled={busy || !(detalle.cierre?.cerrado && detalle.cierre?.admisible_lineal) || !detalle.estaciones?.length}
                    title={
                      !(detalle.cierre?.cerrado && detalle.cierre?.admisible_lineal)
                        ? 'El circuito debe cerrar dentro de tolerancia antes de terminar'
                        : 'Cierra la libreta y habilita validación contratista / interventoría'
                    }
                  >
                    {busy ? 'Terminando…' : 'Terminar poligonal'}
                  </button>
                </div>
              )}
              </>
              )}

              {terminada && (
              <>
              <div style={{ marginTop: 4, marginBottom: 12 }}>
                <PoligonalCierrePanel cierre={detalle.cierre} />
              </div>

              <div style={{ marginTop: 4 }}>
                <h4 style={{ margin: '0 0 8px' }} title="Coordenadas calculadas (ajustadas si aplica)">Coordenadas calculadas</h4>
                <PoligonalCalculoTable
                  key={`term-${ultimaSync || 'cartera'}`}
                  estaciones={detalle.estaciones}
                  poligonal={detalle.poligonal}
                  cierre={detalle.cierre}
                  modoAjuste={!!detalle.poligonal?.ajustada_at}
                  editandoId={null}
                  onEliminar={null}
                  onEditar={null}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <PoligonalGrafico
                  estaciones={detalle.estaciones}
                  puntoInicial={detalle.punto_inicial}
                  puntoFinal={detalle.punto_final}
                  cierre={detalle.cierre}
                />
              </div>

              {!sellada && puede(permisos, 'editar') && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  <button
                    type="button"
                    style={{ ...ui.btnPrimary, background: '#047857' }}
                    onClick={ajustarPoligonal}
                    disabled={busy}
                    title="Corrección angular + Bowditch antes de validar"
                  >
                    {busy ? 'Ajustando…' : detalle.poligonal?.ajustada_at ? 'Re-ajustar' : 'Corregir y ajustar'}
                  </button>
                </div>
              )}

              <PoligonalValidacionPanel
                poligonal={detalle.poligonal}
                cierre={detalle.cierre}
                permisos={permisos}
                usuario={usuario}
                contratoId={contratoId}
                token={token}
                api={api}
                soloLectura={sellada}
                onActualizado={() => sincronizarDetalle()}
                onError={showError}
              />

              {!sellada && (
                <div style={{ marginTop: 16 }}>
                  <FirmaPerfilTopo
                    api={api}
                    poligonalId={poligonalId}
                    token={token}
                    onFirmado={() => sincronizarDetalle()}
                  />
                </div>
              )}
              </>
              )}
            </div>
            )
          })()}
        </div>
      </div>

      {errorModal && (
        <TopoErrorModal theme={theme} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}
    </>
  )
}
