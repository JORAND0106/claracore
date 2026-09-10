import { useEffect, useRef } from 'react'
import { isDarkMode, tFrom } from '../../theme/adminPanelTheme'
import CatalogSelect from './CatalogSelect'
import { rrhhSheetCssVars, rrhhSheetStyles } from './rrhhSheetStyles'

/** Celda etiqueta + valor — definida fuera para no remountar inputs en cada tecla. */
function SheetField({ label, labelStyle, valueStyle, children, colSpan = 1 }) {
  return (
    <>
      <td style={labelStyle}>{label}</td>
      <td style={valueStyle} colSpan={colSpan}>{children}</td>
    </>
  )
}

function AutoTextarea({ value, onChange, disabled, style, placeholder }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(56, el.scrollHeight)}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      style={{
        ...style,
        resize: 'none',
        overflow: 'hidden',
        minHeight: 56,
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
      }}
      value={value ?? ''}
      disabled={disabled}
      placeholder={placeholder}
      rows={2}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
}

/**
 * Formulario hoja de cálculo — registro / edición de trabajador.
 * Inputs estables (sin componentes recreados) para digitación continua.
 */
export default function TrabajadorFormSheet({
  theme,
  form,
  onChange,
  canEdit = true,
  empresas = [],
  catalogo = {},
  onAddCatalogValue,
}) {
  const tTok = tFrom(theme)
  const ui = rrhhSheetStyles(tTok)
  const cssVars = rrhhSheetCssVars(tTok)
  const f = form || {}

  const setField = (key, val) => {
    onChange?.({ ...f, [key]: val })
  }

  const lbl = {
    ...ui.tdLabel,
    background: isDarkMode(theme) ? 'rgba(0,175,197,0.04)' : 'rgba(0,119,182,0.03)',
  }
  const val = { ...ui.td, overflow: 'hidden' }

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
      onChange?.({ ...f, empresa_key: key })
      return
    }
    onChange?.({
      ...f,
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
      onAddNew={async (v) => {
        await onAddCatalogValue?.(categoria, v)
      }}
    />
  )

  return (
    <div style={{ ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)', fontFamily: 'inherit' }}>
      <div style={ui.sectionTitle}>Datos personales</div>
      <div style={{ ...ui.sheetWrap, maxHeight: 'none', overflowX: 'auto', marginBottom: 14 }}>
        <table style={{ ...ui.sheetTable, minWidth: 640 }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '28%' }} />
          </colgroup>
          <tbody>
            <tr>
              <SheetField label="Nombres *" labelStyle={lbl} valueStyle={val}>
                <input
                  style={ui.cellInp}
                  value={f.nombres ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('nombres', e.target.value)}
                />
              </SheetField>
              <SheetField label="Apellidos *" labelStyle={lbl} valueStyle={val}>
                <input
                  style={ui.cellInp}
                  value={f.apellidos ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('apellidos', e.target.value)}
                />
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Tipo documento *" labelStyle={lbl} valueStyle={val}>
                <select
                  style={ui.cellSelect}
                  value={f.tipo_documento || 'CC'}
                  disabled={!canEdit}
                  onChange={(e) => setField('tipo_documento', e.target.value)}
                >
                  {['CC', 'CE', 'TI', 'PA', 'OTRO'].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </SheetField>
              <SheetField label="Número documento *" labelStyle={lbl} valueStyle={val}>
                <input
                  style={ui.cellInp}
                  value={f.numero_documento ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('numero_documento', e.target.value)}
                />
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Fecha nacimiento" labelStyle={lbl} valueStyle={val}>
                <input
                  type="date"
                  style={ui.cellInp}
                  value={f.fecha_nacimiento ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('fecha_nacimiento', e.target.value)}
                />
              </SheetField>
              <SheetField label="Género" labelStyle={lbl} valueStyle={val}>
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
              <SheetField label="Dirección" labelStyle={lbl} valueStyle={val}>
                <input
                  style={ui.cellInp}
                  value={f.direccion ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('direccion', e.target.value)}
                />
              </SheetField>
              <SheetField label="Ciudad" labelStyle={lbl} valueStyle={val}>
                <input
                  style={ui.cellInp}
                  value={f.ciudad ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('ciudad', e.target.value)}
                />
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Teléfono" labelStyle={lbl} valueStyle={val}>
                <input
                  style={ui.cellInp}
                  value={f.telefono ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('telefono', e.target.value)}
                />
              </SheetField>
              <SheetField label="Correo" labelStyle={lbl} valueStyle={val}>
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
      <div style={{ ...ui.sheetWrap, maxHeight: 'none', overflowX: 'auto', marginBottom: 14 }}>
        <table style={{ ...ui.sheetTable, minWidth: 640 }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '28%' }} />
          </colgroup>
          <tbody>
            <tr>
              <SheetField label="Nombre" labelStyle={lbl} valueStyle={val}>
                <input
                  style={ui.cellInp}
                  value={f.emergencia_nombre ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('emergencia_nombre', e.target.value)}
                />
              </SheetField>
              <SheetField label="Parentesco" labelStyle={lbl} valueStyle={val}>
                <input
                  style={ui.cellInp}
                  value={f.emergencia_parentesco ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('emergencia_parentesco', e.target.value)}
                />
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Teléfono" labelStyle={lbl} valueStyle={val}>
                <input
                  style={ui.cellInp}
                  value={f.emergencia_telefono ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('emergencia_telefono', e.target.value)}
                />
              </SheetField>
              <td style={lbl} /><td style={val} />
            </tr>
          </tbody>
        </table>
      </div>

      <div style={ui.sectionTitle}>Afiliaciones a seguridad social</div>
      <div style={{ ...ui.sheetWrap, maxHeight: 'none', overflowX: 'auto', marginBottom: 14 }}>
        <table style={{ ...ui.sheetTable, minWidth: 640 }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '28%' }} />
          </colgroup>
          <tbody>
            <tr>
              <SheetField label="EPS" labelStyle={lbl} valueStyle={val}>
                {catSelect('eps', 'eps')}
              </SheetField>
              <SheetField label="Pensión" labelStyle={lbl} valueStyle={val}>
                {catSelect('pension', 'pension')}
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Cesantías" labelStyle={lbl} valueStyle={val}>
                {catSelect('cesantias', 'cesantias')}
              </SheetField>
              <SheetField label="ARL" labelStyle={lbl} valueStyle={val}>
                {catSelect('arl', 'arl')}
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Caja de compensación" labelStyle={lbl} valueStyle={val}>
                {catSelect('caja_compensacion', 'caja_compensacion')}
              </SheetField>
              <td style={lbl} /><td style={val} />
            </tr>
          </tbody>
        </table>
      </div>

      <div style={ui.sectionTitle}>Condiciones laborales y empresa contratante</div>
      <div style={{ ...ui.sheetWrap, maxHeight: 'none', overflowX: 'auto' }}>
        <table style={{ ...ui.sheetTable, minWidth: 640 }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '28%' }} />
          </colgroup>
          <tbody>
            <tr>
              <SheetField label="Cargo" labelStyle={lbl} valueStyle={val}>
                {catSelect('cargo_aspira', 'cargo')}
              </SheetField>
              <SheetField label="Salario" labelStyle={lbl} valueStyle={val}>
                <input
                  style={ui.cellInp}
                  inputMode="decimal"
                  placeholder="COP"
                  value={f.salario ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => setField('salario', e.target.value)}
                />
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Subsidio de transporte" labelStyle={lbl} valueStyle={val}>
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
              <SheetField label="Tipo de contrato" labelStyle={lbl} valueStyle={val}>
                {catSelect('tipo_contrato', 'tipo_contrato')}
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Empresa contratante *" labelStyle={lbl} valueStyle={val}>
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
              <SheetField label="NIT" labelStyle={lbl} valueStyle={val}>
                <input
                  style={{ ...ui.cellInp, color: ui.textMuted }}
                  value={nitAuto}
                  readOnly
                  tabIndex={-1}
                  placeholder="Se completa al elegir la empresa"
                />
              </SheetField>
            </tr>
            <tr>
              <SheetField label="Estado" labelStyle={lbl} valueStyle={val}>
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
              <td style={lbl} /><td style={val} />
            </tr>
            <tr>
              <SheetField label="Notas" labelStyle={lbl} valueStyle={val} colSpan={3}>
                <AutoTextarea
                  style={ui.cellInp}
                  value={f.notas ?? ''}
                  disabled={!canEdit}
                  placeholder="Observaciones…"
                  onChange={(v) => setField('notas', v)}
                />
              </SheetField>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
