import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import {
  EMPTY_IMPUESTO,
  computeValorDespuesAiuIva,
  etiquetaTributos,
  impuestoTieneDatos,
  tributosPayloadDesdeForm,
} from '../../admin/catalogoInsumosTributos'
import { fmtMoneda } from './subcontratistasDocsHelpers'
import PreciosAiuIvaModal from './PreciosAiuIvaModal'
import {
  bulkUpsertPreciosSub,
  deletePrecioSub,
  fetchItemsCobroAsignados,
  upsertTributosSub,
} from './subcontratistasItemsCobroApi'
import {
  buildBulkPayload,
  filterListadoItems,
  hasInvalidDrafts,
  impuestoFromTributos,
  isDraftIncomplete,
  parseNum,
  rowKey,
  uniqueCapitulos,
} from './preciosSubcontratistaSheetHelpers'
import { subcontratistasSheetStyles, subUi } from './subcontratistasSheetStyles'
import { tFrom } from '../../theme/adminPanelTheme'

/**
 * Tab Precios — tabla unificada (Presupuesto + agregados manuales).
 * AIU/IVA es único a nivel del subcontratista y recalcula «Con AIU/IVA» en todas las filas.
 */
export default function PreciosSubcontratistaSheet({
  theme,
  token,
  subId,
  contratoId,
  canEdit = true,
  onMsg,
}) {
  const tTok = tFrom(theme)
  const ui = subcontratistasSheetStyles(tTok)
  const S = subUi(theme, tTok)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([])
  const [drafts, setDrafts] = useState({})
  const [aviso, setAviso] = useState('')
  const [listado, setListado] = useState([])
  const [listadoLoading, setListadoLoading] = useState(false)
  const [acOpenKey, setAcOpenKey] = useState(null)
  const [acQuery, setAcQuery] = useState('')
  const [impuestoGlobal, setImpuestoGlobal] = useState({ ...EMPTY_IMPUESTO })
  const [aiuOpen, setAiuOpen] = useState(false)
  const wrapRef = useRef(null)

  const loadSheet = useCallback(async () => {
    if (!subId) return
    setLoading(true)
    setAviso('')
    try {
      const data = await fetchItemsCobroAsignados(subId, token)
      const items = Array.isArray(data?.items) ? data.items : []
      setRows(items)
      const next = {}
      for (const it of items) {
        const key = rowKey(it)
        next[key] = {
          vu_costo: it.vu_costo_mo != null && it.vu_costo_mo !== '' ? String(it.vu_costo_mo) : '',
          cantidad: it.cantidad != null && it.cantidad !== '' ? String(it.cantidad) : '',
        }
      }
      setDrafts(next)
      setImpuestoGlobal(impuestoFromTributos(data?.tributos))
      if (data?.aviso) setAviso(String(data.aviso))
    } catch (e) {
      setRows([])
      setDrafts({})
      setImpuestoGlobal({ ...EMPTY_IMPUESTO })
      onMsg?.({ type: 'error', text: e.message || 'No se pudo cargar la hoja de precios.' })
    } finally {
      setLoading(false)
    }
  }, [subId, token, onMsg])

  const loadListado = useCallback(async () => {
    if (!contratoId || !token) return
    setListadoLoading(true)
    try {
      const res = await fetch(`${API_BASE}/listado-precios/${contratoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      setListado(Array.isArray(data) ? data : [])
    } catch {
      setListado([])
    } finally {
      setListadoLoading(false)
    }
  }, [contratoId, token])

  useEffect(() => { loadSheet() }, [loadSheet])
  useEffect(() => { loadListado() }, [loadListado])

  useEffect(() => {
    const onDoc = (ev) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(ev.target)) setAcOpenKey(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const usedLpIds = useMemo(
    () => rows.map((r) => Number(r.listado_precio_id)).filter((n) => Number.isFinite(n) && n > 0),
    [rows],
  )
  const capitulos = useMemo(() => uniqueCapitulos(listado), [listado])
  const payload = useMemo(() => buildBulkPayload(rows, drafts), [rows, drafts])
  const invalid = useMemo(() => hasInvalidDrafts(rows, drafts), [rows, drafts])
  const tributosResumen = useMemo(
    () => etiquetaTributos(tributosPayloadDesdeForm(impuestoGlobal || EMPTY_IMPUESTO)),
    [impuestoGlobal],
  )

  const setDraftField = (key, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value },
    }))
  }

  const agregarItem = () => {
    if (!canEdit) return
    const draftKey = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const row = {
      _draftKey: draftKey,
      _isDraft: true,
      origen: 'manual',
      cantidad_editable: true,
      listado_precio_id: null,
      precio_id: null,
      capitulo: '',
      competencia: '',
      item_numero: '',
      descripcion: '',
      unidad: '',
      cantidad: null,
      vu_cobro: null,
      vu_costo_mo: null,
    }
    setRows((prev) => [...prev, row])
    setDrafts((prev) => ({
      ...prev,
      [draftKey]: { vu_costo: '', cantidad: '', query: '' },
    }))
    setAcOpenKey(draftKey)
    setAcQuery('')
  }

  const cancelDraft = (key) => {
    setRows((prev) => prev.filter((r) => rowKey(r) !== key))
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    if (acOpenKey === key) setAcOpenKey(null)
  }

  const pickListadoItem = (row, item) => {
    const key = rowKey(row)
    const lpId = Number(item.id)
    if (usedLpIds.includes(lpId) && Number(row.listado_precio_id) !== lpId) {
      onMsg?.({ type: 'error', text: 'Ese ítem ya está en la hoja de precios de este subcontratista.' })
      return
    }
    setRows((prev) => prev.map((r) => {
      if (rowKey(r) !== key) return r
      return {
        ...r,
        listado_precio_id: lpId,
        capitulo: item.capitulo || '',
        competencia: item.competencia || '',
        item_numero: item.item_numero || '',
        descripcion: item.descripcion || '',
        unidad: item.unidad || item.und || '',
        vu_cobro: item.precio_unitario != null ? Number(item.precio_unitario) : null,
      }
    }))
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        query: `${item.item_numero || ''} — ${(item.descripcion || '').slice(0, 60)}`,
      },
    }))
    setAcOpenKey(null)
  }

  const setCapituloDraft = (row, capitulo) => {
    const key = rowKey(row)
    setRows((prev) => prev.map((r) => {
      if (rowKey(r) !== key) return r
      return {
        ...r,
        capitulo,
        listado_precio_id: null,
        item_numero: '',
        descripcion: '',
        unidad: '',
        competencia: '',
        vu_cobro: null,
      }
    }))
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        query: '',
        vu_costo: prev[key]?.vu_costo || '',
        cantidad: prev[key]?.cantidad || '',
      },
    }))
    setAcOpenKey(key)
    setAcQuery('')
  }

  const guardar = async () => {
    if (!canEdit) return
    if (invalid) {
      onMsg?.({ type: 'error', text: 'Hay valores inválidos en Cantidad o VU Costo M.O.' })
      return
    }
    const incompleteDrafts = rows.filter((r) => r._isDraft && isDraftIncomplete(r, drafts[rowKey(r)]))
    if (incompleteDrafts.length) {
      onMsg?.({ type: 'error', text: 'Complete capítulo, ítem, cantidad y VU Costo en las filas nuevas.' })
      return
    }
    if (!payload.length) {
      onMsg?.({ type: 'error', text: 'Indique al menos un VU Costo M.O. para guardar.' })
      return
    }
    setSaving(true)
    try {
      const res = await bulkUpsertPreciosSub(subId, payload, token)
      onMsg?.({
        type: 'success',
        text: `Precios guardados (${res?.insertados || 0} nuevos, ${res?.actualizados || 0} actualizados).`,
      })
      await loadSheet()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudieron guardar los precios.' })
    } finally {
      setSaving(false)
    }
  }

  const guardarAiuGlobal = async (impuesto) => {
    if (!canEdit) return
    setSaving(true)
    try {
      const tributos = tributosPayloadDesdeForm(impuesto || EMPTY_IMPUESTO)
      const res = await upsertTributosSub(subId, tributos, token)
      setImpuestoGlobal(impuestoFromTributos(res?.tributos || tributos))
      setAiuOpen(false)
      onMsg?.({ type: 'success', text: 'AIU/IVA del subcontratista guardado. Se aplica a todos los ítems.' })
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudo guardar el AIU/IVA.' })
    } finally {
      setSaving(false)
    }
  }

  const eliminarManual = async (row) => {
    if (!canEdit) return
    const key = rowKey(row)
    if (row._isDraft || !row.precio_id) {
      cancelDraft(key)
      return
    }
    if (!window.confirm('¿Eliminar este ítem agregado manualmente?')) return
    setSaving(true)
    try {
      await deletePrecioSub(row.precio_id, token)
      onMsg?.({ type: 'success', text: 'Ítem manual eliminado.' })
      await loadSheet()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudo eliminar el ítem.' })
    } finally {
      setSaving(false)
    }
  }

  const fmtCant = (v) => {
    if (v == null || v === '') return '—'
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    return n.toLocaleString('es-CO', { maximumFractionDigits: 4 })
  }

  return (
    <div ref={wrapRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{
            fontSize: 'var(--cc-caption)',
            color: tTok.primary,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
          >
            Ítems de Cobro
          </div>
          <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, lineHeight: 1.4 }}>
            VU Costo M.O. es el valor antes de AIU/IVA. El desglose A·Í·U·IVA es único para este subcontratista.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && (
            <button
              type="button"
              style={S.btn('primary', true)}
              onClick={agregarItem}
              disabled={saving || loading || listadoLoading}
            >
              + Agregar Ítem
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              style={S.btn('ghost', true)}
              onClick={guardar}
              disabled={saving || loading || invalid || !payload.length}
            >
              {saving ? 'Guardando…' : `Guardar (${payload.length})`}
            </button>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 12,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${tTok.border}`,
        background: tTok.inputBg || tTok.bgCard,
      }}
      >
        <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: tTok.textMuted }}>
          AIU / IVA (global)
        </span>
        <button
          type="button"
          disabled={!canEdit || saving || loading}
          title="Desglose único: Administración, Imprevistos, Utilidad e IVA"
          onClick={() => setAiuOpen(true)}
          style={{
            ...S.btn('ghost', true),
            padding: '4px 10px',
            minHeight: 30,
            fontWeight: 700,
            borderColor: impuestoTieneDatos(impuestoGlobal) ? tTok.primary : tTok.border,
            color: impuestoTieneDatos(impuestoGlobal) ? tTok.primary : tTok.text,
          }}
        >
          {impuestoTieneDatos(impuestoGlobal) ? 'A · Í · U · IVA ✓' : 'A · Í · U · IVA'}
        </button>
        <span style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, overflowWrap: 'anywhere' }}>
          {tributosResumen === '—' ? 'Sin desglose. Se aplica a todos los ítems.' : tributosResumen}
        </span>
      </div>

      {loading ? (
        <div style={{ color: tTok.textMuted, fontSize: 'var(--cc-sm)', padding: 16 }}>Cargando hoja de precios…</div>
      ) : rows.length === 0 ? (
        <div style={S.empty}>
          {aviso || 'No hay ítems asignados desde Presupuesto ni agregados manualmente.'}
          {canEdit && (
            <div style={{ marginTop: 10 }}>
              Use <strong>+ Agregar Ítem</strong> para incorporar actividades no previstas.
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...ui.sheetWrap, maxHeight: 'min(560px, 58vh)' }}>
          <table style={ui.sheetTable}>
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '28%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr>
                {['Ítem', 'Descripción', 'Und', 'Cantidad', 'VU Cobro', 'VU Costo M.O.', 'Con AIU/IVA'].map((h) => (
                  <th key={h} style={ui.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = rowKey(r)
                const d = drafts[key] || {}
                const isManual = String(r.origen || '').toLowerCase() === 'manual' || r._isDraft
                const cantEditable = !!r.cantidad_editable || !!r._isDraft
                const suggestions = (r._isDraft && acOpenKey === key)
                  ? filterListadoItems(listado, {
                    capitulo: r.capitulo,
                    query: acQuery || d.query || '',
                    excludeLpIds: usedLpIds.filter((id) => id !== Number(r.listado_precio_id)),
                  })
                  : []
                const vuBase = parseNum(d.vu_costo) ?? r.vu_costo_mo ?? 0

                return (
                  <tr key={key}>
                    <td style={{ ...ui.td, fontWeight: 700, color: tTok.primary, position: 'relative' }}>
                      {r._isDraft ? (
                        <div>
                          <select
                            style={{ ...ui.cellSelect, fontWeight: 600 }}
                            value={r.capitulo || ''}
                            disabled={saving}
                            onChange={(e) => setCapituloDraft(r, e.target.value)}
                            title="Capítulo"
                          >
                            <option value="">Capítulo…</option>
                            {capitulos.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          {r.item_numero ? (
                            <div style={{ marginTop: 2, fontSize: 'var(--cc-caption)' }}>{r.item_numero}</div>
                          ) : null}
                        </div>
                      ) : (
                        <div>
                          {r.item_numero || '—'}
                          {canEdit && isManual && (
                            <button
                              type="button"
                              style={{
                                display: 'block',
                                marginTop: 2,
                                border: 'none',
                                background: 'transparent',
                                color: tTok.danger || '#dc2626',
                                cursor: 'pointer',
                                fontSize: 'var(--cc-sm)',
                                lineHeight: 1.3,
                                fontWeight: 700,
                                padding: 0,
                                fontFamily: 'inherit',
                              }}
                              disabled={saving}
                              onClick={() => eliminarManual(r)}
                              title={r._isDraft ? 'Descartar fila' : 'Eliminar ítem manual'}
                            >
                              {r._isDraft ? 'Descartar' : 'Eliminar'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ ...ui.td, position: 'relative' }}>
                      {r._isDraft ? (
                        <div style={{ position: 'relative' }}>
                          {!r.listado_precio_id && (
                            <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, marginBottom: 2 }}>
                              Ítem / descripción
                            </div>
                          )}
                          <input
                            style={ui.cellInp}
                            disabled={saving || !r.capitulo}
                            placeholder={r.capitulo ? 'Buscar ítem…' : 'Elija capítulo primero'}
                            value={r.listado_precio_id
                              ? `${r.item_numero || ''} — ${r.descripcion || ''}`
                              : (acOpenKey === key ? acQuery : (d.query || ''))}
                            onFocus={() => {
                              setAcOpenKey(key)
                              setAcQuery(r.listado_precio_id ? '' : (d.query || ''))
                            }}
                            onChange={(e) => {
                              const v = e.target.value
                              setAcQuery(v)
                              setAcOpenKey(key)
                              if (r.listado_precio_id) {
                                setRows((prev) => prev.map((x) => (
                                  rowKey(x) === key
                                    ? {
                                      ...x,
                                      listado_precio_id: null,
                                      item_numero: '',
                                      descripcion: '',
                                      unidad: '',
                                      vu_cobro: null,
                                    }
                                    : x
                                )))
                              }
                              setDraftField(key, 'query', v)
                            }}
                          />
                          {suggestions.length > 0 && (
                            <div style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              top: '100%',
                              zIndex: 20,
                              maxHeight: 180,
                              overflow: 'auto',
                              background: tTok.bgCard,
                              border: `1px solid ${tTok.border}`,
                              boxShadow: tTok.shadow || '0 8px 24px rgba(0,0,0,0.18)',
                            }}
                            >
                              {suggestions.map((sug) => (
                                <button
                                  key={sug.id}
                                  type="button"
                                  style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '6px 8px',
                                    cursor: 'pointer',
                                    color: tTok.text,
                                    fontSize: 'var(--cc-caption)',
                                    fontFamily: 'inherit',
                                  }}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => pickListadoItem(r, sug)}
                                >
                                  <strong style={{ color: tTok.primary }}>{sug.item_numero}</strong>
                                  {' — '}
                                  {(sug.descripcion || '').slice(0, 80)}
                                </button>
                              ))}
                            </div>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              style={{
                                marginTop: 4,
                                border: 'none',
                                background: 'transparent',
                                color: tTok.danger || '#dc2626',
                                cursor: 'pointer',
                                fontSize: 'var(--cc-sm)',
                                lineHeight: 1.3,
                                fontWeight: 700,
                                padding: 0,
                                fontFamily: 'inherit',
                              }}
                              disabled={saving}
                              onClick={() => eliminarManual(r)}
                            >
                              Descartar
                            </button>
                          )}
                        </div>
                      ) : (
                        r.descripcion || '—'
                      )}
                    </td>
                    <td style={{ ...ui.td, color: tTok.textMuted }}>{r.unidad || '—'}</td>
                    <td style={{ ...ui.td, textAlign: 'right', fontWeight: 600 }}>
                      {cantEditable && canEdit ? (
                        <input
                          style={{ ...ui.cellInp, textAlign: 'right', background: tTok.inputBg || 'transparent' }}
                          type="number"
                          min="0"
                          step="any"
                          disabled={saving}
                          value={d.cantidad ?? ''}
                          placeholder="0"
                          onChange={(e) => setDraftField(key, 'cantidad', e.target.value)}
                        />
                      ) : (
                        fmtCant(r.cantidad)
                      )}
                    </td>
                    <td style={{ ...ui.td, textAlign: 'right', color: tTok.textMuted }}>
                      {fmtMoneda(r.vu_cobro)}
                    </td>
                    <td style={ui.td}>
                      {canEdit ? (
                        <input
                          style={{
                            ...ui.cellInp,
                            textAlign: 'right',
                            background: tTok.inputBg || 'transparent',
                          }}
                          type="number"
                          min="0"
                          step="any"
                          disabled={saving}
                          value={d.vu_costo ?? ''}
                          placeholder="Antes AIU"
                          title="Valor antes de AIU/IVA"
                          onChange={(e) => setDraftField(key, 'vu_costo', e.target.value)}
                        />
                      ) : (
                        <span style={{ display: 'block', textAlign: 'right', fontWeight: 700 }}>
                          {fmtMoneda(vuBase)}
                        </span>
                      )}
                    </td>
                    <td style={{ ...ui.td, textAlign: 'right', fontWeight: 700, color: 'var(--cc-color-success)' }}>
                      {fmtMoneda(
                        computeValorDespuesAiuIva(vuBase, impuestoGlobal || EMPTY_IMPUESTO, {
                          valoresEnDecimal: true,
                        }),
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <PreciosAiuIvaModal
        open={aiuOpen}
        theme={theme}
        title="AIU / IVA — Subcontratista"
        subtitle="Único desglose aplicable a todos los ítems de cobro."
        showVuBase={false}
        impuesto={impuestoGlobal}
        onClose={() => setAiuOpen(false)}
        onSave={guardarAiuGlobal}
      />
    </div>
  )
}
