import { useEffect, useRef, useState } from 'react'
import {
  AlignLeft, ArrowLeft, Camera, Check, Coins, FileText, Image as ImageIcon, Pencil, Plus, Save, Trash2, X,
} from 'lucide-react'
import { formatCOP } from '../../utils/formatCOP'
import { formatFechaHoraColombia } from '../../utils/fechaColombia'
import CajaMenorLogo from './CajaMenorLogo'
import { ETIQUETA_ESTADO, dinero, fmtPct, hoyColombia } from './cajaMenorCalc'
import { comprimirImagen } from './cajaMenorImagen'
import { manejarTeclaCajaMenor } from './cajaMenorTeclado'
import { formatearDescripcion, revisarDescripcion } from './cajaMenorLenguaje'

const CM_CSS = `
.cm-marco { animation: cm-marco-in 200ms ease; }
.cm-vista { animation: cm-vista-in 180ms ease; }
@keyframes cm-marco-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes cm-vista-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.cm-cuerpo { overflow-x: hidden; overflow-y: auto; min-width: 0; }
.cm-excel { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; }
.cm-excel th, .cm-excel td {
  border: 1px solid var(--cm-border);
  padding: 4px 3px;
  color: var(--cm-text);
  vertical-align: middle;
  overflow: hidden;
  box-sizing: border-box;
}
.cm-excel th {
  background: var(--cm-head-bg);
  color: var(--cm-head-text);
  font-weight: 700;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  text-align: left;
}
.cm-excel td { background: var(--cm-card); font-size: var(--cc-sm); }
.cm-excel tbody tr:nth-child(even) td { background: var(--cm-input); }
.cm-excel tbody tr:hover td { background: var(--cm-hover); }
.cm-excel tr.cm-total td {
  background: var(--cm-hover);
  color: var(--cm-text);
  font-weight: 700;
  border-top: 2px solid var(--cm-primary);
}
.cm-clip { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.cm-sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cm-muted); font-size: 11px; line-height: 1.3; }
.cm-excel th.cm-num, .cm-excel td.cm-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  white-space: nowrap;
}
.cm-teclado input:focus,
.cm-teclado textarea:focus {
  outline: 2px solid var(--cm-primary, #0077B6);
  outline-offset: 1px;
  box-shadow: 0 0 0 4px var(--cm-foco, rgba(0, 119, 182, 0.28));
}
.cm-teclado button:focus-visible {
  outline: 2px solid var(--cm-primary, #0077B6);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .cm-marco, .cm-vista { animation: none; }
}
`

function anilloFoco(t) {
  if (t?.bg === '#0A1628') return 'rgba(0, 180, 198, 0.40)'
  if (t?.bg === '#E8E0D5') return 'rgba(14, 116, 144, 0.32)'
  return 'rgba(0, 119, 182, 0.28)'
}

function IconoExcel() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="4" fill="#217346" />
      <path d="M8 7l8 10M16 7L8 17" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function IconoPdf() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 1.5h8.2L19 6.3V21a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 21V3A1.5 1.5 0 0 1 6 1.5z" fill="#E5252A" />
      <path d="M14.2 1.5V6.3H19" fill="#fff" opacity="0.9" />
      <text x="12" y="17.2" textAnchor="middle" fontSize="6.2" fontFamily="Arial, sans-serif" fontWeight="700" fill="#fff">PDF</text>
    </svg>
  )
}

