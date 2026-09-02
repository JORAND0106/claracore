import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { MSG_ACTA_ACCESO_RESTRINGIDO } from './ActasRepositorio'
import BitacoraAuthThumb from './BitacoraAuthThumb'
import { accesoBitacora } from './bitacoraPermisos'
import { labelClima, labelEventoTipo } from './bitacoraConstants'
import { labelTramoBitacora } from './bitacoraTramoHelpers'
import { isRichTextEmpty, plainTextToHtml } from './richTextUtils'
import { createSeguimientoApi } from './seguimientoApi'
import {
  fmtFecha,
  labelEstadoActa,
  labelTipoActa,
  numeroActaLabel,
} from './seguimientoTheme'
import {
  actividadRowCells,
  actividadesConRegistro,
} from './bitacoraEventoActividades'
import {
  formatHorarioAsistencia,
  labelEstadoColaborador,
} from './personalAsistenciaHelpers'
import {
  buildActasPages,
  buildBitacoraPages,
  equiposConUso,
  findPageIndexByFecha,
  formatClimaResumen,
  formatEquipoDetalle,
  libroPalette,
  materialRowCells,
  materialesConRegistro,
  personalConCantidad,
} from './libroDigitalUtils'

const LOGO_SRC = '/CLARA.CORE.png'
const SWIPE_THRESHOLD = 48
const TAP_MOVE_MAX = 12
const FLIP_MS = 560

function SectionTitle({ palette, children }) {
  return (
    <div className="cc-libro-section-title" style={{ color: palette.accent, borderColor: palette.pageEdge }}>
      {children}
    </div>
  )
}

function MetaLine({ palette, label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="cc-libro-meta-line">
      <span style={{ color: palette.textMuted }}>{label}</span>
      <span style={{ color: palette.text }}>{value}</span>
    </div>
  )
}

function ProseHtml({ html, palette }) {
  if (isRichTextEmpty(html)) {
    return <div style={{ color: palette.textMuted, fontSize: 'var(--cc-sm)' }}>—</div>
  }
  return (
    <div
      className="cc-libro-prose"
      style={{ color: palette.text }}
      dangerouslySetInnerHTML={{ __html: String(html) }}
    />
  )
}

function PageHeader({ palette, eyebrow, title, subtitle }) {
  return (
    <header className="cc-libro-page-header" style={{ borderColor: palette.accent }}>
      <div className="cc-libro-eyebrow" style={{ background: palette.accentSoft, color: palette.accent }}>
        {eyebrow}
      </div>
      <h1 className="cc-libro-page-title" style={{ color: palette.text }}>{title}</h1>
      {subtitle ? (
        <div className="cc-libro-page-sub" style={{ color: palette.textMuted }}>{subtitle}</div>
      ) : null}
    </header>
  )
}

