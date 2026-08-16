import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  tributosPayloadDesdeForm,
} from './catalogoInsumosTributos'
import { buildContratoUiTheme } from '../theme/adminPanelTheme'
import { UnidadSelector } from '../utils/unidadesListadoPrecios'
import CcConfirmModal from '../components/CcConfirmModal'
import CatalogoProveedorAutocomplete from './CatalogoProveedorAutocomplete'

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
  cantidad_negociada: '',
  impuesto: { ...EMPTY_IMPUESTO },
  cotizacion_numero: '',
  cotizacion_fecha: '',
  cotizacion_vigencia: '',
  requiere_cotizacion: true,
  ganadora_pdf: null,
  soportes_pdf: [],
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
    cantidad_negociada: String(f.cantidad_negociada ?? ''),
    impuesto: f.impuesto || EMPTY_IMPUESTO,
    cotizacion_numero: f.cotizacion_numero || '',
    cotizacion_fecha: f.cotizacion_fecha || '',
    cotizacion_vigencia: f.cotizacion_vigencia || '',
    requiere_cotizacion: !!f.requiere_cotizacion,
    ganadora_pdf: f.ganadora_pdf?.name || '',
    soportes_pdf: (f.soportes_pdf || []).map((x) => x.name).join('|'),
  })
}

const MAIN_CATALOG_TABS = [
  { id: 'insumos', label: 'Insumos' },
  { id: 'proveedores', label: 'Proveedores' },
]

