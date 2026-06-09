/**
 * Modal de programación de obra (~90% × 85%): tabs PK, tabla con capítulos colapsables, Gantt Excel.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { flushSync } from 'react-dom'
import { RefreshCw, RotateCcw, Save } from 'lucide-react'
import CcConfirmModal from './components/CcConfirmModal'
import ProgObraDependencias, { normalizeDep } from './ProgObraDependencias'
import ProgObraComparacionTable from './ProgObraComparacionTable'
import {
  COMPARE_COLORS,
  compareKeyForGanttRow,
  fetchComparar,
  indexCompareNodos,
} from './progObraCompare'
import { clasificarNodoCpm, collectDesfaseHorizonte, cpmTooltipClasificacion, normalizeCpmRow, pickBestCpmNode, pickBestCpmNodeTramo } from './progObraCpmClasificacion'
import ProgSinAgrupadorCapIcon from './ProgSinAgrupadorCapIcon'
import {
  addCalendarDays,
  eachCalendarDay,
  fmtCOP,
  fmtCant,
  fmtDateHuman,
  fmtDateIso,
  isoFromDate,
  isWeekendDate,
  parseIsoDate,
  countDiasHabilesEnRango,
} from './progObraFormat'
import { clearTramoProgramacion, fetchEstructuraTramo } from './progObraApi'

const PROG_Z = 200000

function ProgModalIconBtn({ title, onClick, disabled, children, color, borderColor }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        padding: 0,
        borderRadius: 8,
        border: `1px solid ${borderColor || 'transparent'}`,
        background: 'transparent',
        color: color || 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
const GANTT_DAY_PX = 18
const GANTT_ROW_ITEM = 32
const GANTT_ROW_CAP = 40
const GANTT_BAR_H = 20
const GANTT_NON_HABIL_BG = 'rgba(229, 231, 235, 0.6)'
const GANTT_TEAL = '#1D9E75'
const GANTT_TEAL_DARK = '#157a5c'
const GANTT_CAP_BAR = 'rgba(59, 130, 246, 0.3)'
const GANTT_RANGE_PAD_DAYS = 3
const STICKY_W = { item: 88, desc: 280 }
const SCROLL_COL_W = { und: 48, cant: 88, costo: 120, fechaIni: 148, dias: 72, fechaFin: 120, save: 28 }

function stickyItemCell(bg, zIndex = 2) {
  return {
    position: 'sticky',
    left: 0,
    width: STICKY_W.item,
    minWidth: STICKY_W.item,
    maxWidth: STICKY_W.item,
    zIndex,
    background: bg,
    overflow: 'hidden',
    boxSizing: 'border-box',
  }
}

function stickyDescCell(bg, zIndex = 3) {
  return {
    position: 'sticky',
    left: STICKY_W.item,
    width: STICKY_W.desc,
    minWidth: STICKY_W.desc,
    maxWidth: STICKY_W.desc,
    zIndex,
    background: bg,
    overflow: 'hidden',
    boxSizing: 'border-box',
    boxShadow: '4px 0 6px -2px rgba(0,0,0,0.1)',
  }
}

function stickyHeadTh(left, width, zIndex, bg) {
  return {
    position: 'sticky',
    top: 0,
    left,
    width,
    minWidth: width,
    maxWidth: width,
    zIndex,
    background: bg,
    boxSizing: 'border-box',
    ...(left === STICKY_W.item ? { boxShadow: '4px 0 6px -2px rgba(0,0,0,0.1)' } : {}),
  }
}

function ellipsisTextStyle() {
  return { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }
}
const ROW_H = { cap: 44, agrupador: 44, hijo: 32, item: 44 }
const PANEL_SPLIT_DEFAULT = 45
const PANEL_SPLIT_MIN = 28
const PANEL_SPLIT_MAX = 72
const PANEL_SPLIT_STORAGE_KEY = 'progObraModalPanelSplitPct'
function readStoredPanelSplit() {
  try {
    const v = parseFloat(sessionStorage.getItem(PANEL_SPLIT_STORAGE_KEY))
    if (Number.isFinite(v) && v >= PANEL_SPLIT_MIN && v <= PANEL_SPLIT_MAX) return v
  } catch {
    /* ignore */
  }
  return PANEL_SPLIT_DEFAULT
}

function clampPanelSplit(pct) {
  return Math.min(PANEL_SPLIT_MAX, Math.max(PANEL_SPLIT_MIN, pct))
}

const GANTT_TIMELINE_H = 54
const TABLE_HEAD_H = GANTT_TIMELINE_H

function defaultTimelineDays() {
  const from = addCalendarDays(new Date(), -GANTT_RANGE_PAD_DAYS)
  const to = addCalendarDays(new Date(), 120)
  return eachCalendarDay(from, to)
}

/** Fechas efectivas de una fila (borrador en memoria > actMap > fin local). */
function resolveRowSchedule({
  cap,
  itemKey,
  rk,
  actMap,
  actividadKey,
  rowDraftRef,
  finOverrides,
  calcFinLocal,
}) {
  const draft = rowDraftRef.current?.[rk]?.getValues?.()
  const act = actMap[actividadKey(cap, itemKey, 1)]
  const fi = fmtDateIso(draft != null ? (draft.fecha_inicio || '') : act?.fecha_inicio)
  const durRaw = draft != null
    ? (draft.duracion != null && draft.duracion !== '' ? draft.duracion : null)
    : act?.duracion_dias_habiles
  const dur = durRaw != null ? parseInt(String(durRaw), 10) : NaN
  if (!fi) {
    return { fi: null, ff: null, dur: dur > 0 ? dur : 0 }
  }
  if (!(dur > 0)) {
    const ffStored = fmtDateIso(draft?.fecha_fin ?? finOverrides?.[rk] ?? act?.fecha_fin_calculada)
    return { fi, ff: ffStored || null, dur: 0 }
  }
  const ff = fmtDateIso(draft?.fecha_fin ?? finOverrides?.[rk] ?? act?.fecha_fin_calculada) || calcFinLocal?.(fi, dur)
  return { fi, ff: ff || null, dur }
}

/** Consolidado del capítulo: min inicio, max fin, días hábiles reales entre ambas. */
function computeCapConsolidado({
  cap,
  estructuraCap,
  items,
  agrupadorActItem,
  agrupadorRowKey,
  itemRowKey,
  actMap,
  actividadKey,
  rowDraftRef,
  finOverrides,
  calcFinLocal,
  noHabilesSet,
}) {
  const agrupadores = estructuraCap?.agrupadores || []
  const iter = agrupadores.length
    ? agrupadores.map((ag) => ({
      itemKey: agrupadorActItem(ag),
      rk: agrupadorRowKey(cap, ag),
    }))
    : items.map((it) => ({ itemKey: it.item, rk: itemRowKey(cap, it.item) }))
  let minFi = null
  let maxFf = null
  let cantTotal = 0
  let costoTotal = 0
  for (const { itemKey, rk } of iter) {
    const { fi, ff } = resolveRowSchedule({
      cap, itemKey, rk, actMap, actividadKey, rowDraftRef, finOverrides, calcFinLocal,
    })
    if (fi && (!minFi || fi < minFi)) minFi = fi
    if (ff && (!maxFf || ff > maxFf)) maxFf = ff
  }
  if (agrupadores.length) {
    for (const ag of agrupadores) {
      cantTotal += Number(ag.cant_total) || 0
      costoTotal += Number(ag.costo_directo) || 0
    }
  } else {
    for (const it of items) {
      cantTotal += Number(it.cant_total) || 0
      costoTotal += Number(it.costo_directo) || 0
    }
  }
  const diasHab = minFi && maxFf ? countDiasHabilesEnRango(minFi, maxFf, noHabilesSet) : null
  return {
    fecha_inicio: minFi,
    fecha_fin: maxFf,
    dias_habiles: diasHab,
    cant_total: cantTotal,
    costo_directo: costoTotal,
  }
}

function cpmNodeKey(pk, cap, agrupadorId) {
  const ag = agrupadorId != null && agrupadorId !== '' ? String(agrupadorId) : ''
  return `${String(pk || '').trim()}\u0000${String(cap || '').trim()}\u0000${ag}`
}

function cpmLookupKeys(pk, cap, agrupadorId) {
  const keys = [cpmNodeKey(pk, cap, agrupadorId)]
  const capStr = String(cap || '').trim()
  const m = /^0*(\d+)$/.exec(capStr)
  if (m && m[1] !== capStr) keys.push(cpmNodeKey(pk, m[1], agrupadorId))
  return keys
}

function resolveCpmNode({
  tramoConsolidado,
  tramoCpmByAgId,
  tramoCpmByCapAg,
  tramoPkIds,
  cpmByNodeKey,
  pkId,
  cap,
  agrupadorId,
}) {
  const ag = agrupadorId != null && agrupadorId !== '' ? String(agrupadorId) : ''
  const capStr = String(cap || '').trim()
  if (tramoConsolidado && ag) {
    if (tramoCpmByAgId?.[ag]) return tramoCpmByAgId[ag]
    const capAgKey = `${capStr}\u0000${ag}`
    if (tramoCpmByCapAg?.[capAgKey]) return tramoCpmByCapAg[capAgKey]
    if (tramoPkIds?.length && cpmByNodeKey) {
      for (const pk of tramoPkIds) {
        for (const k of cpmLookupKeys(pk, cap, agrupadorId)) {
          if (cpmByNodeKey[k]) return cpmByNodeKey[k]
        }
      }
    }
  }
  if (!cpmByNodeKey || !pkId) return null
  for (const k of cpmLookupKeys(pkId, cap, agrupadorId)) {
    if (cpmByNodeKey[k]) return cpmByNodeKey[k]
  }
  return null
}

function overlayCpmSchedule(sched, cpmNode) {
  if (!cpmNode?.fecha_inicio_temprana) return sched
  const fi = fmtDateIso(cpmNode.fecha_inicio_temprana) || sched.fi
  const ff = fmtDateIso(cpmNode.fecha_fin_temprana) || sched.ff
  // CPM degenerado (mismo día): conservar fechas de programación visibles.
  if (fi && ff && fi >= ff && sched.fi && sched.ff && sched.ff > sched.fi) {
    return sched
  }
  return {
    ...sched,
    fi,
    ff,
  }
}

