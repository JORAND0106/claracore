import { isDarkMode, tFrom } from '../../theme/adminPanelTheme'
import { rrhhSheetCssVars, rrhhSheetStyles } from './rrhhSheetStyles'

/**
 * Formulario hoja de cálculo — registro / edición de trabajador.
 */
export default function TrabajadorFormSheet({
  theme,
  form,
  onChange,
  canEdit = true,
  empresas = [],
  tiposContrato = [],
}) {
  const tTok = tFrom(theme)
  const ui = rrhhSheetStyles(tTok)
  const cssVars = rrhhSheetCssVars(tTok)
  const f = form || {}
  const set = (key, val) => onChange?.({ ...f, [key]: val })

  const lbl = {
    ...ui.tdLabel,
    background: isDarkMode(theme) ? 'rgba(0,175,197,0.04)' : 'rgba(0,119,182,0.03)',
  }
  const val = { ...ui.td, overflow: 'hidden' }

  const Field = ({ label, children }) => (
    <>
      <td style={lbl}>{label}</td>
      <td style={val}>{children}</td>
    </>
  )

  const inp = (key, props = {}) => (
    <input
      style={ui.cellInp}
      value={f[key] ?? ''}
      disabled={!canEdit}
      onChange={(e) => set(key, e.target.value)}
      {...props}
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
              <Field label="Nombres *">{inp('nombres')}</Field>
              <Field label="Apellidos *">{inp('apellidos')}</Field>
            </tr>
            <tr>
              <Field label="Tipo documento *">
                <select
                  style={ui.cellSelect}
                  value={f.tipo_documento || 'CC'}
                  disabled={!canEdit}
                  onChange={(e) => set('tipo_documento', e.target.value)}
                >
                  {['CC', 'CE', 'TI', 'PA', 'OTRO'].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Número documento *">{inp('numero_documento')}</Field>
            </tr>
            <tr>
              <Field label="Fecha nacimiento">{inp('fecha_nacimiento', { type: 'date' })}</Field>
              <Field label="Género">
                <select
                  style={ui.cellSelect}
                  value={f.genero || ''}
                  disabled={!canEdit}
                  onChange={(e) => set('genero', e.target.value)}
                >
                  <option value="">—</option>
                  <option value="F">Femenino</option>
                  <option value="M">Masculino</option>
                  <option value="O">Otro</option>
                </select>
              </Field>
            </tr>
            <tr>
              <Field label="Dirección">{inp('direccion')}</Field>
              <Field label="Ciudad">{inp('ciudad')}</Field>
            </tr>
            <tr>
              <Field label="Teléfono">{inp('telefono')}</Field>
              <Field label="Correo">{inp('email', { type: 'email' })}</Field>
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
              <Field label="Nombre">{inp('emergencia_nombre')}</Field>
              <Field label="Parentesco">{inp('emergencia_parentesco')}</Field>
            </tr>
            <tr>
              <Field label="Teléfono">{inp('emergencia_telefono')}</Field>
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
              <Field label="EPS">{inp('eps')}</Field>
              <Field label="Pensión">{inp('pension')}</Field>
            </tr>
            <tr>
              <Field label="Cesantías">{inp('cesantias')}</Field>
              <Field label="ARL">{inp('arl')}</Field>
            </tr>
            <tr>
              <Field label="Caja de compensación">{inp('caja_compensacion')}</Field>
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
              <Field label="Cargo al que aspira">{inp('cargo_aspira')}</Field>
              <Field label="Salario">{inp('salario', { inputMode: 'decimal', placeholder: 'COP' })}</Field>
            </tr>
            <tr>
              <Field label="Subsidio de transporte">
                <select
                  style={ui.cellSelect}
                  value={f.subsidio_transporte ? 'true' : 'false'}
                  disabled={!canEdit}
                  onChange={(e) => set('subsidio_transporte', e.target.value === 'true')}
                >
                  <option value="false">No</option>
                  <option value="true">Sí</option>
                </select>
              </Field>
              <Field label="Tipo de contrato">
                <select
                  style={ui.cellSelect}
                  value={f.tipo_contrato_id || ''}
                  disabled={!canEdit}
                  onChange={(e) => set('tipo_contrato_id', e.target.value)}
                >
                  <option value="">— Seleccione —</option>
                  {tiposContrato.filter((t) => t.activo !== false).map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </Field>
            </tr>
            <tr>
              <Field label="Empresa contratante *">
                <select
                  style={ui.cellSelect}
                  value={f.empresa_tipo || 'consorcio'}
                  disabled={!canEdit}
                  onChange={(e) => onChange?.({
                    ...f,
                    empresa_tipo: e.target.value,
                    empresa_subcontratista_id: e.target.value === 'subcontratista' ? f.empresa_subcontratista_id : '',
                  })}
                >
                  <option value="consorcio">Consorcio / Contratista principal</option>
                  <option value="subcontratista">Subcontratista</option>
                </select>
              </Field>
              <Field label={f.empresa_tipo === 'subcontratista' ? 'Subcontratista *' : 'Razón social'}>
                {f.empresa_tipo === 'subcontratista' ? (
                  <select
                    style={ui.cellSelect}
                    value={f.empresa_subcontratista_id || ''}
                    disabled={!canEdit}
                    onChange={(e) => set('empresa_subcontratista_id', e.target.value)}
                  >
                    <option value="">— Seleccione —</option>
                    {(empresas || [])
                      .filter((e) => e.tipo === 'subcontratista')
                      .map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
                      ))}
                  </select>
                ) : (
                  <span style={{ padding: '4px', color: ui.textMuted }}>
                    {(empresas || []).find((e) => e.tipo === 'consorcio')?.nombre || 'Consorcio / Contratista principal'}
                  </span>
                )}
              </Field>
            </tr>
            <tr>
              <Field label="Estado">
                <select
                  style={ui.cellSelect}
                  value={f.estado || 'activo'}
                  disabled={!canEdit}
                  onChange={(e) => set('estado', e.target.value)}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="retirado">Retirado</option>
                </select>
              </Field>
              <Field label="Notas">{inp('notas')}</Field>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