function DiarioPage({ page, palette, api, onZoomPhoto }) {
  const d = page.data || {}
  const clima = formatClimaResumen({
    ...d,
    clima_descripcion: d.clima_descripcion || labelClima(d.clima_codigo),
  })
  const personal = personalConCantidad(d.personal)
  const equipos = equiposConUso(d.equipos_uso)
  const materiales = materialesConRegistro(d.materiales)
  const fotos = Array.isArray(d.imagenes) ? d.imagenes : []

  return (
    <article>
      <PageHeader
        palette={palette}
        eyebrow="Bitácora"
        title={fmtFecha(page.fecha)}
        subtitle={[
          `Tramo: ${labelTramoBitacora(d.tramo ?? page.tramo)}`,
          d.hora_inicio_labores ? `Inicio de labores ${String(d.hora_inicio_labores).slice(0, 5)}` : null,
          d.created_by_nombre ? `Elaborado por ${d.created_by_nombre}` : null,
          d.estado ? `Estado: ${d.estado}` : null,
        ].filter(Boolean).join(' · ')}
      />

      <SectionTitle palette={palette}>Clima</SectionTitle>
      <MetaLine palette={palette} label="Condición" value={clima.condicion} />
      <MetaLine palette={palette} label="Temperatura" value={clima.temperatura} />
      <MetaLine palette={palette} label="Código" value={clima.codigo} />
      {clima.editadoManual ? (
        <MetaLine palette={palette} label="Origen" value="Editado manualmente" />
      ) : null}

      <SectionTitle palette={palette}>Personal</SectionTitle>
      {personal.length === 0 ? (
        <div className="cc-libro-empty">Sin registro de personal.</div>
      ) : (
        <ul className="cc-libro-list">
          {personal.map((p, i) => (
            <li key={`${p.cargo}-${i}`}>
              <strong>{p.cargo === 'Otro' && p.cargo_otro ? p.cargo_otro : p.cargo}</strong>
              <span> · {p.cantidad}</span>
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(d.asistencia_colaboradores) && d.asistencia_colaboradores.length > 0 && (
        <>
          <SectionTitle palette={palette}>Asistencia</SectionTitle>
          <div className="cc-libro-sheet-wrap">
            <table className="cc-libro-sheet" style={{ borderColor: palette.pageEdge }}>
              <thead>
                <tr style={{ background: palette.accentSoft, color: palette.accent }}>
                  <th scope="col">Nombre</th>
                  <th scope="col">Cargo</th>
                  <th scope="col">Empresa</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Horario</th>
                </tr>
              </thead>
              <tbody>
                {d.asistencia_colaboradores.map((a, i) => (
                  <tr key={`as-${a.colaborador_id || a.nombre}-${i}`} style={{ color: palette.text, borderColor: palette.pageEdge }}>
                    <td data-label="Nombre">{a.nombre || '—'}</td>
                    <td data-label="Cargo">{a.cargo || '—'}</td>
                    <td data-label="Empresa">{a.subcontratista_nombre || '—'}</td>
                    <td data-label="Estado">{labelEstadoColaborador(a.estado)}</td>
                    <td data-label="Horario" className="cc-libro-sheet-cell--nowrap">{formatHorarioAsistencia(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SectionTitle palette={palette}>Maquinaria</SectionTitle>
      {equipos.length === 0 ? (
        <div className="cc-libro-empty">Sin maquinaria registrada.</div>
      ) : (
        <ul className="cc-libro-list">
          {equipos.map((e, i) => {
            const det = formatEquipoDetalle(e)
            return (
              <li key={`${e.id || e.equipo_id || i}`}>
                <strong>{det.titulo}</strong>
                {det.detalle ? <div className="cc-libro-item-detail">{det.detalle}</div> : null}
              </li>
            )
          })}
        </ul>
      )}

      <SectionTitle palette={palette}>Materiales</SectionTitle>
      {materiales.length === 0 ? (
        <div className="cc-libro-empty">Sin materiales registrados.</div>
      ) : (
        <div className="cc-libro-sheet-wrap">
          <table className="cc-libro-sheet" style={{ borderColor: palette.pageEdge }}>
            <thead>
              <tr style={{ background: palette.accentSoft, color: palette.accent }}>
                <th scope="col">Movimiento</th>
                <th scope="col">Tipo de material</th>
                <th scope="col">Proveedor</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Vale(s)</th>
                <th scope="col">PK</th>
              </tr>
            </thead>
            <tbody>
              {materiales.map((m, i) => {
                const c = materialRowCells(m)
                return (
                  <tr key={m.id || i} style={{ color: palette.text, borderColor: palette.pageEdge }}>
                    <td data-label="Movimiento">{c.movimiento}</td>
                    <td data-label="Tipo de material">{c.tipo}</td>
                    <td data-label="Proveedor">{c.proveedor}</td>
                    <td data-label="Cantidad">{c.cantidad}</td>
                    <td data-label="Vale(s)" className="cc-libro-sheet-cell--nowrap">{c.vales}</td>
                    <td data-label="PK" className="cc-libro-sheet-cell--nowrap">{c.pk}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <SectionTitle palette={palette}>Observaciones</SectionTitle>
      <ProseHtml html={d.cuerpo_html} palette={palette} />

      {fotos.length > 0 && (
        <>
          <SectionTitle palette={palette}>Fotografías</SectionTitle>
          <div className="cc-libro-fotos">
            {fotos.slice(0, 4).map((im, i) => (
              <BitacoraAuthThumb
                key={im.blob_path || im.id || i}
                api={api}
                im={im}
                width={110}
                height={82}
                onZoom={onZoomPhoto}
                style={{ borderRadius: 6, overflow: 'hidden', border: `1px solid ${palette.pageEdge}` }}
              />
            ))}
          </div>
        </>
      )}

      {Array.isArray(d.eventos) && d.eventos.length > 0 && (
        <>
          <SectionTitle palette={palette}>Eventos del día</SectionTitle>
          {d.eventos.map((ev, ei) => {
            const fotosEv = Array.isArray(ev.imagenes) ? ev.imagenes : []
            const actividades = actividadesConRegistro(ev.evento_detalle)
            return (
              <div
                key={ev.id || `ev-${ei}`}
                className="cc-libro-evento-bloque"
                style={{
                  border: `1px solid ${palette.pageEdge}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 12,
                  background: palette.accentSoft || 'transparent',
                }}
              >
                <div style={{ fontWeight: 800, color: palette.accent, marginBottom: 4 }}>
                  {labelEventoTipo(ev.evento_tipo)}
                </div>
                <MetaLine palette={palette} label="Dirigido a" value={ev.dirigido_a} />
                {ev.created_by_nombre ? (
                  <MetaLine palette={palette} label="Elaborado por" value={ev.created_by_nombre} />
                ) : null}
                <ProseHtml html={ev.cuerpo_html} palette={palette} />
                {actividades.length > 0 && (
                  <>
                    <SectionTitle palette={palette}>Actividades</SectionTitle>
                    <div className="cc-libro-sheet-wrap">
                      <table className="cc-libro-sheet" style={{ borderColor: palette.pageEdge }}>
                        <thead>
                          <tr style={{ background: palette.accentSoft, color: palette.accent }}>
                            <th scope="col">Actividad</th>
                            <th scope="col">Abs Inicio</th>
                            <th scope="col">Abs Fin</th>
                            <th scope="col">Ubicación</th>
                            <th scope="col">Cantidad</th>
                            <th scope="col">Observación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {actividades.map((a, i) => {
                            const c = actividadRowCells(a)
                            return (
                              <tr key={`act-${ei}-${i}`} style={{ color: palette.text, borderColor: palette.pageEdge }}>
                                <td data-label="Actividad">{c.actividad}</td>
                                <td data-label="Abs Inicio">{c.abs_inicio}</td>
                                <td data-label="Abs Fin">{c.abs_fin}</td>
                                <td data-label="Ubicación" className="cc-libro-sheet-cell--nowrap">{c.ubicacion}</td>
                                <td data-label="Cantidad">{c.cantidad}</td>
                                <td data-label="Observación">{c.observacion}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {fotosEv.length > 0 && (
                  <>
                    <SectionTitle palette={palette}>Fotografías del evento</SectionTitle>
                    <div className="cc-libro-fotos">
                      {fotosEv.slice(0, 4).map((im, i) => (
                        <BitacoraAuthThumb
                          key={im.blob_path || im.id || `${ei}-${i}`}
                          api={api}
                          im={im}
                          width={110}
                          height={82}
                          onZoom={onZoomPhoto}
                          style={{ borderRadius: 6, overflow: 'hidden', border: `1px solid ${palette.pageEdge}` }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </>
      )}
    </article>
  )
}

function EventoPage({ page, palette, api, onZoomPhoto }) {
  const e = page.data || {}
  const fotos = Array.isArray(e.imagenes) ? e.imagenes : []
  const actividades = actividadesConRegistro(e.evento_detalle)
  return (
    <article>
      <PageHeader
        palette={palette}
        eyebrow="Reporte de Evento"
        title={labelEventoTipo(e.evento_tipo)}
        subtitle={[
          fmtFecha(page.fecha),
          e.created_by_nombre ? `Elaborado por ${e.created_by_nombre}` : null,
        ].filter(Boolean).join(' · ')}
      />
      <MetaLine palette={palette} label="Dirigido a" value={e.dirigido_a} />
      <SectionTitle palette={palette}>Contenido</SectionTitle>
      <ProseHtml html={e.cuerpo_html} palette={palette} />
      {actividades.length > 0 && (
        <>
          <SectionTitle palette={palette}>Actividades</SectionTitle>
          <div className="cc-libro-sheet-wrap">
            <table className="cc-libro-sheet" style={{ borderColor: palette.pageEdge }}>
              <thead>
                <tr style={{ background: palette.accentSoft, color: palette.accent }}>
                  <th scope="col">Actividad</th>
                  <th scope="col">Abs Inicio</th>
                  <th scope="col">Abs Fin</th>
                  <th scope="col">Ubicación</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Observación</th>
                </tr>
              </thead>
              <tbody>
                {actividades.map((a, i) => {
                  const c = actividadRowCells(a)
                  return (
                    <tr key={`act-${i}`} style={{ color: palette.text, borderColor: palette.pageEdge }}>
                      <td data-label="Actividad">{c.actividad}</td>
                      <td data-label="Abs Inicio">{c.abs_inicio}</td>
                      <td data-label="Abs Fin">{c.abs_fin}</td>
                      <td data-label="Ubicación" className="cc-libro-sheet-cell--nowrap">{c.ubicacion}</td>
                      <td data-label="Cantidad">{c.cantidad}</td>
                      <td data-label="Observación">{c.observacion}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {fotos.length > 0 && (
        <>
          <SectionTitle palette={palette}>Fotografías</SectionTitle>
          <div className="cc-libro-fotos">
            {fotos.slice(0, 4).map((im, i) => (
              <BitacoraAuthThumb
                key={im.blob_path || im.id || i}
                api={api}
                im={im}
                width={110}
                height={82}
                onZoom={onZoomPhoto}
                style={{ borderRadius: 6, overflow: 'hidden', border: `1px solid ${palette.pageEdge}` }}
              />
            ))}
          </div>
        </>
      )}
    </article>
  )
}

function ActaPage({ page, palette, detail, loadingDetail }) {
  const meta = page.meta || {}
  const a = detail || page.data || {}
  const ideas = Array.isArray(a.ideas) ? a.ideas : []
  const compromisos = Array.isArray(a.compromisos) ? a.compromisos : []
  const asistentes = Array.isArray(a.asistentes) ? a.asistentes : []
  const firmas = Array.isArray(a.firmas) ? a.firmas : []
  const firmantes = asistentes.length
    ? asistentes
    : firmas.map((f) => ({
      nombre: f.nombre || f.firmante_nombre || 'Firmante',
      cargo: f.cargo || '',
      entidad: f.entidad || '',
    }))

  return (
    <article>
      <PageHeader
        palette={palette}
        eyebrow="Acta"
        title={numeroActaLabel(meta.consecutivo ?? a.consecutivo)}
        subtitle={[
          fmtFecha(page.fecha || a.fecha_reunion),
          labelTipoActa(meta.tipo_acta || a.tipo_acta || 'interna'),
          labelEstadoActa(meta.estado || a.estado),
        ].filter(Boolean).join(' · ')}
      />
      <MetaLine palette={palette} label="Ubicación" value={meta.ubicacion || a.ubicacion} />
      <MetaLine palette={palette} label="Elaborador" value={meta.elaborador_nombre || a.elaborador_nombre} />

      {loadingDetail && !detail ? (
        <div className="cc-libro-empty" style={{ marginTop: 16 }}>Cargando contenido del acta…</div>
      ) : (
        <>
          <SectionTitle palette={palette}>Temas</SectionTitle>
          {ideas.length === 0 ? (
            <div className="cc-libro-empty">Sin temas registrados.</div>
          ) : (
            <ol className="cc-libro-ol">
              {ideas.map((idea, i) => {
                const titulo = String(idea.titulo || '').trim()
                const raw = idea.texto || idea.contenido || ''
                const hasBody = !isRichTextEmpty(raw)
                return (
                  <li key={idea.id || i} className="cc-libro-tema-item">
                    <div style={{ fontWeight: 700, color: palette.text }}>
                      {titulo || `Tema ${i + 1}`}
                    </div>
                    {hasBody ? (
                      <ProseHtml html={plainTextToHtml(String(raw))} palette={palette} />
                    ) : null}
                    {idea.quien_dijo ? (
                      <div className="cc-libro-item-detail">Quién dijo: {idea.quien_dijo}</div>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          )}

          <SectionTitle palette={palette}>Compromisos</SectionTitle>
          {compromisos.length === 0 ? (
            <div className="cc-libro-empty">Sin compromisos en esta acta.</div>
          ) : (
            <ul className="cc-libro-list">
              {compromisos.map((c, i) => {
                const full = String(c.descripcion || c.titulo || c.redaccion || '')
                  .replace(/\s+/g, ' ')
                  .trim()
                return (
                  <li key={c.id || i} className="cc-libro-compromiso-item">
                    <div className="cc-libro-compromiso-text" style={{ color: palette.text }}>
                      {full || '—'}
                    </div>
                    {(c.asignado_nombre || c.responsable_nombre) ? (
                      <div className="cc-libro-item-detail">
                        Asignado: {c.asignado_nombre || c.responsable_nombre}
                      </div>
                    ) : null}
                    {c.fecha_vencimiento ? (
                      <div className="cc-libro-item-detail">
                        Vence {fmtFecha(c.fecha_vencimiento)}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          <SectionTitle palette={palette}>Firmantes / Asistentes</SectionTitle>
          {firmantes.length === 0 ? (
            <div className="cc-libro-empty">Sin asistentes registrados.</div>
          ) : (
            <ul className="cc-libro-list">
              {firmantes.map((f, i) => (
                <li key={f.id || i}>
                  <strong>{f.nombre || '—'}</strong>
                  {[f.cargo, f.entidad].filter(Boolean).length
                    ? <span> · {[f.cargo, f.entidad].filter(Boolean).join(' · ')}</span>
                    : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  )
}

function ActaBloqueadaPage({ page, palette }) {
  return (
    <article>
      <PageHeader
        palette={palette}
        eyebrow="Acta · acceso restringido"
        title={numeroActaLabel(page.meta?.consecutivo)}
        subtitle={fmtFecha(page.fecha)}
      />
      <div className="cc-libro-locked" style={{ borderColor: palette.pageEdge, background: palette.accentSoft }}>
        {MSG_ACTA_ACCESO_RESTRINGIDO}
      </div>
    </article>
  )
}

function EmptyBook({ label }) {
  return (
    <div className="cc-libro-empty" style={{ padding: 28, textAlign: 'center' }}>
      No hay {label.toLowerCase()} para mostrar en este contrato.
    </div>
  )
}

/**
 * Vista de lectura tipo libro (solo lectura) para Actas o Bitácora de Obra.
 */
export default function LibroDigitalVista({
  modo,
  t,
  usuario,
  token,
  contratoId,
  onClose,
}) {
  const cid = contratoId ?? usuario?.contrato_id
  const api = useMemo(() => createSeguimientoApi(cid, token), [cid, token])
  const permisosBitacora = useMemo(() => accesoBitacora(usuario, cid), [usuario, cid])
  const palette = useMemo(() => libroPalette(modo, t), [modo, t])
  const rootRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pages, setPages] = useState([])
  const [index, setIndex] = useState(0)
  /** null | 'next' | 'prev' — solo para overlay/under durante la animación WAAPI */
  const [flipDir, setFlipDir] = useState(null)
  const [actaDetails, setActaDetails] = useState({})
  const [actaLoading, setActaLoading] = useState({})
  const [zoomPhoto, setZoomPhoto] = useState(null) // { src }
  const [fechaSalto, setFechaSalto] = useState('')
  const [fechaSaltoMsg, setFechaSaltoMsg] = useState('')
  const pointerRef = useRef({ x: 0, y: 0, active: false, moved: false })
  const flipLock = useRef(false)
  const actaFetchRef = useRef(new Set())
  const frontPageRef = useRef(null)
  const indexRef = useRef(0)
  const totalRef = useRef(0)
  const animRef = useRef(null)

  indexRef.current = index
  totalRef.current = pages.length

  const canViewBitacora = modo !== 'bitacora' || Boolean(permisosBitacora.ver)

  const openZoomPhoto = useCallback((payload) => {
    if (!payload?.src) return
    setZoomPhoto({ src: payload.src })
  }, [])

  const closeZoomPhoto = useCallback(() => {
    setZoomPhoto(null)
  }, [])

  const load = useCallback(async () => {
    if (!cid || !token) {
      setError('Sesión o contrato no disponibles.')
      setLoading(false)
      return
    }
    if (modo === 'bitacora' && !permisosBitacora.ver) {
      setPages([])
      setError('')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      if (modo === 'actas') {
        const data = await api.listActas({})
        setPages(buildActasPages(Array.isArray(data) ? data : []))
      } else {
        const data = await api.listBitacora({})
        setPages(buildBitacoraPages(Array.isArray(data) ? data : []))
      }
      setIndex(0)
    } catch (e) {
      setError(e?.message || 'No se pudo cargar el libro')
      setPages([])
    } finally {
      setLoading(false)
    }
  }, [api, cid, token, modo, permisosBitacora.ver])

  useEffect(() => {
    // Cambio de contrato: vaciar páginas/caché para no mezclar contenido.
    setPages([])
    setIndex(0)
    setActaDetails({})
    setActaLoading({})
    actaFetchRef.current = new Set()
    void load()
  }, [load])

  useEffect(() => {
    rootRef.current?.focus?.({ preventScroll: true })
  }, [loading, error])

  useEffect(() => {
    if (modo !== 'actas') return
    const targets = [index - 1, index, index + 1]
      .map((i) => pages[i])
      .filter((p) => p && p.kind === 'acta' && p.sourceId != null)
    targets.forEach((p) => {
      const sid = p.sourceId
      if (actaFetchRef.current.has(sid)) return
      actaFetchRef.current.add(sid)
      setActaLoading((m) => ({ ...m, [sid]: true }))
      api.getActa(sid)
        .then((row) => setActaDetails((m) => ({ ...m, [sid]: row })))
        .catch(() => setActaDetails((m) => ({ ...m, [sid]: null })))
        .finally(() => setActaLoading((m) => ({ ...m, [sid]: false })))
    })
  }, [modo, pages, index, api])

  const total = pages.length
  const current = pages[index] || null
  const peekNext = pages[Math.min(index + 1, Math.max(total - 1, 0))] || null

  useEffect(() => {
    const f = String(current?.fecha || '').slice(0, 10)
    if (f) setFechaSalto(f)
  }, [current?.fecha])

  const saltarAFecha = useCallback((raw) => {
    const value = String(raw || '').slice(0, 10)
    setFechaSalto(value)
    setFechaSaltoMsg('')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    if (flipLock.current) return
    const idx = findPageIndexByFecha(pages, value)
    if (idx < 0) {
      setFechaSaltoMsg('Sin páginas en el libro')
      return
    }
    const matched = String(pages[idx]?.fecha || '').slice(0, 10)
    if (matched !== value) {
      setFechaSaltoMsg(matched ? `Sin entradas el ${value}. Mostrando ${matched}.` : '')
    } else {
      setFechaSaltoMsg('')
    }
    if (animRef.current) {
      try { animRef.current.cancel() } catch { /* ignore */ }
      animRef.current = null
    }
    setFlipDir(null)
    flipLock.current = false
    indexRef.current = idx
    setIndex(idx)
  }, [pages])

  /**
   * Causa del revert anterior: al quitar la clase CSS `is-flip-next`, el
   * `transition` devolvía la hoja de -160° a 0° (animación inversa).
   * Aquí el giro se hace con Web Animations API; al terminar se cancela la
   * animación (sin reverse) y recién entonces se actualiza el índice.
   */
  const go = useCallback((dir) => {
    if (flipLock.current || zoomPhoto) return
    const i = indexRef.current
    const n = totalRef.current
    if (dir === 'next' && i >= n - 1) return
    if (dir === 'prev' && i <= 0) return

    const el = frontPageRef.current
    if (!el || typeof el.animate !== 'function') {
      // Fallback sin animación (entornos raros): cambio estable de página
      setIndex((cur) => (dir === 'next' ? cur + 1 : cur - 1))
      return
    }

    flipLock.current = true
    if (animRef.current) {
      try { animRef.current.cancel() } catch { /* ignore */ }
      animRef.current = null
    }

    const from = 'rotateY(0deg)'
    const to = 'rotateY(-160deg)'
    const shadowFlat = '0 22px 44px rgba(10, 22, 40, 0.22)'
    const shadowFlip = '-28px 16px 36px rgba(10, 22, 40, 0.28)'

    setFlipDir(dir)

    const run = async () => {
      try {
        if (dir === 'next') {
          const anim = el.animate(
            [
              { transform: from, boxShadow: shadowFlat },
              { transform: to, boxShadow: shadowFlip },
            ],
            { duration: FLIP_MS, easing: 'cubic-bezier(0.22, 0.7, 0.2, 1)', fill: 'forwards' },
          )
          animRef.current = anim
          await anim.finished.catch(() => {})
          // Congelar en 0 sin transición inversa, luego cambiar contenido
          anim.cancel()
          el.style.transition = 'none'
          el.style.transform = 'rotateY(0deg)'
          el.style.boxShadow = ''
          setIndex((cur) => cur + 1)
          setFlipDir(null)
          requestAnimationFrame(() => {
            el.style.transition = ''
            el.style.transform = ''
            flipLock.current = false
            animRef.current = null
          })
          return
        }

        // prev: primero cambiar al contenido destino, pintar, luego abrir de -160° a 0°
        setIndex((cur) => cur - 1)
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        })
        const front = frontPageRef.current
        if (!front) {
          setFlipDir(null)
          flipLock.current = false
          return
        }
        front.style.transition = 'none'
        front.style.transform = to
        front.style.boxShadow = shadowFlip
        void front.offsetWidth
        const anim = front.animate(
          [
            { transform: to, boxShadow: shadowFlip },
            { transform: from, boxShadow: shadowFlat },
          ],
          { duration: FLIP_MS, easing: 'cubic-bezier(0.22, 0.7, 0.2, 1)', fill: 'forwards' },
        )
        animRef.current = anim
        await anim.finished.catch(() => {})
        anim.cancel()
        front.style.transition = 'none'
        front.style.transform = 'rotateY(0deg)'
        front.style.boxShadow = ''
        setFlipDir(null)
        requestAnimationFrame(() => {
          front.style.transition = ''
          front.style.transform = ''
          flipLock.current = false
          animRef.current = null
        })
      } catch {
        setIndex((cur) => (dir === 'next' ? Math.min(cur + 1, n - 1) : Math.max(cur - 1, 0)))
        setFlipDir(null)
        flipLock.current = false
        animRef.current = null
      }
    }
    void run()
  }, [zoomPhoto])

  useEffect(() => {
    const onKey = (e) => {
      const tag = String(e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
      if (zoomPhoto) {
        if (e.key === 'Escape') {
          e.preventDefault()
          closeZoomPhoto()
        }
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        go('next')
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go('prev')
      } else if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose, zoomPhoto, closeZoomPhoto])

  const onPointerDown = (e) => {
    if (zoomPhoto) return
    if (e.button != null && e.button !== 0) return
    pointerRef.current = { x: e.clientX, y: e.clientY, active: true, moved: false }
  }
  const onPointerMove = (e) => {
    if (!pointerRef.current.active) return
    const dx = Math.abs(e.clientX - pointerRef.current.x)
    const dy = Math.abs(e.clientY - pointerRef.current.y)
    if (dx > TAP_MOVE_MAX || dy > TAP_MOVE_MAX) pointerRef.current.moved = true
  }
  const onPointerUp = (e) => {
    if (!pointerRef.current.active) return
    const dx = e.clientX - pointerRef.current.x
    const dy = e.clientY - pointerRef.current.y
    const moved = pointerRef.current.moved
    pointerRef.current.active = false
    if (zoomPhoto) return
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.15) {
      if (dx < 0) go('next')
      else go('prev')
      return
    }
    if (moved) return
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const rel = (e.clientX - rect.left) / Math.max(rect.width, 1)
    if (rel >= 0.72) go('next')
    else if (rel <= 0.28) go('prev')
  }

  const renderPageBody = (page) => {
    if (!page) return <EmptyBook label={palette.label} />
    if (page.kind === 'diario') {
      return <DiarioPage page={page} palette={palette} api={api} onZoomPhoto={openZoomPhoto} />
    }
    if (page.kind === 'evento') {
      return <EventoPage page={page} palette={palette} api={api} onZoomPhoto={openZoomPhoto} />
    }
    if (page.kind === 'acta_bloqueada') return <ActaBloqueadaPage page={page} palette={palette} />
    if (page.kind === 'acta') {
      return (
        <ActaPage
          page={page}
          palette={palette}
          detail={actaDetails[page.sourceId]}
          loadingDetail={Boolean(actaLoading[page.sourceId])}
        />
      )
    }
    return null
  }

  const underPage = peekNext
  const flipping = Boolean(flipDir)

  return (
    <div
      ref={rootRef}
      className={`cc-libro-overlay${flipping ? ' is-flipping' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Libro digital · ${palette.label}`}
      tabIndex={-1}
      style={{
        ['--libro-accent']: palette.accent,
        ['--libro-spine']: palette.spine,
        ['--libro-page-bg']: palette.pageBg,
        ['--libro-page-edge']: palette.pageEdge,
        ['--libro-text']: palette.text,
        ['--libro-muted']: palette.textMuted,
        ['--libro-cover']: palette.cover,
        background: `
          radial-gradient(90% 70% at 50% -10%, color-mix(in srgb, ${palette.accent} 28%, transparent), transparent 60%),
          linear-gradient(180deg, color-mix(in srgb, ${palette.bg} 70%, #0a1628), color-mix(in srgb, ${palette.bg} 40%, #0a1628))
        `,
      }}
    >
      <CcModalBrandHeader theme={t} />
      <div className="cc-libro-topbar" style={{ background: palette.headerBar }}>
        <div className="cc-libro-brand">
          <img src={LOGO_SRC} alt="ClaraCore" className="cc-libro-logo" />
          <div>
            <div className="cc-libro-brand-title">ClaraCore · Libro digital</div>
            <div className="cc-libro-brand-sub">{palette.label} · solo lectura</div>
          </div>
        </div>
        <div className="cc-libro-topbar-actions">
          {!loading && !error && canViewBitacora && total > 0 && (
            <label className="cc-libro-fecha-jump">
              <span>Ir a fecha</span>
              <input
                type="date"
                value={fechaSalto}
                onChange={(e) => saltarAFecha(e.target.value)}
                aria-label="Buscar página por fecha"
              />
            </label>
          )}
          <button type="button" className="cc-libro-close" onClick={onClose} aria-label="Cerrar libro">
            <X size={18} strokeWidth={2.2} />
            <span>Cerrar</span>
          </button>
        </div>
      </div>
      {fechaSaltoMsg ? (
        <div className="cc-libro-fecha-msg" role="status">{fechaSaltoMsg}</div>
      ) : null}

      {!canViewBitacora ? (
        <div className="cc-libro-message">
          No tiene permiso para ver la Bitácora. Solicite el permiso «Ver» en Control de accesos.
        </div>
      ) : loading ? (
        <div className="cc-libro-message">Abriendo el libro…</div>
      ) : error ? (
        <div className="cc-libro-message cc-libro-message--error">{error}</div>
      ) : (
        <div className="cc-libro-stage">
          <button
            type="button"
            className="cc-libro-nav"
            disabled={index <= 0 || flipping}
            onClick={() => go('prev')}
            aria-label="Página anterior"
          >
            <ChevronLeft size={28} strokeWidth={2} />
          </button>

          <div
            className={[
              'cc-libro-book',
              flipDir === 'next' ? 'is-flip-next' : '',
              flipDir === 'prev' ? 'is-flip-prev' : '',
            ].filter(Boolean).join(' ')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { pointerRef.current.active = false }}
          >
            <div className="cc-libro-spine" aria-hidden />
            <div className="cc-libro-stack" aria-hidden />
            <div className="cc-libro-page cc-libro-page--under">
              <div className="cc-libro-session-mark">
                <img src={LOGO_SRC} alt="" className="cc-libro-session-logo" />
                <span>{palette.label}</span>
              </div>
              <div className="cc-libro-page-scroll">
                {total > 1 ? renderPageBody(underPage) : null}
              </div>
            </div>
            <div className="cc-libro-page cc-libro-page--front" ref={frontPageRef}>
              <div className="cc-libro-session-mark">
                <img src={LOGO_SRC} alt="" className="cc-libro-session-logo" />
                <span>{palette.label}</span>
              </div>
              <div className="cc-libro-page-scroll">
                {total === 0
                  ? <EmptyBook label={palette.label} />
                  : renderPageBody(current)}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="cc-libro-nav"
            disabled={index >= total - 1 || total === 0 || flipping}
            onClick={() => go('next')}
            aria-label="Página siguiente"
          >
            <ChevronRight size={28} strokeWidth={2} />
          </button>
        </div>
      )}

      <div className="cc-libro-footer">
        <div className="cc-libro-footer-left">
          <BookOpen size={16} strokeWidth={2.2} aria-hidden />
          <span>{palette.label}</span>
        </div>
        <div className="cc-libro-pager" aria-live="polite">
          {total === 0 ? '0 / 0' : `${index + 1} / ${total}`}
        </div>
        <div className="cc-libro-footer-hint">
          Desliza, toca los laterales o usa ← → del teclado
        </div>
      </div>

      {zoomPhoto?.src ? (
        <div
          className="cc-libro-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="Fotografía ampliada"
          onClick={closeZoomPhoto}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="cc-libro-zoom-close"
            onClick={closeZoomPhoto}
            aria-label="Cerrar zoom"
          >
            <X size={20} strokeWidth={2.2} />
            <span>Cerrar</span>
          </button>
          <img
            src={zoomPhoto.src}
            alt="Fotografía ampliada"
            className="cc-libro-zoom-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  )
}

/** Selector con portadas tipo libro (lomo lateral). */
export function LibroDigitalSelector({ t, open, onClose, onSelect, puedeBitacora }) {
  if (!open) return null
  const actasPal = libroPalette('actas', t)
  const bitPal = libroPalette('bitacora', t)

  return (
    <div
      className="cc-libro-selector-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Elegir libro"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="cc-libro-selector-shell" style={{ color: t?.text }}>
        <div className="cc-libro-selector-head">
          <img src={LOGO_SRC} alt="ClaraCore" className="cc-libro-selector-logo" />
          <div>
            <div className="cc-libro-selector-title">Libro digital</div>
            <div className="cc-libro-selector-sub" style={{ color: t?.textMuted }}>
              Elija el volumen que desea consultar
            </div>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="cc-libro-selector-x">
            <X size={18} />
          </button>
        </div>

        <div className="cc-libro-covers">
          <button
            type="button"
            className="cc-libro-cover"
            style={{ ['--cover-bg']: actasPal.cover, ['--cover-spine']: actasPal.spine }}
            onClick={() => onSelect?.('actas')}
          >
            <span className="cc-libro-cover-spine" aria-hidden />
            <span className="cc-libro-cover-face">
              <img src={LOGO_SRC} alt="" className="cc-libro-cover-logo" />
              <strong>Actas</strong>
              <small>Lectura cronológica de actas del contrato</small>
            </span>
          </button>

          <button
            type="button"
            className="cc-libro-cover"
            disabled={!puedeBitacora}
            title={puedeBitacora ? undefined : 'Sin permiso «Ver» de Bitácora'}
            style={{
              ['--cover-bg']: bitPal.cover,
              ['--cover-spine']: bitPal.spine,
              opacity: puedeBitacora ? 1 : 0.55,
              cursor: puedeBitacora ? 'pointer' : 'not-allowed',
            }}
            onClick={() => { if (puedeBitacora) onSelect?.('bitacora') }}
          >
            <span className="cc-libro-cover-spine" aria-hidden />
            <span className="cc-libro-cover-face">
              <img src={LOGO_SRC} alt="" className="cc-libro-cover-logo" />
              <strong>Bitácora</strong>
              <small>
                {puedeBitacora
                  ? 'Documentos por día con eventos embebidos'
                  : 'Sin permiso para ver Bitácora'}
              </small>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
