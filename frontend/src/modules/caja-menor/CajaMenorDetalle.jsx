import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Camera, Check, FileSpreadsheet, FileText, Image as ImageIcon, Pencil, Plus, Save, Trash2, X,
} from 'lucide-react'
import { formatCOP } from '../../utils/formatCOP'
import { formatFechaHoraColombia } from '../../utils/fechaColombia'
import CajaMenorLogo from './CajaMenorLogo'
import { ETIQUETA_ESTADO, fmtPct, hoyColombia } from './cajaMenorCalc'
import { comprimirImagen } from './cajaMenorImagen'

function IconBtn({ title, onClick, disabled, children, t }) {
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
        borderRadius: 10,
        border: `1px solid ${t.border}`,
        background: t.bgCard,
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

function bloqueada(caja) {
  return caja?.estado === 'legalizada'
}

function tonoEstado(estado) {
  if (estado === 'abierta') return { fondo: '#0E7490', texto: '#F0F9FF' }
  if (estado === 'en_legalizacion') return { fondo: '#B45309', texto: '#FFF7ED' }
  if (estado === 'legalizada') return { fondo: '#475569', texto: '#F8FAFC' }
  if (estado === 'aprobado') return { fondo: '#047857', texto: '#ECFDF5' }
  if (estado === 'rechazado') return { fondo: '#B91C1C', texto: '#FEF2F2' }
  return { fondo: '#64748B', texto: '#F8FAFC' }
}

function Etiqueta({ estado }) {
  const tono = tonoEstado(estado)
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 26,
      padding: '2px 10px',
      borderRadius: 999,
      background: tono.fondo,
      color: tono.texto,
      fontSize: 'var(--cc-caption)',
      fontWeight: 700,
      letterSpacing: '0.02em',
    }}
    >
      {ETIQUETA_ESTADO[estado] || estado || '—'}
    </span>
  )
}

function colorGasto(pct, t) {
  if (pct == null) return t.border
  if (pct >= 80) return '#DC2626'
  if (pct >= 70) return '#D97706'
  return t.primary
}

function colorNegativo(t) {
  return t.bg === '#0A1628' ? '#FCA5A5' : '#B91C1C'
}

function celda(t, extra) {
  return {
    border: `1px solid ${t.border}`,
    padding: '8px 10px',
    color: t.text,
    background: t.bgCard,
    fontSize: 'var(--cc-sm)',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    ...extra,
  }
}

function campo(t) {
  return {
    width: '100%',
    minHeight: 40,
    border: `1px solid ${t.inputBorder || t.border}`,
    borderRadius: 8,
    background: t.inputBg,
    color: t.text,
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
    boxSizing: 'border-box',
  }
}

function etiquetaCampo(t) {
  return { display: 'block', color: t.textMuted, fontSize: 'var(--cc-caption)', marginBottom: 4 }
}

function Aviso({ aviso, t, ocupado, onContinuar, onCerrar }) {
  if (!aviso) return null
  return (
    <div style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      marginBottom: 12,
      padding: '8px 10px',
      borderRadius: 10,
      border: `1px solid ${t.border}`,
      background: t.bgCard,
      color: t.text,
      fontSize: 'var(--cc-sm)',
    }}
    >
      <span style={{ flex: 1 }}>{aviso.texto}</span>
      {aviso.tipo === 'duplicado' && (
        <IconBtn title="Continuar" t={t} disabled={ocupado} onClick={onContinuar}><Check size={16} /></IconBtn>
      )}
      <IconBtn title="Cerrar aviso" t={t} onClick={onCerrar}><X size={14} /></IconBtn>
    </div>
  )
}

function Miniatura({ url, titulo, onAmpliar, t }) {
  return (
    <button
      type="button"
      title="Ampliar soporte"
      aria-label="Ampliar soporte"
      onClick={onAmpliar}
      style={{
        width: 44,
        height: 44,
        padding: 0,
        borderRadius: 8,
        border: `1px solid ${t.border}`,
        background: t.inputBg,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <img src={url} alt={titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <ImageIcon size={16} color={t.textMuted} />
      )}
    </button>
  )
}

function useSoporte(api, contratoId, cajaId, kind, itemId, activo) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!activo || !itemId || !cajaId) return undefined
    let vivo = true
    let creado = null
    api.soporteUrl(contratoId, cajaId, kind, itemId)
      .then((u) => {
        if (!vivo) URL.revokeObjectURL(u)
        else { creado = u; setUrl(u) }
      })
      .catch(() => { if (vivo) setUrl(null) })
    return () => {
      vivo = false
      if (creado) URL.revokeObjectURL(creado)
    }
  }, [api, contratoId, cajaId, kind, itemId, activo])
  return url
}

