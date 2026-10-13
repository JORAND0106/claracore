import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MessageSquareText, RefreshCw } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { AlmacenProviders } from '../../almacen/almacenShared'
import SolicitudDetalleModal from '../../almacen/SolicitudDetalleModal'
import { accesoAlmacen } from '../../almacen/almacenPermisos'
import { formatCOP } from '../../utils/formatCOP'
import TemaRichEditor from './TemaRichEditor'
import { isRichTextEmpty } from './richTextUtils'
import {
  GESTION_OBRA_SECCIONES,
  emptyObservacionesGestionObra,
  rangoSemanaAnterior,
} from './gestionObraRango.js'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'

const CHART_COLORS = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#15803d', '#a16207']
const AUSENCIA_BG = 'rgba(245, 158, 11, 0.28)'

/** Debe coincidir con SCHEMA_VERSION del backend (gestion_obra_service). */
const GESTION_OBRA_SCHEMA_VERSION = 4

function snapshotObsoleto(snap) {
  if (!snap || typeof snap !== 'object') return true
  if (!snap.datos || typeof snap.datos !== 'object') return true
  const v = Number(snap.schema_version || 0)
  return !Number.isFinite(v) || v < GESTION_OBRA_SCHEMA_VERSION
}

/**
 * TAB Gestión de obra: consolidado por día (gráfico + tabla ejecutiva).
 */