function IconBtn({ title, onClick, disabled, children, t, compact, ...resto }) {
  const lado = compact ? 22 : 40
  return (
    <button
      type="button"
      {...resto}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: lado,
        height: lado,
        minWidth: lado,
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

function Etiqueta({ estado, compact }) {
  const tono = tonoEstado(estado)
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      maxWidth: '100%',
      minHeight: compact ? 20 : 26,
      padding: compact ? '0 5px' : '2px 10px',
      borderRadius: 999,
      background: tono.fondo,
      color: tono.texto,
      fontSize: compact ? 10 : 'var(--cc-caption)',
      fontWeight: 700,
      letterSpacing: compact ? 0 : '0.02em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      minWidth: 0,
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

function Miniatura({ url, titulo, onAmpliar, t, lado = 32, orden }) {
  return (
    <button
      type="button"
      data-cm-orden={orden}
      title="Ampliar soporte"
      aria-label="Ampliar soporte"
      onClick={onAmpliar}
      style={{
        width: lado,
        height: lado,
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

function EncabezadoPopup({ t, titulo, caja, vista, contratoNumero, centro, onVolver, onCerrar }) {
  return (
    <div style={{ borderBottom: `1px solid ${t.border}`, background: t.bgCard }}>
      <div style={{ height: 4, background: t.primary }} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: 12,
        alignItems: 'center',
        padding: '12px 14px 10px',
      }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {vista !== 'lista' && (
            <IconBtn title="Volver" t={t} onClick={onVolver}><ArrowLeft size={16} /></IconBtn>
          )}
          <CajaMenorLogo size={42} plate={t.bg} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-lg)', letterSpacing: '-0.01em' }}>{titulo}</div>
          <div className="cm-clip" style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', marginTop: 2 }} title={`Caja No. ${caja?.numero || '—'} · ${caja?.responsable_nombre || 'Responsable'} · Contrato ${contratoNumero || '—'}`}>
            Caja No. {caja?.numero || '—'} · {caja?.responsable_nombre || 'Responsable'} · Contrato {contratoNumero || '—'}
          </div>
          {centro ? (
            <div className="cm-clip" style={{ color: t.primary, fontSize: 11, fontWeight: 700, marginTop: 2 }} title={`Centro de costos ${centro}`}>
              Centro de costos {centro}
            </div>
          ) : null}
        </div>
        <IconBtn title="Cerrar" t={t} onClick={onCerrar}><X size={16} /></IconBtn>
      </div>
    </div>
  )
}

function FranjaResumen({ t, items }) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      padding: '8px 14px',
      borderBottom: `1px solid ${t.border}`,
      background: t.bg,
      minWidth: 0,
    }}
    >
      {items.map((item) => (
        <span key={item.texto} style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 26,
          padding: '2px 10px',
          borderRadius: 999,
          border: `1px solid ${t.border}`,
          background: t.bgCard,
          color: t.text,
          fontSize: 12,
          fontWeight: 700,
          maxWidth: '100%',
        }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 99, background: item.color || t.primary, flex: '0 0 auto' }} />
          <span className="cm-clip">{item.texto}</span>
        </span>
      ))}
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
        padding: movil ? 0 : 16,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <style>{CM_CSS}</style>
      <div
        className="cm-marco"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          '--cm-border': t.border,
          '--cm-text': t.text,
          '--cm-card': t.bgCard,
          '--cm-input': t.inputBg || t.bg,
          '--cm-header': t.headerBg || t.bgCard,
          '--cm-primary': t.primary,
          '--cm-foco': anilloFoco(t),
          '--cm-muted': t.textMuted,
          '--cm-head-bg': t.bg === '#0A1628' ? '#075985' : t.primary,
          '--cm-head-text': '#F0F9FF',
          '--cm-hover': t.bg === '#0A1628' ? '#16324F' : (t.bg === '#E8E0D5' ? '#DDD4C6' : '#E0F2FE'),
          width: movil ? '100%' : 'min(1080px, 100%)',
          maxWidth: '100%',
          boxSizing: 'border-box',
          height: movil ? '100%' : 'auto',
          maxHeight: movil ? '100%' : 'calc(100vh - 32px)',
          background: t.bg,
          color: t.text,
          borderRadius: movil ? 0 : 16,
          border: movil ? 'none' : `1px solid ${t.border}`,
          boxShadow: t.shadow || '0 18px 48px rgba(15, 23, 42, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Vacio({ t, frase }) {
  return (
    <div style={{
      display: 'grid',
      justifyItems: 'center',
      gap: 8,
      padding: '28px 12px',
      color: t.textMuted,
      textAlign: 'center',
    }}
    >
      <CajaMenorLogo size={48} plate={t.bgCard} />
      <div style={{ fontWeight: 700, color: t.text }}>{frase}</div>
    </div>
  )
}

function TituloSeccion({ t, icono, children }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      color: t.primary,
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}
    >
      {icono}
      {children}
    </div>
  )
}

function netoImpuestos(row) {
  return dinero(row?.iva) + dinero(row?.impuesto_consumo) - dinero(row?.retenciones) - dinero(row?.otros_deducibles)
}