function VistaLocal({ file }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!file) { setUrl(null); return undefined }
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  if (!url) return null
  return <img src={url} alt="Vista previa" style={{ width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 8 }} />
}

function EncabezadoPopup({ t, titulo, caja, vista, onVolver, onCerrar }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: 12,
      alignItems: 'center',
      padding: '12px 14px',
      borderBottom: `1px solid ${t.border}`,
      background: t.headerBg,
    }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {vista !== 'lista' && (
          <IconBtn title="Volver" t={t} onClick={onVolver}><ArrowLeft size={16} /></IconBtn>
        )}
        <CajaMenorLogo size={40} plate={t.bgCard} />
      </div>
      <div style={{ textAlign: 'center', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--cc-lg)' }}>{titulo}</div>
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
          Caja No. {caja?.numero} · {caja?.responsable_nombre || 'Responsable'}
        </div>
      </div>
      <IconBtn title="Cerrar" t={t} onClick={onCerrar}><X size={16} /></IconBtn>
    </div>
  )
}

function MarcoPopup({ t, movil, children }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: t.overlay,
        display: 'flex',
        alignItems: movil ? 'stretch' : 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
        width: movil ? '100%' : 'calc(100vw - 16px)',
        maxWidth: movil ? '100%' : 'calc(100vw - 16px)',
        height: movil ? '100%' : 'auto',
        maxHeight: movil ? '100%' : '94vh',
        background: t.bg,
        color: t.text,
        borderRadius: movil ? 0 : 16,
        border: movil ? 'none' : `1px solid ${t.border}`,
        boxShadow: t.shadow,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      >
        {children}
      </div>
    </div>
  )
}

