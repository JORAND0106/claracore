import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Check, FileSpreadsheet, FileText, Image as ImageIcon, Pencil, Plus, Save, Trash2, X,
} from 'lucide-react'
import { formatCOP } from '../../utils/formatCOP'
import { formatFechaHoraColombia } from '../../utils/fechaColombia'
import { useClaraViewport } from '../../useClaraViewport'
import CajaMenorLogo from './CajaMenorLogo'
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
        width: 36,
        height: 36,
        minWidth: 36,
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
  const fileGasto = useRef(null)
  const fileIngreso = useRef(null)
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
  const abierta = caja?.estado === 'abierta'
  const enLegalizacion = caja?.estado === 'en_legalizacion'

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
      if (gastoId) {
        const g = (det.gastos || []).find((row) => Number(row.id) === Number(gastoId))
        if (g) verImagen('gastos', g.id, `Recibo ${g.consecutivo}`, det.caja.id)
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
    if (det?.caja) setGasto(null)
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
    if (det?.caja) setIngreso(null)
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

  return (
    <div style={{ color: t.text, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {detalle && (
          <IconBtn title="Volver a las cajas" t={t} onClick={() => { setDetalle(null); setPreview(null); cargarLista() }}>
            <ArrowLeft size={16} />
          </IconBtn>
        )}
        <CajaMenorLogo size={vp.isMobile ? 28 : 36} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--cc-lg)' }}>Caja Menor</div>
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
            {detalle
              ? `No. ${caja?.numero} · ${caja?.responsable_nombre || ''} · ${ETIQUETA_ESTADO[caja?.estado] || ''}`
              : (lista?.contrato?.numero || 'Contrato')}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {!detalle && acceso.crear && (
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
          {detalle && abierta && acceso.eliminar && !detalle.ingresos?.length && !detalle.gastos?.length && (
            <IconBtn
              title={borrarId === 'caja' ? 'Confirmar eliminación' : 'Eliminar caja'}
              t={t}
              disabled={ocupado}
              onClick={async () => {
                if (borrarId !== 'caja') { setBorrarId('caja'); return }
                setOcupado(true)
                try {
                  await api.eliminar(contratoId, caja.id)
                  setDetalle(null)
                  setBorrarId(null)
                  await cargarLista()
                } catch (e) {
                  setAviso({ tipo: 'error', texto: e.message })
                } finally {
                  setOcupado(false)
                }
              }}
            >
              <Trash2 size={16} />
            </IconBtn>
          )}
          {detalle && acceso.exportar && (
            <>
              <IconBtn title="Exportar Excel" t={t} disabled={ocupado} onClick={() => api.excel(contratoId, caja.id, `CajaMenor_${caja.numero}.xlsx`).catch((e) => setAviso({ tipo: 'error', texto: e.message }))}>
                <FileSpreadsheet size={16} />
              </IconBtn>
              <IconBtn title="Exportar recibos PDF" t={t} disabled={ocupado} onClick={() => api.pdf(contratoId, caja.id, `CajaMenor_${caja.numero}_recibos.pdf`).catch((e) => setAviso({ tipo: 'error', texto: e.message }))}>
                <FileText size={16} />
              </IconBtn>
            </>
          )}
        </div>
      </div>

      {aviso && (
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 10,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${t.border}`,
          background: t.bgCard,
          color: t.text,
          fontSize: 'var(--cc-sm)',
        }}
        >
          <span style={{ flex: 1 }}>{aviso.texto}</span>
          {aviso.tipo === 'duplicado' && (
            <IconBtn title="Continuar" t={t} disabled={ocupado} onClick={() => guardarGasto(true)}>
              <Check size={16} />
            </IconBtn>
          )}
          <IconBtn title="Cerrar aviso" t={t} onClick={() => setAviso(null)}><X size={14} /></IconBtn>
        </div>
      )}

      {cargando && <p style={{ color: t.textMuted }}>Cargando…</p>}

      {!detalle && !cargando && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: vp.isMobile ? 760 : 880 }}>
            <thead>
              <tr>
                {['No.', 'Responsable', 'Estado', 'Desde', 'Hasta', 'Fondo', 'Gastos', '%', 'Disponible', ''].map((h) => (
                  <th key={h || 'acc'} style={{ ...celda(t), background: t.headerBg, fontWeight: 700, textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {asignando && (
                <tr>
                  <td style={celda(t)} colSpan={9}>
                    <select
                      aria-label="Responsable"
                      value={responsableId}
                      onChange={(e) => setResponsableId(e.target.value)}
                      style={{ ...entrada(t), background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 6, minHeight: 36 }}
                    >
                      <option value="">Responsable</option>
                      {responsables.map((u) => (
                        <option key={u.id} value={u.id} disabled={u.tiene_abierta}>
                          {u.nombre}{u.tiene_abierta ? ' · caja abierta' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={celda(t)}>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <IconBtn title="Abrir caja" t={t} disabled={ocupado || !responsableId} onClick={async () => {
                        const det = await correr(() => api.crear(contratoId, Number(responsableId)))
                        if (det?.caja) {
                          setAsignando(false)
                          aplicar(det)
                        }
                      }}
                      >
                        <Check size={16} />
                      </IconBtn>
                      <IconBtn title="Cancelar" t={t} onClick={() => setAsignando(false)}><X size={16} /></IconBtn>
                    </span>
                  </td>
                </tr>
              )}
              {(lista?.cajas || []).map((row) => {
                const m = row.indicadores || {}
                return (
                  <tr key={row.id}>
                    <td style={celda(t)}>{row.numero}</td>
                    <td style={celda(t)}>{row.responsable_nombre}</td>
                    <td style={celda(t)}>{ETIQUETA_ESTADO[row.estado] || row.estado}</td>
                    <td style={celda(t)}>{row.periodo_desde || '—'}</td>
                    <td style={celda(t)}>{row.periodo_hasta || '—'}</td>
                    <td style={celda(t)}>{formatCOP(m.fondo_establecido)}</td>
                    <td style={celda(t)}>{formatCOP(m.gastos_periodo)}</td>
                    <td style={celda(t)}>{fmtPct(m.gasto_actual)}</td>
                    <td style={celda(t)}>{formatCOP(m.disponible)}</td>
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

      {detalle && !cargando && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: vp.isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 12,
          }}
          >
            {[
              ['Fondo establecido', formatCOP(ind?.fondo_establecido)],
              ['Gastos del periodo', formatCOP(ind?.gastos_periodo)],
              ['Gasto actual', fmtPct(ind?.gasto_actual)],
              ['Disponible en caja', formatCOP(ind?.disponible)],
            ].map(([k, v]) => (
              <div key={k} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 10px', background: t.bgCard }}>
                <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>{k}</div>
                <div style={{ fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '0 0 10px', color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
            {lista?.contrato?.contratista || detalle.contrato?.contratista} · NIT {detalle.contrato?.nit || '—'}
            {' · '}Saldo trasladado {formatCOP(ind?.saldo_trasladado)}
            {' · '}Consignaciones {formatCOP(ind?.consignaciones)}
            {ind?.gasto_actual != null && ind.gasto_actual >= 80 ? ' · Gasto al 80 % o más' : ''}
          </p>

          {meta && (
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <tbody>
                  <tr>
                    <th style={celda(t, { background: t.headerBg })}>Observaciones</th>
                    <td style={celda(t)}>
                      <input aria-label="Observaciones" disabled={bloqueada(caja) || !acceso.editar} value={meta.observaciones} onChange={(e) => setMeta({ ...meta, observaciones: e.target.value })} style={entrada(t)} />
                    </td>
                    <th style={celda(t, { background: t.headerBg })}>Control</th>
                    <td style={celda(t)}>
                      <input aria-label="Control" disabled={bloqueada(caja) || !acceso.editar} value={meta.control} onChange={(e) => setMeta({ ...meta, control: e.target.value })} style={entrada(t)} />
                    </td>
                    {acceso.editar && !bloqueada(caja) && (
                      <td style={celda(t)}>
                        <IconBtn title="Guardar observaciones" t={t} disabled={ocupado} onClick={() => correr(() => api.meta(contratoId, caja.id, meta))}>
                          <Save size={16} />
                        </IconBtn>
                      </td>
                    )}
                  </tr>
                  <tr>
                    {['firma_elaboro', 'firma_reviso', 'firma_aprobo'].map((clave) => (
                      <td key={clave} style={celda(t)} colSpan={clave === 'firma_aprobo' ? 2 : 1}>
                        <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
                          {clave === 'firma_elaboro' ? 'Elaboró' : clave === 'firma_reviso' ? 'Revisó' : 'Aprobó'}
                        </div>
                        <input
                          aria-label={clave}
                          disabled={bloqueada(caja) || !acceso.editar}
                          value={meta[clave]}
                          onChange={(e) => setMeta({ ...meta, [clave]: e.target.value })}
                          style={entrada(t)}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
            <strong style={{ fontSize: 'var(--cc-sm)' }}>Consignaciones</strong>
            {abierta && acceso.crear && (
              <IconBtn title="Nueva consignación" t={t} onClick={() => setIngreso({ fecha: hoyColombia(), valor: '', file: null })}>
                <Plus size={16} />
              </IconBtn>
            )}
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr>
                  {['Fecha', 'Valor', 'Soporte', ''].map((h) => (
                    <th key={h || 'a'} style={{ ...celda(t), background: t.headerBg }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ingreso && (
                  <tr>
                    <td style={celda(t)}>
                      <input type="date" aria-label="Fecha de consignación" max={hoyColombia()} value={ingreso.fecha} onChange={(e) => setIngreso({ ...ingreso, fecha: e.target.value })} style={entrada(t)} />
                    </td>
                    <td style={celda(t)}>
                      <input inputMode="numeric" aria-label="Valor de consignación" value={ingreso.valor} onChange={(e) => setIngreso({ ...ingreso, valor: e.target.value })} style={entrada(t)} />
                    </td>
                    <td style={celda(t)}>
                      <input ref={fileIngreso} type="file" accept="image/*" hidden onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const listo = await comprimirImagen(file)
                        setIngreso((prev) => (prev ? { ...prev, file: listo } : prev))
                      }}
                      />
                      <IconBtn title={ingreso.file ? 'Soporte listo. Puede pegar otra imagen' : 'Cargar o pegar soporte'} t={t} onClick={() => fileIngreso.current?.click()}>
                        <ImageIcon size={16} />
                      </IconBtn>
                    </td>
                    <td style={celda(t)}>
                      <span style={{ display: 'flex', gap: 4 }}>
                        <IconBtn title="Guardar consignación" t={t} disabled={ocupado} onClick={guardarIngreso}><Check size={16} /></IconBtn>
                        <IconBtn title="Cancelar" t={t} onClick={() => setIngreso(null)}><X size={16} /></IconBtn>
                      </span>
                    </td>
                  </tr>
                )}
                {(detalle.ingresos || []).map((row) => (
                  <tr key={row.id}>
                    <td style={celda(t)}>{row.fecha}</td>
                    <td style={celda(t)}>{formatCOP(row.valor)}</td>
                    <td style={celda(t)}>
                      <IconBtn title="Ver soporte" t={t} onClick={() => verImagen('ingresos', row.id, 'Consignación')}>
                        <ImageIcon size={16} />
                      </IconBtn>
                    </td>
                    <td style={celda(t)}>
                      {abierta && acceso.eliminar && (
                        <IconBtn title={borrarId === `i${row.id}` ? 'Confirmar eliminación' : 'Eliminar consignación'} t={t} onClick={() => {
                          if (borrarId !== `i${row.id}`) { setBorrarId(`i${row.id}`); return }
                          correr(() => api.eliminarIngreso(contratoId, caja.id, row.id))
                        }}
                        >
                          <Trash2 size={16} />
                        </IconBtn>
                      )}
                    </td>
                  </tr>
                ))}
                {!detalle.ingresos?.length && !ingreso && (
                  <tr><td style={celda(t)} colSpan={4}>Sin consignaciones.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
            <strong style={{ fontSize: 'var(--cc-sm)' }}>Gastos</strong>
            {abierta && acceso.crear && !gasto && (
              <IconBtn title="Nuevo gasto" t={t} onClick={() => setGasto(borradorGasto(detalle))}>
                <Plus size={16} />
              </IconBtn>
            )}
            {enLegalizacion && (acceso.editar || Number(usuario?.id || usuario?.sub) === Number(caja.responsable_id)) && (
              <span style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>En legalización</span>
            )}
            {abierta && (acceso.editar || Number(usuario?.id || usuario?.sub) === Number(caja.responsable_id)) && (
              <IconBtn title="Solicitar cierre" t={t} disabled={ocupado} onClick={() => correr(() => api.cierre(contratoId, caja.id))}>
                <Check size={16} />
              </IconBtn>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
              <thead>
                <tr>
                  {['#', 'Fecha', 'Tercero', 'NIT', 'Descripción', 'Documento', 'Centro', 'Bruto', 'IVA', 'Retenciones', 'Consumo', 'Otros', 'Neto', '', ''].map((h, i) => (
                    <th key={`${h}-${i}`} style={{ ...celda(t), background: t.headerBg, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gasto && (
                  <FilaGasto
                    t={t}
                    gasto={gasto}
                    setGasto={setGasto}
                    neto={netoBorrador}
                    ocupado={ocupado}
                    onArchivo={() => fileGasto.current?.click()}
                    onGuardar={() => guardarGasto(false)}
                    onCancelar={() => setGasto(null)}
                    onDocumento={(doc) => completarTercero(doc)}
                    imagenLista={!!gasto.file || !!gasto.id}
                  />
                )}
                {(detalle.gastos || []).filter((row) => Number(row.id) !== Number(gasto?.id || 0)).map((row) => (
                  <tr key={row.id} style={{ opacity: row.estado_validacion === 'rechazado' ? 0.55 : 1 }}>
                    <td style={celda(t)}>{row.consecutivo}</td>
                    <td style={celda(t)}>{row.fecha}</td>
                    <td style={celda(t)}>{row.tercero_razon_social}</td>
                    <td style={celda(t)}>{row.tercero_documento}</td>
                    <td style={celda(t)}>{row.descripcion}</td>
                    <td style={celda(t)}>{row.documento_no}</td>
                    <td style={celda(t)}>{row.centro_costos}</td>
                    <td style={celda(t)}>{formatCOP(row.valor_bruto)}</td>
                    <td style={celda(t)}>{formatCOP(row.iva)}</td>
                    <td style={celda(t)}>{formatCOP(row.retenciones)}</td>
                    <td style={celda(t)}>{formatCOP(row.impuesto_consumo)}</td>
                    <td style={celda(t)}>{formatCOP(row.otros_deducibles)}</td>
                    <td style={celda(t)}>{row.estado_validacion === 'rechazado' ? formatCOP(0) : formatCOP(row.valor_neto)}</td>
                    <td style={celda(t)}>
                      <IconBtn title="Ver recibo" t={t} onClick={() => verImagen('gastos', row.id, `Recibo ${row.consecutivo}`)}>
                        <ImageIcon size={16} />
                      </IconBtn>
                    </td>
                    <td style={celda(t)}>
                      <span style={{ display: 'flex', gap: 4 }}>
                        {enLegalizacion && acceso.validar && row.estado_validacion === 'pendiente' && (
                          <>
                            <IconBtn title="Aprobar gasto" t={t} disabled={ocupado} onClick={() => correr(() => api.validar(contratoId, caja.id, row.id, { decision: 'aprobado', observacion: '' }))}>
                              <Check size={16} />
                            </IconBtn>
                            <IconBtn title="Rechazar gasto" t={t} onClick={() => setRechazo({ id: row.id, texto: '' })}>
                              <X size={16} />
                            </IconBtn>
                          </>
                        )}
                        {abierta && acceso.editar && row.estado_validacion === 'pendiente' && (
                          <IconBtn
                            title="Editar gasto"
                            t={t}
                            onClick={() => setGasto({
                              id: row.id,
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
                            })}
                          >
                            <Pencil size={16} />
                          </IconBtn>
                        )}
                        {abierta && acceso.eliminar && (
                          <IconBtn title={borrarId === `g${row.id}` ? 'Confirmar eliminación' : 'Eliminar gasto'} t={t} onClick={() => {
                            if (borrarId !== `g${row.id}`) { setBorrarId(`g${row.id}`); return }
                            correr(() => api.eliminarGasto(contratoId, caja.id, row.id))
                          }}
                          >
                            <Trash2 size={16} />
                          </IconBtn>
                        )}
                        {row.estado_validacion !== 'pendiente' && (
                          <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>{ETIQUETA_ESTADO[row.estado_validacion]}</span>
                        )}
                      </span>
                      {rechazo?.id === row.id && (
                        <span style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          <input
                            aria-label="Observación del rechazo"
                            placeholder="Observación"
                            value={rechazo.texto}
                            onChange={(e) => setRechazo({ ...rechazo, texto: e.target.value })}
                            style={{ ...entrada(t), border: `1px solid ${t.border}`, borderRadius: 6, background: t.inputBg }}
                          />
                          <IconBtn title="Confirmar rechazo" t={t} disabled={ocupado || !rechazo.texto.trim()} onClick={async () => {
                            const det = await correr(() => api.validar(contratoId, caja.id, row.id, { decision: 'rechazado', observacion: rechazo.texto.trim() }))
                            if (det?.caja) setRechazo(null)
                          }}
                          >
                            <Check size={16} />
                          </IconBtn>
                        </span>
                      )}
                      {row.observacion_validacion ? (
                        <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>{row.observacion_validacion}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!detalle.gastos?.length && !gasto && (
                  <tr><td style={celda(t)} colSpan={15}>Sin gastos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <input
            ref={fileGasto}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) await tomarRecibo(file)
            }}
          />
          {preview && (
            <div style={{ marginTop: 12, border: `1px solid ${t.border}`, borderRadius: 8, padding: 8, background: t.bgCard }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 'var(--cc-sm)' }}>{preview.titulo}</span>
                <IconBtn title="Cerrar imagen" t={t} onClick={() => setPreview(null)}><X size={14} /></IconBtn>
              </div>
              <img src={preview.url} alt={preview.titulo} style={{ maxWidth: '100%', maxHeight: vp.isMobile ? 320 : 520, objectFit: 'contain' }} />
            </div>
          )}
          {caja?.legalizada_en && (
            <p style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
              Legalizada {formatFechaHoraColombia(caja.legalizada_en)}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function bloqueada(caja) {
  return caja?.estado === 'legalizada'
}

function FilaGasto({ t, gasto, setGasto, neto, ocupado, onArchivo, onGuardar, onCancelar, onDocumento, imagenLista }) {
  const set = (clave) => (e) => setGasto({ ...gasto, [clave]: e.target.value })
  const campo = (clave, label, tipo = 'text') => (
    <td style={celda(t)}>
      <input
        aria-label={label}
        type={tipo}
        max={tipo === 'date' ? hoyColombia() : undefined}
        value={gasto[clave] ?? ''}
        onChange={set(clave)}
        onBlur={clave === 'tercero_documento' ? () => onDocumento(gasto.tercero_documento) : undefined}
        style={entrada(t)}
      />
    </td>
  )
  return (
    <tr>
      <td style={celda(t)} />
      {campo('fecha', 'Fecha', 'date')}
      {campo('tercero_razon_social', 'Tercero')}
      {campo('tercero_documento', 'NIT o cédula')}
      {campo('descripcion', 'Descripción')}
      {campo('documento_no', 'Documento No.')}
      {campo('centro_costos', 'Centro de costos')}
      {campo('valor_bruto', 'Valor bruto')}
      {campo('iva', 'IVA')}
      {campo('retenciones', 'Retenciones')}
      {campo('impuesto_consumo', 'Impuesto al consumo')}
      {campo('otros_deducibles', 'Otros deducibles')}
      <td style={celda(t)}>{formatCOP(neto > 0 ? neto : 0)}</td>
      <td style={celda(t)}>
        <IconBtn title={imagenLista ? 'Recibo listo. Puede pegar otra imagen' : 'Cargar o pegar recibo'} t={t} onClick={onArchivo}><ImageIcon size={16} /></IconBtn>
      </td>
      <td style={celda(t)}>
        <span style={{ display: 'flex', gap: 4 }}>
          <IconBtn title="Guardar gasto" t={t} disabled={ocupado || neto <= 0} onClick={onGuardar}><Check size={16} /></IconBtn>
          <IconBtn title="Cancelar" t={t} onClick={onCancelar}><X size={16} /></IconBtn>
        </span>
      </td>
    </tr>
  )
}
