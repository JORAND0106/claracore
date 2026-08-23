import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { MSG_ACTA_ACCESO_RESTRINGIDO } from './ActasRepositorio'
import BitacoraAuthThumb from './BitacoraAuthThumb'
import { accesoBitacora } from './bitacoraPermisos'
import { labelClima, labelEventoTipo } from './bitacoraConstants'
import { textoCompromisoCelda } from './compromisoTextoCelda'
import { htmlToPlainText, isRichTextEmpty } from './richTextUtils'
import { createSeguimientoApi } from './seguimientoApi'
import {
  fmtFecha,
  labelEstadoActa,
  labelTipoActa,
  numeroActaLabel,
} from './seguimientoTheme'
import {
  buildActasPages,
  buildBitacoraPages,
  equiposConUso,
  formatClimaResumen,
  formatEquipoDetalle,
  formatMaterialLine,
  libroPalette,
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

function DiarioPage({ page, palette, api }) {
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
        eyebrow="Reporte Diario"
        title={fmtFecha(page.fecha)}
        subtitle={[
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
        <ul className="cc-libro-list">
          {materiales.map((m, i) => (
            <li key={m.id || i}>{formatMaterialLine(m)}</li>
          ))}
        </ul>
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
                style={{ borderRadius: 6, overflow: 'hidden', border: `1px solid ${palette.pageEdge}` }}
              />
            ))}
          </div>
        </>
      )}
    </article>
  )
}

function EventoPage({ page, palette, api }) {
  const e = page.data || {}
  const fotos = Array.isArray(e.imagenes) ? e.imagenes : []
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
                const body = htmlToPlainText(idea.texto || idea.contenido || '')
                return (
                  <li key={idea.id || i}>
                    <div style={{ fontWeight: 700 }}>{titulo || `Tema ${i + 1}`}</div>
                    {body ? (
                      <div className="cc-libro-item-detail">
                        {body.length > 420 ? `${body.slice(0, 419).trim()}…` : body}
                      </div>
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
                const { short } = textoCompromisoCelda(c, 160)
                return (
                  <li key={c.id || i}>
                    <strong>{short}</strong>
                    {c.asignado_nombre || c.responsable_nombre ? (
                      <span> · {c.asignado_nombre || c.responsable_nombre}</span>
                    ) : null}
                    {c.fecha_vencimiento ? (
                      <span className="cc-libro-item-detail"> · vence {fmtFecha(c.fecha_vencimiento)}</span>
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
  const [flip, setFlip] = useState(null)
  const [actaDetails, setActaDetails] = useState({})
  const [actaLoading, setActaLoading] = useState({})
  const pointerRef = useRef({ x: 0, y: 0, active: false, moved: false })
  const flipLock = useRef(false)
  const actaFetchRef = useRef(new Set())

  const canViewBitacora = modo !== 'bitacora' || Boolean(permisosBitacora.ver)

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

  useEffect(() => { void load() }, [load])

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
  const peekPrev = pages[Math.max(index - 1, 0)] || null

  const go = useCallback((dir) => {
    if (flipLock.current || flip) return
    if (dir === 'next' && index >= total - 1) return
    if (dir === 'prev' && index <= 0) return
    flipLock.current = true
    if (dir === 'next') {
      setFlip('next')
      window.setTimeout(() => {
        setIndex((i) => i + 1)
        setFlip(null)
        flipLock.current = false
      }, FLIP_MS)
      return
    }
    setIndex((i) => i - 1)
    setFlip('prev')
    window.setTimeout(() => {
      setFlip(null)
      flipLock.current = false
    }, FLIP_MS)
  }, [flip, index, total])

  useEffect(() => {
    const onKey = (e) => {
      const tag = String(e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
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
  }, [go, onClose])

  const onPointerDown = (e) => {
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
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.15) {
      if (dx < 0) go('next')
      else go('prev')
      return
    }
    if (moved) return
    // Tap en zonas laterales del libro
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const rel = (e.clientX - rect.left) / Math.max(rect.width, 1)
    if (rel >= 0.72) go('next')
    else if (rel <= 0.28) go('prev')
  }

  const renderPageBody = (page) => {
    if (!page) return <EmptyBook label={palette.label} />
    if (page.kind === 'diario') return <DiarioPage page={page} palette={palette} api={api} />
    if (page.kind === 'evento') return <EventoPage page={page} palette={palette} api={api} />
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

  const underPage = flip === 'prev' ? peekPrev : peekNext

  return (
    <div
      ref={rootRef}
      className={`cc-libro-overlay${flip ? ' is-flipping' : ''}`}
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
      <div className="cc-libro-topbar" style={{ background: palette.headerBar }}>
        <div className="cc-libro-brand">
          <img src={LOGO_SRC} alt="ClaraCore" className="cc-libro-logo" />
          <div>
            <div className="cc-libro-brand-title">ClaraCore · Libro digital</div>
            <div className="cc-libro-brand-sub">{palette.label} · solo lectura</div>
          </div>
        </div>
        <button type="button" className="cc-libro-close" onClick={onClose} aria-label="Cerrar libro">
          <X size={18} strokeWidth={2.2} />
          <span>Cerrar</span>
        </button>
      </div>

      {!canViewBitacora ? (
        <div className="cc-libro-message">
          No tiene permiso para ver la Bitácora de Obra. Solicite el permiso «Ver» en Control de accesos.
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
            disabled={index <= 0 || Boolean(flip)}
            onClick={() => go('prev')}
            aria-label="Página anterior"
          >
            <ChevronLeft size={28} strokeWidth={2} />
          </button>

          <div
            className={[
              'cc-libro-book',
              flip === 'next' ? 'is-flip-next' : '',
              flip === 'prev' ? 'is-flip-prev' : '',
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
            <div className="cc-libro-page cc-libro-page--front">
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
            disabled={index >= total - 1 || total === 0 || Boolean(flip)}
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
              <strong>Bitácora de Obra</strong>
              <small>
                {puedeBitacora
                  ? 'Reportes Diarios y de Evento por día'
                  : 'Sin permiso para ver Bitácora'}
              </small>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
