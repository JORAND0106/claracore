/**
 * Panel post-mapa: nombre, abscisas del tramo y estructura(s) del contrato con sectores.
 */
import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import { IconClose, IconMap } from './disenoDgIcons'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import { useTopoTheme } from './topografiaShared'

function sugerirNombre(pks) {
  const tramos = [...new Set((pks || []).map((p) => p.tramo_plataforma || p.ubicacion_tramo).filter(Boolean))]
  if (tramos.length === 1) return tramos[0]
  if (tramos.length > 1) return tramos.slice(0, 2).join(' / ')
  const labels = (pks || []).map((p) => p.pk_label || p.ubicacion_pk).filter(Boolean)
  if (labels.length) return `Tramo ${labels[0]}${labels.length > 1 ? ` (+${labels.length - 1})` : ''}`
  return ''
}

const SECTOR_COLS = [
  { key: 'est', label: 'Estructura' },
  { key: 'ini', label: 'Abscisa inicio', width: 120 },
  { key: 'fin', label: 'Abscisa fin', width: 120 },
  { key: 'acc', label: '', width: 40 },
]

function Field({ ui, label, children }) {
  return (
    <label style={{ display: 'block', flex: '1 1 160px' }}>
      <span style={{
        display: 'block', fontSize: 'var(--cc-caption)', fontWeight: 700,
        color: ui.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
      }}>
        {label}
      </span>
      {children}
    </label>
  )
}