function fmtDateShort(iso) {
  const d = parseIsoDate(iso)
  if (!d) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function ProgDesfaseHorizonteAlert({ items, versionFinIso, t }) {
  if (!items?.length || !versionFinIso) return null
  const limLabel = fmtDateHuman(versionFinIso)
  return (
    <div
      role="alert"
      style={{
        margin: '0 16px 8px',
        padding: '10px 14px',
        borderRadius: 8,
        border: '1px solid #f97316',
        background: 'linear-gradient(90deg, #fff7ed 0%, #ffedd5 100%)',
        color: '#9a3412',
        fontSize: 'var(--cc-caption)',
        flexShrink: 0,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>⚠</span>
        <span>
          {items.length === 1
            ? '1 agrupador supera la fecha fin del cronograma'
            : `${items.length} agrupadores superan la fecha fin del cronograma`}
          {' '}
          <span style={{ fontWeight: 600 }}>(fin versión: {limLabel})</span>
        </span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it) => (
          <li key={it.key}>
            <strong>{it.label}</strong>
            {' — fin CPM '}
            {fmtDateHuman(it.fechaFin)}
            {' · '}
            <span style={{ fontWeight: 700, color: '#c2410c' }}>
              +{it.dias} día{it.dias === 1 ? '' : 's'} hábil{it.dias === 1 ? '' : 'es'} fuera de plazo
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProgCpmResumenTable({ rows, t, variant = 'inline', onClose = null, versionFinIso = null, noHabilesSet = null }) {
  const isPopup = variant === 'popup'
  const content = (
    <>
      <div
        style={{
          padding: '8px 12px',
          fontWeight: 700,
          fontSize: 'var(--cc-caption)',
          color: t.text,
          position: isPopup ? 'sticky' : 'sticky',
          top: 0,
          background: t.bgCard,
          borderBottom: `1px solid ${t.border}`,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span>
          Resultados CPM
          {rows?.length ? ` (${rows.length})` : ''}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 18,
              lineHeight: 1,
              cursor: 'pointer',
              color: t.textMuted,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        )}
      </div>
      {!rows?.length ? (
        <div style={{ padding: 16, color: t.textMuted, fontSize: 'var(--cc-caption)', textAlign: 'center' }}>
          Sin resultados CPM para este PK. Calcule CPM en la pestaña Dependencias.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-caption)' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>
              {['Agrupador', 'Inicio temprano', 'Fin temprano', 'Holgura', 'Estado'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === 'Agrupador' ? 'left' : 'center',
                    padding: '6px 10px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const clasif = clasificarNodoCpm(r, versionFinIso, noHabilesSet)
              const holgura = Number(r.holgura_total)
              const holguraLabel = clasif.holguraNegativa && Number.isFinite(holgura) && holgura < 0
                ? `${holgura} días`
                : clasif.holguraCero
                  ? '0 días'
                  : `${Number.isFinite(holgura) ? holgura : '—'} día${holgura === 1 ? '' : 's'}`
              const rowBg = clasif.bgAlerta
                ? 'rgba(254,243,199,0.55)'
                : clasif.bgCritico
                  ? 'rgba(254,226,226,0.35)'
                  : clasif.bgFinal
                    ? 'rgba(219,234,254,0.45)'
                    : 'transparent'
              return (
                <tr
                  key={`${r.capitulo}-${r.agrupador_id}`}
                  style={{
                    borderBottom: `1px solid ${t.border}33`,
                    background: rowBg,
                  }}
                >
                  <td style={{ padding: '7px 10px', fontWeight: 600, color: t.text }}>{r.label}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: t.text }}>{fmtDateShort(r.fecha_inicio_temprana)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: t.text }}>{fmtDateShort(r.fecha_fin_temprana)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: t.text }}>{holguraLabel}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {clasif.tipo === 'holgura_negativa' && (
                      <span style={{ color: '#c2410c', fontWeight: 600 }}>{clasif.label}</span>
                    )}
                    {clasif.tipo === 'critica' && (
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>{clasif.label}</span>
                    )}
                    {clasif.tipo === 'final_tramo' && (
                      <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{clasif.label}</span>
                    )}
                    {clasif.tipo === 'holgura' && (
                      <span style={{ color: '#b45309' }}>{clasif.label}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )

  if (isPopup) {
    return (
      <div style={{ overflow: 'auto', maxHeight: 'min(70vh, 520px)' }}>
        {content}
      </div>
    )
  }

  if (!rows?.length) return null
  return (
    <div
      style={{
        borderTop: `1px solid ${t.border}`,
        background: t.bgCard,
        flexShrink: 0,
        maxHeight: 240,
        overflow: 'auto',
      }}
    >
      {content}
    </div>
  )
}

/** Filas alineadas tabla ↔ Gantt + timeline del PK o tramo consolidado. */
function buildPkGanttLayout({
  capitulosOrdenados,
  layoutScope,
  layoutPkId,
  tramoConsolidado = false,
  tramoCpmByAgId = null,
  tramoCpmByCapAg = null,
  tramoPkIds = null,
  cpmByNodeKey = null,
  collapsedCaps,
  expandedAgs,
  estructuraPorCapitulo,
  itemsPorCapitulo,
  actMap,
  actividadKey,
  agrupadorActItem,
  agrupadorRowKey,
  itemRowKey,
  rowDraftRef,
  finOverrides,
  calcFinLocal,
  noHabilesSet,
  horizonEndIso = null,
}) {
  const syncRows = []
  const getDraft = (c, itemCode) => {
    const eCap = estructuraPorCapitulo?.[c]
    const agMatch = (eCap?.agrupadores || []).find((ag) => agrupadorActItem(ag) === itemCode)
    const rk = agMatch ? agrupadorRowKey(c, agMatch) : itemRowKey(c, itemCode)
    return resolveRowSchedule({
      cap: c,
      itemKey: itemCode,
      rk,
      actMap,
      actividadKey,
      rowDraftRef,
      finOverrides,
      calcFinLocal,
    })
  }

  for (let capIdx = 0; capIdx < capitulosOrdenados.length; capIdx++) {
    const cap = capitulosOrdenados[capIdx]
    const capKey = `${layoutScope}\u0000${cap}`
    const collapsed = !!collapsedCaps[capKey]
    const estructuraCap = estructuraPorCapitulo?.[cap]
    const items = itemsPorCapitulo(cap)
    const agrupadores = estructuraCap?.agrupadores || []
    const sinAgrupador = estructuraCap?.sin_agrupador || []
    const useWbs = agrupadores.length > 0 || sinAgrupador.length > 0
    const capResumen = computeCapConsolidado({
      cap,
      estructuraCap,
      items,
      agrupadorActItem,
      agrupadorRowKey,
      itemRowKey,
      actMap,
      actividadKey,
      rowDraftRef,
      finOverrides,
      calcFinLocal,
      noHabilesSet,
    })

    syncRows.push({
      key: `cap-${cap}`,
      kind: 'cap',
      cap,
      capIdx,
      height: ROW_H.cap,
      label: `Σ Capítulo ${cap}`,
      barStart: capResumen.fecha_inicio,
      barEnd: capResumen.fecha_fin,
      diasHab: capResumen.dias_habiles ?? 0,
      isSummary: true,
    })

    if (collapsed) continue

    if (useWbs) {
      for (const ag of agrupadores) {
        const actItem = agrupadorActItem(ag)
        const rk = agrupadorRowKey(cap, ag)
        const sched = resolveRowSchedule({
          cap, itemKey: actItem, rk, actMap, actividadKey, rowDraftRef, finOverrides, calcFinLocal,
        })
        const cpmNode = resolveCpmNode({
          tramoConsolidado,
          tramoCpmByAgId,
          tramoCpmByCapAg,
          tramoPkIds: tramoConsolidado ? tramoPkIds : null,
          cpmByNodeKey,
          pkId: layoutPkId,
          cap,
          agrupadorId: ag.agrupador_id,
        })
        const barSched = overlayCpmSchedule(sched, cpmNode)
        const label = `${ag.codigo_wbs || actItem}${ag.agrupador_nombre ? ` · ${ag.agrupador_nombre}` : ''}`
        syncRows.push({
          key: `ag-${ag.agrupador_id}`,
          kind: 'ag',
          cap,
          agrupadorId: ag.agrupador_id,
          height: ROW_H.agrupador,
          label: ag.codigo_wbs || actItem,
          labelTitle: label,
          barStart: barSched.fi,
          barEnd: barSched.ff,
          duracion: sched.dur > 0 ? sched.dur : 0,
          isSummary: false,
        })
        const agExpKey = `${layoutScope}\u0000${cap}\u0000${ag.agrupador_id}`
        if (expandedAgs[agExpKey]) {
          for (const hijo of ag.items || []) {
            syncRows.push({
              key: `hijo-${cap}-${hijo.item}`,
              kind: 'spacer',
              cap,
              height: ROW_H.hijo,
              label: '',
              barStart: null,
              barEnd: null,
            })
          }
        }
      }
    } else {
      for (const it of items) {
        const rk = itemRowKey(cap, it.item)
        const sched = resolveRowSchedule({
          cap, itemKey: it.item, rk, actMap, actividadKey, rowDraftRef, finOverrides, calcFinLocal,
        })
        syncRows.push({
          key: `item-${cap}-${it.item}`,
          kind: 'item',
          cap,
          height: ROW_H.item,
          label: it.item,
          labelTitle: it.descripcion || it.item,
          barStart: sched.fi,
          barEnd: sched.ff,
          duracion: sched.dur,
          isSummary: false,
        })
      }
    }
  }

  let timelineDays = computeGanttTimelineDays({
    capitulosOrdenados,
    itemsPorCapitulo,
    actMap,
    actividadKey,
    getDraftValues: (c, itemCode) => {
      const s = getDraft(c, itemCode)
      return { fecha_inicio: s.fi, fecha_fin: s.ff }
    },
    estructuraPorCapitulo,
    agrupadorActItem,
    horizonEndIso,
    syncRows,
  })
  if (!timelineDays.length) timelineDays = defaultTimelineDays()

  return {
    timelineDays,
    syncRows,
    fromT: timelineDays[0].getTime(),
  }
}

function ProgPkGanttPanel({
  model,
  noHabilesSet,
  t,
  cpmByNodeKey,
  activePk,
  tramoConsolidado = false,
  tramoCpmByAgId = null,
  tramoCpmByCapAg = null,
  tramoPkIds = null,
  bodyScrollRef,
  onBodyScroll,
  onRefresh,
  compareByKey,
  ganttCompareMode,
  showCompare,
  versionFinIso = null,
}) {
  if (!model?.timelineDays?.length) return null
  const { timelineDays, syncRows, fromT } = model
  const dayPx = GANTT_DAY_PX
  const gridW = timelineDays.length * dayPx
  const monthRowH = 28
  const dayRowH = 26
  const timelineH = monthRowH + dayRowH
  const bodyH = syncRows.reduce((s, r) => s + r.height, 0)
  const contentW = gridW

  const monthSpans = useMemo(() => {
    const spans = []
    let i = 0
    while (i < timelineDays.length) {
      const d = timelineDays[i]
      const m = d.getMonth()
      const y = d.getFullYear()
      let j = i + 1
      while (j < timelineDays.length && timelineDays[j].getMonth() === m && timelineDays[j].getFullYear() === y) j++
      spans.push({ label: monthYearLabel(d), start: i, count: j - i })
      i = j
    }
    return spans
  }, [timelineDays])

  const dayNonHabil = (d) => {
    const iso = isoFromDate(d)
    return isWeekendDate(d) || noHabilesSet.has(iso)
  }

  const versionFinIdx = useMemo(() => {
    if (!versionFinIso) return null
    const vd = parseIsoDate(versionFinIso)
    if (!vd) return null
    const idx = Math.round((vd.getTime() - fromT) / 86400000)
    if (idx < 0 || idx >= timelineDays.length) return null
    return idx
  }, [versionFinIso, fromT, timelineDays.length])

  const timelineHeader = (
    <div style={{ display: 'flex', width: contentW, minWidth: contentW, position: 'relative' }}>
      {onRefresh ? (
        <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 3 }}>
          <GanttRefreshButton onClick={onRefresh} />
        </div>
      ) : null}
      <div style={{ position: 'relative', width: gridW, minWidth: gridW, flexShrink: 0 }}>
        {timelineDays.map((d, i) =>
          dayNonHabil(d) ? (
            <div
              key={`nh-h-${isoFromDate(d)}`}
              style={{
                position: 'absolute',
                left: i * dayPx,
                width: dayPx,
                top: 0,
                height: timelineH,
                background: GANTT_NON_HABIL_BG,
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
          ) : null,
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', height: monthRowH, borderBottom: `1px solid ${t.border}`, background: t.bgCard }}>
            {monthSpans.map((ms, idx) => (
              <div
                key={`${ms.label}-${ms.start}`}
                style={{
                  width: ms.count * dayPx,
                  minWidth: ms.count * dayPx,
                  flexShrink: 0,
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  textAlign: 'center',
                  fontSize: 'var(--cc-caption)',
                  fontWeight: 700,
                  color: t.text,
                  padding: '6px 4px',
                  borderLeft: idx > 0 ? `1px solid ${t.border}` : 'none',
                }}
                title={ms.label}
              >
                {ms.label}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', height: dayRowH, borderBottom: `1px solid ${t.border}`, background: t.bg }}>
            {timelineDays.map((d) => (
              <div
                key={`d-${isoFromDate(d)}`}
                style={{
                  width: dayPx,
                  minWidth: dayPx,
                  flexShrink: 0,
                  fontSize: 11,
                  textAlign: 'center',
                  color: t.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderLeft: `1px solid ${t.border}33`,
                }}
                title={d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
              >
                {d.getDate()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: t.bg,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        ref={bodyScrollRef}
        onScroll={onBodyScroll}
        style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', overscrollBehavior: 'contain' }}
      >
        <div style={{ width: contentW, position: 'relative', minHeight: bodyH + timelineH }}>
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              background: t.bgCard,
              borderBottom: `1px solid ${t.border}`,
            }}
          >
            {timelineHeader}
          </div>
          {timelineDays.map((d, i) =>
            dayNonHabil(d) ? (
              <div
                key={`nh-b-${isoFromDate(d)}`}
                style={{
                  position: 'absolute',
                  left: i * dayPx,
                  width: dayPx,
                  top: timelineH,
                  height: bodyH,
                  background: GANTT_NON_HABIL_BG,
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
            ) : null,
          )}
          {versionFinIdx != null && (
            <div
              style={{
                position: 'absolute',
                left: (versionFinIdx + 1) * dayPx - 1,
                top: timelineH,
                height: bodyH,
                width: 2,
                background: '#ea580c',
                boxShadow: '0 0 0 1px rgba(234,88,12,0.35)',
                pointerEvents: 'none',
                zIndex: 4,
              }}
              title={`Fin cronograma versión: ${fmtDateHuman(versionFinIso)}`}
            />
          )}
          {syncRows.map((row) => {
            const cpmNode = row.kind === 'cap'
              ? (tramoCpmByAgId ? null : cpmByNodeKey?.[cpmNodeKey(activePk, row.cap, '')])
              : row.kind === 'ag'
                ? resolveCpmNode({
                  tramoConsolidado,
                  tramoCpmByAgId,
                  tramoCpmByCapAg,
                  tramoPkIds,
                  cpmByNodeKey,
                  pkId: activePk,
                  cap: row.cap,
                  agrupadorId: row.agrupadorId,
                })
                : null
            const cpmClasif = clasificarNodoCpm(cpmNode, versionFinIso, noHabilesSet)
            if (row.kind === 'spacer') {
              return <div key={row.key} style={{ height: row.height, borderBottom: `1px solid ${t.border}22` }} />
            }
            const ck = compareKeyForGanttRow(activePk, row)
            const cmpNode = ck && compareByKey ? compareByKey[ck] : null
            const tipo = cmpNode?.tipo_cambio || 'sin_cambio'
            const compareBarColor = showCompare && tipo !== 'sin_cambio' ? (COMPARE_COLORS[tipo] || null) : null
            return (
              <GanttBarRow
                key={row.key}
                label={row.label}
                labelTitle={row.labelTitle || row.label}
                rowHeight={row.height}
                days={timelineDays}
                fromT={fromT}
                dayPx={dayPx}
                barStart={row.barStart}
                barEnd={row.barEnd}
                isSummary={row.isSummary}
                duracion={row.duracion}
                diasHab={row.diasHab}
                t={t}
                cpmClasif={cpmClasif}
                holguraDias={cpmNode?.holgura_total ?? 0}
                holguraEnd={cpmNode?.fecha_fin_tardia ?? null}
                baselineBarStart={cmpNode?.baseline?.fecha_inicio}
                baselineBarEnd={cmpNode?.baseline?.fecha_fin}
                compareBarColor={compareBarColor}
                ganttCompareMode={ganttCompareMode}
                showCompare={showCompare && !!cmpNode}
                versionFinIso={versionFinIso}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function monthYearLabel(d) {
  const month = d.toLocaleDateString('es-CO', { month: 'long' })
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${d.getFullYear()}`
}

function ganttBarTooltip({ isSummary, label, barStart, barEnd, duracion, diasHab }) {
  if (!barStart || !barEnd) return ''
  if (isSummary) {
    return `Capítulo — Inicio: ${fmtDateHuman(barStart)} — Fin: ${fmtDateHuman(barEnd)} — ${diasHab} días hábiles programados`
  }
  const dur = duracion > 0 ? duracion : '—'
  return `Ítem ${label} — Inicio: ${fmtDateHuman(barStart)} — Fin: ${fmtDateHuman(barEnd)} — ${dur} días hábiles`
}

function GanttRefreshButton({ onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      title="Actualizar diagrama Gantt"
      aria-label="Actualizar diagrama Gantt"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: 'none',
        background: hover ? 'rgba(29, 158, 117, 0.14)' : 'transparent',
        borderRadius: '50%',
        width: 32,
        height: 32,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: hover ? GANTT_TEAL_DARK : GANTT_TEAL,
        transform: hover ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.4s ease, color 0.2s ease, background 0.2s ease',
        padding: 0,
      }}
    >
      <RefreshCw size={18} strokeWidth={2.25} />
    </button>
  )
}

const CAP_PALETTE = [
  { bg: '#e8f4fc', border: '#b8d9f0', accent: '#5b9bd5' },
  { bg: '#f0fce8', border: '#c5e8b7', accent: '#6aaf50' },
  { bg: '#fdf6e8', border: '#ecd9b0', accent: '#c9a227' },
  { bg: '#f3ecfc', border: '#d4c4eb', accent: '#8b6cb8' },
  { bg: '#fceef0', border: '#e8c4cb', accent: '#c75b6a' },
  { bg: '#e8faf8', border: '#b8e8e2', accent: '#3d9e8f' },
]

function useDebounced(value, ms) {
  const [d, setD] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return d
}

function capColor(idx) {
  return CAP_PALETTE[idx % CAP_PALETTE.length]
}

/** Rango de días del Gantt: programación visible ± margen (no fechas tardías CPM). */
function computeGanttTimelineDays({
  capitulosOrdenados,
  itemsPorCapitulo,
  actMap,
  actividadKey,
  getDraftValues,
  estructuraPorCapitulo,
  agrupadorActItem,
  horizonEndIso,
  syncRows,
}) {
  let minD = null
  let maxD = null

  const bump = (iso) => {
    const d = parseIsoDate(fmtDateIso(iso))
    if (!d) return
    if (!minD || d < minD) minD = d
    if (!maxD || d > maxD) maxD = d
  }

  for (const cap of capitulosOrdenados) {
    const eCap = estructuraPorCapitulo?.[cap]
    const agrupadores = eCap?.agrupadores || []
    const iter = agrupadores.length
      ? agrupadores.map((ag) => ({ item: agrupadorActItem(ag) }))
      : itemsPorCapitulo(cap)
    for (const it of iter) {
      const act = actMap[actividadKey(cap, it.item, 1)]
      const draft = getDraftValues?.(cap, it.item)
      bump(draft?.fecha_inicio ?? act?.fecha_inicio)
      bump(draft?.fecha_fin ?? act?.fecha_fin_calculada)
    }
  }

  for (const row of syncRows || []) {
    bump(row.barStart)
    bump(row.barEnd)
  }

  bump(horizonEndIso)

  if (!minD && !maxD) return []
  if (!minD) minD = maxD
  if (!maxD) maxD = minD
  const from = addCalendarDays(minD, -GANTT_RANGE_PAD_DAYS)
  const to = addCalendarDays(maxD, GANTT_RANGE_PAD_DAYS)
  return eachCalendarDay(from, to)
}

/** @deprecated use computeGanttTimelineDays */
function computePkTimelineDays(capitulosOrdenados, itemsPorCapitulo, actMap, actividadKey, getDraftValues, estructuraPorCapitulo, agrupadorActItem) {
  return computeGanttTimelineDays({
    capitulosOrdenados,
    itemsPorCapitulo,
    actMap,
    actividadKey,
    getDraftValues,
    estructuraPorCapitulo,
    agrupadorActItem,
    horizonEndIso: null,
    syncRows: [],
  })
}

function GanttBarGrid({
  rowHeight,
  days,
  fromT,
  dayPx,
  barStart,
  barEnd,
  isSummary,
  label,
  duracion,
  diasHab,
  t,
  cpmClasif,
  holguraDias,
  holguraEnd,
  baselineBarStart,
  baselineBarEnd,
  compareBarColor,
  ganttCompareMode = 'overlay',
  showCompare = false,
  versionFinIso = null,
}) {
  const calcBar = (start, end) => {
    let left = 0
    let width = 0
    const fi = parseIsoDate(start)
    const ff = parseIsoDate(end)
    if (fi && ff) {
      const startIdx = Math.max(0, Math.round((fi.getTime() - fromT) / 86400000))
      const endIdx = Math.min(days.length - 1, Math.round((ff.getTime() - fromT) / 86400000))
      left = startIdx * dayPx
      width = Math.max((endIdx - startIdx + 1) * dayPx, dayPx)
    }
    return { left, width, ff }
  }

  const { left, width, ff: barFf } = calcBar(barStart, barEnd)
  const baseline = calcBar(baselineBarStart, baselineBarEnd)

  const versionFinD = versionFinIso ? parseIsoDate(versionFinIso) : null
  let inHorizonLeft = left
  let inHorizonWidth = width
  let overflowLeft = 0
  let overflowWidth = 0
  if (width > 0 && versionFinD && barFf && barFf > versionFinD) {
    const horizonEndIdx = Math.min(
      days.length - 1,
      Math.max(0, Math.round((versionFinD.getTime() - fromT) / 86400000)),
    )
    const horizonEndPx = (horizonEndIdx + 1) * dayPx
    if (left + width > horizonEndPx) {
      overflowLeft = Math.max(horizonEndPx, left)
      overflowWidth = left + width - overflowLeft
      inHorizonWidth = Math.max(overflowLeft - left, 0)
    }
  }

  let holguraLeft = 0
  let holguraWidth = 0
  const ff = barFf || parseIsoDate(barEnd)
  const esCriticoReal = cpmClasif?.bgCritico === true
  const esFinalTramo = cpmClasif?.bgFinal === true
  const esFueraPlazo = cpmClasif?.bgAlerta === true || overflowWidth > 0
  if (holguraEnd && ff && !esCriticoReal && !esFinalTramo) {
    const fh = parseIsoDate(holguraEnd)
    if (fh && fh > ff) {
      const endIdx = Math.min(days.length - 1, Math.round((ff.getTime() - fromT) / 86400000))
      const hEndIdx = Math.min(days.length - 1, Math.round((fh.getTime() - fromT) / 86400000))
      holguraLeft = (endIdx + 1) * dayPx
      holguraWidth = Math.max((hEndIdx - endIdx) * dayPx, 0)
    }
  }

  const tooltip = ganttBarTooltip({ isSummary, label, barStart, barEnd, duracion, diasHab })
  const clasifTip = cpmTooltipClasificacion(cpmClasif, holguraDias)
  const criticalTooltip = clasifTip || tooltip

  const dual = showCompare && ganttCompareMode === 'dual'
  const barH = dual ? Math.max(8, GANTT_BAR_H * 0.42) : GANTT_BAR_H
  const targetTransform = dual ? 'translateY(-85%)' : 'translateY(-50%)'
  const baselineTransform = dual ? 'translateY(-15%)' : 'translateY(-50%)'

  const defaultBg = isSummary
    ? (esCriticoReal ? '#fee2e2' : esFueraPlazo ? '#fef3c7' : esFinalTramo ? '#dbeafe' : GANTT_CAP_BAR)
    : (esCriticoReal ? '#fecaca' : esFueraPlazo ? '#fde68a' : esFinalTramo ? '#bfdbfe' : GANTT_TEAL)
  const barBorder = esCriticoReal
    ? '2px solid #dc2626'
    : esFueraPlazo
      ? '2px solid #d97706'
    : esFinalTramo
      ? '2px solid #2563eb'
      : 'none'
  const barBg = compareBarColor && showCompare ? compareBarColor : defaultBg
  const overflowBg = '#ef4444'
  const overflowBorder = '2px solid #b91c1c'

  return (
    <div
      style={{
        position: 'relative',
        width: days.length * dayPx,
        minWidth: days.length * dayPx,
        height: rowHeight,
        borderBottom: `1px solid ${t.border}44`,
        flexShrink: 0,
      }}
    >
      {days.map((d, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: i * dayPx,
            width: dayPx,
            top: 0,
            bottom: 0,
            borderLeft: `1px solid ${t.border}22`,
            pointerEvents: 'none',
          }}
        />
      ))}
      {holguraWidth > 0 && (
        <div
          style={{
            position: 'absolute',
            left: holguraLeft,
            width: holguraWidth,
            height: GANTT_BAR_H,
            top: '50%',
            transform: 'translateY(-50%)',
            borderRadius: '0 4px 4px 0',
            background: 'rgba(156,163,175,0.35)',
            border: '1px dashed #9ca3af',
            boxSizing: 'border-box',
            zIndex: 1,
          }}
          title={criticalTooltip || undefined}
        />
      )}
      {showCompare && baseline.width > 0 && (
        <div
          style={{
            position: 'absolute',
            left: baseline.left,
            width: baseline.width,
            height: barH,
            top: '50%',
            transform: baselineTransform,
            borderRadius: 4,
            background: 'rgba(156,163,175,0.55)',
            border: '1px solid #9ca3af',
            boxSizing: 'border-box',
            zIndex: ganttCompareMode === 'overlay' ? 1 : 1,
            opacity: ganttCompareMode === 'overlay' ? 0.85 : 1,
          }}
          title={`Baseline: ${fmtDateHuman(baselineBarStart)} → ${fmtDateHuman(baselineBarEnd)}`}
        />
      )}
      {inHorizonWidth > 0 && (
        <div
          style={{
            position: 'absolute',
            left: inHorizonLeft,
            width: inHorizonWidth,
            height: barH,
            top: '50%',
            transform: targetTransform,
            borderRadius: overflowWidth > 0 ? '4px 0 0 4px' : 4,
            background: barBg,
            border: barBorder !== 'none' ? barBorder : (showCompare && compareBarColor ? '1px solid rgba(0,0,0,0.12)' : 'none'),
            boxShadow: esCriticoReal && !isSummary ? '0 0 0 1px rgba(239,68,68,0.35)' : 'none',
            boxSizing: 'border-box',
            zIndex: 2,
          }}
          title={criticalTooltip || tooltip}
        />
      )}
      {overflowWidth > 0 && (
        <div
          style={{
            position: 'absolute',
            left: overflowLeft,
            width: overflowWidth,
            height: barH,
            top: '50%',
            transform: targetTransform,
            borderRadius: '0 4px 4px 0',
            background: overflowBg,
            border: overflowBorder,
            boxSizing: 'border-box',
            zIndex: 3,
            backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 6px)',
          }}
          title={`Fuera del cronograma (después de ${fmtDateHuman(versionFinIso)}) — ${criticalTooltip || tooltip}`}
        />
      )}
    </div>
  )
}

function GanttBarRow(props) {
  const { rowHeight, t } = props
  return (
    <div style={{ display: 'flex', height: rowHeight, borderBottom: `1px solid ${t.border}44`, alignItems: 'stretch' }}>
      <GanttBarGrid {...props} />
    </div>
  )
}

const TEAL_BADGE = '#1D9E75'

function ProgItemRow({
  itemDef,
  act,
  rk,
  cid,
  token,
  API,
  t,
  editable,
  saveStatus,
  onGuardarItem,
  onGuardarBatchTramo = null,
  stickyBg,
  registerRowDraft,
  unregisterRowDraft,
  finOverride,
  rowKind = 'item',
  parentAct = null,
  agExpanded = false,
  onToggleAgExpand = null,
  saveGeneration = 0,
  suspendAutoSave = false,
  tramoConsolidado = false,
  cpmClasif = null,
  cpmNode = null,
  cpmAplicado = false,
}) {
  const ex = act || {}
  const hasManualFechaAncla = Boolean(ex.override_manual && fmtDateIso(ex.fecha_inicio))
  const showCpmDates = cpmAplicado && Boolean(cpmNode?.fecha_inicio_temprana)
  const cpmIni = showCpmDates ? fmtDateIso(cpmNode.fecha_inicio_temprana) : null
  const cpmFin = showCpmDates ? fmtDateIso(cpmNode.fecha_fin_temprana) : null
  const inherited = rowKind === 'hijo'
  const readOnly = rowKind === 'hijo' || rowKind === 'sin_agrupador'
  const effectiveEditable = editable && !readOnly
  const parentDates = parentAct || {}
  const [fechaIni, setFechaIni] = useState(() => fmtDateIso(ex.fecha_inicio))
  const [duracion, setDuracion] = useState(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
  const debDur = useDebounced(duracion, 320)
  const debFecha = useDebounced(fechaIni, 320)
  const [finCalc, setFinCalc] = useState(() => fmtDateIso(ex.fecha_fin_calculada))
  const dirtyRef = useRef(false)
  const actSyncKey = `${fmtDateIso(ex.fecha_inicio)}|${ex.duracion_dias_habiles ?? ''}|${fmtDateIso(ex.fecha_fin_calculada)}`

  useEffect(() => {
    if (dirtyRef.current) return
    setFechaIni(fmtDateIso(ex.fecha_inicio))
    setDuracion(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
    setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
  }, [actSyncKey, itemDef.capitulo, itemDef.item])

  useEffect(() => {
    if (!saveGeneration) return
    dirtyRef.current = false
    setFechaIni(fmtDateIso(ex.fecha_inicio))
    setDuracion(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
    setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
  }, [saveGeneration, actSyncKey])

  useEffect(() => {
    if (finOverride == null || finOverride === '') return
    setFinCalc(fmtDateIso(finOverride))
  }, [finOverride])

  useEffect(() => {
    if (!registerRowDraft) return undefined
    const api = {
      getValues: () => ({
        fecha_inicio: fechaIni,
        duracion: duracion,
        fecha_fin: finCalc,
      }),
      setFin: (iso) => setFinCalc(fmtDateIso(iso)),
    }
    registerRowDraft(rk, api)
    return () => unregisterRowDraft?.(rk)
  }, [rk, fechaIni, duracion, finCalc, registerRowDraft, unregisterRowDraft, rowKind])

  useEffect(() => {
    const d = parseInt(String(debDur), 10)
    if (!debFecha || !d || d < 1 || !cid || !token) {
      if (!dirtyRef.current) setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
      return
    }
    let cancel = false
    const q = new URLSearchParams({ fecha_inicio: debFecha, duracion_dias_habiles: String(d) })
    fetch(`${API}/prog-obra/${cid}/calcular-fin?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancel) setFinCalc(j?.fecha_fin_calculada ? fmtDateIso(j.fecha_fin_calculada) : '')
      })
      .catch(() => {
        if (!cancel && !dirtyRef.current) setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
      })
    return () => {
      cancel = true
    }
  }, [debFecha, debDur, cid, token, API, ex.fecha_fin_calculada])

  const trySave = useCallback(async () => {
    if (!effectiveEditable || saveStatus === 'saving' || suspendAutoSave) return false
    if (tramoConsolidado) return false
    const d = parseInt(String(duracion), 10)
    if (!fechaIni || !(d > 0)) return false
    const ok = await onGuardarItem(itemDef, { fecha_inicio: fechaIni, duracion: String(d), override_manual: true, heredado_de_capitulo: false }, rk)
    if (ok) dirtyRef.current = false
    return ok
  }, [effectiveEditable, saveStatus, suspendAutoSave, onGuardarItem, tramoConsolidado, itemDef, fechaIni, duracion, rk])

  useEffect(() => {
    if (!effectiveEditable || !dirtyRef.current || suspendAutoSave || tramoConsolidado) return undefined
    const d = parseInt(String(debDur), 10)
    if (!debFecha || !(d > 0)) return undefined
    const timer = setTimeout(() => trySave(), 700)
    return () => clearTimeout(timer)
  }, [debFecha, debDur, editable, trySave, suspendAutoSave, tramoConsolidado])

  const onBlurField = () => {
    if (tramoConsolidado) return
    if (dirtyRef.current) trySave()
  }

  const inheritedBadge = (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 700,
        color: '#fff',
        background: TEAL_BADGE,
        borderRadius: 3,
        padding: '1px 5px',
        lineHeight: 1.3,
      }}
      title="Heredado del agrupador"
    >
      H
    </span>
  )

  const saveIcon =
    saveStatus === 'saving' ? (
      <span style={{ color: t.textMuted }}>…</span>
    ) : saveStatus === 'saved' ? (
      <span style={{ color: TEAL_BADGE, fontWeight: 700 }}>✓</span>
    ) : saveStatus === 'error' ? (
      <span style={{ color: '#b91c1c', fontWeight: 700 }}>!</span>
    ) : inherited ? (
      inheritedBadge
    ) : null

  const effectiveIni = showCpmDates ? (cpmIni || fechaIni) : fechaIni
  const effectiveFin = showCpmDates ? (cpmFin || finCalc || ex.fecha_fin_calculada) : (finCalc || ex.fecha_fin_calculada)
  const displayIni = readOnly
    ? (cpmIni || fmtDateIso(ex.fecha_inicio) || fmtDateIso(parentDates.fecha_inicio) || '—')
    : effectiveIni
  const displayDur = readOnly
    ? (ex.duracion_dias_habiles ?? parentDates.duracion_dias_habiles ?? '—')
    : duracion
  const displayFin = readOnly
    ? (fmtDateHuman(cpmFin || finCalc || ex.fecha_fin_calculada || parentDates.fecha_fin_calculada) || '—')
    : fmtDateHuman(effectiveFin)

  const agrupadorLabel = `${itemDef.codigo_wbs ? `${itemDef.codigo_wbs} · ` : ''}${itemDef.agrupador_nombre || itemDef.descripcion || itemDef.item}`

  const isHijo = rowKind === 'hijo'
  const hijoBg = 'rgba(243, 244, 246, 0.85)'
  const rowH = isHijo ? ROW_H.hijo : rowKind === 'agrupador' ? ROW_H.agrupador : ROW_H.item
  const cell = {
    padding: '0 8px',
    fontSize: isHijo ? 'var(--cc-caption)' : 'var(--cc-sm)',
    lineHeight: 1.35,
    verticalAlign: 'middle',
    height: rowH,
    maxHeight: rowH,
    boxSizing: 'border-box',
    overflow: 'hidden',
  }

  if (rowKind === 'agrupador') {
    const agBg = cpmClasif?.bgAlerta
      ? 'rgba(254,243,199,0.55)'
      : cpmClasif?.bgCritico
      ? 'rgba(254,226,226,0.35)'
      : cpmClasif?.bgFinal
        ? 'rgba(219,234,254,0.45)'
        : stickyBg
    return (
      <tr style={{ borderBottom: `1px solid ${t.border}`, background: cpmClasif?.bgCritico || cpmClasif?.bgFinal || cpmClasif?.bgAlerta ? agBg : undefined }}>
        <td style={{ ...cell, ...stickyItemCell(agBg), fontWeight: 700, paddingLeft: 4 }}>
          {onToggleAgExpand && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleAgExpand?.()
            }}
            aria-expanded={agExpanded}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 'var(--cc-sm)',
              color: t.textMuted,
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            {agExpanded ? '▼' : '▶'}
          </button>
          )}
        </td>
        <td style={{ ...cell, ...stickyDescCell(agBg), fontWeight: 700, color: t.text }} title={agrupadorLabel}>
          <span style={{ ...ellipsisTextStyle(), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {cpmClasif?.tipo === 'critica' && (
              <span title="Ruta crítica" style={{ color: '#dc2626', fontWeight: 800, fontSize: 10, flexShrink: 0 }}>⚠</span>
            )}
            {cpmClasif?.tipo === 'holgura_negativa' && (
              <span title="Fuera de plazo" style={{ color: '#b45309', fontWeight: 800, fontSize: 10, flexShrink: 0 }}>⚠</span>
            )}
            {cpmClasif?.tipo === 'final_tramo' && (
              <span title="Actividad final del tramo" style={{ color: '#1d4ed8', fontWeight: 800, fontSize: 10, flexShrink: 0 }}>🏁</span>
            )}
            <span style={ellipsisTextStyle()}>{agrupadorLabel}</span>
          </span>
        </td>
        <td style={{ ...cell, minWidth: SCROLL_COL_W.und, width: SCROLL_COL_W.und }}>{itemDef.und || '—'}</td>
        <td style={{ ...cell, textAlign: 'right', minWidth: SCROLL_COL_W.cant, width: SCROLL_COL_W.cant }}>{fmtCant(itemDef.cant_total)}</td>
        <td style={{ ...cell, textAlign: 'right', minWidth: SCROLL_COL_W.costo, width: SCROLL_COL_W.costo, whiteSpace: 'nowrap' }}>{fmtCOP(itemDef.costo_directo)}</td>
        <td style={{ ...cell, minWidth: SCROLL_COL_W.fechaIni, width: SCROLL_COL_W.fechaIni }}>
          {effectiveEditable ? (
            <input
              type="date"
              value={effectiveIni}
              onChange={(e) => {
                dirtyRef.current = true
                setFechaIni(e.target.value)
              }}
              onBlur={onBlurField}
              style={{ width: '100%', fontSize: 'var(--cc-input)', padding: '4px 6px', boxSizing: 'border-box', border: `1px solid ${t.border}`, borderRadius: 4, background: t.bg }}
            />
          ) : (
            displayIni
          )}
        </td>
        <td style={{ ...cell, minWidth: SCROLL_COL_W.dias, width: SCROLL_COL_W.dias }}>
          {effectiveEditable ? (
            <input
              type="number"
              min={1}
              value={duracion}
              onChange={(e) => {
                dirtyRef.current = true
                setDuracion(e.target.value)
              }}
              onBlur={onBlurField}
              style={{ width: '100%', fontSize: 'var(--cc-input)', padding: '4px 6px', boxSizing: 'border-box', border: `1px solid ${t.border}`, borderRadius: 4, background: t.bg, textAlign: 'right' }}
            />
          ) : (
            displayDur
          )}
        </td>
        <td style={{ ...cell, minWidth: SCROLL_COL_W.fechaFin, width: SCROLL_COL_W.fechaFin, color: t.textMuted, whiteSpace: 'nowrap' }}>{displayFin}</td>
        <td style={{ ...cell, width: SCROLL_COL_W.save, minWidth: SCROLL_COL_W.save, textAlign: 'center' }}>
          {cpmClasif?.tipo === 'critica' && (
            <span title="Ruta crítica" style={{ color: '#dc2626', fontWeight: 700, fontSize: 10 }}>RC</span>
          )}
          {cpmClasif?.tipo === 'holgura_negativa' && (
            <span title="Fuera de plazo (holgura negativa)" style={{ color: '#b45309', fontWeight: 700, fontSize: 10 }}>⚠ FP</span>
          )}
          {cpmClasif?.tipo === 'final_tramo' && (
            <span title="Actividad final del tramo" style={{ color: '#1d4ed8', fontWeight: 700, fontSize: 10 }}>FIN</span>
          )}
          {!cpmClasif?.tipo || (cpmClasif.tipo !== 'critica' && cpmClasif.tipo !== 'final_tramo') ? saveIcon : null}
        </td>
      </tr>
    )
  }

  const rowBg = isHijo ? hijoBg : stickyBg
  return (
    <tr style={{ borderBottom: `1px solid ${t.border}`, background: isHijo ? hijoBg : undefined }}>
      <td style={{ ...cell, ...stickyItemCell(rowBg), fontWeight: isHijo ? 500 : 600, paddingLeft: isHijo ? 36 : 8 }} title={itemDef.item}>
        <span style={ellipsisTextStyle()}>{itemDef.item}</span>
      </td>
      <td style={{ ...cell, ...stickyDescCell(rowBg), color: t.textMuted, paddingLeft: isHijo ? 12 : 8 }} title={itemDef.descripcion}>
        <span style={ellipsisTextStyle()}>{itemDef.descripcion || '—'}</span>
      </td>
      <td style={{ ...cell, minWidth: SCROLL_COL_W.und, width: SCROLL_COL_W.und }}>{itemDef.und || '—'}</td>
      <td style={{ ...cell, textAlign: 'right', minWidth: SCROLL_COL_W.cant, width: SCROLL_COL_W.cant }}>{fmtCant(itemDef.cant_total)}</td>
      <td style={{ ...cell, textAlign: 'right', minWidth: SCROLL_COL_W.costo, width: SCROLL_COL_W.costo, whiteSpace: 'nowrap' }}>{fmtCOP(itemDef.costo_directo)}</td>
      <td style={{ ...cell, minWidth: SCROLL_COL_W.fechaIni, width: SCROLL_COL_W.fechaIni }}>
        {effectiveEditable ? (
          <input
            type="date"
            value={fechaIni}
            onChange={(e) => {
              dirtyRef.current = true
              setFechaIni(e.target.value)
            }}
            onBlur={onBlurField}
            style={{ width: '100%', fontSize: 'var(--cc-input)', padding: '4px 6px', boxSizing: 'border-box', border: `1px solid ${t.border}`, borderRadius: 4, background: t.bg }}
          />
        ) : (
          displayIni
        )}
      </td>
      <td style={{ ...cell, minWidth: SCROLL_COL_W.dias, width: SCROLL_COL_W.dias }}>
        {effectiveEditable ? (
          <input
            type="number"
            min={1}
            value={duracion}
            onChange={(e) => {
              dirtyRef.current = true
              setDuracion(e.target.value)
            }}
            onBlur={onBlurField}
            style={{ width: '100%', fontSize: 'var(--cc-input)', padding: '4px 6px', boxSizing: 'border-box', border: `1px solid ${t.border}`, borderRadius: 4, background: t.bg, textAlign: 'right' }}
          />
        ) : (
          displayDur
        )}
      </td>
      <td style={{ ...cell, minWidth: SCROLL_COL_W.fechaFin, width: SCROLL_COL_W.fechaFin, color: t.textMuted, whiteSpace: 'nowrap' }}>{displayFin}</td>
      <td style={{ ...cell, width: SCROLL_COL_W.save, minWidth: SCROLL_COL_W.save, textAlign: 'center' }}>{saveIcon}</td>
    </tr>
  )
}

function ProgCapituloSection({
  cap,
  capIdx,
  estructuraCap,
  items,
  actMap,
  actividadKey,
  itemRowKey,
  agrupadorActItem,
  agrupadorRowKey,
  collapsed,
  onToggleCollapse,
  capResumen,
  editable,
  t,
  cid,
  token,
  API,
  rowSaveStatus,
  onGuardarItem,
  onGuardarBatchTramo = null,
  registerRowDraft,
  unregisterRowDraft,
  finOverrides,
  isAgExpanded,
  onToggleAgExpand,
  saveGeneration,
  suspendAutoSave,
  puedeEditarListadoPrecios = false,
  onIrListadoPrecios = null,
  tramoConsolidado = false,
  resolveCpmForAg = null,
  cpmAplicado = false,
  versionFinIso = null,
  noHabilesSet = null,
}) {
  const pal = capColor(capIdx)
  const useWbs = Boolean(estructuraCap?.agrupadores?.length || estructuraCap?.sin_agrupador?.length)
  const agrupadores = estructuraCap?.agrupadores || []
  const sinAgrupador = estructuraCap?.sin_agrupador || []

  const buildAgItemDef = (ag) => {
    const actItem = agrupadorActItem(ag)
    const cant = Number(ag.cant_total) || 0
    const costo = Number(ag.costo_directo) || 0
    return {
      es_agrupador: true,
      agrupador_id: ag.agrupador_id,
      codigo_wbs: ag.codigo_wbs,
      agrupador_nombre: ag.agrupador_nombre,
      capitulo: cap,
      item: actItem,
      descripcion: ag.agrupador_nombre,
      cant_total: cant > 0 ? cant : 1,
      und: ag.items?.[0]?.und || ag.und || '?',
      vlr_unitario: cant > 0 ? costo / cant : costo,
      costo_directo: costo,
    }
  }

  const capCell = {
    padding: '0 8px',
    fontSize: 'var(--cc-sm)',
    lineHeight: 1.35,
    verticalAlign: 'middle',
    height: ROW_H.cap,
    maxHeight: ROW_H.cap,
    boxSizing: 'border-box',
    overflow: 'hidden',
  }

  return (
    <>
      <tr style={{ background: pal.bg, borderTop: `2px solid ${pal.border}` }}>
        <td style={{ ...capCell, ...stickyItemCell(pal.bg), paddingLeft: 4 }}>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 'var(--cc-md)',
              color: pal.accent,
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </td>
        <td style={{ ...capCell, ...stickyDescCell(pal.bg), fontWeight: 700, color: t.text }} title={`Capítulo ${cap}`}>
          <span style={{ ...ellipsisTextStyle(), display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
            <span style={ellipsisTextStyle()}>Capítulo {cap}</span>
            {sinAgrupador.length > 0 && (
              <ProgSinAgrupadorCapIcon
                count={sinAgrupador.length}
                puedeEditarListadoPrecios={puedeEditarListadoPrecios}
                onIrListadoPrecios={onIrListadoPrecios}
              />
            )}
          </span>
        </td>
        <td style={{ ...capCell, minWidth: SCROLL_COL_W.und, width: SCROLL_COL_W.und, color: t.textMuted }}>—</td>
        <td style={{ ...capCell, minWidth: SCROLL_COL_W.cant, width: SCROLL_COL_W.cant, textAlign: 'right' }} title={String(capResumen?.cant_total ?? '')}>
          {capResumen?.cant_total > 0 ? fmtCant(capResumen.cant_total) : '—'}
        </td>
        <td style={{ ...capCell, minWidth: SCROLL_COL_W.costo, width: SCROLL_COL_W.costo, textAlign: 'right', whiteSpace: 'nowrap' }} title={String(capResumen?.costo_directo ?? '')}>
          {capResumen?.costo_directo > 0 ? fmtCOP(capResumen.costo_directo) : '—'}
        </td>
        <td style={{ ...capCell, minWidth: SCROLL_COL_W.fechaIni, width: SCROLL_COL_W.fechaIni, color: t.textMuted }} title={capResumen?.fecha_inicio || ''}>
          {capResumen?.fecha_inicio || '—'}
        </td>
        <td style={{ ...capCell, minWidth: SCROLL_COL_W.dias, width: SCROLL_COL_W.dias, textAlign: 'right', color: t.textMuted }} title="Días hábiles entre inicio y fin del capítulo">
          {capResumen?.dias_habiles ?? '—'}
        </td>
        <td style={{ ...capCell, minWidth: SCROLL_COL_W.fechaFin, width: SCROLL_COL_W.fechaFin, color: t.textMuted, whiteSpace: 'nowrap' }} title={capResumen?.fecha_fin || ''}>
          {capResumen?.fecha_fin ? fmtDateHuman(capResumen.fecha_fin) : '—'}
        </td>
        <td style={{ ...capCell, width: SCROLL_COL_W.save, minWidth: SCROLL_COL_W.save }} />
      </tr>
      {!collapsed && useWbs && agrupadores.map((ag) => {
        const agDef = buildAgItemDef(ag)
        const actItem = agrupadorActItem(ag)
        const rk = agrupadorRowKey(cap, ag)
        const agAct = actMap[actividadKey(cap, actItem, 1)]
        const expanded = isAgExpanded(ag.agrupador_id)
        const cpmNode = resolveCpmForAg?.(cap, ag.agrupador_id)
        const cpmClasif = clasificarNodoCpm(cpmNode, versionFinIso, noHabilesSet)
        return (
          <Fragment key={`ag-${ag.agrupador_id}`}>
            <ProgItemRow
              itemDef={agDef}
              act={agAct}
              rk={rk}
              cid={cid}
              token={token}
              API={API}
              t={t}
              editable={editable}
              saveStatus={rowSaveStatus[rk] || 'idle'}
              onGuardarItem={onGuardarItem}
              onGuardarBatchTramo={onGuardarBatchTramo}
              stickyBg={t.bgCard}
              registerRowDraft={registerRowDraft}
              unregisterRowDraft={unregisterRowDraft}
              finOverride={finOverrides[rk]}
              rowKind="agrupador"
              saveGeneration={saveGeneration}
              suspendAutoSave={suspendAutoSave}
              agExpanded={expanded}
              onToggleAgExpand={(ag.items || []).length ? () => onToggleAgExpand(ag.agrupador_id) : undefined}
              tramoConsolidado={tramoConsolidado}
              cpmClasif={cpmClasif}
              cpmNode={cpmNode}
              cpmAplicado={cpmAplicado}
            />
            {expanded && (ag.items || []).map((hijo) => (
              <ProgItemRow
                key={itemRowKey(cap, hijo.item)}
                itemDef={{ ...hijo, capitulo: cap }}
                act={actMap[actividadKey(cap, hijo.item, 1)]}
                rk={itemRowKey(cap, hijo.item)}
                cid={cid}
                token={token}
                API={API}
                t={t}
                editable={false}
                saveStatus="idle"
                onGuardarItem={onGuardarItem}
                stickyBg={t.bgCard}
                rowKind="hijo"
                parentAct={agAct}
                tramoConsolidado={tramoConsolidado}
              />
            ))}
          </Fragment>
        )
      })}
      {!collapsed && !useWbs &&
        items.map((it) => (
          <ProgItemRow
            key={itemRowKey(cap, it.item)}
            itemDef={it}
            act={actMap[actividadKey(cap, it.item, 1)]}
            rk={itemRowKey(cap, it.item)}
            cid={cid}
            token={token}
            API={API}
            t={t}
            editable={editable}
            saveStatus={rowSaveStatus[itemRowKey(cap, it.item)] || 'idle'}
            onGuardarItem={onGuardarItem}
            stickyBg={t.bgCard}
            registerRowDraft={registerRowDraft}
            unregisterRowDraft={unregisterRowDraft}
            finOverride={finOverrides[itemRowKey(cap, it.item)]}
            saveGeneration={saveGeneration}
            suspendAutoSave={suspendAutoSave}
          />
        ))}
    </>
  )
}

export default function ProgObraProgramacionModal({
  open,
  onClose,
  t,
  workingVersion,
  pkTabs,
  activePk,
  onSelectPk,
  onRemovePk,
  capitulosOrdenados,
  estructuraPorCapitulo = {},
  agrupadorActItem = (ag) => String(ag?.codigo_wbs || `AG${ag?.agrupador_id ?? ''}`).trim(),
  agrupadorRowKey = (cap, ag) => `${cap}\u0000ag:${String(ag?.codigo_wbs || `AG${ag?.agrupador_id ?? ''}`).trim()}`,
  itemsPorCapitulo,
  capProgMap,
  actMap,
  actividadKey,
  itemRowKey,
  editable,
  rowSaveStatus,
  onHerencia,
  onGuardarCap,
  onGuardarItem,
  onGuardarBatch,
  onGuardarBatchTramo = null,
  loadAct,
  loadPpto,
  cid,
  token,
  API,
  panelBusy,
  onGuardarCambios,
  onSaveSuccess,
  onScheduleRefresh = null,
  onTramoScheduleCleared = null,
  onReloadActividades,
  showToast,
  allPkIds,
  onCpmUpdated,
  onVersionHorizonteSaved = null,
  openCompareTab = false,
  compareBaselineId = null,
  compareTargetId = null,
  puedeEditarListadoPrecios = false,
  onIrListadoPrecios = null,
  historicalReadOnly = false,
  tramoContext = null,
  modalMode = 'pk',
}) {
  const tramoConsolidado = modalMode === 'tramo'
  const ganttLayoutScope = tramoConsolidado ? 'tramo' : (activePk || '')
  const [collapsedCaps, setCollapsedCaps] = useState({})
  const [expandedAgs, setExpandedAgs] = useState({})
  const [noHabilesSet, setNoHabilesSet] = useState(new Set())
  const [finOverrides, setFinOverrides] = useState({})
  const [localSaving, setLocalSaving] = useState(false)
  const [resettingPk, setResettingPk] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [rowDrafts, setRowDrafts] = useState({})
  const [saveGeneration, setSaveGeneration] = useState(0)
  const [ganttActOverlay, setGanttActOverlay] = useState(null)
  const rowDraftRef = useRef({})
  const preSaveDraftSnapshotRef = useRef(null)
  const saveFlushInProgressRef = useRef(false)
  const leftScrollRef = useRef(null)
  const rightBodyScrollRef = useRef(null)
  const scrollSyncLock = useRef(false)
  const splitContainerRef = useRef(null)
  const splitDragRef = useRef(false)
  const panelSplitPctRef = useRef(PANEL_SPLIT_DEFAULT)
  const [panelSplitPct, setPanelSplitPct] = useState(readStoredPanelSplit)
  const [splitDragging, setSplitDragging] = useState(false)
  const [activeContentTab, setActiveContentTab] = useState('programacion')
  const [progSubTab, setProgSubTab] = useState('schedule')
  const [compareData, setCompareData] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [ganttCompareMode, setGanttCompareMode] = useState('overlay')
  const [cpmResultados, setCpmResultados] = useState([])
  const [cpmDirty, setCpmDirty] = useState(false)
  const [cpmResumenOpen, setCpmResumenOpen] = useState(false)
  const [deps, setDeps] = useState([])
  const [depsLoaded, setDepsLoaded] = useState(false)
  const [depsEstructuraByPk, setDepsEstructuraByPk] = useState({})
  const depsVersionLoadedRef = useRef(null)
  const onCpmUpdatedRef = useRef(onCpmUpdated)
  onCpmUpdatedRef.current = onCpmUpdated
  const [versionFi, setVersionFi] = useState('')
  const [versionFf, setVersionFf] = useState('')
  const [horizonteSaving, setHorizonteSaving] = useState(false)

  const compareEnabled = Boolean(compareBaselineId && compareTargetId && compareBaselineId !== compareTargetId)

  panelSplitPctRef.current = panelSplitPct

  useEffect(() => {
    const onMove = (e) => {
      if (!splitDragRef.current || !splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      if (rect.width <= 0) return
      const pct = clampPanelSplit(((e.clientX - rect.left) / rect.width) * 100)
      setPanelSplitPct(pct)
    }
    const onUp = () => {
      if (!splitDragRef.current) return
      splitDragRef.current = false
      setSplitDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        sessionStorage.setItem(PANEL_SPLIT_STORAGE_KEY, String(panelSplitPctRef.current))
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const handleSplitMouseDown = useCallback((e) => {
    e.preventDefault()
    splitDragRef.current = true
    setSplitDragging(true)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const handleSplitDoubleClick = useCallback(() => {
    const pct = PANEL_SPLIT_DEFAULT
    setPanelSplitPct(pct)
    try {
      sessionStorage.setItem(PANEL_SPLIT_STORAGE_KEY, String(pct))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setProgSubTab('schedule')
      setCompareData(null)
      setCpmResumenOpen(false)
      setRowDrafts({})
      setFinOverrides({})
      setGanttActOverlay(null)
      preSaveDraftSnapshotRef.current = null
      rowDraftRef.current = {}
      setCollapsedCaps({})
      setExpandedAgs({})
      depsVersionLoadedRef.current = null
      setDeps([])
      setDepsLoaded(false)
      setDepsEstructuraByPk({})
      setCpmResultados([])
      setCpmDirty(false)
      return
    }
    if (openCompareTab && compareEnabled) setProgSubTab('compare')
  }, [open, openCompareTab, compareEnabled])

  useEffect(() => {
    if (!open || !compareEnabled || !cid || !token) {
      setCompareData(null)
      return
    }
    let cancel = false
    setCompareLoading(true)
    fetchComparar(API, cid, token, {
      pkId: activePk,
      baselineId: compareBaselineId,
      targetId: compareTargetId,
    })
      .then((data) => {
        if (!cancel) setCompareData(data)
      })
      .catch(() => {
        if (!cancel) setCompareData(null)
      })
      .finally(() => {
        if (!cancel) setCompareLoading(false)
      })
    return () => { cancel = true }
  }, [open, compareEnabled, cid, token, API, activePk, compareBaselineId, compareTargetId])

  const compareByKey = useMemo(
    () => indexCompareNodos(compareData?.nodos || []),
    [compareData?.nodos],
  )

  const registerRowDraft = useCallback((rk, api) => {
    rowDraftRef.current[rk] = api
    if (saveFlushInProgressRef.current) return
    const v = api.getValues()
    setRowDrafts((prev) => ({ ...prev, [rk]: v }))
  }, [])

  const unregisterRowDraft = useCallback((rk) => {
    const api = rowDraftRef.current[rk]
    if (api && !saveFlushInProgressRef.current) {
      const v = api.getValues()
      setRowDrafts((prev) => ({ ...prev, [rk]: v }))
    }
    delete rowDraftRef.current[rk]
  }, [])

  const snapshotDraftsForSave = useCallback(() => {
    const snap = { ...rowDrafts }
    for (const [rk, api] of Object.entries(rowDraftRef.current)) {
      if (api?.getValues) snap[rk] = api.getValues()
    }
    preSaveDraftSnapshotRef.current = snap
    return snap
  }, [rowDrafts])

  const versionTitle = workingVersion
    ? `Versión nº${workingVersion.numero_version} ${workingVersion.tipo || ''} ${workingVersion.estado || ''}`.trim()
    : 'Sin versión seleccionada'
  const tramoCriteriosLabel = tramoContext?.tramo
    ? `Tramo: ${tramoContext.tramo} (${tramoContext.pkCount || 0} PK${tramoContext.pkCount === 1 ? '' : 's'})`
    : ''

  useEffect(() => {
    if (!open || !workingVersion) return
    setVersionFi(fmtDateIso(workingVersion.fecha_inicio) || '')
    setVersionFf(fmtDateIso(workingVersion.fecha_fin) || '')
  }, [open, workingVersion?.id, workingVersion?.fecha_inicio, workingVersion?.fecha_fin])

  const saveVersionHorizonte = useCallback(async (fi, ff) => {
    if (!editable || historicalReadOnly || !workingVersion?.id || !cid || !token) return
    setHorizonteSaving(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/versiones/${workingVersion.id}/horizonte`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_inicio: fi || null, fecha_fin: ff || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast?.(data?.detail || 'Error al guardar horizonte del cronograma.', 'err')
        return
      }
      setCpmDirty(!!data.cpm_dirty)
      onVersionHorizonteSaved?.(data)
      showToast?.('Horizonte del cronograma actualizado.', 'ok')
    } catch {
      showToast?.('Error de red al guardar horizonte.', 'err')
    } finally {
      setHorizonteSaving(false)
    }
  }, [editable, historicalReadOnly, workingVersion?.id, cid, token, API, showToast, onVersionHorizonteSaved])

  useEffect(() => {
    if (!open || !cid || !token) return
    const desde = new Date()
    const hasta = addCalendarDays(desde, 400)
    const q = new URLSearchParams({
      desde: isoFromDate(desde),
      hasta: isoFromDate(hasta),
    })
    fetch(`${API}/prog-obra/${cid}/calendario-no-habiles?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { fechas: [] }))
      .then((j) => setNoHabilesSet(new Set((j?.fechas || []).map((x) => String(x).slice(0, 10)))))
      .catch(() => setNoHabilesSet(new Set()))
  }, [open, cid, token, API])

  useEffect(() => {
    if (!open || !workingVersion?.id || !cid || !token) {
      return undefined
    }
    const vid = String(workingVersion.id)
    let cancel = false
    setDepsLoaded(false)
    const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    ;(async () => {
      try {
        const resDeps = await fetch(`${API}/prog-obra/${cid}/versiones/${vid}/dependencias`, { headers: hdrs })
        if (cancel) return
        if (resDeps.ok) {
          const raw = await resDeps.json()
          setDeps(Array.isArray(raw) ? raw.map(normalizeDep) : [])
          depsVersionLoadedRef.current = vid
        } else {
          setDeps([])
        }
      } catch {
        if (!cancel) setDeps([])
      } finally {
        if (!cancel) setDepsLoaded(true)
      }
    })()
    return () => {
      cancel = true
    }
  }, [open, workingVersion?.id, cid, token, API])

  useEffect(() => {
    if (!open || !workingVersion?.id || !cid || !token) return undefined
    let cancel = false
    const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    ;(async () => {
      try {
        const resCpm = await fetch(`${API}/prog-obra/${cid}/versiones/${workingVersion.id}/cpm-resultados`, { headers: hdrs })
        if (cancel) return
        if (resCpm.ok) {
          const cpmData = await resCpm.json()
          const resultados = cpmData.resultados || []
          setCpmResultados(resultados)
          setCpmDirty(!!cpmData.cpm_dirty)
          onCpmUpdatedRef.current?.(resultados)
        } else {
          setCpmResultados([])
          setCpmDirty(false)
        }
      } catch {
        if (!cancel) {
          setCpmResultados([])
          setCpmDirty(false)
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [open, workingVersion?.id, cid, token, API])

  const toggleCap = (cap) => {
    const scope = tramoConsolidado ? 'tramo' : (activePk || '')
    const k = `${scope}\u0000${cap}`
    setCollapsedCaps((s) => ({ ...s, [k]: !s[k] }))
  }

  const agExpandKey = (cap, agId) => `${tramoConsolidado ? 'tramo' : activePk}\u0000${cap}\u0000${agId}`
  const isAgExpanded = useCallback(
    (cap, agId) => !!expandedAgs[agExpandKey(cap, agId)],
    [expandedAgs, ganttLayoutScope],
  )
  const toggleAgExpand = (cap, agId) => {
    const k = agExpandKey(cap, agId)
    setExpandedAgs((s) => ({ ...s, [k]: !s[k] }))
  }

  const cpmByNodeKey = useMemo(() => {
    const m = {}
    for (const raw of cpmResultados) {
      const r = normalizeCpmRow(raw)
      if (!r) continue
      for (const k of cpmLookupKeys(r.pk_id, r.capitulo, r.agrupador_id)) {
        m[k] = r
      }
    }
    return m
  }, [cpmResultados])

  const agrupadorProgrammedPks = useMemo(() => {
    const m = {}
    for (const cap of capitulosOrdenados) {
      for (const ag of estructuraPorCapitulo?.[cap]?.agrupadores || []) {
        const id = String(ag.agrupador_id ?? '')
        if (!id) continue
        const prog = ag.programacion || {}
        const fromProg = (prog.pk_ids_programados || []).map((p) => String(p).trim()).filter(Boolean)
        const pks = fromProg.length
          ? fromProg
          : (ag.pk_ids || []).map((p) => String(p).trim()).filter(Boolean)
        m[id] = new Set(pks)
      }
    }
    return m
  }, [capitulosOrdenados, estructuraPorCapitulo])

  const cpmRowInTramoProgramacion = useCallback((r) => {
    if (!tramoConsolidado || r.agrupador_id == null || r.agrupador_id === '') return true
    const allowed = agrupadorProgrammedPks[String(r.agrupador_id)]
    if (!allowed?.size) return true
    return allowed.has(String(r.pk_id || '').trim())
  }, [tramoConsolidado, agrupadorProgrammedPks])

  const { tramoCpmByAgId, tramoCpmByCapAg } = useMemo(() => {
    if (!tramoConsolidado) return { tramoCpmByAgId: null, tramoCpmByCapAg: null }
    const pkSet = tramoContext?.pkIds?.length
      ? new Set(tramoContext.pkIds.map((p) => String(p).trim()))
      : null
    const buckets = {}
    const capBuckets = {}
    for (const raw of cpmResultados) {
      const r = normalizeCpmRow(raw)
      if (!r) continue
      if (pkSet && !pkSet.has(String(r.pk_id || '').trim())) continue
      if (r.agrupador_id == null || r.agrupador_id === '') continue
      const agKey = String(r.agrupador_id)
      if (!buckets[agKey]) buckets[agKey] = []
      buckets[agKey].push(r)
      const capAgKey = `${String(r.capitulo || '').trim()}\u0000${agKey}`
      if (!capBuckets[capAgKey]) capBuckets[capAgKey] = []
      capBuckets[capAgKey].push(r)
    }
    if (!Object.keys(buckets).length) {
      for (const raw of cpmResultados) {
        const r = normalizeCpmRow(raw)
        if (!r || r.agrupador_id == null || r.agrupador_id === '') continue
        const agKey = String(r.agrupador_id)
        if (!buckets[agKey]) buckets[agKey] = []
        buckets[agKey].push(r)
        const capAgKey = `${String(r.capitulo || '').trim()}\u0000${agKey}`
        if (!capBuckets[capAgKey]) capBuckets[capAgKey] = []
        capBuckets[capAgKey].push(r)
      }
    }
    const pickTramo = pickBestCpmNodeTramo
    const tramoCpmByAgIdOut = {}
    for (const [k, nodes] of Object.entries(buckets)) {
      tramoCpmByAgIdOut[k] = pickTramo(nodes)
    }
    const tramoCpmByCapAgOut = {}
    for (const [k, nodes] of Object.entries(capBuckets)) {
      tramoCpmByCapAgOut[k] = pickTramo(nodes)
    }
    return { tramoCpmByAgId: tramoCpmByAgIdOut, tramoCpmByCapAg: tramoCpmByCapAgOut }
  }, [tramoConsolidado, tramoContext, cpmResultados, agrupadorProgrammedPks])

  const agrupadorLabelById = useMemo(() => {
    const m = {}
    for (const cap of capitulosOrdenados) {
      for (const ag of estructuraPorCapitulo?.[cap]?.agrupadores || []) {
        const id = String(ag.agrupador_id ?? '')
        if (!id) continue
        const code = ag.codigo_wbs || id
        m[id] = ag.agrupador_nombre ? `${code} · ${ag.agrupador_nombre}` : code
      }
    }
    return m
  }, [capitulosOrdenados, estructuraPorCapitulo])

  const cpmResumenRows = useMemo(() => {
    if (tramoConsolidado && tramoContext?.pkIds?.length) {
      const pkSet = new Set(tramoContext.pkIds.map((p) => String(p).trim()))
      return cpmResultados
        .filter((r) => pkSet.has(String(r.pk_id || '').trim()) && r.agrupador_id != null)
        .map((r) => ({
          ...r,
          label: `${String(r.pk_id || '').trim()} · ${agrupadorLabelById[String(r.agrupador_id)] || r.agrupador_id}`,
        }))
        .sort((a, b) => {
          const byPk = String(a.pk_id || '').localeCompare(String(b.pk_id || ''), undefined, { numeric: true })
          if (byPk !== 0) return byPk
          return String(a.fecha_inicio_temprana || '').localeCompare(String(b.fecha_inicio_temprana || ''))
        })
    }
    const pk = String(activePk || '').trim()
    if (!pk) return []
    return cpmResultados
      .filter((r) => String(r.pk_id || '').trim() === pk && r.agrupador_id != null)
      .map((r) => ({
        ...r,
        label: agrupadorLabelById[String(r.agrupador_id)] || String(r.agrupador_id),
      }))
      .sort((a, b) => {
        const la = a.label.split(' · ')[0] || ''
        const lb = b.label.split(' · ')[0] || ''
        const byCode = la.localeCompare(lb, undefined, { numeric: true })
        if (byCode !== 0) return byCode
        return String(a.fecha_inicio_temprana || '').localeCompare(String(b.fecha_inicio_temprana || ''))
      })
  }, [cpmResultados, activePk, agrupadorLabelById, tramoConsolidado, tramoContext])

  const resolveCpmForAg = useCallback(
    (cap, agrupadorId) => resolveCpmNode({
      tramoConsolidado,
      tramoCpmByAgId,
      tramoCpmByCapAg,
      tramoPkIds: tramoConsolidado ? (tramoContext?.pkIds || []) : null,
      cpmByNodeKey,
      pkId: tramoConsolidado ? (tramoContext?.pkIds?.[0] || activePk) : activePk,
      cap,
      agrupadorId,
    }),
    [tramoConsolidado, tramoCpmByAgId, tramoCpmByCapAg, cpmByNodeKey, tramoContext, activePk],
  )

  const cpmAplicado = cpmResultados.length > 0 && !cpmDirty

  const desfaseHorizonteItems = useMemo(() => {
    if (!versionFf || !cpmResultados.length) return []
    const pkFiltered = tramoConsolidado && tramoContext?.pkIds?.length
      ? cpmResultados.filter((r) => {
        const pkSet = new Set(tramoContext.pkIds.map((p) => String(p).trim()))
        return pkSet.has(String(r.pk_id || '').trim()) && cpmRowInTramoProgramacion(r)
      })
      : cpmResultados
    return collectDesfaseHorizonte(pkFiltered, versionFf, {
      labelByAgId: agrupadorLabelById,
      tramoConsolidado,
      noHabilesSet,
    })
  }, [versionFf, cpmResultados, tramoConsolidado, tramoContext, agrupadorLabelById, noHabilesSet, cpmRowInTramoProgramacion])

  const handleCpmCalculated = useCallback(async (resultados) => {
    setCpmResultados(resultados)
    setCpmDirty(false)
    onCpmUpdatedRef.current?.(resultados)
    if (onReloadActividades) {
      await onReloadActividades()
    }
    onScheduleRefresh?.()
    setSaveGeneration((g) => g + 1)
  }, [onReloadActividades, onScheduleRefresh])

  // Cuando fecha_fin_calculada no está en actMap (datos viejos o sin RPC),
  // la recalcula localmente usando días hábiles y noHabilesSet.
  const calcFinLocal = useCallback((fi, dur) => {
    if (!fi || !(dur > 0)) return null
    let d = parseIsoDate(fi)
    if (!d) return null
    let count = 0
    let safety = 0
    while (count < dur && safety < 1000) {
      d = addCalendarDays(d, 1)
      safety++
      if (!isWeekendDate(d) && !noHabilesSet.has(isoFromDate(d))) count++
    }
    return isoFromDate(d)
  }, [noHabilesSet])

  const ganttActMap = useMemo(
    () => (ganttActOverlay ? { ...actMap, ...ganttActOverlay } : actMap),
    [actMap, ganttActOverlay],
  )

  const capResumenes = useMemo(() => {
    const m = {}
    for (const cap of capitulosOrdenados) {
      m[cap] = computeCapConsolidado({
        cap,
        estructuraCap: estructuraPorCapitulo?.[cap],
        items: itemsPorCapitulo(cap),
        agrupadorActItem,
        agrupadorRowKey,
        itemRowKey,
        actMap: ganttActMap,
        actividadKey,
        rowDraftRef,
        finOverrides,
        calcFinLocal,
        noHabilesSet,
      })
    }
    return m
  }, [
    capitulosOrdenados,
    estructuraPorCapitulo,
    itemsPorCapitulo,
    agrupadorActItem,
    agrupadorRowKey,
    itemRowKey,
    ganttActMap,
    actividadKey,
    finOverrides,
    calcFinLocal,
    noHabilesSet,
    rowDrafts,
    saveGeneration,
  ])

  const pkGanttModel = useMemo(
    () => buildPkGanttLayout({
      capitulosOrdenados,
      layoutScope: ganttLayoutScope,
      layoutPkId: tramoConsolidado ? (tramoContext?.pkIds?.[0] || activePk) : activePk,
      tramoConsolidado,
      tramoCpmByAgId: tramoConsolidado ? tramoCpmByAgId : null,
      tramoCpmByCapAg: tramoConsolidado ? tramoCpmByCapAg : null,
      tramoPkIds: tramoConsolidado ? (tramoContext?.pkIds || []) : null,
      cpmByNodeKey,
      collapsedCaps,
      expandedAgs,
      estructuraPorCapitulo,
      itemsPorCapitulo,
      actMap: ganttActMap,
      actividadKey,
      agrupadorActItem,
      agrupadorRowKey,
      itemRowKey,
      rowDraftRef,
      finOverrides,
      calcFinLocal,
      noHabilesSet,
      horizonEndIso: versionFf || null,
    }),
    [
      capitulosOrdenados,
      ganttLayoutScope,
      tramoConsolidado,
      tramoContext,
      activePk,
      tramoCpmByAgId,
      tramoCpmByCapAg,
      cpmByNodeKey,
      collapsedCaps,
      expandedAgs,
      estructuraPorCapitulo,
      itemsPorCapitulo,
      ganttActMap,
      actividadKey,
      agrupadorActItem,
      agrupadorRowKey,
      itemRowKey,
      finOverrides,
      calcFinLocal,
      noHabilesSet,
      rowDrafts,
      saveGeneration,
      versionFf,
    ],
  )

  const pkGanttModelExtended = useMemo(() => {
    if (!compareEnabled || !compareData?.nodos?.length || !pkGanttModel?.timelineDays?.length) {
      return pkGanttModel
    }
    let minD = pkGanttModel.timelineDays[0]
    let maxD = pkGanttModel.timelineDays[pkGanttModel.timelineDays.length - 1]
    for (const n of compareData.nodos) {
      for (const side of [n.baseline, n.target]) {
        for (const iso of [side?.fecha_inicio, side?.fecha_fin]) {
          const d = parseIsoDate(iso)
          if (!d) continue
          if (d < minD) minD = d
          if (d > maxD) maxD = d
        }
      }
    }
    const from = addCalendarDays(minD, -GANTT_RANGE_PAD_DAYS)
    const to = addCalendarDays(maxD, GANTT_RANGE_PAD_DAYS)
    const timelineDays = eachCalendarDay(from, to)
    return {
      ...pkGanttModel,
      timelineDays,
      fromT: timelineDays[0]?.getTime() ?? pkGanttModel.fromT,
    }
  }, [pkGanttModel, compareEnabled, compareData?.nodos])

  const handleLeftScroll = useCallback(() => {
    if (scrollSyncLock.current) return
    scrollSyncLock.current = true
    const top = leftScrollRef.current?.scrollTop ?? 0
    if (rightBodyScrollRef.current) rightBodyScrollRef.current.scrollTop = top
    requestAnimationFrame(() => { scrollSyncLock.current = false })
  }, [])

  const handleRightBodyScroll = useCallback(() => {
    if (scrollSyncLock.current) return
    scrollSyncLock.current = true
    const top = rightBodyScrollRef.current?.scrollTop ?? 0
    if (leftScrollRef.current) leftScrollRef.current.scrollTop = top
    requestAnimationFrame(() => { scrollSyncLock.current = false })
  }, [])

  const refreshPkGantt = useCallback(() => {
    const next = { ...finOverrides }
    for (const cap of capitulosOrdenados) {
      const eCap = estructuraPorCapitulo?.[cap]
      const agrupadores = eCap?.agrupadores || []
      const iter = agrupadores.length
        ? agrupadores.map((ag) => ({
          rk: agrupadorRowKey(cap, ag),
          itemKey: agrupadorActItem(ag),
        }))
        : itemsPorCapitulo(cap).map((it) => ({
          rk: itemRowKey(cap, it.item),
          itemKey: it.item,
        }))
      for (const { rk, itemKey } of iter) {
        const draft = rowDraftRef.current[rk]?.getValues?.()
        const act = ganttActMap[actividadKey(cap, itemKey, 1)]
        const fi = fmtDateIso(draft?.fecha_inicio ?? act?.fecha_inicio)
        const durRaw = draft?.duracion != null && draft.duracion !== '' ? draft.duracion : act?.duracion_dias_habiles
        const dur = durRaw != null ? parseInt(String(durRaw), 10) : NaN
        if (!fi || !(dur > 0)) {
          delete next[rk]
          continue
        }
        const ff = fmtDateIso(draft?.fecha_fin ?? act?.fecha_fin_calculada) || calcFinLocal(fi, dur)
        if (ff) next[rk] = ff
      }
    }
    setFinOverrides(next)
  }, [
    finOverrides,
    capitulosOrdenados,
    estructuraPorCapitulo,
    agrupadorRowKey,
    agrupadorActItem,
    itemsPorCapitulo,
    itemRowKey,
    ganttActMap,
    actividadKey,
    calcFinLocal,
  ])

  /** Tras guardar: reconstruye barras del Gantt solo desde actividades persistidas (sin borradores ni overrides viejos). */
  const syncGanttAfterSave = useCallback(async (pkId) => {
    if (!workingVersion?.id || !cid || !token || !pkId) return
    const q = new URLSearchParams({
      version_id: String(workingVersion.id),
      pk_id: String(pkId),
    })
    const d = await fetch(`${API}/prog-obra/${cid}/actividades?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => (r.ok ? r.json() : null))
    const acts = d?.actividades || []
    const freshMap = {}
    for (const a of acts) {
      freshMap[actividadKey(a.capitulo, a.item, a.segmento ?? 1)] = a
    }
    const next = {}
    for (const cap of capitulosOrdenados) {
      const eCap = estructuraPorCapitulo?.[cap]
      const agrupadores = eCap?.agrupadores || []
      const iter = agrupadores.length
        ? agrupadores.map((ag) => ({
          rk: agrupadorRowKey(cap, ag),
          itemKey: agrupadorActItem(ag),
        }))
        : itemsPorCapitulo(cap).map((it) => ({
          rk: itemRowKey(cap, it.item),
          itemKey: it.item,
        }))
      for (const { rk, itemKey } of iter) {
        const act = freshMap[actividadKey(cap, itemKey, 1)]
        const fi = fmtDateIso(act?.fecha_inicio)
        const dur = act?.duracion_dias_habiles != null ? parseInt(String(act.duracion_dias_habiles), 10) : NaN
        if (!fi || !(dur > 0)) continue
        const ff = fmtDateIso(act?.fecha_fin_calculada) || calcFinLocal(fi, dur)
        if (ff) next[rk] = ff
      }
    }
    setGanttActOverlay(freshMap)
    setFinOverrides(next)
  }, [
    workingVersion?.id,
    cid,
    token,
    API,
    capitulosOrdenados,
    estructuraPorCapitulo,
    agrupadorRowKey,
    agrupadorActItem,
    itemsPorCapitulo,
    itemRowKey,
    actividadKey,
    calcFinLocal,
  ])

  const syncGanttAfterTramoSave = useCallback(async () => {
    if (!workingVersion?.id || !cid || !token || !tramoContext?.tramo) return
    const d = await fetchEstructuraTramo(API, cid, token, {
      versionId: workingVersion.id,
      tramo: tramoContext.tramo,
      pkIds: tramoContext.pkIds,
    })
    const freshMap = {}
    const next = {}
    for (const c of d?.capitulos || []) {
      const cap = String(c.capitulo || '').trim()
      for (const ag of c.agrupadores || []) {
        const actItem = agrupadorActItem(ag)
        const prog = ag.programacion || {}
        if (!prog.fecha_inicio) continue
        freshMap[actividadKey(cap, actItem, 1)] = {
          capitulo: cap,
          item: actItem,
          segmento: 1,
          agrupador_id: ag.agrupador_id,
          codigo_wbs: ag.codigo_wbs,
          fecha_inicio: prog.fecha_inicio,
          duracion_dias_habiles: prog.duracion_dias_habiles,
          fecha_fin_calculada: prog.fecha_fin_calculada,
        }
        const rk = agrupadorRowKey(cap, ag)
        const fi = fmtDateIso(prog.fecha_inicio)
        const dur = prog.duracion_dias_habiles != null ? parseInt(String(prog.duracion_dias_habiles), 10) : NaN
        if (!fi || !(dur > 0)) continue
        const ff = fmtDateIso(prog.fecha_fin_calculada) || calcFinLocal(fi, dur)
        if (ff) next[rk] = ff
      }
    }
    setGanttActOverlay(freshMap)
    setFinOverrides(next)
  }, [
    workingVersion?.id,
    cid,
    token,
    API,
    tramoContext,
    agrupadorActItem,
    agrupadorRowKey,
    actividadKey,
    calcFinLocal,
  ])

  const collectDraftItems = useCallback(() => {
    const draftSource = preSaveDraftSnapshotRef.current || rowDrafts
    const itemsAGuardar = []
    let skipped = 0

    const resolveRowDraft = (rk, live, act, prog = null) => {
      const hasSnap = Object.prototype.hasOwnProperty.call(draftSource, rk)
      const stored = hasSnap ? draftSource[rk] : null
      const fechaRaw = hasSnap
        ? (stored?.fecha_inicio ?? '')
        : live != null
          ? (live.fecha_inicio ?? '')
          : (act?.fecha_inicio ?? prog?.fecha_inicio ?? '')
      const durRaw = hasSnap
        ? stored?.duracion
        : live?.duracion ?? act?.duracion_dias_habiles ?? prog?.duracion_dias_habiles
      return {
        fecha: fmtDateIso(fechaRaw),
        dur: parseInt(String(durRaw ?? ''), 10),
      }
    }

    const actHadSchedule = (act, prog = null) =>
      Boolean(fmtDateIso(act?.fecha_inicio ?? prog?.fecha_inicio)) ||
      (act?.duracion_dias_habiles != null && parseInt(String(act.duracion_dias_habiles), 10) > 0) ||
      (prog?.duracion_dias_habiles != null && parseInt(String(prog.duracion_dias_habiles), 10) > 0)

    for (const cap of capitulosOrdenados) {
      const eCap = estructuraPorCapitulo?.[cap]
      const agrupadores = eCap?.agrupadores || []
      const iter = agrupadores.length
        ? agrupadores.map((ag) => {
          const actItem = agrupadorActItem(ag)
          const cant = Number(ag.cant_total) || 0
          const costo = Number(ag.costo_directo) || 0
          return {
            rk: agrupadorRowKey(cap, ag),
            itemDef: {
              es_agrupador: true,
              agrupador_id: ag.agrupador_id,
              codigo_wbs: ag.codigo_wbs,
              capitulo: cap,
              item: actItem,
              cant_total: cant > 0 ? cant : 1,
              und: ag.items?.[0]?.und || '?',
              vlr_unitario: cant > 0 ? costo / cant : costo,
            },
            actItem,
            prog: ag.programacion || null,
          }
        })
        : itemsPorCapitulo(cap).map((it) => ({
          rk: itemRowKey(cap, it.item),
          itemDef: it,
          actItem: it.item,
          prog: null,
        }))
      for (const row of iter) {
        const live = rowDraftRef.current[row.rk]?.getValues?.()
        const act = actMap[actividadKey(cap, row.actItem, 1)]
        const { fecha, dur } = resolveRowDraft(row.rk, live, act, row.prog)
        const hadSchedule = actHadSchedule(act, row.prog)
        const durValid = Number.isFinite(dur) && dur > 0
        const wantsClear = !fecha && !durValid && hadSchedule
        const duracionOnly = !fecha && durValid
        const hasDraft = Boolean(fecha) && durValid

        if (wantsClear) {
          itemsAGuardar.push({
            itemDef: row.itemDef,
            rk: row.rk,
            fecha_inicio: null,
            duracion: null,
            fecha_fin_calculada: null,
            clearSchedule: true,
          })
          continue
        }
        if (duracionOnly) {
          itemsAGuardar.push({
            itemDef: row.itemDef,
            rk: row.rk,
            fecha_inicio: null,
            duracion: dur,
            duracionOnly: true,
          })
          continue
        }
        if (!hasDraft) {
          skipped += 1
          continue
        }
        itemsAGuardar.push({
          itemDef: row.itemDef,
          rk: row.rk,
          fecha_inicio: fecha,
          duracion: dur,
        })
      }
    }
    return { itemsAGuardar, skipped }
  }, [capitulosOrdenados, estructuraPorCapitulo, agrupadorActItem, agrupadorRowKey, itemsPorCapitulo, actMap, actividadKey, itemRowKey, rowDrafts])

  const flushAllDrafts = useCallback(async (options = {}) => {
    if (!editable) return { saved: 0, errors: 0, skipped: 0 }
    const { itemsAGuardar, skipped } = collectDraftItems()
    const rowsToSave = itemsAGuardar.filter(
      (row) => row.clearSchedule || row.duracionOnly || row.duracion > 0 || row.fecha_inicio,
    )
    console.debug('[ProgObra] flushAllDrafts', {
      filasTotal: itemsAGuardar.length,
      filasAGuardar: rowsToSave.length,
      borrados: rowsToSave.filter((r) => r.clearSchedule).length,
      omitidas: skipped,
      draftsRegistrados: Object.keys(rowDraftRef.current).length,
      activePk,
    })
    if (rowsToSave.length === 0) {
      if (itemsAGuardar.length === 0) {
        console.warn('[ProgObra] flushAllDrafts: sin filas agrupador/ítem — revise estructura WBS')
      }
      return { saved: 0, errors: 0, skipped: skipped || itemsAGuardar.length }
    }
    if (onGuardarBatchTramo && tramoConsolidado) {
      const allClears = rowsToSave.length > 0 && rowsToSave.every((r) => r.clearSchedule)
      const batchPayload = rowsToSave.map((row) => ({
        capitulo: row.itemDef.capitulo,
        item: row.itemDef.item,
        clearSchedule: !!row.clearSchedule,
        duracionOnly: !!row.duracionOnly,
        fecha_inicio: row.clearSchedule || row.duracionOnly ? null : row.fecha_inicio,
        duracion: row.clearSchedule ? null : row.duracion,
        fecha_fin_calculada: row.clearSchedule ? null : undefined,
        override_manual: false,
        heredado_de_capitulo: false,
        itemDef: row.itemDef,
        rk: row.rk,
      }))
      console.debug('[ProgObra] POST actividades-batch-tramo', { count: batchPayload.length, tramo: tramoContext?.tramo, allClears })
      const batchResult = await onGuardarBatchTramo(batchPayload, {
        allowOverwrite: true,
        skipReload: true,
        preserveCpmSync: !!options.preserveCpmSync,
      })
      if (!batchResult?.ok) return { saved: 0, errors: batchResult?.errors || batchPayload.length, skipped }
      return {
        saved: batchResult.saved,
        errors: 0,
        skipped,
        batchOk: true,
        allClears,
        batchMs: batchResult.batchMs,
        cpmDirty: batchResult.cpmDirty,
      }
    }
    if (onGuardarBatch) {
      const batchPayload = rowsToSave.map((row) => ({
        capitulo: row.itemDef.capitulo,
        item: row.itemDef.item,
        fecha_inicio: row.clearSchedule ? null : row.fecha_inicio,
        duracion: row.clearSchedule ? null : row.duracion,
        fecha_fin_calculada: row.clearSchedule ? null : undefined,
        override_manual: true,
        heredado_de_capitulo: false,
        itemDef: row.itemDef,
        rk: row.rk,
      }))
      console.debug('[ProgObra] POST actividades-batch', { count: batchPayload.length, pk: activePk })
      const batchResult = await onGuardarBatch(batchPayload, activePk)
      if (!batchResult?.ok) return { saved: 0, errors: batchResult?.errors || batchPayload.length, skipped }
      return { saved: batchResult.saved, errors: 0, skipped, batchOk: true, pkId: batchResult.pkId }
    }
    let saved = 0
    let errors = 0
    for (const row of rowsToSave) {
      const ok = await onGuardarItem(
        row.itemDef,
        {
          fecha_inicio: row.clearSchedule ? null : row.fecha_inicio,
          duracion: row.clearSchedule ? '' : String(row.duracion),
          override_manual: row.clearSchedule ? false : true,
          heredado_de_capitulo: false,
        },
        row.rk,
        { deferReload: true },
      )
      if (ok) saved += 1
      else errors += 1
    }
    return { saved, errors, skipped }
  }, [editable, collectDraftItems, onGuardarBatch, onGuardarBatchTramo, onGuardarItem, activePk, tramoConsolidado, tramoContext?.tramo])

  const flushDraftsBeforeCpm = useCallback(async () => {
    if (!editable) return { saved: 0, errors: 0, skipped: 0 }
    flushSync(() => {
      setCollapsedCaps((s) => {
        const next = { ...s }
        for (const cap of capitulosOrdenados) {
          next[`${ganttLayoutScope}\u0000${cap}`] = false
        }
        return next
      })
    })
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    await new Promise((r) => setTimeout(r, 80))
    snapshotDraftsForSave()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const { itemsAGuardar } = collectDraftItems()
    const pending = itemsAGuardar.filter(
      (row) => row.clearSchedule || row.duracionOnly || row.duracion > 0 || row.fecha_inicio,
    )
    if (pending.length === 0 && !tramoConsolidado) {
      return { saved: 0, errors: 0, skipped: 0 }
    }
    if (tramoConsolidado && onGuardarBatchTramo && pending.length > 0) {
      const batchPayload = pending.map((row) => ({
        capitulo: row.itemDef.capitulo,
        item: row.itemDef.item,
        clearSchedule: !!row.clearSchedule,
        duracionOnly: !!row.duracionOnly,
        fecha_inicio: row.clearSchedule || row.duracionOnly ? null : row.fecha_inicio,
        duracion: row.clearSchedule ? null : (row.duracion > 0 ? row.duracion : null),
        fecha_fin_calculada: row.clearSchedule ? null : undefined,
        override_manual: false,
        heredado_de_capitulo: false,
        itemDef: row.itemDef,
        rk: row.rk,
      }))
      const batchResult = await onGuardarBatchTramo(batchPayload, { allowOverwrite: true, skipReload: false })
      if (!batchResult?.ok) {
        throw new Error(`No se pudieron guardar ${batchResult?.errors || pending.length} duración(es) antes del CPM.`)
      }
      if (onReloadActividades) await onReloadActividades()
      return { saved: batchResult.saved, errors: 0, skipped: 0, batchOk: true }
    }
    if (pending.length === 0) {
      return { saved: 0, errors: 0, skipped: 0, batchOk: true }
    }
    const result = await flushAllDrafts()
    if (result.errors > 0) {
      throw new Error(`No se pudieron guardar ${result.errors} duración(es) antes del CPM.`)
    }
    if (tramoConsolidado && onReloadActividades) {
      await onReloadActividades()
    }
    return result
  }, [editable, snapshotDraftsForSave, collectDraftItems, flushAllDrafts, tramoConsolidado, onGuardarBatchTramo, onReloadActividades, capitulosOrdenados, ganttLayoutScope])

  const handleResetearPkProgramacion = () => {
    if (!editable || historicalReadOnly || !workingVersion?.id || !activePk) return
    if (panelBusy || localSaving || resettingPk) return
    setResetConfirmOpen(true)
  }

  const handleResetearTramoProgramacion = () => {
    if (!editable || historicalReadOnly || !workingVersion?.id || !tramoContext?.tramo) return
    if (panelBusy || localSaving || resettingPk) return
    setResetConfirmOpen(true)
  }

  const ejecutarResetearPkProgramacion = async () => {
    if (!editable || historicalReadOnly || !workingVersion?.id || !activePk) return
    setResetConfirmOpen(false)
    setResettingPk(true)
    try {
      const res = await fetch(
        `${API}/prog-obra/${cid}/versiones/${workingVersion.id}/pk/${encodeURIComponent(activePk)}/programacion`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (!res.ok) {
        let detail = `Error ${res.status}`
        try {
          const j = await res.json()
          detail = j?.detail || detail
        } catch {
          /* ignore */
        }
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
      }
      setRowDrafts({})
      preSaveDraftSnapshotRef.current = null
      setFinOverrides({})
      setGanttActOverlay(null)
      setCpmDirty(true)
      setSaveGeneration((g) => g + 1)
      showToast?.(`Programación del PK ${activePk} reseteada.`, 'ok')
      if (onReloadActividades) {
        await onReloadActividades(activePk)
      }
      if (onSaveSuccess) {
        await onSaveSuccess(activePk)
      }
    } catch (e) {
      console.error('[ProgObra] Resetear programación PK:', e)
      showToast?.(e?.message || 'Error al resetear programación del PK', 'err')
    } finally {
      setResettingPk(false)
    }
  }

  const ejecutarResetearTramoProgramacion = async () => {
    if (!editable || historicalReadOnly || !workingVersion?.id || !tramoContext?.tramo) return
    setResetConfirmOpen(false)
    setResettingPk(true)
    try {
      await clearTramoProgramacion(API, cid, token, workingVersion.id, {
        tramo: tramoContext.tramo,
        pkIds: tramoContext.pkIds,
      })
      setRowDrafts({})
      preSaveDraftSnapshotRef.current = null
      setFinOverrides({})
      setGanttActOverlay(null)
      setCpmResultados([])
      setCpmResumenOpen(false)
      setCpmDirty(true)
      onCpmUpdatedRef.current?.([])
      setSaveGeneration((g) => g + 1)
      const n = tramoContext.pkCount || tramoContext.pkIds?.length || 0
      showToast?.(`Programación del ${tramoContext.tramo} reseteada (${n} PK${n === 1 ? '' : 's'}).`, 'ok')
      if (onReloadActividades) await onReloadActividades()
      onScheduleRefresh?.()
    } catch (e) {
      console.error('[ProgObra] Resetear programación tramo:', e)
      showToast?.(e?.message || 'Error al resetear programación del tramo', 'err')
    } finally {
      setResettingPk(false)
    }
  }

  const handleGuardarClick = async () => {
    if (!editable) return
    if (localSaving) return
    if (panelBusy) {
      showToast?.('Espere a que termine la operación en curso.', 'err')
      return
    }
    setLocalSaving(true)
    const cpmSyncedBeforeSave = cpmResultados.length > 0 && !cpmDirty
    const prevCollapsed = collapsedCaps
    saveFlushInProgressRef.current = true
    try {
      snapshotDraftsForSave()
      flushSync(() => {
        setCollapsedCaps((s) => {
          const next = { ...s }
          for (const cap of capitulosOrdenados) {
            next[`${ganttLayoutScope}\u0000${cap}`] = false
          }
          return next
        })
      })
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await new Promise((r) => setTimeout(r, tramoConsolidado ? 80 : 80))
      const t0 = performance.now()
      const {
        saved,
        errors,
        skipped,
        batchOk,
        pkId,
        cpmDirty: cpmDirtyFromSave,
        allClears,
        batchMs,
      } = await flushAllDrafts({ preserveCpmSync: cpmSyncedBeforeSave })
      const flushMs = Math.round(performance.now() - t0)
      const hadRowsToSave = saved > 0 || errors > 0
      if (!hadRowsToSave && skipped > 0) {
        throw new Error('Ningún ítem tiene días hábiles o fecha de inicio válidos. Revise la tabla.')
      }
      if (!hadRowsToSave && skipped === 0) {
        showToast?.('No hay cambios pendientes para guardar.', 'info')
        return
      }
      if (errors > 0) {
        throw new Error(`No se pudieron guardar ${errors} ítem(s).`)
      }
      if (saved > 0) {
        const msLabel = batchMs != null ? ` (${Math.round(batchMs)} ms API)` : flushMs > 500 ? ` (${flushMs} ms)` : ''
        showToast?.(`Guardados ${saved} ítem(s).${msLabel}`, 'ok')
      }
      if (batchOk && !tramoConsolidado && onSaveSuccess) {
        await onSaveSuccess(pkId || activePk)
      } else if (saved > 0 && !tramoConsolidado) {
        await onGuardarCambios?.()
      }
      if (saved > 0 || batchOk) {
        setGanttActOverlay(null)
        setSaveGeneration((g) => g + 1)
        if (cpmSyncedBeforeSave) {
          setCpmDirty(cpmDirtyFromSave ?? false)
        } else {
          setCpmDirty(true)
        }
        if (tramoConsolidado) {
          if (allClears) {
            onTramoScheduleCleared?.()
          } else {
            void onReloadActividades?.(pkId || activePk, { silent: true })
          }
          onScheduleRefresh?.()
        } else {
          void syncGanttAfterSave(pkId || activePk)
          void onReloadActividades?.(pkId || activePk)
        }
      }
    } catch (e) {
      console.error('[ProgObra] Guardar cambios:', e)
      showToast?.(e?.message || 'Error al guardar cambios', 'err')
    } finally {
      preSaveDraftSnapshotRef.current = null
      saveFlushInProgressRef.current = false
      setCollapsedCaps(prevCollapsed)
      setLocalSaving(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: PROG_Z,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2vh 2vw',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '90vw',
          height: '85vh',
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: t.bgCard,
          borderRadius: 12,
          border: `1px solid ${t.border}`,
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          fontSize: 'var(--cc-sm)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${t.border}`, flexShrink: 0, gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--cc-md)', color: t.primary }}>
              Programación de obra{versionTitle ? ` — ${versionTitle}` : ''}
            </div>
            {tramoCriteriosLabel && (
              <div
                style={{
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: `1px solid ${t.border}`,
                  fontSize: 'var(--cc-caption)',
                  color: t.textMuted,
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={tramoCriteriosLabel}
              >
                <strong style={{ color: t.text }}>Criterios:</strong> {tramoCriteriosLabel}
              </div>
            )}
            {historicalReadOnly && (
              <div
                style={{
                  marginTop: 4,
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  background: '#f3f4f6',
                  color: '#4b5563',
                  border: `1px solid ${t.border}`,
                }}
              >
                Versión histórica — solo consulta
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: t.textMuted,
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        {workingVersion?.id && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 12,
              padding: '8px 16px',
              borderBottom: `1px solid ${t.border}`,
              flexShrink: 0,
              background: t.bg,
            }}
          >
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 600, color: t.textMuted }}>Cronograma versión</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-caption)' }}>
              <span style={{ color: t.textMuted }}>Inicio</span>
              <input
                type="date"
                value={versionFi}
                disabled={!editable || historicalReadOnly || horizonteSaving}
                onChange={(e) => setVersionFi(e.target.value)}
                onBlur={() => void saveVersionHorizonte(versionFi, versionFf)}
                style={{ padding: '4px 8px', fontSize: 'var(--cc-caption)', border: `1px solid ${t.border}`, borderRadius: 6, background: t.bgCard }}
              />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-caption)' }}>
              <span style={{ color: t.textMuted }}>Fin</span>
              <input
                type="date"
                value={versionFf}
                disabled={!editable || historicalReadOnly || horizonteSaving}
                onChange={(e) => setVersionFf(e.target.value)}
                onBlur={() => void saveVersionHorizonte(versionFi, versionFf)}
                style={{ padding: '4px 8px', fontSize: 'var(--cc-caption)', border: `1px solid ${t.border}`, borderRadius: 6, background: t.bgCard }}
              />
            </label>
            {horizonteSaving && (
              <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>Guardando…</span>
            )}
            {cpmAplicado && (
              <span style={{ fontSize: 'var(--cc-caption)', color: t.primary, fontWeight: 600 }}>
                Tabla sincronizada con CPM
              </span>
            )}
          </div>
        )}

        {cpmAplicado && desfaseHorizonteItems.length > 0 && (
          <ProgDesfaseHorizonteAlert items={desfaseHorizonteItems} versionFinIso={versionFf} t={t} />
        )}

        {!tramoConsolidado && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${t.border}`, flexShrink: 0, overflowX: 'auto' }}>
          {pkTabs.map((pk) => (
            <button
              key={pk}
              type="button"
              onClick={() => onSelectPk(pk)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: `1px solid ${activePk === pk ? t.primary : t.border}`,
                background: activePk === pk ? `${t.primary}22` : t.bg,
                color: activePk === pk ? t.primary : t.text,
                fontWeight: activePk === pk ? 700 : 500,
                fontSize: 'var(--cc-sm)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              PK {pk}
              {pkTabs.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemovePk(pk)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && onRemovePk(pk)}
                  style={{ marginLeft: 8, color: t.textMuted, fontWeight: 400 }}
                >
                  ×
                </span>
              )}
            </button>
          ))}
          <span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', padding: '0 8px' }}>+ Agregar PK (clic en el mapa)</span>
        </div>
        )}

        {/* Content tabs: Programación | Dependencias */}
        <div style={{ display: 'flex', gap: 0, padding: '0 16px', borderBottom: `1px solid ${t.border}`, flexShrink: 0, background: t.bg }}>
          {['programacion', 'dependencias'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveContentTab(tab)}
              style={{
                padding: '8px 16px',
                fontSize: 'var(--cc-sm)',
                fontWeight: activeContentTab === tab ? 700 : 400,
                color: activeContentTab === tab ? t.primary : t.textMuted,
                background: 'transparent',
                border: 'none',
                borderBottom: activeContentTab === tab ? `2px solid ${t.primary}` : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {tab === 'programacion' ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  Programación
                  {cpmDirty && (
                    <span style={{ fontSize: 'var(--cc-caption)', background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                      CPM desactualizado
                    </span>
                  )}
                </span>
              ) : (
                'Dependencias'
              )}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              padding: '12px 16px',
              display: activeContentTab === 'dependencias' ? 'block' : 'none',
            }}
          >
            <ProgObraDependencias
              cid={cid}
              token={token}
              API={API}
              t={t}
              versionId={workingVersion?.id}
              activePk={tramoConsolidado ? (tramoContext?.pkIds?.[0] || activePk) : activePk}
              allPkIds={tramoConsolidado ? (tramoContext?.pkIds || allPkIds) : allPkIds}
              capitulosOrigen={capitulosOrdenados}
              estructuraPorCapitulo={estructuraPorCapitulo}
              editable={editable}
              showToast={showToast}
              cpmDirty={cpmDirty}
              onCpmDirtyChange={setCpmDirty}
              tramoMode={tramoConsolidado}
              tramoLabel={tramoContext?.tramo ? `${tramoContext.tramo} (${tramoContext.pkCount || tramoContext.pkIds?.length || 0} PKs)` : null}
              tramoPkIds={tramoContext?.pkIds}
              deps={deps}
              setDeps={setDeps}
              depsLoaded={depsLoaded}
              cpmResultados={cpmResultados}
              setCpmResultados={setCpmResultados}
              estructuraByPk={depsEstructuraByPk}
              setEstructuraByPk={setDepsEstructuraByPk}
              onCpmCalculated={handleCpmCalculated}
              onBeforeCalcularCpm={flushDraftsBeforeCpm}
            />
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              display: activeContentTab === 'programacion' ? 'flex' : 'none',
              flexDirection: 'column',
            }}
          >
            <>
          {!tramoConsolidado && compareEnabled && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 16px',
                borderBottom: `1px solid ${t.border}`,
                flexShrink: 0,
                background: t.bg,
              }}
            >
              {[
                { id: 'schedule', label: 'Programación' },
                { id: 'compare', label: 'Comparar vs baseline' },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setProgSubTab(st.id)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 'var(--cc-caption)',
                    fontWeight: progSubTab === st.id ? 700 : 500,
                    color: progSubTab === st.id ? t.primary : t.textMuted,
                    background: progSubTab === st.id ? `${t.primary}18` : 'transparent',
                    border: `1px solid ${progSubTab === st.id ? t.primary : t.border}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  {st.label}
                </button>
              ))}
              {progSubTab === 'schedule' && compareData && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>Gantt:</span>
                  {[
                    { id: 'overlay', label: 'Overlay' },
                    { id: 'dual', label: 'Doble pista' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setGanttCompareMode(m.id)}
                      style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: ganttCompareMode === m.id ? 700 : 500,
                        color: ganttCompareMode === m.id ? t.primary : t.textMuted,
                        background: ganttCompareMode === m.id ? `${t.primary}18` : t.bg,
                        border: `1px solid ${ganttCompareMode === m.id ? t.primary : t.border}`,
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ marginLeft: 'auto' }}>
                <button
                  type="button"
                  onClick={() => setCpmResumenOpen(true)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 'var(--cc-caption)',
                    fontWeight: 600,
                    borderRadius: 6,
                    border: `1px solid ${t.border}`,
                    background: cpmResumenRows.length ? t.bgCard : t.bg,
                    color: cpmResumenRows.length ? t.text : t.textMuted,
                    cursor: 'pointer',
                  }}
                  title="Ver holguras y ruta crítica por agrupador"
                >
                  Resultados CPM
                  {cpmResumenRows.length > 0 && (
                    <span style={{ marginLeft: 6, color: t.primary }}>({cpmResumenRows.length})</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {!compareEnabled && progSubTab === 'schedule' && capitulosOrdenados.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 8,
                padding: '6px 16px',
                borderBottom: `1px solid ${t.border}`,
                flexShrink: 0,
                background: t.bg,
              }}
            >
              <button
                type="button"
                onClick={() => setCpmResumenOpen(true)}
                style={{
                  padding: '4px 10px',
                  fontSize: 'var(--cc-caption)',
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${t.border}`,
                  background: cpmResumenRows.length ? t.bgCard : t.bg,
                  color: cpmResumenRows.length ? t.text : t.textMuted,
                  cursor: 'pointer',
                }}
                title="Ver holguras y ruta crítica por agrupador"
              >
                Resultados CPM
                {cpmResumenRows.length > 0 && (
                  <span style={{ marginLeft: 6, color: t.primary }}>({cpmResumenRows.length})</span>
                )}
              </button>
            </div>
          )}

          {progSubTab === 'compare' && compareEnabled ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {compareLoading && (
                <div style={{ padding: 12, color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
                  Cargando comparación…
                </div>
              )}
              {!compareLoading && compareData && (
                <ProgObraComparacionTable
                  nodos={compareData.nodos}
                  resumen={compareData.resumen}
                  t={t}
                  pkId={activePk}
                />
              )}
              {!compareLoading && !compareData && (
                <div style={{ padding: 12, color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
                  No hay datos de comparación disponibles.
                </div>
              )}
            </div>
          ) : (
            <>
          {(loadPpto || loadAct) && (
            <div style={{ color: t.textMuted, padding: '8px 16px', flexShrink: 0 }}>
              {tramoConsolidado ? 'Cargando estructura del tramo…' : 'Cargando datos del PK…'}
            </div>
          )}
          {!loadPpto && capitulosOrdenados.length === 0 && (
            <div style={{ color: t.textMuted, padding: '8px 16px' }}>
              {tramoConsolidado ? 'Sin agrupadores WBS en este tramo.' : 'Sin ítems de presupuesto para este PK.'}
            </div>
          )}
          {capitulosOrdenados.length > 0 && (
            <div
              ref={splitContainerRef}
              style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', overflow: 'hidden', position: 'relative' }}
            >
              <div
                style={{
                  width: `${panelSplitPct}%`,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  minWidth: 0,
                  alignSelf: 'stretch',
                  overflow: 'hidden',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <div
                  ref={leftScrollRef}
                  onScroll={handleLeftScroll}
                  style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 8px 8px' }}
                >
                  <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${t.border}`, height: TABLE_HEAD_H }}>
                        {[
                          { h: 'Ítem', w: STICKY_W.item, left: 0, zi: 22 },
                          { h: 'Descripción', w: STICKY_W.desc, left: STICKY_W.item, zi: 23 },
                          { h: 'Und', w: SCROLL_COL_W.und },
                          { h: 'Cantidad', w: SCROLL_COL_W.cant, right: true },
                          { h: 'Costo Directo', w: SCROLL_COL_W.costo, right: true },
                          { h: 'Fecha inicio', w: SCROLL_COL_W.fechaIni },
                          { h: 'Días hábiles', w: SCROLL_COL_W.dias, right: true },
                          { h: 'Fecha fin', w: SCROLL_COL_W.fechaFin },
                          { h: '', w: SCROLL_COL_W.save },
                        ].map(({ h, w, left, zi, right }) => (
                          <th
                            key={h || 'save'}
                            style={{
                              padding: '0 10px',
                              height: TABLE_HEAD_H,
                              boxSizing: 'border-box',
                              fontSize: 'var(--cc-caption)',
                              fontWeight: 700,
                              color: t.textMuted,
                              textAlign: right ? 'right' : 'left',
                              verticalAlign: 'middle',
                              width: w,
                              minWidth: w,
                              maxWidth: w,
                              background: t.bg,
                              ...(left != null
                                ? stickyHeadTh(left, w, zi, t.bg)
                                : { position: 'sticky', top: 0, zIndex: 10 }),
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                    {capitulosOrdenados.map((cap, capIdx) => {
                      const scope = tramoConsolidado ? 'tramo' : (activePk || '')
                      const capKey = `${scope}\u0000${cap}`
                      const items = itemsPorCapitulo(cap)
                      const collapsed = !!collapsedCaps[capKey]
                      return (
                        <ProgCapituloSection
                          key={cap}
                          cap={cap}
                          capIdx={capIdx}
                          estructuraCap={estructuraPorCapitulo?.[cap]}
                          items={items}
                          actMap={ganttActMap}
                          actividadKey={actividadKey}
                          itemRowKey={itemRowKey}
                          agrupadorActItem={agrupadorActItem}
                          agrupadorRowKey={agrupadorRowKey}
                          collapsed={collapsed}
                          onToggleCollapse={() => toggleCap(cap)}
                          capResumen={capResumenes[cap]}
                          editable={editable}
                          t={t}
                          cid={cid}
                          token={token}
                          API={API}
                          rowSaveStatus={rowSaveStatus}
                          onGuardarItem={onGuardarItem}
                          onGuardarBatchTramo={onGuardarBatchTramo}
                          registerRowDraft={registerRowDraft}
                          unregisterRowDraft={unregisterRowDraft}
                          finOverrides={finOverrides}
                          isAgExpanded={(agId) => isAgExpanded(cap, agId)}
                          onToggleAgExpand={(agId) => toggleAgExpand(cap, agId)}
                          saveGeneration={saveGeneration}
                          suspendAutoSave={localSaving}
                          puedeEditarListadoPrecios={puedeEditarListadoPrecios}
                          onIrListadoPrecios={onIrListadoPrecios}
                          tramoConsolidado={tramoConsolidado}
                          resolveCpmForAg={resolveCpmForAg}
                          cpmAplicado={cpmAplicado}
                          versionFinIso={versionFf || null}
                          noHabilesSet={noHabilesSet}
                        />
                      )
                    })}
                  </tbody>
                </table>
                </div>
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={Math.round(panelSplitPct)}
                aria-valuemin={PANEL_SPLIT_MIN}
                aria-valuemax={PANEL_SPLIT_MAX}
                title="Arrastre para ajustar paneles · doble clic para restablecer"
                onMouseDown={handleSplitMouseDown}
                onDoubleClick={handleSplitDoubleClick}
                style={{
                  width: 6,
                  flexShrink: 0,
                  cursor: 'ew-resize',
                  alignSelf: 'stretch',
                  position: 'relative',
                  zIndex: 5,
                  background: splitDragging ? `${t.primary}33` : 'transparent',
                  borderLeft: `1px solid ${splitDragging ? t.primary : t.border}`,
                  borderRight: `1px solid ${splitDragging ? t.primary : t.border}`,
                  transition: splitDragging ? 'none' : 'background 0.15s, border-color 0.15s',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 4,
                    height: 36,
                    borderRadius: 4,
                    background: splitDragging ? t.primary : t.border,
                    opacity: splitDragging ? 1 : 0.85,
                    boxShadow: splitDragging ? `0 0 0 2px ${t.primary}22` : 'none',
                  }}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: 'stretch',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <ProgPkGanttPanel
                  model={pkGanttModelExtended}
                  noHabilesSet={noHabilesSet}
                  t={t}
                  activePk={tramoConsolidado ? (tramoContext?.pkIds?.[0] || activePk) : activePk}
                  tramoConsolidado={tramoConsolidado}
                  cpmByNodeKey={cpmByNodeKey}
                  tramoCpmByAgId={tramoConsolidado ? tramoCpmByAgId : null}
                  tramoCpmByCapAg={tramoConsolidado ? tramoCpmByCapAg : null}
                  tramoPkIds={tramoConsolidado ? (tramoContext?.pkIds || []) : null}
                  bodyScrollRef={rightBodyScrollRef}
                  onBodyScroll={handleRightBodyScroll}
                  onRefresh={refreshPkGantt}
                  compareByKey={compareByKey}
                  ganttCompareMode={ganttCompareMode}
                  showCompare={!tramoConsolidado && compareEnabled && !!compareData}
                  versionFinIso={versionFf || null}
                />
                {cpmResumenOpen && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 30,
                    background: 'rgba(0,0,0,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                  }}
                  onClick={() => setCpmResumenOpen(false)}
                >
                  <div
                    style={{
                      background: t.bgCard,
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                      width: 'min(720px, 100%)',
                      maxHeight: '85%',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ProgCpmResumenTable
                      rows={cpmResumenRows}
                      t={t}
                      variant="popup"
                      onClose={() => setCpmResumenOpen(false)}
                      versionFinIso={versionFf || null}
                      noHabilesSet={noHabilesSet}
                    />
                  </div>
                </div>
                )}
              </div>
            </div>
          )}
            </>
          )}
            </>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderTop: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editable && (
            <ProgModalIconBtn
              title={localSaving ? 'Guardando…' : 'Guardar cambios'}
              disabled={panelBusy || localSaving || resettingPk}
              onClick={() => void handleGuardarClick()}
              color={t.text}
              borderColor={t.border}
            >
              <Save size={20} aria-hidden />
            </ProgModalIconBtn>
            )}
            {editable && !historicalReadOnly && !tramoConsolidado && (
              <ProgModalIconBtn
                title={resettingPk ? 'Reseteando…' : 'Resetear programación de este PK'}
                disabled={panelBusy || localSaving || resettingPk}
                onClick={handleResetearPkProgramacion}
                color="#b91c1c"
                borderColor="#fca5a5"
              >
                <RotateCcw size={20} aria-hidden />
              </ProgModalIconBtn>
            )}
            {editable && !historicalReadOnly && tramoConsolidado && (
              <ProgModalIconBtn
                title={resettingPk ? 'Reseteando…' : 'Resetear programación del tramo'}
                disabled={panelBusy || localSaving || resettingPk}
                onClick={handleResetearTramoProgramacion}
                color="#b91c1c"
                borderColor="#fca5a5"
              >
                <RotateCcw size={20} aria-hidden />
              </ProgModalIconBtn>
            )}
          </div>
        </div>
      </div>
      {resetConfirmOpen && (
        <CcConfirmModal
          theme={t}
          zIndex={PROG_Z + 10}
          titulo={tramoConsolidado ? 'Resetear programación del tramo' : 'Resetear programación'}
          tipo="danger"
          confirmar={tramoConsolidado ? 'Resetear tramo' : 'Resetear PK'}
          cancelar="Cancelar"
          onCancel={() => setResetConfirmOpen(false)}
          onConfirm={() =>
            void (tramoConsolidado ? ejecutarResetearTramoProgramacion() : ejecutarResetearPkProgramacion())
          }
        >
          {tramoConsolidado ? (
            <p style={{ margin: 0 }}>
              Se borrarán todas las fechas y actividades de los{' '}
              <strong>
                {tramoContext?.pkCount || tramoContext?.pkIds?.length || 0} PK
                {(tramoContext?.pkCount || tramoContext?.pkIds?.length || 0) === 1 ? '' : 's'}
              </strong>{' '}
              del <strong>{tramoContext?.tramo}</strong>. Esta acción no se puede deshacer.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              Se borrarán todas las fechas y actividades guardadas del PK{' '}
              <strong>{activePk}</strong>. Esta acción no se puede deshacer.
            </p>
          )}
        </CcConfirmModal>
      )}
    </div>,
    document.body,
  )
}
