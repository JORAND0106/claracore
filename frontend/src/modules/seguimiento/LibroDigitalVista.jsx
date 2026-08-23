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
  libroPalette,
  personalConCantidad,
} from './libroDigitalUtils'

const LOGO_SRC = '/CLARA.CORE.png'
const SWIPE_THRESHOLD = 56

function SectionTitle({ palette, children }) {
  return (
    <div
      style={{
        fontSize: 'var(--cc-sm)',
        fontWeight: 780,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: palette.accent,
        margin: '14px 0 8px',
        paddingBottom: 4,
        borderBottom: `1px solid ${palette.pageEdge}`,
      }}
    >
      {children}
    </div>
  )
}

function MetaLine({ palette, label, value }) {
  if (value == null || value === '') return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 'var(--cc-sm)', marginBottom: 4, lineHeight: 1.45 }}>
      <span style={{ color: palette.textMuted, minWidth: 92, flexShrink: 0 }}>{label}</span>
      <span style={{ color: palette.text, fontWeight: 600 }}>{value}</span>
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
      style={{ color: palette.text, fontSize: 'var(--cc-body)', lineHeight: 1.55 }}
      dangerouslySetInnerHTML={{ __html: String(html) }}
    />
  )
}

function PageHeader({ palette, eyebrow, title, subtitle }) {
  return (
    <header
      className="cc-libro-page-header"
      style={{
        marginBottom: 14,
        paddingBottom: 12,
        borderBottom: `2px solid ${palette.accent}`,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          padding: '4px 10px',
          borderRadius: 999,
          background: palette.accentSoft,
          color: palette.accent,
          fontSize: 'var(--cc-xs)',
          fontWeight: 750,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </div>
      <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 800, color: palette.text, lineHeight: 1.2 }}>
        {title}
      </div>
      {subtitle ? (
        <div style={{ marginTop: 4, fontSize: 'var(--cc-sm)', color: palette.textMuted }}>
          {subtitle}
        </div>
      ) : null}
    </header>
  )
}