function textoImpuestos(row) {
  return [
    `IVA: ${formatCOP(row?.iva)}`,
    `Retenciones: ${formatCOP(row?.retenciones)}`,
    `Impuesto al consumo: ${formatCOP(row?.impuesto_consumo)}`,
    `Otros deducibles: ${formatCOP(row?.otros_deducibles)}`,
  ].join('\n')
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
      <style>{CM_CSS}</style>
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
              <IconBtn title="Exportar Excel" t={t} disabled={ocupado} onClick={onExcel}><IconoExcel /></IconBtn>
              <IconBtn title="Exportar PDF" t={t} disabled={ocupado} onClick={onPdf}><IconoPdf /></IconBtn>
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
        <section
          className="cm-teclado"
          onKeyDown={manejarTeclaCajaMenor}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            alignItems: 'center',
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            background: t.bgCard,
            padding: 12,
            '--cm-primary': t.primary,
            '--cm-foco': anilloFoco(t),
          }}
        >
          <strong style={{ gridColumn: 1, gridRow: 1, fontSize: 'var(--cc-sm)', marginBottom: 10 }}>Observaciones y firmas</strong>
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: movil ? '1fr' : '1fr 1fr', gap: 10 }}>
            <label>
              <span style={etiquetaCampo(t)}>Observaciones</span>
              <input data-cm-orden="1" enterKeyHint="next" aria-label="Observaciones" disabled={bloqueada(caja) || !acceso.editar} value={meta.observaciones} onChange={(e) => setMeta({ ...meta, observaciones: e.target.value })} style={campo(t)} />
            </label>
            <label>
              <span style={etiquetaCampo(t)}>Control</span>
              <input data-cm-orden="2" enterKeyHint="next" aria-label="Control" disabled={bloqueada(caja) || !acceso.editar} value={meta.control} onChange={(e) => setMeta({ ...meta, control: e.target.value })} style={campo(t)} />
            </label>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: movil ? '1fr' : '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            {[
              ['firma_elaboro', 'Elaboró', '3'],
              ['firma_reviso', 'Revisó', '4'],
              ['firma_aprobo', 'Aprobó', '5'],
            ].map(([clave, nombre, orden]) => (
              <label key={clave}>
                <span style={etiquetaCampo(t)}>{nombre}</span>
                <input data-cm-orden={orden} enterKeyHint="next" aria-label={nombre} disabled={bloqueada(caja) || !acceso.editar} value={meta[clave]} onChange={(e) => setMeta({ ...meta, [clave]: e.target.value })} style={campo(t)} />
              </label>
            ))}
          </div>
          {acceso.editar && !bloqueada(caja) && (
            <div style={{ gridColumn: 2, gridRow: 1, marginBottom: 10 }}>
              <IconBtn data-cm-orden="6" data-cm-guardar="" title="Guardar observaciones" t={t} disabled={ocupado} onClick={onGuardarMeta}><Save size={16} /></IconBtn>
            </div>
          )}
        </section>
      )}

      {panel && (
        <MarcoPopup t={t} movil={movil}>
          <EncabezadoPopup
            t={t}
            titulo={panel === 'ingresos' ? 'Consignaciones' : 'Gastos'}
            caja={caja}
            vista={vista}
            contratoNumero={contrato.numero}
            centro={panel === 'gastos' ? (contrato.numero || '—') : ''}
            onVolver={onVolverVista}
            onCerrar={onCerrarPanel}
          />
          <FranjaResumen
            t={t}
            items={panel === 'ingresos' ? [
              { texto: `${ingresos.length} consignaciones`, color: t.primary },
              { texto: `Total ${formatCOP(totalIngresos)}`, color: t.primary },
            ] : [
              { texto: `${gastos.length} gastos`, color: t.primary },
              { texto: `Total ${formatCOP(ind?.gastos_periodo)}`, color: t.primary },
              { texto: `${pendientes} pendientes`, color: tonoEstado('pendiente').fondo },
              { texto: `${aprobados} validados`, color: tonoEstado('aprobado').fondo },
              { texto: `${rechazados} rechazados`, color: tonoEstado('rechazado').fondo },
            ]}
          />
          <div className="cm-cuerpo cm-vista" key={vista} style={{ padding: movil ? 12 : 16, flex: '1 1 auto', minHeight: 0 }}>
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

function ZonaSoporte({ t, file, onSoltar, children }) {
  const [sobre, setSobre] = useState(false)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setSobre(true) }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault()
        setSobre(false)
        const archivo = e.dataTransfer?.files?.[0]
        if (archivo) onSoltar?.(archivo)
      }}
      style={{
        border: `1.5px dashed ${sobre ? t.primary : t.border}`,
        borderRadius: 14,
        background: t.inputBg,
        minHeight: 180,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'stretch',
        justifyContent: 'center',
        boxShadow: sobre ? `inset 0 0 0 2px ${t.primary}` : 'none',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
      }}
    >
      <TituloSeccion t={t} icono={<ImageIcon size={14} />}>Soporte</TituloSeccion>
      {file ? <VistaLocal file={file} /> : (
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)', textAlign: 'center', padding: '12px 8px' }}>
          Arrastre la imagen, tome una foto o péguela con Ctrl+V
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
      <div className="cm-teclado" onKeyDown={manejarTeclaCajaMenor} style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : 'minmax(220px, 340px) minmax(0, 1fr)', gap: 16, minWidth: 0 }}>
        <div style={{ gridColumn: movil ? '1' : '2', gridRow: '1', display: 'grid', gap: 14, alignContent: 'start', minWidth: 0 }}>
          <section style={{ display: 'grid', gap: 8 }}>
            <TituloSeccion t={t} icono={<FileText size={14} />}>Documento</TituloSeccion>
            <label>
              <span style={etiquetaCampo(t)}>Fecha</span>
              <input data-cm-orden="1" enterKeyHint="next" className="cm-gasto-fecha" type="date" aria-label="Fecha de consignación" max={hoyColombia()} value={ingreso.fecha} onChange={(e) => setIngreso({ ...ingreso, fecha: e.target.value })} style={{ ...campo(t), textAlign: 'left' }} />
            </label>
          </section>
          <section style={{ display: 'grid', gap: 8 }}>
            <TituloSeccion t={t} icono={<Coins size={14} />}>Valores</TituloSeccion>
            <label>
              <span style={etiquetaCampo(t)}>Valor</span>
              <input data-cm-orden="2" enterKeyHint="next" inputMode="numeric" aria-label="Valor de consignación" value={textoMoneda(ingreso.valor)} onChange={(e) => setIngreso({ ...ingreso, valor: String(e.target.value || '').replace(/\D/g, '') })} style={{ ...campo(t), textAlign: 'right' }} />
            </label>
          </section>
        </div>
        <div style={{ gridColumn: '1', gridRow: movil ? '2' : '1 / span 2', minWidth: 0 }}>
          <ZonaSoporte t={t} file={ingreso.file} onSoltar={(archivo) => tomarArchivo({ target: { files: [archivo] } }, setIngreso)}>
            <input ref={inputCamara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => tomarArchivo(e, setIngreso)} />
            <IconBtn data-cm-orden="20" title="Tomar foto" t={t} onClick={() => inputCamara.current?.click()}><Camera size={16} /></IconBtn>
            <input ref={inputArchivo} type="file" accept="image/*" hidden onChange={(e) => tomarArchivo(e, setIngreso)} />
            <IconBtn data-cm-orden="21" title="Cargar soporte" t={t} onClick={() => inputArchivo.current?.click()}><ImageIcon size={16} /></IconBtn>
          </ZonaSoporte>
        </div>
        <div style={{ gridColumn: movil ? '1' : '2', display: 'flex', justifyContent: 'flex-end' }}>
          <IconBtn data-cm-orden="30" data-cm-guardar="" title="Guardar consignación" t={t} disabled={ocupado} onClick={onGuardar}><Check size={16} /></IconBtn>
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
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          {ingresos.map((row) => (
            <TarjetaIngreso key={row.id} t={t} row={row} api={api} contratoId={contratoId} cajaId={caja.id} acceso={acceso} abierta={abierta} borrarId={borrarId} onEliminar={onEliminar} onVer={onVer} />
          ))}
          {!ingresos.length && <Vacio t={t} frase="Sin consignaciones registradas" />}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, padding: '8px 2px', borderTop: `1px solid ${t.border}` }}>
            <span>Total</span>
            <span>{formatCOP(total)}</span>
          </div>
        </div>
      ) : (
        <table className="cm-excel">
          <colgroup>
            <col style={{ width: '28%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '22%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Fecha</th>
              <th className="cm-num">Valor</th>
              <th>Soporte</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ingresos.map((row) => (
              <FilaIngreso key={row.id} t={t} row={row} api={api} contratoId={contratoId} cajaId={caja.id} acceso={acceso} abierta={abierta} borrarId={borrarId} onEliminar={onEliminar} onVer={onVer} />
            ))}
            {!ingresos.length && (
              <tr><td colSpan={4}><Vacio t={t} frase="Sin consignaciones registradas" /></td></tr>
            )}
            <tr className="cm-total">
              <td>Total</td>
              <td className="cm-num">{formatCOP(total)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
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
      <td><span className="cm-clip" title={props.row.fecha}>{props.row.fecha}</span></td>
      <td className="cm-num">{formatCOP(props.row.valor)}</td>
      <td>
        <Miniatura url={url} titulo="Consignación" t={props.t} onAmpliar={() => props.onVer('ingresos', props.row.id, 'Consignación')} />
      </td>
      <td>
        {props.abierta && props.acceso.eliminar && (
          <IconBtn compact title={props.borrarId === `i${props.row.id}` ? 'Confirmar eliminación' : 'Eliminar consignación'} t={props.t} onClick={() => props.onEliminar(props.row)}>
            <Trash2 size={14} />
          </IconBtn>
        )}
      </td>
    </tr>
  )
}

function TarjetaIngreso(props) {
  const url = useSoporte(props.api, props.contratoId, props.cajaId, 'ingresos', props.row.id, true)
  return (
    <div style={{ border: `1px solid ${props.t.border}`, borderRadius: 14, padding: 10, background: props.t.bgCard, display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, boxShadow: props.t.shadow, borderTop: `3px solid ${props.t.primary}` }}>
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
      <div className="cm-teclado" onKeyDown={manejarTeclaCajaMenor} style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : 'minmax(220px, 340px) 1fr', gap: 16 }}>
        <div style={{ gridColumn: movil ? '1' : '2', gridRow: '1', minWidth: 0 }}>
          <FormularioGasto t={t} movil={movil} gasto={gasto} setGasto={setGasto} neto={neto} leyendo={leyendo} onDocumento={onDocumento} />
        </div>
        <div style={{ gridColumn: '1', gridRow: movil ? '2' : '1 / span 2', minWidth: 0 }}>
          <ZonaSoporte t={t} file={gasto.file} onSoltar={onTomar}>
            <input ref={inputCamara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onTomar(e.target.files[0])} />
            <IconBtn data-cm-orden="20" title="Tomar foto" t={t} onClick={() => inputCamara.current?.click()}><Camera size={16} /></IconBtn>
            <input ref={inputArchivo} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onTomar(e.target.files[0])} />
            <IconBtn data-cm-orden="21" title="Cargar o pegar recibo" t={t} onClick={() => inputArchivo.current?.click()}><ImageIcon size={16} /></IconBtn>
          </ZonaSoporte>
          {!gasto.file && gasto.id && (
            <div style={{ marginTop: 8 }}>
              <SoporteGuardado api={api} contratoId={contratoId} cajaId={caja.id} itemId={gasto.id} t={t} onVer={() => onVer('gastos', gasto.id, `Recibo ${gasto.consecutivo || ''}`)} />
            </div>
          )}
        </div>
        <div style={{ gridColumn: movil ? '1' : '2', display: 'flex', justifyContent: 'flex-end' }}>
          <IconBtn data-cm-orden="30" data-cm-guardar="" title="Guardar gasto" t={t} disabled={ocupado || leyendo || neto <= 0} onClick={onGuardar}><Check size={16} /></IconBtn>
        </div>
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
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          {gastos.map((row) => (
            <TarjetaGasto key={row.id} t={t} row={row} api={api} contratoId={contratoId} caja={caja} acceso={acceso} enLegalizacion={enLegalizacion} borrarId={borrarId} onVer={onVer} onEditar={onEditar} onAprobar={onAprobar} onPedirRechazo={onPedirRechazo} onEliminar={onEliminar} />
          ))}
          {!gastos.length && <Vacio t={t} frase="Sin gastos registrados" />}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, padding: '8px 2px', borderTop: `1px solid ${t.border}` }}>
            <span>Total</span>
            <span>{formatCOP(totalNeto)}</span>
          </div>
        </div>
      ) : (
        <TablaGastos
          t={t}
          gastos={gastos}
          totalNeto={totalNeto}
          api={api}
          contratoId={contratoId}
          caja={caja}
          acceso={acceso}
          enLegalizacion={enLegalizacion}
          borrarId={borrarId}
          onVer={onVer}
          onEditar={onEditar}
          onAprobar={onAprobar}
          onPedirRechazo={onPedirRechazo}
          onEliminar={onEliminar}
        />
      )}
    </div>
  )
}

