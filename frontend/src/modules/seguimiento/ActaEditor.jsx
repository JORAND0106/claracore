import { useEffect, useRef, useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import CompromisoFormModal from './CompromisoFormModal'
import IdeaClaraModal from './IdeaClaraModal'
import ItemDetalleModal from './ItemDetalleModal'
import QuienDijoAutocomplete from './QuienDijoAutocomplete'
import { htmlToPlainText, isRichTextEmpty, plainTextToHtml } from './richTextUtils'
import TemaRichEditor from './TemaRichEditor'
import UbicacionAutocomplete from './UbicacionAutocomplete'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import {
  ACTA_ESTADOS,
  ESTADOS,
  ORIGEN_COLOR,
  fmtFecha,
  labelEstadoActa,
  labelTipoActa,
  numeroActaLabel,
} from './seguimientoTheme'
import { imagenSrc, openImageInNewTab } from './imagenUtils'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'

/** Verde institucional solo para compromiso cumplido. */
const COLOR_CUMPLIDO = 'var(--cc-color-positive, #0f766e)'
const BG_CUMPLIDO = 'color-mix(in srgb, var(--cc-color-positive, #0f766e) 12%, transparent)'

const TABS_ACTA = [
  { id: 'encabezado', label: 'Encabezado' },
  { id: 'orden', label: 'Orden del día' },
  { id: 'asistentes', label: 'Asistentes' },
  { id: 'compromisos', label: 'Compromisos abiertos' },
  { id: 'ideas', label: 'Temas y Compromisos' },
  { id: 'apartados', label: 'Apartados' },
  { id: 'acciones', label: 'Vista previa y acciones' },
]

let _rowKeySeq = 0
function newRowKey(prefix = 'r') {
  _rowKeySeq += 1
  return `${prefix}-${Date.now().toString(36)}-${_rowKeySeq}`
}

function emptyAsistente() {
  return {
    _key: newRowKey('as'),
    nombre: '',
    cargo: '',
    entidad: '',
    email: '',
    usuario_id: null,
    externo_id: null,
  }
}

function emptyIdea() {
  return { _key: newRowKey('idea'), texto: '', quien_dijo: '', titulo: '', imagenes: [] }
}

function normalizeIdeaImagenes(list) {
  if (!Array.isArray(list)) return []
  return list.filter((im) => im && (im.data_uri || im.blob_path || im.url))
}

function emptyApartado() {
  return { _key: newRowKey('ap'), titulo: '', contenido: '' }
}

function mapAsistenteFromApi(x, prev = null) {
  return {
    _key: prev?._key || (x.id != null ? `as-id-${x.id}` : newRowKey('as')),
    id: x.id,
    nombre: x.nombre || '',
    cargo: x.cargo || '',
    entidad: x.entidad || '',
    email: x.email || '',
    usuario_id: x.usuario_id || null,
    externo_id: x.externo_id ?? prev?.externo_id ?? null,
  }
}

function isAbortLike(e) {
  const name = e?.name || ''
  const msg = String(e?.message || e || '')
  return name === 'AbortError' || name === 'TimeoutError'
    || /aborted|timeout|signal is aborted/i.test(msg)
}

function friendlyFetchError(e, fallback = 'Error de red') {
  if (isAbortLike(e)) return 'La solicitud tardó demasiado. Intente de nuevo.'
  const msg = String(e?.message || '')
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'No se pudo conectar con el servidor. Verifique su conexión e intente de nuevo.'
  }
  return msg || fallback
}

/** Tras guardar: aporta IDs del servidor sin pisar el texto local ni filas vacías. */
function mergeAsistenteIds(local = [], server = []) {
  if (!Array.isArray(server) || !server.length) return local
  const used = new Set()
  return local.map((row) => {
    let match = null
    if (row.id != null) match = server.find((s) => Number(s.id) === Number(row.id))
    if (!match && row.usuario_id) {
      match = server.find((s) => !used.has(s.id) && Number(s.usuario_id) === Number(row.usuario_id))
    }
    if (!match && (row.nombre || '').trim()) {
      const n = row.nombre.trim().toLowerCase()
      match = server.find((s) => !used.has(s.id) && String(s.nombre || '').trim().toLowerCase() === n)
    }
    if (!match) return row
    used.add(match.id)
    return { ...row, id: match.id, externo_id: row.externo_id ?? match.externo_id ?? null }
  })
}

function mergeIdeaIds(local = [], server = []) {
  if (!Array.isArray(server) || !server.length) return local
  const used = new Set()
  const merged = local.map((row, idx) => {
    let match = null
    if (row.id != null) match = server.find((s) => Number(s.id) === Number(row.id))
    if (!match && (row.texto || '').trim()) {
      const t = row.texto.trim()
      match = server.find((s) => !used.has(s.id) && String(s.texto || '').trim() === t)
    }
    if (!match && server[idx] && !used.has(server[idx].id)) match = server[idx]
    if (!match) return row
    used.add(match.id)
    const quienServer = String(match.quien_dijo || match.interviniente || '').trim()
    const quienLocal = String(row.quien_dijo || row.interviniente || '').trim()
    const tituloServer = String(match.titulo || '').trim()
    const tituloLocal = String(row.titulo || '').trim()
    const localImgs = normalizeIdeaImagenes(row.imagenes)
    const pending = localImgs.filter((im) => im.pending && im.data_uri)
    const serverImgs = normalizeIdeaImagenes(match.imagenes)
    return {
      ...row,
      id: match.id,
      // Preferir valor persistido en servidor (evita enmascarar fallos de guardado).
      orden: match.orden != null ? Number(match.orden) : row.orden,
      quien_dijo: quienServer || quienLocal || '',
      titulo: tituloServer || tituloLocal || '',
      imagenes: [...serverImgs, ...pending],
    }
  })
  return [...merged].sort((a, b) => {
    const oa = a.orden != null ? Number(a.orden) : 1e9
    const ob = b.orden != null ? Number(b.orden) : 1e9
    if (oa !== ob) return oa - ob
    return (Number(a.id) || 0) - (Number(b.id) || 0)
  })
}

function mergeApartadoIds(local = [], server = []) {
  if (!Array.isArray(server) || !server.length) return local
  const used = new Set()
  return local.map((row, idx) => {
    let match = null
    if (row.id != null) match = server.find((s) => Number(s.id) === Number(row.id))
    if (!match && (row.titulo || '').trim()) {
      const t = row.titulo.trim().toLowerCase()
      match = server.find((s) => !used.has(s.id) && String(s.titulo || '').trim().toLowerCase() === t)
    }
    if (!match && server[idx] && !used.has(server[idx].id)) match = server[idx]
    if (!match) return row
    used.add(match.id)
    return { ...row, id: match.id }
  })
}

function parseOrdenDia(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x, i) => (
      typeof x === 'object'
        ? { texto: x.texto || x.titulo || '', hecho: !!(x.hecho || x.checked || x.done), key: x.key || newRowKey('ord') }
        : { texto: String(x), hecho: false, key: newRowKey('ord') }
    ))
  }
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      return parseOrdenDia(JSON.parse(raw))
    } catch { /* fallthrough */ }
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/\n+/).filter(Boolean).map((texto) => ({ texto, hecho: false, key: newRowKey('ord') }))
  }
  return [{ texto: '', hecho: false, key: newRowKey('ord') }]
}

/** Altura de línea usada para auto-crecimiento del textarea de ideas. */
const AUTO_GROW_LINE_PX = 22
/**
 * Tope de crecimiento (~14 líneas / ~308px de contenido).
 * Por debajo: el cuadro crece con el texto (sin scroll).
 * Al alcanzar el tope: scroll interno y el caret permanece visible.
 */
const AUTO_GROW_MAX_ROWS = 14

/** Mantiene la posición del cursor dentro del área visible del textarea. */
function scrollTextareaCaretIntoView(el) {
  if (!el || typeof el.selectionStart !== 'number') return
  const value = el.value || ''
  const caret = el.selectionEnd ?? el.selectionStart
  // Caso más frecuente al redactar: escribir al final → anclar al fondo.
  if (caret >= value.length) {
    el.scrollTop = el.scrollHeight
    return
  }
  // Edición a mitad del texto: medir con un espejo el offset del caret.
  try {
    const style = window.getComputedStyle(el)
    const mirror = document.createElement('div')
    const props = [
      'boxSizing', 'width', 'font', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
      'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'textIndent',
      'whiteSpace', 'wordWrap', 'wordBreak', 'overflowWrap', 'padding', 'border',
    ]
    props.forEach((p) => { mirror.style[p] = style[p] })
    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.height = 'auto'
    mirror.style.maxHeight = 'none'
    mirror.style.overflow = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.overflowWrap = 'break-word'
    mirror.style.width = `${el.clientWidth}px`
    mirror.textContent = value.slice(0, caret)
    const marker = document.createElement('span')
    marker.textContent = value.slice(caret, caret + 1) || '.'
    mirror.appendChild(marker)
    document.body.appendChild(mirror)
    const caretTop = marker.offsetTop
    const caretBottom = caretTop + Math.max(marker.offsetHeight, AUTO_GROW_LINE_PX)
    document.body.removeChild(mirror)
    const viewTop = el.scrollTop
    const viewBottom = viewTop + el.clientHeight
    if (caretTop < viewTop) el.scrollTop = caretTop
    else if (caretBottom > viewBottom) el.scrollTop = caretBottom - el.clientHeight
  } catch {
    /* ignore measurement errors */
  }
}

