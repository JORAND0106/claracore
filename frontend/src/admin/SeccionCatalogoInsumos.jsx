import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { useClaraViewport } from '../useClaraViewport'
import { createCatalogoInsumosApi, fmtMoney } from './catalogoInsumosApi'
import { esDesarrolladorUsuario } from '../utils/permisosContrato'
import { permisosCatalogoInsumos } from './catalogoInsumosPermisos'
import {
  EMPTY_IMPUESTO,
  IMPUESTO_CAMPOS_UI,
  computeValorDespuesAiuIva,
  etiquetaTributos,
  formImpuestoDesdeTributos,
  fmtPctDesdeDecimal,
  fmtSumatoriaAiu,
  inferirTipoImpuesto,
  impuestoTieneDatos,
  labelTipoImpuesto,
  seedTributosDesdeLegado,
  tooltipTotalPorcentaje,
  tributosPayloadDesdeForm,
} from './catalogoInsumosTributos'
import { buildContratoUiTheme } from '../theme/adminPanelTheme'
import { UnidadSelector } from '../utils/unidadesListadoPrecios'
import CcConfirmModal from '../components/CcConfirmModal'
import CatalogoProveedorAutocomplete from './CatalogoProveedorAutocomplete'
import {
  applyAutoGanadoraByMinValor,
  applyPdfReplace,
  buildParFromCapture,
  collectPdfFilesFromPares,
  cotizacionesPayloadForSave,
  detalleVisibleDesdeInsumoRow,
  fileFromDataTransfer,
  ganadoraDesdeInsumoRow,
  ganadoraRuleErrors,
  otrasCotizaciones,
  pickGanadora,
  seedCotizacionPares,
  syncLegacyFromGanadora,
  validateCaptureForEnviar,
  validateGuardarInsumo,
} from './catalogoInsumosCotizaciones'

const EMPTY_FORM = {
  proveedor_id: '',
  razon_social: '',
  nit: '',
  contacto_email: '',
  contacto_nombre: '',
  contacto_telefono: '',
  codigo: '',
  descripcion: '',
  unidad: '',
  rendimiento: '',
  costo_base: '',
  valor_no_previsto: '',
  cantidad_negociada: '',
  cantidad_negociada_np: '',
  impuesto: { ...EMPTY_IMPUESTO },
  impuesto_np: { ...EMPTY_IMPUESTO },
  cotizacion_numero: '',
  cotizacion_fecha: '',
  cotizacion_vigencia: '',
  cotizacion_fecha_np: '',
  cotizacion_vigencia_np: '',
  cotizaciones_detalle: [],
  requiere_cotizacion: true,
}

function snapshotForm(f) {
  return JSON.stringify({
    proveedor_id: String(f.proveedor_id || ''),
    razon_social: f.razon_social || '',
    nit: f.nit || '',
    contacto_email: f.contacto_email || '',
    contacto_nombre: f.contacto_nombre || '',
    contacto_telefono: f.contacto_telefono || '',
    codigo: f.codigo || '',
    descripcion: f.descripcion || '',
    unidad: f.unidad || '',
    rendimiento: String(f.rendimiento ?? ''),
    costo_base: String(f.costo_base ?? ''),
    valor_no_previsto: String(f.valor_no_previsto ?? ''),
    cantidad_negociada: String(f.cantidad_negociada ?? ''),
    cantidad_negociada_np: String(f.cantidad_negociada_np ?? ''),
    impuesto: f.impuesto || EMPTY_IMPUESTO,
    impuesto_np: f.impuesto_np || EMPTY_IMPUESTO,
    cotizacion_numero: f.cotizacion_numero || '',
    cotizacion_fecha: f.cotizacion_fecha || '',
    cotizacion_vigencia: f.cotizacion_vigencia || '',
    cotizacion_fecha_np: f.cotizacion_fecha_np || '',
    cotizacion_vigencia_np: f.cotizacion_vigencia_np || '',
    cotizaciones_detalle: cotizacionesPayloadForSave(f.cotizaciones_detalle || []),
    requiere_cotizacion: !!f.requiere_cotizacion,
  })
}

const MAIN_CATALOG_TABS = [
  { id: 'insumos', label: 'Insumos' },
  { id: 'proveedores', label: 'Proveedores' },
]

function sheetZebra(ui, index) {
  if (index % 2 === 0) return ui.tok.bgCard
  if (ui.dark) return 'rgba(30, 58, 95, 0.28)'
  if (ui.rest) return 'rgba(201, 184, 164, 0.22)'
  return 'rgba(241, 245, 249, 0.92)'
}

function SheetSectionTitle({ children, t, ui }) {
  return (
    <div style={{
      fontWeight: 800,
      fontSize: 'var(--cc-sm)',
      color: t.primary,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      margin: '14px 0 8px',
      padding: '6px 8px',
      background: ui.cardSubtle,
      border: `1px solid ${t.border}`,
    }}
    >
      {children}
    </div>
  )
}

function sheetCellInput(inputStyle, extra = {}) {
  return {
    ...inputStyle,
    borderRadius: 0,
    border: 'none',
    background: 'transparent',
    padding: '4px 6px',
    minHeight: 28,
    width: '100%',
    ...extra,
  }
}

/** Vista previa: valor después de AIU/IVA (solo lectura). */
function computeTotal(costo, impuestoForm) {
  return computeValorDespuesAiuIva(costo, impuestoForm || EMPTY_IMPUESTO, { valoresEnDecimal: true })
}