function DiarioPage({ page, palette, api }) {
  const d = page.data || {}
  const clima = d.clima_descripcion || labelClima(d.clima_codigo)
  const temp = d.clima_temp_c != null && d.clima_temp_c !== '' ? `${d.clima_temp_c} °C` : ''
  const personal = personalConCantidad(d.personal)
  const equipos = equiposConUso(d.equipos_uso)
  const materiales = Array.isArray(d.materiales) ? d.materiales.filter((m) => {
    const nom = String(m?.tipo || m?.descripcion || m?.nombre || '').trim()
    return Boolean(nom)
  }) : []
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
      <MetaLine palette={palette} label="Condición" value={clima || '—'} />
      <MetaLine palette={palette} label="Temperatura" value={temp} />

      <SectionTitle palette={palette}>Personal</SectionTitle>
      {personal.length === 0 ? (
        <div style={{ color: palette.textMuted, fontSize: 'var(--cc-sm)' }}>Sin registro de personal.</div>
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
        <div style={{ color: palette.textMuted, fontSize: 'var(--cc-sm)' }}>Sin maquinaria registrada.</div>
      ) : (
        <ul className="cc-libro-list">
          {equipos.map((e, i) => (
            <li key={`${e.id || e.equipo_id || i}`}>
              <strong>{e.nombre || e.equipo_nombre || e.descripcion}</strong>
              {e.horas != null && e.horas !== '' ? <span> · {e.horas} h</span> : null}
              {e.cantidad != null && e.cantidad !== '' && e.horas == null ? <span> · {e.cantidad}</span> : null}
            </li>
          ))}
        </ul>
      )}

      <SectionTitle palette={palette}>Materiales</SectionTitle>
      {materiales.length === 0 ? (
        <div style={{ color: palette.textMuted, fontSize: 'var(--cc-sm)' }}>Sin materiales registrados.</div>
      ) : (
        <ul className="cc-libro-list">
          {materiales.map((m, i) => (
            <li key={m.id || i}>
              <strong>{m.tipo || m.nombre || m.descripcion}</strong>
              {m.cantidad != null && m.cantidad !== '' ? <span> · {m.cantidad}{m.unidad ? ` ${m.unidad}` : ''}</span> : null}
            </li>
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
                width={96}
                height={72}
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
                width={96}
                height={72}
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
        <div style={{ color: palette.textMuted, marginTop: 16, fontSize: 'var(--cc-sm)' }}>
          Cargando contenido del acta…
        </div>
      ) : (
        <>
          <SectionTitle palette={palette}>Temas</SectionTitle>
          {ideas.length === 0 ? (
            <div style={{ color: palette.textMuted, fontSize: 'var(--cc-sm)' }}>Sin temas registrados.</div>
          ) : (
            <ol className="cc-libro-ol">
              {ideas.map((idea, i) => {
                const titulo = String(idea.titulo || '').trim()
                const body = htmlToPlainText(idea.texto || idea.contenido || '')
                return (
                  <li key={idea.id || i}>
                    <div style={{ fontWeight: 700, color: palette.text }}>
                      {titulo || `Tema ${i + 1}`}
                    </div>
                    {body ? (
                      <div style={{ color: palette.textMuted, fontSize: 'var(--cc-sm)', marginTop: 2, whiteSpace: 'pre-wrap' }}>
                        {body.length > 420 ? `${body.slice(0, 419).trim()}…` : body}
                      </div>
                    ) : null}
                    {idea.quien_dijo ? (
                      <div style={{ fontSize: 'var(--cc-xs)', color: palette.textMuted, marginTop: 2 }}>
                        Quién dijo: {idea.quien_dijo}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          )}

          <SectionTitle palette={palette}>Compromisos</SectionTitle>
          {compromisos.length === 0 ? (
            <div style={{ color: palette.textMuted, fontSize: 'var(--cc-sm)' }}>Sin compromisos en esta acta.</div>
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
                      <span style={{ color: palette.textMuted }}> · vence {fmtFecha(c.fecha_vencimiento)}</span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          <SectionTitle palette={palette}>Firmantes / Asistentes</SectionTitle>
          {firmantes.length === 0 ? (
            <div style={{ color: palette.textMuted, fontSize: 'var(--cc-sm)' }}>Sin asistentes registrados.</div>
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
      <div
        role="status"
        style={{
          marginTop: 18,
          padding: '14px 16px',
          borderRadius: 10,
          border: `1px solid ${palette.pageEdge}`,
          background: palette.accentSoft,
          color: palette.text,
          fontSize: 'var(--cc-sm)',
          lineHeight: 1.5,
        }}
      >
        {MSG_ACTA_ACCESO_RESTRINGIDO}
      </div>
    </article>
  )
}

function EmptyBook({ palette, label }) {
  return (
    <div style={{
      padding: 28, textAlign: 'center', color: palette.textMuted, fontSize: 'var(--cc-body)',
    }}>
      No hay {label.toLowerCase()} para mostrar en este contrato.
    </div>
  )
}

/**
 * Vista de lectura tipo libro (solo lectura) para Actas o Bitácora de Obra.
 */
export default function LibroDigitalVista({
  modo, // 'actas' | 'bitacora'
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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pages, setPages] = useState([])
  const [index, setIndex] = useState(0)
  const [flip, setFlip] = useState(null) // 'next' | 'prev' | null
  const [actaDetails, setActaDetails] = useState({})
  const [actaLoading, setActaLoading] = useState({})
  const pointerRef = useRef({ x: 0, y: 0, active: false })
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

  // Lazy-load detalle de actas abiertas cerca de la página actual
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
        .then((row) => {
          setActaDetails((m) => ({ ...m, [sid]: row }))
        })
        .catch(() => {
          setActaDetails((m) => ({ ...m, [sid]: null }))
        })
        .finally(() => {
          setActaLoading((m) => ({ ...m, [sid]: false }))
        })
    })
  }, [modo, pages, index, api])

  const total = pages.length
  const current = pages[index] || null

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
      }, 420)
      return
    }
    setIndex((i) => i - 1)
    setFlip('prev')
    window.setTimeout(() => {
      setFlip(null)
      flipLock.current = false
    }, 420)
  }, [flip, index, total])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go('next')
      if (e.key === 'ArrowLeft') go('prev')
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  const onPointerDown = (e) => {
    pointerRef.current = { x: e.clientX, y: e.clientY, active: true }
  }
  const onPointerUp = (e) => {
    if (!pointerRef.current.active) return
    const dx = e.clientX - pointerRef.current.x
    const dy = e.clientY - pointerRef.current.y
    pointerRef.current.active = false
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.2) return
    if (dx < 0) go('next')
    else go('prev')
  }

  const renderPageBody = (page) => {
    if (!page) return <EmptyBook palette={palette} label={palette.label} />
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

  return (
    <div
      className="cc-libro-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Libro digital · ${palette.label}`}
      style={{
        ['--libro-accent']: palette.accent,
        ['--libro-spine']: palette.spine,
        ['--libro-page-bg']: palette.pageBg,
        ['--libro-page-edge']: palette.pageEdge,
        ['--libro-text']: palette.text,
        background: `radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, ${palette.accent} 22%, transparent), transparent 55%), color-mix(in srgb, ${palette.bg} 88%, #0a1628)`,
      }}
    >
      <div
        className="cc-libro-topbar"
        style={{ background: palette.headerBar }}
      >
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
            className={`cc-libro-book${flip === 'next' ? ' is-flip-next' : ''}${flip === 'prev' ? ' is-flip-prev' : ''}`}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { pointerRef.current.active = false }}
          >
            <div className="cc-libro-spine" aria-hidden />
            <div className="cc-libro-page cc-libro-page--under" aria-hidden={total <= 1}>
              {total > 1 ? renderPageBody(pages[Math.min(index + 1, total - 1)]) : null}
            </div>
            <div className="cc-libro-page cc-libro-page--front">
              <div className="cc-libro-session-mark">
                <img src={LOGO_SRC} alt="" className="cc-libro-session-logo" />
                <span>{palette.label}</span>
              </div>
              <div className="cc-libro-page-scroll">
                {total === 0
                  ? <EmptyBook palette={palette} label={palette.label} />
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
        <div className="cc-libro-footer-hint">Desliza o usa las flechas para pasar de página</div>
      </div>
    </div>
  )
}

/** Diálogo de selección Actas / Bitácora. */
export function LibroDigitalSelector({ t, open, onClose, onSelect, puedeBitacora }) {
  if (!open) return null
  const primary = t?.primary || '#0077B6'
  return (
    <div
      className="cc-libro-selector-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Elegir libro"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="cc-libro-selector-card"
        style={{
          borderColor: t?.border,
          background: t?.bgCard || '#fff',
          color: t?.text,
        }}
      >
        <div className="cc-libro-selector-head">
          <img src={LOGO_SRC} alt="ClaraCore" className="cc-libro-selector-logo" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-title)' }}>Libro digital</div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t?.textMuted }}>
              ¿Qué desea consultar?
            </div>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="cc-libro-selector-x">
            <X size={18} />
          </button>
        </div>
        <div className="cc-libro-selector-actions">
          <button
            type="button"
            className="cc-libro-selector-btn"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, ${primary} 78%, #0c4a6e), color-mix(in srgb, ${primary} 50%, #0369a1))`,
            }}
            onClick={() => onSelect?.('actas')}
          >
            <BookOpen size={22} />
            <span>
              <strong>Actas</strong>
              <small>Lectura cronológica de actas del contrato</small>
            </span>
          </button>
          <button
            type="button"
            className="cc-libro-selector-btn"
            disabled={!puedeBitacora}
            title={puedeBitacora ? undefined : 'Sin permiso «Ver» de Bitácora'}
            style={{
              background: puedeBitacora
                ? `linear-gradient(135deg, ${primary}, color-mix(in srgb, ${primary} 70%, #0891b2))`
                : `color-mix(in srgb, ${primary} 35%, #94a3b8)`,
              opacity: puedeBitacora ? 1 : 0.65,
              cursor: puedeBitacora ? 'pointer' : 'not-allowed',
            }}
            onClick={() => { if (puedeBitacora) onSelect?.('bitacora') }}
          >
            <BookOpen size={22} />
            <span>
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
