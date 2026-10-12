import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageSquareText, RefreshCw } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import TemaRichEditor from './TemaRichEditor'
import { isRichTextEmpty } from './richTextUtils'
import {
  GESTION_OBRA_SECCIONES,
  emptyObservacionesGestionObra,
  rangoSemanaAnterior,
} from './gestionObraRango.js'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'

const CHART_COLORS = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#15803d', '#a16207']

/**
 * TAB Gestión de obra: consolidado gráfico de la semana (o rango elegido).
 * No bloquea el avance del flujo de actas.
 */
export default function ActaGestionObraPanel({
  t,
  api,
  actaId,
  fechaReunion,
  value = null,
  soloLectura = false,
  onChange,
  viewportCompact = false,
}) {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [obsSeccion, setObsSeccion] = useState(null)
  const [obsDraft, setObsDraft] = useState('')

  const snap = value && typeof value === 'object' ? value : null
  const datos = snap?.datos && typeof snap.datos === 'object' ? snap.datos : {}
  const observaciones = useMemo(
    () => ({ ...emptyObservacionesGestionObra(), ...(snap?.observaciones || {}) }),
    [snap],
  )

  useEffect(() => {
    if (snap?.fecha_desde && snap?.fecha_hasta) {
      setDesde(String(snap.fecha_desde).slice(0, 10))
      setHasta(String(snap.fecha_hasta).slice(0, 10))
      return
    }
    const r = rangoSemanaAnterior(fechaReunion)
    setDesde(r.fecha_desde)
    setHasta(r.fecha_hasta)
  }, [snap?.fecha_desde, snap?.fecha_hasta, fechaReunion])

  const recalcular = useCallback(async (d0, d1) => {
    if (!api?.recalcularGestionObra || !actaId) {
      setError('Guarde el encabezado del acta para calcular el consolidado.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const row = await api.recalcularGestionObra(actaId, {
        fecha_desde: d0,
        fecha_hasta: d1,
        conservar_observaciones: true,
      })
      onChange?.(row?.gestion_obra || null)
    } catch (e) {
      setError(e?.message || 'No se pudo calcular el consolidado')
    } finally {
      setBusy(false)
    }
  }, [api, actaId, onChange])

  // Primera carga automática si hay acta y aún no hay snapshot.
  useEffect(() => {
    if (!actaId || soloLectura || snap?.datos) return
    const r = rangoSemanaAnterior(fechaReunion)
    recalcular(r.fecha_desde, r.fecha_hasta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actaId])

  const aplicarRango = () => {
    if (!desde || !hasta) {
      setError('Indique fecha desde y hasta')
      return
    }
    if (hasta < desde) {
      setError('La fecha hasta debe ser posterior o igual a desde')
      return
    }
    recalcular(desde, hasta)
  }

  const abrirObs = (secId) => {
    setObsSeccion(secId)
    setObsDraft(observaciones[secId] || '')
  }

  const guardarObs = () => {
    if (!obsSeccion) return
    const next = {
      ...(snap || {}),
      fecha_desde: desde || snap?.fecha_desde,
      fecha_hasta: hasta || snap?.fecha_hasta,
      datos: snap?.datos || {},
      observaciones: {
        ...observaciones,
        [obsSeccion]: obsDraft,
      },
      snapshot_at: snap?.snapshot_at || null,
    }
    onChange?.(next)
    setObsSeccion(null)
  }

  const labelObs = GESTION_OBRA_SECCIONES.find((s) => s.id === obsSeccion)?.label || 'Observaciones'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 'var(--cc-h2)', color: t.text }}>Gestión de obra</div>
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 2, maxWidth: 560, lineHeight: 1.4 }}>
            Consolidado de la semana anterior a la reunión (personal, cantidades SICOE, actividades,
            almacén y programación). Puede cambiar el rango; al guardar queda fijado con el acta.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <label style={lbl(t)}>
            Desde
            <input
              type="date"
              disabled={soloLectura || busy}
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              style={inp(t)}
            />
          </label>
          <label style={lbl(t)}>
            Hasta
            <input
              type="date"
              disabled={soloLectura || busy}
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              style={inp(t)}
            />
          </label>
          {!soloLectura && (
            <button
              type="button"
              title="Recalcular consolidado"
              aria-label="Recalcular consolidado"
              disabled={busy || !actaId}
              onClick={aplicarRango}
              style={iconBtn(t)}
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)' }}>{error}</div>
      )}
      {busy && (
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Calculando consolidado…</div>
      )}
      {snap?.snapshot_at && (
        <div style={{ fontSize: 11, color: t.textMuted }}>
          Datos al {String(snap.snapshot_at).slice(0, 19).replace('T', ' ')} UTC
          {desde && hasta ? ` · Rango ${desde} → ${hasta}` : ''}
        </div>
      )}

      <SectionCard
        t={t}
        title="1. Personal y jornada"
        onObs={!soloLectura ? () => abrirObs('personal_jornada') : null}
        hasObs={!isRichTextEmpty(observaciones.personal_jornada)}
      >
        <PersonalJornadaBlock t={t} data={datos.personal_jornada} />
        <ObsPreview t={t} html={observaciones.personal_jornada} />
      </SectionCard>

      <SectionCard
        t={t}
        title="2. Cantidades de obra"
        onObs={!soloLectura ? () => abrirObs('cantidades_obra') : null}
        hasObs={!isRichTextEmpty(observaciones.cantidades_obra)}
      >
        <TablaSeries
          t={t}
          data={datos.cantidades_obra}
          columns={[
            { key: 'tramo', label: 'Tramo' },
            { key: 'item', label: 'Ítem' },
            { key: 'unidad', label: 'Und' },
            { key: 'cantidad', label: 'Cantidad', align: 'right' },
          ]}
          emptyHint="Sin cantidades SICOE en el rango."
        />
        <ObsPreview t={t} html={observaciones.cantidades_obra} />
      </SectionCard>

      <SectionCard
        t={t}
        title="3. Actividades adicionales"
        onObs={!soloLectura ? () => abrirObs('actividades') : null}
        hasObs={!isRichTextEmpty(observaciones.actividades)}
      >
        <TablaSeries
          t={t}
          data={datos.actividades}
          columns={[
            { key: 'fecha', label: 'Fecha' },
            { key: 'tramo', label: 'Tramo' },
            { key: 'actividad', label: 'Actividad' },
            { key: 'detalle', label: 'Detalle' },
          ]}
          emptyHint="Sin actividades adicionales en Bitácora."
        />
        <ObsPreview t={t} html={observaciones.actividades} />
      </SectionCard>

      <SectionCard
        t={t}
        title="4. Almacén"
        onObs={!soloLectura ? () => abrirObs('almacen') : null}
        hasObs={!isRichTextEmpty(observaciones.almacen)}
      >
        <TablaSeries
          t={t}
          data={datos.almacen}
          columns={[
            { key: 'tipo', label: 'Tipo' },
            { key: 'fecha', label: 'Fecha' },
            { key: 'estado', label: 'Estado' },
            { key: 'ref', label: 'Ref.' },
          ]}
          emptyHint="Sin movimientos de almacén en el rango."
        />
        <ObsPreview t={t} html={observaciones.almacen} />
      </SectionCard>

      <SectionCard
        t={t}
        title="5. Programación de obra"
        onObs={!soloLectura ? () => abrirObs('programacion') : null}
        hasObs={!isRichTextEmpty(observaciones.programacion)}
      >
        <ProgramacionBlock t={t} data={datos.programacion} />
        <ObsPreview t={t} html={observaciones.programacion} />
      </SectionCard>

      {obsSeccion && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ ...seguimientoModalOverlayStyle(viewportCompact), zIndex: 12150 }}
          onClick={(e) => { if (e.target === e.currentTarget) setObsSeccion(null) }}
        >
          <div
            style={{
              ...seguimientoModalSheetStyle(viewportCompact, { wide: true }),
              width: viewportCompact ? '100%' : 'min(860px, 96vw)',
              background: t.bgCard,
              border: viewportCompact ? 'none' : `1px solid ${t.border}`,
              boxShadow: t.shadow,
              padding: viewportCompact ? undefined : 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <CcModalBrandHeader theme={t} />
            <div style={{ fontWeight: 700, fontSize: 'var(--cc-title)', color: t.text, marginBottom: 10 }}>
              Observaciones · {labelObs}
            </div>
            <TemaRichEditor
              t={t}
              value={obsDraft}
              onChange={setObsDraft}
              placeholder="Escriba las observaciones de esta sección…"
              minHeight={180}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" style={ghost(t)} onClick={() => setObsSeccion(null)}>Cancelar</button>
              <button type="button" style={primary(t)} onClick={guardarObs}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PersonalJornadaBlock({ t, data }) {
  if (!data || data.disponible === false) {
    return <EmptyMsg t={t} text={data?.mensaje || 'Sin datos de personal en el rango.'} />
  }
  const personal = data.personal || {}
  const filas = personal.filas || []
  const series = personal.series || []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <MiniChart t={t} series={series} title="Personal por empresa" />
      <SimpleTable
        t={t}
        columns={[
          { key: 'empresa', label: 'Empresa' },
          { key: 'cargo', label: 'Cargo' },
          { key: 'cantidad', label: 'Cant.', align: 'right' },
        ]}
        rows={filas}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
        <InfoChip
          t={t}
          title="Ausentismo"
          body={data.ausentismo?.disponible
            ? `${data.ausentismo.ausentes || 0} ausentes / ${data.ausentismo.total || 0} registros`
            : (data.ausentismo?.mensaje || 'No registrado')}
        />
        <InfoChip
          t={t}
          title="Jornada laboral"
          body={data.jornada?.disponible
            ? `Promedio ${data.jornada.promedio_horas} h (${data.jornada.registros} registros)`
            : (data.jornada?.mensaje || 'No registrada')}
        />
        <InfoChip
          t={t}
          title="Maquinaria / transporte"
          body={(data.maquinaria?.filas || []).length
            ? `${(data.maquinaria.filas || []).length} equipos`
            : (data.transporte?.mensaje || 'Sin equipos')}
        />
      </div>
      {(data.maquinaria?.filas || []).length > 0 && (
        <SimpleTable
          t={t}
          columns={[
            { key: 'equipo', label: 'Equipo' },
            { key: 'cantidad', label: 'Cant.', align: 'right' },
          ]}
          rows={data.maquinaria.filas}
        />
      )}
    </div>
  )
}

function ProgramacionBlock({ t, data }) {
  if (!data || data.disponible === false) {
    return <EmptyMsg t={t} text={data?.mensaje || 'Sin programación de obra cargada.'} />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 'var(--cc-sm)', color: t.text, fontWeight: 600 }}>
        Avance {data.ejecutado_pct != null ? `${Math.round(Number(data.ejecutado_pct))}%` : '—'}
        {data.alertas?.length ? (
          <span style={{ marginLeft: 8, color: 'var(--cc-color-danger,#b91c1c)', fontWeight: 500, fontSize: 12 }}>
            · {data.alertas.length} alerta(s)
          </span>
        ) : null}
      </div>
      <MiniChart t={t} series={data.series || []} title="% ejecutado por capítulo" />
      <SimpleTable
        t={t}
        columns={[
          { key: 'capitulo', label: 'Capítulo' },
          { key: 'ejecutado_pct', label: '%', align: 'right' },
        ]}
        rows={(data.filas || []).map((r) => ({
          ...r,
          ejecutado_pct: r.ejecutado_pct != null ? `${Math.round(Number(r.ejecutado_pct))}%` : '—',
        }))}
      />
      {(data.alertas || []).length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: t.textMuted }}>
          {data.alertas.slice(0, 8).map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}
    </div>
  )
}

