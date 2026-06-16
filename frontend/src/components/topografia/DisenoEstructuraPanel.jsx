import { useEffect, useMemo, useState } from 'react'
import { PermisoAviso, puede, useTopoTheme } from './topografiaShared'

const filaVacia = () => ({ nombre: '', espesor_m: '', referencia_orden: '', sobre_ancho_m: '' })

function parseCapas(filas) {
  const capas = []
  for (let i = 0; i < filas.length; i += 1) {
    const nombre = (filas[i].nombre || '').trim()
    const esp = parseFloat(String(filas[i].espesor_m).replace(',', '.'))
    if (!nombre) return { error: `Indique el nombre de la capa en la fila ${i + 1}.` }
    if (!Number.isFinite(esp) || esp <= 0) return { error: `Espesor inválido en «${nombre}».` }
    let referencia_analisis_orden = null
    const refRaw = filas[i].referencia_orden
    if (refRaw === '0') referencia_analisis_orden = 0
    else if (refRaw !== '' && refRaw != null) {
      const n = parseInt(String(refRaw), 10)
      if (!Number.isFinite(n) || n < 0) return { error: `Referencia de análisis inválida en «${nombre}».` }
      referencia_analisis_orden = n
    }
    capas.push({ nombre, espesor_m: esp, referencia_analisis_orden, sobre_ancho_m: parseFloat(String(filas[i].sobre_ancho_m).replace(',', '.')) || 0 })
  }
  const lower = capas.map((c) => c.nombre.toLowerCase())
  if (lower.length !== new Set(lower).size) return { error: 'Los nombres de capa deben ser únicos.' }
  return { capas }
}

export function sumEspesores(filas) {
  return filas.reduce((acc, f) => {
    const n = parseFloat(String(f.espesor_m).replace(',', '.'))
    return acc + (Number.isFinite(n) ? n : 0)
  }, 0)
}

