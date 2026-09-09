import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { tFrom, isDarkMode } from '../../theme/adminPanelTheme'
import { fmtMoneda } from './subcontratistasDocsHelpers'
import { bulkUpsertPreciosSub, fetchItemsCobroAsignados } from './subcontratistasItemsCobroApi'
import { subcontratistasSheetCssVars, subcontratistasSheetStyles, subUi } from './subcontratistasSheetStyles'

/**
 * Modal «Agregar Ítem de Cobro»: hoja Excel con ítems/cantidades
 * asignados al subcontratista desde Presupuesto.
 */
export default function ItemCobroAsignadosModal({
  open,
  onClose,
  theme,
  token,
  subId,
  razonSocial,
  canEdit = true,
  onSaved,
  onMsg,
}) {
  const tTok = tFrom(theme)
  const ui = subcontratistasSheetStyles(tTok)
  const S = subUi(theme, tTok)
  const cssVars = subcontratistasSheetCssVars(tTok)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([])
  const [drafts, setDrafts] = useState({}) // listado_precio_id → string
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    if (!open || !subId) return undefined
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setAviso('')
      try {
        const data = await fetchItemsCobroAsignados(subId, token)
        if (cancelled) return
        const items = Array.isArray(data?.items) ? data.items : []
        setRows(items)
        const next = {}
        for (const it of items) {
          const id = String(it.listado_precio_id)
          next[id] = it.vu_costo_mo != null && it.vu_costo_mo !== ''
            ? String(it.vu_costo_mo)
            : ''
        }
        setDrafts(next)
        if (data?.aviso) setAviso(String(data.aviso))
      } catch (e) {
        if (!cancelled) {
          setRows([])
          setDrafts({})
          onMsg?.({ type: 'error', text: e.message || 'No se pudieron cargar las cantidades asignadas.' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, subId, token, onMsg])

  const itemsToSave = useMemo(() => {
    const out = []
    for (const r of rows) {
      const key = String(r.listado_precio_id)
      const raw = String(drafts[key] ?? '').trim()
      if (raw === '') continue
      const n = Number(raw.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) continue
      out.push({ listado_precio_id: Number(r.listado_precio_id), precio_unitario_sub: n })
    }
    return out
  }, [rows, drafts])

  const invalidDraft = useMemo(() => {
    for (const r of rows) {
      const key = String(r.listado_precio_id)
      const raw = String(drafts[key] ?? '').trim()
      if (raw === '') continue
      const n = Number(raw.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) return true
    }
    return false
  }, [rows, drafts])

  if (!open) return null

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 10002,
    background: isDarkMode(theme) ? 'rgba(8, 19, 24, 0.78)' : 'rgba(15, 23, 42, 0.48)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const modalStyle = {
    width: 'min(1100px, 98vw)',
    maxHeight: '94vh',
    background: tTok.bgCard,
    borderRadius: 14,
    border: `1px solid ${tTok.border}`,
    boxShadow: tTok.shadow || '0 28px 72px rgba(0,0,0,0.35)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...cssVars,
    fontSize: 'var(--cc-sm)',
    color: 'var(--cc-text)',
    fontFamily: 'inherit',
  }

  const guardar = async () => {
    if (!canEdit) return
    if (invalidDraft) {
      onMsg?.({ type: 'error', text: 'Hay valores de VU Costo M.O. inválidos.' })
      return
    }
    if (!itemsToSave.length) {
      onMsg?.({ type: 'error', text: 'Indique al menos un VU Costo M.O. para guardar.' })
      return
    }
    setSaving(true)
    try {
      const res = await bulkUpsertPreciosSub(subId, itemsToSave, token)
      onMsg?.({
        type: 'success',
        text: `Precios guardados (${res?.insertados || 0} nuevos, ${res?.actualizados || 0} actualizados).`,
      })
      onSaved?.()
      onClose?.()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudieron guardar los precios.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <CcModalBrandHeader theme={theme} />
        <div style={{
          padding: '12px 20px 10px',
          borderBottom: `1px solid ${tTok.border}`,
          background: tTok.headerBg || tTok.bgCard,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
        >
          <div>
            <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 700, color: tTok.text }}>
              Agregar Ítem de Cobro
            </div>
            <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, marginTop: 2 }}>
              Subcontratista: {razonSocial || '—'} · Solo ítems con cantidad asignada en Presupuesto
            </div>
          </div>
          <button type="button" style={S.closeBtn} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '14px 20px',
          background: isDarkMode(theme) ? tTok.bg : tTok.inputBg,
          color: tTok.text,
          fontSize: 'var(--cc-sm)',
        }}
        >
          {loading ? (
            <div style={{ color: tTok.textMuted, padding: 24, textAlign: 'center' }}>Cargando asignaciones…</div>
          ) : rows.length === 0 ? (
            <div style={S.empty}>
              {aviso || 'No hay ítems con cantidad asignada a este subcontratista en Presupuesto.'}
            </div>
          ) : (
            <>
              <p style={{
                margin: '0 0 12px',
                fontSize: 'var(--cc-caption)',
                color: tTok.textMuted,
                lineHeight: 1.45,
              }}
              >
                VU Cobro es el valor de referencia del listado del contrato (solo lectura).
                Diligencie VU Costo M.O. (valor pactado) en cada fila y guarde en una sola acción.
              </p>
              <div style={{ ...ui.sheetWrap, maxHeight: 'min(560px, 62vh)' }}>
                <table style={ui.sheetTable}>
                  <colgroup>
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '34%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '18%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {['Ítem', 'Descripción', 'Und', 'Cantidad', 'VU Cobro', 'VU Costo M.O.'].map((h) => (
                        <th key={h} style={ui.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const key = String(r.listado_precio_id)
                      return (
                        <tr key={key}>
                          <td style={{ ...ui.td, fontWeight: 700, color: tTok.primary }}>{r.item_numero || '—'}</td>
                          <td style={ui.td}>{r.descripcion || '—'}</td>
                          <td style={{ ...ui.td, color: tTok.textMuted }}>{r.unidad || '—'}</td>
                          <td style={{ ...ui.td, textAlign: 'right', fontWeight: 600 }}>
                            {Number(r.cantidad || 0).toLocaleString('es-CO', { maximumFractionDigits: 4 })}
                          </td>
                          <td style={{ ...ui.td, textAlign: 'right', color: tTok.textMuted }}>
                            {fmtMoneda(r.vu_cobro)}
                          </td>
                          <td style={ui.td}>
                            <input
                              style={{
                                ...ui.cellInp,
                                textAlign: 'right',
                                background: canEdit ? (tTok.inputBg || 'transparent') : 'transparent',
                              }}
                              type="number"
                              min="0"
                              step="any"
                              disabled={!canEdit || saving}
                              value={drafts[key] ?? ''}
                              placeholder="0"
                              onChange={(e) => {
                                const v = e.target.value
                                setDrafts((prev) => ({ ...prev, [key]: v }))
                              }}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div style={{
          padding: '10px 20px',
          borderTop: `1px solid ${tTok.border}`,
          background: tTok.headerBg || tTok.bgCard,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
        }}
        >
          <button type="button" style={S.btn('ghost')} onClick={onClose} disabled={saving}>Cancelar</button>
          {canEdit && (
            <button
              type="button"
              style={S.btn('primary')}
              onClick={guardar}
              disabled={saving || loading || !rows.length || invalidDraft || !itemsToSave.length}
            >
              {saving ? 'Guardando…' : `Guardar precios (${itemsToSave.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