/**
 * Textarea que crece con el contenido hasta maxRows.
 * Al tope: overflow interno y caret siempre visible (como un editor convencional).
 */
function AutoGrowTextarea({
  value,
  onChange,
  style,
  minRows = 3,
  maxRows = AUTO_GROW_MAX_ROWS,
  ...rest
}) {
  const ref = useRef(null)
  const minH = Math.max(minRows, 2) * AUTO_GROW_LINE_PX
  const maxH = Math.max(minH, maxRows * AUTO_GROW_LINE_PX)

  const fit = () => {
    const el = ref.current
    if (!el) return
    // Medir sin scroll para obtener scrollHeight real del contenido.
    el.style.overflowY = 'hidden'
    el.style.height = 'auto'
    const needed = Math.max(el.scrollHeight, minH)
    const next = Math.min(needed, maxH)
    el.style.height = `${next}px`
    el.style.overflowY = needed > maxH ? 'auto' : 'hidden'
    scrollTextareaCaretIntoView(el)
  }

  useEffect(() => {
    fit()
    // minH/maxH derivan de minRows/maxRows; reajustar al cambiar valor o tope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, minRows, maxRows])

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => {
        onChange?.(e)
        requestAnimationFrame(fit)
      }}
      onKeyUp={() => scrollTextareaCaretIntoView(ref.current)}
      onClick={() => scrollTextareaCaretIntoView(ref.current)}
      onSelect={() => scrollTextareaCaretIntoView(ref.current)}
      style={{
        ...style,
        overflowX: 'hidden',
        overflowY: 'hidden',
        resize: 'none',
        minHeight: minH,
        maxHeight: maxH,
      }}
    />
  )
}