function IconPaperclip() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function AttachmentPreviewModal({ file, fileName, onClose, ui, t }) {
  const url = useMemo(() => {
    if (!file) return null
    try {
      return URL.createObjectURL(file)
    } catch {
      return null
    }
  }, [file])

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])

  const name = file?.name || fileName || 'Adjunto'
  const isPdf = (file?.type || '').includes('pdf') || /\.pdf$/i.test(name)
  const isImage = (file?.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name)

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10040, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
      onClick={onClose}
    >
      <div
        style={{ width: 'min(920px, 96vw)', height: 'min(88vh, 900px)', ...{ background: t.bgCard, borderRadius: 12, border: `1px solid ${t.border}`, color: t.text }, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${t.border}` }}>
          <strong style={{ fontSize: 'var(--cc-sm)' }}>Vista previa — {name}</strong>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>Cerrar</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: ui.dark ? '#0a1628' : '#f1f5f9' }}>
          {!url ? (
            <div style={{ padding: 24, color: t.textMuted }}>No hay archivo local para previsualizar. Adjunte el PDF o imagen con el clip.</div>
          ) : isPdf ? (
            <iframe title={name} src={url} style={{ width: '100%', height: '100%', border: 'none' }} />
          ) : isImage ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
              <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          ) : (
            <div style={{ padding: 24, color: t.textMuted }}>Tipo de archivo no previsualizable en plataforma. Adjunto: {name}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function CotizacionClipBtn({ file, fileName, pdfHistorial, onPick, onPreview, t, disabled, dropHint }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const label = file?.name || fileName || ''
  const histCount = Array.isArray(pdfHistorial) ? pdfHistorial.length : 0

  const acceptFile = (f) => {
    if (!f || disabled) return
    onPick?.(f)
  }

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) setDragOver(true) }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) setDragOver(true) }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        acceptFile(e.dataTransfer?.files?.[0])
      }}
      title={dropHint || (label ? `Vigente: ${label}. Reemplace o arrastre otro PDF.` : 'Adjunte o arrastre el PDF aquí')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        maxWidth: '100%',
        minHeight: 32,
        padding: '2px 4px',
        borderRadius: 6,
        border: `1.5px ${dragOver ? 'dashed' : 'solid'} ${dragOver ? t.primary : 'transparent'}`,
        background: dragOver ? `${t.primary}14` : 'transparent',
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          acceptFile(e.target.files?.[0] || null)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        title={label ? `Reemplazar PDF vigente (${label})` : 'Adjuntar cotización (PDF)'}
        aria-label={label ? `Reemplazar adjunto: ${label}` : 'Adjuntar cotización'}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 0,
          borderRadius: 6,
          border: `1px solid ${label ? t.primary : t.border}`,
          background: label ? `${t.primary}18` : t.inputBg,
          color: label ? t.primary : t.textMuted,
          cursor: disabled ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        <IconPaperclip />
      </button>
      {label ? (
        <button
          type="button"
          title="Ver adjunto vigente (sin descargar)"
          aria-label="Ver adjunto"
          disabled={disabled || !file}
          onClick={() => onPreview?.({ file, fileName: label })}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            borderRadius: 6,
            border: `1px solid ${t.border}`,
            background: t.inputBg,
            color: file ? t.primary : t.textMuted,
            cursor: (!file || disabled) ? 'not-allowed' : 'pointer',
            opacity: file ? 1 : 0.45,
            flexShrink: 0,
          }}
        >
          <IconEye />
        </button>
      ) : null}
      <div style={{ minWidth: 0, flex: 1 }}>
        {label ? (
          <div
            style={{
              fontSize: 'var(--cc-xs)',
              color: t.textMuted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 90,
            }}
            title={label}
          >
            {label}
          </div>
        ) : (
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, opacity: 0.75 }}>Arrastre PDF</div>
        )}
        {histCount > 0 && (
          <div
            style={{ fontSize: 10, color: t.textMuted, opacity: 0.8 }}
            title={(pdfHistorial || []).map((h) => h.nombre).join(' → ')}
          >
            {histCount} reemplazo(s)
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 'var(--cc-caption)', marginBottom: 4, opacity: 0.9 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 'var(--cc-xs)', opacity: 0.72, marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function ModalTabs({ tabs, active, onChange, ui }) {
  const t = ui.tok
  return (
    <div
      role="tablist"
      aria-label="Secciones del formulario"
      style={{
        display: 'flex',
        gap: 4,
        marginBottom: 16,
        borderBottom: `1px solid ${t.border}`,
        paddingBottom: 0,
      }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            style={{
              padding: '10px 16px',
              border: 'none',
              borderBottom: isActive ? `2px solid ${t.primary}` : '2px solid transparent',
              background: isActive ? ui.tabActiveBg : 'transparent',
              color: isActive ? t.primary : t.textMuted,
              fontWeight: isActive ? 700 : 500,
              fontSize: 'var(--cc-sm)',
              cursor: 'pointer',
              borderRadius: '8px 8px 0 0',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function IconActionBtn({ title, onClick, disabled, children, t, variant = 'ghost' }) {
  const isPrimary = variant === 'primary'
  const isDanger = variant === 'danger'
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: 8,
    border: isPrimary ? 'none' : `1px solid ${isDanger ? '#dc262688' : t.border}`,
    background: isPrimary ? t.primary : isDanger ? 'transparent' : t.inputBg,
    color: isPrimary ? '#fff' : isDanger ? '#f87171' : t.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : isDanger ? 0.85 : 0.68,
    transition: 'opacity 0.15s, background 0.15s',
    flexShrink: 0,
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={base}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.opacity = disabled ? '0.45' : '0.68'
      }}
    >
      {children}
    </button>
  )
}

/** Botón de barra de herramientas con etiqueta visible y tipografía de plataforma. */
function ToolbarBtn({ title, label, onClick, disabled, children, t, variant = 'ghost', iconColor }) {
  const isPrimary = variant === 'primary'
  const resolvedIconColor = isPrimary ? '#fff' : (iconColor || t.primary)
  return (
    <button
      type="button"
      title={title || label}
      aria-label={title || label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: 36,
        padding: '6px 12px',
        borderRadius: 8,
        border: isPrimary ? 'none' : `1px solid ${t.border}`,
        background: isPrimary ? t.primary : t.inputBg,
        color: isPrimary ? '#fff' : t.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: 'var(--cc-sm)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        lineHeight: 1.2,
      }}
    >
      <span
        aria-hidden
        className="cc-catalogo-toolbar-icon"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: resolvedIconColor,
          flexShrink: 0,
        }}
      >
        {children}
      </span>
      <span>{label}</span>
    </button>
  )
}

/**
 * Paleta de íconos de la barra — tonos ClaraCore (azul / teal / verde),
 * sin saturaciones que rompan claro/oscuro/descanso.
 */
const TOOLBAR_ICON_COLORS = {
  refresh: '#0077B6',
  create: '#ffffff',
  plantillaInsumos: '#0284C7',
  cargarInsumos: '#0D9488',
  plantillaProveedores: '#1D4ED8',
  cargarProveedores: '#047857',
}

function SvgIcon({ children }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

function IconTemplateDownload() {
  return (
    <SvgIcon>
      <path d="M8 3h8l4 4v14H8V3z" />
      <path d="M16 3v4h4" />
      <path d="M12 11v5" />
      <path d="M9.5 13.5L12 16l2.5-2.5" />
    </SvgIcon>
  )
}

function IconCsvImport() {
  return (
    <SvgIcon>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
      <path d="M18 2v4h4" />
      <path d="M20 2l-5 5" />
    </SvgIcon>
  )
}

function IconNewInsumo() {
  return (
    <SvgIcon>
      <path d="M12 3v6M9 6h6" />
      <path d="M5 10h14v11H5V10z" />
    </SvgIcon>
  )
}

function IconHistory() {
  return (
    <SvgIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </SvgIcon>
  )
}

function IconEditRow() {
  return (
    <SvgIcon>
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M14 6l4 4" />
    </SvgIcon>
  )
}

function IconDeleteRow() {
  return (
    <SvgIcon>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V5h6v2" />
    </SvgIcon>
  )
}

function IconOcrScan() {
  return (
    <SvgIcon>
      <path d="M4 7V5a1 1 0 0 1 1-1h2" />
      <path d="M20 7V5a1 1 0 0 0-1-1h-2" />
      <path d="M4 17v2a1 1 0 0 0 1 1h2" />
      <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
      <path d="M7 10h10M7 14h6" />
    </SvgIcon>
  )
}

function IconPriceRefresh() {
  return (
    <SvgIcon>
      <path d="M4 12a8 8 0 0 1 13.5-5.7" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-13.5 5.7" />
      <path d="M4 20v-5h5" />
    </SvgIcon>
  )
}

function IconCatalogRefresh() {
  return <IconPriceRefresh />
}

function IconProveedoresTemplate() {
  return (
    <SvgIcon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </SvgIcon>
  )
}

function IconProveedoresImport() {
  return (
    <SvgIcon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v4" />
      <path d="M17 12l2 2 2-2" />
    </SvgIcon>
  )
}

function TributoModalShell({ open, title, onClose, onSave, t, children }) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100120,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 96vw)',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 16,
          color: t.text,
          boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', marginBottom: 12, color: t.primary }}>
          {title}
        </div>
        {children}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
              background: t.inputBg, color: t.text, cursor: 'pointer', fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: t.primary, color: '#fff', cursor: 'pointer', fontWeight: 700,
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SeccionCatalogoInsumos({ token, user, perms, theme: themeMode, t: tProp, embedded = false }) {
  const { isMobile, isLandscapeMobile } = useClaraViewport()
  const compactCatalog = isMobile || isLandscapeMobile
  const contratoId = user?.contrato_id
  const api = useMemo(() => (contratoId && token ? createCatalogoInsumosApi(contratoId, token) : null), [contratoId, token])
  const ui = useMemo(() => buildContratoUiTheme(themeMode, tProp), [themeMode, tProp])
  const t = ui.tok
  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.inputBg,
    color: t.text,
    fontSize: 'var(--cc-sm)',
    boxSizing: 'border-box',
  }
  const btnPrimary = {
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: t.primary,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 'var(--cc-sm)',
  }
  const btnSecondary = {
    ...btnPrimary,
    background: t.inputBg,
    color: t.text,
    border: `1px solid ${t.border}`,
  }
  const grid = t.border
  const th = {
    padding: '7px 8px',
    textAlign: 'left',
    fontSize: 'var(--cc-caption)',
    fontWeight: 800,
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
    border: `1px solid ${grid}`,
    background: t.headerBg || t.inputBg,
    position: 'sticky',
    top: 0,
    zIndex: 2,
  }
  const td = {
    padding: '5px 8px',
    fontSize: 'var(--cc-sm)',
    color: t.text,
    border: `1px solid ${grid}`,
    verticalAlign: 'middle',
    lineHeight: 1.25,
    background: 'transparent',
  }
  const tdNum = {
    ...td,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'ui-monospace, Consolas, monospace',
    fontWeight: 700,
    fontSize: 'var(--cc-xs)',
  }
  const tdCodigo = { ...td, color: t.primaryLight || t.primary, fontWeight: 600, whiteSpace: 'nowrap' }
  const tdDesc = { ...td, color: t.text, fontWeight: 500 }
  const tdMuted = { ...td, color: t.textMuted }
  const tdMoney = { ...tdNum, color: 'var(--cc-color-positive)' }
  const tdTotal = { ...tdNum, color: t.primary }
  const sheetWrap = {
    overflow: 'auto',
    border: `1px solid ${grid}`,
    borderRadius: 4,
    background: t.bgCard,
  }
  const sheetTable = {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    minWidth: 980,
  }
  const thHeader = {
    ...th,
    background: ui.dark
      ? 'rgba(0, 180, 198, 0.18)'
      : ui.rest
        ? 'rgba(14, 116, 144, 0.14)'
        : 'rgba(0, 119, 182, 0.10)',
    color: t.text,
  }
  const modalPanelStyle = {
    background: t.bgCard,
    borderRadius: 12,
    border: `1px solid ${t.border}`,
    color: t.text,
  }
  const cellInp = sheetCellInput(inputStyle)
  const costTh = {
    ...thHeader,
    padding: '2px 6px',
    fontWeight: 700,
    fontSize: 'var(--cc-caption)',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    lineHeight: 1.15,
    verticalAlign: 'middle',
  }
  const costTd = {
    ...td,
    padding: '1px 4px',
    fontSize: 'var(--cc-xs)',
    overflow: 'hidden',
    minWidth: 0,
  }
  const costCellInp = sheetCellInput(inputStyle, {
    padding: '1px 4px',
    minHeight: 22,
    fontSize: 'var(--cc-xs)',
    maxWidth: '100%',
    boxSizing: 'border-box',
  })
  const costBtnCompact = {
    ...btnSecondary,
    padding: '2px 8px',
    fontSize: 'var(--cc-caption)',
    minHeight: 22,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  }

  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [dupAlert, setDupAlert] = useState(null)
  const [historial, setHistorial] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [cotMinimas, setCotMinimas] = useState(3)
  const [modalFaltantes, setModalFaltantes] = useState([])
  const [modalRuleErrors, setModalRuleErrors] = useState([])
  const [previewAdjunto, setPreviewAdjunto] = useState(null) // { file, fileName }
  const csvRef = useRef(null)
  const csvProvRef = useRef(null)
  const [csvPending, setCsvPending] = useState(null) // { file, kind: 'insumos'|'proveedores' }
  const [csvModo, setCsvModo] = useState('agregar')
  const [unidadModoCustom, setUnidadModoCustom] = useState(false)
  const [unidadCustom, setUnidadCustom] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteProvConfirm, setDeleteProvConfirm] = useState(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const formBaselineRef = useRef('')
  const [mainTab, setMainTab] = useState('insumos')
  const [proveedores, setProveedores] = useState([])
  const [provTotal, setProvTotal] = useState(0)
  const [provQ, setProvQ] = useState('')
  const [provLoading, setProvLoading] = useState(false)
  const [consumoNegociado, setConsumoNegociado] = useState(null)
  const [modalImpuestoOpen, setModalImpuestoOpen] = useState(false)
  const [impuestoModalTarget, setImpuestoModalTarget] = useState('insumo')
  const [draftImpuesto, setDraftImpuesto] = useState({ ...EMPTY_IMPUESTO })
  const [selectedParId, setSelectedParId] = useState(null)

  const formHasChanges = useCallback(() => snapshotForm(form) !== formBaselineRef.current, [form])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setConfirmDiscard(false)
    setDupAlert(null)
    setConsumoNegociado(null)
    setModalFaltantes([])
    setModalRuleErrors([])
    setPreviewAdjunto(null)
    setSelectedParId(null)
    formBaselineRef.current = snapshotForm(EMPTY_FORM)
  }, [])

  const requestCloseModal = useCallback(() => {
    if (busy) return
    if (formHasChanges()) {
      setConfirmDiscard(true)
      return
    }
    closeModal()
  }, [busy, closeModal, formHasChanges])

  const totalPreview = useMemo(
    () => computeTotal(form.costo_base, form.impuesto),
    [form.costo_base, form.impuesto],
  )

  const totalPreviewNp = useMemo(() => {
    const base = form.valor_no_previsto !== '' && form.valor_no_previsto != null
      ? form.valor_no_previsto
      : form.costo_base
    return computeTotal(base, form.impuesto_np)
  }, [form.valor_no_previsto, form.costo_base, form.impuesto_np])

  const draftValorDespues = useMemo(() => {
    const base = impuestoModalTarget === 'np'
      ? (form.valor_no_previsto !== '' && form.valor_no_previsto != null
        ? form.valor_no_previsto
        : form.costo_base)
      : form.costo_base
    return computeTotal(base, draftImpuesto)
  }, [form.costo_base, form.valor_no_previsto, draftImpuesto, impuestoModalTarget])

  const tributosResumen = useMemo(
    () => etiquetaTributos(tributosPayloadDesdeForm(form.impuesto || EMPTY_IMPUESTO)),
    [form.impuesto],
  )

  const tributosResumenNp = useMemo(
    () => etiquetaTributos(tributosPayloadDesdeForm(form.impuesto_np || EMPTY_IMPUESTO)),
    [form.impuesto_np],
  )

  const tipoImpuestoInferido = useMemo(
    () => inferirTipoImpuesto(form.impuesto || EMPTY_IMPUESTO, { valoresEnDecimal: true }),
    [form.impuesto],
  )

  const draftTipoImpuesto = useMemo(
    () => inferirTipoImpuesto(draftImpuesto, { valoresEnDecimal: true }),
    [draftImpuesto],
  )

  const valorNegociadoPreview = useMemo(() => {
    const cant = Number(form.cantidad_negociada)
    if (!cant || cant <= 0 || !totalPreview) return null
    return Math.round(cant * totalPreview)
  }, [form.cantidad_negociada, totalPreview])

  const permsEfectivos = useMemo(
    () => (esDesarrolladorUsuario(user) ? permisosCatalogoInsumos(user, user?.contrato_id) : (perms || {})),
    [user, perms],
  )

  const canCrear = permsEfectivos?.crear
  const canEditar = permsEfectivos?.editar
  const canEliminar = permsEfectivos?.eliminar
  const canVer = permsEfectivos?.ver

  const loadProveedores = useCallback(() => {
    if (!api || !canVer) return
    setProvLoading(true)
    api.listProveedores(provQ, 200, 0)
      .then((r) => {
        setProveedores(r.items || [])
        setProvTotal(r.total || 0)
      })
      .catch((e) => setMsg({ type: 'error', text: e.message }))
      .finally(() => setProvLoading(false))
  }, [api, canVer, provQ])

  useEffect(() => {
    if (mainTab !== 'proveedores') return
    const tmr = setTimeout(loadProveedores, 200)
    return () => clearTimeout(tmr)
  }, [mainTab, loadProveedores])

  const load = useCallback(() => {
    if (!api || !canVer) return
    setLoading(true)
    api.listInsumos(q, 100, 0)
      .then((r) => {
        setRows(r.items || [])
        setTotal(r.total || 0)
      })
      .catch((e) => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false))
  }, [api, q, canVer])

  useEffect(() => {
    const tmr = setTimeout(load, 200)
    return () => clearTimeout(tmr)
  }, [load])

  useEffect(() => {
    if (!api || !canVer) return
    // Precarga directorio para que la pestaña Proveedores y el autocompletar tengan datos listos.
    loadProveedores()
  }, [api, canVer, loadProveedores])

  useEffect(() => {
    if (!api || !canVer) return
    api.getConfig()
      .then((c) => {
        const n = Number(c?.cotizaciones_minimas)
        if (n > 0) setCotMinimas(n)
      })
      .catch(() => { /* default 3 */ })
  }, [api, canVer])

  const refreshActiveTab = useCallback(() => {
    if (mainTab === 'proveedores') {
      loadProveedores()
      return
    }
    load()
  }, [mainTab, load, loadProveedores])

  const isRefreshing = mainTab === 'proveedores' ? provLoading : loading

  const openNew = async () => {
    setEditId(null)
    const nextForm = { ...EMPTY_FORM, cotizaciones_detalle: [] }
    setForm(nextForm)
    setUnidadModoCustom(false)
    setUnidadCustom('')
    setDupAlert(null)
    setConsumoNegociado(null)
    setModalFaltantes([])
    setModalRuleErrors([])
    setSelectedParId(null)
    setMainTab('insumos')
    setModalOpen(true)
    formBaselineRef.current = snapshotForm(nextForm)
    if (api) {
      try {
        const r = await api.getNextCodigo()
        setForm((f) => {
          const next = { ...f, codigo: r.codigo || '' }
          formBaselineRef.current = snapshotForm(next)
          return next
        })
      } catch {
        /* el backend asignará al guardar */
      }
    }
  }

  const openEdit = (row) => {
    setEditId(row.insumo_id || row.id)
    const trib = seedTributosDesdeLegado(row)
    let cotizaciones = seedCotizacionPares({
      existing: row.cotizaciones_detalle,
      minPares: 0,
      legacy: {
        cotizacion_numero: row.cotizacion_numero,
        cotizacion_fecha: row.cotizacion_fecha,
        cotizacion_vigencia: row.cotizacion_vigencia,
      },
      proveedorNombre: row.proveedor_nombre || '',
      costoBase: row.costo ?? row.costo_base ?? '',
    })
    cotizaciones = cotizaciones.map((p) => ({
      ...p,
      coherencia: p.coherencia || {
        descripcion: row.descripcion || '',
        unidad: row.unidad || '',
        rendimiento: row.rendimiento ?? '',
      },
    }))
    cotizaciones = applyAutoGanadoraByMinValor(cotizaciones)
    const legacySync = syncLegacyFromGanadora(cotizaciones)
    const gan = pickGanadora(cotizaciones)
    const nextForm = {
      ...EMPTY_FORM,
      proveedor_id: row.proveedor_id || '',
      razon_social: row.proveedor_nombre || '',
      nit: row.proveedor_nit || '',
      contacto_email: row.contacto_email || '',
      contacto_nombre: row.contacto_nombre || '',
      contacto_telefono: row.contacto_telefono || '',
      codigo: row.codigo || '',
      descripcion: row.descripcion || '',
      unidad: row.unidad || '',
      rendimiento: row.rendimiento ?? '',
      costo_base: gan?.valor != null && gan.valor !== '' ? String(gan.valor) : (row.costo ?? row.costo_base ?? ''),
      valor_no_previsto: '',
      cantidad_negociada: row.cantidad_negociada ?? '',
      impuesto: formImpuestoDesdeTributos(trib),
      cotizacion_numero: legacySync.cotizacion_numero || row.cotizacion_numero || '',
      cotizacion_fecha: '',
      cotizacion_vigencia: '',
      cotizaciones_detalle: cotizaciones,
      requiere_cotizacion: row.requiere_cotizacion !== false,
    }
    setForm(nextForm)
    formBaselineRef.current = snapshotForm(nextForm)
    setConsumoNegociado(row.consumo_negociado || null)
    setUnidadModoCustom(false)
    setUnidadCustom('')
    setDupAlert(null)
    setModalFaltantes([])
    setModalRuleErrors(ganadoraRuleErrors(cotizaciones))
    setSelectedParId(null)
    setMainTab('insumos')
    setModalOpen(true)
  }

  const captureFieldsFromPar = (par) => {
    const ins = par?.insumo || {}
    const np = par?.no_previsto || {}
    return {
      proveedor_id: par.proveedor_id || '',
      razon_social: ins.proveedor || '',
      nit: par.nit || '',
      contacto_email: par.contacto_email || '',
      contacto_nombre: par.contacto_nombre || '',
      contacto_telefono: par.contacto_telefono || '',
      costo_base: ins.valor != null && ins.valor !== '' ? String(ins.valor) : '',
      valor_no_previsto: np.valor != null && np.valor !== '' ? String(np.valor) : '',
      cotizacion_fecha: ins.fecha || '',
      cotizacion_vigencia: ins.vigencia || '',
      cotizacion_fecha_np: np.fecha || '',
      cotizacion_vigencia_np: np.vigencia || '',
    }
  }

  const syncParFromCapture = (par, f) => {
    const valorNp = f.valor_no_previsto !== '' && f.valor_no_previsto != null
      ? f.valor_no_previsto
      : f.costo_base
    const etiqIns = etiquetaTributos(tributosPayloadDesdeForm(f.impuesto || EMPTY_IMPUESTO))
    const etiqNp = etiquetaTributos(tributosPayloadDesdeForm(f.impuesto_np || EMPTY_IMPUESTO))
    return {
      ...par,
      proveedor_id: f.proveedor_id || par.proveedor_id || '',
      nit: (f.nit || '').trim(),
      contacto_email: (f.contacto_email || '').trim(),
      contacto_nombre: (f.contacto_nombre || '').trim(),
      contacto_telefono: (f.contacto_telefono || '').trim(),
      insumo: {
        ...(par.insumo || {}),
        proveedor: (f.razon_social || '').trim() || par.insumo?.proveedor || '',
        valor: f.costo_base !== '' && f.costo_base != null ? String(f.costo_base) : '',
        fecha: f.cotizacion_fecha || '',
        vigencia: f.cotizacion_vigencia || '',
        impuesto_etiqueta: etiqIns !== '—' ? etiqIns : (par.insumo?.impuesto_etiqueta || ''),
      },
      no_previsto: {
        ...(par.no_previsto || {}),
        proveedor: (f.razon_social || '').trim() || par.no_previsto?.proveedor || '',
        valor: valorNp !== '' && valorNp != null ? String(valorNp) : '',
        fecha: f.cotizacion_fecha_np || f.cotizacion_fecha || '',
        vigencia: f.cotizacion_vigencia_np || f.cotizacion_vigencia || '',
        impuesto_etiqueta: etiqNp !== '—' ? etiqNp : (par.no_previsto?.impuesto_etiqueta || ''),
      },
    }
  }

  const selectCotizacionPar = (par) => {
    if (!par?.id) return
    if (selectedParId === par.id) {
      setSelectedParId(null)
      return
    }
    setSelectedParId(par.id)
    setForm((f) => ({ ...f, ...captureFieldsFromPar(par) }))
  }

  /** Actualiza campos de captura; si hay fila seleccionada, sincroniza esa cotización. */
  const updateCapture = (patch) => {
    setForm((f) => {
      const next = { ...f, ...patch }
      if (!selectedParId) return next
      let list = (next.cotizaciones_detalle || []).map((p) => (
        p.id === selectedParId ? syncParFromCapture(p, next) : p
      ))
      list = applyAutoGanadoraByMinValor(list)
      const legacy = syncLegacyFromGanadora(list)
      setModalRuleErrors(ganadoraRuleErrors(list))
      return { ...next, cotizaciones_detalle: list, ...legacy }
    })
  }

  const patchParLado = (pairId, lado, patch) => {
    setForm((f) => {
      let list = (f.cotizaciones_detalle || []).map((p) => {
        if (p.id !== pairId) return p
        return {
          ...p,
          [lado]: { ...(p[lado] || {}), ...patch },
        }
      })
      list = applyAutoGanadoraByMinValor(list)
      const legacy = syncLegacyFromGanadora(list)
      const gan = pickGanadora(list)
      setModalRuleErrors(ganadoraRuleErrors(list))
      const next = {
        ...f,
        cotizaciones_detalle: list,
        ...legacy,
      }
      if (selectedParId) {
        const sel = list.find((p) => p.id === selectedParId)
        if (sel) Object.assign(next, captureFieldsFromPar(sel))
      } else if (gan?.valor != null && gan.valor !== '') {
        next.costo_base = String(gan.valor)
      }
      return next
    })
  }

  const assignPdfToLado = (pairId, lado, file) => {
    setForm((f) => {
      let list = (f.cotizaciones_detalle || []).map((p) => {
        if (p.id !== pairId) return p
        return {
          ...p,
          [lado]: applyPdfReplace(p[lado] || {}, file),
        }
      })
      list = applyAutoGanadoraByMinValor(list)
      const legacy = syncLegacyFromGanadora(list)
      setModalRuleErrors(ganadoraRuleErrors(list))
      return { ...f, cotizaciones_detalle: list, ...legacy }
    })
  }

  const onRowDropPdf = (pairId, lado, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const file = fileFromDataTransfer(e.dataTransfer)
    if (file) assignPdfToLado(pairId, lado, file)
  }

  const enviarCotizacionFila = () => {
    const { faltantes, coherencia } = validateCaptureForEnviar(form, form.cotizaciones_detalle || [])
    const all = [...faltantes, ...coherencia]
    if (all.length) {
      setModalFaltantes(all)
      setModalRuleErrors([])
      return
    }
    const list = buildParFromCapture(form, form.cotizaciones_detalle || [], {
      impuestoEtiqueta: etiquetaTributos(tributosPayloadDesdeForm(form.impuesto || EMPTY_IMPUESTO)),
      impuestoEtiquetaNp: etiquetaTributos(tributosPayloadDesdeForm(form.impuesto_np || EMPTY_IMPUESTO)),
    })
    const legacy = syncLegacyFromGanadora(list)
    const gan = pickGanadora(list)
    setModalFaltantes([])
    setModalRuleErrors(ganadoraRuleErrors(list))
    setSelectedParId(null)
    setForm((f) => ({
      ...f,
      cotizaciones_detalle: list,
      ...legacy,
      // Preparar siguiente cotización: otro proveedor, mismos desc/unidad/rendimiento
      proveedor_id: '',
      razon_social: '',
      nit: '',
      contacto_email: '',
      contacto_nombre: '',
      contacto_telefono: '',
      costo_base: gan?.valor != null && gan.valor !== '' ? String(gan.valor) : '',
      valor_no_previsto: '',
      cotizacion_fecha: '',
      cotizacion_vigencia: '',
      cotizacion_fecha_np: '',
      cotizacion_vigencia_np: '',
      cantidad_negociada_np: '',
    }))
  }

  const runOcr = async (pairId) => {
    const par = (form.cotizaciones_detalle || []).find((p) => p.id === pairId)
    const pdf = par?.insumo?.pdf
    if (!pdf || !api) return
    setOcrBusy(true)
    try {
      const r = await api.ocrCotizacion(pdf)
      const c = r.campos_catalogo || {}
      setForm((f) => {
        let list = (f.cotizaciones_detalle || []).map((p) => {
          if (p.id !== pairId) return p
          return {
            ...p,
            insumo: {
              ...p.insumo,
              proveedor: c.razon_social || p.insumo.proveedor,
              fecha: c.cotizacion_fecha || p.insumo.fecha,
              valor: c.costo_base != null ? String(c.costo_base) : p.insumo.valor,
            },
          }
        })
        list = applyAutoGanadoraByMinValor(list)
        const legacy = syncLegacyFromGanadora(list)
        const gan = pickGanadora(list)
        setModalRuleErrors(ganadoraRuleErrors(list))
        return {
          ...f,
          razon_social: c.razon_social || f.razon_social,
          nit: c.nit || f.nit,
          cotizacion_fecha: c.cotizacion_fecha || f.cotizacion_fecha,
          costo_base: gan?.valor != null && gan.valor !== '' ? String(gan.valor) : (c.costo_base != null ? String(c.costo_base) : f.costo_base),
          cotizaciones_detalle: list,
          ...legacy,
          impuesto: (c.impuesto_porcentaje != null || c.tipo_impuesto === 'iva')
            ? {
                ...f.impuesto,
                iva: c.impuesto_porcentaje != null
                  ? String(Number(c.impuesto_porcentaje) / 100)
                  : f.impuesto?.iva,
              }
            : f.impuesto,
        }
      })
      setMsg({ type: 'success', text: r.mensaje || 'OCR completado. Revise los campos.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setOcrBusy(false)
    }
  }

  const checkDupBeforeSave = async () => {
    if (!api || !form.descripcion.trim()) return null
    const pares = form.cotizaciones_detalle || []
    const ganPar = pares.find((p) => p.es_ganadora) || pares[0]
    const pid = ganPar?.proveedor_id
      ? Number(ganPar.proveedor_id)
      : (form.proveedor_id ? Number(form.proveedor_id) : null)
    if (!pid) return null
    const r = await api.checkDuplicado({
      proveedor_id: pid,
      descripcion: form.descripcion.trim(),
      exclude_insumo_id: editId || undefined,
    })
    return r.hay_duplicado ? r.duplicados[0] : null
  }

  const buildFormData = (forceUpdateId) => {
    const pares = form.cotizaciones_detalle || []
    const gan = pickGanadora(pares)
    const costo = gan?.valor != null && gan.valor !== '' ? gan.valor : form.costo_base
    const fd = new FormData()
    fd.append('codigo', (form.codigo || '').trim())
    fd.append('descripcion', form.descripcion.trim())
    fd.append('unidad', form.unidad || 'UND')
    fd.append('costo_base', String(costo))
    if (form.rendimiento !== '') fd.append('rendimiento', String(form.rendimiento))
    fd.append('tributos', JSON.stringify(tributosPayloadDesdeForm(form.impuesto || EMPTY_IMPUESTO)))
    const ganPar = pares.find((p) => p.es_ganadora) || pares[0]
    if (ganPar?.proveedor_id) fd.append('proveedor_id', String(ganPar.proveedor_id))
    else if (form.proveedor_id) fd.append('proveedor_id', String(form.proveedor_id))
    else if (ganPar?.insumo?.proveedor || form.razon_social) {
      fd.append('razon_social', (ganPar?.insumo?.proveedor || form.razon_social || '').trim())
      const nit = (ganPar?.nit || form.nit || '').trim()
      if (nit) fd.append('nit', nit)
    }
    const email = (ganPar?.contacto_email || form.contacto_email || '').trim()
    const cnom = (ganPar?.contacto_nombre || form.contacto_nombre || '').trim()
    const ctel = (ganPar?.contacto_telefono || form.contacto_telefono || '').trim()
    if (email) fd.append('contacto_email', email)
    if (cnom) fd.append('contacto_nombre', cnom)
    if (ctel) fd.append('contacto_telefono', ctel)
    const legacy = syncLegacyFromGanadora(pares)
    if (legacy.cotizacion_numero) fd.append('cotizacion_numero', legacy.cotizacion_numero)
    if (legacy.cotizacion_fecha) fd.append('cotizacion_fecha', legacy.cotizacion_fecha)
    if (legacy.cotizacion_vigencia) fd.append('cotizacion_vigencia', legacy.cotizacion_vigencia)
    fd.append('cotizaciones_detalle', JSON.stringify(cotizacionesPayloadForSave(pares)))
    fd.append('requiere_cotizacion', form.requiere_cotizacion ? 'true' : 'false')
    if (form.cantidad_negociada !== '') fd.append('cantidad_negociada', String(form.cantidad_negociada))
    if (forceUpdateId) fd.append('force_update_id', String(forceUpdateId))
    const { ganadora, soportes } = collectPdfFilesFromPares(pares)
    if (ganadora) fd.append('cotizacion_ganadora_pdf', ganadora)
    soportes.forEach((f) => fd.append('cotizaciones_soporte', f))
    return fd
  }

  const save = async (forceUpdateId = null) => {
    if (!api) return
    const { faltantes, ruleErrors } = validateGuardarInsumo(form, {
      minCotizaciones: form.requiere_cotizacion === false ? 0 : cotMinimas,
      editId,
    })
    setModalFaltantes(faltantes)
    setModalRuleErrors(ruleErrors)
    if (faltantes.length || ruleErrors.length) {
      return
    }
    setBusy(true)
    try {
      if (!forceUpdateId && !editId) {
        const dup = await checkDupBeforeSave()
        if (dup) {
          setDupAlert(dup)
          setBusy(false)
          return
        }
      }
      const fd = buildFormData(forceUpdateId)
      if (editId && !forceUpdateId) {
        await api.updateInsumoForm(editId, fd)
      } else {
        await api.createInsumoForm(fd)
      }
      setMsg({ type: 'success', text: forceUpdateId ? 'Precio actualizado (historial conservado).' : 'Insumo guardado.' })
      closeModal()
      setDupAlert(null)
      load()
      loadProveedores()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const onCsvSelect = (e, kind = 'insumos') => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCsvModo('agregar')
    setCsvPending({ file, kind })
  }

  const confirmCsvImport = async () => {
    if (!csvPending?.file || !api) return
    const kind = csvPending.kind || 'insumos'
    if (csvModo === 'reemplazar') {
      const ok = window.confirm(
        kind === 'proveedores'
          ? '¿Reemplazar el directorio de proveedores? Se desactivarán los proveedores sin insumos activos y se cargarán los del CSV.'
          : '¿Reemplazar todo el catálogo? Los insumos actuales se desactivarán y solo quedarán los del CSV.',
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      const r = kind === 'proveedores'
        ? await api.importCsvProveedores(csvPending.file, csvModo)
        : await api.importCsv(csvPending.file, csvModo)
      setMsg({
        type: 'success',
        text: `Importación ${kind === 'proveedores' ? 'de proveedores' : 'de insumos'} (${csvModo}): ${r.creados} creados, ${r.actualizados} actualizados`
          + (r.desactivados ? `, ${r.desactivados} desactivados` : '')
          + (r.errores?.length ? `, ${r.errores.length} errores` : ''),
      })
      setCsvPending(null)
      if (kind === 'proveedores') {
        loadProveedores()
        setMainTab('proveedores')
      } else {
        load()
        loadProveedores()
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const showHistorial = async (row) => {
    if (!api) return
    try {
      const h = await api.getHistorial(row.insumo_id || row.id)
      setHistorial({ row, items: h })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  const confirmDeleteInsumo = async () => {
    if (!api || !deleteConfirm) return
    setBusy(true)
    try {
      await api.deleteInsumo(deleteConfirm.insumo_id || deleteConfirm.id)
      setMsg({ type: 'success', text: `Insumo «${deleteConfirm.codigo}» eliminado del catálogo.` })
      setDeleteConfirm(null)
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const confirmDeleteProveedor = async () => {
    if (!api || !deleteProvConfirm) return
    setBusy(true)
    try {
      await api.deleteProveedor(deleteProvConfirm.id)
      setMsg({ type: 'success', text: `Proveedor «${deleteProvConfirm.razon_social}» eliminado del directorio.` })
      setDeleteProvConfirm(null)
      loadProveedores()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (!canVer) {
    return <div style={{ padding: 24, color: t.textMuted }}>Sin permiso para ver el catálogo de insumos.</div>
  }

  return (
    <div
      className={compactCatalog ? 'cc-catalogo-insumos-root cc-catalogo-insumos-root--compact' : 'cc-catalogo-insumos-root'}
      style={{
        padding: compactCatalog ? '12px 8px' : embedded ? '0' : '12px 8px',
        color: t.text,
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--cc-lg)', color: t.primary }}>Catálogo de insumos</h2>
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 4 }}>
            {embedded
              ? 'Accesible desde Almacén. Las solicitudes solo pueden seleccionar insumos existentes.'
              : 'Gestión centralizada del catálogo. Las solicitudes de almacén solo pueden seleccionar insumos existentes.'}
          </div>
        </div>
        <div
          className="cc-catalogo-toolbar"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}
        >
          <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => onCsvSelect(e, 'insumos')} />
          <input ref={csvProvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => onCsvSelect(e, 'proveedores')} />
          <ToolbarBtn
            label={mainTab === 'proveedores' ? 'Actualizar' : 'Actualizar insumos'}
            title={mainTab === 'proveedores' ? 'Actualizar proveedores' : 'Actualizar insumos'}
            disabled={busy || isRefreshing}
            t={t}
            iconColor={t.primary || TOOLBAR_ICON_COLORS.refresh}
            onClick={refreshActiveTab}
          >
            <IconCatalogRefresh />
          </ToolbarBtn>
          {canCrear && (
            <>
              <ToolbarBtn
                label="Crear insumo"
                title="Nuevo insumo"
                t={t}
                variant="primary"
                iconColor={TOOLBAR_ICON_COLORS.create}
                disabled={busy}
                onClick={() => {
                  setMainTab('insumos')
                  openNew()
                }}
              >
                <IconNewInsumo />
              </ToolbarBtn>
              <ToolbarBtn
                label="Plantilla insumos"
                title="Descargar plantilla CSV de insumos"
                disabled={busy}
                t={t}
                iconColor={TOOLBAR_ICON_COLORS.plantillaInsumos}
                onClick={() => api?.downloadPlantillaCsv().catch((e) => setMsg({ type: 'error', text: e.message }))}
              >
                <IconTemplateDownload />
              </ToolbarBtn>
              <ToolbarBtn
                label="Cargar CSV"
                title="Importar insumos desde CSV"
                disabled={busy}
                t={t}
                iconColor={TOOLBAR_ICON_COLORS.cargarInsumos}
                onClick={() => csvRef.current?.click()}
              >
                <IconCsvImport />
              </ToolbarBtn>
              <ToolbarBtn
                label="Plantilla proveedores"
                title="Descargar plantilla CSV de proveedores"
                disabled={busy}
                t={t}
                iconColor={TOOLBAR_ICON_COLORS.plantillaProveedores}
                onClick={() => api?.downloadPlantillaProveedoresCsv().catch((e) => setMsg({ type: 'error', text: e.message }))}
              >
                <IconProveedoresTemplate />
              </ToolbarBtn>
              <ToolbarBtn
                label="Cargar proveedores"
                title="Importar proveedores desde CSV"
                disabled={busy}
                t={t}
                iconColor={TOOLBAR_ICON_COLORS.cargarProveedores}
                onClick={() => csvProvRef.current?.click()}
              >
                <IconProveedoresImport />
              </ToolbarBtn>
            </>
          )}
        </div>
      </div>

      {msg && (
        <div style={{
          marginBottom: 10,
          padding: '8px 12px',
          borderRadius: 8,
          background: msg.type === 'error' ? ui.errorBg : ui.successBg,
          color: msg.type === 'error' ? ui.errorText : ui.successText,
          fontSize: 'var(--cc-sm)',
          whiteSpace: 'pre-wrap',
        }}
        >
          {msg.text}
        </div>
      )}

      <ModalTabs tabs={MAIN_CATALOG_TABS} active={mainTab} onChange={setMainTab} ui={ui} />

      {mainTab === 'insumos' && (
      <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          style={{ ...inputStyle, flex: 1, maxWidth: 420 }}
          placeholder="Buscar por código o descripción…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span style={{ fontSize: 'var(--cc-xs)', alignSelf: 'center', color: t.textMuted, fontWeight: 600 }}>{total} insumo(s)</span>
      </div>

      <div style={sheetWrap} className="cc-almacen-table-scroll cc-catalogo-insumos-sheet">
        <table style={{ ...sheetTable, minWidth: 1180 }}>
          <thead>
            <tr>
              <th style={thHeader}>Proveedor</th>
              <th style={{ ...thHeader, width: 110 }}>Código</th>
              <th style={thHeader}>Descripción</th>
              <th style={{ ...thHeader, width: 56 }}>Und</th>
              <th style={{ ...thHeader, textAlign: 'right', width: 64 }}>Rend.</th>
              <th style={{ ...thHeader, textAlign: 'right', width: 110 }}>Antes AIU/IVA</th>
              <th style={thHeader}>Tributos</th>
              <th style={{ ...thHeader, textAlign: 'right', width: 110 }}>Después AIU/IVA</th>
              <th style={{ ...thHeader, width: 90 }}>Cot. Nº</th>
              <th style={{ ...thHeader, width: 92 }}>Cot. fecha</th>
              <th style={{ ...thHeader, textAlign: 'right', width: 100 }}>Cot. valor</th>
              <th style={{ ...thHeader, width: 108 }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={td}>Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={12} style={{ ...td, color: t.textMuted }}>Sin insumos en el catálogo.</td></tr>
            ) : rows.map((r, idx) => {
              const rid = r.insumo_id || r.id
              const gan = ganadoraDesdeInsumoRow(r)
              const expanded = expandedId === rid
              const zebra = sheetZebra(ui, idx)
              const otras = otrasCotizaciones(detalleVisibleDesdeInsumoRow(r), gan?.id)
              return (
                <Fragment key={rid}>
                  <tr
                    onClick={() => setExpandedId(expanded ? null : rid)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = ui.cardSubtle || `${t.primary}14` }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = zebra }}
                    style={{ background: expanded ? ui.cardSubtle : zebra, cursor: 'pointer' }}
                    title="Clic para ver otras cotizaciones"
                  >
                    <td style={tdMuted}>{r.proveedor_nombre || '—'}</td>
                    <td style={tdCodigo}>{r.codigo}</td>
                    <td style={tdDesc}>{r.descripcion}</td>
                    <td style={{ ...tdMuted, whiteSpace: 'nowrap' }}>{r.unidad}</td>
                    <td style={tdNum}>{r.rendimiento ?? '—'}</td>
                    <td style={tdMoney}>{fmtMoney(r.costo)}</td>
                    <td style={tdMuted}>{r.impuesto_etiqueta || '—'}</td>
                    <td style={tdTotal}>{fmtMoney(r.costo_total)}</td>
                    <td style={tdMuted}>{gan?.numero || r.cotizacion_numero || '—'}</td>
                    <td style={tdMuted}>{gan?.fecha || r.cotizacion_fecha || '—'}</td>
                    <td style={tdNum}>{gan?.valor != null && gan.valor !== '' ? fmtMoney(gan.valor) : '—'}</td>
                    <td style={td} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <IconActionBtn title="Historial de precios" t={t} onClick={() => showHistorial(r)}>
                          <IconHistory />
                        </IconActionBtn>
                        {canEditar && (
                          <IconActionBtn title="Editar insumo" t={t} onClick={() => openEdit(r)}>
                            <IconEditRow />
                          </IconActionBtn>
                        )}
                        {canEliminar && (
                          <IconActionBtn
                            title="Eliminar insumo"
                            t={t}
                            variant="danger"
                            disabled={busy}
                            onClick={() => setDeleteConfirm(r)}
                          >
                            <IconDeleteRow />
                          </IconActionBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={12} style={{ ...td, background: ui.cardSubtle, padding: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 'var(--cc-caption)', color: t.primary, marginBottom: 6 }}>
                          Otras cotizaciones — comparación Insumo | No Previsto
                        </div>
                        {otras.length === 0 ? (
                          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                            No hay cotizaciones adicionales registradas. La ganadora se muestra en la fila.
                          </div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-xs)' }}>
                            <thead>
                              <tr>
                                <th style={thHeader}>Sección</th>
                                <th style={thHeader}>Proveedor</th>
                                <th style={thHeader}>Nº</th>
                                <th style={thHeader}>Fecha</th>
                                <th style={thHeader}>Vigencia</th>
                                <th style={{ ...thHeader, textAlign: 'right' }}>Valor</th>
                                <th style={thHeader}>PDF</th>
                              </tr>
                            </thead>
                            <tbody>
                              {otras.map((c, j) => (
                                <tr key={c.id || j} style={{ background: sheetZebra(ui, j) }}>
                                  <td style={tdMuted}>{c.tipo === 'no_previsto' ? 'No Previsto' : 'Insumo'}</td>
                                  <td style={td}>{c.proveedor || '—'}</td>
                                  <td style={tdMuted}>{c.numero || '—'}</td>
                                  <td style={tdMuted}>{c.fecha || '—'}</td>
                                  <td style={tdMuted}>{c.vigencia || '—'}</td>
                                  <td style={tdNum}>{c.valor != null && c.valor !== '' ? fmtMoney(c.valor) : '—'}</td>
                                  <td style={tdMuted}>{c.pdf_nombre || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      </>
      )}

      {mainTab === 'proveedores' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              style={{ ...inputStyle, flex: 1, maxWidth: 420 }}
              placeholder="Buscar proveedor por razón social o NIT…"
              value={provQ}
              onChange={(e) => setProvQ(e.target.value)}
            />
            <span style={{ fontSize: 'var(--cc-xs)', alignSelf: 'center', color: t.textMuted, fontWeight: 600 }}>
              {provTotal} proveedor(es)
            </span>
          </div>
          <div style={{ ...sheetWrap, minWidth: 0, width: '100%' }} className="cc-almacen-table-scroll cc-catalogo-proveedores-sheet">
            <table style={{ ...sheetTable, minWidth: 720, width: '100%', tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={thHeader}>Razón social</th>
                  <th style={{ ...thHeader, width: 110 }}>NIT</th>
                  <th style={thHeader}>Contacto</th>
                  <th style={thHeader}>Correo</th>
                  <th style={{ ...thHeader, width: 110 }}>Teléfono</th>
                  <th style={{ ...thHeader, textAlign: 'right', width: 80 }}>Insumos</th>
                  <th style={{ ...thHeader, width: 52 }} />
                </tr>
              </thead>
              <tbody>
                {provLoading ? (
                  <tr><td colSpan={7} style={td}>Cargando…</td></tr>
                ) : proveedores.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...td, color: t.textMuted }}>Sin proveedores registrados.</td></tr>
                ) : proveedores.map((p, idx) => (
                  <tr key={p.id} style={{ background: sheetZebra(ui, idx) }}>
                    <td style={tdDesc}>{p.razon_social}</td>
                    <td style={tdCodigo}>{p.nit}</td>
                    <td style={tdMuted}>{p.contacto_nombre || '—'}</td>
                    <td style={tdMuted}>{p.contacto_email || '—'}</td>
                    <td style={tdMuted}>{p.contacto_telefono || '—'}</td>
                    <td style={tdNum}>{p.insumos_activos ?? 0}</td>
                    <td style={td}>
                      {canEliminar && (
                        <IconActionBtn
                          title={
                            (p.insumos_activos ?? 0) > 0
                              ? 'No se puede eliminar: tiene insumos activos'
                              : 'Eliminar proveedor'
                          }
                          t={t}
                          variant="danger"
                          disabled={busy || (p.insumos_activos ?? 0) > 0}
                          onClick={() => setDeleteProvConfirm(p)}
                        >
                          <IconDeleteRow />
                        </IconActionBtn>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 8 }}>
            Los proveedores se agregan al crear insumos, al importar CSV de insumos o con «Cargar proveedores».
            No se duplican por NIT.
            {canEliminar && ' Solo puede eliminar proveedores sin insumos activos asociados.'}
          </div>
        </div>
      )}

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0' }}>
          <div style={{ width: 'min(1540px, 98vw)', maxHeight: '94vh', overflow: 'auto', ...modalPanelStyle, padding: '18px 22px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 12, color: t.text }}>{editId ? 'Editar insumo' : 'Nuevo insumo'}</h3>

            {dupAlert && (
              <div style={{ background: ui.warnBg, color: ui.warnText, padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 'var(--cc-sm)' }}>
                <strong>Probable cambio de precio:</strong> ya existe «{dupAlert.descripcion}» ({dupAlert.codigo}) con {fmtMoney(dupAlert.costo_total)}.
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <IconActionBtn
                    title="Actualizar precio (conservar historial)"
                    disabled={busy}
                    t={t}
                    variant="primary"
                    onClick={() => save(dupAlert.insumo_id)}
                  >
                    <IconPriceRefresh />
                  </IconActionBtn>
                  <button type="button" style={btnSecondary} onClick={() => setDupAlert(null)}>Corregir datos</button>
                </div>
              </div>
            )}

            {(modalFaltantes.length > 0 || modalRuleErrors.length > 0) && (
              <div style={{
                color: ui.errorText || '#991b1b',
                background: ui.errorBg || '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 12,
                fontSize: 'var(--cc-sm)',
                whiteSpace: 'pre-wrap',
              }}
              >
                {modalFaltantes.length > 0 && (
                  <>
                    <strong>Complete los siguientes campos antes de continuar:</strong>
                    {'\n'}{modalFaltantes.map((f) => `• ${f}`).join('\n')}
                  </>
                )}
                {modalRuleErrors.length > 0 && (
                  <>
                    {modalFaltantes.length > 0 ? '\n\n' : null}
                    <strong>Inconsistencia de cotización ganadora:</strong>
                    {'\n'}{modalRuleErrors.map((f) => `• ${f}`).join('\n')}
                  </>
                )}
              </div>
            )}

            <SheetSectionTitle t={t} ui={ui}>1. Proveedor</SheetSectionTitle>
            <Field label="Buscar en directorio de proveedores" hint="Autocompleta razón social, NIT y contacto. Los proveedores no se duplican por NIT.">
              <div style={{ position: 'relative', zIndex: 5, overflow: 'visible' }}>
                <CatalogoProveedorAutocomplete
                  api={api}
                  t={t}
                  inputStyle={inputStyle}
                  disabled={busy}
                  value={{
                    proveedor_id: form.proveedor_id,
                    razon_social: form.razon_social,
                    nit: form.nit,
                    contacto_email: form.contacto_email,
                    contacto_nombre: form.contacto_nombre,
                    contacto_telefono: form.contacto_telefono,
                  }}
                  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                />
              </div>
            </Field>
            <div style={{ ...sheetWrap, marginBottom: 8, overflow: 'visible' }}>
              <table style={{ ...sheetTable, minWidth: 0, tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th style={thHeader}>Razón social</th>
                    <th style={{ ...thHeader, width: '14%' }}>NIT</th>
                    <th style={thHeader}>Correo</th>
                    <th style={thHeader}>Contacto</th>
                    <th style={{ ...thHeader, width: '14%' }}>Teléfono</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: sheetZebra(ui, 0) }}>
                    <td style={td}>
                      <input style={cellInp} value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value, proveedor_id: '' })} />
                    </td>
                    <td style={td}>
                      <input style={cellInp} value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value, proveedor_id: '' })} />
                    </td>
                    <td style={td}>
                      <input style={cellInp} type="email" value={form.contacto_email} onChange={(e) => setForm({ ...form, contacto_email: e.target.value })} />
                    </td>
                    <td style={td}>
                      <input style={cellInp} value={form.contacto_nombre} onChange={(e) => setForm({ ...form, contacto_nombre: e.target.value })} />
                    </td>
                    <td style={td}>
                      <input style={cellInp} type="tel" value={form.contacto_telefono} onChange={(e) => setForm({ ...form, contacto_telefono: e.target.value })} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <SheetSectionTitle t={t} ui={ui}>2. Insumo (captura de cotización)</SheetSectionTitle>
            {((form.cotizaciones_detalle || []).length > 0) && (
              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 8 }}>
                Descripción, unidad y rendimiento quedan fijos según la primera cotización enviada. Cambie de proveedor y valores, luego pulse <strong>Enviar</strong>.
              </div>
            )}
            <div style={{ ...sheetWrap, marginBottom: 8, overflowX: 'auto' }}>
              <table style={{ ...sheetTable, minWidth: 520, tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ ...thHeader, width: '18%' }}>Código</th>
                    <th style={{ ...thHeader, width: '22%' }}>Unidad *</th>
                    <th style={{ ...thHeader, width: '14%' }}>Rend.</th>
                    <th style={thHeader}>Descripción *</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: sheetZebra(ui, 0) }}>
                    <td style={{ ...td, overflow: 'hidden' }}>
                      <input
                        style={{ ...cellInp, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis' }}
                        value={form.codigo || (editId ? '—' : 'Generando…')}
                        title={form.codigo || ''}
                        readOnly
                        disabled
                      />
                    </td>
                    <td style={{ ...td, overflow: 'hidden', minWidth: 0 }}>
                      {(form.cotizaciones_detalle || []).length > 0 ? (
                        <input style={{ ...cellInp, opacity: 0.85 }} value={form.unidad} readOnly />
                      ) : (
                        <UnidadSelector
                          value={form.unidad}
                          onChange={(v) => setForm({ ...form, unidad: v })}
                          selectStyle={cellInp}
                          inputStyle={cellInp}
                          btnPrimary={btnPrimary}
                          btnSecondary={btnSecondary}
                          modoCustom={unidadModoCustom}
                          setModoCustom={setUnidadModoCustom}
                          uCustom={unidadCustom}
                          setUCustom={setUnidadCustom}
                        />
                      )}
                    </td>
                    <td style={{ ...td, overflow: 'hidden' }}>
                      <input
                        style={cellInp}
                        value={form.rendimiento}
                        readOnly={(form.cotizaciones_detalle || []).length > 0}
                        onChange={(e) => setForm({ ...form, rendimiento: e.target.value })}
                      />
                    </td>
                    <td style={{ ...td, overflow: 'hidden', minWidth: 0 }}>
                      <input
                        style={cellInp}
                        value={form.descripcion}
                        readOnly={(form.cotizaciones_detalle || []).length > 0}
                        onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
              gap: 8,
              marginBottom: 8,
            }}
            >
              <div style={{
                ...sheetWrap,
                marginBottom: 0,
                overflow: 'hidden',
                borderColor: ui.dark ? 'rgba(0,180,198,0.45)' : ui.rest ? 'rgba(14,116,144,0.35)' : 'rgba(0,119,182,0.35)',
                background: ui.dark ? 'rgba(0,180,198,0.08)' : ui.rest ? 'rgba(14,116,144,0.06)' : 'rgba(0,119,182,0.04)',
              }}
              >
                <div style={{
                  fontWeight: 800,
                  fontSize: 'var(--cc-caption)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: t.primary,
                  padding: '4px 8px 2px',
                }}
                >
                  Costos — Insumo
                </div>
                <table style={{ ...sheetTable, minWidth: 0, width: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '22%' }} />
                  </colgroup>
                  <tbody>
                    <tr style={{ background: sheetZebra(ui, 0) }}>
                      <td style={costTh}>Valor *</td>
                      <td style={costTd}>
                        <input style={costCellInp} type="number" min="0" step="0.01" value={form.costo_base} onChange={(e) => updateCapture({ costo_base: e.target.value })} />
                      </td>
                      <td style={costTh} title="Con AIU/IVA">Con AIU/IVA</td>
                      <td style={costTd}>
                        <input style={{ ...costCellInp, fontWeight: 700 }} readOnly value={fmtMoney(totalPreview)} />
                      </td>
                    </tr>
                    <tr style={{ background: sheetZebra(ui, 1) }}>
                      <td style={costTh}>Fecha</td>
                      <td style={costTd}>
                        <input style={costCellInp} type="date" value={form.cotizacion_fecha} onChange={(e) => updateCapture({ cotizacion_fecha: e.target.value })} />
                      </td>
                      <td style={costTh}>Vigencia</td>
                      <td style={costTd}>
                        <input style={costCellInp} value={form.cotizacion_vigencia} placeholder="Ej. 15 días" onChange={(e) => updateCapture({ cotizacion_vigencia: e.target.value })} />
                      </td>
                    </tr>
                    <tr style={{ background: sheetZebra(ui, 0) }}>
                      <td style={costTh}>Impuesto</td>
                      <td style={costTd} colSpan={3}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            type="button"
                            title="A · Í · U · IVA"
                            onClick={() => {
                              setImpuestoModalTarget('insumo')
                              setDraftImpuesto({ ...(form.impuesto || EMPTY_IMPUESTO) })
                              setModalImpuestoOpen(true)
                            }}
                            style={{
                              ...costBtnCompact,
                              borderColor: impuestoTieneDatos(form.impuesto) ? t.primary : t.border,
                              color: impuestoTieneDatos(form.impuesto) ? t.primary : t.text,
                              fontWeight: 700,
                            }}
                          >
                            A · Í · U · IVA{impuestoTieneDatos(form.impuesto) ? ' ✓' : ''}
                          </button>
                          <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, overflowWrap: 'anywhere' }}>
                            {tributosResumen === '—'
                              ? ((form.cotizaciones_detalle || []).find((p) => p.id === selectedParId)?.insumo?.impuesto_etiqueta || 'Sin impuesto.')
                              : tributosResumen}
                          </span>
                        </div>
                      </td>
                    </tr>
                    <tr style={{ background: sheetZebra(ui, 1) }}>
                      <td style={costTh} title="Cantidad negociada">Cant. neg.</td>
                      <td style={costTd}>
                        <input style={costCellInp} type="number" min="0" step="any" value={form.cantidad_negociada} onChange={(e) => updateCapture({ cantidad_negociada: e.target.value })} />
                      </td>
                      <td style={costTh} title="Valor negociado">Vlr. negociado</td>
                      <td style={costTd}>
                        <div style={{ ...costCellInp, fontWeight: valorNegociadoPreview != null ? 600 : 400, color: valorNegociadoPreview != null ? t.text : t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {valorNegociadoPreview != null ? fmtMoney(valorNegociadoPreview) : '—'}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{
                ...sheetWrap,
                marginBottom: 0,
                overflow: 'hidden',
                borderColor: ui.dark ? 'rgba(245,158,11,0.45)' : ui.rest ? 'rgba(180,120,40,0.35)' : 'rgba(217,119,6,0.35)',
                background: ui.dark ? 'rgba(245,158,11,0.10)' : ui.rest ? 'rgba(180,120,40,0.08)' : 'rgba(217,119,6,0.05)',
              }}
              >
                <div style={{
                  fontWeight: 800,
                  fontSize: 'var(--cc-caption)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: t.primary,
                  padding: '4px 8px 2px',
                }}
                >
                  Costos — No Previsto
                </div>
                <table style={{ ...sheetTable, minWidth: 0, width: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '22%' }} />
                  </colgroup>
                  <tbody>
                    <tr style={{ background: sheetZebra(ui, 0) }}>
                      <td style={costTh}>Valor</td>
                      <td style={costTd}>
                        <input style={costCellInp} type="number" min="0" step="0.01" value={form.valor_no_previsto} placeholder="Igual al insumo si vacío" onChange={(e) => updateCapture({ valor_no_previsto: e.target.value })} />
                      </td>
                      <td style={costTh} title="Con AIU/IVA">Con AIU/IVA</td>
                      <td style={costTd}>
                        <input style={{ ...costCellInp, fontWeight: 700 }} readOnly value={fmtMoney(totalPreviewNp)} />
                      </td>
                    </tr>
                    <tr style={{ background: sheetZebra(ui, 1) }}>
                      <td style={costTh}>Fecha</td>
                      <td style={costTd}>
                        <input style={costCellInp} type="date" value={form.cotizacion_fecha_np} onChange={(e) => updateCapture({ cotizacion_fecha_np: e.target.value })} />
                      </td>
                      <td style={costTh}>Vigencia</td>
                      <td style={costTd}>
                        <input style={costCellInp} value={form.cotizacion_vigencia_np} placeholder="Ej. 15 días" onChange={(e) => updateCapture({ cotizacion_vigencia_np: e.target.value })} />
                      </td>
                    </tr>
                    <tr style={{ background: sheetZebra(ui, 0) }}>
                      <td style={costTh}>Impuesto</td>
                      <td style={costTd} colSpan={3}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            type="button"
                            title="A · Í · U · IVA (No Previsto)"
                            onClick={() => {
                              setImpuestoModalTarget('np')
                              setDraftImpuesto({ ...(form.impuesto_np || EMPTY_IMPUESTO) })
                              setModalImpuestoOpen(true)
                            }}
                            style={{
                              ...costBtnCompact,
                              borderColor: impuestoTieneDatos(form.impuesto_np) ? t.primary : t.border,
                              color: impuestoTieneDatos(form.impuesto_np) ? t.primary : t.text,
                              fontWeight: 700,
                            }}
                          >
                            A · Í · U · IVA{impuestoTieneDatos(form.impuesto_np) ? ' ✓' : ''}
                          </button>
                          <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, overflowWrap: 'anywhere' }}>
                            {tributosResumenNp === '—'
                              ? ((form.cotizaciones_detalle || []).find((p) => p.id === selectedParId)?.no_previsto?.impuesto_etiqueta || 'Sin impuesto.')
                              : tributosResumenNp}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {consumoNegociado?.tiene_negociado && (
              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 8 }}>
                Consumido en solicitudes: <strong style={{ color: consumoNegociado.supera_negociado ? ui.errorText : t.text }}>{consumoNegociado.cantidad_consumida_acumulada}</strong>
                {' '}{consumoNegociado.unidad} de {consumoNegociado.cantidad_negociada} negociados
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <button type="button" style={btnPrimary} disabled={busy} onClick={enviarCotizacionFila}>
                Enviar cotización a la tabla
              </button>
              <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                {selectedParId
                  ? `Editando ${(form.cotizaciones_detalle || []).find((p) => p.id === selectedParId)?.insumo?.numero || 'fila'} — los cambios en los paneles se reflejan en la fila. Pulse de nuevo la fila para deseleccionar.`
                  : `Agrega una fila comparativa (Insumo | No Previsto). El Nº se genera automáticamente. Luego adjunte el PDF en la fila.${(form.requiere_cotizacion !== false) ? ` Mínimo ${cotMinimas} cotización(es).` : ''}`}
              </span>
            </div>

            <SheetSectionTitle t={t} ui={ui}>3. Tabla comparativa de cotizaciones</SheetSectionTitle>
            <Field label="¿Requiere cotización?">
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--cc-sm)' }}>
                <input
                  type="checkbox"
                  checked={!!form.requiere_cotizacion}
                  onChange={(e) => setForm({ ...form, requiere_cotizacion: e.target.checked })}
                />
                <span>{form.requiere_cotizacion ? 'Sí, exige cotizaciones y PDF' : 'No requiere cotizaciones'}</span>
              </label>
            </Field>

            {form.requiere_cotizacion ? (
              <>
                <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 6 }}>
                  Descripción, unidad y rendimiento son comunes a la fila. Cada grupo conserva solo sus columnas de costo.
                  Pulse una fila para cargarla en los paneles de costos. La ganadora es la de menor costo de insumo. Arrastre el PDF o use el clip.
                </div>
                <div style={{ ...sheetWrap, marginBottom: 8, overflowX: 'auto' }}>
                  <table style={{ ...sheetTable, minWidth: 1100, tableLayout: 'auto' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thHeader, width: 64 }} rowSpan={2}>Ganadora</th>
                        <th style={thHeader} rowSpan={2}>Descripción</th>
                        <th style={{ ...thHeader, width: 56 }} rowSpan={2}>Und</th>
                        <th style={{ ...thHeader, width: 64 }} rowSpan={2}>Rend.</th>
                        <th
                          style={{
                            ...thHeader,
                            textAlign: 'center',
                            background: ui.dark ? 'rgba(0,180,198,0.28)' : ui.rest ? 'rgba(14,116,144,0.18)' : 'rgba(0,119,182,0.16)',
                          }}
                          colSpan={5}
                        >
                          Cotización insumo
                        </th>
                        <th
                          style={{
                            ...thHeader,
                            textAlign: 'center',
                            background: ui.dark ? 'rgba(245,158,11,0.22)' : ui.rest ? 'rgba(180,120,40,0.16)' : 'rgba(217,119,6,0.14)',
                          }}
                          colSpan={5}
                        >
                          Cotización No Previsto
                        </th>
                      </tr>
                      <tr>
                        <th style={{ ...thHeader, width: 92 }}>Costo</th>
                        <th style={{ ...thHeader, width: 100 }}>IVA / AIU</th>
                        <th style={{ ...thHeader, width: 80 }}>Nº</th>
                        <th style={{ ...thHeader, width: 100 }}>Fecha</th>
                        <th style={{ ...thHeader, width: 100 }}>PDF</th>
                        <th style={{ ...thHeader, width: 92 }}>Costo</th>
                        <th style={{ ...thHeader, width: 100 }}>IVA / AIU</th>
                        <th style={{ ...thHeader, width: 80 }}>Nº</th>
                        <th style={{ ...thHeader, width: 100 }}>Fecha</th>
                        <th style={{ ...thHeader, width: 100 }}>PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(form.cotizaciones_detalle || []).length === 0 ? (
                        <tr>
                          <td colSpan={14} style={{ ...td, color: t.textMuted }}>
                            Sin cotizaciones enviadas. Complete proveedor e insumo y pulse «Enviar cotización a la tabla».
                          </td>
                        </tr>
                      ) : (form.cotizaciones_detalle || []).map((par, idx) => {
                        const win = !!par.es_ganadora
                        const selected = selectedParId === par.id
                        const coh = par.coherencia || {
                          descripcion: form.descripcion,
                          unidad: form.unidad,
                          rendimiento: form.rendimiento,
                        }
                        const insTint = ui.dark ? 'rgba(0,180,198,0.08)' : ui.rest ? 'rgba(14,116,144,0.06)' : 'rgba(0,119,182,0.05)'
                        const npTint = ui.dark ? 'rgba(245,158,11,0.10)' : ui.rest ? 'rgba(180,120,40,0.08)' : 'rgba(217,119,6,0.06)'
                        const rowBg = selected
                          ? (ui.dark ? 'rgba(0,180,198,0.22)' : 'rgba(0,119,182,0.14)')
                          : win
                            ? (ui.dark ? 'rgba(34,197,94,0.16)' : 'rgba(34,197,94,0.10)')
                            : sheetZebra(ui, idx)
                        const tdIns = { ...td, background: (win || selected) ? undefined : insTint }
                        const tdNp = { ...td, background: (win || selected) ? undefined : npTint }
                        const tdShared = {
                          ...td,
                          background: (win || selected) ? undefined : (ui.dark ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.08)'),
                        }
                        return (
                          <tr
                            key={par.id}
                            style={{
                              background: rowBg,
                              outline: selected
                                ? `2px solid ${t.primary}`
                                : win
                                  ? `2px solid ${ui.successText || '#047857'}`
                                  : undefined,
                              cursor: 'pointer',
                            }}
                            onClick={() => selectCotizacionPar(par)}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                            onDrop={(e) => onRowDropPdf(par.id, 'insumo', e)}
                            title="Pulse para cargar costos en los paneles. Arrastre un PDF sobre la fila o la celda PDF de No Previsto."
                          >
                            <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: selected ? t.primary : (win ? (ui.successText || '#047857') : t.textMuted) }}>
                              {win ? '✓ Menor' : (selected ? '●' : '—')}
                            </td>
                            <td style={{ ...tdShared, fontSize: 'var(--cc-xs)' }} title={coh.descripcion}>{coh.descripcion || '—'}</td>
                            <td style={{ ...tdShared, whiteSpace: 'nowrap' }}>{coh.unidad || '—'}</td>
                            <td style={tdShared}>{coh.rendimiento !== '' && coh.rendimiento != null ? coh.rendimiento : '—'}</td>
                            <td style={tdIns} onClick={(e) => e.stopPropagation()}>
                              <input style={cellInp} type="number" min="0" step="0.01" value={par.insumo?.valor ?? ''} onChange={(e) => patchParLado(par.id, 'insumo', { valor: e.target.value })} />
                            </td>
                            <td style={tdIns} onClick={(e) => e.stopPropagation()}>
                              <input
                                style={cellInp}
                                value={par.insumo?.impuesto_etiqueta ?? ''}
                                placeholder="IVA / AIU"
                                onChange={(e) => patchParLado(par.id, 'insumo', { impuesto_etiqueta: e.target.value })}
                              />
                            </td>
                            <td style={{ ...tdIns, fontVariantNumeric: 'tabular-nums', color: t.textMuted }}>{par.insumo?.numero || '—'}</td>
                            <td style={tdIns} onClick={(e) => e.stopPropagation()}>
                              <input style={cellInp} type="date" value={par.insumo?.fecha || ''} onChange={(e) => patchParLado(par.id, 'insumo', { fecha: e.target.value })} />
                            </td>
                            <td style={tdIns} onClick={(e) => e.stopPropagation()} onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDrop={(e) => onRowDropPdf(par.id, 'insumo', e)}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <CotizacionClipBtn
                                  t={t}
                                  disabled={busy}
                                  file={par.insumo?.pdf}
                                  fileName={par.insumo?.pdf_nombre}
                                  pdfHistorial={par.insumo?.pdf_historial}
                                  onPick={(file) => assignPdfToLado(par.id, 'insumo', file)}
                                  onPreview={setPreviewAdjunto}
                                />
                                {win && par.insumo?.pdf && (
                                  <IconActionBtn title={ocrBusy ? 'OCR…' : 'OCR'} disabled={ocrBusy || busy} t={t} onClick={() => runOcr(par.id)}>
                                    <IconOcrScan />
                                  </IconActionBtn>
                                )}
                              </div>
                            </td>
                            <td style={{ ...tdNp, borderLeft: `2px solid ${t.border}` }} onClick={(e) => e.stopPropagation()}>
                              <input style={cellInp} type="number" min="0" step="0.01" value={par.no_previsto?.valor ?? ''} onChange={(e) => patchParLado(par.id, 'no_previsto', { valor: e.target.value })} />
                            </td>
                            <td style={{ ...tdNp, fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                              {par.no_previsto?.impuesto_etiqueta || '—'}
                            </td>
                            <td style={{ ...tdNp, fontVariantNumeric: 'tabular-nums', color: t.textMuted }}>{par.no_previsto?.numero || '—'}</td>
                            <td style={tdNp} onClick={(e) => e.stopPropagation()}>
                              <input style={cellInp} type="date" value={par.no_previsto?.fecha || ''} onChange={(e) => patchParLado(par.id, 'no_previsto', { fecha: e.target.value })} />
                            </td>
                            <td
                              style={tdNp}
                              onClick={(e) => e.stopPropagation()}
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                              onDrop={(e) => onRowDropPdf(par.id, 'no_previsto', e)}
                            >
                              <CotizacionClipBtn
                                t={t}
                                disabled={busy}
                                file={par.no_previsto?.pdf}
                                fileName={par.no_previsto?.pdf_nombre}
                                pdfHistorial={par.no_previsto?.pdf_historial}
                                onPick={(file) => assignPdfToLado(par.id, 'no_previsto', file)}
                                onPreview={setPreviewAdjunto}
                                dropHint="Arrastre el PDF de No Previsto aquí"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{
                padding: 12,
                border: `1px dashed ${ui.dashedBorder}`,
                fontSize: 'var(--cc-xs)',
                color: t.textMuted,
                marginBottom: 8,
              }}
              >
                Este insumo quedará disponible sin registrar cotizaciones.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
              <button type="button" style={btnSecondary} disabled={busy} onClick={requestCloseModal}>Cancelar</button>
              <button type="button" style={btnPrimary} disabled={busy || (!canCrear && !editId) || (editId && !canEditar)} onClick={() => save()}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewAdjunto && (
        <AttachmentPreviewModal
          file={previewAdjunto.file}
          fileName={previewAdjunto.fileName}
          onClose={() => setPreviewAdjunto(null)}
          ui={ui}
          t={t}
        />
      )}

      {csvPending && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10004, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => !busy && setCsvPending(null)}>
          <div style={{ width: 'min(440px,95vw)', ...modalPanelStyle, padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginTop: 0, color: t.text }}>
              {csvPending.kind === 'proveedores' ? 'Importar proveedores (CSV)' : 'Importar insumos (CSV)'}
            </h4>
            <p style={{ fontSize: 'var(--cc-sm)', opacity: 0.85, margin: '0 0 8px' }}>
              Archivo: <strong>{csvPending.file?.name}</strong>
            </p>
            <p style={{ fontSize: 'var(--cc-xs)', opacity: 0.75, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>
                {csvPending.kind === 'proveedores'
                  ? 'Columnas obligatorias: razon_social, nit. Opcionales: contacto_email, contacto_nombre, contacto_telefono.'
                  : 'Columnas obligatorias: codigo, descripcion, unidad, costo.'}
              </span>
              <IconActionBtn
                title={csvPending.kind === 'proveedores' ? 'Descargar plantilla de proveedores' : 'Descargar plantilla CSV'}
                t={t}
                onClick={() => {
                  const p = csvPending.kind === 'proveedores'
                    ? api?.downloadPlantillaProveedoresCsv()
                    : api?.downloadPlantillaCsv()
                  p?.catch(() => {})
                }}
              >
                <IconTemplateDownload />
              </IconActionBtn>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--cc-sm)', cursor: 'pointer' }}>
                <input type="radio" name="csvModo" checked={csvModo === 'agregar'} onChange={() => setCsvModo('agregar')} />
                <span>
                  <strong>Agregar</strong>
                  {csvPending.kind === 'proveedores'
                    ? ' — crea o actualiza proveedores por NIT sin borrar el directorio.'
                    : ' — suma los insumos del CSV al catálogo actual.'}
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--cc-sm)', cursor: 'pointer' }}>
                <input type="radio" name="csvModo" checked={csvModo === 'reemplazar'} onChange={() => setCsvModo('reemplazar')} />
                <span>
                  <strong>Reemplazar</strong>
                  {csvPending.kind === 'proveedores'
                    ? ' — desactiva proveedores sin insumos activos y carga el CSV.'
                    : ' — desactiva el catálogo actual y lo sustituye por el CSV.'}
                </span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={btnSecondary} disabled={busy} onClick={() => setCsvPending(null)}>Cancelar</button>
              <button type="button" style={btnPrimary} disabled={busy} onClick={confirmCsvImport}>
                {busy ? 'Importando…' : 'Confirmar importación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historial && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10003, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setHistorial(null)}>
          <div style={{ width: 'min(520px,95vw)', maxHeight: '80vh', overflow: 'auto', ...modalPanelStyle, padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginTop: 0, color: t.text }}>Historial de precios — {historial.row.codigo}</h4>
            {(historial.items || []).length === 0 ? (
              <p style={{ opacity: 0.7 }}>Sin cambios registrados aún.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-xs)' }}>
                <thead>
                  <tr>
                    <th style={th}>Fecha</th>
                    <th style={{ ...th, textAlign: 'right' }}>Antes AIU/IVA</th>
                    <th style={{ ...th, textAlign: 'right' }}>Después AIU/IVA</th>
                    <th style={th}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.items.map((h) => (
                    <tr key={h.id}>
                      <td style={td}>{h.created_at ? String(h.created_at).slice(0, 10) : '—'}</td>
                      <td style={tdMoney}>{fmtMoney(h.costo_base)}</td>
                      <td style={tdTotal}>{fmtMoney(h.valor_compra_referencia)}</td>
                      <td style={td}>{h.motivo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ textAlign: 'right', marginTop: 10 }}>
              <button type="button" style={btnSecondary} onClick={() => setHistorial(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {confirmDiscard && (
        <CcConfirmModal
          theme={ui.confirmTheme}
          tipo="warn"
          titulo="Descartar cambios"
          confirmar="Descartar"
          cancelar="Seguir editando"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => closeModal()}
        >
          Hay cambios sin guardar en el formulario del insumo. ¿Desea cerrar y perder la información diligenciada?
        </CcConfirmModal>
      )}

      {deleteProvConfirm && (
        <CcConfirmModal
          theme={ui.confirmTheme}
          tipo="danger"
          titulo="Eliminar proveedor"
          confirmar="Eliminar"
          cancelar="Cancelar"
          procesando={busy}
          onCancel={() => !busy && setDeleteProvConfirm(null)}
          onConfirm={confirmDeleteProveedor}
        >
          ¿Eliminar «{deleteProvConfirm.razon_social}» (NIT {deleteProvConfirm.nit}) del directorio?
          {(deleteProvConfirm.insumos_activos ?? 0) > 0 ? (
            <span style={{ display: 'block', marginTop: 8, color: '#dc2626' }}>
              Este proveedor tiene {deleteProvConfirm.insumos_activos} insumo(s) activo(s). Debe reasignarlos o eliminarlos antes.
            </span>
          ) : (
            <span style={{ display: 'block', marginTop: 8 }}>
              El proveedor dejará de aparecer en el directorio y en las búsquedas al crear insumos.
            </span>
          )}
        </CcConfirmModal>
      )}

      {deleteConfirm && (
        <CcConfirmModal
          theme={ui.confirmTheme}
          tipo="danger"
          titulo="Eliminar insumo"
          confirmar="Eliminar"
          cancelar="Cancelar"
          procesando={busy}
          onCancel={() => !busy && setDeleteConfirm(null)}
          onConfirm={confirmDeleteInsumo}
        >
          ¿Eliminar «{deleteConfirm.codigo}» — {deleteConfirm.descripcion}?
          {' '}El insumo dejará de estar disponible en solicitudes de almacén.
        </CcConfirmModal>
      )}

      <TributoModalShell
        open={modalImpuestoOpen}
        title={impuestoModalTarget === 'np' ? 'Impuesto — No Previsto' : 'Impuesto — Insumo'}
        t={t}
        onClose={() => setModalImpuestoOpen(false)}
        onSave={() => {
          updateCapture(
            impuestoModalTarget === 'np'
              ? { impuesto_np: { ...draftImpuesto } }
              : { impuesto: { ...draftImpuesto } },
          )
          setModalImpuestoOpen(false)
        }}
      >
        <div style={{
          marginBottom: 10,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${draftTipoImpuesto ? t.primary : t.border}`,
          background: ui.cardSubtle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
        >
          <span
            style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, fontWeight: 600 }}
            title="Inferido: solo IVA → Pleno; A/Í/U + IVA → sobre Utilidad"
          >
            Tipo
          </span>
          <span style={{
            fontSize: 'var(--cc-md)',
            fontWeight: 800,
            color: draftTipoImpuesto ? t.primary : t.textMuted,
          }}
          >
            {labelTipoImpuesto(draftTipoImpuesto)}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          {IMPUESTO_CAMPOS_UI.map(({ key, label }) => (
            <Field key={key} label={label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  type="number"
                  min="0"
                  max="1"
                  step="any"
                  inputMode="decimal"
                  placeholder="0.05"
                  title="Decimal (0.05 = 5%)"
                  value={draftImpuesto[key] ?? ''}
                  onChange={(e) => setDraftImpuesto((d) => ({ ...d, [key]: e.target.value }))}
                />
                <span
                  style={{
                    minWidth: 64,
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: 'var(--cc-sm)',
                    color: t.primary,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  title="Equivalente %"
                  data-fmt="pct-exacto"
                >
                  {fmtPctDesdeDecimal(draftImpuesto[key])}
                </span>
              </div>
            </Field>
          ))}
        </div>
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${t.border}`,
          background: ui.cardSubtle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
        >
          <span
            style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, fontWeight: 600 }}
            title={tooltipTotalPorcentaje(draftImpuesto)}
          >
            Total
          </span>
          <span
            style={{
              fontSize: 'var(--cc-md)',
              fontWeight: 800,
              color: t.primary,
              fontVariantNumeric: 'tabular-nums',
            }}
            title={tooltipTotalPorcentaje(draftImpuesto)}
            data-fmt="pct-sumatoria-exacta"
            aria-label={`Total ${fmtSumatoriaAiu(draftImpuesto)}`}
          >
            {fmtSumatoriaAiu(draftImpuesto)}
          </span>
        </div>
        <div style={{
          marginTop: 8,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${t.border}`,
          background: ui.cardSubtle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
        >
          <span
            style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, fontWeight: 600 }}
            title="Pesos COP redondeados a entero"
          >
            Después
          </span>
          <span
            style={{
              fontSize: 'var(--cc-md)',
              fontWeight: 800,
              color: t.primary,
              fontVariantNumeric: 'tabular-nums',
            }}
            title="Pesos COP redondeados a entero"
            data-fmt="cop-entero"
          >
            {fmtMoney(draftValorDespues)}
          </span>
        </div>
      </TributoModalShell>
    </div>
  )
}
