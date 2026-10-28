import { useCallback, useEffect, useMemo, useState } from 'react'
import { pptoSheetStyles } from './pptoSheetStyles'
import {
  fmtCantTransporte,
  fmtPesoPct,
  repartirTransportePorPk,
} from './pptoTransporte'

function sheetInp(sheet, t, active) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${active ? (t.primary || sheet.primary) : sheet.border}`,
    borderRadius: 4,
    background: sheet.inputBg,
    color: sheet.text,
    fontSize: 'var(--cc-input)',
    padding: '6px 8px',
    minHeight: 32,
    fontFamily: 'inherit',
  }
}

/**
 * Reportar transporte — solo Obra Ejecutada.
 * Selección → preview proporcional → confirmar (o reemplazar/sumar si hay lote previo).
 */
export default function PptoReportarTransporteModal({
  open,
  theme,
  contratoId,
  token,
  apiBase,
  listadoPrecios = [],
  competenciasOpciones = [],
  onClose,
  onDone,
}) {
  const t = theme || {}
  const sheet = pptoSheetStyles(t)
  const API = apiBase || ''

  const [capitulo, setCapitulo] = useState('')
  const [competencia, setCompetencia] = useState('')
  const [itemsOrigen, setItemsOrigen] = useState([])
  const [itemAdd, setItemAdd] = useState('')
  const [cantidadReportar, setCantidadReportar] = useState('')
  const [itemDestino, setItemDestino] = useState('')
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState('')
  const [alertaPrevio, setAlertaPrevio] = useState(null) // reporte_previo pendiente de decisión

  const capitulos = useMemo(() => {
    const set = new Set()
    for (const p of listadoPrecios || []) {
      const c = String(p?.capitulo || '').trim()
      if (c) set.add(c)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  }, [listadoPrecios])

  const itemsDelCapitulo = useMemo(() => {
    if (!capitulo) return []
    const map = new Map()
    for (const p of listadoPrecios || []) {
      if (String(p?.capitulo || '').trim() !== capitulo) continue
      const num = String(p?.item_numero || '').trim()
      if (!num || map.has(num)) continue
      map.set(num, p)
    }
    return [...map.values()].sort((a, b) =>
      String(a.item_numero).localeCompare(String(b.item_numero), 'es', { numeric: true }),
    )
  }, [listadoPrecios, capitulo])

  const itemsDestinoOpts = useMemo(() => {
    const map = new Map()
    for (const p of listadoPrecios || []) {
      const num = String(p?.item_numero || '').trim()
      if (!num || map.has(num)) continue
      map.set(num, p)
    }
    return [...map.values()].sort((a, b) =>
      String(a.item_numero).localeCompare(String(b.item_numero), 'es', { numeric: true }),
    )
  }, [listadoPrecios])

  const reset = useCallback(() => {
    setCapitulo('')
    setCompetencia('')
    setItemsOrigen([])
    setItemAdd('')
    setCantidadReportar('')
    setItemDestino('')
    setPreview(null)
    setError('')
    setAlertaPrevio(null)
    setConfirmando(false)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  useEffect(() => {
    setItemsOrigen([])
    setItemAdd('')
    setPreview(null)
    setAlertaPrevio(null)
  }, [capitulo])

  const addItemOrigen = () => {
    const v = String(itemAdd || '').trim()
    if (!v) return
    setItemsOrigen((prev) => (prev.includes(v) ? prev : [...prev, v]))
    setItemAdd('')
  }

  const removeItemOrigen = (v) => {
    setItemsOrigen((prev) => prev.filter((x) => x !== v))
  }

  const fetchPreview = useCallback(async () => {
    if (!contratoId || !token || !capitulo || !itemsOrigen.length) {
      setPreview(null)
      return
    }
    setLoadingPreview(true)
    setError('')
    try {
      const qty = cantidadReportar === '' ? null : Number(cantidadReportar)
      const res = await fetch(`${API}/presupuesto/${contratoId}/transporte/preview`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          capitulo,
          competencia: competencia || '',
          items_origen: itemsOrigen,
          item_destino: itemDestino || null,
          cantidad_reportar: Number.isFinite(qty) ? qty : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `Error ${res.status}`)
      }
      setPreview(data)
    } catch (e) {
      setPreview(null)
      setError(e?.message || 'No se pudo calcular la vista previa.')
    } finally {
      setLoadingPreview(false)
    }
  }, [API, contratoId, token, capitulo, competencia, itemsOrigen, itemDestino, cantidadReportar])

  useEffect(() => {
    if (!open) return
    const tmr = setTimeout(() => { void fetchPreview() }, 280)
    return () => clearTimeout(tmr)
  }, [open, fetchPreview])

  const repartoLocal = useMemo(() => {
    if (!preview?.filas?.length) return null
    const qty = Number(cantidadReportar)
    if (!Number.isFinite(qty) || qty <= 0) return null
    return repartirTransportePorPk(preview.filas, qty)
  }, [preview, cantidadReportar])

  const reparto = preview?.reparto?.ok ? preview.reparto : repartoLocal
  const compactaCero = preview != null && !(Number(preview.total_compacta) > 0)
  const destinoOk = !!String(itemDestino || '').trim()
  const puedeConfirmar =
    !!reparto?.ok
    && !compactaCero
    && destinoOk
    && itemsOrigen.length > 0
    && !loadingPreview
    && !confirmando

  const ejecutarConfirmar = async (modo, lotePrevioId = null) => {
    setConfirmando(true)
    setError('')
    try {
      const res = await fetch(`${API}/presupuesto/${contratoId}/transporte/confirmar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          capitulo,
          competencia: competencia || '',
          items_origen: itemsOrigen,
          item_destino: itemDestino,
          cantidad_reportar: Number(cantidadReportar),
          modo,
          lote_previo_id: lotePrevioId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data?.detail?.code === 'reporte_existente') {
        setAlertaPrevio(data.detail.reporte_previo || data.detail)
        return
      }
      if (!res.ok) {
        const det = data?.detail
        const msg = typeof det === 'string'
          ? det
          : (det?.message || data?.message || `Error ${res.status}`)
        throw new Error(msg)
      }
      setAlertaPrevio(null)
      if (typeof onDone === 'function') {
        onDone({
          n: data.n_registros,
          cantidad: data.cantidad_asignada,
          loteId: data.lote_id,
        })
      }
      if (typeof onClose === 'function') onClose()
    } catch (e) {
      setError(e?.message || 'No se pudo confirmar el reporte.')
    } finally {
      setConfirmando(false)
    }
  }

  const onClickConfirmar = async () => {
    if (!puedeConfirmar) return
    // Si el preview ya trajo un previo, mostrar alerta antes de crear.
    if (preview?.reporte_previo) {
      setAlertaPrevio(preview.reporte_previo)
      return
    }
    await ejecutarConfirmar('create')
  }

  if (!open) return null

  const btnPrimary = {
    border: 'none',
    borderRadius: 6,
    padding: '8px 14px',
    fontWeight: 700,
    cursor: puedeConfirmar ? 'pointer' : 'not-allowed',
    background: puedeConfirmar ? (t.primary || '#2563EB') : '#94a3b8',
    color: '#fff',
    opacity: confirmando ? 0.7 : 1,
  }
  const btnSec = {
    border: `1px solid ${sheet.border}`,
    borderRadius: 6,
    padding: '8px 14px',
    fontWeight: 600,
    cursor: 'pointer',
    background: sheet.inputBg,
    color: sheet.text,
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 240,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => !confirmando && onClose?.()}
    >
      <div
        role="dialog"
        aria-label="Reportar transporte"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(920px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: sheet.bg || '#fff',
          borderRadius: 12,
          border: `1px solid ${sheet.border}`,
          boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
          padding: 18,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 800, color: sheet.text }}>
              Reportar transporte
            </div>
            <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
              Obra Ejecutada · reparto proporcional por PK_ID
            </div>
          </div>
          <button type="button" onClick={() => !confirmando && onClose?.()} style={btnSec}>✕</button>
        </div>

        {alertaPrevio ? (
          <div style={{
            border: '1px solid #B45309',
            background: '#F59E0B14',
            borderRadius: 8,
            padding: 14,
            marginBottom: 14,
          }}>
            <div style={{ fontWeight: 800, color: '#B45309', marginBottom: 8 }}>
              Ya existe un reporte de transporte para esta combinación
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: sheet.text, lineHeight: 1.5 }}>
              <div>Fecha: {alertaPrevio.created_at ? new Date(alertaPrevio.created_at).toLocaleString('es-CO') : '—'}</div>
              <div>Usuario: {alertaPrevio.usuario_nombre || '—'}</div>
              <div>Cantidad reportada: {fmtCantTransporte(alertaPrevio.cantidad_reportada)}</div>
              <div>Registros: {alertaPrevio.n_registros ?? '—'}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <button type="button" style={btnSec} disabled={confirmando} onClick={() => setAlertaPrevio(null)}>
                Cancelar
              </button>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#B45309', cursor: 'pointer' }}
                disabled={confirmando}
                onClick={() => void ejecutarConfirmar('replace', alertaPrevio.id)}
              >
                Reemplazar
              </button>
              <button
                type="button"
                style={{ ...btnPrimary, background: '#0D9488', cursor: 'pointer' }}
                disabled={confirmando}
                onClick={() => void ejecutarConfirmar('sum', alertaPrevio.id)}
              >
                Sumar
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>1. Capítulo</span>
            <select
              value={capitulo}
              onChange={(e) => setCapitulo(e.target.value)}
              style={sheetInp(sheet, t, !!capitulo)}
            >
              <option value="">— Selecciona —</option>
              {capitulos.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>2. Competencia</span>
            <select
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              style={sheetInp(sheet, t, true)}
            >
              <option value="">(Sin competencia / vacía)</option>
              {(competenciasOpciones || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>
            3. Ítems de origen
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={itemAdd}
              onChange={(e) => setItemAdd(e.target.value)}
              disabled={!capitulo}
              style={{ ...sheetInp(sheet, t, !!itemAdd), maxWidth: 420 }}
            >
              <option value="">— Agregar ítem —</option>
              {itemsDelCapitulo
                .filter((p) => !itemsOrigen.includes(String(p.item_numero)))
                .map((p) => (
                  <option key={p.item_numero} value={p.item_numero}>
                    {p.item_numero} — {p.descripcion || ''}
                  </option>
                ))}
            </select>
            <button type="button" style={btnSec} onClick={addItemOrigen} disabled={!itemAdd}>Agregar</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {itemsOrigen.map((it) => (
              <span
                key={it}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: `${t.primary || '#2563EB'}18`,
                  border: `1px solid ${t.primary || '#2563EB'}55`,
                  fontSize: 'var(--cc-caption)',
                  fontWeight: 700,
                }}
              >
                {it}
                <button type="button" onClick={() => removeItemOrigen(it)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 800 }}>×</button>
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>
              4. Cantidad compacta (solo lectura)
            </span>
            <input
              readOnly
              value={preview == null ? (loadingPreview ? 'Calculando…' : '') : fmtCantTransporte(preview.total_compacta, 4)}
              style={{ ...sheetInp(sheet, t, false), background: '#f1f5f9' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>
              5. Cantidad a reportar
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={cantidadReportar}
              onChange={(e) => setCantidadReportar(e.target.value)}
              placeholder="Ej. 6950"
              style={sheetInp(sheet, t, !!cantidadReportar)}
            />
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
          <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>
            6. Ítem de transporte destino
          </span>
          <select
            value={itemDestino}
            onChange={(e) => setItemDestino(e.target.value)}
            style={sheetInp(sheet, t, !!itemDestino)}
          >
            <option value="">— Selecciona ítem del listado —</option>
            {itemsDestinoOpts.map((p) => (
              <option key={p.item_numero} value={p.item_numero}>
                {p.item_numero} — {p.descripcion || ''} ({p.unidad || '—'}) · VU {fmtCantTransporte(p.precio_unitario, 0)}
              </option>
            ))}
          </select>
        </label>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
            7. Vista previa
            {preview?.n_pk != null ? ` · ${preview.n_pk} PK_ID` : ''}
            {loadingPreview ? ' · actualizando…' : ''}
          </div>
          <div style={{ overflow: 'auto', maxHeight: 280, border: `1px solid ${sheet.border}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-caption)' }}>
              <thead>
                <tr style={{ background: sheet.headerBg || '#e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>PK_ID</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Cant. compacta</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Peso</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Cant. transporte</th>
                </tr>
              </thead>
              <tbody>
                {(reparto?.filas || preview?.filas || []).map((f) => (
                  <tr key={f.pk_id} style={{ borderTop: `1px solid ${sheet.border}` }}>
                    <td style={{ padding: '5px 8px', fontFamily: 'ui-monospace, monospace' }}>{f.pk_id}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtCantTransporte(f.cant_compacta, 4)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtPesoPct(f.peso)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>
                      {f.cant_transporte != null ? fmtCantTransporte(f.cant_transporte) : '—'}
                    </td>
                  </tr>
                ))}
                {!loadingPreview && !(reparto?.filas || preview?.filas || []).length ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: t.textMuted }}>
                      Sin PK_ID con cantidad compacta en la selección.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {reparto?.ok ? (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${sheet.border}`, fontWeight: 800 }}>
                    <td style={{ padding: '6px 8px' }} colSpan={3}>Total asignado</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtCantTransporte(reparto.totalAsignado ?? reparto.total_asignado)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>

        {compactaCero ? (
          <div style={{ marginTop: 10, color: '#B91C1C', fontWeight: 700, fontSize: 'var(--cc-sm)' }}>
            La cantidad compacta de la selección es cero; no se puede confirmar.
          </div>
        ) : null}
        {error ? (
          <div style={{ marginTop: 10, color: '#B91C1C', fontWeight: 600, fontSize: 'var(--cc-sm)' }}>{error}</div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={btnSec} disabled={confirmando} onClick={() => onClose?.()}>
            Cancelar
          </button>
          <button type="button" style={btnPrimary} disabled={!puedeConfirmar} onClick={() => void onClickConfirmar()}>
            {confirmando ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