function TablaGastos(props) {
  const { t, gastos, totalNeto } = props
  const vigentes = gastos.filter((row) => row.estado_validacion !== 'rechazado')
  const sumaBruto = vigentes.reduce((s, row) => s + dinero(row.valor_bruto), 0)
  const sumaImpuestos = vigentes.reduce((s, row) => s + netoImpuestos(row), 0)
  return (
    <table className="cm-excel">
      <colgroup>
        <col style={{ width: '4%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '11%' }} />
        <col style={{ width: '11%' }} />
        <col style={{ width: '11%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '9%' }} />
      </colgroup>
      <thead>
        <tr>
          <th>#</th>
          <th>Fecha</th>
          <th>Razón Social</th>
          <th>Descripción</th>
          <th className="cm-num">Bruto</th>
          <th className="cm-num">Impuestos</th>
          <th className="cm-num">Neto</th>
          <th>Soporte</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {gastos.map((row) => (
          <FilaGastoLista key={row.id} {...props} row={row} />
        ))}
        {!gastos.length && (
          <tr><td colSpan={10}><Vacio t={t} frase="Sin gastos registrados" /></td></tr>
        )}
        <tr className="cm-total">
          <td colSpan={4}>Total</td>
          <td className="cm-num">{formatCOP(sumaBruto)}</td>
          <td className="cm-num">{formatCOP(sumaImpuestos)}</td>
          <td className="cm-num">{formatCOP(totalNeto)}</td>
          <td colSpan={3} />
        </tr>
      </tbody>
    </table>
  )
}

const CAMPOS_OBLIGATORIOS = new Set([
  'fecha',
  'tercero_razon_social',
  'tercero_documento',
  'documento_no',
  'descripcion',
  'centro_costos',
  'valor_bruto',
])

function campoSuave(t, extra) {
  return {
    width: '100%',
    maxWidth: '100%',
    minHeight: 32,
    border: `1px solid ${t.inputBorder || t.border}`,
    borderRadius: 6,
    background: t.inputBg,
    color: t.text,
    padding: '4px 8px',
    fontSize: 'var(--cc-sm)',
    lineHeight: 1.3,
    boxSizing: 'border-box',
    textAlign: 'left',
    ...extra,
  }
}

function etiquetaSuave(t) {
  return { display: 'block', color: t.textMuted, fontSize: 11, lineHeight: 1.2, marginBottom: 3 }
}

function campoPendiente(gasto, clave) {
  if (!CAMPOS_OBLIGATORIOS.has(clave)) return false
  return String(gasto?.[clave] ?? '').trim() === ''
}

function estiloSuave(t, gasto, clave, extra) {
  const base = campoSuave(t, extra)
  if (!campoPendiente(gasto, clave)) return base
  return { ...base, border: '1.5px solid #D97706' }
}

function textoMoneda(valor) {
  if (valor === '' || valor == null) return ''
  const crudo = String(valor).trim()
  if (!crudo.includes('$') && Number.isFinite(Number(crudo))) return formatCOP(Number(crudo))
  const digitos = crudo.replace(/\D/g, '')
  if (!digitos) return ''
  return formatCOP(Number(digitos))
}

function trozosDescripcion(valor, marcas, t) {
  if (!valor) return ' '
  const nodos = []
  let cursor = 0
  marcas.forEach((marca, i) => {
    if (marca.inicio > cursor) nodos.push(valor.slice(cursor, marca.inicio))
    nodos.push(
      <span
        key={`${marca.inicio}-${i}`}
        style={{
          textDecoration: 'underline',
          textDecorationColor: t.primary,
          textDecorationThickness: '1px',
          textUnderlineOffset: '3px',
        }}
      >{valor.slice(marca.inicio, marca.fin)}
      </span>,
    )
    cursor = marca.fin
  })
  if (cursor < valor.length) nodos.push(valor.slice(cursor))
  return nodos
}

function CampoDescripcion({ t, gasto, setGasto }) {
  const fondo = useRef(null)
  const [menu, setMenu] = useState(null)
  const valor = gasto.descripcion ?? ''
  const marcas = revisarDescripcion(valor)
  const capa = {
    width: '100%',
    maxWidth: '100%',
    minHeight: 56,
    border: `1px solid ${campoPendiente(gasto, 'descripcion') ? '#D97706' : (t.inputBorder || t.border)}`,
    borderRadius: 6,
    background: t.inputBg,
    color: t.text,
    padding: '4px 8px',
    fontSize: 'var(--cc-sm)',
    lineHeight: 1.35,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    textAlign: 'left',
  }
  function elegir(sugerencia) {
    if (!menu) return
    const siguiente = `${valor.slice(0, menu.inicio)}${sugerencia}${valor.slice(menu.fin)}`
    setGasto({ ...gasto, descripcion: siguiente })
    setMenu(null)
  }
  function alApuntar(evento) {
    const pos = evento.currentTarget.selectionStart || 0
    const marca = marcas.find((item) => pos >= item.inicio && pos <= item.fin)
    setMenu(marca ? { ...marca } : null)
  }
  return (
    <label style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <span style={etiquetaSuave(t)}>Descripción</span>
      <div style={{ position: 'relative', minWidth: 0 }}>
        <div aria-hidden="true" ref={fondo} style={capa}>{trozosDescripcion(valor, marcas, t)}</div>
        <textarea
          aria-label="Descripción"
          data-cm-orden="5"
          enterKeyHint="enter"
          rows={2}
          value={valor}
          onChange={(e) => {
            setMenu(null)
            setGasto({ ...gasto, descripcion: e.target.value })
          }}
          onClick={alApuntar}
          onTouchEnd={alApuntar}
          onScroll={(e) => { if (fondo.current) fondo.current.scrollTop = e.target.scrollTop }}
          onBlur={() => {
            const listo = formatearDescripcion(valor)
            setMenu(null)
            if (listo !== valor) setGasto({ ...gasto, descripcion: listo })
          }}
          style={{
            ...capa,
            position: 'absolute',
            inset: 0,
            height: '100%',
            margin: 0,
            resize: 'none',
            overflow: 'hidden',
            color: 'transparent',
            caretColor: t.text,
            background: 'transparent',
          }}
        />
        {menu && (
          <div
            role="listbox"
            aria-label="Sugerencias de corrección"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '100%',
              zIndex: 4,
              marginTop: 4,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: t.bgCard,
              boxShadow: t.shadow,
            }}
          >
            {menu.sugerencias.length ? menu.sugerencias.map((sugerencia) => (
              <button
                key={sugerencia}
                type="button"
                role="option"
                onMouseDown={(e) => { e.preventDefault(); elegir(sugerencia) }}
                onTouchStart={(e) => { e.preventDefault(); elegir(sugerencia) }}
                style={{
                  border: `1px solid ${t.border}`,
                  background: t.inputBg,
                  color: t.text,
                  borderRadius: 8,
                  minHeight: 36,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 'var(--cc-sm)',
                }}
              >{sugerencia}
              </button>
            )) : (
              <span style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin sugerencias</span>
            )}
          </div>
        )}
      </div>
    </label>
  )
}

function FormularioGasto({ t, movil, gasto, setGasto, neto, leyendo, onDocumento }) {
  const set = (clave) => (e) => setGasto({ ...gasto, [clave]: e.target.value })
  const setMoneda = (clave) => (e) => setGasto({ ...gasto, [clave]: String(e.target.value || '').replace(/\D/g, '') })
  const columnas = movil ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)'
  const valores = movil ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))'
  const hueco = { minWidth: 0, display: 'flex', flexDirection: 'column' }
  const texto = (clave, label, tipo = 'text', span, extra = {}) => (
    <label style={{ ...hueco, gridColumn: span || 'auto' }}>
      <span style={etiquetaSuave(t)}>{label}</span>
      <input
        aria-label={label}
        data-cm-orden={extra.saltar ? undefined : extra.orden}
        data-cm-saltar={extra.saltar ? '' : undefined}
        tabIndex={extra.saltar ? -1 : undefined}
        enterKeyHint={extra.saltar ? undefined : 'next'}
        className={tipo === 'date' ? 'cm-gasto-fecha' : undefined}
        type={tipo}
        max={tipo === 'date' ? hoyColombia() : undefined}
        value={gasto[clave] ?? ''}
        onChange={set(clave)}
        onBlur={clave === 'tercero_documento' ? () => onDocumento(gasto.tercero_documento) : undefined}
        style={estiloSuave(t, gasto, clave)}
      />
    </label>
  )
  const moneda = (clave, label, opcional, orden) => (
    <label style={hueco}>
      <span style={etiquetaSuave(t)}>{label}</span>
      <input
        aria-label={label}
        data-cm-orden={orden}
        enterKeyHint="next"
        inputMode="numeric"
        placeholder={opcional ? 'Opcional' : undefined}
        value={textoMoneda(gasto[clave])}
        onChange={setMoneda(clave)}
        style={estiloSuave(t, gasto, clave, { textAlign: 'right' })}
      />
    </label>
  )
  return (
    <div style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
      <style>{`
        .cm-gasto-fecha { text-align: left; }
        .cm-gasto-fecha::-webkit-datetime-edit,
        .cm-gasto-fecha::-webkit-date-and-time-value { text-align: left; }
      `}</style>
      {leyendo && (
        <div style={{ color: t.primary, fontSize: 'var(--cc-sm)', fontWeight: 700 }}>
          Leyendo la factura…
        </div>
      )}
      <section style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        <TituloSeccion t={t} icono={<FileText size={14} />}>Documento</TituloSeccion>
        <div style={{ display: 'grid', gridTemplateColumns: columnas, gap: 8, minWidth: 0 }}>
          {texto('fecha', 'Fecha', 'date', undefined, { orden: '1' })}
          {texto('documento_no', 'Documento No.', 'text', undefined, { orden: '2' })}
          {texto('tercero_razon_social', 'Razón Social', 'text', movil ? 'auto' : '1 / -1', { orden: '3' })}
          {texto('tercero_documento', 'NIT o cédula', 'text', undefined, { orden: '4' })}
          {texto('centro_costos', 'Centro de costos', 'text', undefined, { saltar: true })}
        </div>
      </section>
      <section style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        <TituloSeccion t={t} icono={<AlignLeft size={14} />}>Descripción</TituloSeccion>
        <CampoDescripcion t={t} gasto={gasto} setGasto={setGasto} />
        <label style={hueco}>
          <span style={etiquetaSuave(t)}>Observaciones</span>
          <textarea
            aria-label="Observaciones"
            data-cm-orden="6"
            enterKeyHint="enter"
            rows={3}
            placeholder="Opcional"
            value={gasto.observaciones ?? ''}
            onChange={set('observaciones')}
            style={{ ...campoSuave(t), minHeight: 64, resize: 'vertical' }}
          />
        </label>
      </section>
      <section style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        <TituloSeccion t={t} icono={<Coins size={14} />}>Valores</TituloSeccion>
        <div style={{ display: 'grid', gridTemplateColumns: valores, gap: 8, minWidth: 0 }}>
          {moneda('valor_bruto', 'Valor bruto', false, '7')}
          {moneda('iva', 'IVA', true, '8')}
          {moneda('retenciones', 'Retenciones', true, '9')}
          {moneda('impuesto_consumo', 'Impuesto al consumo', true, '10')}
          {moneda('otros_deducibles', 'Otros deducibles', true, '11')}
          <div style={hueco}>
            <span style={etiquetaSuave(t)}>Valor neto</span>
            <div style={{
              ...campoSuave(t),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              fontWeight: 800,
              fontSize: 'var(--cc-lg)',
              textAlign: 'right',
              background: t.headerBg,
              border: `1.5px solid ${t.primary}`,
              minHeight: 44,
            }}
            >{formatCOP(neto > 0 ? neto : 0)}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function AccionesGasto({ t, row, caja, acceso, enLegalizacion, borrarId, onEditar, onPedirRechazo, onEliminar, compact }) {
  const abierta = caja?.estado === 'abierta'
  const icono = compact ? 14 : 16
  return (
    <span style={{ display: 'inline-flex', gap: compact ? 2 : 4, flexWrap: 'wrap', maxWidth: '100%' }}>
      {enLegalizacion && acceso.validar && row.estado_validacion === 'pendiente' && (
        <IconBtn compact={compact} title="Validar gasto" t={t} onClick={() => onPedirRechazo(row)}><Check size={icono} /></IconBtn>
      )}
      {abierta && acceso.editar && row.estado_validacion === 'pendiente' && (
        <IconBtn compact={compact} title="Editar gasto" t={t} onClick={() => onEditar(row)}><Pencil size={icono} /></IconBtn>
      )}
      {abierta && acceso.eliminar && (
        <IconBtn compact={compact} title={borrarId === `g${row.id}` ? 'Confirmar eliminación' : 'Eliminar gasto'} t={t} onClick={() => onEliminar(row)}>
          <Trash2 size={icono} />
        </IconBtn>
      )}
    </span>
  )
}

function Linea({ texto, clase = 'cm-clip' }) {
  const valor = texto || '—'
  return <span className={clase} title={texto || undefined}>{valor}</span>
}

function FilaGastoLista(props) {
  const { t, row } = props
  const url = useSoporte(props.api, props.contratoId, props.caja.id, 'gastos', row.id, true)
  const neto = row.estado_validacion === 'rechazado' ? 0 : row.valor_neto
  const impuestos = textoImpuestos(row)
  return (
    <tr style={{ opacity: row.estado_validacion === 'rechazado' ? 0.55 : 1 }}>
      <td>{row.consecutivo}</td>
      <td>
        <Linea texto={row.fecha} />
        <Linea texto={row.documento_no} clase="cm-sub" />
      </td>
      <td>
        <Linea texto={row.tercero_razon_social} />
        <Linea texto={row.tercero_documento} clase="cm-sub" />
      </td>
      <td>
        <Linea texto={row.descripcion} />
        {row.observaciones ? <Linea texto={row.observaciones} clase="cm-sub" /> : null}
      </td>
      <td className="cm-num" title={formatCOP(row.valor_bruto)}>{formatCOP(row.valor_bruto)}</td>
      <td className="cm-num" data-cc-tooltip={impuestos} data-cc-tooltip-help="" title={impuestos}>
        {formatCOP(netoImpuestos(row))}
      </td>
      <td className="cm-num" title={formatCOP(neto)}>{formatCOP(neto)}</td>
      <td>
        <Miniatura url={url} titulo={`Recibo ${row.consecutivo}`} t={t} onAmpliar={() => props.onVer('gastos', row.id, `Recibo ${row.consecutivo}`)} />
      </td>
      <td title={row.observacion_validacion || ETIQUETA_ESTADO[row.estado_validacion]}>
        <Etiqueta compact estado={row.estado_validacion} />
      </td>
      <td>
        <AccionesGasto compact t={t} row={row} caja={props.caja} acceso={props.acceso} enLegalizacion={props.enLegalizacion} borrarId={props.borrarId} onEditar={props.onEditar} onAprobar={props.onAprobar} onPedirRechazo={props.onPedirRechazo} onEliminar={props.onEliminar} />
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
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.bgCard, padding: 10, minWidth: 0, boxShadow: t.shadow, borderTop: `3px solid ${t.primary}`, opacity: row.estado_validacion === 'rechazado' ? 0.7 : 1 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
        <Miniatura url={url} titulo={`Recibo ${row.consecutivo}`} t={t} onAmpliar={() => props.onVer('gastos', row.id, `Recibo ${row.consecutivo}`)} />
        <button type="button" onClick={() => setAbierta((v) => !v)} style={{ flex: 1, minWidth: 0, display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', background: 'transparent', border: 'none', color: t.text, padding: 0, cursor: 'pointer' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="cm-clip" style={{ fontWeight: 700 }} title={row.tercero_razon_social}>#{row.consecutivo} · {row.tercero_razon_social}</span>
            <span className="cm-sub" title={row.tercero_documento}>{row.tercero_documento || '—'}</span>
            <span className="cm-sub" title={`${row.fecha || ''} · ${row.documento_no || ''}`}>{row.fecha} · {row.documento_no}</span>
            <span style={{ display: 'block', fontWeight: 700 }}>{formatCOP(neto)}</span>
          </span>
          <Etiqueta compact estado={row.estado_validacion} />
        </button>
      </div>
      {abierta && (
        <div style={{ marginTop: 8, display: 'grid', gap: 4, fontSize: 'var(--cc-sm)', minWidth: 0 }}>
          <div className="cm-clip" title={row.tercero_documento}>NIT {row.tercero_documento}</div>
          <div className="cm-clip" title={row.descripcion}>{row.descripcion}</div>
          {row.observaciones ? <div className="cm-clip" title={row.observaciones}>{row.observaciones}</div> : null}
          <div
            data-cc-tooltip={textoImpuestos(row)}
            data-cc-tooltip-help=""
            title={textoImpuestos(row)}
          >
            Bruto {formatCOP(row.valor_bruto)} · Impuestos {formatCOP(netoImpuestos(row))}
          </div>
          {row.observacion_validacion ? <div style={{ color: t.textMuted }}>{row.observacion_validacion}</div> : null}
          <AccionesGasto t={t} row={row} caja={props.caja} acceso={props.acceso} enLegalizacion={props.enLegalizacion} borrarId={props.borrarId} onEditar={props.onEditar} onAprobar={props.onAprobar} onPedirRechazo={props.onPedirRechazo} onEliminar={props.onEliminar} />
        </div>
      )}
    </div>
  )
}

function SoporteGuardado({ api, contratoId, cajaId, itemId, t, onVer }) {
  const url = useSoporte(api, contratoId, cajaId, 'gastos', itemId, true)
  return <Miniatura orden="22" url={url} titulo="Recibo guardado" t={t} onAmpliar={onVer} />
}