/** Panel con estructura vigente editable + total resaltado (ancho ~30% del contenedor padre). */
export default function DisenoEstructuraPanel({
  estructuraVigente,
  estructuras,
  permisos,
  busy,
  onGuardar,
  embed = false,
}) {
  const ui = useTopoTheme()
  const [filas, setFilas] = useState([filaVacia()])
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  const capasIniciales = estructuraVigente?.capas

  useEffect(() => {
    setError('')
    setDirty(false)
    if (capasIniciales?.length) {
      setFilas(capasIniciales.map((c) => ({
        nombre: c.nombre || '',
        espesor_m: c.espesor_m ?? '',
        referencia_orden: c.referencia_analisis_orden === 0
          ? '0'
          : (c.referencia_analisis_orden != null ? String(c.referencia_analisis_orden) : ''),
        sobre_ancho_m: c.sobre_ancho_m ?? '',
      })))
    } else {
      setFilas([filaVacia()])
    }
  }, [estructuraVigente?.id, capasIniciales])

  const total = useMemo(() => sumEspesores(filas), [filas])

  const update = (idx, patch) => {
    setFilas((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const agregar = () => {
    setFilas((rows) => [...rows, filaVacia()])
    setDirty(true)
  }

  const quitar = (idx) => {
    if (filas.length <= 1) return
    setFilas((rows) => rows.filter((_, i) => i !== idx))
    setDirty(true)
  }

  const guardar = () => {
    const parsed = parseCapas(filas)
    if (parsed.error) {
      setError(parsed.error)
      return
    }
    setError('')
    onGuardar(parsed.capas, estructuraVigente?.nombre)
  }

  const thCapa = { ...ui.th, textAlign: 'left' }
  const panelStyle = embed
    ? { width: '100%' }
    : {
      ...ui.card,
      padding: '14px 16px',
      width: '100%',
      height: '100%',
    }

  return (
    <div style={panelStyle}>
      {!embed && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: '1 1 200px' }}>
          <h4 style={{ margin: 0, fontSize: 'var(--cc-base)', color: ui.text }}>
            Estructura de vía
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Vigente:{' '}
            <strong style={{ color: ui.text }}>
              {estructuraVigente?.nombre || 'Sin definir'}
            </strong>
            {estructuraVigente?.vigente && (
              <span style={{ marginLeft: 8, color: ui.t?.success || '#047857', fontWeight: 600 }}>
                (activa)
              </span>
            )}
          </p>
        </div>
        <PermisoAviso permisos={permisos} accion="editar">
          {puede(permisos, 'editar') && (
            <button
              type="button"
              style={ui.btnPrimary}
              onClick={guardar}
              disabled={busy || !filas.length}
            >
              {busy ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardar estructura'}
            </button>
          )}
        </PermisoAviso>
      </div>
      )}
      {embed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <p style={{ margin: 0, flex: 1, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Vigente: <strong style={{ color: ui.text }}>{estructuraVigente?.nombre || 'Sin definir'}</strong>
            {estructuraVigente?.vigente && (
              <span style={{ marginLeft: 6, color: ui.t?.success || '#047857' }}>(activa)</span>
            )}
          </p>
          <PermisoAviso permisos={permisos} accion="editar">
            {puede(permisos, 'editar') && (
              <button
                type="button"
                style={ui.btnPrimary}
                onClick={guardar}
                disabled={busy || !filas.length}
              >
                {busy ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardar estructura'}
              </button>
            )}
          </PermisoAviso>
        </div>
      )}

      <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
        Primera capa = terminado / rasante (CSV). Cada espesor se descuenta hacia abajo.
        En «Ref. espesor» indique la capa inferior usada al verificar espesor en entrega de obra.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '40px' }} />
            <col />
            <col style={{ width: '96px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '88px' }} />
            <col style={{ width: '40px' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...ui.th, textAlign: 'left' }}>#</th>
              <th style={thCapa}>Capa</th>
              <th style={{ ...ui.th, textAlign: 'left' }}>Espesor (m)</th>
              <th style={{ ...ui.th, textAlign: 'left' }}>Ref. espesor</th>
              <th style={{ ...ui.th, textAlign: 'left' }}>Sobre ancho (m)</th>
              <th style={ui.th} />
            </tr>
          </thead>
          <tbody>
            {filas.map((f, idx) => (
              <tr key={idx}>
                <td style={ui.td}>
                  {idx + 1}
                  {idx === 0 && (
                    <div style={{ fontSize: 'var(--cc-caption)', color: ui.textMuted }}>terminado</div>
                  )}
                </td>
                <td style={ui.td}>
                  <input
                    value={f.nombre}
                    disabled={!puede(permisos, 'editar')}
                    onChange={(e) => update(idx, { nombre: e.target.value })}
                    placeholder={idx === 0 ? 'MD-12' : 'MD-20'}
                    style={{ ...ui.inputStyle, width: '100%' }}
                  />
                </td>
                <td style={ui.td}>
                  <input
                    value={f.espesor_m}
                    disabled={!puede(permisos, 'editar')}
                    onChange={(e) => update(idx, { espesor_m: e.target.value })}
                    placeholder="0.070"
                    style={{ ...ui.inputStyle, width: '100%' }}
                  />
                </td>
                <td style={ui.td}>
                  <select
                    value={f.referencia_orden ?? ''}
                    disabled={!puede(permisos, 'editar')}
                    onChange={(e) => update(idx, { referencia_orden: e.target.value })}
                    style={{ ...ui.inputStyle, width: '100%', fontSize: 'var(--cc-xs)' }}
                    title="Capa inferior para cálculo de espesor en entrega DG"
                  >
                    <option value="">
                      Auto ({idx + 1 < filas.length ? (filas[idx + 1].nombre || `Capa ${idx + 2}`) : 'Terreno'})
                    </option>
                    {filas.slice(idx + 1).map((capaAbajo, j) => (
                      <option key={j} value={String(idx + j + 2)}>
                        {capaAbajo.nombre || `Capa ${idx + j + 2}`}
                      </option>
                    ))}
                    <option value="0">Terreno natural</option>
                  </select>
                </td>
                <td style={ui.td}>
                  <input
                    value={f.sobre_ancho_m ?? ''}
                    disabled={!puede(permisos, 'editar')}
                    onChange={(e) => update(idx, { sobre_ancho_m: e.target.value })}
                    placeholder="0.00"
                    style={{ ...ui.inputStyle, width: '100%' }}
                    title="Metros adicionales al ancho de vía del eje para esta capa"
                  />
                </td>
                <td style={ui.td}>
                  {puede(permisos, 'editar') && (
                    <button
                      type="button"
                      style={{ ...ui.btnSecondary, padding: '2px 8px', color: '#dc2626' }}
                      onClick={() => quitar(idx)}
                      disabled={filas.length <= 1}
                      title="Quitar capa"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr style={{
              background: `${ui.t?.success || '#047857'}22`,
              fontWeight: 700,
            }}
            >
              <td style={{ ...ui.td, color: ui.text }} colSpan={4}>
                Espesor total estructura
              </td>
              <td style={{ ...ui.td, color: ui.t?.success || '#047857' }} colSpan={2}>
                {total.toFixed(3)} m
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {puede(permisos, 'editar') && (
        <button type="button" style={{ ...ui.btnSecondary, marginTop: 10 }} onClick={agregar}>
          + Agregar capa
        </button>
      )}

      {error && (
        <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: '#dc2626' }}>{error}</p>
      )}

      {estructuras && estructuras.length > 1 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${ui.t?.border || '#e2e8f0'}` }}>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', fontWeight: 600, color: ui.textMuted }}>
            Historial de estructuras
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            {estructuras.map((e) => (
              <li key={e.id} style={{ marginBottom: 4 }}>
                {e.nombre}
                {e.vigente ? ' — vigente' : ''}
                {' · '}
                {(e.capas?.length || 0)} capas · Σ {(e.espesor_total_m ?? 0).toFixed(3)} m
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Modal ancho para crear nueva versión de estructura con nombre. */
export function DisenoNuevaEstructuraModal({ open, onSave, onClose, saving }) {
  const ui = useTopoTheme()
  const [nombre, setNombre] = useState('')
  const [filas, setFilas] = useState([filaVacia()])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setNombre('')
    setFilas([filaVacia()])
    setError('')
  }, [open])

  if (!open) return null

  const total = sumEspesores(filas)
  const update = (idx, patch) => setFilas((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const guardar = () => {
    if (!(nombre || '').trim()) {
      setError('Indique un nombre para esta estructura.')
      return
    }
    const parsed = parseCapas(filas)
    if (parsed.error) {
      setError(parsed.error)
      return
    }
    setError('')
    onSave(nombre.trim(), parsed.capas)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...ui.card,
          width: 'min(1040px, 96vw)',
          maxHeight: '92vh',
          overflow: 'auto',
          padding: '18px 22px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 6px', color: ui.text, fontSize: 'var(--cc-base)' }}>
          Nueva estructura de vía
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
          La nueva estructura quedará <strong>vigente</strong> automáticamente. Las anteriores se conservan en el historial.
        </p>

        <label style={{ display: 'block', marginBottom: 14, maxWidth: 480 }}>
          <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Nombre de la estructura</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Rev. 2 — cambio BG-A"
            style={{ ...ui.inputStyle, display: 'block', marginTop: 4, width: '100%' }}
          />
        </label>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '56px' }} />
              <col />
              <col style={{ width: '140px' }} />
              <col style={{ width: '48px' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...ui.th, textAlign: 'left' }}>#</th>
                <th style={{ ...ui.th, textAlign: 'left' }}>Capa</th>
                <th style={{ ...ui.th, textAlign: 'left' }}>Espesor (m)</th>
                <th style={ui.th} />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, idx) => (
                <tr key={idx}>
                  <td style={ui.td}>{idx + 1}{idx === 0 ? ' · terminado' : ''}</td>
                  <td style={ui.td}>
                    <input
                      value={f.nombre}
                      onChange={(e) => update(idx, { nombre: e.target.value })}
                      style={{ ...ui.inputStyle, width: '100%' }}
                    />
                  </td>
                  <td style={ui.td}>
                    <input
                      value={f.espesor_m}
                      onChange={(e) => update(idx, { espesor_m: e.target.value })}
                      style={{ ...ui.inputStyle, width: '100%' }}
                    />
                  </td>
                  <td style={ui.td}>
                    <button
                      type="button"
                      style={{ ...ui.btnSecondary, padding: '2px 8px', color: '#dc2626' }}
                      onClick={() => filas.length > 1 && setFilas(filas.filter((_, i) => i !== idx))}
                      disabled={filas.length <= 1}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr style={{ background: `${ui.t?.success || '#047857'}22`, fontWeight: 700 }}>
                <td style={ui.td} colSpan={2}>Espesor total</td>
                <td style={{ ...ui.td, color: ui.t?.success || '#047857' }} colSpan={2}>
                  {total.toFixed(3)} m
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          type="button"
          style={{ ...ui.btnSecondary, marginTop: 10 }}
          onClick={() => setFilas([...filas, filaVacia()])}
        >
          + Agregar capa
        </button>

        {error && <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: '#dc2626' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" style={ui.btnSecondary} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" style={ui.btnPrimary} onClick={guardar} disabled={saving}>
            {saving ? 'Guardando…' : 'Crear y activar estructura'}
          </button>
        </div>
      </div>
    </div>
  )
}
