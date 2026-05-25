import { useCallback, useEffect, useMemo, useState } from 'react'
import TopoAngularInput from './TopoAngularInput'
import PoligonalCalculoTable from './PoligonalCalculoTable'
import PoligonalGrafico from './PoligonalGrafico'
import TopoErrorModal from './TopoErrorModal'
import {
  btnPrimary,
  btnSecondary,
  inputStyle,
  parseApiError,
  puede,
  Semaforo,
} from './topografiaShared'

const th = { textAlign: 'left', padding: 8, borderBottom: '2px solid #cbd5e1', fontSize: 'var(--cc-xs)' }
const td = { padding: 8, fontSize: 'var(--cc-xs)', borderBottom: '1px solid #e2e8f0' }

export default function PoligonalModal({
  open,
  onClose,
  onSaved,
  contratoId,
  api,
  permisos,
  theme,
  poligonalId: initialPoligonalId = null,
  puntosVerificados = [],
}) {
  const [step, setStep] = useState('setup')
  const [poligonalId, setPoligonalId] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [errorModal, setErrorModal] = useState(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({
    nombre: '',
    tipo: 'cerrada',
    tolerancia_relativa: 3000,
    punto_inicial_id: '',
    punto_final_id: '',
    operador: '',
    fecha_campo: '',
    observaciones: '',
  })

  const [estForm, setEstForm] = useState({ orden: 1, nombre_punto: '', angulo_gms: '', distancia: '' })

  const showError = useCallback((err) => {
    const parsed = parseApiError(err?.message || String(err))
    setErrorModal(parsed)
  }, [])

  const cargarDetalle = useCallback(async (id) => {
    const data = await api(`/poligonales/${id}`)
    setDetalle(data)
    setPoligonalId(id)
    setStep('estaciones')
    const nextOrden = (data?.estaciones?.length || 0) + 1
    setEstForm({ orden: nextOrden, nombre_punto: '', angulo_gms: '', distancia: '' })
    if (data?.poligonal) {
      setForm({
        nombre: data.poligonal.nombre || '',
        tipo: data.poligonal.tipo || 'cerrada',
        tolerancia_relativa: data.poligonal.tolerancia_relativa ?? 3000,
        punto_inicial_id: data.poligonal.punto_inicial_id || '',
        punto_final_id: data.poligonal.punto_final_id || '',
        operador: data.poligonal.operador || '',
        fecha_campo: data.poligonal.fecha_campo || '',
        observaciones: data.poligonal.observaciones || '',
      })
    }
  }, [api])

  useEffect(() => {
    if (!open) return
    setResultado(null)
    setErrorModal(null)
    if (initialPoligonalId) {
      cargarDetalle(initialPoligonalId).catch(showError)
    } else {
      setStep('setup')
      setPoligonalId(null)
      setDetalle(null)
      setForm({
        nombre: '',
        tipo: 'cerrada',
        tolerancia_relativa: 3000,
        punto_inicial_id: '',
        punto_final_id: '',
        operador: '',
        fecha_campo: '',
        observaciones: '',
      })
      setEstForm({ orden: 1, nombre_punto: '', angulo_gms: '', distancia: '' })
    }
  }, [open, initialPoligonalId, cargarDetalle, showError])

  const puntoInicial = useMemo(
    () => puntosVerificados.find((p) => p.id === form.punto_inicial_id),
    [puntosVerificados, form.punto_inicial_id],
  )

  const iniciarPoligonal = async () => {
    if (!form.nombre.trim()) {
      setErrorModal({
        titulo: 'Nombre requerido',
        mensaje: 'Indique un nombre para identificar la poligonal (ej. Poligonal 1).',
      })
      return
    }
    if (form.tipo === 'cerrada' && !form.punto_inicial_id) {
      setErrorModal({
        titulo: 'Punto inicial requerido',
        mensaje:
          'Las poligonales cerradas parten de un BM verificado. Si la biblioteca esta vacia, el administrador debe cargar los BM iniciales del contrato. Luego podra crear circuitos y los nuevos puntos se incorporaran automaticamente.',
      })
      return
    }
    setBusy(true)
    try {
      const payload = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        tolerancia_relativa: Number(form.tolerancia_relativa) || 3000,
        punto_inicial_id: form.punto_inicial_id || null,
        punto_final_id: form.tipo === 'abierta' ? (form.punto_final_id || null) : (form.punto_final_id || form.punto_inicial_id || null),
        operador: form.operador || null,
        fecha_campo: form.fecha_campo || null,
        observaciones: form.observaciones || null,
      }
      const row = await api('/poligonales', { method: 'POST', body: JSON.stringify(payload) })
      if (row?.id) {
        await cargarDetalle(row.id)
        onSaved?.(row.id)
      }
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const agregarPunto = async () => {
    if (!poligonalId) return
    if (!estForm.nombre_punto.trim()) {
      setErrorModal({ titulo: 'Nombre del punto', mensaje: 'Escriba el nombre del punto observado (estacion auxiliar o vertice).' })
      return
    }
    if (!estForm.angulo_gms) {
      setErrorModal({ titulo: 'Angulo requerido', mensaje: 'Ingrese el angulo horizontal observado en formato GG.MMSS (grados, minutos y segundos).' })
      return
    }
    if (!estForm.distancia || Number(estForm.distancia) <= 0) {
      setErrorModal({ titulo: 'Distancia invalida', mensaje: 'La distancia horizontal debe ser un valor mayor que cero (metros).' })
      return
    }
    setBusy(true)
    try {
      await api(`/poligonales/${poligonalId}/estaciones`, {
        method: 'POST',
        body: JSON.stringify({
          orden: Number(estForm.orden),
          nombre_punto: estForm.nombre_punto.trim(),
          angulo_gms: Number(estForm.angulo_gms),
          distancia: Number(estForm.distancia),
        }),
      })
      setEstForm({
        orden: Number(estForm.orden) + 1,
        nombre_punto: '',
        angulo_gms: '',
        distancia: '',
      })
      setResultado(null)
      await cargarDetalle(poligonalId)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const calcular = async () => {
    if (!poligonalId) return
    if (!detalle?.estaciones?.length) {
      setErrorModal({
        titulo: 'Sin estaciones',
        mensaje: 'Agregue al menos una estacion con angulo y distancia antes de calcular la poligonal.',
      })
      return
    }
    setBusy(true)
    try {
      const res = await api(`/poligonales/${poligonalId}/calcular`, { method: 'POST' })
      setResultado(res)
      await cargarDetalle(poligonalId)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const cerrarCircuito = async () => {
    if (!poligonalId) return
    setBusy(true)
    try {
      const res = await api(`/poligonales/${poligonalId}/cerrar`, { method: 'POST' })
      setResultado(res.resultado)
      await cargarDetalle(poligonalId)
      onSaved?.(poligonalId)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const overlay = {
    position: 'fixed',
    inset: 0,
    zIndex: 100010,
    background: 'rgba(15, 23, 42, 0.5)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '24px 16px',
    overflowY: 'auto',
  }

  const panel = {
    width: '100%',
    maxWidth: 1200,
    background: theme?.bgCard || '#fff',
    borderRadius: 14,
    border: `1px solid ${theme?.border || '#e2e8f0'}`,
    boxShadow: theme?.shadow || '0 24px 64px rgba(0,0,0,0.25)',
    padding: 20,
  }

  return (
    <>
      <div style={overlay} onClick={onClose}>
        <div style={panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--cc-lg)' }}>
                {step === 'setup' ? 'Nueva poligonal' : (detalle?.poligonal?.nombre || 'Poligonal')}
              </h2>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 'var(--cc-sm)' }}>
                Libreta de calculo — ingrese estaciones secuencialmente hasta completar el circuito.
              </p>
            </div>
            <button type="button" style={btnSecondary} onClick={onClose}>Cerrar</button>
          </div>

          {step === 'setup' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 16 }}>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Nombre</span>
                  <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle} placeholder="Poligonal 1" />
                </label>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Tipo</span>
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle}>
                    <option value="cerrada">Cerrada</option>
                    <option value="abierta">Abierta</option>
                  </select>
                </label>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Tolerancia 1:N</span>
                  <input type="number" value={form.tolerancia_relativa} onChange={(e) => setForm({ ...form, tolerancia_relativa: e.target.value })} style={inputStyle} />
                </label>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Punto inicial (BM)</span>
                  <select value={form.punto_inicial_id} onChange={(e) => setForm({ ...form, punto_inicial_id: e.target.value })} style={inputStyle}>
                    <option value="">— Seleccionar BM verificado —</option>
                    {puntosVerificados.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
                    ))}
                  </select>
                </label>
                {form.tipo === 'abierta' && (
                  <label>
                    <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Punto final</span>
                    <select value={form.punto_final_id} onChange={(e) => setForm({ ...form, punto_final_id: e.target.value })} style={inputStyle}>
                      <option value="">— Opcional —</option>
                      {puntosVerificados.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Operador</span>
                  <input value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} style={inputStyle} />
                </label>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Fecha campo</span>
                  <input type="date" value={form.fecha_campo} onChange={(e) => setForm({ ...form, fecha_campo: e.target.value })} style={inputStyle} />
                </label>
              </div>

              {puntoInicial && (
                <div style={{ marginBottom: 16, overflowX: 'auto' }}>
                  <h4 style={{ margin: '0 0 8px' }}>Coordenadas de referencia (BM inicial)</h4>
                  <table style={{ borderCollapse: 'collapse', minWidth: 360 }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={th}>Punto</th><th style={th}>Norte</th><th style={th}>Este</th><th style={th}>Cota</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={td}>{puntoInicial.nombre}</td>
                        <td style={td}>{puntoInicial.norte ?? '—'}</td>
                        <td style={td}>{puntoInicial.este ?? '—'}</td>
                        <td style={td}>{puntoInicial.cota ?? '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {!puntosVerificados.length && (
                <div style={{ padding: 12, background: '#fef3c7', borderRadius: 8, marginBottom: 16, fontSize: 'var(--cc-sm)', color: '#92400e' }}>
                  No hay puntos verificados en biblioteca. Solicite al administrador cargar los BM iniciales del contrato antes de abrir la primera poligonal.
                </div>
              )}

              {puede(permisos, 'crear') && (
                <button type="button" style={btnPrimary} onClick={iniciarPoligonal} disabled={busy}>
                  {busy ? 'Creando…' : 'Iniciar poligonal'}
                </button>
              )}
            </div>
          )}

          {step === 'estaciones' && detalle && (
            <div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 'var(--cc-sm)', color: '#475569' }}>
                  Estado: <strong>{detalle.poligonal?.estado}</strong>
                  {' · '}Tipo: {detalle.poligonal?.tipo}
                  {' · '}Tolerancia 1:{detalle.poligonal?.tolerancia_relativa ?? 3000}
                </span>
                {resultado && <Semaforo ok={resultado.admisible} labelOk="Cierre admisible" labelBad="Cierre inadmisible" />}
              </div>

              {puede(permisos, 'editar') && detalle.poligonal?.estado !== 'cerrado' && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fafc' }}>
                  <h4 style={{ marginTop: 0 }}>Agregar punto / estacion</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, alignItems: 'end' }}>
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Orden</span>
                      <input type="number" value={estForm.orden} onChange={(e) => setEstForm({ ...estForm, orden: e.target.value })} style={inputStyle} />
                    </label>
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Punto observado</span>
                      <input value={estForm.nombre_punto} onChange={(e) => setEstForm({ ...estForm, nombre_punto: e.target.value })} style={inputStyle} placeholder="Ej. P1" />
                    </label>
                    <TopoAngularInput label="Angulo observado (GG.MMSS)" value={estForm.angulo_gms} onChange={(_, v) => setEstForm({ ...estForm, angulo_gms: v })} />
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Distancia (m)</span>
                      <input value={estForm.distancia} onChange={(e) => setEstForm({ ...estForm, distancia: e.target.value })} style={inputStyle} placeholder="0.000" />
                    </label>
                    <button type="button" style={{ ...btnPrimary, height: 38 }} onClick={agregarPunto} disabled={busy}>
                      Agregar punto
                    </button>
                  </div>
                </div>
              )}

              <PoligonalCalculoTable
                estaciones={detalle.estaciones}
                poligonal={detalle.poligonal}
                resultado={resultado}
              />

              <div style={{ marginTop: 16 }}>
                <PoligonalGrafico estaciones={detalle.estaciones} />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                {puede(permisos, 'editar') && (
                  <>
                    <button type="button" style={btnPrimary} onClick={calcular} disabled={busy}>Calcular</button>
                    {detalle.poligonal?.estado !== 'cerrado' && (
                      <button type="button" style={btnSecondary} onClick={cerrarCircuito} disabled={busy}>Cerrar circuito</button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {errorModal && (
        <TopoErrorModal theme={theme} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}
    </>
  )
}