export default function DisenoCrearTramoModal({
  open,
  pks = [],
  estructuras = [],
  initial = null,
  saving = false,
  onSave,
  onBackToMap,
  onClose,
}) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const [nombre, setNombre] = useState('')
  const [absIni, setAbsIni] = useState('')
  const [absFin, setAbsFin] = useState('')
  const [estructuraIds, setEstructuraIds] = useState([])
  const [sectores, setSectores] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (initial) {
      setNombre(initial.nombre || '')
      setAbsIni(initial.abscisa_inicio != null ? String(initial.abscisa_inicio) : '')
      setAbsFin(initial.abscisa_fin != null ? String(initial.abscisa_fin) : '')
      const secs = (initial.sectores || []).map((s) => ({
        estructura_id: s.estructura_id || s.estructura?.id || '',
        abscisa_inicio: s.abscisa_inicio != null ? String(s.abscisa_inicio) : '',
        abscisa_fin: s.abscisa_fin != null ? String(s.abscisa_fin) : '',
      }))
      const ids = [...new Set(secs.map((s) => s.estructura_id).filter(Boolean))]
      setEstructuraIds(ids.length ? ids : [])
      setSectores(secs)
    } else {
      setNombre(sugerirNombre(pks))
      setAbsIni('')
      setAbsFin('')
      setEstructuraIds([])
      setSectores([])
    }
  }, [open, pks, initial])

  if (!open) return null

  const toggleEstructura = (id) => {
    setEstructuraIds((prev) => {
      const has = prev.includes(id)
      const next = has ? prev.filter((x) => x !== id) : [...prev, id]
      if (next.length <= 1) {
        setSectores(next.length === 1 ? [{ estructura_id: next[0], abscisa_inicio: absIni, abscisa_fin: absFin }] : [])
      } else if (!has) {
        setSectores((rows) => [...rows, { estructura_id: id, abscisa_inicio: '', abscisa_fin: '' }])
      } else {
        setSectores((rows) => rows.filter((r) => r.estructura_id !== id))
      }
      return next
    })
  }

  const guardar = () => {
    const nom = nombre.trim()
    if (!nom) {
      setError('Indique el nombre del tramo.')
      return
    }
    if (!pks.length) {
      setError('Debe seleccionar pk_ID en el mapa.')
      return
    }
    const ini = parseFloat(String(absIni).replace(',', '.'))
    const fin = parseFloat(String(absFin).replace(',', '.'))
    if (!Number.isFinite(ini) || !Number.isFinite(fin)) {
      setError('Indique abscisa de inicio y abscisa final.')
      return
    }
    if (fin < ini) {
      setError('La abscisa final debe ser ≥ a la de inicio.')
      return
    }
    if (!estructuraIds.length) {
      setError('Seleccione al menos una estructura del contrato.')
      return
    }
    let sectoresPayload
    if (estructuraIds.length === 1) {
      sectoresPayload = [{
        estructura_id: estructuraIds[0],
        abscisa_inicio: ini,
        abscisa_fin: fin,
      }]
    } else {
      if (!sectores.length) {
        setError('Agregue los sectores de cada estructura.')
        return
      }
      sectoresPayload = []
      for (let i = 0; i < sectores.length; i += 1) {
        const s = sectores[i]
        if (!s.estructura_id) {
          setError(`Sector ${i + 1}: seleccione estructura.`)
          return
        }
        const si = parseFloat(String(s.abscisa_inicio).replace(',', '.'))
        const sf = parseFloat(String(s.abscisa_fin).replace(',', '.'))
        if (!Number.isFinite(si) || !Number.isFinite(sf) || sf < si) {
          setError(`Sector ${i + 1}: abscisas inválidas.`)
          return
        }
        if (si < ini - 1e-9 || sf > fin + 1e-9) {
          setError(`Sector ${i + 1}: debe quedar dentro del tramo (${ini} – ${fin}).`)
          return
        }
        sectoresPayload.push({ estructura_id: s.estructura_id, abscisa_inicio: si, abscisa_fin: sf })
      }
    }
    setError('')
    onSave({
      nombre: nom,
      abscisa_inicio: ini,
      abscisa_fin: fin,
      pks,
      sectores: sectoresPayload,
    })
  }

  const editando = !!initial?.id

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 100060,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={() => { if (!saving) onClose?.() }}
    >
      <div
        style={{
          ...ui.card,
          width: 'min(760px, 96vw)',
          maxHeight: '92vh',
          overflow: 'auto',
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={ui.t} />

        <div style={{
          padding: '16px 20px 12px',
          borderBottom: `1px solid ${ui.t?.border || '#e2e8f0'}`,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 'var(--cc-caption)', fontWeight: 700,
              color: ui.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {editando ? 'Editar tramo' : 'Configurar tramo'}
            </div>
            <h3 style={{ margin: '4px 0 0', color: ui.text, fontSize: 'var(--cc-lg)' }}>
              {editando ? (initial?.nombre || 'Tramo') : 'Nuevo tramo desde el mapa'}
            </h3>
          </div>
          <button
            type="button"
            title="Cerrar"
            aria-label="Cerrar"
            disabled={saving}
            onClick={onClose}
            style={{
              ...ui.btnSecondary, width: 36, height: 36, padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <IconClose />
          </button>
        </div>

        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{
            padding: '10px 12px', borderRadius: 10, marginBottom: 14,
            border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
            background: ui.t?.bg || 'transparent',
          }}>
            <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: ui.textMuted, marginBottom: 6 }}>
              PK seleccionados ({pks.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pks.map((p) => (
                <span
                  key={p.pk_id || p.ubicacion_pk_id}
                  style={{
                    fontSize: 'var(--cc-xs)', fontWeight: 600, color: ui.text,
                    padding: '4px 8px', borderRadius: 8,
                    border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
                  }}
                >
                  {p.pk_label || p.ubicacion_pk || p.pk_id}
                  {p.costado ? ` · ${p.costado}` : ''}
                </span>
              ))}
            </div>
            {onBackToMap && (
              <button
                type="button"
                title="Volver al mapa para cambiar pk_ID"
                aria-label="Volver al mapa para cambiar pk_ID"
                disabled={saving}
                onClick={onBackToMap}
                style={{
                  ...ui.btnSecondary, marginTop: 10,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <IconMap width={16} height={16} /> Cambiar selección en el mapa
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <Field ui={ui} label="Nombre del tramo">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                style={{ ...ui.inputStyle, display: 'block', width: '100%' }}
              />
            </Field>
            <Field ui={ui} label="Abscisa inicio">
              <input
                value={absIni}
                onChange={(e) => setAbsIni(e.target.value)}
                inputMode="decimal"
                style={{ ...ui.inputStyle, display: 'block', width: '100%' }}
              />
            </Field>
            <Field ui={ui} label="Abscisa final">
              <input
                value={absFin}
                onChange={(e) => setAbsFin(e.target.value)}
                inputMode="decimal"
                style={{ ...ui.inputStyle, display: 'block', width: '100%' }}
              />
            </Field>
          </div>

          <div style={{
            padding: '12px 14px', borderRadius: 12, marginBottom: 12,
            border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
          }}>
            <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: ui.text, marginBottom: 8 }}>
              Estructura(s) del contrato
            </div>
            {!estructuras.length ? (
              <p style={{ margin: 0, fontSize: 'var(--cc-xs)', color: ui.t?.warn || '#b45309' }}>
                No hay estructuras del contrato. Créelas primero en «Estructuras del contrato».
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {estructuras.map((e) => {
                  const on = estructuraIds.includes(e.id)
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggleEstructura(e.id)}
                      title={on ? 'Quitar estructura' : 'Asignar estructura'}
                      style={{
                        ...ui.btnSecondary,
                        borderColor: on ? (ui.t?.success || '#16a34a') : ui.t?.border,
                        background: on ? `${ui.t?.success || '#16a34a'}18` : undefined,
                        fontWeight: on ? 700 : 500,
                      }}
                    >
                      {e.nombre}
                      {e.espesor_total_m != null ? ` · Σ ${Number(e.espesor_total_m).toFixed(3)} m` : ''}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {estructuraIds.length > 1 && (
            <div style={{
              padding: '12px 14px', borderRadius: 12, marginBottom: 12,
              border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
            }}>
              <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
                Defina los sectores (estructura + abscisas). Deben quedar dentro del tramo.
              </p>
              <TopoExcelSheet sheet={sheet} columns={SECTOR_COLS} minWidth={480}>
                {sectores.map((s, idx) => (
                  <tr key={idx}>
                    <td style={sheet.td}>
                      <select
                        value={s.estructura_id}
                        onChange={(e) => setSectores((rows) => rows.map((r, i) => (
                          i === idx ? { ...r, estructura_id: e.target.value } : r
                        )))}
                        style={sheet.cellSelect}
                      >
                        <option value="">—</option>
                        {estructuras.map((est) => (
                          <option key={est.id} value={est.id}>{est.nombre}</option>
                        ))}
                      </select>
                    </td>
                    <td style={sheet.td}>
                      <input
                        value={s.abscisa_inicio}
                        onChange={(e) => setSectores((rows) => rows.map((r, i) => (
                          i === idx ? { ...r, abscisa_inicio: e.target.value } : r
                        )))}
                        style={sheet.cellInp}
                      />
                    </td>
                    <td style={sheet.td}>
                      <input
                        value={s.abscisa_fin}
                        onChange={(e) => setSectores((rows) => rows.map((r, i) => (
                          i === idx ? { ...r, abscisa_fin: e.target.value } : r
                        )))}
                        style={sheet.cellInp}
                      />
                    </td>
                    <td style={sheet.td}>
                      <button
                        type="button"
                        title="Quitar sector"
                        aria-label="Quitar sector"
                        style={{ ...ui.btnSecondary, padding: '2px 8px', color: '#dc2626' }}
                        onClick={() => setSectores((rows) => rows.filter((_, i) => i !== idx))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </TopoExcelSheet>
              <button
                type="button"
                style={{ ...ui.btnSecondary, marginTop: 6 }}
                onClick={() => setSectores((rows) => [...rows, { estructura_id: '', abscisa_inicio: '', abscisa_fin: '' }])}
              >
                + Agregar sector
              </button>
            </div>
          )}

          {error && (
            <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs)', color: '#dc2626' }}>{error}</p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={ui.btnSecondary} onClick={onClose} disabled={saving} title="Cancelar">
              Cancelar
            </button>
            <button type="button" style={ui.btnPrimary} onClick={guardar} disabled={saving} title="Guardar tramo">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
