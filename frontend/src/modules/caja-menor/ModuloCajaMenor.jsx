import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Check, Plus, Trash2, X,
} from 'lucide-react'
import { formatCOP } from '../../utils/formatCOP'
import { useClaraViewport } from '../../useClaraViewport'
import CajaMenorLogo from './CajaMenorLogo'
import CajaMenorDetalle from './CajaMenorDetalle'
import { createCajaMenorApi, fdGasto, fdIngreso } from './cajaMenorApi'
import { ETIQUETA_ESTADO, fmtPct, hoyColombia, normalizarDocumento, valorNeto } from './cajaMenorCalc'
import { accesoCajaMenor, esDesarrolladorCajaMenor } from './cajaMenorPermisos'
import { comprimirImagen, imagenDePortapapeles } from './cajaMenorImagen'

function IconBtn({ title, onClick, disabled, children, t, tono }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        minWidth: 40,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        border: `1px solid ${t.border}`,
        background: tono || t.bgCard,
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

function celda(t, extra) {
  return {
    border: `1px solid ${t.border}`,
    padding: '4px 6px',
    color: t.text,
    background: t.bgCard,
    fontSize: 'var(--cc-sm)',
    verticalAlign: 'middle',
    ...extra,
  }
}

function entrada(t) {
  return {
    width: '100%',
    minWidth: 72,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: t.text,
    fontSize: 'var(--cc-sm)',
    padding: '6px 2px',
    boxSizing: 'border-box',
  }
}

function borradorGasto(det) {
  return {
    fecha: hoyColombia(),
    tercero_razon_social: '',
    tercero_documento: '',
    descripcion: '',
    documento_no: det?.documento_sugerido || '',
    centro_costos: det?.contrato?.numero || '',
    valor_bruto: '',
    iva: '0',
    retenciones: '0',
    impuesto_consumo: '0',
    otros_deducibles: '0',
    total_leido: null,
    file: null,
  }
}

export default function ModuloCajaMenor({
  t,
  usuario,
  token,
  contratoId,
  deepLink,
  onDeepLinkConsumed,
}) {
  const api = useMemo(() => createCajaMenorApi(token), [token])
  const vp = useClaraViewport()
  const accesoLocal = accesoCajaMenor(usuario, contratoId)
  const deepInicial = useRef(deepLink)
  const [lista, setLista] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [responsables, setResponsables] = useState([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState(null)
  const [asignando, setAsignando] = useState(false)
  const [responsableId, setResponsableId] = useState('')
  const [meta, setMeta] = useState(null)
  const [ingreso, setIngreso] = useState(null)
  const [gasto, setGasto] = useState(null)
  const [rechazo, setRechazo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [borrarId, setBorrarId] = useState(null)
  const [panel, setPanel] = useState(null)
  const [vista, setVista] = useState('lista')
  const [origen, setOrigen] = useState('lista')
  const tomarRef = useRef(null)

  const accesoRemoto = detalle?.acceso || lista?.acceso
  const acceso = esDesarrolladorCajaMenor(usuario)
    ? accesoLocal
    : {
        ...(accesoRemoto || accesoLocal),
        puedeEntrar: accesoRemoto ? !!accesoRemoto.ver : !!accesoLocal.puedeEntrar,
      }
  const caja = detalle?.caja
  const ind = detalle?.indicadores

  function aplicar(det) {
    setDetalle(det)
    setMeta({
      observaciones: det?.caja?.observaciones || '',
      control: det?.caja?.control || '',
      firma_elaboro: det?.caja?.firma_elaboro || '',
      firma_reviso: det?.caja?.firma_reviso || '',
      firma_aprobo: det?.caja?.firma_aprobo || '',
    })
  }

  async function cargarLista() {
    setCargando(true)
    setAviso(null)
    try {
      const data = await api.listar(contratoId)
      setLista(data)
      setDetalle(null)
    } catch (e) {
      setAviso({ tipo: 'error', texto: e.message })
    } finally {
      setCargando(false)
    }
  }

  async function abrir(cajaId, gastoId) {
    setCargando(true)
    setAviso(null)
    try {
      const det = await api.detalle(contratoId, cajaId)
      aplicar(det)
      setPanel(null)
      setVista('lista')
      setOrigen('lista')
      if (gastoId) {
        const g = (det.gastos || []).find((row) => Number(row.id) === Number(gastoId))
        if (g) {
          setPanel('gastos')
          setVista('imagen')
          verImagen('gastos', g.id, `Recibo ${g.consecutivo}`, det.caja.id)
        }
      }
    } catch (e) {
      setAviso({ tipo: 'error', texto: e.message })
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    if (!contratoId) {
      setCargando(false)
      return undefined
    }
    let vivo = true
    const deep = deepInicial.current
    ;(async () => {
      if (deep?.cajaId && (!deep.contratoId || Number(deep.contratoId) === Number(contratoId))) {
        await abrir(deep.cajaId, deep.gastoId)
        if (vivo) onDeepLinkConsumed?.()
      } else if (vivo) {
        await cargarLista()
      }
    })()
    return () => { vivo = false }
    // La caja del enlace se abre una vez por contrato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId, token])

  const modoPegado = gasto ? 'gasto' : ingreso ? 'ingreso' : ''
  useEffect(() => {
    if (!modoPegado) return undefined
    const onPaste = async (event) => {
      const file = imagenDePortapapeles(event)
      if (!file) return
      event.preventDefault()
      if (modoPegado === 'gasto') {
        await tomarRef.current?.(file)
        return
      }
      const listo = await comprimirImagen(file)
      setIngreso((prev) => (prev ? { ...prev, file: listo } : prev))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [modoPegado])

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
  }, [preview])

  async function verImagen(kind, itemId, titulo, cajaDestino = caja?.id) {
    if (!cajaDestino) return
    if (preview?.url) URL.revokeObjectURL(preview.url)
    try {
      const url = await api.soporteUrl(contratoId, cajaDestino, kind, itemId)
      setPreview({ url, titulo })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e.message })
    }
  }

  async function tomarRecibo(file) {
    const listo = await comprimirImagen(file)
    setGasto((prev) => ({ ...(prev || borradorGasto(detalle)), file: listo }))
    if (!acceso.crear) return
    try {
      const fd = new FormData()
      fd.append('soporte', listo, listo.name || 'soporte.jpg')
      const leido = await api.ocr(contratoId, fd)
      const sug = leido?.sugerencias || {}
      setGasto((prev) => ({
        ...(prev || borradorGasto(detalle)),
        file: listo,
        fecha: sug.fecha && sug.fecha <= hoyColombia() ? sug.fecha : (prev?.fecha || hoyColombia()),
        tercero_razon_social: sug.tercero_razon_social || prev?.tercero_razon_social || '',
        tercero_documento: sug.tercero_documento || prev?.tercero_documento || '',
        descripcion: sug.descripcion || prev?.descripcion || '',
        documento_no: sug.documento_no || prev?.documento_no || detalle?.documento_sugerido || '',
        valor_bruto: sug.valor_bruto ?? prev?.valor_bruto ?? '',
        iva: sug.iva ?? prev?.iva ?? '0',
        retenciones: sug.retenciones ?? prev?.retenciones ?? '0',
        impuesto_consumo: sug.impuesto_consumo ?? prev?.impuesto_consumo ?? '0',
        otros_deducibles: sug.otros_deducibles ?? prev?.otros_deducibles ?? '0',
        total_leido: sug.total_leido ?? null,
      }))
      if (sug.total_leido != null) {
        setAviso({ tipo: 'info', texto: leido.mensaje || 'Revise los datos antes de guardar.' })
      }
      if (sug.tercero_documento) completarTercero(sug.tercero_documento)
    } catch (e) {
      setAviso({ tipo: 'info', texto: e.message })
    }
  }

  async function completarTercero(documento) {
    if (normalizarDocumento(documento).length < 5) return
    try {
      const r = await api.tercero(contratoId, documento)
      if (r?.encontrado && r.razon_social) {
        setGasto((prev) => prev ? { ...prev, tercero_razon_social: r.razon_social } : prev)
      }
    } catch { /* la razón social se escribe a mano */ }
  }

  async function correr(fn) {
    setOcupado(true)
    setAviso(null)
    try {
      const det = await fn()
      if (det?.caja) aplicar(det)
      else if (det?.cajas) setLista(det)
      setBorrarId(null)
      return det
    } catch (e) {
      if (e.status === 409) {
        setAviso({
          tipo: 'duplicado',
          texto: e.payload?.detail?.mensaje || e.message,
        })
      } else {
        setAviso({ tipo: 'error', texto: e.message })
      }
      return null
    } finally {
      setOcupado(false)
    }
  }

  async function guardarGasto(confirmar) {
    if (!gasto?.id && !gasto?.file) {
      setAviso({ tipo: 'error', texto: 'Falta la imagen del recibo.' })
      return
    }
    const fd = fdGasto(gasto, gasto.file, confirmar)
    const det = await correr(() => (
      gasto?.id
        ? api.editarGasto(contratoId, caja.id, gasto.id, fd)
        : api.gasto(contratoId, caja.id, fd)
    ))
    if (det?.caja) {
      setGasto(null)
      setVista('lista')
      setRechazo(null)
    }
  }

  tomarRef.current = tomarRecibo

  async function guardarIngreso() {
    if (!ingreso?.file) {
      setAviso({ tipo: 'error', texto: 'Falta la imagen de la consignación.' })
      return
    }
    const det = await correr(() => api.ingreso(
      contratoId, caja.id, fdIngreso(ingreso.fecha, ingreso.valor, ingreso.file),
    ))
    if (det?.caja) {
      setIngreso(null)
      setVista('lista')
    }
  }

  function abrirPanel(nombre) {
    setPanel(nombre)
    setVista('lista')
    setOrigen('lista')
    setIngreso(null)
    setGasto(null)
    setRechazo(null)
    setPreview(null)
  }

  function cerrarPanel() {
    setPanel(null)
    setVista('lista')
    setOrigen('lista')
    setIngreso(null)
    setGasto(null)
    setRechazo(null)
    setPreview(null)
  }

  function volverVista() {
    if (vista === 'imagen' && origen !== 'lista') {
      setVista(origen)
      setPreview(null)
      return
    }
    setVista('lista')
    setOrigen('lista')
    setIngreso(null)
    setGasto(null)
    setRechazo(null)
    setPreview(null)
  }

  function nuevaConsignacion() {
    setIngreso({ fecha: hoyColombia(), valor: '', file: null })
    setVista('formulario')
  }

  function nuevoGasto() {
    setGasto(borradorGasto(detalle))
    setVista('formulario')
  }

  function editarGasto(row) {
    setGasto({
      id: row.id,
      consecutivo: row.consecutivo,
      fecha: row.fecha || hoyColombia(),
      tercero_razon_social: row.tercero_razon_social || '',
      tercero_documento: row.tercero_documento || '',
      descripcion: row.descripcion || '',
      documento_no: row.documento_no || '',
      centro_costos: row.centro_costos || '',
      valor_bruto: row.valor_bruto ?? '',
      iva: row.iva ?? '0',
      retenciones: row.retenciones ?? '0',
      impuesto_consumo: row.impuesto_consumo ?? '0',
      otros_deducibles: row.otros_deducibles ?? '0',
      total_leido: null,
      file: null,
    })
    setVista('formulario')
  }

  function verSoporte(kind, itemId, titulo) {
    setOrigen(vista)
    setVista('imagen')
    verImagen(kind, itemId, titulo)
  }

  function revisarGasto(row) {
    setRechazo({ id: row.id, texto: '', consecutivo: row.consecutivo })
    setVista('validar')
    verImagen('gastos', row.id, `Recibo ${row.consecutivo}`)
  }

  if (!contratoId) {
    return <p style={{ color: t.textMuted }}>Seleccione un contrato.</p>
  }
  if (!acceso.puedeEntrar && !detalle && !cargando) {
    return (
      <div style={{ maxWidth: 520, margin: '24px auto', textAlign: 'center', color: t.text }}>
        <CajaMenorLogo size={42} />
        <p>Caja Menor</p>
        <p style={{ color: t.textMuted }}>
          Tu cargo no tiene permiso. Se habilita en Gestión de Cargos, función Caja Menor, acción Ver.
        </p>
      </div>
    )
  }

  const netoBorrador = gasto ? valorNeto({
    bruto: gasto.valor_bruto,
    iva: gasto.iva,
    retenciones: gasto.retenciones,
    impuestoConsumo: gasto.impuesto_consumo,
    otros: gasto.otros_deducibles,
  }) : 0
  const movil = vp.isMobile || vp.isLandscapeMobile

  function volverCajas() {
    setDetalle(null)
    setPanel(null)
    setVista('lista')
    setIngreso(null)
    setGasto(null)
    setRechazo(null)
    setPreview(null)
    cargarLista()
  }

  return (
    <div style={{ color: t.text, minWidth: 0 }}>
      {cargando && <p style={{ color: t.textMuted }}>Cargando…</p>}

      {!detalle && !cargando && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <CajaMenorLogo size={movil ? 36 : 40} plate={t.bgCard} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--cc-lg)' }}>Caja Menor</div>
              <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>{lista?.contrato?.numero || 'Contrato'}</div>
            </div>
            {acceso.crear && (
              <IconBtn title="Asignar caja" t={t} onClick={async () => {
                setAsignando(true)
                try { setResponsables(await api.responsables(contratoId)) } catch (e) {
                  setAviso({ tipo: 'error', texto: e.message })
                }
              }}
              >
                <Plus size={16} />
              </IconBtn>
            )}
          </div>

          {aviso && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, padding: '8px 10px',
              borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontSize: 'var(--cc-sm)',
            }}
            >
              <span style={{ flex: 1 }}>{aviso.texto}</span>
              <IconBtn title="Cerrar aviso" t={t} onClick={() => setAviso(null)}><X size={14} /></IconBtn>
            </div>
          )}

          {asignando && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <select
                aria-label="Responsable"
                value={responsableId}
                onChange={(e) => setResponsableId(e.target.value)}
                style={{ ...entrada(t), background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 8, minHeight: 40, flex: 1 }}
              >
                <option value="">Responsable</option>
                {responsables.map((u) => (
                  <option key={u.id} value={u.id} disabled={u.tiene_abierta}>
                    {u.nombre}{u.tiene_abierta ? ' · caja abierta' : ''}
                  </option>
                ))}
              </select>
              <IconBtn title="Abrir caja" t={t} disabled={ocupado || !responsableId} onClick={async () => {
                const det = await correr(() => api.crear(contratoId, Number(responsableId)))
                if (det?.caja) {
                  setAsignando(false)
                  setPanel(null)
                  aplicar(det)
                }
              }}
              >
                <Check size={16} />
              </IconBtn>
              <IconBtn title="Cancelar" t={t} onClick={() => setAsignando(false)}><X size={16} /></IconBtn>
            </div>
          )}

          {movil ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {(lista?.cajas || []).map((row) => {
                const m = row.indicadores || {}
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => abrir(row.id)}
                    style={{
                      textAlign: 'left', border: `1px solid ${t.border}`, borderRadius: 12, background: t.bgCard,
                      color: t.text, padding: 12, cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>No. {row.numero}</strong>
                      <span>{ETIQUETA_ESTADO[row.estado] || row.estado}</span>
                    </div>
                    <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)', marginTop: 4 }}>{row.responsable_nombre}</div>
                    <div style={{ fontSize: 'var(--cc-sm)', marginTop: 6 }}>
                      Fondo {formatCOP(m.fondo_establecido)} · Disponible {formatCOP(m.disponible)}
                    </div>
                  </button>
                )
              })}
              {!lista?.cajas?.length && !asignando && <p style={{ color: t.textMuted }}>Sin cajas.</p>}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['No.', 'Responsable', 'Estado', 'Desde', 'Hasta', 'Fondo', 'Gastos', '%', 'Disponible', ''].map((h) => (
                      <th key={h || 'acc'} style={{ ...celda(t), background: t.headerBg, fontWeight: 700, textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(lista?.cajas || []).map((row) => {
                    const m = row.indicadores || {}
                    return (
                      <tr key={row.id}>
                        <td style={celda(t)}>{row.numero}</td>
                        <td style={celda(t)}>{row.responsable_nombre}</td>
                        <td style={celda(t)}>{ETIQUETA_ESTADO[row.estado] || row.estado}</td>
                        <td style={celda(t)}>{row.periodo_desde || '—'}</td>
                        <td style={celda(t)}>{row.periodo_hasta || '—'}</td>
                        <td style={{ ...celda(t), textAlign: 'right' }}>{formatCOP(m.fondo_establecido)}</td>
                        <td style={{ ...celda(t), textAlign: 'right' }}>{formatCOP(m.gastos_periodo)}</td>
                        <td style={celda(t)}>{fmtPct(m.gasto_actual)}</td>
                        <td style={{ ...celda(t), textAlign: 'right' }}>{formatCOP(m.disponible)}</td>
                        <td style={celda(t)}>
                          <IconBtn title="Abrir caja" t={t} onClick={() => abrir(row.id)}>
                            <ArrowLeft size={16} style={{ transform: 'rotate(180deg)' }} />
                          </IconBtn>
                        </td>
                      </tr>
                    )
                  })}
                  {!lista?.cajas?.length && !asignando && (
                    <tr><td style={celda(t)} colSpan={10}>Sin cajas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {detalle && !cargando && (
        <CajaMenorDetalle
          t={t}
          vp={vp}
          api={api}
          contratoId={contratoId}
          caja={caja}
          detalle={detalle}
          ind={ind}
          meta={meta}
          setMeta={setMeta}
          acceso={acceso}
          usuario={usuario}
          aviso={aviso}
          ocupado={ocupado}
          borrarId={borrarId}
          panel={panel}
          vista={vista}
          ingreso={ingreso}
          gasto={gasto}
          rechazo={rechazo}
          preview={preview}
          neto={netoBorrador}
          setIngreso={setIngreso}
          setGasto={setGasto}
          setRechazo={setRechazo}
          onVolverCajas={volverCajas}
          onEliminarCaja={async () => {
            if (borrarId !== 'caja') { setBorrarId('caja'); return }
            setOcupado(true)
            try {
              await api.eliminar(contratoId, caja.id)
              setBorrarId(null)
              volverCajas()
            } catch (e) {
              setAviso({ tipo: 'error', texto: e.message })
            } finally {
              setOcupado(false)
            }
          }}
          onExcel={() => api.excel(contratoId, caja.id, `CajaMenor_${caja.numero}.xlsx`).catch((e) => setAviso({ tipo: 'error', texto: e.message }))}
          onPdf={() => api.pdf(contratoId, caja.id, `CajaMenor_${caja.numero}_recibos.pdf`).catch((e) => setAviso({ tipo: 'error', texto: e.message }))}
          onCierre={() => correr(() => api.cierre(contratoId, caja.id))}
          onGuardarMeta={() => correr(() => api.meta(contratoId, caja.id, meta))}
          onAbrirPanel={abrirPanel}
          onCerrarPanel={cerrarPanel}
          onVolverVista={volverVista}
          onNuevaConsignacion={nuevaConsignacion}
          onGuardarIngreso={guardarIngreso}
          onEliminarIngreso={(row) => {
            if (borrarId !== `i${row.id}`) { setBorrarId(`i${row.id}`); return }
            correr(() => api.eliminarIngreso(contratoId, caja.id, row.id))
          }}
          onNuevoGasto={nuevoGasto}
          onEditarGasto={editarGasto}
          onGuardarGasto={guardarGasto}
          onDocumento={completarTercero}
          onTomarRecibo={tomarRecibo}
          onVerSoporte={verSoporte}
          onAprobar={async (row) => {
            const det = await correr(() => api.validar(contratoId, caja.id, row.id, { decision: 'aprobado', observacion: '' }))
            if (det?.caja) {
              setRechazo(null)
              setVista('lista')
              setPreview(null)
            }
          }}
          onPedirRechazo={revisarGasto}
          onConfirmarRechazo={async () => {
            const det = await correr(() => api.validar(contratoId, caja.id, rechazo.id, { decision: 'rechazado', observacion: rechazo.texto.trim() }))
            if (det?.caja) {
              setRechazo(null)
              setVista('lista')
              setPreview(null)
            }
          }}
          onEliminarGasto={(row) => {
            if (borrarId !== `g${row.id}`) { setBorrarId(`g${row.id}`); return }
            correr(() => api.eliminarGasto(contratoId, caja.id, row.id))
          }}
          onCerrarAviso={() => setAviso(null)}
        />
      )}
    </div>
  )
}