export default function ActaGestionObraPanel({
  t,
  api,
  usuario = null,
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
  const [solicitudDetalleId, setSolicitudDetalleId] = useState(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)

  const snap = value && typeof value === 'object' ? value : null
  const datos = snap?.datos && typeof snap.datos === 'object' ? snap.datos : {}
  const observaciones = useMemo(
    () => ({ ...emptyObservacionesGestionObra(), ...(snap?.observaciones || {}) }),
    [snap],
  )
  const stale = snapshotObsoleto(snap)
  const contratoId = api?.contratoId
  const token = api?.token
  const accesoAlm = useMemo(
    () => (usuario ? accesoAlmacen(usuario, contratoId) : null),
    [usuario, contratoId],
  )
  const puedeAbrirSolicitud = Boolean(accesoAlm?.verSolicitudesInventario)
  const permisosAlm = accesoAlm?.permisos || null

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
      const next = row?.gestion_obra || null
      if (!next || typeof next !== 'object') {
        setError('El servidor no devolvió el consolidado. Verifique la migración de gestion_obra.')
        return
      }
      onChange?.(next)
    } catch (e) {
      setError(e?.message || 'No se pudo calcular el consolidado')
    } finally {
      setBusy(false)
    }
  }, [api, actaId, onChange])

  useEffect(() => {
    if (!actaId || soloLectura) return
    if (!stale) return
    const r = (snap?.fecha_desde && snap?.fecha_hasta)
      ? { fecha_desde: String(snap.fecha_desde).slice(0, 10), fecha_hasta: String(snap.fecha_hasta).slice(0, 10) }
      : rangoSemanaAnterior(fechaReunion)
    recalcular(r.fecha_desde, r.fecha_hasta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actaId, soloLectura, stale])

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
      informe: snap?.informe || null,
      informe_sin_valores: snap?.informe_sin_valores || null,
      observaciones: { ...observaciones, [obsSeccion]: obsDraft },
      snapshot_at: snap?.snapshot_at || null,
    }
    onChange?.(next)
    setObsSeccion(null)
  }

  const labelObs = GESTION_OBRA_SECCIONES.find((s) => s.id === obsSeccion)?.label || 'Observaciones'
  const verValoresCant = !!(datos.cantidades_obra?.ver_valores ?? snap?.ver_valores_cantidades)
  const verValoresAlm = !!(datos.almacen?.ver_valores ?? snap?.ver_valores_almacen)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 'var(--cc-h2)', color: t.text }}>Gestión de obra</div>
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 2, maxWidth: 560, lineHeight: 1.4 }}>
            Consolidado por día de la semana anterior a la reunión. Puede cambiar el rango; al guardar queda fijado con el acta.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <label style={lbl(t)}>
            Desde
            <input type="date" disabled={soloLectura || busy} value={desde} onChange={(e) => setDesde(e.target.value)} style={inp(t)} />
          </label>
          <label style={lbl(t)}>
            Hasta
            <input type="date" disabled={soloLectura || busy} value={hasta} onChange={(e) => setHasta(e.target.value)} style={inp(t)} />
          </label>
          {!soloLectura && (
            <button type="button" title="Recalcular consolidado" aria-label="Recalcular consolidado" disabled={busy || !actaId} onClick={aplicarRango} style={iconBtn(t)}>
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)' }}>{error}</div>}
      {busy && <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Calculando consolidado…</div>}
      {!busy && stale && !soloLectura && !error && (
        <div style={{ fontSize: 11, color: t.textMuted }}>
          El consolidado guardado es anterior a la lógica vigente; se está renovando…
        </div>
      )}
      {snap?.snapshot_at && (
        <div style={{ fontSize: 11, color: t.textMuted }}>
          Datos al {String(snap.snapshot_at).slice(0, 19).replace('T', ' ')} UTC
          {desde && hasta ? ` · Rango ${desde} → ${hasta}` : ''}
        </div>
      )}

      <InformeDesplegablePanel
        t={t}
        informe={snap?.informe}
        abierto={detalleAbierto}
        onToggle={() => setDetalleAbierto((v) => !v)}
      >
        <SectionCard t={t} title="1. Personal y jornada" onObs={!soloLectura ? () => abrirObs('personal_jornada') : null} hasObs={!isRichTextEmpty(observaciones.personal_jornada)}>
          <PersonalJornadaBlock t={t} data={datos.personal_jornada} viewportCompact={viewportCompact} />
          <ObsPreview t={t} html={observaciones.personal_jornada} />
        </SectionCard>

        <SectionCard t={t} title="2. Cantidades de obra" onObs={!soloLectura ? () => abrirObs('cantidades_obra') : null} hasObs={!isRichTextEmpty(observaciones.cantidades_obra)}>
          <CantidadesBlock t={t} data={datos.cantidades_obra} verValores={verValoresCant} />
          <ObsPreview t={t} html={observaciones.cantidades_obra} />
        </SectionCard>

        <SectionCard t={t} title="3. Actividades adicionales" onObs={!soloLectura ? () => abrirObs('actividades') : null} hasObs={!isRichTextEmpty(observaciones.actividades)}>
          <ActividadesBlock t={t} data={datos.actividades} />
          <ObsPreview t={t} html={observaciones.actividades} />
        </SectionCard>

        <SectionCard t={t} title="4. Almacén" onObs={!soloLectura ? () => abrirObs('almacen') : null} hasObs={!isRichTextEmpty(observaciones.almacen)}>
          <AlmacenBlock
            t={t}
            data={datos.almacen}
            verValores={verValoresAlm}
            puedeAbrir={puedeAbrirSolicitud}
            onAbrirSolicitud={(id) => setSolicitudDetalleId(id)}
          />
          <ObsPreview t={t} html={observaciones.almacen} />
        </SectionCard>

        <SectionCard t={t} title="5. Programación de obra" onObs={!soloLectura ? () => abrirObs('programacion') : null} hasObs={!isRichTextEmpty(observaciones.programacion)}>
          <ProgramacionBlock t={t} data={datos.programacion} />
          <ObsPreview t={t} html={observaciones.programacion} />
        </SectionCard>
      </InformeDesplegablePanel>

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
            <TemaRichEditor t={t} value={obsDraft} onChange={setObsDraft} placeholder="Escriba las observaciones de esta sección…" minHeight={180} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" style={ghost(t)} onClick={() => setObsSeccion(null)}>Cancelar</button>
              <button type="button" style={primary(t)} onClick={guardarObs}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {solicitudDetalleId && contratoId != null && token && permisosAlm && (
        <AlmacenProviders t={t} compact={viewportCompact} contratoId={contratoId} token={token}>
          <SolicitudDetalleModal
            solicitudId={solicitudDetalleId}
            permisos={permisosAlm}
            token={token}
            t={t}
            contratoId={contratoId}
            onClose={() => setSolicitudDetalleId(null)}
            onUpdated={() => setSolicitudDetalleId(null)}
          />
        </AlmacenProviders>
      )}
    </div>
  )
}

