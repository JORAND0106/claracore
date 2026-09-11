import { useEffect, useRef, useState } from 'react'
import CcDatePickerInput from '../../components/CcDatePickerInput'
import { isDarkMode, tFrom } from '../../theme/adminPanelTheme'
import CatalogSelect from './CatalogSelect'
import FirmaPad from './FirmaPad'
import FotoTrabajadorCapture from './FotoTrabajadorCapture'
import MunicipioAutocomplete from './MunicipioAutocomplete'
import PhoneWithWhatsApp from './PhoneWithWhatsApp'
import {
  TIPOS_SANGRE,
  capitalizarNombrePropio,
  capitalizarOracion,
  formatSalarioInput,
} from './rrhhHelpers'
import { rrhhSheetCssVars, rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'

function SheetField({ label, labelStyle, valueStyle, children, colSpan = 1 }) {
  return (
    <>
      <td style={labelStyle}>{label}</td>
      <td style={valueStyle} colSpan={colSpan}>{children}</td>
    </>
  )
}

function AutoTextarea({ value, onChange, onBlur, disabled, style, placeholder }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(40, el.scrollHeight)}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      style={{
        ...style,
        resize: 'none',
        overflow: 'hidden',
        minHeight: 40,
        lineHeight: 1.35,
        whiteSpace: 'pre-wrap',
      }}
      value={value ?? ''}
      disabled={disabled}
      placeholder={placeholder}
      rows={2}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
    />
  )
}

/**
 * Formulario compacto — Documentación para contratación (Recursos Humanos).
 */
