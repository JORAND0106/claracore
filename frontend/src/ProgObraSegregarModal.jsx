/**
 * Popup de segregación de agrupador dentro de un PK.
 * Palabras clave visibles; detalle en tooltip institucional.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Check, Scissors } from 'lucide-react'
import CcModalBrandHeader from './components/CcModalBrandHeader'
import { fmtCOP } from './progObraFormat'

export default function ProgObraSegregarModal({
  open,
  onClose,
  onConfirm,
  onDeshacer,
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
  puedeEliminar = false,
  tieneSegregacion = false,
}) {
  const [lineas, setLineas] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [lastIdx, setLastIdx] = useState(null)
  const [nombre, setNombre] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [duracion, setDuracion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [totalValor, setTotalValor] = useState(0)

  useEffect(() => {
    if (!open || !cid || !token) return
    setBusy(true)
    setError('')
    setSelected(new Set())
    setNombre('')
    setFechaInicio('')
    setDuracion('')
    const q = new URLSearchParams({
      pk_id: pkId,
      capitulo,
      agrupador_id: String(agrupadorId),
    })
    if (versionPptoId) q.set('version_ppto_id', versionPptoId)
    fetch(`${API}/prog-obra/${cid}/segregar/preview?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Error')
        return r.json()
      })
      .then((d) => {
        setLineas(d.lineas || [])
        setTotalValor(Number(d.total_valor) || 0)
      })
      .catch((e) => setError(e?.message || 'No se pudieron cargar las líneas'))
      .finally(() => setBusy(false))
  }, [open, cid, token, API, pkId, capitulo, agrupadorId, versionPptoId])

  const toggle = useCallback((idx, shiftKey) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastIdx != null) {
        const a = Math.min(lastIdx, idx)
        const b = Math.max(lastIdx, idx)
        for (let i = a; i <= b; i++) next.add(lineas[i]?.item)
      } else {
        const it = lineas[idx]?.item
        if (!it) return prev
        if (next.has(it)) next.delete(it)
        else next.add(it)
      }
      return next
    })
    setLastIdx(idx)
  }, [lastIdx, lineas])

  const valorSel = useMemo(
    () => lineas.filter((l) => selected.has(l.item)).reduce((s, l) => s + (Number(l.valor) || 0), 0),
    [lineas, selected],
  )

  const handleConfirm = async () => {
    if (!puedeEditar || !nombre.trim() || selected.size === 0) return
    setBusy(true)
    setError('')
    try {
      await onConfirm?.({
        nombre_parte: nombre.trim(),
        items: [...selected],
        fecha_inicio: fechaInicio || null,
        duracion_dias_habiles: duracion ? parseInt(duracion, 10) : null,
      })
      onClose?.()
    } catch (e) {
      setError(e?.message || 'No se pudo segregar')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="presentation"
      onClick={() => !busy && onClose?.()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 210000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-label="Segregar"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(920px, 96vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: t.bgCard,
          borderRadius: 12,
          border: `1px solid ${t.border}`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.primary }}>
            <Scissors size={16} />
            <span data-cc-tooltip="Divide el agrupador en partes con líneas de presupuesto distintas dentro de este PK" data-cc-tooltip-variant="help">
              Segregar
            </span>
          </div>
          <button
            type="button"
            data-cc-tooltip="Cerrar"
            data-cc-tooltip-variant="short"
            aria-label="Cerrar"
            onClick={() => !busy && onClose?.()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted }}
          >
            <X size={18} />
          </button>
        </div>

        {error && <div style={{ padding: '0 16px 8px', color: '#b91c1c', fontSize: 13 }}>{error}</div>}

        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre"
            data-cc-tooltip="Nombre corto de la parte (ej. Cuneta)"
            data-cc-tooltip-variant="short"
            style={{ flex: '1 1 140px', padding: '6px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text }}
          />
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            data-cc-tooltip="Inicio"
            data-cc-tooltip-variant="short"
            style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text }}
          />
          <input
            type="number"
            min={1}
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            placeholder="Días"
            data-cc-tooltip="Duración en días hábiles"
            data-cc-tooltip-variant="short"
            style={{ width: 72, padding: '6px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text }}
          />
          <button
            type="button"
            data-cc-tooltip="Marcar todas las líneas"
            data-cc-tooltip-variant="short"
            onClick={() => setSelected(new Set(lineas.map((l) => l.item)))}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, cursor: 'pointer' }}
          >
            Todo
          </button>
          <button
            type="button"
            data-cc-tooltip="Quitar todas las marcas"
            data-cc-tooltip-variant="short"
            onClick={() => setSelected(new Set())}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, cursor: 'pointer' }}
          >
            Nada
          </button>
        </div>

        <div style={{ padding: '0 16px 12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: t.bgCard, position: 'sticky', top: 0 }}>
                {['', 'Ítem', 'Descripción', 'Abs.', 'Cant.', 'Und', 'Valor'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, idx) => (
                <tr
                  key={l.item}
                  onClick={(e) => toggle(idx, e.shiftKey)}
                  style={{ cursor: 'pointer', background: selected.has(l.item) ? 'rgba(14,165,233,0.12)' : 'transparent' }}
                >
                  <td style={{ padding: '6px 8px' }}>
                    <input type="checkbox" checked={selected.has(l.item)} readOnly />
                  </td>
                  <td style={{ padding: '6px 8px', color: t.text }}>{l.item}</td>
                  <td style={{ padding: '6px 8px', color: t.text }}>{l.descripcion}</td>
                  <td style={{ padding: '6px 8px', color: t.textMuted }}>
                    {[l.abs_inicio, l.abs_final].filter((x) => x != null && x !== '').join('–') || '—'}
                  </td>
                  <td style={{ padding: '6px 8px', color: t.text }}>{l.cantidad}</td>
                  <td style={{ padding: '6px 8px', color: t.textMuted }}>{l.unidad || '—'}</td>
                  <td style={{ padding: '6px 8px', color: t.text }}>{fmtCOP(l.valor)}</td>
                </tr>
              ))}
              {!lineas.length && !busy && (
                <tr>
                  <td colSpan={7} style={{ padding: 16, color: t.textMuted, textAlign: 'center' }}>Sin líneas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '10px 16px 16px', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 12, color: t.textMuted }} data-cc-tooltip="Valor de líneas marcadas / total del agrupador" data-cc-tooltip-variant="short">
            {fmtCOP(valorSel)} / {fmtCOP(totalValor)}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {tieneSegregacion && puedeEliminar && (
              <button
                type="button"
                disabled={busy}
                data-cc-tooltip="Deshacer segregación y devolver líneas al agrupador completo"
                data-cc-tooltip-variant="help"
                onClick={() => void onDeshacer?.()}
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, cursor: 'pointer' }}
              >
                Deshacer
              </button>
            )}
            <button
              type="button"
              disabled={busy || !puedeEditar || !nombre.trim() || selected.size === 0}
              data-cc-tooltip="Crear la parte con las líneas marcadas; el resto queda en Pendiente"
              data-cc-tooltip-variant="help"
              onClick={() => void handleConfirm()}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                background: t.primary,
                color: '#fff',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                opacity: busy || !puedeEditar || !nombre.trim() || selected.size === 0 ? 0.5 : 1,
              }}
            >
              <Check size={14} />
              Crear
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