function InformeDesplegablePanel({ t, informe, abierto, onToggle, children }) {
  const parrafos = Array.isArray(informe?.parrafos) ? informe.parrafos : []
  const titulo = informe?.titulo || 'Informe de gestión de obra'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          background: t.bgCard || t.bg,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={abierto}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            textAlign: 'left',
            border: 'none',
            background: `${t.primary}0d`,
            color: t.text,
            cursor: 'pointer',
            padding: '12px 14px',
            minHeight: 48,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{ marginTop: 2, flexShrink: 0, color: t.primary }}>
            {abierto ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', marginBottom: 6 }}>{titulo}</div>
            {parrafos.length === 0 ? (
              <div style={{ fontSize: 12, color: t.textMuted }}>
                El informe se genera al calcular el consolidado del período.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {parrafos.map((p) => (
                  <div key={p.id || p.titulo} style={{ fontSize: 12, lineHeight: 1.45, color: t.text }}>
                    <div style={{ fontWeight: 700, color: t.textMuted, marginBottom: 2, fontSize: 11 }}>
                      {p.titulo}
                    </div>
                    <div>{p.texto}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: t.primary, marginTop: 10, fontWeight: 600 }}>
              {abierto ? 'Ocultar detalle (gráficos y tablas)' : 'Ver detalle (gráficos y tablas)'}
            </div>
          </span>
        </button>
      </div>
      {abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function PersonalJornadaBlock({ t, data, viewportCompact }) {
  if (!data || data.disponible === false) {
    return <EmptyMsg t={t} text={data?.mensaje || 'Sin datos de personal en el rango.'} />
  }
  const personal = data.personal || {}
  const series = personal.series || data.series || []
  const empresas = personal.empresas || []
  const dias = data.dias || []
  const maq = data.maquinaria || {}
  const aus = data.ausentismo || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <MiniChart t={t} series={series} title="Personal por empresa (máximo de personas en un día)" />
      {empresas.map((emp) => (
        <div key={emp.empresa} style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', background: `${t.primary}12`, fontWeight: 700, fontSize: 12, color: t.text }}>
            {emp.empresa}
            <span style={{ fontWeight: 500, color: t.textMuted, marginLeft: 8 }}>
              Máx. diario {emp.max_diario ?? emp.total ?? '—'}
            </span>
          </div>
          <DayMatrixTable
            t={t}
            dias={dias}
            rows={(emp.filas || []).map((f) => ({
              label: f.cargo,
              por_dia: f.por_dia,
              max_diario: f.max_diario ?? f.total,
              ausencias_por_dia: f.ausencias_por_dia,
              es_total_dia: !!f.es_total_dia,
            }))}
            labelCol="Cargo"
            lastColLabel="Máx. diario"
            compact={viewportCompact}
            shadeAusencias
          />
        </div>
      ))}
      {data.convencion_ausentismo && (
        <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.4 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: AUSENCIA_BG, border: `1px solid ${t.border}`, marginRight: 6, verticalAlign: 'middle' }} />
          {data.convencion_ausentismo}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
        <InfoChip
          t={t}
          title="Ausentismo"
          body={aus.disponible
            ? `${aus.ausentes || 0} ausencia(s) en el rango`
            : (aus.mensaje || 'No registrado')}
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
          body={(maq.filas || []).length
            ? `${(maq.filas || []).length} equipos`
            : (data.transporte?.mensaje || 'Sin equipos')}
        />
      </div>
      {(maq.series || []).length > 0 && (
        <>
          <MiniChart t={t} series={maq.series || []} title="Maquinaria por equipo (máximo en un día)" />
          <DayMatrixTable
            t={t}
            dias={dias}
            rows={(maq.filas || []).map((f) => ({
              label: f.equipo,
              por_dia: f.por_dia || {},
              max_diario: f.max_diario != null ? f.max_diario : f.total,
            }))}
            labelCol="Equipo"
            lastColLabel="Máx. diario"
            compact={viewportCompact}
          />
        </>
      )}
    </div>
  )
}

function CantidadesBlock({ t, data, verValores }) {
  if (!data || data.disponible === false) {
    return <EmptyMsg t={t} text={data?.mensaje || 'Sin cantidades SICOE en el rango.'} />
  }
  const tramos = data.tramos || []
  const border = '#94a3b8'
  const th = {
    border: `1px solid ${border}`,
    background: '#e2e8f0',
    padding: '5px 7px',
    fontWeight: 700,
    fontSize: 11,
    textAlign: 'left',
    color: t.text,
  }
  const td = {
    border: `1px solid ${border}`,
    padding: '4px 7px',
    fontSize: 12,
    color: t.text,
    verticalAlign: 'top',
  }
  const cols = verValores
    ? ['Ítem', 'Descripción', 'Und', 'Cantidad', 'Vlr. unitario', 'Valor total']
    : ['Ítem', 'Descripción', 'Und', 'Cantidad']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tramos.map((tr) => (
        <div key={tr.tramo}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: t.text }}>
            Tramo: {tr.tramo}
          </div>
          {(tr.capitulos || []).map((cap) => (
            <div key={cap.capitulo} style={{ marginBottom: 10, overflowX: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>
                Capítulo {cap.capitulo}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: verValores ? 560 : 360 }}>
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c} style={{ ...th, textAlign: ['Cantidad', 'Vlr. unitario', 'Valor total'].includes(c) ? 'right' : 'left' }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(cap.items || []).map((it, i) => (
                    <tr key={i}>
                      <td style={td}>{it.item_numero || '—'}</td>
                      <td style={td}>{it.item_descripcion || '—'}</td>
                      <td style={td}>{it.unidad || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{it.cantidad != null ? String(it.cantidad) : '—'}</td>
                      {verValores && (
                        <>
                          <td style={{ ...td, textAlign: 'right' }}>{formatCOP(it.vlr_unitario)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{formatCOP(it.valor_total)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {verValores && (
                    <tr>
                      <td colSpan={5} style={{ ...td, fontWeight: 700, textAlign: 'right', background: '#f1f5f9' }}>
                        Subtotal capítulo
                      </td>
                      <td style={{ ...td, fontWeight: 700, textAlign: 'right', background: '#f1f5f9' }}>
                        {formatCOP(cap.subtotal_valor)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
      {verValores && data.total_general_valor != null && (
        <div style={{ fontWeight: 700, fontSize: 13, color: t.text, textAlign: 'right' }}>
          Total general del avance: {formatCOP(data.total_general_valor)}
        </div>
      )}
      {Number(data.registros_sin_item) > 0 && (
        <div style={{ fontSize: 11, color: t.textMuted }}>
          {data.registros_sin_item} registro(s) del rango sin ítem asignado; no se valoran.
        </div>
      )}
      {!tramos.length && (
        <EmptyMsg t={t} text="Sin filas de cantidades." />
      )}
    </div>
  )
}

function ActividadesBlock({ t, data }) {
  if (!data || data.disponible === false) {
    return <EmptyMsg t={t} text={data?.mensaje || 'Sin actividades adicionales en Bitácora.'} />
  }
  let porDia = Array.isArray(data.por_dia) ? data.por_dia : []
  if (!porDia.length && Array.isArray(data.filas) && data.filas.length) {
    const byFecha = {}
    for (const f of data.filas) {
      const fecha = String(f.fecha || '').slice(0, 10)
      if (!fecha) continue
      if (!byFecha[fecha]) byFecha[fecha] = { fecha, cantidad: 0, actividades: [] }
      byFecha[fecha].actividades.push({
        actividad: f.actividad || '',
        detalle: f.detalle || '',
        tramo: f.tramo || '',
      })
      byFecha[fecha].cantidad += 1
    }
    porDia = Object.values(byFecha).sort((a, b) => a.fecha.localeCompare(b.fecha))
  }
  const series = (Array.isArray(data.series) && data.series.length)
    ? data.series
    : porDia.map((d) => ({ nombre: String(d.fecha).slice(5), valor: d.cantidad || 0 }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <MiniChart t={t} series={series} title="Actividades por día" />
      {porDia.map((d) => (
        <div key={d.fecha} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: t.text }}>
            {d.fecha}
            <span style={{ fontWeight: 500, color: t.textMuted, marginLeft: 8 }}>{d.cantidad} actividad(es)</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: t.text }}>
            {(d.actividades || []).map((a, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <strong>{a.actividad}</strong>
                {a.tramo ? ` · ${a.tramo}` : ''}
                {a.detalle ? <div style={{ color: t.textMuted, fontWeight: 400 }}>{a.detalle}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function AlmacenBlock({ t, data, verValores, puedeAbrir, onAbrirSolicitud }) {
  if (!data || data.disponible === false) {
    return <EmptyMsg t={t} text={data?.mensaje || 'Sin movimientos de almacén en el rango.'} />
  }
  let seriesDia = (data.series_por_dia || []).map((r) => ({
    nombre: String(r.fecha || '').slice(5),
    creadas: r.creadas || 0,
    gestionadas: r.gestionadas || 0,
    aprobadas: r.aprobadas || 0,
    pendientes: r.pendientes || 0,
  }))
  if (!seriesDia.length && Array.isArray(data.solicitudes) && data.solicitudes.length) {
    const by = {}
    for (const s of data.solicitudes) {
      const f = String(s.fecha || '').slice(0, 10)
      if (!f) continue
      if (!by[f]) by[f] = { nombre: f.slice(5), creadas: 0, gestionadas: 0, aprobadas: 0, pendientes: 0 }
      by[f].creadas += 1
      const est = String(s.estado || '').toLowerCase()
      if (est === 'enviada') by[f].gestionadas += 1
      if (est === 'aprobada') by[f].aprobadas += 1
      if (est === 'borrador' || est === 'enviada') by[f].pendientes += 1
    }
    seriesDia = Object.keys(by).sort().map((k) => by[k])
  }
  const cols = [
    { key: 'fecha', label: 'Fecha' },
    { key: 'solicitante', label: 'Solicitante' },
    { key: 'insumos_resumen', label: 'Insumos solicitados' },
    ...(verValores ? [{ key: 'valor_fmt', label: 'Valor', align: 'right' }] : []),
    { key: 'estado', label: 'Estado' },
  ]
  const rows = (data.solicitudes || []).map((s) => ({
    ...s,
    valor_fmt: s.valor != null ? formatCOP(s.valor) : '—',
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {seriesDia.length > 0 && (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 10px 4px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>
            Solicitudes por día (creadas / gestionadas / aprobadas / pendientes)
          </div>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={seriesDia} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                <XAxis dataKey="nombre" tick={{ fontSize: 10, fill: t.textMuted }} />
                <YAxis tick={{ fontSize: 10, fill: t.textMuted }} width={28} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="creadas" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="gestionadas" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="aprobadas" fill={CHART_COLORS[2]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="pendientes" fill={CHART_COLORS[4]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {data.estado_equiparacion && (
        <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.4 }}>
          Equiparación de estados: gestionadas = enviada; pendientes = borrador o enviada; aprobadas = aprobada.
        </div>
      )}
      <ClickableTable
        t={t}
        columns={cols}
        rows={rows}
        puedeAbrir={puedeAbrir}
        onRowClick={(r) => {
          if (r?.id != null) onAbrirSolicitud?.(r.id)
        }}
      />
      {(data.entradas || []).length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 12 }}>Entradas</div>
          <SimpleTable
            t={t}
            columns={[
              { key: 'fecha', label: 'Fecha' },
              { key: 'estado', label: 'Estado' },
              { key: 'ref', label: 'Ref.' },
            ]}
            rows={data.entradas}
          />
        </>
      )}
      {(data.salidas || []).length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 12 }}>Salidas</div>
          <SimpleTable
            t={t}
            columns={[
              { key: 'fecha', label: 'Fecha' },
              { key: 'estado', label: 'Estado' },
              { key: 'ref', label: 'Ref.' },
            ]}
            rows={data.salidas}
          />
        </>
      )}
    </div>
  )
}

function ProgramacionBlock({ t, data }) {
  if (!data || data.disponible === false) {
    return <EmptyMsg t={t} text={data?.mensaje || 'Sin programación de obra cargada.'} />
  }
  const versiones = data.versiones || []
  const alertas = data.alertas || []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 'var(--cc-sm)', color: t.text, fontWeight: 600 }}>
        Programación cargada
        {versiones.length ? ` · ${versiones.length} versión(es)` : ''}
      </div>
      {versiones.length > 0 && (
        <SimpleTable
          t={t}
          columns={[
            { key: 'numero', label: 'Nº' },
            { key: 'tipo', label: 'Tipo' },
            { key: 'estado', label: 'Estado' },
          ]}
          rows={versiones}
        />
      )}
      {alertas.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--cc-color-danger,#b91c1c)' }}>
          {alertas.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      ) : (
        <div style={{ fontSize: 12, color: t.textMuted }}>Sin alertas de desviación reportadas por el módulo.</div>
      )}
    </div>
  )
}

function DayMatrixTable({
  t,
  dias = [],
  rows = [],
  labelCol = 'Concepto',
  lastColLabel = 'Máx. diario',
  compact = false,
  shadeAusencias = false,
}) {
  if (!rows.length) return <EmptyMsg t={t} text="Sin filas." />
  const dayLabels = dias.map((d) => String(d).slice(5))
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? 11 : 12, minWidth: 320 }}>
        <thead>
          <tr style={{ background: `${t.primary}10` }}>
            <th style={th(t, 'left')}>{labelCol}</th>
            {dayLabels.map((d) => (
              <th key={d} style={th(t, 'right')}>{d}</th>
            ))}
            <th style={th(t, 'right')}>{lastColLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={r.es_total_dia ? { background: `${t.primary}08`, fontWeight: 700 } : undefined}>
              <td style={td(t, 'left')}>{r.label}</td>
              {dias.map((d) => {
                const v = r.por_dia?.[d]
                const aus = shadeAusencias ? Number(r.ausencias_por_dia?.[d] || 0) : 0
                const shaded = aus > 0
                return (
                  <td
                    key={d}
                    title={shaded ? `${aus} ausencia(s)` : undefined}
                    style={{
                      ...td(t, 'right'),
                      ...(shaded ? { background: AUSENCIA_BG, cursor: 'help' } : null),
                    }}
                  >
                    {v != null && v !== '' && Number(v) !== 0 ? String(v) : '—'}
                  </td>
                )
              })}
              <td style={{ ...td(t, 'right'), fontWeight: 700 }}>
                {r.max_diario != null && r.max_diario !== '' ? String(r.max_diario) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MiniChart({ t, series = [], title }) {
  const data = (Array.isArray(series) ? series : [])
    .filter((s) => s && Number(s.valor) > 0)
    .slice(0, 12)
  if (!data.length) return null
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 10px 4px', background: t.bg || `${t.primary}06` }}>
      {title && <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>{title}</div>}
      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
            <XAxis dataKey="nombre" tick={{ fontSize: 10, fill: t.textMuted }} interval={0} angle={-20} textAnchor="end" height={48} />
            <YAxis tick={{ fontSize: 10, fill: t.textMuted }} width={36} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SimpleTable({ t, columns, rows }) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return <EmptyMsg t={t} text="Sin filas." />
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: `${t.primary}14` }}>
            {columns.map((c) => (
              <th key={c.key} style={th(t, c.align || 'left')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 80).map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} style={td(t, c.align || 'left')}>
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

function ClickableTable({ t, columns, rows, puedeAbrir, onRowClick }) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return <EmptyMsg t={t} text="Sin filas." />
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: `${t.primary}14` }}>
            {columns.map((c) => (
              <th key={c.key} style={th(t, c.align || 'left')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 80).map((r, i) => {
            const clickable = puedeAbrir && r?.id != null
            return (
              <tr
                key={i}
                onClick={clickable ? () => onRowClick?.(r) : undefined}
                style={clickable ? { cursor: 'pointer' } : undefined}
                title={clickable ? 'Abrir solicitud' : undefined}
                onMouseEnter={clickable ? (e) => { e.currentTarget.style.background = `${t.primary}10` } : undefined}
                onMouseLeave={clickable ? (e) => { e.currentTarget.style.background = '' } : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} style={td(t, c.align || 'left')}>
                    {r?.[c.key] != null && r[c.key] !== '' ? String(r[c.key]) : '—'}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SectionCard({ t, title, children, onObs, hasObs }) {
  return (
    <section style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, background: t.bgCard || t.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', color: t.text }}>{title}</div>
        {onObs && (
          <button
            type="button"
            title="Observaciones de la sección"
            aria-label="Observaciones de la sección"
            onClick={onObs}
            style={{ ...iconBtn(t), color: hasObs ? t.primary : t.text, borderColor: hasObs ? t.primary : t.border }}
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
      style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, border: `1px dashed ${t.border}`, fontSize: 12, color: t.text, background: `${t.primary}08` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function EmptyMsg({ t, text }) {
  return <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, padding: '6px 0' }}>{text || 'Sin datos.'}</div>
}

function InfoChip({ t, title, body }) {
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 10px', background: t.bg || 'transparent' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: t.text, lineHeight: 1.35 }}>{body}</div>
    </div>
  )
}

function th(t, align) {
  return { textAlign: align, padding: '6px 8px', borderBottom: `1px solid ${t.border}`, color: t.text, fontWeight: 700, whiteSpace: 'nowrap' }
}
function td(t, align) {
  return { textAlign: align, padding: '5px 8px', borderBottom: `1px solid ${t.border}`, color: t.text, verticalAlign: 'top' }
}
function lbl(t) {
  return { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: t.textMuted }
}
function inp(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 6, padding: '6px 8px', background: t.bg || t.bgCard, color: t.text, fontSize: 12 }
}
function iconBtn(t) {
  return {
    border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: t.bgCard || 'transparent', color: t.text, cursor: 'pointer', padding: 0,
  }
}
function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