export default function TrabajadorFormSheet({
  theme,
  form,
  onChange,
  canEdit = true,
  empresas = [],
  catalogo = {},
  onAddCatalogValue,
  api = null,
  trabajadorId = null,
  docLocked = false,
  onMsg = null,
}) {
  const tTok = tFrom(theme)
  const ui = rrhhSheetStyles(tTok)
  const cssVars = rrhhSheetCssVars(tTok)
  const S = rrhhUi(theme, tTok)
  const f = form || {}
  const certInputRef = useRef(null)
  const [certBusy, setCertBusy] = useState(false)
  const [certNombreVigente, setCertNombreVigente] = useState('')

  const setField = (key, val) => onChange?.({ ...f, [key]: val })
  const setMany = (patch) => onChange?.({ ...f, ...patch })
  const bancoEditable = canEdit && !docLocked

  useEffect(() => {
    let cancelled = false
    const loadCert = async () => {
      if (!api || !trabajadorId) {
        setCertNombreVigente('')
        return
      }
      try {
        const res = await api.listDocumentos(trabajadorId, 'bancario')
        const vig = (res?.items || []).find((d) => d.tipo === 'certificacion_bancaria' && d.vigente)
        if (!cancelled) setCertNombreVigente(vig?.nombre_archivo || '')
      } catch {
        if (!cancelled) setCertNombreVigente('')
      }
    }
    loadCert()
    return () => { cancelled = true }
  }, [api, trabajadorId])

  const onCertFile = async (file) => {
    if (!file || !bancoEditable) return
    setCertBusy(true)
    try {
      setMany({
        _cert_bancaria_file: file,
        _cert_bancaria_nombre: file.name,
      })
      if (api) {
        const r = await api.ocrBancario(trabajadorId || null, file)
        const sug = r?.sugerencias || {}
        const patch = {
          _cert_bancaria_file: file,
          _cert_bancaria_nombre: file.name,
        }
        if (sug.banco_entidad) patch.banco_entidad = sug.banco_entidad
        if (sug.banco_tipo_cuenta) patch.banco_tipo_cuenta = sug.banco_tipo_cuenta
        if (sug.banco_numero_cuenta) patch.banco_numero_cuenta = sug.banco_numero_cuenta
        setMany(patch)
        if (r?.ok === false) onMsg?.({ type: 'error', text: r?.mensaje || 'No se pudieron leer los datos del adjunto.' })
      }
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudo procesar la certificación bancaria.' })
    } finally {
      setCertBusy(false)
    }
  }

  const lbl = {
    ...ui.tdLabel,
    background: isDarkMode(theme) ? 'rgba(0,175,197,0.04)' : 'rgba(0,119,182,0.03)',
    padding: '4px 6px',
    fontSize: 'var(--cc-caption)',
  }
  const valCell = { ...ui.td, overflow: 'visible', padding: '4px 6px' }

  const empresaKey = f.empresa_key
    || (f.empresa_tipo === 'subcontratista' && f.empresa_subcontratista_id
      ? `sub:${f.empresa_subcontratista_id}`
      : 'consorcio')

  const empresaSel = (empresas || []).find((e) => e.key === empresaKey)
    || (empresas || []).find((e) => e.tipo === 'consorcio')
  const nitAuto = empresaSel?.nit || f.empresa_nit || ''

  const onEmpresaChange = (key) => {
    const emp = (empresas || []).find((e) => e.key === key)
    if (!emp) {
      setField('empresa_key', key)
      return
    }
    setMany({
      empresa_key: emp.key,
      empresa_tipo: emp.tipo,
      empresa_subcontratista_id: emp.tipo === 'subcontratista' ? String(emp.id ?? '') : '',
      empresa_nombre: emp.nombre,
      empresa_nit: emp.nit || '',
    })
  }

  const catSelect = (field, categoria) => (
    <CatalogSelect
      value={f[field] || ''}
      options={catalogo?.[categoria] || []}
      canEdit={canEdit}
      style={ui.cellSelect}
      onChange={(v) => setField(field, v)}
      onAddNew={async (v) => { await onAddCatalogValue?.(categoria, v) }}
    />
  )

  const blurNombre = (key) => () => {
    const next = capitalizarNombrePropio(f[key])
    if (next !== f[key]) setField(key, next)
  }

  return (
    <div style={{ ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)', fontFamily: 'inherit' }}>
      <div style={ui.sectionTitle}>Datos personales</div>
      <div style={{ ...ui.sheetWrap, maxHeight: 'none', overflow: 'visible', marginBottom: 10 }}>
        <table style={{ ...ui.sheetTable, minWidth: 720 }}>
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <tbody>
            <tr>
              <SheetField label="Nombres *" labelStyle={lbl} valueStyle={valCell}>
                <input
                  style={ui.cellInp}
                  value={f.nombres ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('nombres', e.target.value)}
                  onBlur={blurNombre('nombres')}
                />
              </SheetField>
              <SheetField label="Apellidos *" labelStyle={lbl} valueStyle={valCell}>
                <input
                  style={ui.cellInp}
                  value={f.apellidos ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('apellidos', e.target.value)}
                  onBlur={blurNombre('apellidos')}
                />
              </SheetField>
              <SheetField label="Género" labelStyle={lbl} valueStyle={valCell}>
                <select
                  style={ui.cellSelect}
                  value={f.genero || ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('genero', e.target.value)}
                >
                  <option value="">—</option>
                  <option value="F">Femenino</option>
                  <option value="M">Masculino</option>
                  <option value="O">Otro</option>
                </select>
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Tipo doc. *" labelStyle={lbl} valueStyle={valCell}>
                <select
                  style={ui.cellSelect}
                  value={f.tipo_documento || 'CC'}
                  disabled={!canEdit}
                  onChange={(e) => setField('tipo_documento', e.target.value)}
                >
                  {['CC', 'CE', 'TI', 'PA', 'OTRO'].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </SheetField>
              <SheetField label="N.° documento *" labelStyle={lbl} valueStyle={valCell}>
                <input
                  style={ui.cellInp}
                  inputMode="numeric"
                  value={f.numero_documento ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('numero_documento', e.target.value.replace(/\D/g, ''))}
                />
              </SheetField>
              <SheetField label="Lugar expedición" labelStyle={lbl} valueStyle={valCell}>
                <MunicipioAutocomplete
                  value={f.lugar_expedicion || ''}
                  disabled={!canEdit}
                  style={ui.cellInp}
                  placeholder="Municipio…"
                  onChange={(v) => setField('lugar_expedicion', v)}
                />
              </SheetField>
            </tr>
            <tr>
              <SheetField label="F. nacimiento" labelStyle={lbl} valueStyle={valCell} colSpan={3}>
                <CcDatePickerInput
                  value={f.fecha_nacimiento || ''}
                  disabled={!canEdit}
                  style={ui.cellInp}
                  aria-label="Fecha de nacimiento"
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(v) => setField('fecha_nacimiento', v)}
                />
              </SheetField>
              <SheetField label="Tipo de sangre" labelStyle={lbl} valueStyle={valCell}>
                <select
                  style={ui.cellSelect}
                  value={f.tipo_sangre || ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('tipo_sangre', e.target.value)}
                >
                  <option value="">—</option>
                  {TIPOS_SANGRE.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Dirección" labelStyle={lbl} valueStyle={valCell} colSpan={3}>
                <input
                  style={ui.cellInp}
                  value={f.direccion ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('direccion', e.target.value)}
                />
              </SheetField>
              <SheetField label="Ciudad" labelStyle={lbl} valueStyle={valCell}>
                <MunicipioAutocomplete
                  value={f.ciudad || ''}
                  disabled={!canEdit}
                  style={ui.cellInp}
                  placeholder="Municipio…"
                  onChange={(v) => setField('ciudad', v)}
                />
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Teléfono" labelStyle={lbl} valueStyle={valCell} colSpan={3}>
                <PhoneWithWhatsApp
                  value={f.telefono || ''}
                  disabled={!canEdit}
                  inputStyle={ui.cellInp}
                  onChange={(v) => setField('telefono', v)}
                />
              </SheetField>
              <SheetField label="Correo" labelStyle={lbl} valueStyle={valCell}>
                <input
                  type="email"
                  style={ui.cellInp}
                  value={f.email ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </SheetField>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={ui.sectionTitle}>Contacto de emergencia</div>
      <div style={{ ...ui.sheetWrap, maxHeight: 'none', overflow: 'visible', marginBottom: 10 }}>
        <table style={{ ...ui.sheetTable, minWidth: 720 }}>
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <tbody>
            <tr>
              <SheetField label="Nombre" labelStyle={lbl} valueStyle={valCell}>
                <input
                  style={ui.cellInp}
                  value={f.emergencia_nombre ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('emergencia_nombre', e.target.value)}
                  onBlur={blurNombre('emergencia_nombre')}
                />
              </SheetField>
              <SheetField label="Parentesco" labelStyle={lbl} valueStyle={valCell}>
                {catSelect('emergencia_parentesco', 'parentesco')}
              </SheetField>
              <SheetField label="Teléfono" labelStyle={lbl} valueStyle={valCell}>
                <PhoneWithWhatsApp
                  value={f.emergencia_telefono || ''}
                  disabled={!canEdit}
                  inputStyle={ui.cellInp}
                  onChange={(v) => setField('emergencia_telefono', v)}
                />
              </SheetField>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={ui.sectionTitle}>Condiciones laborales</div>
      <div style={{ ...ui.sheetWrap, maxHeight: 'none', overflow: 'visible', marginBottom: 10 }}>
        <table style={{ ...ui.sheetTable, minWidth: 720 }}>
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <tbody>
            <tr>
              <SheetField label="Cargo" labelStyle={lbl} valueStyle={valCell}>{catSelect('cargo_aspira', 'cargo')}</SheetField>
              <SheetField label="Tipo contrato" labelStyle={lbl} valueStyle={valCell}>{catSelect('tipo_contrato', 'tipo_contrato')}</SheetField>
              <SheetField label="Estado" labelStyle={lbl} valueStyle={valCell}>
                <select
                  style={ui.cellSelect}
                  value={f.estado || 'activo'}
                  disabled={!canEdit}
                  onChange={(e) => setField('estado', e.target.value)}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="retirado">Retirado</option>
                </select>
              </SheetField>
            </tr>
            <tr>
              <td style={lbl}>Cuenta bancaria</td>
              <td style={{ ...valCell, overflow: 'visible' }} colSpan={5}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    style={{ ...ui.cellInp, flex: '1 1 140px', minWidth: 120 }}
                    placeholder="Entidad bancaria"
                    disabled={!bancoEditable}
                    value={f.banco_entidad || ''}
                    onChange={(e) => setField('banco_entidad', e.target.value)}
                    aria-label="Entidad bancaria"
                  />
                  <select
                    style={{ ...ui.cellSelect, flex: '0 1 120px', minWidth: 110 }}
                    disabled={!bancoEditable}
                    value={f.banco_tipo_cuenta || ''}
                    onChange={(e) => setField('banco_tipo_cuenta', e.target.value)}
                    aria-label="Tipo de cuenta"
                  >
                    <option value="">Tipo cuenta</option>
                    <option value="ahorros">Ahorros</option>
                    <option value="corriente">Corriente</option>
                  </select>
                  <input
                    style={{ ...ui.cellInp, flex: '1 1 140px', minWidth: 120 }}
                    placeholder="Número de cuenta"
                    disabled={!bancoEditable}
                    value={f.banco_numero_cuenta || ''}
                    onChange={(e) => setField('banco_numero_cuenta', e.target.value)}
                    aria-label="Número de cuenta"
                  />
                  <input
                    ref={certInputRef}
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/webp,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) onCertFile(file)
                    }}
                  />
                  <button
                    type="button"
                    style={{ ...S.btnGhost, padding: '4px 8px', whiteSpace: 'nowrap' }}
                    disabled={!bancoEditable || certBusy}
                    title="Adjuntar certificación bancaria"
                    onClick={() => certInputRef.current?.click()}
                  >
                    {certBusy ? 'Procesando…' : 'Adjuntar certificación'}
                  </button>
                  {(f._cert_bancaria_nombre || certNombreVigente) && (
                    <span style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f._cert_bancaria_nombre || certNombreVigente}
                    </span>
                  )}
                </div>
              </td>
            </tr>
            <tr>
              <SheetField label="Salario" labelStyle={lbl} valueStyle={valCell}>
                <input
                  style={{ ...ui.cellInp, textAlign: 'right' }}
                  inputMode="numeric"
                  placeholder="$ 0"
                  value={f.salario ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('salario', formatSalarioInput(e.target.value))}
                />
              </SheetField>
              <SheetField label="Periodicidad" labelStyle={lbl} valueStyle={valCell}>
                <select
                  style={ui.cellSelect}
                  value={f.periodicidad || 'mensual'}
                  disabled={!canEdit}
                  onChange={(e) => setField('periodicidad', e.target.value)}
                >
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                </select>
              </SheetField>
              <SheetField label="Nivel riesgo ARL" labelStyle={lbl} valueStyle={valCell}>
                <select
                  style={ui.cellSelect}
                  value={f.arl_nivel_riesgo || 'I'}
                  disabled={!canEdit}
                  onChange={(e) => setField('arl_nivel_riesgo', e.target.value)}
                >
                  <option value="I">I</option>
                  <option value="II">II</option>
                  <option value="III">III</option>
                  <option value="IV">IV</option>
                  <option value="V">V</option>
                </select>
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Salario liquidable" labelStyle={lbl} valueStyle={valCell}>
                <select
                  style={ui.cellSelect}
                  value={f.salario_liquidable !== false ? 'true' : 'false'}
                  disabled={!canEdit}
                  onChange={(e) => setField('salario_liquidable', e.target.value === 'true')}
                >
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </SheetField>
              <SheetField label="Subsidio transporte" labelStyle={lbl} valueStyle={valCell}>
                <select
                  style={ui.cellSelect}
                  value={f.subsidio_transporte ? 'true' : 'false'}
                  disabled={!canEdit}
                  onChange={(e) => setField('subsidio_transporte', e.target.value === 'true')}
                >
                  <option value="false">No</option>
                  <option value="true">Sí</option>
                </select>
              </SheetField>
              <SheetField label="Fecha ingreso" labelStyle={lbl} valueStyle={valCell}>
                <input
                  type="date"
                  style={ui.cellInp}
                  value={f.fecha_ingreso || ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('fecha_ingreso', e.target.value)}
                />
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Empresa *" labelStyle={lbl} valueStyle={valCell} colSpan={3}>
                <select
                  style={ui.cellSelect}
                  value={empresaKey}
                  disabled={!canEdit}
                  onChange={(e) => onEmpresaChange(e.target.value)}
                >
                  {(empresas || []).map((e) => (
                    <option key={e.key} value={e.key}>{e.label || e.nombre}</option>
                  ))}
                </select>
              </SheetField>
              <SheetField label="NIT" labelStyle={lbl} valueStyle={valCell}>
                <input
                  style={{ ...ui.cellInp, color: ui.textMuted }}
                  value={nitAuto}
                  readOnly
                  tabIndex={-1}
                  placeholder="Autodiligenciado"
                />
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Notas" labelStyle={lbl} valueStyle={valCell} colSpan={5}>
                <AutoTextarea
                  style={ui.cellInp}
                  value={f.notas ?? ''}
                  disabled={!canEdit}
                  placeholder="Observaciones…"
                  onChange={(v) => setField('notas', v)}
                  onBlur={() => {
                    const next = capitalizarOracion(f.notas)
                    if (next !== f.notas) setField('notas', next)
                  }}
                />
              </SheetField>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={ui.sectionTitle}>Fotografía y firma</div>
      <div style={{
        display: 'flex',
        gap: 12,
        alignItems: 'stretch',
        flexWrap: 'wrap',
        border: `1px solid ${tTok.border}`,
        borderRadius: 8,
        padding: 10,
        background: tTok.bgCard || tTok.bg,
        marginBottom: 4,
      }}>
        <FotoTrabajadorCapture
          compact
          previewUrl={f.foto_preview_url || ''}
          disabled={!canEdit}
          themeTokens={tTok}
          titulo="Fotografía del colaborador"
          onFileReady={(file) => {
            const url = URL.createObjectURL(file)
            if (f.foto_preview_url && String(f.foto_preview_url).startsWith('blob:')) {
              try { URL.revokeObjectURL(f.foto_preview_url) } catch { /* ignore */ }
            }
            setMany({ _foto_file: file, foto_preview_url: url })
          }}
          onClear={() => {
            if (f.foto_preview_url && String(f.foto_preview_url).startsWith('blob:')) {
              try { URL.revokeObjectURL(f.foto_preview_url) } catch { /* ignore */ }
            }
            setMany({ _foto_file: null, foto_preview_url: '', _foto_clear: true })
          }}
        />
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <FirmaPad
            value={f.firma_data_url || ''}
            disabled={!canEdit}
            themeTokens={tTok}
            titulo="Firma del colaborador"
            onChange={(dataUrl) => setMany({ firma_data_url: dataUrl, _firma_changed: true })}
          />
        </div>
      </div>
    </div>
  )
}