export default function CajaMenorDetalle(props) {
  const {
    t, vp, api, contratoId, caja, detalle, ind, meta, setMeta, acceso, usuario,
    aviso, ocupado, borrarId, panel, vista, ingreso, gasto, rechazo, preview, neto, leyendo,
    onVolverCajas, onEliminarCaja, onExcel, onPdf, onCierre, onGuardarMeta,
    onAbrirPanel, onCerrarPanel, onVolverVista,
    setIngreso, onGuardarIngreso, onEliminarIngreso,
    setGasto, onGuardarGasto, onNuevoGasto, onEditarGasto, onDocumento, onTomarRecibo,
    onAprobar, onPedirRechazo, setRechazo, onConfirmarRechazo, onEliminarGasto,
    onVerSoporte, onCerrarAviso,
  } = props
  const movil = vp.isMobile || vp.isLandscapeMobile
  const contrato = detalle?.contrato || {}
  const ingresos = detalle?.ingresos || []
  const gastos = detalle?.gastos || []
  const puedeCerrar = caja?.estado === 'abierta' && (
    acceso.editar || Number(usuario?.id || usuario?.sub) === Number(caja?.responsable_id)
  )
  const totalIngresos = ingresos.reduce((s, r) => s + Number(r.valor || 0), 0)
  const pendientes = gastos.filter((g) => g.estado_validacion === 'pendiente').length
  const aprobados = gastos.filter((g) => g.estado_validacion === 'aprobado').length
  const rechazados = gastos.filter((g) => g.estado_validacion === 'rechazado').length
  const pct = ind?.gasto_actual
  const negativo = Number(ind?.disponible) < 0

  useEffect(() => {
    if (!panel) return undefined
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previo
    }
  }, [panel])

  return (
    <div style={{ color: t.text, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <IconBtn title="Volver a las cajas" t={t} onClick={onVolverCajas}><ArrowLeft size={16} /></IconBtn>
        <CajaMenorLogo size={movil ? 40 : 52} plate={t.bgCard} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--cc-lg)' }}>Caja Menor</div>
          <div style={{ color: t.text, fontSize: 'var(--cc-sm)', marginTop: 2 }}>No. {caja?.numero}</div>
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>{caja?.responsable_nombre || 'Responsable'}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Etiqueta estado={caja?.estado} />
            {caja?.legalizada_en ? (
              <span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
                {formatFechaHoraColombia(caja.legalizada_en)}
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {puedeCerrar && (
            <IconBtn title="Solicitar cierre" t={t} disabled={ocupado} onClick={onCierre}><Check size={16} /></IconBtn>
          )}
          {caja?.estado === 'abierta' && acceso.eliminar && !ingresos.length && !gastos.length && (
            <IconBtn
              title={borrarId === 'caja' ? 'Confirmar eliminación' : 'Eliminar caja'}
              t={t}
              disabled={ocupado}
              onClick={onEliminarCaja}
            >
              <Trash2 size={16} />
            </IconBtn>
          )}
          {acceso.exportar && (
            <>
              <IconBtn title="Exportar Excel" t={t} disabled={ocupado} onClick={onExcel}><FileSpreadsheet size={16} /></IconBtn>
              <IconBtn title="Exportar recibos PDF" t={t} disabled={ocupado} onClick={onPdf}><FileText size={16} /></IconBtn>
            </>
          )}
        </div>
      </div>

      {!panel && (
        <Aviso aviso={aviso} t={t} ocupado={ocupado} onContinuar={() => onGuardarGasto(true)} onCerrar={onCerrarAviso} />
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: movil ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
        gap: 10,
        marginBottom: 12,
      }}
      >
        <TarjetaDato t={t} titulo="Fondo establecido" valor={formatCOP(ind?.fondo_establecido)} />
        <TarjetaDato t={t} titulo="Gastos del periodo" valor={formatCOP(ind?.gastos_periodo)} />
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 12px', background: t.bgCard }}>
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>Gasto actual</div>
          <div style={{ fontWeight: 700, margin: '4px 0 8px' }}>{fmtPct(pct)}</div>
          <div style={{ height: 8, borderRadius: 99, background: t.border, overflow: 'hidden' }}>
            <div style={{
              width: `${pct == null ? 0 : Math.min(100, Math.max(0, pct))}%`,
              height: '100%',
              background: colorGasto(pct, t),
            }}
            />
          </div>
        </div>
        <TarjetaDato
          t={t}
          titulo="Disponible en caja"
          valor={formatCOP(ind?.disponible)}
          color={negativo ? colorNegativo(t) : t.text}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: movil ? '1fr 1fr' : 'repeat(5, minmax(0, 1fr))',
        gap: 8,
        marginBottom: 12,
      }}
      >
        {[
          ['Contratista', contrato.contratista || '—'],
          ['NIT', contrato.nit || '—'],
          ['Periodo', `${caja?.periodo_desde || '—'} – ${caja?.periodo_hasta || '—'}`],
          ['Saldo trasladado', formatCOP(ind?.saldo_trasladado)],
          ['Consignaciones', formatCOP(ind?.consignaciones)],
        ].map(([k, v]) => (
          <div key={k} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: '8px 10px', background: t.bgCard, minWidth: 0 }}>
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>{k}</div>
            <div style={{ fontSize: 'var(--cc-sm)', overflowWrap: 'anywhere' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => onAbrirPanel('ingresos')}
          style={tarjetaAcceso(t)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Consignaciones</strong>
            <CajaMenorLogo size={28} plate={t.bg} />
          </div>
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)', marginTop: 8 }}>
            {ingresos.length} · {formatCOP(totalIngresos)}
          </div>
        </button>
        <button type="button" onClick={() => onAbrirPanel('gastos')} style={tarjetaAcceso(t)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Gastos</strong>
            <CajaMenorLogo size={28} plate={t.bg} />
          </div>
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)', marginTop: 8 }}>
            {gastos.length} · {formatCOP(ind?.gastos_periodo)}
          </div>
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', marginTop: 8 }}>
            Pendientes {pendientes} · Validados {aprobados} · Rechazados {rechazados}
          </div>
        </button>
      </div>

      {meta && (
        <section style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.bgCard, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong style={{ fontSize: 'var(--cc-sm)' }}>Observaciones y firmas</strong>
            {acceso.editar && !bloqueada(caja) && (
              <IconBtn title="Guardar observaciones" t={t} disabled={ocupado} onClick={onGuardarMeta}><Save size={16} /></IconBtn>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : '1fr 1fr', gap: 10 }}>
            <label>
              <span style={etiquetaCampo(t)}>Observaciones</span>
              <input aria-label="Observaciones" disabled={bloqueada(caja) || !acceso.editar} value={meta.observaciones} onChange={(e) => setMeta({ ...meta, observaciones: e.target.value })} style={campo(t)} />
            </label>
            <label>
              <span style={etiquetaCampo(t)}>Control</span>
              <input aria-label="Control" disabled={bloqueada(caja) || !acceso.editar} value={meta.control} onChange={(e) => setMeta({ ...meta, control: e.target.value })} style={campo(t)} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            {[
              ['firma_elaboro', 'Elaboró'],
              ['firma_reviso', 'Revisó'],
              ['firma_aprobo', 'Aprobó'],
            ].map(([clave, nombre]) => (
              <label key={clave}>
                <span style={etiquetaCampo(t)}>{nombre}</span>
                <input aria-label={nombre} disabled={bloqueada(caja) || !acceso.editar} value={meta[clave]} onChange={(e) => setMeta({ ...meta, [clave]: e.target.value })} style={campo(t)} />
              </label>
            ))}
          </div>
        </section>
      )}

      {panel && (
        <MarcoPopup t={t} movil={movil}>
          <EncabezadoPopup
            t={t}
            titulo={panel === 'ingresos' ? 'Consignaciones' : 'Gastos'}
            caja={caja}
            vista={vista}
            onVolver={onVolverVista}
            onCerrar={onCerrarPanel}
          />
          <div style={{ overflow: 'auto', padding: movil ? 12 : 16, flex: '1 1 auto', minHeight: 0 }}>
            <Aviso aviso={aviso} t={t} ocupado={ocupado} onContinuar={() => onGuardarGasto(true)} onCerrar={onCerrarAviso} />
            {panel === 'ingresos' && (
              <PanelIngresos
                t={t} movil={movil} api={api} contratoId={contratoId} caja={caja}
                ingresos={ingresos} total={totalIngresos} acceso={acceso} abierta={caja?.estado === 'abierta'}
                vista={vista} ingreso={ingreso} setIngreso={setIngreso} preview={preview}
                ocupado={ocupado} borrarId={borrarId}
                onGuardar={onGuardarIngreso} onEliminar={onEliminarIngreso} onVer={onVerSoporte}
                onNuevo={() => props.onNuevaConsignacion?.()}
              />
            )}
            {panel === 'gastos' && (
              <PanelGastos
                t={t} movil={movil} leyendo={leyendo} api={api} contratoId={contratoId} caja={caja}
                gastos={gastos} acceso={acceso} ind={ind} vista={vista} gasto={gasto} setGasto={setGasto}
                neto={neto} preview={preview} rechazo={rechazo} setRechazo={setRechazo}
                ocupado={ocupado} borrarId={borrarId} enLegalizacion={caja?.estado === 'en_legalizacion'}
                onNuevo={onNuevoGasto} onEditar={onEditarGasto} onGuardar={() => onGuardarGasto(false)}
                onDocumento={onDocumento} onTomar={onTomarRecibo} onVer={onVerSoporte}
                onAprobar={onAprobar} onPedirRechazo={onPedirRechazo} onConfirmarRechazo={onConfirmarRechazo}
                onEliminar={onEliminarGasto}
              />
            )}
          </div>
        </MarcoPopup>
      )}
    </div>
  )
}

function tarjetaAcceso(t) {
  return {
    textAlign: 'left',
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    background: t.bgCard,
    color: t.text,
    padding: 14,
    cursor: 'pointer',
    minHeight: 96,
  }
}

function TarjetaDato({ t, titulo, valor, color }) {
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 12px', background: t.bgCard }}>
      <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>{titulo}</div>
      <div style={{ fontWeight: 700, marginTop: 4, color: color || t.text }}>{valor}</div>
    </div>
  )
}

function ZonaSoporte({ t, file, children }) {
  return (
    <div style={{
      border: `1px dashed ${t.border}`,
      borderRadius: 12,
      background: t.inputBg,
      minHeight: 180,
      padding: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      alignItems: 'stretch',
      justifyContent: 'center',
    }}
    >
      {file ? <VistaLocal file={file} /> : (
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)', textAlign: 'center' }}>
          Cargar, tomar foto o pegar con Ctrl+V
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>{children}</div>
    </div>
  )
}

function PanelIngresos({
  t, movil, api, contratoId, caja, ingresos, total, acceso, abierta, vista, ingreso, setIngreso,
  preview, ocupado, borrarId, onGuardar, onEliminar, onVer, onNuevo,
}) {
  const inputArchivo = useRef(null)
  const inputCamara = useRef(null)
  if (vista === 'imagen') {
    return <ImagenGrande preview={preview} t={t} />
  }
  if (vista === 'formulario' && ingreso) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : 'minmax(220px, 340px) 1fr', gap: 16 }}>
        <ZonaSoporte t={t} file={ingreso.file}>
          <input ref={inputCamara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => tomarArchivo(e, setIngreso)} />
          <IconBtn title="Tomar foto" t={t} onClick={() => inputCamara.current?.click()}><Camera size={16} /></IconBtn>
          <input ref={inputArchivo} type="file" accept="image/*" hidden onChange={(e) => tomarArchivo(e, setIngreso)} />
          <IconBtn title="Cargar soporte" t={t} onClick={() => inputArchivo.current?.click()}><ImageIcon size={16} /></IconBtn>
        </ZonaSoporte>
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <label>
            <span style={etiquetaCampo(t)}>Fecha</span>
            <input type="date" aria-label="Fecha de consignación" max={hoyColombia()} value={ingreso.fecha} onChange={(e) => setIngreso({ ...ingreso, fecha: e.target.value })} style={campo(t)} />
          </label>
          <label>
            <span style={etiquetaCampo(t)}>Valor</span>
            <input inputMode="numeric" aria-label="Valor de consignación" value={ingreso.valor} onChange={(e) => setIngreso({ ...ingreso, valor: e.target.value })} style={campo(t)} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <IconBtn title="Guardar consignación" t={t} disabled={ocupado} onClick={onGuardar}><Check size={16} /></IconBtn>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {abierta && acceso.crear && (
          <IconBtn title="Nueva consignación" t={t} onClick={onNuevo}>
            <Plus size={16} />
          </IconBtn>
        )}
      </div>
      {movil ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {ingresos.map((row) => (
            <TarjetaIngreso key={row.id} t={t} row={row} api={api} contratoId={contratoId} cajaId={caja.id} acceso={acceso} abierta={abierta} borrarId={borrarId} onEliminar={onEliminar} onVer={onVer} />
          ))}
          {!ingresos.length && <p style={{ color: t.textMuted }}>Sin consignaciones.</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, padding: '4px 2px' }}>
            <span>Total</span>
            <span>{formatCOP(total)}</span>
          </div>
        </div>
      ) : (
        <div style={{ overflow: 'auto' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Fecha', 'Valor', 'Soporte', 'Acciones'].map((h) => (
                <th key={h} style={{ ...celda(t), background: t.headerBg, fontWeight: 700, textAlign: h === 'Valor' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ingresos.map((row) => (
              <FilaIngreso key={row.id} t={t} row={row} api={api} contratoId={contratoId} cajaId={caja.id} acceso={acceso} abierta={abierta} borrarId={borrarId} onEliminar={onEliminar} onVer={onVer} />
            ))}
            {!ingresos.length && <tr><td style={celda(t)} colSpan={4}>Sin consignaciones.</td></tr>}
            <tr>
              <td style={{ ...celda(t), fontWeight: 700, background: t.headerBg }}>Total</td>
              <td style={{ ...celda(t), fontWeight: 700, textAlign: 'right', background: t.headerBg }}>{formatCOP(total)}</td>
              <td style={{ ...celda(t), background: t.headerBg }} colSpan={2} />
            </tr>
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

async function tomarArchivo(event, setIngreso) {
  const file = event.target.files?.[0]
  if (!file) return
  const listo = await comprimirImagen(file)
  setIngreso((prev) => (prev ? { ...prev, file: listo } : prev))
}

function FilaIngreso(props) {
  const url = useSoporte(props.api, props.contratoId, props.cajaId, 'ingresos', props.row.id, true)
  return (
    <tr>
      <td style={celda(props.t)}>{props.row.fecha}</td>
      <td style={{ ...celda(props.t), textAlign: 'right' }}>{formatCOP(props.row.valor)}</td>
      <td style={celda(props.t)}>
        <Miniatura url={url} titulo="Consignación" t={props.t} onAmpliar={() => props.onVer('ingresos', props.row.id, 'Consignación')} />
      </td>
      <td style={celda(props.t)}>
        {props.abierta && props.acceso.eliminar && (
          <IconBtn title={props.borrarId === `i${props.row.id}` ? 'Confirmar eliminación' : 'Eliminar consignación'} t={props.t} onClick={() => props.onEliminar(props.row)}>
            <Trash2 size={16} />
          </IconBtn>
        )}
      </td>
    </tr>
  )
}

function TarjetaIngreso(props) {
  const url = useSoporte(props.api, props.contratoId, props.cajaId, 'ingresos', props.row.id, true)
  return (
    <div style={{ border: `1px solid ${props.t.border}`, borderRadius: 12, padding: 10, background: props.t.bgCard, display: 'flex', gap: 10, alignItems: 'center' }}>
      <Miniatura url={url} titulo="Consignación" t={props.t} onAmpliar={() => props.onVer('ingresos', props.row.id, 'Consignación')} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--cc-sm)' }}>{props.row.fecha}</div>
        <div style={{ fontWeight: 700 }}>{formatCOP(props.row.valor)}</div>
      </div>
      {props.abierta && props.acceso.eliminar && (
        <IconBtn title={props.borrarId === `i${props.row.id}` ? 'Confirmar eliminación' : 'Eliminar consignación'} t={props.t} onClick={() => props.onEliminar(props.row)}>
          <Trash2 size={16} />
        </IconBtn>
      )}
    </div>
  )
}

function ImagenGrande({ preview, t }) {
  if (!preview?.url) return <p style={{ color: t.textMuted }}>Cargando soporte…</p>
  return <img src={preview.url} alt={preview.titulo || 'Soporte'} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
}

function PanelGastos(props) {
  const {
    t, movil, leyendo, api, contratoId, caja, gastos, acceso, ind, vista, gasto, setGasto, neto, preview,
    rechazo, setRechazo, ocupado, borrarId, enLegalizacion, onNuevo, onEditar, onGuardar,
    onDocumento, onTomar, onVer, onAprobar, onPedirRechazo, onConfirmarRechazo, onEliminar,
  } = props
  const inputArchivo = useRef(null)
  const inputCamara = useRef(null)
  const totalNeto = ind?.gastos_periodo
  if (vista === 'imagen') return <ImagenGrande preview={preview} t={t} />
  if (vista === 'validar' && rechazo) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : 'minmax(220px, 380px) 1fr', gap: 16 }}>
        <ImagenGrande preview={preview} t={t} />
        <div>
          <p style={{ marginTop: 0 }}>Recibo {rechazo.consecutivo}</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <IconBtn title="Aprobar gasto" t={t} disabled={ocupado} onClick={() => onAprobar(rechazo)}><Check size={16} /></IconBtn>
          </div>
          <label>
            <span style={etiquetaCampo(t)}>Observación del rechazo</span>
            <input aria-label="Observación del rechazo" value={rechazo.texto} onChange={(e) => setRechazo({ ...rechazo, texto: e.target.value })} style={campo(t)} />
          </label>
          <div style={{ marginTop: 8 }}>
            <IconBtn title="Confirmar rechazo" t={t} disabled={ocupado || !rechazo.texto.trim()} onClick={onConfirmarRechazo}><X size={16} /></IconBtn>
          </div>
        </div>
      </div>
    )
  }
  if (vista === 'formulario' && gasto) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : 'minmax(220px, 340px) 1fr', gap: 16 }}>
        <div>
          <ZonaSoporte t={t} file={gasto.file}>
            <input ref={inputCamara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onTomar(e.target.files[0])} />
            <IconBtn title="Tomar foto" t={t} onClick={() => inputCamara.current?.click()}><Camera size={16} /></IconBtn>
            <input ref={inputArchivo} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onTomar(e.target.files[0])} />
            <IconBtn title="Cargar o pegar recibo" t={t} onClick={() => inputArchivo.current?.click()}><ImageIcon size={16} /></IconBtn>
          </ZonaSoporte>
          {!gasto.file && gasto.id && (
            <div style={{ marginTop: 8 }}>
              <SoporteGuardado api={api} contratoId={contratoId} cajaId={caja.id} itemId={gasto.id} t={t} onVer={() => onVer('gastos', gasto.id, `Recibo ${gasto.consecutivo || ''}`)} />
            </div>
          )}
        </div>
        <FormularioGasto t={t} movil={movil} gasto={gasto} setGasto={setGasto} neto={neto} ocupado={ocupado || leyendo} leyendo={leyendo} onDocumento={onDocumento} onGuardar={onGuardar} />
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {caja?.estado === 'abierta' && acceso.crear && (
          <IconBtn title="Nuevo gasto" t={t} onClick={onNuevo}><Plus size={16} /></IconBtn>
        )}
      </div>
      {movil ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {gastos.map((row) => (
            <TarjetaGasto key={row.id} t={t} row={row} api={api} contratoId={contratoId} caja={caja} acceso={acceso} enLegalizacion={enLegalizacion} borrarId={borrarId} onVer={onVer} onEditar={onEditar} onAprobar={onAprobar} onPedirRechazo={onPedirRechazo} onEliminar={onEliminar} />
          ))}
          {!gastos.length && <p style={{ color: t.textMuted }}>Sin gastos.</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, padding: '4px 2px' }}>
            <span>Total</span>
            <span>{formatCOP(totalNeto)}</span>
          </div>
        </div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: 'calc(94vh - 150px)' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={thFijo(t, 0, 56)}>#</th>
                <th rowSpan={2} style={thFijo(t, 56, 240)}>Tercero</th>
                <th rowSpan={2} style={thTexto(t, 118)}>Fecha</th>
                <th rowSpan={2} style={thTexto(t, 132)}>NIT</th>
                <th rowSpan={2} style={thTexto(t, 280)}>Descripción</th>
                <th rowSpan={2} style={thTexto(t, 150)}>Documento</th>
                <th rowSpan={2} style={thTexto(t, 160)}>Centro de costos</th>
                <th colSpan={6} style={thTexto(t, 118 * 6, 'center')}>Valores</th>
                <th rowSpan={2} style={thTexto(t, 84)}>Soporte</th>
                <th rowSpan={2} style={thTexto(t, 132)}>Estado</th>
                <th rowSpan={2} style={thTexto(t, 140)}>Acciones</th>
              </tr>
              <tr>
                {['Bruto', 'IVA', 'Retenciones', 'Consumo', 'Otros', 'Neto'].map((h) => (
                  <th key={h} style={thTexto(t, 118, 'right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gastos.map((row) => (
                <FilaGastoLista key={row.id} t={t} row={row} api={api} contratoId={contratoId} caja={caja} acceso={acceso} enLegalizacion={enLegalizacion} borrarId={borrarId} onVer={onVer} onEditar={onEditar} onAprobar={onAprobar} onPedirRechazo={onPedirRechazo} onEliminar={onEliminar} />
              ))}
              {!gastos.length && <tr><td style={celda(t)} colSpan={16}>Sin gastos.</td></tr>}
              <tr>
                <td style={{ ...celda(t), fontWeight: 700, background: t.headerBg }} colSpan={12}>Total</td>
                <td style={{ ...celda(t), fontWeight: 700, textAlign: 'right', background: t.headerBg }}>{formatCOP(totalNeto)}</td>
                <td style={{ ...celda(t), background: t.headerBg }} colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function thTexto(t, min, align = 'left') {
  return {
    ...celda(t),
    background: t.headerBg,
    fontWeight: 700,
    textAlign: align,
    minWidth: min,
  }
}

function thFijo(t, left, ancho) {
  return {
    ...thTexto(t, ancho),
    position: 'sticky',
    left,
    zIndex: 3,
    width: ancho,
  }
}

function tdFijo(t, left, ancho) {
  return {
    ...celda(t),
    position: 'sticky',
    left,
    zIndex: 2,
    minWidth: ancho,
    width: ancho,
    background: t.bgCard,
  }
}

function estiloCampo(t, gasto, clave) {
  const base = campo(t)
  if (!gasto?.ocrHecho) return base
  const vacio = String(gasto[clave] ?? '').trim() === ''
  const leido = (gasto.leidos || []).includes(clave)
  if (vacio && !leido) return { ...base, border: '1.5px solid #D97706' }
  return base
}

function FormularioGasto({ t, movil, gasto, setGasto, neto, ocupado, leyendo, onDocumento, onGuardar }) {
  const set = (clave) => (e) => setGasto({ ...gasto, [clave]: e.target.value })
  const item = (clave, label, tipo = 'text') => (
    <label>
      <span style={etiquetaCampo(t)}>{label}</span>
      <input
        aria-label={label}
        type={tipo}
        max={tipo === 'date' ? hoyColombia() : undefined}
        value={gasto[clave] ?? ''}
        onChange={set(clave)}
        onBlur={clave === 'tercero_documento' ? () => onDocumento(gasto.tercero_documento) : undefined}
        style={estiloCampo(t, gasto, clave)}
      />
    </label>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : '1fr 1fr', gap: 10, alignContent: 'start' }}>
      {leyendo && (
        <div style={{ gridColumn: movil ? 'auto' : '1 / -1', color: t.primary, fontSize: 'var(--cc-sm)', fontWeight: 700 }}>
          Leyendo la factura…
        </div>
      )}
      {item('fecha', 'Fecha', 'date')}
      {item('tercero_razon_social', 'Tercero')}
      {item('tercero_documento', 'NIT o cédula')}
      {item('documento_no', 'Documento No.')}
      <label style={{ gridColumn: movil ? 'auto' : '1 / -1' }}>
        <span style={etiquetaCampo(t)}>Descripción</span>
        <input aria-label="Descripción" value={gasto.descripcion ?? ''} onChange={set('descripcion')} style={estiloCampo(t, gasto, 'descripcion')} />
      </label>
      {item('centro_costos', 'Centro de costos')}
      {item('valor_bruto', 'Valor bruto')}
      {item('iva', 'IVA')}
      {item('retenciones', 'Retenciones')}
      {item('impuesto_consumo', 'Impuesto al consumo')}
      {item('otros_deducibles', 'Otros deducibles')}
      <div>
        <span style={etiquetaCampo(t)}>Valor neto</span>
        <div style={{
          fontWeight: 700,
          minHeight: 40,
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          borderRadius: 8,
          border: gasto?.ocrHecho && !(neto > 0) ? '1.5px solid #D97706' : '1px solid transparent',
        }}
        >{formatCOP(neto > 0 ? neto : 0)}
        </div>
      </div>
      <div style={{ gridColumn: movil ? 'auto' : '1 / -1' }}>
        <IconBtn title="Guardar gasto" t={t} disabled={ocupado || neto <= 0} onClick={onGuardar}><Check size={16} /></IconBtn>
      </div>
    </div>
  )
}