function TablaSeries({ t, data, columns, emptyHint }) {
  if (!data || data.disponible === false) {
    return <EmptyMsg t={t} text={data?.mensaje || emptyHint} />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <MiniChart t={t} series={data.series || []} />
      <SimpleTable t={t} columns={columns} rows={data.filas || []} />
    </div>
  )
}

function MiniChart({ t, series = [], title }) {
  const data = (Array.isArray(series) ? series : [])
    .filter((s) => s && Number(s.valor) > 0)
    .slice(0, 10)
  if (!data.length) return null
  return (
    <div style={{
      border: `1px solid ${t.border}`,
      borderRadius: 8,
      padding: '8px 10px 4px',
      background: t.bg || `${t.primary}06`,
    }}
    >
      {title && (
        <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>{title}</div>
      )}
      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
            <XAxis dataKey="nombre" tick={{ fontSize: 10, fill: t.textMuted }} interval={0} angle={-20} textAnchor="end" height={48} />
            <YAxis tick={{ fontSize: 10, fill: t.textMuted }} width={36} />
            <Tooltip />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SimpleTable({ t, columns, rows }) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) {
    return <EmptyMsg t={t} text="Sin filas." />
  }
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: `${t.primary}14` }}>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align || 'left',
                  padding: '6px 8px',
                  borderBottom: `1px solid ${t.border}`,
                  color: t.text,
                  fontWeight: 700,
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 80).map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    textAlign: c.align || 'left',
                    padding: '5px 8px',
                    borderBottom: `1px solid ${t.border}`,
                    color: t.text,
                    verticalAlign: 'top',
                  }}
                >
                  {r?.[c.key] != null && r[c.key] !== '' ? String(r[c.key]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SectionCard({ t, title, children, onObs, hasObs }) {
  return (
    <section style={{
      border: `1px solid ${t.border}`,
      borderRadius: 10,
      padding: 12,
      background: t.bgCard || t.bg,
    }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', color: t.text }}>{title}</div>
        {onObs && (
          <button
            type="button"
            title="Observaciones de la sección"
            aria-label="Observaciones de la sección"
            onClick={onObs}
            style={{
              ...iconBtn(t),
              color: hasObs ? t.primary : t.text,
              borderColor: hasObs ? t.primary : t.border,
            }}
          >
            <MessageSquareText size={16} />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function ObsPreview({ t, html }) {
  if (isRichTextEmpty(html)) return null
  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px dashed ${t.border}`,
        fontSize: 12,
        color: t.text,
        background: `${t.primary}08`,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function EmptyMsg({ t, text }) {
  return (
    <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, padding: '6px 0' }}>
      {text || 'Sin datos.'}
    </div>
  )
}

function InfoChip({ t, title, body }) {
  return (
    <div style={{
      border: `1px solid ${t.border}`,
      borderRadius: 8,
      padding: '8px 10px',
      background: t.bg || 'transparent',
    }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: t.text, lineHeight: 1.35 }}>{body}</div>
    </div>
  )
}

function lbl(t) {
  return { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: t.textMuted }
}
function inp(t) {
  return {
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    padding: '6px 8px',
    background: t.bg || t.bgCard,
    color: t.text,
    fontSize: 12,
  }
}
function iconBtn(t) {
  return {
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: t.bgCard || 'transparent',
    color: t.text,
    cursor: 'pointer',
    padding: 0,
  }
}
function primary(t) {
  return {
    border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)',
  }
}
function ghost(t) {
  return {
    border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 14px',
    cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)',
  }
}