export default function ActaEditor({
  t,
  api,
  usuario,
  usuariosContrato = [],
  actaId = null,
  onSaved,
  onCancel,
  permisos,
  compact: viewportCompact = false,
  asModal = false,
}) {
  const [loading, setLoading] = useState(!!actaId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accesoDenegado, setAccesoDenegado] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [consecutivo, setConsecutivo] = useState(null)
  const [previos, setPrevios] = useState([])
  const [localActaId, setLocalActaId] = useState(actaId)
  const [tab, setTab] = useState('encabezado')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [form, setForm] = useState({
    fecha_reunion: new Date().toISOString().slice(0, 10),
    ubicacion: '',
    tipo_acta: 'interna',
    orden_items: [{ texto: '', hecho: false, key: newRowKey('ord') }],
    elaborador_id: usuario?.id || null,
    elaborador_nombre: nombre(usuario),
    asistentes: [emptyAsistente()],
    ideas: [emptyIdea()],
    apartados: [emptyApartado()],
    estado: 'borrador',
    proxima_fecha: '',
    proxima_hora: '',
    proxima_lugar: '',
  })
  const [claraIdx, setClaraIdx] = useState(null)
  /** Índice de idea cuyo editor de esquema está abierto. */
  const [esquemaIdeaIdx, setEsquemaIdeaIdx] = useState(null)
  const [compromisoCtx, setCompromisoCtx] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [detalleCompromisoId, setDetalleCompromisoId] = useState(null)
  const [actaCompromisos, setActaCompromisos] = useState([])
  /** Acordeón: una sola idea expandida (clave = _key o id). null = todas colapsadas. */
  const [ideaExpandidaKey, setIdeaExpandidaKey] = useState(null)
  const [dragIdeaIdx, setDragIdeaIdx] = useState(null)
  const [dragOverIdeaIdx, setDragOverIdeaIdx] = useState(null)
  const esDev = !!permisos?.esDesarrollador
  const esElaborador = form.elaborador_id != null
    && Number(form.elaborador_id) === Number(usuario?.id)
  const sellada = form.estado === 'realizada' || form.estado === 'firmada'
  const encabezadoGuardado = localActaId != null
  /** Nueva acta (sin id): se diligencia encabezado. Luego solo elaborador (o Dev en borrador). Sellada = nadie. */
  const puedeEditar = !sellada && (
    !encabezadoGuardado
    || esElaborador
    || (esDev && form.estado === 'borrador')
  )
  const soloLectura = !puedeEditar
  const tabsBloqueadas = !encabezadoGuardado
  /** Evita re-hidratar desde API cuando el padre pasa actaId tras el primer guardado local. */
  const skipServerHydrateRef = useRef(false)
  /** Acta ya hidratada en esta sesión del popup — no volver a pisar el formulario. */
  const hydratedActaIdRef = useRef(null)
  const apiRef = useRef(api)
  apiRef.current = api

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const client = apiRef.current
      if (skipServerHydrateRef.current) {
        skipServerHydrateRef.current = false
        hydratedActaIdRef.current = actaId
        if (!cancelled) setLoading(false)
        return
      }
      // Misma acta ya cargada: no refrescar (evita pérdida de datos por re-render / nueva ref de api).
      if (actaId != null && hydratedActaIdRef.current === actaId) {
        if (!cancelled) setLoading(false)
        return
      }
      // Nueva acta en blanco: hidratar metadatos una sola vez por montaje.
      if (actaId == null && hydratedActaIdRef.current === 'new') {
        return
      }
      try {
        if (actaId) {
          setLoading(true)
          setAccesoDenegado('')
          const a = await client.getActa(actaId)
          if (cancelled) return
          setLocalActaId(a.id)
          setConsecutivo(a.consecutivo)
          setForm({
            fecha_reunion: String(a.fecha_reunion || '').slice(0, 10),
            ubicacion: a.ubicacion || '',
            tipo_acta: a.tipo_acta || 'interna',
            orden_items: parseOrdenDia(a.orden_del_dia),
            elaborador_id: a.elaborador_id,
            elaborador_nombre: a.elaborador_nombre || '',
            asistentes: (a.asistentes || []).length
              ? a.asistentes.map((x) => mapAsistenteFromApi(x))
              : [emptyAsistente()],
            ideas: (a.ideas || []).length
              ? [...(a.ideas || [])]
                .sort((x, y) => {
                  const ox = x.orden != null ? Number(x.orden) : 1e9
                  const oy = y.orden != null ? Number(y.orden) : 1e9
                  if (ox !== oy) return ox - oy
                  return (Number(x.id) || 0) - (Number(y.id) || 0)
                })
                .map((x, i) => ({
                  _key: x.id != null ? `idea-id-${x.id}` : newRowKey('idea'),
                  id: x.id,
                  texto: x.texto || '',
                  quien_dijo: x.quien_dijo || x.interviniente || '',
                  titulo: x.titulo || '',
                  orden: x.orden != null ? Number(x.orden) : i,
                  imagenes: normalizeIdeaImagenes(x.imagenes),
                }))
              : [emptyIdea()],
            apartados: (a.apartados || []).length
              ? a.apartados.map((x) => ({
                _key: x.id != null ? `ap-id-${x.id}` : newRowKey('ap'),
                id: x.id,
                titulo: x.titulo || '',
                contenido: x.contenido || '',
              }))
              : [emptyApartado()],
            estado: (a.estado === 'en_firma' || a.estado === 'cerrada') ? 'realizada' : (a.estado || 'borrador'),
            proxima_fecha: a.proxima_fecha ? String(a.proxima_fecha).slice(0, 10) : '',
            proxima_hora: a.proxima_hora ? String(a.proxima_hora).slice(0, 5) : '',
            proxima_lugar: a.proxima_lugar || '',
          })
          setActaCompromisos(Array.isArray(a.compromisos) ? a.compromisos : [])
          hydratedActaIdRef.current = a.id
          try {
            const tipo = a.tipo_acta || 'interna'
            const abiertos = await client.compromisosAbiertos(actaId, tipo)
            if (!cancelled) setPrevios(abiertos || [])
          } catch (e) {
            if (!cancelled && !isAbortLike(e)) {
              console.warn('[ActaEditor] compromisos abiertos', e?.message || e)
            }
          }
        } else {
          const tipoNueva = 'interna'
          const [prox, abiertos] = await Promise.all([
            client.proximoConsecutivo(),
            client.compromisosAbiertos(undefined, tipoNueva).catch((e) => {
              if (!isAbortLike(e)) console.warn('[ActaEditor] compromisos abiertos', e?.message || e)
              return []
            }),
          ])
          if (cancelled) return
          setConsecutivo(prox?.consecutivo ?? null)
          setPrevios(abiertos || [])
          setActaCompromisos([])
          hydratedActaIdRef.current = 'new'
        }
      } catch (e) {
        if (!cancelled && !isAbortLike(e)) {
          if (e?.status === 403) {
            setAccesoDenegado(
              e.message
              || 'No tiene acceso a esta acta. Solo el elaborador, los asistentes registrados y los roles Administrador o Desarrollador pueden consultarla.',
            )
            setError('')
          } else {
            setError(friendlyFetchError(e, 'Error cargando acta'))
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [actaId])

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

  // Recargar compromisos previos al cambiar tipo (interna ↔ externa no se mezclan).
  useEffect(() => {
    if (loading) return
    const tipo = form.tipo_acta || 'interna'
    let cancelled = false
    ;(async () => {
      try {
        const abiertos = await apiRef.current.compromisosAbiertos(localActaId || undefined, tipo)
        if (!cancelled) setPrevios(abiertos || [])
      } catch (e) {
        if (!cancelled && !isAbortLike(e)) {
          console.warn('[ActaEditor] compromisos abiertos por tipo', e?.message || e)
        }
      }
    })()
    return () => { cancelled = true }
  }, [form.tipo_acta, localActaId, loading])

  useEffect(() => {
    if (!encabezadoGuardado && tab !== 'encabezado') setTab('encabezado')
  }, [encabezadoGuardado, tab])

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  /** Actualiza listas del formulario con updater funcional (evita carreras stale al agregar/seleccionar). */
  const patchList = (k, updater) => {
    setForm((f) => ({ ...f, [k]: updater(f[k] || []) }))
  }

  const reorderIdeas = (fromIdx, toIdx) => {
    if (fromIdx == null || toIdx == null || fromIdx === toIdx) return
    patchList('ideas', (list) => {
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length) return list
      const next = [...list]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      // Renumeración lógica (orden); el id interno (#) no cambia.
      return next.map((row, i) => ({ ...row, orden: i }))
    })
  }

  const buildPayload = (extra = {}, formSrc = form) => ({
    fecha_reunion: formSrc.fecha_reunion,
    ubicacion: formSrc.ubicacion,
    tipo_acta: formSrc.tipo_acta || 'interna',
    orden_del_dia: (formSrc.orden_items || [])
      .filter((x) => (x.texto || '').trim())
      .map((x) => ({ texto: x.texto.trim(), hecho: !!x.hecho })),
    elaborador_id: formSrc.elaborador_id,
    elaborador_nombre: formSrc.elaborador_nombre,
    proxima_fecha: (formSrc.proxima_fecha || '').trim() || null,
    proxima_hora: (formSrc.proxima_hora || '').trim() || null,
    proxima_lugar: (formSrc.proxima_lugar || '').trim() || null,
    asistentes: (formSrc.asistentes || [])
      .filter((a) => (a.nombre || '').trim())
      .map((a) => ({
        id: a.id || undefined,
        nombre: a.nombre.trim(),
        cargo: (a.cargo || '').trim() || null,
        entidad: (a.entidad || '').trim() || null,
        email: (a.email || '').trim() || null,
        usuario_id: a.usuario_id && Number(a.usuario_id) > 0 ? Number(a.usuario_id) : null,
      })),
    ideas: (formSrc.ideas || [])
      .filter((i) => !isRichTextEmpty(i.texto) || (i.quien_dijo || '').trim() || i.id
        || normalizeIdeaImagenes(i.imagenes).length)
      .map((i, idx) => {
        const quien = (i.quien_dijo || i.interviniente || '').trim() || null
        // Solo refs ya persistidas; las pending se suben tras guardar.
        const imagenes = normalizeIdeaImagenes(i.imagenes)
          .filter((im) => !im.pending && (im.blob_path || im.url))
          .map((im) => ({
            nombre: im.nombre || 'esquema.png',
            blob_path: im.blob_path || null,
            mime_type: im.mime_type || 'image/png',
            created_at: im.created_at || null,
            kind: im.kind || 'esquema',
            ...(im.url && !im.blob_path ? { url: im.url } : {}),
          }))
        return {
          id: i.id || undefined,
          texto: i.texto || '',
          quien_dijo: quien,
          interviniente: quien,
          titulo: (i.titulo || '').trim() || null,
          // Consecutivo interno = posición actual en UI (tras reordenar).
          orden: idx,
          imagenes,
        }
      }),
    apartados: (formSrc.apartados || [])
      .filter((a) => (a.titulo || a.contenido || '').trim())
      .map((a) => ({
        id: a.id || undefined,
        titulo: a.titulo || '',
        contenido: a.contenido || '',
      })),
    ...extra,
  })

  const applySavedActa = (row) => {
    skipServerHydrateRef.current = true
    hydratedActaIdRef.current = row.id
    setLocalActaId(row.id)
    setConsecutivo(row.consecutivo)
    // Solo sincroniza metadatos e IDs; no reemplaza el contenido local diligeniado.
    setForm((f) => ({
      ...f,
      estado: (row.estado === 'en_firma' || row.estado === 'cerrada') ? 'realizada' : (row.estado || f.estado),
      tipo_acta: row.tipo_acta || f.tipo_acta || 'interna',
      elaborador_id: row.elaborador_id ?? f.elaborador_id,
      elaborador_nombre: row.elaborador_nombre || f.elaborador_nombre,
      proxima_fecha: row.proxima_fecha != null
        ? String(row.proxima_fecha).slice(0, 10)
        : f.proxima_fecha,
      proxima_hora: row.proxima_hora != null
        ? String(row.proxima_hora).slice(0, 5)
        : f.proxima_hora,
      proxima_lugar: row.proxima_lugar != null ? (row.proxima_lugar || '') : f.proxima_lugar,
      asistentes: mergeAsistenteIds(f.asistentes, row.asistentes),
      ideas: mergeIdeaIds(f.ideas, row.ideas),
      apartados: mergeApartadoIds(f.apartados, row.apartados),
    }))
    return row
  }

  /** Guarda (crea o actualiza) y deja el acta e ideas con id listos para compromisos. */
  const asegurarTitulosTema = async (ideasList) => {
    const list = Array.isArray(ideasList) ? ideasList : []
    const out = []
    for (const idea of list) {
      const textoPlano = htmlToPlainText(idea.texto || '')
      const tituloActual = String(idea.titulo || '').trim()
      if (!textoPlano || tituloActual) {
        out.push(idea)
        continue
      }
      let titulo = ''
      try {
        const r = await api.redaccionClara({
          texto: textoPlano,
          modo: 'titulo_tema',
          instruccion: '',
        })
        titulo = String(r?.titulo || r?.texto || '').trim()
      } catch {
        // Fallback local: primera frase / fragmento
        const first = textoPlano.split(/[.:;\n]/)[0] || textoPlano
        titulo = first.trim().slice(0, 72)
      }
      out.push({ ...idea, titulo: titulo || idea.titulo || '' })
    }
    return out
  }

  const persistActa = async (extra = {}, formSrc = null) => {
    const src = formSrc || form
    if (!src.elaborador_id) {
      throw new Error('Seleccione un elaborador registrado en el contrato')
    }
    const ideasConTitulo = await asegurarTitulosTema(src.ideas || [])
    patchList('ideas', () => ideasConTitulo)
    const payload = buildPayload(extra, { ...src, ideas: ideasConTitulo })
    let row = localActaId
      ? await api.updateActa(localActaId, payload)
      : await api.createActa(payload)
    applySavedActa(row)
    // Subir esquemas/gráficos pendientes (requieren idea.id).
    const merged = mergeIdeaIds(ideasConTitulo, row.ideas || [])
    let uploaded = false
    for (const idea of merged) {
      if (idea.id == null) continue
      const pending = normalizeIdeaImagenes(idea.imagenes).filter((im) => im.pending && im.data_uri)
      for (const im of pending) {
        await api.pegarImagenIdea(idea.id, {
          nombre: im.nombre || `esquema-${Date.now()}.png`,
          data_base64: im.data_uri,
          mime_type: im.mime_type || 'image/png',
        })
        uploaded = true
      }
    }
    if (uploaded) {
      row = await api.getActa(row.id)
      applySavedActa(row)
    }
    return row
  }

  const pushIdeaImagenPending = (ideaIdx, { nombre, data_uri, mime_type = 'image/png' }) => {
    if (!data_uri) return false
    let added = false
    patchList('ideas', (list) => list.map((row, i) => {
      if (i !== ideaIdx) return row
      const prev = normalizeIdeaImagenes(row.imagenes)
      if (prev.length >= 8) return row
      added = true
      return {
        ...row,
        imagenes: [...prev, {
          nombre: nombre || `esquema-${Date.now()}.png`,
          data_uri,
          mime_type: mime_type || 'image/png',
          created_at: new Date().toISOString(),
          kind: 'esquema',
          pending: true,
        }],
      }
    }))
    return added
  }

  const addIdeaImagen = (ideaIdx, file) => {
    if (!file || !file.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const ok = pushIdeaImagenPending(ideaIdx, {
        nombre: file.name || `captura-${Date.now()}.png`,
        data_uri: reader.result,
        mime_type: file.type || 'image/png',
      })
      if (!ok) setError('Máximo 8 esquemas/gráficos por idea')
      else {
        setError('')
        setOkMsg('Imagen adjunta a la idea. Guarde el acta para persistirla.')
      }
    }
    reader.readAsDataURL(file)
  }

  const handleIdeaPaste = (ideaIdx, e) => {
    if (soloLectura) return
    const items = e.clipboardData?.items
    if (!items?.length) return
    let imageItem = null
    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        imageItem = item
        break
      }
    }
    if (!imageItem) return
    e.preventDefault()
    e.stopPropagation()
    const file = imageItem.getAsFile()
    if (!file) return
    // Mismo pipeline que «Adjuntar» / archivo: pending → pegarImagenIdea al guardar.
    const named = new File(
      [file],
      file.name || `captura-${Date.now()}.png`,
      { type: file.type || 'image/png' },
    )
    addIdeaImagen(ideaIdx, named)
  }

  const removeIdeaImagen = (ideaIdx, imgIdx) => {
    patchList('ideas', (list) => list.map((row, i) => {
      if (i !== ideaIdx) return row
      const next = normalizeIdeaImagenes(row.imagenes).filter((_, j) => j !== imgIdx)
      return { ...row, imagenes: next }
    }))
  }

  const guardar = async ({ estadoExtra } = {}) => {
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      if (!form.elaborador_id) {
        throw new Error('El elaborador es obligatorio')
      }
      const row = await persistActa(estadoExtra ? { estado: estadoExtra } : {})
      const msg = estadoExtra === 'realizada'
        ? 'Acta marcada como Realizada.'
        : 'Acta guardada correctamente.'
      setOkMsg(msg)
      onSaved?.(row, { stay: true, enviada: estadoExtra === 'realizada' })
      // Tras guardado OK: avanzar a la siguiente pestaña (excepto en la última).
      const idx = TABS_ACTA.findIndex((tb) => tb.id === tab)
      if (idx >= 0 && idx < TABS_ACTA.length - 1) {
        setTab(TABS_ACTA[idx + 1].id)
      }
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  const ensureReadyForCompromiso = async (ideaIdxHint, textoHint) => {
    // Asegura texto local y guarda para obtener ids
    let ideasSnapshot = form.ideas
    if (ideaIdxHint != null && textoHint != null) {
      ideasSnapshot = form.ideas.map((row, i) => (
        i === ideaIdxHint ? { ...row, texto: textoHint } : row
      ))
      patchList('ideas', () => ideasSnapshot)
    }
    const formSrc = { ...form, ideas: ideasSnapshot }
    const row = await persistActa({}, formSrc)
    const ideaLocal = ideasSnapshot[ideaIdxHint]
    let ideaId = ideaLocal?.id
    if (!ideaId && ideaIdxHint != null) {
      // match por orden / texto tras guardar
      const saved = row.ideas || []
      const byTexto = saved.find((x) => (x.texto || '').trim() === (textoHint || ideaLocal?.texto || '').trim())
      ideaId = byTexto?.id || saved[ideaIdxHint]?.id
    }
    if (!ideaId) throw new Error('No se pudo identificar la idea tras guardar el acta')
    const textoHtml = textoHint || ideaLocal?.texto || ''
    // El modal de compromiso usa textarea plano: enviar texto sin etiquetas.
    return { actaId: row.id, ideaId, texto: htmlToPlainText(textoHtml) }
  }

  const abrirCompromiso = async (ideaIdx, texto) => {
    const idea = form.ideas[ideaIdx]
    if (idea) {
      setIdeaExpandidaKey(idea._key || (idea.id != null ? `idea-id-${idea.id}` : `idea-${ideaIdx}`))
    }
    setSaving(true)
    setError('')
    try {
      const ctx = await ensureReadyForCompromiso(ideaIdx, texto)
      setCompromisoCtx(ctx)
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo preparar el compromiso'))
    } finally {
      setSaving(false)
    }
  }

  /** Compromiso puntual sin ligarlo a una idea/tema completo. */
  const abrirCompromisoLibre = async () => {
    setSaving(true)
    setError('')
    try {
      const row = await persistActa()
      if (!row?.id) throw new Error('Guarde el acta antes de agregar un compromiso')
      setCompromisoCtx({ actaId: row.id, ideaId: null, texto: '', libre: true })
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo preparar el compromiso'))
    } finally {
      setSaving(false)
    }
  }

  const previewPdf = async () => {
    setPdfBusy(true)
    setError('')
    setOkMsg('')
    try {
      if (!form.elaborador_id) {
        throw new Error('Indique el elaborador antes de generar la vista previa')
      }
      const localesConTexto = (form.ideas || []).filter((i) => !isRichTextEmpty(i.texto)).length
      const row = await persistActa()
      const guardadas = Array.isArray(row?.ideas) ? row.ideas.length : 0
      const blob = await api.pdfActaBlob(row.id)
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
      setTab('acciones')
      if (localesConTexto > 0 && guardadas < localesConTexto) {
        setOkMsg(
          `Vista previa generada con ${guardadas} idea(s) en el PDF. `
          + `En el formulario hay ${localesConTexto} con texto: guarde de nuevo si falta alguna.`,
        )
      } else {
        setOkMsg(`Vista previa generada (${guardadas} idea${guardadas === 1 ? '' : 's'} central${guardadas === 1 ? '' : 'es'}). Deslice el PDF si hay varias páginas.`)
      }
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo generar PDF'))
    } finally {
      setPdfBusy(false)
    }
  }

  const pdfFilename = () => {
    const n = consecutivo != null ? String(consecutivo) : (localActaId != null ? String(localActaId) : 'borrador')
    return `acta_seguimiento_${n}.pdf`
  }

  /** Descarga directa del PDF (usa la vista previa en memoria o genera una nueva). */
  const downloadPdf = async () => {
    setError('')
    setOkMsg('')
    try {
      if (!encabezadoGuardado) {
        throw new Error('Guarde el encabezado antes de descargar el PDF')
      }
      let url = pdfUrl
      let revokeAfter = false
      if (!url) {
        setPdfBusy(true)
        if (!form.elaborador_id) {
          throw new Error('Indique el elaborador antes de generar el PDF')
        }
        const row = await persistActa()
        const blob = await api.pdfActaBlob(row.id)
        url = URL.createObjectURL(blob)
        setPdfUrl(url)
        revokeAfter = false
      }
      const a = document.createElement('a')
      a.href = url
      a.download = pdfFilename()
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      if (revokeAfter) URL.revokeObjectURL(url)
      setOkMsg('Descarga del PDF iniciada.')
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo descargar el PDF'))
    } finally {
      setPdfBusy(false)
    }
  }

  const openPdfCompleto = () => {
    if (!pdfUrl) return
    window.open(pdfUrl, '_blank', 'noopener,noreferrer')
  }

  const firmar = async (asistenteId) => {
    try {
      let aid = localActaId
      if (!aid) {
        const row = await persistActa()
        aid = row.id
      }
      await api.firmarActa(aid, asistenteId)
      const a = await api.getActa(aid)
      applySavedActa(a)
    } catch (e) {
      setError(friendlyFetchError(e, 'No se pudo firmar'))
    }
  }

  if (loading) {
    return <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)', padding: 16 }}>Cargando acta…</div>
  }

  if (accesoDenegado) {
    const blocked = (
      <div style={{
        padding: 20, maxWidth: 520, margin: '24px auto',
        border: `1px solid ${t.border}`, borderRadius: 12, background: t.bgCard,
      }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--cc-title)', color: t.text, marginBottom: 8 }}>
          Acceso restringido
        </div>
        <p style={{ margin: '0 0 16px', color: t.text, fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
          {accesoDenegado}
        </p>
        <button type="button" onClick={onCancel} style={ghost(t)}>
          {asModal ? 'Cerrar' : 'Volver al repositorio'}
        </button>
      </div>
    )
    if (asModal) {
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 80,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', padding: 16, overflow: 'auto',
        }}>
          {blocked}
        </div>
      )
    }
    return blocked
  }

  const asistenteOpciones = (form.asistentes || [])
    .map((a) => (a.nombre || '').trim())
    .filter(Boolean)

  const body = (
    <div className={viewportCompact ? 'cc-seguim-acta-editor cc-seguim-acta-editor--compact' : 'cc-seguim-acta-editor'} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="cc-seguim-acta-head" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: asModal ? 'var(--cc-title)' : 'var(--cc-h2)', fontWeight: 700, color: t.text }}>
            {consecutivo != null ? numeroActaLabel(consecutivo) : 'Nueva acta de reunión'}
          </div>
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            {labelEstadoActa(form.estado)} · {labelTipoActa(form.tipo_acta)}
            {sellada ? ' · sellada (solo lectura)' : ''}
            {!sellada && encabezadoGuardado && soloLectura ? ' · solo lectura (elaborador exclusivo)' : ''}
            {!encabezadoGuardado ? ' · guarde el encabezado para continuar' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {puedeEditar && (permisos?.crear || permisos?.editar) && (
            <button type="button" disabled={saving} onClick={() => guardar()} style={primary(t)}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
          <button type="button" onClick={onCancel} style={ghost(t)}>{asModal ? 'Cerrar' : 'Volver'}</button>
        </div>
      </div>

      <div className="cc-seguim-acta-tabs" style={{ display: 'flex', gap: 2, flexWrap: 'nowrap', borderBottom: `1px solid ${t.border}`, paddingBottom: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {TABS_ACTA.map((tb) => {
          const locked = tabsBloqueadas && tb.id !== 'encabezado'
          const label = tb.id === 'compromisos' && previos.length > 0
            ? `${tb.label} (${previos.length})`
            : tb.label
          return (
            <button
              key={tb.id}
              type="button"
              disabled={locked}
              title={locked ? 'Guarde el encabezado primero para definir el elaborador' : undefined}
              onClick={() => {
                if (locked) return
                setTab(tb.id)
              }}
              style={{
                border: 'none',
                borderBottom: tab === tb.id ? `2px solid ${t.primary}` : '2px solid transparent',
                background: 'transparent',
                color: locked ? `${t.textMuted}99` : (tab === tb.id ? t.primary : t.textMuted),
                fontWeight: tab === tb.id ? 700 : 500,
                padding: '8px 14px',
                cursor: locked ? 'not-allowed' : 'pointer',
                fontSize: 'var(--cc-sm)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                opacity: locked ? 0.55 : 1,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {error && (
        <div style={{
          background: 'color-mix(in srgb, var(--cc-color-danger,#b91c1c) 12%, transparent)',
          border: '1px solid var(--cc-color-danger,#b91c1c)',
          color: t.text, padding: '8px 12px', borderRadius: 8, fontSize: 'var(--cc-sm)',
        }}>{error}</div>
      )}
      {okMsg && (
        <div style={{
          background: 'color-mix(in srgb, var(--cc-color-positive,#0f766e) 12%, transparent)',
          border: '1px solid var(--cc-color-positive,#0f766e)',
          color: t.text, padding: '8px 12px', borderRadius: 8, fontSize: 'var(--cc-sm)',
        }}>{okMsg}</div>
      )}

      {tab === 'encabezado' && (
      <section style={card(t)}>
        <h3 style={h3(t)}>Encabezado</h3>
        <div className="cc-seguim-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <Field t={t} label="Fecha de la reunión">
            <input
              type="date"
              className="cc-seguim-date"
              disabled={soloLectura}
              value={form.fecha_reunion}
              onChange={(e) => setField('fecha_reunion', e.target.value)}
              style={inp(t)}
            />
          </Field>
          <Field t={t} label="Tipo de acta *">
            <select
              disabled={soloLectura}
              value={form.tipo_acta || 'interna'}
              onChange={(e) => setField('tipo_acta', e.target.value)}
              style={inp(t)}
            >
              <option value="interna">Interna</option>
              <option value="externa">Externa</option>
            </select>
          </Field>
          <Field t={t} label="Ubicación">
            {soloLectura ? (
              <div style={inp(t)}>{form.ubicacion || '—'}</div>
            ) : (
              <UbicacionAutocomplete
                t={t}
                value={form.ubicacion}
                onChange={(v) => setField('ubicacion', v)}
                style={inp(t)}
              />
            )}
          </Field>
          <Field t={t} label="Elaborador *">
            {soloLectura ? (
              <div style={inp(t)}>{form.elaborador_nombre || '—'}</div>
            ) : (
              <UserSearchSelect
                t={t}
                usuarios={usuariosContrato}
                mode="strict"
                valueId={form.elaborador_id}
                valueNombre={form.elaborador_nombre}
                placeholder="Buscar usuario del contrato…"
                style={inp(t)}
                onSelect={(u) => {
                  if (!u) {
                    setForm((f) => ({ ...f, elaborador_id: null, elaborador_nombre: '' }))
                    return
                  }
                  setForm((f) => ({
                    ...f,
                    elaborador_id: u.id,
                    elaborador_nombre: nombreUser(u),
                  }))
                }}
              />
            )}
          </Field>
          <Field t={t} label="Estado">
            <select disabled value={form.estado || 'borrador'} style={inp(t)}>
              {ACTA_ESTADOS.filter((x) => x.value).map((x) => (
                <option key={x.value} value={x.value}>{x.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>
      )}

      {tab === 'orden' && (
      <section style={card(t)}>
        <h3 style={h3(t)}>Orden del día</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(form.orden_items || []).map((it, idx) => (
            <div key={it.key ?? idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                disabled={soloLectura}
                checked={!!it.hecho}
                onChange={(e) => {
                  const checked = e.target.checked
                  patchList('orden_items', (list) => list.map((row, i) => (
                    i === idx ? { ...row, hecho: checked } : row
                  )))
                }}
              />
              <input
                disabled={soloLectura}
                value={it.texto}
                placeholder={`Punto ${idx + 1}`}
                onChange={(e) => {
                  const texto = e.target.value
                  patchList('orden_items', (list) => list.map((row, i) => (
                    i === idx ? { ...row, texto } : row
                  )))
                }}
                style={{ ...inp(t), flex: 1 }}
              />
              {!soloLectura && (
                <button
                  type="button"
                  style={ghost(t)}
                  onClick={() => patchList('orden_items', (list) => list.filter((_, i) => i !== idx))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!soloLectura && (
            <button
              type="button"
              style={ghost(t)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => patchList('orden_items', (list) => [...list, { texto: '', hecho: false, key: newRowKey('ord') }])}
            >
              + Agregar punto
            </button>
          )}
        </div>
      </section>
      )}


      {tab === 'asistentes' && (
      <section style={card(t)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={h3(t)}>Asistentes</h3>
          {!soloLectura && (
            <button
              type="button"
              style={ghost(t)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => patchList('asistentes', (list) => [...list, emptyAsistente()])}
            >
              + Asistente
            </button>
          )}
        </div>
        {form.asistentes.map((a, idx) => (
          <div key={a._key || a.id || `as-${idx}`} className="cc-seguim-asistente-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,2fr) 1fr 1fr 1.2fr auto', gap: 8, marginBottom: 10, alignItems: 'start' }}>
            <UserSearchSelect
              t={t}
              usuarios={usuariosContrato}
              mode="free"
              valueId={a.usuario_id || (a.externo_id ? -Number(a.externo_id) : null)}
              valueNombre={a.nombre}
              placeholder="Buscar o digitar nombre…"
              style={inp(t)}
              onSelect={(u) => {
                patchList('asistentes', (list) => list.map((row, i) => {
                  if (i !== idx) return row
                  if (u.es_externo || (u.externo_id != null && Number(u.id) < 0)) {
                    return {
                      ...row,
                      usuario_id: null,
                      externo_id: u.externo_id ?? Math.abs(Number(u.id)),
                      nombre: nombreUser(u),
                      cargo: u.cargo_nombre || '',
                      entidad: u.empresa || '',
                      email: u.email || '',
                    }
                  }
                  return {
                    ...row,
                    usuario_id: u.id,
                    externo_id: null,
                    nombre: nombreUser(u),
                    cargo: u.cargo_nombre || row.cargo || '',
                    entidad: u.empresa || row.entidad || '',
                    email: u.email || row.email || '',
                  }
                }))
              }}
              onFreeConfirm={({ nombre }) => {
                patchList('asistentes', (list) => list.map((row, i) => (
                  i === idx
                    ? { ...row, usuario_id: null, externo_id: null, nombre }
                    : row
                )))
              }}
            />
            <input
              placeholder="Cargo"
              disabled={soloLectura}
              value={a.cargo}
              onChange={(e) => {
                const cargo = e.target.value
                patchList('asistentes', (list) => list.map((row, i) => (i === idx ? { ...row, cargo } : row)))
              }}
              style={inp(t)}
            />
            <input
              placeholder="Entidad / empresa"
              disabled={soloLectura}
              value={a.entidad}
              onChange={(e) => {
                const entidad = e.target.value
                patchList('asistentes', (list) => list.map((row, i) => (i === idx ? { ...row, entidad } : row)))
              }}
              style={inp(t)}
            />
            <input
              placeholder="Correo"
              disabled={soloLectura}
              value={a.email || ''}
              onChange={(e) => {
                const email = e.target.value
                patchList('asistentes', (list) => list.map((row, i) => (i === idx ? { ...row, email } : row)))
              }}
              style={inp(t)}
            />
            <div style={{ display: 'flex', gap: 4 }} className="cc-seguim-asistente-actions">
              {localActaId && a.id && permisos?.validar && form.estado !== 'borrador' && (
                <button type="button" title="Firmar con firma de perfil" onClick={() => firmar(a.id)} style={ghost(t)}>✎</button>
              )}
              {!soloLectura && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => patchList('asistentes', (list) => list.filter((_, i) => i !== idx))}
                  style={ghost(t)}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
      )}

      {tab === 'ideas' && (
      <section style={card(t)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={h3(t)}>Ideas centrales</h3>
          {!soloLectura && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {permisos?.crear && (
                <button
                  type="button"
                  style={ghost(t)}
                  disabled={saving}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => abrirCompromisoLibre()}
                  title="Registrar un compromiso puntual sin convertir todo un tema en un solo compromiso"
                >
                  + Agregar compromiso
                </button>
              )}
              <button
                type="button"
                style={primary(t)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const neu = emptyIdea()
                  patchList('ideas', (list) => [...list, neu].map((row, i) => ({ ...row, orden: i })))
                  // Nueva idea: expandir solo esa para redactar; el resto sigue colapsado.
                  setIdeaExpandidaKey(neu._key)
                }}
              >
                + Agregar idea
              </button>
            </div>
          )}
        </div>
        <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 4 }}>
          {soloLectura
            ? 'Pulse una idea para expandirla. Solo una permanece abierta a la vez.'
            : 'Pulse para expandir. Reordene con ⠿ (arrastre) o ↑↓. Tema 1, 2… sigue el orden; el título lo genera Clara al redactar o guardar.'}
        </div>
        {form.ideas.map((idea, idx) => {
          const ideaKey = idea._key || (idea.id != null ? `idea-id-${idea.id}` : `idea-${idx}`)
          const expanded = ideaExpandidaKey === ideaKey
          const compsIdea = (actaCompromisos || []).filter(
            (c) => idea.id != null && Number(c.idea_id) === Number(idea.id),
          )
          const tieneCompromiso = compsIdea.length > 0
          const compromisoCumplido = tieneCompromiso
            && compsIdea.every((c) => String(c.estado_gestion || '').toLowerCase() === 'cumplido')
          const interviniente = String(idea.quien_dijo || '').trim()
          const consecutivoIdea = (idea.orden != null && idea.orden !== ''
            ? Number(idea.orden)
            : idx) + 1
          const tituloTema = String(idea.titulo || '').trim()
          const headLine = [
            tituloTema ? `Tema ${consecutivoIdea}: ${tituloTema}` : `Tema ${consecutivoIdea}`,
            interviniente || null,
          ].filter(Boolean).join(' · ')
          // Institucional (primary) si hay compromiso; verde solo si está Cumplido.
          const accent = compromisoCumplido
            ? COLOR_CUMPLIDO
            : (tieneCompromiso ? t.primary : t.border)
          const bgColor = compromisoCumplido
            ? BG_CUMPLIDO
            : (expanded
              ? `${t.primary}08`
              : (tieneCompromiso ? `${t.primary}12` : (t.bgCard || 'transparent')))
          const isDragOver = dragOverIdeaIdx === idx && dragIdeaIdx != null && dragIdeaIdx !== idx
          return (
            <div
              key={ideaKey}
              className={[
                'cc-seguim-idea-accordion',
                expanded ? 'cc-seguim-idea-accordion--open' : '',
                tieneCompromiso ? 'cc-seguim-idea-accordion--con-compromiso' : '',
                compromisoCumplido ? 'cc-seguim-idea-accordion--cumplido' : '',
                isDragOver ? 'cc-seguim-idea-accordion--drag-over' : '',
              ].filter(Boolean).join(' ')}
              onDragOver={(e) => {
                if (soloLectura || dragIdeaIdx == null) return
                e.preventDefault()
                try { e.dataTransfer.dropEffect = 'move' } catch { /* ignore */ }
                if (dragOverIdeaIdx !== idx) setDragOverIdeaIdx(idx)
              }}
              onDrop={(e) => {
                if (soloLectura) return
                e.preventDefault()
                let from = dragIdeaIdx
                try {
                  const raw = e.dataTransfer.getData('text/plain')
                  if (raw !== '' && raw != null) from = Number(raw)
                } catch { /* ignore */ }
                setDragIdeaIdx(null)
                setDragOverIdeaIdx(null)
                if (Number.isFinite(from)) reorderIdeas(from, idx)
              }}
              style={{
                marginTop: 8,
                borderRadius: 8,
                border: `1px solid ${expanded ? t.primary : accent}`,
                borderLeft: tieneCompromiso ? `3px solid ${accent}` : `1px solid ${expanded ? t.primary : accent}`,
                background: bgColor,
                overflow: 'hidden',
                opacity: dragIdeaIdx === idx ? 0.55 : 1,
                outline: isDragOver ? `2px dashed ${t.primary}` : 'none',
                outlineOffset: 1,
              }}
            >
              <div
                className="cc-seguim-idea-accordion__head"
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 10px',
                  minHeight: 36,
                  color: t.text,
                }}
              >
                {!soloLectura && (
                  <span style={{ display: 'inline-flex', flexShrink: 0, alignItems: 'center', gap: 2 }}>
                    <span
                      title="Arrastrar para reordenar"
                      aria-label="Arrastrar para reordenar"
                      draggable
                      onDragStart={(e) => {
                        setDragIdeaIdx(idx)
                        try {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', String(idx))
                        } catch { /* ignore */ }
                        e.stopPropagation()
                      }}
                      onDragEnd={() => {
                        setDragIdeaIdx(null)
                        setDragOverIdeaIdx(null)
                      }}
                      style={{
                        cursor: 'grab',
                        color: t.textMuted,
                        fontSize: 14,
                        lineHeight: 1,
                        padding: '2px 4px',
                        userSelect: 'none',
                        touchAction: 'none',
                      }}
                    >
                      ⠿
                    </span>
                    <button
                      type="button"
                      title="Subir"
                      disabled={idx === 0}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => reorderIdeas(idx, idx - 1)}
                      style={{
                        ...ghost(t),
                        padding: '0 5px',
                        minHeight: 24,
                        fontSize: 11,
                        opacity: idx === 0 ? 0.35 : 1,
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Bajar"
                      disabled={idx >= form.ideas.length - 1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => reorderIdeas(idx, idx + 1)}
                      style={{
                        ...ghost(t),
                        padding: '0 5px',
                        minHeight: 24,
                        fontSize: 11,
                        opacity: idx >= form.ideas.length - 1 ? 0.35 : 1,
                      }}
                    >
                      ↓
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setIdeaExpandidaKey(expanded ? null : ideaKey)}
                  style={{
                    display: 'flex',
                    flex: 1,
                    minWidth: 0,
                    alignItems: 'center',
                    gap: 8,
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    color: t.text,
                  }}
                >
                  <span style={{
                    flexShrink: 0,
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: `1px solid ${t.border}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: t.primary,
                    fontWeight: 700,
                  }}
                  >
                    {expanded ? '▾' : '▸'}
                  </span>
                  <span style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 'var(--cc-sm)',
                    fontWeight: 700,
                    color: t.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  >
                    {headLine}
                    {!interviniente ? (
                      <span style={{ fontWeight: 500, color: t.textMuted }}> · sin interviniente</span>
                    ) : null}
                  </span>
                  {tieneCompromiso && (
                    <span style={{
                      flexShrink: 0,
                      fontSize: 'var(--cc-xs)',
                      fontWeight: 600,
                      color: accent,
                      padding: '1px 6px',
                      borderRadius: 4,
                      border: `1px solid ${accent}`,
                      background: 'transparent',
                    }}
                    >
                      {compromisoCumplido
                        ? 'Cumplido'
                        : (compsIdea.length === 1 ? 'Compromiso' : `${compsIdea.length} comp.`)}
                    </span>
                  )}
                </button>
              </div>
              {expanded && (
                <div
                  className="cc-seguim-idea-accordion__body"
                  style={{ padding: '0 12px 12px' }}
                  onPaste={(e) => handleIdeaPaste(idx, e)}
                >
                  <Field t={t} label="Interviniente">
                    <QuienDijoAutocomplete
                      t={t}
                      disabled={soloLectura}
                      value={idea.quien_dijo || ''}
                      options={asistenteOpciones}
                      placeholder={asistenteOpciones.length
                        ? 'Seleccione un asistente o digite el nombre…'
                        : 'Registre asistentes o digite el nombre…'}
                      style={inp(t)}
                      onChange={(quien_dijo) => {
                        patchList('ideas', (list) => list.map((row, i) => (
                          i === idx ? { ...row, quien_dijo } : row
                        )))
                      }}
                    />
                  </Field>
                  <TemaRichEditor
                    t={t}
                    value={idea.texto || ''}
                    editable={!soloLectura}
                    placeholder="Redacción del tema… (viñetas, 1./1.1./1.1.1., negrita Ctrl+N, cursiva Ctrl+K, subrayado Ctrl+S; Ctrl+V con imagen adjunta esquema)"
                    onChange={(html) => {
                      patchList('ideas', (list) => list.map((row, i) => (
                        i === idx ? { ...row, texto: html } : row
                      )))
                    }}
                    onPasteImage={(file) => {
                      if (soloLectura || !file) return
                      const named = new File(
                        [file],
                        file.name || `captura-${Date.now()}.png`,
                        { type: file.type || 'image/png' },
                      )
                      addIdeaImagen(idx, named)
                    }}
                  />
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: t.textMuted }}>
                        Esquemas y gráficos
                      </div>
                      {!soloLectura && normalizeIdeaImagenes(idea.imagenes).length < 8 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <label style={{ ...ghost(t), display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                            + Adjuntar
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) addIdeaImagen(idx, f)
                                e.target.value = ''
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            style={ghost(t)}
                            title="Abrir editor de esquema (misma herramienta de tareas / SICOE obra)"
                            onClick={() => setEsquemaIdeaIdx(idx)}
                          >
                            Dibujar esquema
                          </button>
                        </div>
                      )}
                    </div>
                    {normalizeIdeaImagenes(idea.imagenes).length === 0 ? (
                      <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                        Opcional: adjuntar archivo, pegar captura (Ctrl+V) o dibujar. Tamaño estándar en el PDF.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {normalizeIdeaImagenes(idea.imagenes).map((im, imgIdx) => {
                          const src = imagenSrc(im)
                          return (
                            <div
                              key={`${im.blob_path || im.nombre || 'img'}-${imgIdx}`}
                              style={{
                                width: 88,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                                alignItems: 'center',
                              }}
                            >
                              <button
                                type="button"
                                title={im.nombre || 'Ver imagen'}
                                onClick={() => openImageInNewTab(im)}
                                style={{
                                  width: 88,
                                  height: 72,
                                  padding: 0,
                                  border: `1px solid ${t.border}`,
                                  borderRadius: 8,
                                  background: t.bg || '#fff',
                                  overflow: 'hidden',
                                  cursor: src ? 'pointer' : 'default',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {src ? (
                                  <img
                                    src={src}
                                    alt={im.nombre || 'Esquema'}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'contain',
                                      display: 'block',
                                    }}
                                  />
                                ) : (
                                  <span style={{ fontSize: 10, color: t.textMuted, padding: 4 }}>Sin vista</span>
                                )}
                              </button>
                              <div style={{
                                fontSize: 10,
                                color: t.textMuted,
                                maxWidth: 88,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              >
                                {im.pending ? 'Pendiente' : (im.nombre || 'Esquema')}
                              </div>
                              {!soloLectura && (
                                <button
                                  type="button"
                                  style={{ ...ghost(t), padding: '2px 8px', fontSize: 11 }}
                                  onClick={() => removeIdeaImagen(idx, imgIdx)}
                                >
                                  Quitar
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {compsIdea.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {compsIdea.map((c) => {
                        const cump = String(c.estado_gestion || '').toLowerCase() === 'cumplido'
                        const cAccent = cump ? COLOR_CUMPLIDO : t.primary
                        return (
                          <div
                            key={c.id}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: `1px solid ${cAccent}`,
                              background: cump ? BG_CUMPLIDO : `${t.primary}12`,
                              fontSize: 'var(--cc-sm)',
                              color: t.text,
                            }}
                          >
                            <div style={{ fontWeight: 700, color: cAccent, marginBottom: 4 }}>
                              Compromiso generado
                              {c.consecutivo != null ? ` · #${c.consecutivo}` : ''}
                              {cump ? ' · Cumplido' : ''}
                            </div>
                            <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                              Vence {fmtFecha(c.fecha_vencimiento)}
                              {c.hora_vencimiento ? ` · ${String(c.hora_vencimiento).slice(0, 5)}` : ''}
                            </div>
                            <div style={{ marginTop: 2 }}>
                              Asignado: <b>{c.asignado_a_nombre || (c.asignado_a_id ? `#${c.asignado_a_id}` : '—')}</b>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {!soloLectura && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <button type="button" style={ghost(t)} onClick={() => setClaraIdx(idx)}>Redactar con Clara</button>
                      {permisos?.crear && (
                        <button
                          type="button"
                          style={ghost(t)}
                          disabled={saving || isRichTextEmpty(idea.texto)}
                          onClick={() => abrirCompromiso(idx, idea.texto)}
                        >
                          Generar compromiso
                        </button>
                      )}
                      <button
                        type="button"
                        style={ghost(t)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          patchList('ideas', (list) => list
                            .filter((_, i) => i !== idx)
                            .map((row, i) => ({ ...row, orden: i })))
                          setIdeaExpandidaKey(null)
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {(() => {
          const libres = (actaCompromisos || []).filter((c) => c.idea_id == null || c.idea_id === '')
          if (!libres.length) return null
          return (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ ...h3(t), fontSize: 'var(--cc-body)', marginBottom: 8 }}>
                Compromisos independientes de esta acta
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {libres.map((c) => {
                  const cump = String(c.estado_gestion || '').toLowerCase() === 'cumplido'
                  const cAccent = cump ? COLOR_CUMPLIDO : t.primary
                  return (
                    <div
                      key={c.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: `1px solid ${cAccent}`,
                        background: cump ? BG_CUMPLIDO : `${t.primary}12`,
                        fontSize: 'var(--cc-sm)',
                        color: t.text,
                      }}
                    >
                      <div style={{ fontWeight: 700, color: cAccent, marginBottom: 4 }}>
                        Compromiso
                        {c.consecutivo != null ? ` · #${c.consecutivo}` : ''}
                        {cump ? ' · Cumplido' : ''}
                      </div>
                      <div style={{ marginTop: 2 }}>{c.titulo || c.descripcion || '—'}</div>
                      <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 4 }}>
                        Vence {fmtFecha(c.fecha_vencimiento)}
                        {c.hora_vencimiento ? ` · ${String(c.hora_vencimiento).slice(0, 5)}` : ''}
                        {' · '}Asignado: <b>{c.asignado_a_nombre || (c.asignado_a_id ? `#${c.asignado_a_id}` : '—')}</b>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </section>
      )}

      {tab === 'compromisos' && (
      <section style={card(t)}>
        <h3 style={h3(t)}>
          Compromisos abiertos de actas {form.tipo_acta === 'externa' ? 'externas' : 'internas'} anteriores
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
          Solo se listan compromisos pendientes del mismo tipo de acta. Pulse una fila para revisar o actualizar su estado.
        </p>
        {previos.length === 0 ? (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
            No hay compromisos abiertos previos de actas {form.tipo_acta === 'externa' ? 'externas' : 'internas'}.
          </div>
        ) : (
          <div className="cc-seguim-table-scroll" style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
            <table className="cc-seguim-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', minWidth: viewportCompact ? 0 : 640 }}>
              <thead>
                <tr style={{ background: t.bg || `${t.primary}10`, color: t.textMuted, textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Acta origen</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Compromiso</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Asignado</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Vence</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {previos.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setDetalleCompromisoId(c.id)}
                    style={{
                      cursor: 'pointer',
                      borderTop: `1px solid ${t.border}`,
                      background: ORIGEN_COLOR.compromiso.bg,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.98)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
                  >
                    <td data-label="Acta origen" style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 600, color: ORIGEN_COLOR.compromiso.border }}>
                      {c.acta_numero || (c.acta_consecutivo != null ? numeroActaLabel(c.acta_consecutivo) : '—')}
                      {c.acta_fecha ? ` · ${fmtFecha(c.acta_fecha)}` : ''}
                    </td>
                    <td data-label="Compromiso" style={{ padding: '8px 10px', fontWeight: 600, color: t.text, maxWidth: 280 }}>{c.titulo}</td>
                    <td data-label="Asignado" style={{ padding: '8px 10px', color: t.text }}>{c.asignado_a_nombre || '—'}</td>
                    <td data-label="Vence" style={{ padding: '8px 10px', color: t.text }}>{fmtFecha(c.fecha_vencimiento)}</td>
                    <td data-label="Estado" style={{ padding: '8px 10px', color: t.textMuted }}>
                      {ESTADOS.find((x) => x.value === c.estado_gestion)?.label || c.estado_gestion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {tab === 'apartados' && (
      <section style={card(t)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={h3(t)}>Apartados adicionales</h3>
          {!soloLectura && (
            <button
              type="button"
              style={ghost(t)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => patchList('apartados', (list) => [...list, emptyApartado()])}
            >
              + Apartado
            </button>
          )}
        </div>
        {form.apartados.map((ap, idx) => (
          <div key={ap._key || ap.id || `ap-${idx}`} style={{ marginTop: 8 }}>
            <input
              placeholder="Título"
              disabled={soloLectura}
              value={ap.titulo}
              onChange={(e) => {
                const titulo = e.target.value
                patchList('apartados', (list) => list.map((row, i) => (i === idx ? { ...row, titulo } : row)))
              }}
              style={{ ...inp(t), marginBottom: 6 }}
            />
            <textarea
              rows={3}
              placeholder="Contenido libre"
              disabled={soloLectura}
              value={ap.contenido}
              onChange={(e) => {
                const contenido = e.target.value
                patchList('apartados', (list) => list.map((row, i) => (i === idx ? { ...row, contenido } : row)))
              }}
              style={inp(t)}
            />
          </div>
        ))}
      </section>
      )}

      {tab === 'acciones' && (
      <section style={card(t)}>
        <h3 style={h3(t)}>Vista previa y acciones del sistema</h3>
        <div
          className="cc-seguim-acta-actions"
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            gap: 6,
            alignItems: 'center',
            marginBottom: 14,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 2,
          }}
        >
          {puedeEditar && (permisos?.crear || permisos?.editar) && (
            <button
              type="button"
              disabled={saving}
              onClick={() => guardar()}
              title={saving ? 'Guardando…' : 'Guardar acta'}
              aria-label={saving ? 'Guardando…' : 'Guardar acta'}
              style={{ ...iconBtn(t), opacity: saving ? 0.45 : 1 }}
            >
              <IconSave />
            </button>
          )}
          {puedeEditar && (permisos?.crear || permisos?.editar) && form.estado === 'borrador' && encabezadoGuardado && (
            <button
              type="button"
              disabled={saving}
              onClick={() => guardar({ estadoExtra: 'realizada' })}
              title="Marcar como Realizada"
              aria-label="Marcar como Realizada"
              style={{ ...iconBtn(t), opacity: saving ? 0.45 : 1 }}
            >
              <IconCheckCircle />
            </button>
          )}
          {(permisos?.crear || permisos?.editar || permisos?.ver) && (
            <button
              type="button"
              disabled={pdfBusy || saving || !encabezadoGuardado}
              onClick={previewPdf}
              title={pdfBusy ? 'Generando PDF…' : 'Generar vista previa PDF'}
              aria-label={pdfBusy ? 'Generando PDF…' : 'Generar vista previa PDF'}
              style={{ ...iconBtn(t), opacity: (pdfBusy || saving || !encabezadoGuardado) ? 0.45 : 1 }}
            >
              <IconPdfPreview />
            </button>
          )}
          {(permisos?.crear || permisos?.editar || permisos?.ver) && (
            <button
              type="button"
              disabled={!pdfUrl || pdfBusy}
              onClick={openPdfCompleto}
              title={pdfUrl ? 'Abrir PDF completo' : 'Genere la vista previa primero'}
              aria-label="Abrir PDF completo"
              style={{ ...iconBtn(t), opacity: (!pdfUrl || pdfBusy) ? 0.45 : 1 }}
            >
              <IconPdfOpen />
            </button>
          )}
          {(permisos?.crear || permisos?.editar || permisos?.ver) && (
            <button
              type="button"
              disabled={pdfBusy || saving || !encabezadoGuardado}
              onClick={downloadPdf}
              title={pdfBusy ? 'Generando PDF…' : 'Descargar PDF'}
              aria-label="Descargar PDF"
              style={{ ...iconBtn(t), opacity: (pdfBusy || saving || !encabezadoGuardado) ? 0.45 : 1 }}
            >
              <IconPdfDownload />
            </button>
          )}
          {form.estado === 'realizada' && permisos?.validar && (
            <button
              type="button"
              onClick={() => { setTab('asistentes'); setOkMsg('Use el botón ✎ junto a cada asistente para registrar la firma de perfil.') }}
              title="Enviar a firma"
              aria-label="Enviar a firma"
              style={iconBtn(t)}
            >
              <IconSign />
            </button>
          )}
          {esDev && sellada && localActaId && (
            <button
              type="button"
              disabled={saving}
              title="Revertir a borrador (Dev)"
              aria-label="Revertir a borrador (Dev)"
              style={{ ...iconBtn(t), opacity: saving ? 0.45 : 1 }}
              onClick={async () => {
                if (!window.confirm('¿Revertir esta acta sellada a borrador editable?')) return
                setSaving(true)
                setError('')
                try {
                  const row = await api.revertirActa(localActaId)
                  applySavedActa(row)
                  setOkMsg('Acta revertida a borrador. Ya puede editarla el elaborador.')
                  onSaved?.(row, { stay: true })
                } catch (e) {
                  setError(friendlyFetchError(e, 'No se pudo revertir'))
                } finally {
                  setSaving(false)
                }
              }}
            >
              <IconUndo />
            </button>
          )}
          {permisos?.esDesarrollador && localActaId && (
            <button
              type="button"
              title="Eliminar acta"
              aria-label="Eliminar acta"
              style={{
                ...iconBtn(t),
                color: 'var(--cc-color-danger,#b91c1c)',
                borderColor: 'var(--cc-color-danger,#b91c1c)',
                background: 'color-mix(in srgb, var(--cc-color-danger,#b91c1c) 10%, transparent)',
              }}
              onClick={async () => {
                if (!window.confirm('¿Eliminar definitivamente esta acta?')) return
                try { await api.deleteActa(localActaId); onCancel?.(); onSaved?.(null, { deleted: true }) } catch (e) { setError(e.message) }
              }}
            >
              <IconTrash />
            </button>
          )}
        </div>
        {pdfUrl ? (
          <div>
            <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 8 }}>
              En iPad/tablet deslice dentro del visor o use «Abrir PDF completo» para ver todas las páginas.
            </div>
            <iframe title="PDF acta" src={pdfUrl} style={{ width: '100%', height: 'min(70vh, 640px)', border: `1px solid ${t.border}`, borderRadius: 8 }} />
          </div>
        ) : (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Genere la vista previa para visualizar el PDF del acta en este panel.</div>
        )}

        <div style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: `1px solid ${t.border}`,
        }}
        >
          <h3 style={{ ...h3(t), marginBottom: 6 }}>Próxima reunión (reserva)</h3>
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 10 }}>
            Espacio para dejar programada o reservada la información tentativa de la próxima reunión, como cierre de esta acta.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Field t={t} label="Fecha tentativa">
              <input
                type="date"
                disabled={soloLectura}
                value={form.proxima_fecha || ''}
                onChange={(e) => setField('proxima_fecha', e.target.value)}
                style={inp(t)}
              />
            </Field>
            <Field t={t} label="Hora tentativa">
              <input
                type="time"
                disabled={soloLectura}
                value={form.proxima_hora || ''}
                onChange={(e) => setField('proxima_hora', e.target.value)}
                style={inp(t)}
              />
            </Field>
            <Field t={t} label="Lugar tentativo">
              <input
                type="text"
                disabled={soloLectura}
                value={form.proxima_lugar || ''}
                onChange={(e) => setField('proxima_lugar', e.target.value)}
                placeholder="Sala, dirección o enlace…"
                style={inp(t)}
              />
            </Field>
          </div>
        </div>
      </section>
      )}

      {claraIdx != null && (
        <IdeaClaraModal
          t={t}
          api={api}
          textoInicial={htmlToPlainText(form.ideas[claraIdx]?.texto || '')}
          onClose={() => setClaraIdx(null)}
          onEnviarAlActa={async (texto) => {
            const idx = claraIdx
            const plano = String(texto || '')
            let titulo = ''
            try {
              const r = await api.redaccionClara({
                texto: plano,
                modo: 'titulo_tema',
                instruccion: '',
              })
              titulo = String(r?.titulo || r?.texto || '').trim()
            } catch { /* fallback abajo */ }
            if (!titulo) {
              const first = plano.split(/[.:;\n]/)[0] || plano
              titulo = first.trim().slice(0, 72)
            }
            const html = plainTextToHtml(plano)
            patchList('ideas', (list) => list.map((row, i) => (
              i === idx ? { ...row, texto: html, titulo } : row
            )))
            setClaraIdx(null)
          }}
          onGenerarCompromiso={async (texto) => {
            const idx = claraIdx
            const plano = String(texto || '')
            let titulo = ''
            try {
              const r = await api.redaccionClara({
                texto: plano,
                modo: 'titulo_tema',
                instruccion: '',
              })
              titulo = String(r?.titulo || r?.texto || '').trim()
            } catch { /* ignore */ }
            if (!titulo) {
              const first = plano.split(/[.:;\n]/)[0] || plano
              titulo = first.trim().slice(0, 72)
            }
            const html = plainTextToHtml(plano)
            patchList('ideas', (list) => list.map((row, i) => (
              i === idx ? { ...row, texto: html, titulo } : row
            )))
            setClaraIdx(null)
            await abrirCompromiso(idx, html)
          }}
        />
      )}

      {esquemaIdeaIdx != null && form.ideas[esquemaIdeaIdx] && (
        <EsquemaEditorModal
          t={t}
          title={`Esquema · Idea ${(esquemaIdeaIdx + 1)}`}
          onClose={() => setEsquemaIdeaIdx(null)}
          onSave={(dataUrl) => {
            const idx = esquemaIdeaIdx
            const ok = pushIdeaImagenPending(idx, {
              nombre: `esquema-idea-${idx + 1}-${Date.now()}.png`,
              data_uri: dataUrl,
              mime_type: 'image/png',
            })
            setEsquemaIdeaIdx(null)
            if (!ok) setError('Máximo 8 esquemas/gráficos por idea')
            else {
              setError('')
              setOkMsg('Esquema dibujado. Guarde el acta para persistirlo.')
            }
          }}
        />
      )}

      {compromisoCtx && (
        <CompromisoFormModal
          t={t}
          api={api}
          usuario={usuario}
          textoIdea={compromisoCtx.texto}
          usuarios={usuariosContrato}
          asistentesActa={form.asistentes || []}
          actaConsecutivo={consecutivo}
          onClose={() => setCompromisoCtx(null)}
          onSubmit={async (body) => {
            const created = compromisoCtx.libre || compromisoCtx.ideaId == null
              ? await api.crearCompromisoLibre(compromisoCtx.actaId, body)
              : await api.crearCompromiso(compromisoCtx.actaId, compromisoCtx.ideaId, body)
            const items = Array.isArray(created?.items)
              ? created.items
              : (created?.id ? [created] : [])
            if (items.length) {
              setActaCompromisos((prev) => {
                const ids = new Set((prev || []).map((x) => Number(x.id)))
                const next = [...(prev || [])]
                items.forEach((it) => {
                  if (!ids.has(Number(it.id))) next.push(it)
                })
                return next
              })
            } else if (localActaId || compromisoCtx.actaId) {
              try {
                const a = await api.getActa(localActaId || compromisoCtx.actaId)
                setActaCompromisos(Array.isArray(a?.compromisos) ? a.compromisos : [])
              } catch { /* ignore */ }
            }
            setCompromisoCtx(null)
            setError('')
            setOkMsg('Compromiso incorporado a la bandeja.')
            try {
              const abiertos = await api.compromisosAbiertos(
                localActaId || undefined,
                form.tipo_acta || 'interna',
              )
              setPrevios(abiertos || [])
            } catch { /* ignore */ }
          }}
        />
      )}

      {detalleCompromisoId != null && (
        <ItemDetalleModal
          t={t}
          api={api}
          itemId={detalleCompromisoId}
          usuario={usuario}
          usuarios={usuariosContrato}
          permisos={permisos}
          allowEstadoGestion
          revisionEnActa
          viewportCompact={viewportCompact}
          onClose={() => setDetalleCompromisoId(null)}
          onChanged={async () => {
            try {
              const abiertos = await api.compromisosAbiertos(
                localActaId || undefined,
                form.tipo_acta || 'interna',
              )
              setPrevios(abiertos || [])
            } catch { /* ignore */ }
          }}
        />
      )}
    </div>
  )

  if (asModal) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
        style={seguimientoModalOverlayStyle(viewportCompact)}
      >
        <div
          className={viewportCompact ? 'cc-seguim-modal-sheet cc-seguim-modal-sheet--acta' : 'cc-seguim-modal-sheet--desktop'}
          style={{
            ...seguimientoModalSheetStyle(viewportCompact, { wide: true }),
            background: t.bgCard,
            border: viewportCompact ? 'none' : `1px solid ${t.border}`,
            boxShadow: t.shadow,
            width: viewportCompact ? '100%' : 'min(1180px, 98vw)',
          }}
        >
          {body}
        </div>
      </div>
    )
  }
  return body
}


function nombre(u) {
  if (!u) return ''
  return `${u.nombre || ''} ${u.apellidos || ''}`.trim()
}
function Field({ t, label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
function card(t) {
  return { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16 }
}
function h3(t) {
  return { margin: '0 0 10px', fontSize: 'var(--cc-lg)', fontWeight: 700, color: t.text }
}
function inp(t) {
  return {
    width: '100%', boxSizing: 'border-box', fontSize: 'var(--cc-input)',
    padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
    background: t.bg || '#fff', color: t.text,
  }
}
function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}

/** Botón-icono compacto (mismo criterio visual que el editor de esquema). */
function iconBtn(t) {
  return {
    width: 34,
    height: 34,
    padding: 0,
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    cursor: 'pointer',
    border: `1px solid ${t.border}`,
    background: 'transparent',
    color: t.text,
  }
}

function iconSvgProps() {
  return {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
}

function IconSave() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  )
}

function IconCheckCircle() {
  return (
    <svg {...iconSvgProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  )
}

function IconPdfPreview() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <circle cx="11" cy="14" r="2.5" />
      <path d="m13 16 2.5 2.5" />
    </svg>
  )
}

function IconPdfOpen() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M10 13h4" />
      <path d="M12 11v4" />
      <path d="M17 17h3v-3" />
      <path d="m20 17-4-4" />
    </svg>
  )
}

function IconPdfDownload() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M12 11v6" />
      <path d="m9 14 3 3 3-3" />
    </svg>
  )
}

function IconSign() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconUndo() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7.7L3 7" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}