function AccionesGasto({ t, row, caja, acceso, enLegalizacion, borrarId, onEditar, onPedirRechazo, onEliminar }) {
  const abierta = caja?.estado === 'abierta'
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {enLegalizacion && acceso.validar && row.estado_validacion === 'pendiente' && (
        <IconBtn title="Validar gasto" t={t} onClick={() => onPedirRechazo(row)}><Check size={16} /></IconBtn>
      )}
      {abierta && acceso.editar && row.estado_validacion === 'pendiente' && (
        <IconBtn title="Editar gasto" t={t} onClick={() => onEditar(row)}><Pencil size={16} /></IconBtn>
      )}
      {abierta && acceso.eliminar && (
        <IconBtn title={borrarId === `g${row.id}` ? 'Confirmar eliminación' : 'Eliminar gasto'} t={t} onClick={() => onEliminar(row)}>
          <Trash2 size={16} />
        </IconBtn>
      )}
    </span>
  )
}

function FilaGastoLista(props) {
  const { t, row } = props
  const url = useSoporte(props.api, props.contratoId, props.caja.id, 'gastos', row.id, true)
  const neto = row.estado_validacion === 'rechazado' ? 0 : row.valor_neto
  const dinero = (n) => <td style={{ ...celda(t), textAlign: 'right' }}>{formatCOP(n)}</td>
  return (
    <tr style={{ opacity: row.estado_validacion === 'rechazado' ? 0.55 : 1 }}>
      <td style={tdFijo(t, 0, 56)}>{row.consecutivo}</td>
      <td style={tdFijo(t, 56, 240)}>{row.tercero_razon_social}</td>
      <td style={{ ...celda(t), minWidth: 118 }}>{row.fecha}</td>
      <td style={celda(t)}>{row.tercero_documento}</td>
      <td style={celda(t)}>{row.descripcion}</td>
      <td style={celda(t)}>{row.documento_no}</td>
      <td style={celda(t)}>{row.centro_costos}</td>
      {dinero(row.valor_bruto)}
      {dinero(row.iva)}
      {dinero(row.retenciones)}
      {dinero(row.impuesto_consumo)}
      {dinero(row.otros_deducibles)}
      {dinero(neto)}
      <td style={celda(t)}>
        <Miniatura url={url} titulo={`Recibo ${row.consecutivo}`} t={t} onAmpliar={() => props.onVer('gastos', row.id, `Recibo ${row.consecutivo}`)} />
      </td>
      <td style={{ ...celda(t), whiteSpace: 'normal', minWidth: 132, maxWidth: 220 }}>
        <Etiqueta estado={row.estado_validacion} />
        {row.observacion_validacion ? <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', marginTop: 4 }}>{row.observacion_validacion}</div> : null}
      </td>
      <td style={celda(t)}>
        <AccionesGasto t={t} row={row} caja={props.caja} acceso={props.acceso} enLegalizacion={props.enLegalizacion} borrarId={props.borrarId} onEditar={props.onEditar} onAprobar={props.onAprobar} onPedirRechazo={props.onPedirRechazo} onEliminar={props.onEliminar} />
      </td>
    </tr>
  )
}

function TarjetaGasto(props) {
  const { t, row } = props
  const [abierta, setAbierta] = useState(false)
  const url = useSoporte(props.api, props.contratoId, props.caja.id, 'gastos', row.id, true)
  const neto = row.estado_validacion === 'rechazado' ? 0 : row.valor_neto
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.bgCard, padding: 10, opacity: row.estado_validacion === 'rechazado' ? 0.7 : 1 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Miniatura url={url} titulo={`Recibo ${row.consecutivo}`} t={t} onAmpliar={() => props.onVer('gastos', row.id, `Recibo ${row.consecutivo}`)} />
        <button type="button" onClick={() => setAbierta((v) => !v)} style={{ flex: 1, minWidth: 0, display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', background: 'transparent', border: 'none', color: t.text, padding: 0, cursor: 'pointer' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 700 }}>#{row.consecutivo} · {row.tercero_razon_social}</span>
            <span style={{ display: 'block', color: t.textMuted, fontSize: 'var(--cc-caption)' }}>{row.fecha}</span>
            <span style={{ display: 'block', fontWeight: 700 }}>{formatCOP(neto)}</span>
          </span>
          <Etiqueta estado={row.estado_validacion} />
        </button>
      </div>
      {abierta && (
        <div style={{ marginTop: 8, display: 'grid', gap: 4, fontSize: 'var(--cc-sm)' }}>
          <div>NIT {row.tercero_documento}</div>
          <div>{row.descripcion}</div>
          <div>Documento {row.documento_no} · Centro {row.centro_costos}</div>
          <div>Bruto {formatCOP(row.valor_bruto)} · IVA {formatCOP(row.iva)} · Retenciones {formatCOP(row.retenciones)}</div>
          <div>Consumo {formatCOP(row.impuesto_consumo)} · Otros {formatCOP(row.otros_deducibles)}</div>
          {row.observacion_validacion ? <div style={{ color: t.textMuted }}>{row.observacion_validacion}</div> : null}
          <AccionesGasto t={t} row={row} caja={props.caja} acceso={props.acceso} enLegalizacion={props.enLegalizacion} borrarId={props.borrarId} onEditar={props.onEditar} onAprobar={props.onAprobar} onPedirRechazo={props.onPedirRechazo} onEliminar={props.onEliminar} />
        </div>
      )}
    </div>
  )
}

function SoporteGuardado({ api, contratoId, cajaId, itemId, t, onVer }) {
  const url = useSoporte(api, contratoId, cajaId, 'gastos', itemId, true)
  return <Miniatura url={url} titulo="Recibo guardado" t={t} onAmpliar={onVer} />
}
