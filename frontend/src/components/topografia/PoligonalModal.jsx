import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TopoAngularInput from './TopoAngularInput'
import PoligonalCalculoTable from './PoligonalCalculoTable'
import PoligonalCierrePanel from './PoligonalCierrePanel'
import PoligonalGrafico from './PoligonalGrafico'
import TopoErrorModal from './TopoErrorModal'
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
      title={ayuda}
      style={{ fontSize: 'var(--cc-xs)', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      {texto}
      {ayuda && (
        <span
          style={{
            display: 'inline-flex', width: 14, height: 14, borderRadius: '50%',
            background: '#cbd5e1', color: '#fff', fontSize: 9, fontWeight: 700,
            alignItems: 'center', justifyContent: 'center', cursor: 'help',
          }}
        >?</span>
      )}
    </span>
  )
}

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
  punto_final_id: '',
  amarre: { nombre: '', norte: '', este: '', cota: '' },
  visadoModo: 'inline',
  punto_visado_id: '',
  visado: { nombre: '', norte: '', este: '', cota: '' },
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
}) {
  const ui = useTopoTheme()
  const theme = themeProp || ui.t
  const [step, setStep] = useState('setup')
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
  const [faseCierre, setFaseCierre] = useState(false)
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
      punto_final_id: data.poligonal.punto_final_id || '',
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
      setStep('setup')
      setPoligonalId(null)
      setDetalle(null)
      setForm(emptyForm)
      setEstForm(resetEstForm())
      setEditandoId(null)
      setFaseCierre(false)
      setMostrarCambioArmada(false)
      setArmadaForm({ estacion_nombre: '', visado_nombre: '', altura_instrumento: '' })
    }
  }, [open, initialPoligonalId, initialDetalle, aplicarDetalle, cargarDetalle, showError, api])

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
        if (form.tipo === 'abierta' && form.punto_final_id) {
          payload.punto_final_id = form.punto_final_id
        }
      } else {
        payload.amarre_inicial = {
          nombre: form.amarre.nombre.trim(),
          norte: Number(form.amarre.norte),
          este: Number(form.amarre.este),
          cota: form.amarre.cota === '' ? null : Number(form.amarre.cota),
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
      await sincronizarDetalle('Poligonal enviada a la biblioteca.')
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
                {step === 'setup' ? 'Nueva poligonal' : (detalle?.poligonal?.nombre || 'Poligonal')}
              </h2>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 'var(--cc-sm)' }}>
                Poligonal trigonométrica — ingrese estaciones con angulos horizontal/vertical, HI y distancia.
              </p>
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

          {step === 'setup' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 16 }}>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Nombre</span>
                  <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={ui.inputStyle} placeholder="Poligonal 1" />
                </label>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Tipo</span>
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={ui.inputStyle}>
                    <option value="cerrada">Cerrada</option>
                    <option value="abierta">Abierta</option>
                  </select>
                </label>
                <label title="Sentido de recorrido de la poligonal. Horario aplica angulos exteriores (n+2)*180; antihorario aplica interiores (n-2)*180.">
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Sentido</span>
                  <select value={form.sentido} onChange={(e) => setForm({ ...form, sentido: e.target.value })} style={ui.inputStyle}>
                    <option value="antihorario">Antihorario (interiores)</option>
                    <option value="horario">Horario (exteriores)</option>
                  </select>
                </label>
                <label title="Res. 643 Tabla 2: menor a 1 000 m² → 1:20 000; hasta 1 ha → 1:15 000; hasta 10 ha → 1:10 000; ≥ 10 ha → 1:5 000.">
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Tolerancia plan 1:N</span>
                  <input type="number" value={form.tolerancia_relativa} onChange={(e) => setForm({ ...form, tolerancia_relativa: e.target.value })} style={ui.inputStyle} />
                </label>
                <label title="Precisión angular del equipo (segundos). Tolerancia angular = este valor × √vértices (Res. 643 §9.2.2).">
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Prec. angular equipo (&quot;)</span>
                  <input type="number" step="0.1" value={form.precision_angular_seg} onChange={(e) => setForm({ ...form, precision_angular_seg: e.target.value })} style={ui.inputStyle} placeholder="10" />
                </label>
                <label title="Longitud máxima recomendada entre deltas consecutivos (m). Referencia técnica 250–300 m; configurable.">
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Máx. entre deltas (m)</span>
                  <input type="number" value={form.longitud_max_delta_m} onChange={(e) => setForm({ ...form, longitud_max_delta_m: e.target.value })} style={ui.inputStyle} placeholder="300" />
                </label>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Tolerancia cota (mm/km)</span>
                  <input type="number" value={form.tolerancia_cota_mm_km} onChange={(e) => setForm({ ...form, tolerancia_cota_mm_km: e.target.value })} style={ui.inputStyle} />
                </label>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Operador</span>
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
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Fecha campo</span>
                  <input type="date" value={form.fecha_campo} onChange={(e) => setForm({ ...form, fecha_campo: e.target.value })} style={ui.inputStyle} />
                </label>
              </div>

              <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 14, marginBottom: 16, background: '#fff' }}>
                <h4 style={{ margin: '0 0 8px' }}>Equipo de medición</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
                  <label>
                    <CampoLabel texto="Marca" ayuda="Fabricante del instrumento (estación total, GPS, etc.)." />
                    <input value={form.equipo_marca} onChange={(e) => setForm({ ...form, equipo_marca: e.target.value })} style={ui.inputStyle} placeholder="Ej. Leica" />
                  </label>
                  <label>
                    <CampoLabel texto="Referencia / modelo" ayuda="Modelo del equipo usado en campo." />
                    <input value={form.equipo_referencia} onChange={(e) => setForm({ ...form, equipo_referencia: e.target.value })} style={ui.inputStyle} placeholder="Ej. TS16" />
                  </label>
                  <label>
                    <CampoLabel texto="N° de serie" ayuda="Serial del instrumento según placa o factura." />
                    <input value={form.equipo_serial} onChange={(e) => setForm({ ...form, equipo_serial: e.target.value })} style={ui.inputStyle} placeholder="Ej. 123456" />
                  </label>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fafc' }}>
                <h4 style={{ margin: '0 0 8px' }}>Puntos de amarre (estacion y visado)</h4>
                <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', color: '#64748b' }}>
                  Defina el punto de estacion (inicio del circuito) y el punto de visado (referencia). Con ambas coordenadas se calcula el azimut y la distancia de la base de partida. Al cerrar la poligonal con cierre admisible, los puntos calculados pasan a la biblioteca.
                </p>

                {puntosVerificados.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: 12 }}>
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Estacion: usar BM verificado</span>
                      <select
                        value={form.amarreModo === 'biblioteca' ? form.punto_inicial_id : ''}
                        onChange={(e) => seleccionarBmBiblioteca(e.target.value)}
                        style={ui.inputStyle}
                      >
                        <option value="">— Ingresar coordenadas manualmente —</option>
                        {puntosVerificados.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Visado: usar BM verificado</span>
                      <select
                        value={form.visadoModo === 'biblioteca' ? form.punto_visado_id : ''}
                        onChange={(e) => seleccionarVisadoBiblioteca(e.target.value)}
                        style={ui.inputStyle}
                      >
                        <option value="">— Ingresar coordenadas manualmente —</option>
                        {puntosVerificados.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
                        ))}
                      </select>
                    </label>
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

              {form.tipo === 'abierta' && puntosVerificados.length > 0 && (
                <label style={{ display: 'block', marginBottom: 16 }}>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Punto final (poligonal abierta)</span>
                  <select value={form.punto_final_id} onChange={(e) => setForm({ ...form, punto_final_id: e.target.value })} style={ui.inputStyle}>
                    <option value="">— Opcional —</option>
                    {puntosVerificados.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </label>
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
            const editable = puede(permisos, 'editar') && pol.estado !== 'cerrado'
            const armadas = detalle.armadas || []
            const armadaActual = armadas.length ? armadas[armadas.length - 1] : null
            const estDisp = detalle.puntos_estacion_disponibles || []
            const visDisp = detalle.puntos_visado_disponibles || []
            const fmt = (v, d = 3) => (v === null || v === undefined || v === '') ? '—' : Number(v).toFixed(d)
            return (
            <div>
              {/* Encabezado general */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ fontSize: 'var(--cc-sm)', color: '#475569' }}>
                    Estado: <strong>{pol.estado}</strong> · Tipo: {pol.tipo} · Tol. plan {fmtRatio(pol.tolerancia_relativa ?? 20000)} · Prec. ang. {pol.precision_angular_seg ?? 10}&quot; · Máx. delta {pol.longitud_max_delta_m ?? 300} m
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Define la formula del cierre angular: horario usa angulos exteriores (n+2)·180; antihorario usa interiores (n-2)·180.">
                    <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Sentido</span>
                    <select
                      value={pol.sentido || 'antihorario'}
                      onChange={(e) => cambiarSentido(e.target.value)}
                      disabled={!editable || busy}
                      style={{ ...ui.inputStyle, width: 'auto', padding: '6px 8px' }}
                    >
                      <option value="antihorario">Antihorario (interiores)</option>
                      <option value="horario">Horario (exteriores)</option>
                    </select>
                  </label>
                </div>
              </div>

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
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Altura del instrumento de esta armada, en metros.">
                          <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>HI</span>
                          <input
                            defaultValue={arm.altura_instrumento ?? ''}
                            onBlur={(e) => { if (editable && String(e.target.value) !== String(arm.altura_instrumento ?? '')) actualizarHIArmada(arm.id, e.target.value) }}
                            disabled={!editable || busy}
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

              {/* Ingreso de punto adelante (armada actual) */}
              {editable && (editandoId || (!faseCierre && armadaActual)) && (
                <div ref={formRef} style={{ border: `1px solid ${editandoId ? '#2563eb' : '#e2e8f0'}`, borderRadius: 10, padding: 14, marginBottom: 16, background: editandoId ? '#eff6ff' : '#fff' }}>
                  <h4 style={{ marginTop: 0, marginBottom: 4 }}>
                    {editandoId ? 'Editar punto' : `Agregar punto adelante (armada ${armadaActual?.orden ?? '—'})`}
                  </h4>
                  <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#64748b' }}>
                    Ceros atras: el equipo encerado en el visado de atras lee el angulo observado al punto adelante. Azimut = azimut base + angulo observado.
                  </p>
                  <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs)', color: '#475569' }}>
                    Obligatorio: <strong>Punto</strong> y <strong>Angulo observado</strong>. La distancia y el angulo vertical son <strong>opcionales</strong> (p. ej. la observacion de cierre/orientacion solo lleva angulo; sin distancia no se calculan coordenadas y la fila se muestra con «—»).
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, alignItems: 'end' }}>
                    <label>
                      <CampoLabel texto="Punto" ayuda="Nombre del punto observado adelante (o radiado)." />
                      <input value={estForm.nombre_punto} onChange={(e) => setEstForm({ ...estForm, nombre_punto: e.target.value })} style={ui.inputStyle} placeholder="Ej. P1" />
                    </label>
                    <label>
                      <CampoLabel texto="Tipo de punto" ayuda="Estacion = vertice por donde pasara el equipo (puede ser estacion/visado de otra armada). Auxiliar = punto de detalle/radiado." />
                      <select value={estForm.tipo_punto} onChange={(e) => setEstForm({ ...estForm, tipo_punto: e.target.value })} style={ui.inputStyle}>
                        <option value="auxiliar">Auxiliar</option>
                        <option value="estacion">Estacion</option>
                      </select>
                    </label>
                    <TopoAngularInput label="Ang. observado (ceros atras GG.MMSS)" value={estForm.angulo_gms} onChange={(_, v) => setEstForm((f) => ({ ...f, angulo_gms: v }))} />
                    <TopoAngularInput label="Ang. vertical cenital (GG.MMSS)" value={estForm.angulo_vertical_gms} onChange={(_, v) => setEstForm((f) => ({ ...f, angulo_vertical_gms: v }))} />
                    <label>
                      <CampoLabel texto="Altura de prisma (m)" ayuda="HT: altura del prisma/objetivo sobre el punto observado, en metros." />
                      <input value={estForm.altura_objetivo} onChange={(e) => setEstForm({ ...estForm, altura_objetivo: e.target.value })} style={ui.inputStyle} placeholder="0" />
                    </label>
                    <label>
                      <CampoLabel texto="Distancia (m)" ayuda="Distancia horizontal medida al punto observado, en metros." />
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
                  {armadaActual.altura_instrumento == null && (
                    <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                      Defina el HI de esta armada (en su cabecera) para calcular las cotas radiadas.
                    </p>
                  )}
                </div>
              )}

              {/* Cambiar armada */}
              {editable && !faseCierre && pol.estado !== 'cerrado' && (
                <div style={{ marginBottom: 16 }}>
                  {!mostrarCambioArmada ? (
                    <button type="button" style={ui.btnSecondary} onClick={() => setMostrarCambioArmada(true)} disabled={busy}>
                      Cambiar armada
                    </button>
                  ) : (
                    <div style={{ border: '1px solid #1e40af', borderRadius: 10, padding: 14, background: '#eff6ff' }}>
                      <h4 style={{ marginTop: 0, marginBottom: 4 }}>Nueva armada</h4>
                      <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs)', color: '#475569' }}>
                        Traslade el equipo: elija la nueva estacion (un punto tipo Estacion ya radiado o el amarre) y el visado de atras conocido.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, alignItems: 'end' }}>
                        <label>
                          <CampoLabel texto="Estacion" ayuda="Punto donde se planta el equipo. Debe tener coordenadas (amarre o punto tipo Estacion ya radiado)." />
                          <select value={armadaForm.estacion_nombre} onChange={(e) => setArmadaForm({ ...armadaForm, estacion_nombre: e.target.value })} style={ui.inputStyle}>
                            <option value="">— Seleccione —</option>
                            {estDisp.map((p) => (<option key={p.nombre} value={p.nombre}>{p.nombre}</option>))}
                          </select>
                        </label>
                        <label>
                          <CampoLabel texto="Visado (atras)" ayuda="Punto de atras al que se encera (0°). Debe ser un punto con coordenadas conocidas." />
                          <select value={armadaForm.visado_nombre} onChange={(e) => setArmadaForm({ ...armadaForm, visado_nombre: e.target.value })} style={ui.inputStyle}>
                            <option value="">— Seleccione —</option>
                            {visDisp.map((p) => (<option key={p.nombre} value={p.nombre}>{p.nombre}</option>))}
                          </select>
                        </label>
                        <label>
                          <CampoLabel texto="HI (m)" ayuda="Altura del instrumento en la nueva estacion, en metros." />
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
                  {ultimaSync && (
                    <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>
                      Última sync: {new Date(ultimaSync).toLocaleTimeString('es-CO')}
                    </span>
                  )}
                  <button
                    type="button"
                    style={{ ...ui.btnSecondary, padding: '4px 10px', fontSize: 'var(--cc-xs)' }}
                    onClick={() => sincronizarDetalle('Cartera recalculada.')}
                    disabled={busy || refreshing}
                  >
                    {refreshing ? '…' : 'Actualizar cartera'}
                  </button>
                </div>
                {editandoId && (
                  <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#2563eb' }}>
                    Edite los campos arriba y pulse <strong>Guardar</strong>; la tabla se actualiza al guardar o con «Actualizar cartera».
                  </p>
                )}
                <PoligonalCalculoTable
                  key={ultimaSync || 'cartera'}
                  estaciones={detalle.estaciones}
                  poligonal={detalle.poligonal}
                  cierre={detalle.cierre}
                  modoAjuste={!!detalle.poligonal?.ajustada_at}
                  editandoId={editandoId}
                  onEliminar={editable && !faseCierre ? eliminarPunto : null}
                  onEditar={editable ? iniciarEdicion : null}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <PoligonalGrafico
                  estaciones={detalle.estaciones}
                  puntoInicial={detalle.punto_inicial}
                  cierre={detalle.cierre}
                />
              </div>

              {/* Fase de cierre */}
              {faseCierre && (
                <div style={{ border: '1px solid #1e40af', borderRadius: 10, padding: 14, marginTop: 16, background: '#eff6ff' }}>
                  <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 'var(--cc-sm)', color: '#1e40af' }}>Datos de cierre de la poligonal</div>
                  <PoligonalCierrePanel cierre={detalle.cierre} />
                  {!detalle.cierre?.cerrado && (
                    <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                      La poligonal aun no cierra: falta la observacion que regresa al punto inicial (<strong>{detalle.punto_inicial?.nombre || 'amarre'}</strong>) como punto tipo «Estacion».
                    </p>
                  )}
                  {detalle.cierre?.cerrado && !detalle.cierre?.admisible_lineal && (
                    <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                      El cierre lineal esta fuera de tolerancia. Solo se podra enviar a la biblioteca cuando el cierre cumpla. Revise angulos y distancias (use el boton editar en la cartera).
                    </p>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                {puede(permisos, 'editar') && detalle.cierre?.cerrado && (
                  <button
                    type="button"
                    style={{ ...ui.btnPrimary, background: '#047857' }}
                    onClick={ajustarPoligonal}
                    disabled={busy}
                    title="Corrección angular + Bowditch; los datos ajustados se usan en validación y PDF"
                  >
                    {busy ? 'Ajustando…' : detalle.poligonal?.ajustada_at ? 'Re-ajustar poligonal' : 'Corregir y ajustar'}
                  </button>
                )}
                {puede(permisos, 'editar') && pol.estado !== 'cerrado' && !faseCierre && (
                  <button
                    type="button"
                    style={{ ...ui.btnPrimary, opacity: (detalle.estaciones?.length ? 1 : 0.6) }}
                    onClick={() => setFaseCierre(true)}
                    disabled={busy || !detalle.estaciones?.length}
                    title={detalle.estaciones?.length ? 'Terminar la cartera y pasar a los datos de cierre' : 'Agregue al menos un punto'}
                  >
                    Terminar poligonal
                  </button>
                )}
                {puede(permisos, 'editar') && pol.estado !== 'cerrado' && faseCierre && (
                  <>
                    <button type="button" style={ui.btnSecondary} onClick={() => setFaseCierre(false)} disabled={busy}>
                      Volver a la cartera
                    </button>
                    <button
                      type="button"
                      style={{ ...ui.btnPrimary, opacity: (detalle.cierre?.cerrado && detalle.cierre?.admisible_lineal) ? 1 : 0.5 }}
                      onClick={cerrarCircuito}
                      disabled={busy || !(detalle.cierre?.cerrado && detalle.cierre?.admisible_lineal)}
                      title={(detalle.cierre?.cerrado && detalle.cierre?.admisible_lineal) ? 'Enviar los puntos a la biblioteca' : 'Solo disponible cuando la poligonal cierra dentro de tolerancia'}
                    >
                      Enviar a biblioteca de puntos
                    </button>
                  </>
                )}
              </div>
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
