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
    tolerancia_cota_mm_km: 12,
    amarreModo: 'inline',
    punto_inicial_id: '',
    punto_final_id: '',
    amarre: { nombre: '', norte: '', este: '', cota: '' },
    operador: '',
    fecha_campo: '',
    observaciones: '',
  })

  const [estForm, setEstForm] = useState({
    orden: 1,
    nombre_punto: '',
    altura_instrumento: '',
    angulo_gms: '',
    angulo_vertical_gms: '',
    distancia: '',
    altura_objetivo: '',
    lectura_mira: '',
  })

  const resetEstForm = (orden) => ({
    orden,
    nombre_punto: '',
    altura_instrumento: estForm.altura_instrumento,
    angulo_gms: '',
    angulo_vertical_gms: '',
    distancia: '',
    altura_objetivo: '',
    lectura_mira: '',
  })

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
    setEstForm(resetEstForm(nextOrden))
    if (data?.poligonal) {
      const pi = data.punto_inicial
      setForm({
        nombre: data.poligonal.nombre || '',
        tipo: data.poligonal.tipo || 'cerrada',
        tolerancia_relativa: data.poligonal.tolerancia_relativa ?? 3000,
        tolerancia_cota_mm_km: data.poligonal.tolerancia_cota_mm_km ?? 12,
        amarreModo: pi?.verificado ? 'biblioteca' : 'inline',
        punto_inicial_id: data.poligonal.punto_inicial_id || '',
        punto_final_id: data.poligonal.punto_final_id || '',
        amarre: {
          nombre: pi?.nombre || '',
          norte: pi?.norte ?? '',
          este: pi?.este ?? '',
          cota: pi?.cota ?? '',
        },
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
        tolerancia_cota_mm_km: 12,
        amarreModo: 'inline',
        punto_inicial_id: '',
        punto_final_id: '',
        amarre: { nombre: '', norte: '', este: '', cota: '' },
        operador: '',
        fecha_campo: '',
        observaciones: '',
      })
      setEstForm(resetEstForm(1))
    }
  }, [open, initialPoligonalId, cargarDetalle, showError])

  const puntoBiblioteca = useMemo(
    () => puntosVerificados.find((p) => p.id === form.punto_inicial_id),
    [puntosVerificados, form.punto_inicial_id],
  )

  const seleccionarBmBiblioteca = (id) => {
    const p = puntosVerificados.find((x) => x.id === id)
    if (!p) {
      setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '' })
      return
    }
    setForm({
      ...form,
      amarreModo: 'biblioteca',
      punto_inicial_id: id,
      amarre: {
        nombre: p.nombre,
        norte: p.norte ?? '',
        este: p.este ?? '',
        cota: p.cota ?? '',
      },
    })
  }

  const iniciarPoligonal = async () => {
    if (!form.nombre.trim()) {
      setErrorModal({
        titulo: 'Nombre requerido',
        mensaje: 'Indique un nombre para identificar la poligonal (ej. Poligonal 1).',
      })
      return
    }
    if (form.amarreModo === 'biblioteca') {
      if (!form.punto_inicial_id) {
        setErrorModal({
          titulo: 'Punto de amarre requerido',
          mensaje: 'Seleccione un BM verificado de la biblioteca o ingrese las coordenadas del punto de amarre.',
        })
        return
      }
    } else if (!form.amarre.nombre.trim() || form.amarre.norte === '' || form.amarre.este === '' || form.amarre.cota === '') {
      setErrorModal({
        titulo: 'Punto de amarre requerido',
        mensaje: 'Indique nombre, Norte, Este y Cota del BM de amarre. La cota es necesaria para el calculo trigonométrico.',
      })
      return
    }
    setBusy(true)
    try {
      const payload = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        metodo: 'trigonometrica',
        tolerancia_relativa: Number(form.tolerancia_relativa) || 3000,
        tolerancia_cota_mm_km: Number(form.tolerancia_cota_mm_km) || 12,
        operador: form.operador || null,
        fecha_campo: form.fecha_campo || null,
        observaciones: form.observaciones || null,
      }
      if (form.amarreModo === 'biblioteca') {
        payload.punto_inicial_id = form.punto_inicial_id
        if (form.tipo === 'abierta' && form.punto_final_id) {
          payload.punto_final_id = form.punto_final_id
        }
      } else {
        payload.amarre_inicial = {
          nombre: form.amarre.nombre.trim(),
          norte: Number(form.amarre.norte),
          este: Number(form.amarre.este),
          cota: form.amarre.cota === '' ? null : Number(form.amarre.cota),
        }
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
      setErrorModal({ titulo: 'Angulo horizontal requerido', mensaje: 'Ingrese el angulo horizontal observado en formato GG.MMSS.' })
      return
    }
    if (!estForm.angulo_vertical_gms) {
      setErrorModal({ titulo: 'Angulo vertical requerido', mensaje: 'Ingrese el angulo vertical en formato GG.MMSS (desde la horizontal).' })
      return
    }
    if (estForm.altura_instrumento === '' || Number(estForm.altura_instrumento) < 0) {
      setErrorModal({ titulo: 'Altura de instrumento', mensaje: 'Indique la altura del instrumento (HI) en metros.' })
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
          angulo_vertical_gms: Number(estForm.angulo_vertical_gms),
          altura_instrumento: Number(estForm.altura_instrumento),
          distancia: Number(estForm.distancia),
          altura_objetivo: estForm.altura_objetivo === '' ? 0 : Number(estForm.altura_objetivo),
          lectura_mira: estForm.lectura_mira === '' ? null : Number(estForm.lectura_mira),
        }),
      })
      setEstForm(resetEstForm(Number(estForm.orden) + 1))
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
                Poligonal trigonométrica — ingrese estaciones con angulos horizontal/vertical, HI y distancia.
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
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Tolerancia plan 1:N</span>
                  <input type="number" value={form.tolerancia_relativa} onChange={(e) => setForm({ ...form, tolerancia_relativa: e.target.value })} style={inputStyle} />
                </label>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Tolerancia cota (mm/km)</span>
                  <input type="number" value={form.tolerancia_cota_mm_km} onChange={(e) => setForm({ ...form, tolerancia_cota_mm_km: e.target.value })} style={inputStyle} />
                </label>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Operador</span>
                  <input value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} style={inputStyle} />
                </label>
                <label>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Fecha campo</span>
                  <input type="date" value={form.fecha_campo} onChange={(e) => setForm({ ...form, fecha_campo: e.target.value })} style={inputStyle} />
                </label>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fafc' }}>
                <h4 style={{ margin: '0 0 8px' }}>Punto de amarre (inicio del circuito)</h4>
                <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', color: '#64748b' }}>
                  Defina aqui el BM de partida. Al cerrar la poligonal con cierre admisible, este punto y las estaciones calculadas pasan a la biblioteca.
                </p>

                {puntosVerificados.length > 0 && (
                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Opcional: usar BM verificado de biblioteca</span>
                    <select
                      value={form.amarreModo === 'biblioteca' ? form.punto_inicial_id : ''}
                      onChange={(e) => seleccionarBmBiblioteca(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">— Ingresar coordenadas manualmente —</option>
                      {puntosVerificados.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre} (N:{p.norte} E:{p.este})</option>
                      ))}
                    </select>
                  </label>
                )}

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: 480, width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={th}>Punto</th>
                        <th style={th}>Norte</th>
                        <th style={th}>Este</th>
                        <th style={th}>Cota</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={td}>
                          <input
                            value={form.amarre.nombre}
                            disabled={form.amarreModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, nombre: e.target.value } })}
                            style={inputStyle}
                            placeholder="BM-1"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={form.amarre.norte}
                            disabled={form.amarreModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, norte: e.target.value } })}
                            style={inputStyle}
                            placeholder="0.000"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={form.amarre.este}
                            disabled={form.amarreModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, este: e.target.value } })}
                            style={inputStyle}
                            placeholder="0.000"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={form.amarre.cota}
                            disabled={form.amarreModo === 'biblioteca'}
                            onChange={(e) => setForm({ ...form, amarreModo: 'inline', punto_inicial_id: '', amarre: { ...form.amarre, cota: e.target.value } })}
                            style={inputStyle}
                            placeholder="Cota"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: '#64748b' }}>
                  Formula altimetrica: ΔZ = HI + D·tan(angulo vertical) − HT
                </p>

                {form.amarreModo === 'biblioteca' && puntoBiblioteca && (
                  <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: '#166534' }}>
                    Usando BM verificado: {puntoBiblioteca.nombre}
                  </p>
                )}
              </div>

              {form.tipo === 'abierta' && puntosVerificados.length > 0 && (
                <label style={{ display: 'block', marginBottom: 16 }}>
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Punto final (poligonal abierta)</span>
                  <select value={form.punto_final_id} onChange={(e) => setForm({ ...form, punto_final_id: e.target.value })} style={inputStyle}>
                    <option value="">— Opcional —</option>
                    {puntosVerificados.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </label>
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
                  {' · '}Tolerancia plan 1:{detalle.poligonal?.tolerancia_relativa ?? 3000}
                  {' · '}Cota {detalle.poligonal?.tolerancia_cota_mm_km ?? 12} mm/km
                </span>
                {detalle.punto_inicial && (
                  <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>
                    Amarre: {detalle.punto_inicial.nombre} (N:{detalle.punto_inicial.norte} E:{detalle.punto_inicial.este} Z:{detalle.punto_inicial.cota ?? '—'})
                  </span>
                )}
                {resultado && (
                  <>
                    <Semaforo ok={resultado.admisible} labelOk="Cierre admisible" labelBad="Cierre inadmisible" />
                    {resultado.admisible_cota === false && (
                      <Semaforo ok={false} labelBad="Cota inadmisible" labelOk="" />
                    )}
                  </>
                )}
              </div>

              {puede(permisos, 'editar') && detalle.poligonal?.estado !== 'cerrado' && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fafc' }}>
                  <h4 style={{ marginTop: 0 }}>Agregar punto / estacion</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, alignItems: 'end' }}>
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Orden</span>
                      <input type="number" value={estForm.orden} onChange={(e) => setEstForm({ ...estForm, orden: e.target.value })} style={inputStyle} />
                    </label>
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Punto observado</span>
                      <input value={estForm.nombre_punto} onChange={(e) => setEstForm({ ...estForm, nombre_punto: e.target.value })} style={inputStyle} placeholder="Ej. P1" />
                    </label>
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>HI (m)</span>
                      <input value={estForm.altura_instrumento} onChange={(e) => setEstForm({ ...estForm, altura_instrumento: e.target.value })} style={inputStyle} placeholder="1.500" />
                    </label>
                    <TopoAngularInput label="Ang. horizontal (GG.MMSS)" value={estForm.angulo_gms} onChange={(_, v) => setEstForm({ ...estForm, angulo_gms: v })} />
                    <TopoAngularInput label="Ang. vertical (GG.MMSS)" value={estForm.angulo_vertical_gms} onChange={(_, v) => setEstForm({ ...estForm, angulo_vertical_gms: v })} />
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>Distancia (m)</span>
                      <input value={estForm.distancia} onChange={(e) => setEstForm({ ...estForm, distancia: e.target.value })} style={inputStyle} placeholder="0.000" />
                    </label>
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>HT (m)</span>
                      <input value={estForm.altura_objetivo} onChange={(e) => setEstForm({ ...estForm, altura_objetivo: e.target.value })} style={inputStyle} placeholder="0" />
                    </label>
                    <label>
                      <span style={{ fontSize: 'var(--cc-xs)', color: '#64748b' }}>LM (m)</span>
                      <input value={estForm.lectura_mira} onChange={(e) => setEstForm({ ...estForm, lectura_mira: e.target.value })} style={inputStyle} placeholder="Opcional" />
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
