/**
 * Popup Excel: asignar / mover líneas físicas de presupuesto a un agrupador WBS.
 * Sustituye la segregación por partes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CheckCheck, Layers, X } from 'lucide-react'
import CcModalBrandHeader from './components/CcModalBrandHeader'
import { fmtCOP } from './progObraFormat'

function IconBtn({ title, onClick, disabled, children, t, active }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        border: `1px solid ${active ? (t.primary || t.border) : t.border}`,
        background: active ? `${t.primary || '#0077B6'}18` : (t.bgCard || t.bg || '#fff'),
        color: disabled ? t.textMuted : t.text,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

export default function ProgObraLineasAgrupadorModal({
  open,
  onClose,
  onSaved,
  t,
  API,
  cid,
  token,
  versionId,
  pkId,
  capitulo,
  agrupadorId,
  versionPptoId,
  puedeEditar = false,
  esBorrador = false,
}) {
  const [disponibles, setDisponibles] = useState([])
  const [asignadas, setAsignadas] = useState([])
  const [deOtros, setDeOtros] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [lastIdx, setLastIdx] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [esMulti, setEsMulti] = useState(false)
  const [sinDisponibles, setSinDisponibles] = useState(false)

  const border = t?.sheetGridBorder || t?.border || '#94a3b8'
  const thBg = t?.sheetHeaderBg || (t?.primary ? `${t.primary}22` : '#E0F2FE')

  const cargar = useCallback(() => {
    if (!open || !cid || !token || !versionId) return
    setBusy(true)
    setError('')
    setSelected(new Set())
    setLastIdx(null)
    const q = new URLSearchParams({
      pk_id: pkId,
      capitulo,
      agrupador_id: String(agrupadorId),
      incluir_otros: esBorrador ? 'true' : 'false',
    })
    if (versionPptoId) q.set('version_ppto_id', versionPptoId)
    fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/lineas-agrupador/preview?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Error')
        return r.json()
      })
      .then((d) => {
        setDisponibles(d.disponibles || [])
        setAsignadas(d.asignadas || [])
        setDeOtros(d.asignadas_otros || [])
        setEsMulti(Boolean(d.es_multi))
        setSinDisponibles(Boolean(d.sin_lineas_disponibles))
      })
      .catch((e) => setError(e?.message || 'No se pudieron cargar las líneas'))
      .finally(() => setBusy(false))
  }, [open, cid, token, API, versionId, pkId, capitulo, agrupadorId, versionPptoId, esBorrador])

  useEffect(() => { cargar() }, [cargar])

  /** Filas seleccionables: disponibles + (en borrador) las de otros. */
  const filas = useMemo(() => {
    const rows = [
      ...disponibles.map((r) => ({ ...r, _grupo: 'disponible' })),
      ...(esBorrador ? deOtros.map((r) => ({ ...r, _grupo: 'otro' })) : []),
    ]
    return rows
  }, [disponibles, deOtros, esBorrador])

  const toggle = useCallback((idx, shiftKey) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastIdx != null) {
        const a = Math.min(lastIdx, idx)
        const b = Math.max(lastIdx, idx)
        for (let i = a; i <= b; i++) {
          const k = filas[i]?.linea_key
          if (k) next.add(k)
        }
      } else {
        const k = filas[idx]?.linea_key
        if (!k) return prev
        if (next.has(k)) next.delete(k)
        else next.add(k)
      }
      return next
    })
    setLastIdx(idx)
  }, [filas, lastIdx])

  const marcarTodo = () => setSelected(new Set(filas.map((r) => r.linea_key).filter(Boolean)))
  const desmarcarTodo = () => setSelected(new Set())

  const asignar = async () => {
    if (!puedeEditar || !esBorrador || selected.size === 0) return
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/lineas-agrupador/asignar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pk_id: pkId,
          capitulo,
          agrupador_id: Number(agrupadorId),
          linea_keys: [...selected],
          version_ppto_id: versionPptoId || undefined,
          mover_desde_otros: true,
        }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'No se pudo asignar')
      onSaved?.()
      cargar()
    } catch (e) {
      setError(e?.message || 'No se pudo asignar')
    } finally {
      setBusy(false)
    }
  }

  const liberarPropias = async () => {
    if (!puedeEditar || !esBorrador || asignadas.length === 0) return
    const keys = asignadas.filter((a) => !a.implicito).map((a) => a.linea_key)
    if (!keys.length) return
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/lineas-agrupador/liberar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ linea_keys: keys }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'No se pudo liberar')
      onSaved?.()
      cargar()
    } catch (e) {
      setError(e?.message || 'No se pudo liberar')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const th = {
    textAlign: 'left',
    padding: '5px 6px',
    fontSize: 'var(--cc-caption)',
    fontWeight: 800,
    color: t.primary || '#0077B6',
    textTransform: 'uppercase',
    border: `1px solid ${border}`,
    background: thBg,
    position: 'sticky',
    top: 0,
    zIndex: 2,
  }
  const td = {
    padding: '6px 8px',
    fontSize: 'var(--cc-sm)',
    color: t.text,
    border: `1px solid ${border}`,
    verticalAlign: 'middle',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: t.overlay || 'rgba(8,30,48,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Líneas del agrupador"
        style={{
          width: 'min(960px, 96vw)',
          maxHeight: '92vh',
          background: t.bgCard || '#fff',
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 800, color: t.text }}>
              Líneas del PK
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 2 }}>
              {pkId} · {capitulo}
              {esMulti ? ' · Ítem en varios agrupadores' : ''}
              {sinDisponibles ? ' · Sin líneas disponibles' : ''}
            </div>
          </div>
          <IconBtn title="Cerrar" onClick={onClose} disabled={busy} t={t}>
            <X size={16} />
          </IconBtn>
        </div>

        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <IconBtn title="Marcar todo" onClick={marcarTodo} disabled={busy || !filas.length} t={t}>
            <CheckCheck size={16} />
          </IconBtn>
          <IconBtn title="Desmarcar todo" onClick={desmarcarTodo} disabled={busy || selected.size === 0} t={t}>
            <X size={16} />
          </IconBtn>
          <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
            {selected.size} seleccionada(s)
          </span>
          {esBorrador && puedeEditar && (
            <>
              <IconBtn
                title="Asignar seleccionadas a este agrupador"
                onClick={() => void asignar()}
                disabled={busy || selected.size === 0}
                t={t}
                active
              >
                <Check size={16} />
              </IconBtn>
              <IconBtn
                title="Liberar líneas de este agrupador"
                onClick={() => void liberarPropias()}
                disabled={busy || !asignadas.some((a) => !a.implicito)}
                t={t}
              >
                <Layers size={16} />
              </IconBtn>
            </>
          )}
        </div>

        {error && (
          <div style={{ margin: '0 16px 8px', color: '#dc2626', fontSize: 'var(--cc-sm)' }}>{error}</div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)', color: t.primary, marginBottom: 6 }}>
            Disponibles / otras
          </div>
          <div style={{ border: `1px solid ${border}`, borderRadius: 4, overflow: 'auto', maxHeight: 280 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 36 }} />
                  <th style={th}>Ítem</th>
                  <th style={th}>Descripción</th>
                  <th style={th}>Abscisas</th>
                  <th style={th}>Cant.</th>
                  <th style={th}>Und</th>
                  <th style={th}>Valor</th>
                  <th style={th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {busy && !filas.length ? (
                  <tr><td style={td} colSpan={8}>Cargando…</td></tr>
                ) : !filas.length ? (
                  <tr><td style={td} colSpan={8}>No hay líneas seleccionables.</td></tr>
                ) : filas.map((row, idx) => {
                  const checked = selected.has(row.linea_key)
                  const tipOtro = row.agrupador_nombre
                    ? `${row.agrupador_codigo_wbs || ''} ${row.agrupador_nombre}`.trim()
                    : ''
                  return (
                    <tr
                      key={row.linea_key}
                      onClick={(e) => toggle(idx, e.shiftKey)}
                      style={{ cursor: 'pointer', background: checked ? `${t.primary || '#0077B6'}14` : 'transparent' }}
                    >
                      <td style={td} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggle(idx, e.nativeEvent?.shiftKey)}
                          title="Seleccionar línea"
                          aria-label="Seleccionar línea"
                        />
                      </td>
                      <td style={td}>{row.item}</td>
                      <td style={{ ...td, maxWidth: 280 }}>
                        <div style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {row.descripcion || '—'}
                        </div>
                      </td>
                      <td style={td}>
                        {[row.abs_inicio, row.abs_final].filter((x) => x != null && x !== '').join(' → ') || '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{row.cantidad}</td>
                      <td style={td}>{row.unidad || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtCOP(row.valor)}</td>
                      <td style={td}>
                        {row._grupo === 'otro' ? (
                          <span title={tipOtro || 'Otro agrupador'} aria-label={tipOtro || 'Otro agrupador'}>
                            <Layers size={14} />
                          </span>
                        ) : 'Disponible'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)', color: t.primary, margin: '14px 0 6px' }}>
            Asignadas a este agrupador ({asignadas.length})
          </div>
          <div style={{ border: `1px solid ${border}`, borderRadius: 4, overflow: 'auto', maxHeight: 180 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={th}>Ítem</th>
                  <th style={th}>Descripción</th>
                  <th style={th}>Abscisas</th>
                  <th style={th}>Cant.</th>
                  <th style={th}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {!asignadas.length ? (
                  <tr><td style={td} colSpan={5}>Ninguna línea asignada aún.</td></tr>
                ) : asignadas.map((row) => (
                  <tr key={`asg-${row.linea_key}`}>
                    <td style={td}>{row.item}</td>
                    <td style={td}>{row.descripcion || '—'}</td>
                    <td style={td}>
                      {[row.abs_inicio, row.abs_final].filter((x) => x != null && x !== '').join(' → ') || '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{row.cantidad}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtCOP(row.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