/** Vista previa: valor después de AIU/IVA (solo lectura). */
function computeTotal(costo, impuestoForm) {
  return computeValorDespuesAiuIva(costo, impuestoForm || EMPTY_IMPUESTO, { valoresEnDecimal: true })
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

const MODAL_TABS = [
  { id: 'proveedor', label: 'Datos del proveedor' },
  { id: 'insumo', label: 'Datos del insumo' },
  { id: 'cotizaciones', label: 'Cotizaciones' },
]

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
  const th = {
    padding: '8px 6px',
    textAlign: 'left',
    borderBottom: `1px solid ${t.border}`,
    fontSize: 'var(--cc-xs)',
    color: t.primaryLight || t.primary,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    background: ui.dark ? 'rgba(0,180,198,0.08)' : t.inputBg,
  }
  const td = {
    padding: '7px 6px',
    borderBottom: `1px solid ${t.border}44`,
    fontSize: 'var(--cc-xs)',
    color: t.text,
  }
  const tdCodigo = { ...td, color: t.primaryLight || t.primary, fontWeight: 600 }
  const tdDesc = { ...td, color: t.text, fontWeight: 500 }
  const tdMuted = { ...td, color: t.textMuted }
  const tdMoney = { ...td, color: 'var(--cc-color-positive)', fontWeight: 600 }
  const tdTotal = { ...td, color: t.primary, fontWeight: 700 }
  const modalPanelStyle = {
    background: t.bgCard,
    borderRadius: 12,
    border: `1px solid ${t.border}`,
    color: t.text,
  }

  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [cotMin, setCotMin] = useState(3)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [dupAlert, setDupAlert] = useState(null)
  const [historial, setHistorial] = useState(null)
  const csvRef = useRef(null)
  const ocrCamRef = useRef(null)
  const [csvPending, setCsvPending] = useState(null)
  const [csvModo, setCsvModo] = useState('agregar')
  const [unidadModoCustom, setUnidadModoCustom] = useState(false)
  const [unidadCustom, setUnidadCustom] = useState('')
  const [modalTab, setModalTab] = useState('proveedor')
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
  const [draftImpuesto, setDraftImpuesto] = useState({ ...EMPTY_IMPUESTO })

  const formHasChanges = useCallback(() => snapshotForm(form) !== formBaselineRef.current, [form])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setConfirmDiscard(false)
    setDupAlert(null)
    setConsumoNegociado(null)
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

  const draftValorDespues = useMemo(
    () => computeTotal(form.costo_base, draftImpuesto),
    [form.costo_base, draftImpuesto],
  )

  const tributosResumen = useMemo(
    () => etiquetaTributos(tributosPayloadDesdeForm(form.impuesto || EMPTY_IMPUESTO)),
    [form.impuesto],
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
    return Math.round(cant * totalPreview * 100) / 100
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

  const refreshActiveTab = useCallback(() => {
    if (mainTab === 'proveedores') {
      loadProveedores()
      return
    }
    load()
  }, [mainTab, load, loadProveedores])

  const isRefreshing = mainTab === 'proveedores' ? provLoading : loading

  useEffect(() => {
    if (!api) return
    api.getConfig().then((c) => setCotMin(c.cotizaciones_minimas || 3)).catch(() => {})
  }, [api])

  const openNew = async () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setUnidadModoCustom(false)
    setUnidadCustom('')
    setDupAlert(null)
    setConsumoNegociado(null)
    setModalTab('proveedor')
    setMainTab('insumos')
    setModalOpen(true)
    formBaselineRef.current = snapshotForm(EMPTY_FORM)
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
      costo_base: row.costo ?? row.costo_base ?? '',
      cantidad_negociada: row.cantidad_negociada ?? '',
      impuesto: formImpuestoDesdeTributos(trib),
      cotizacion_numero: row.cotizacion_numero || '',
      cotizacion_fecha: row.cotizacion_fecha || '',
      cotizacion_vigencia: row.cotizacion_vigencia || '',
      requiere_cotizacion: row.requiere_cotizacion !== false,
    }
    setForm(nextForm)
    formBaselineRef.current = snapshotForm(nextForm)
    setConsumoNegociado(row.consumo_negociado || null)
    setUnidadModoCustom(false)
    setUnidadCustom('')
    setDupAlert(null)
    setModalTab('proveedor')
    setMainTab('insumos')
    setModalOpen(true)
  }

  const runOcr = async () => {
    if (!form.ganadora_pdf || !api) return
    setOcrBusy(true)
    try {
      const r = await api.ocrCotizacion(form.ganadora_pdf)
      const c = r.campos_catalogo || {}
      setForm((f) => ({
        ...f,
        razon_social: c.razon_social || f.razon_social,
        nit: c.nit || f.nit,
        cotizacion_fecha: c.cotizacion_fecha || f.cotizacion_fecha,
        costo_base: c.costo_base != null ? String(c.costo_base) : f.costo_base,
        impuesto: (c.impuesto_porcentaje != null || c.tipo_impuesto === 'iva')
          ? {
              ...f.impuesto,
              iva: c.impuesto_porcentaje != null
                ? String(Number(c.impuesto_porcentaje) / 100)
                : f.impuesto?.iva,
            }
          : f.impuesto,
      }))
      setMsg({ type: 'success', text: r.mensaje || 'OCR completado. Revise los campos.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setOcrBusy(false)
    }
  }

  const checkDupBeforeSave = async () => {
    if (!api || !form.descripcion.trim()) return null
    const pid = form.proveedor_id ? Number(form.proveedor_id) : null
    if (!pid && !(form.razon_social && form.nit)) return null
    let proveedorId = pid
    if (!proveedorId) return null
    const r = await api.checkDuplicado({
      proveedor_id: proveedorId,
      descripcion: form.descripcion.trim(),
      exclude_insumo_id: editId || undefined,
    })
    return r.hay_duplicado ? r.duplicados[0] : null
  }

  const buildFormData = (forceUpdateId) => {
    const fd = new FormData()
    fd.append('codigo', (form.codigo || '').trim())
    fd.append('descripcion', form.descripcion.trim())
    fd.append('unidad', form.unidad || 'UND')
    fd.append('costo_base', String(form.costo_base))
    if (form.rendimiento !== '') fd.append('rendimiento', String(form.rendimiento))
    // Desglose unificado Tipo | A | Í | U | IVA (tipo inferido automáticamente).
    fd.append('tributos', JSON.stringify(tributosPayloadDesdeForm(form.impuesto || EMPTY_IMPUESTO)))
    if (form.proveedor_id) fd.append('proveedor_id', String(form.proveedor_id))
    else if (form.razon_social && form.nit) {
      fd.append('razon_social', form.razon_social.trim())
      fd.append('nit', form.nit.trim())
    }
    if (form.contacto_email.trim()) fd.append('contacto_email', form.contacto_email.trim())
    if (form.contacto_nombre.trim()) fd.append('contacto_nombre', form.contacto_nombre.trim())
    if (form.contacto_telefono.trim()) fd.append('contacto_telefono', form.contacto_telefono.trim())
    if (form.cotizacion_numero) fd.append('cotizacion_numero', form.cotizacion_numero.trim())
    if (form.cotizacion_fecha) fd.append('cotizacion_fecha', form.cotizacion_fecha)
    if (form.cotizacion_vigencia) fd.append('cotizacion_vigencia', form.cotizacion_vigencia.trim())
    fd.append('requiere_cotizacion', form.requiere_cotizacion ? 'true' : 'false')
    if (form.cantidad_negociada !== '') fd.append('cantidad_negociada', String(form.cantidad_negociada))
    if (forceUpdateId) fd.append('force_update_id', String(forceUpdateId))
    if (form.ganadora_pdf) fd.append('cotizacion_ganadora_pdf', form.ganadora_pdf)
    ;(form.soportes_pdf || []).forEach((f) => fd.append('cotizaciones_soporte', f))
    return fd
  }

  const save = async (forceUpdateId = null) => {
    if (!api) return
    if (!form.descripcion.trim()) {
      setMsg({ type: 'error', text: 'La descripción es obligatoria.' })
      return
    }
    if (!form.unidad.trim()) {
      setMsg({ type: 'error', text: 'Seleccione la unidad del insumo.' })
      return
    }
    if (form.costo_base === '' || Number(form.costo_base) < 0) {
      setMsg({ type: 'error', text: 'Indique el costo base.' })
      return
    }
    if (form.requiere_cotizacion && !editId) {
      const needSop = Math.max(0, cotMin - 1)
      const sopCount = (form.soportes_pdf || []).length
      const hasGanadora = form.ganadora_pdf || (form.cotizacion_numero || '').trim()
      if (!hasGanadora) {
        setMsg({ type: 'error', text: 'Registre la cotización ganadora (PDF o número de cotización).' })
        return
      }
      if (sopCount < needSop) {
        setMsg({
          type: 'error',
          text: `Se requieren al menos ${needSop} PDF(s) de cotización de soporte (mínimo ${cotMin} cotizaciones comparativas).`,
        })
        return
      }
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

  const onCsvSelect = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCsvModo('agregar')
    setCsvPending(file)
  }

  const confirmCsvImport = async () => {
    if (!csvPending || !api) return
    if (csvModo === 'reemplazar') {
      const ok = window.confirm(
        '¿Reemplazar todo el catálogo? Los insumos actuales se desactivarán y solo quedarán los del CSV.',
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      const r = await api.importCsv(csvPending, csvModo)
      setMsg({
        type: 'success',
        text: `Importación (${csvModo}): ${r.creados} creados, ${r.actualizados} actualizados`
          + (r.desactivados ? `, ${r.desactivados} desactivados` : '')
          + (r.errores?.length ? `, ${r.errores.length} errores` : ''),
      })
      setCsvPending(null)
      load()
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
      style={{ padding: compactCatalog ? '12px 12px' : '16px 20px', color: t.text }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--cc-lg)', color: t.primary }}>Catálogo de insumos</h2>
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 4 }}>
            {embedded
              ? 'Accesible desde Almacén. Las solicitudes solo pueden seleccionar insumos existentes.'
              : 'Gestión centralizada del catálogo. Las solicitudes de almacén solo pueden seleccionar insumos existentes.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <IconActionBtn
            title={mainTab === 'proveedores' ? 'Actualizar proveedores' : 'Actualizar insumos'}
            disabled={busy || isRefreshing}
            t={t}
            onClick={refreshActiveTab}
          >
            <IconCatalogRefresh />
          </IconActionBtn>
          {canCrear && mainTab === 'insumos' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <IconActionBtn title="Nuevo insumo" onClick={openNew} t={t} variant="primary">
              <IconNewInsumo />
            </IconActionBtn>
            <span
              title="Cree el insumo con la cotización ganadora (OCR opcional) y adjunte las cotizaciones de soporte en PDF (máx. 200 KB c/u). El rendimiento puede completarse después."
              style={{ cursor: 'help', opacity: 0.6, fontSize: 'var(--cc-md)' }}
            >
              ?
            </span>
          </div>
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

      {mainTab === 'insumos' && canCrear && (
        <div
          style={{
            marginBottom: 16,
            padding: '14px 18px',
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: ui.cardSubtle,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', marginBottom: 4, color: t.primary }}>
                Carga masiva
              </div>
              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                Descargue la plantilla, complétela con sus insumos y cárguela de vuelta.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onCsvSelect} />
              <IconActionBtn
                title="Descargar plantilla CSV"
                disabled={busy}
                t={t}
                onClick={() => api?.downloadPlantillaCsv().catch((e) => setMsg({ type: 'error', text: e.message }))}
              >
                <IconTemplateDownload />
              </IconActionBtn>
              <IconActionBtn
                title="Importar CSV"
                disabled={busy}
                t={t}
                onClick={() => csvRef.current?.click()}
              >
                <IconCsvImport />
              </IconActionBtn>
            </div>
          </div>
        </div>
      )}

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

      <div style={{ overflow: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Proveedor', 'Código', 'Descripción', 'Und', 'Rend.', 'Antes AIU/IVA', 'Tributos', 'Después AIU/IVA', ''].map((h) => (
                <th key={h || 'acc'} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={td}>Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={{ ...td, color: t.textMuted }}>Sin insumos en el catálogo.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.insumo_id || r.id}>
                <td style={tdMuted}>{r.proveedor_nombre || '—'}</td>
                <td style={tdCodigo}>{r.codigo}</td>
                <td style={tdDesc}>{r.descripcion}</td>
                <td style={tdMuted}>{r.unidad}</td>
                <td style={tdMuted}>{r.rendimiento ?? '—'}</td>
                <td style={tdMoney}>{fmtMoney(r.costo)}</td>
                <td style={tdMuted}>{r.impuesto_etiqueta || '—'}</td>
                <td style={tdTotal}>{fmtMoney(r.costo_total)}</td>
                <td style={td}>
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
            ))}
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
          <div style={{ overflow: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Razón social', 'NIT', 'Contacto', 'Correo', 'Teléfono', 'Insumos', ''].map((h) => (
                    <th key={h || 'acc'} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {provLoading ? (
                  <tr><td colSpan={7} style={td}>Cargando…</td></tr>
                ) : proveedores.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...td, color: t.textMuted }}>Sin proveedores registrados.</td></tr>
                ) : proveedores.map((p) => (
                  <tr key={p.id}>
                    <td style={tdDesc}>{p.razon_social}</td>
                    <td style={tdCodigo}>{p.nit}</td>
                    <td style={tdMuted}>{p.contacto_nombre || '—'}</td>
                    <td style={tdMuted}>{p.contacto_email || '—'}</td>
                    <td style={tdMuted}>{p.contacto_telefono || '—'}</td>
                    <td style={tdTotal}>{p.insumos_activos ?? 0}</td>
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
            Los proveedores se agregan al crear insumos o al importar CSV. No se duplican por NIT.
            {canEliminar && ' Solo puede eliminar proveedores sin insumos activos asociados.'}
          </div>
        </div>
      )}

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0' }}>
          <div style={{ width: 'min(1020px, 96vw)', maxHeight: '94vh', overflow: 'auto', ...modalPanelStyle, padding: '22px 26px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: t.text }}>{editId ? 'Editar insumo' : 'Nuevo insumo'}</h3>

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

            <ModalTabs tabs={MODAL_TABS} active={modalTab} onChange={setModalTab} ui={ui} />

            {modalTab === 'proveedor' && (
              <div role="tabpanel">
                <Field label="Buscar en directorio de proveedores">
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
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: '0 16px' }}>
                  <Field label="Proveedor (razón social)">
                    <input style={inputStyle} value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value, proveedor_id: '' })} />
                  </Field>
                  <Field label="NIT proveedor">
                    <input style={inputStyle} value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value, proveedor_id: '' })} />
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0 16px' }}>
                  <Field label="Correo contacto proveedor">
                    <input style={inputStyle} type="email" value={form.contacto_email} onChange={(e) => setForm({ ...form, contacto_email: e.target.value })} />
                  </Field>
                  <Field label="Nombre comercial / contacto">
                    <input style={inputStyle} value={form.contacto_nombre} onChange={(e) => setForm({ ...form, contacto_nombre: e.target.value })} />
                  </Field>
                  <Field label="Teléfono contacto">
                    <input style={inputStyle} type="tel" value={form.contacto_telefono} onChange={(e) => setForm({ ...form, contacto_telefono: e.target.value })} />
                  </Field>
                </div>
              </div>
            )}

            {modalTab === 'insumo' && (
              <div role="tabpanel">
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '0 16px' }}>
                  <Field label="Código" hint={editId ? 'El código no se modifica al editar.' : 'Asignado automáticamente por contrato (CC-NNNN-NNN).'}>
                    <input
                      style={{ ...inputStyle, opacity: 0.85 }}
                      value={form.codigo || (editId ? '—' : 'Generando…')}
                      readOnly
                      disabled
                    />
                  </Field>
                  <Field label="Unidad *">
                    <UnidadSelector
                      value={form.unidad}
                      onChange={(v) => setForm({ ...form, unidad: v })}
                      selectStyle={inputStyle}
                      inputStyle={inputStyle}
                      btnPrimary={btnPrimary}
                      btnSecondary={btnSecondary}
                      modoCustom={unidadModoCustom}
                      setModoCustom={setUnidadModoCustom}
                      uCustom={unidadCustom}
                      setUCustom={setUnidadCustom}
                    />
                  </Field>
                  <Field label="Rendimiento">
                    <input style={inputStyle} value={form.rendimiento} onChange={(e) => setForm({ ...form, rendimiento: e.target.value })} />
                  </Field>
                </div>
                <Field label="Descripción *">
                  <input style={inputStyle} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
                  <Field
                    label="Valor antes de AIU o IVA *"
                    hint="Costo base del insumo (sin A, Í, U ni IVA)."
                  >
                    <input style={inputStyle} type="number" min="0" step="0.01" value={form.costo_base} onChange={(e) => setForm({ ...form, costo_base: e.target.value })} />
                  </Field>
                  <Field
                    label="Valor después de AIU o IVA"
                    hint="Calculado automáticamente según A, Í, U e IVA (no editable)."
                  >
                    <input style={{ ...inputStyle, opacity: 0.9, fontWeight: 700 }} readOnly value={fmtMoney(totalPreview)} />
                  </Field>
                </div>
                <div style={{
                  marginTop: 4,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: ui.cardSubtle,
                }}
                >
                  <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', color: t.primary, marginBottom: 8 }}>
                    Impuesto del insumo
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                    <button
                      type="button"
                      title="Captura unificada: Tipo impuesto | A | Í | U | IVA"
                      onClick={() => {
                        setDraftImpuesto({ ...(form.impuesto || EMPTY_IMPUESTO) })
                        setModalImpuestoOpen(true)
                      }}
                      style={{
                        ...btnSecondary,
                        borderColor: impuestoTieneDatos(form.impuesto) ? t.primary : t.border,
                        color: impuestoTieneDatos(form.impuesto) ? t.primary : t.text,
                        fontWeight: 700,
                      }}
                    >
                      A · Í · U · IVA{impuestoTieneDatos(form.impuesto) ? ' ✓' : ''}
                    </button>
                    <span style={{
                      fontSize: 'var(--cc-caption)',
                      fontWeight: 700,
                      color: tipoImpuestoInferido ? t.primary : t.textMuted,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: `1px solid ${tipoImpuestoInferido ? t.primary : t.border}`,
                      background: t.bgCard,
                    }}
                    >
                      Tipo: {labelTipoImpuesto(tipoImpuestoInferido)}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
                    {tributosResumen === '—'
                      ? 'Sin impuesto diligenciado. Capture A, Í, U e IVA en un solo formulario; el tipo se infiere automáticamente.'
                      : tributosResumen}
                  </div>
                </div>
                <div style={{
                  marginTop: 8,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: ui.cardSubtle,
                }}
                >
                  <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', color: t.primary, marginBottom: 8 }}>
                    Negociación con proveedor
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
                    <Field label="Cantidad negociada" hint="Volumen total pactado con el proveedor (ej. 1000 m³).">
                      <input style={inputStyle} type="number" min="0" step="any" value={form.cantidad_negociada} onChange={(e) => setForm({ ...form, cantidad_negociada: e.target.value })} />
                    </Field>
                    <Field label="Valor total negociado" hint="Se calcula automáticamente: cantidad negociada × valor después de AIU/IVA.">
                      <div style={{
                        ...inputStyle,
                        background: ui.cardSubtle,
                        color: valorNegociadoPreview != null ? t.text : t.textMuted,
                        fontWeight: valorNegociadoPreview != null ? 600 : 400,
                      }}
                      >
                        {valorNegociadoPreview != null ? fmtMoney(valorNegociadoPreview) : '—'}
                        {totalPreview > 0 && (
                          <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginLeft: 8, fontWeight: 400 }}>
                            ({fmtMoney(totalPreview)} / unidad)
                          </span>
                        )}
                      </div>
                    </Field>
                  </div>
                  {consumoNegociado?.tiene_negociado && (
                    <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 6 }}>
                      Consumido en solicitudes: <strong style={{ color: consumoNegociado.supera_negociado ? ui.errorText : t.text }}>{consumoNegociado.cantidad_consumida_acumulada}</strong>
                      {' '}{consumoNegociado.unidad} de {consumoNegociado.cantidad_negociada} negociados
                      {consumoNegociado.supera_negociado && (
                        <span style={{ color: ui.errorText, fontWeight: 600 }}> — supera lo negociado</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {modalTab === 'cotizaciones' && (
              <div role="tabpanel">
                <Field label="¿Requiere cotización?" hint="Si está activo, el insumo debe cumplir el mínimo de cotizaciones (ganadora + soportes) antes de guardarse.">
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--cc-sm)' }}>
                    <input
                      type="checkbox"
                      checked={!!form.requiere_cotizacion}
                      onChange={(e) => setForm({ ...form, requiere_cotizacion: e.target.checked })}
                    />
                    <span>{form.requiere_cotizacion ? 'Sí, exige cotizaciones comparativas' : 'No requiere cotizaciones'}</span>
                  </label>
                </Field>

                {form.requiere_cotizacion ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0 16px', marginBottom: 16 }}>
                      <Field label="Nº cotización">
                        <input style={inputStyle} value={form.cotizacion_numero} onChange={(e) => setForm({ ...form, cotizacion_numero: e.target.value })} />
                      </Field>
                      <Field label="Fecha cotización">
                        <input style={inputStyle} type="date" value={form.cotizacion_fecha} onChange={(e) => setForm({ ...form, cotizacion_fecha: e.target.value })} />
                      </Field>
                      <Field label="Vigencia (texto del proveedor)">
                        <input style={inputStyle} value={form.cotizacion_vigencia} onChange={(e) => setForm({ ...form, cotizacion_vigencia: e.target.value })} placeholder="Ej. 15 días" />
                      </Field>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
                      <div style={{
                        padding: 14,
                        borderRadius: 10,
                        border: `2px solid ${t.primary}`,
                        background: ui.cardSubtle,
                      }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <span style={{
                            fontSize: 'var(--cc-xs)',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: t.primary,
                            color: '#fff',
                          }}
                          >
                            Cotización ganadora
                          </span>
                          <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                            Documento principal — OCR y datos de precio
                          </span>
                        </div>
                        <Field label="PDF cotización ganadora (máx. 200 KB)" hint="Adjunte el PDF y use OCR para autocompletar proveedor, costo e impuestos en las otras pestañas.">
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexDirection: compactCatalog ? 'column' : 'row' }}>
                            {compactCatalog && (
                              <>
                                <input
                                  ref={ocrCamRef}
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  style={{ display: 'none' }}
                                  onChange={(e) => setForm({ ...form, ganadora_pdf: e.target.files?.[0] || null })}
                                />
                                <button
                                  type="button"
                                  style={{ ...btnPrimary, width: '100%' }}
                                  onClick={() => ocrCamRef.current?.click()}
                                >
                                  📷 Fotografiar cotización
                                </button>
                              </>
                            )}
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              style={compactCatalog ? { width: '100%' } : undefined}
                              onChange={(e) => setForm({ ...form, ganadora_pdf: e.target.files?.[0] || null })}
                            />
                            {form.ganadora_pdf && (
                              <span style={{ fontSize: 'var(--cc-xs)', opacity: 0.85 }}>{form.ganadora_pdf.name}</span>
                            )}
                            <IconActionBtn
                              title={ocrBusy ? 'Leyendo documento…' : 'Ejecutar OCR'}
                              disabled={!form.ganadora_pdf || ocrBusy}
                              t={t}
                              onClick={runOcr}
                            >
                              <IconOcrScan />
                            </IconActionBtn>
                          </div>
                        </Field>
                      </div>

                      <div style={{
                        padding: 14,
                        borderRadius: 10,
                        border: `1px dashed ${ui.dashedBorder}`,
                        background: t.inputBg,
                      }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <span style={{
                            fontSize: 'var(--cc-xs)',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: t.textMuted,
                            color: t.bgCard,
                          }}
                          >
                            Cotizaciones de soporte
                          </span>
                          <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                            Comparativas adicionales — solo archivo PDF
                          </span>
                        </div>
                        <Field label={`PDFs de soporte (máx. 200 KB c/u — mín. ${Math.max(0, cotMin - 1)} requeridos)`}>
                          <input
                            type="file"
                            accept="application/pdf"
                            multiple
                            onChange={(e) => setForm({ ...form, soportes_pdf: Array.from(e.target.files || []) })}
                          />
                          {(form.soportes_pdf || []).length > 0 && (
                            <ul style={{ fontSize: 'var(--cc-xs)', margin: '6px 0 0', paddingLeft: 18, opacity: 0.9 }}>
                              {form.soportes_pdf.map((f) => (
                                <li key={f.name + f.size}>{f.name}</li>
                              ))}
                            </ul>
                          )}
                        </Field>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{
                    padding: 12,
                    borderRadius: 8,
                    border: `1px dashed ${ui.dashedBorder}`,
                    fontSize: 'var(--cc-xs)',
                    color: t.textMuted,
                  }}
                  >
                    Este insumo quedará disponible para solicitudes sin registrar cotización ganadora ni PDFs de soporte.
                  </div>
                )}
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

      {csvPending && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10004, background: ui.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => !busy && setCsvPending(null)}>
          <div style={{ width: 'min(420px,95vw)', ...modalPanelStyle, padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginTop: 0, color: t.text }}>Importar CSV</h4>
            <p style={{ fontSize: 'var(--cc-sm)', opacity: 0.85, margin: '0 0 8px' }}>
              Archivo: <strong>{csvPending.name}</strong>
            </p>
            <p style={{ fontSize: 'var(--cc-xs)', opacity: 0.75, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>Columnas obligatorias: codigo, descripcion, unidad, costo.</span>
              <IconActionBtn
                title="Descargar plantilla CSV"
                t={t}
                onClick={() => api?.downloadPlantillaCsv().catch(() => {})}
              >
                <IconTemplateDownload />
              </IconActionBtn>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--cc-sm)', cursor: 'pointer' }}>
                <input type="radio" name="csvModo" checked={csvModo === 'agregar'} onChange={() => setCsvModo('agregar')} />
                <span><strong>Agregar</strong> — suma los insumos del CSV al catálogo actual.</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--cc-sm)', cursor: 'pointer' }}>
                <input type="radio" name="csvModo" checked={csvModo === 'reemplazar'} onChange={() => setCsvModo('reemplazar')} />
                <span><strong>Reemplazar todo</strong> — desactiva el catálogo actual y lo sustituye por el CSV.</span>
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
                    {['Fecha', 'Antes AIU/IVA', 'Después AIU/IVA', 'Motivo'].map((h) => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {historial.items.map((h) => (
                    <tr key={h.id}>
                      <td style={td}>{h.created_at ? String(h.created_at).slice(0, 10) : '—'}</td>
                      <td style={td}>{fmtMoney(h.costo_base)}</td>
                      <td style={td}>{fmtMoney(h.valor_compra_referencia)}</td>
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
        title="Impuesto del insumo — A · Í · U · IVA"
        t={t}
        onClose={() => setModalImpuestoOpen(false)}
        onSave={() => {
          setForm((f) => ({ ...f, impuesto: { ...draftImpuesto } }))
          setModalImpuestoOpen(false)
        }}
      >
        <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
          Digite A, Í, U e IVA en decimal (ej. 0.05). La plataforma muestra el equivalente en % e infiere el tipo de impuesto.
        </p>
        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
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
          <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, fontWeight: 600 }}>
            Tipo impuesto (inferido)
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
                  step="0.0001"
                  inputMode="decimal"
                  placeholder="0.05"
                  value={draftImpuesto[key] ?? ''}
                  onChange={(e) => setDraftImpuesto((d) => ({ ...d, [key]: e.target.value }))}
                />
                <span
                  style={{
                    minWidth: 52,
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: 'var(--cc-sm)',
                    color: t.primary,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  title="Equivalente en porcentaje"
                >
                  {fmtPctDesdeDecimal(draftImpuesto[key])}
                </span>
              </div>
            </Field>
          ))}
        </div>
        <div style={{
          marginTop: 12,
          padding: '10px 12px',
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
          <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, fontWeight: 600 }}>
            Total A. + Í. + U.
          </span>
          <span style={{
            fontSize: 'var(--cc-md)',
            fontWeight: 800,
            color: t.primary,
            fontVariantNumeric: 'tabular-nums',
          }}
          >
            {fmtSumatoriaAiu(draftImpuesto)}
          </span>
        </div>
        <div style={{
          marginTop: 10,
          padding: '10px 12px',
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
          <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, fontWeight: 600 }}>
            Valor después de AIU o IVA
          </span>
          <span style={{
            fontSize: 'var(--cc-md)',
            fontWeight: 800,
            color: t.primary,
            fontVariantNumeric: 'tabular-nums',
          }}
          >
            {fmtMoney(draftValorDespues)}
          </span>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: t.textMuted, lineHeight: 1.4 }}>
          Solo IVA → IVA Pleno. A/Í/U + IVA → IVA sobre Utilidad. El tipo no se elige manualmente.
        </p>
      </TributoModalShell>
    </div>
  )
}
