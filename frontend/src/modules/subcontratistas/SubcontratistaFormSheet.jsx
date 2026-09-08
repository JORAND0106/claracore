import { useState } from 'react'
import { tFrom, isDarkMode } from '../../theme/adminPanelTheme'
import DocumentosCorteExcelBlock from './DocumentosCorteExcelBlock'
import PolizasExcelBlock from './PolizasExcelBlock'
import { subcontratistasSheetCssVars, subcontratistasSheetStyles, subUi } from './subcontratistasSheetStyles'

const EMPTY = {
  razon_social: '',
  objeto_contrato: '',
  nit: '',
  nombre_contacto: '',
  telefono: '',
}

/**
 * Hoja Excel de datos del subcontratista + bloques Pólizas / Documentos Contractuales.
 * Seguridad Social no se muestra aquí (va en cada corte).
 */
export default function SubcontratistaFormSheet({
  theme,
  token,
  mode = 'create', // create | edit
  form,
  onChange,
  canEdit = true,
  canEditDocs,
  subId = null,
  stagedPolizas,
  onStagedPolizas,
  stagedDocs,
  onStagedDocs,
  onMsg,
  readOnlyHint = false,
}) {
  const tTok = tFrom(theme)
  const ui = subcontratistasSheetStyles(tTok)
  const S = subUi(theme, tTok)
  const cssVars = subcontratistasSheetCssVars(tTok)
  const f = form || EMPTY
  const editing = canEdit && !readOnlyHint
  const docsEditable = canEditDocs != null ? !!canEditDocs : editing
  const [waHover, setWaHover] = useState(false)

  const set = (key, val) => onChange?.({ ...f, [key]: val })

  const telClean = (f.telefono || '').replace(/[^0-9]/g, '')

  const datosRows = [
    { key: 'razon_social', label: 'Razón Social *', kind: 'text', required: true },
    { key: 'nit', label: 'NIT', kind: 'nit' },
    { key: 'objeto_contrato', label: 'Objeto del Contrato', kind: 'textarea' },
    { key: 'nombre_contacto', label: 'Nombre del Contacto / Rep. Legal', kind: 'text' },
    { key: 'telefono', label: 'Teléfono de Contacto', kind: 'tel' },
  ]

  return (
    <div style={{ ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)', fontFamily: 'inherit' }}>
      <div style={ui.sectionTitle}>Datos del subcontratista</div>
      <div style={{ ...ui.sheetWrap, maxHeight: 'none' }}>
        <table style={{ ...ui.sheetTable, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '28%' }} />
            <col style={{ width: '72%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={ui.th}>Campo</th>
              <th style={ui.th}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {datosRows.map((row) => (
              <tr key={row.key}>
                <td style={{
                  ...ui.td,
                  fontWeight: 700,
                  color: tTok.textMuted,
                  background: isDarkMode(theme) ? 'rgba(0,175,197,0.04)' : 'rgba(0,119,182,0.03)',
                }}
                >
                  {row.label}
                </td>
                <td style={ui.td}>
                  {row.kind === 'textarea' ? (
                    <textarea
                      style={{ ...ui.cellInp, height: 'auto', minHeight: 56, resize: 'vertical', padding: 6 }}
                      value={f[row.key] || ''}
                      disabled={!editing}
                      onChange={(e) => set(row.key, e.target.value)}
                      placeholder={row.key === 'objeto_contrato' ? 'Descripción del objeto contractual…' : ''}
                    />
                  ) : row.kind === 'tel' ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        style={{ ...ui.cellInp, flex: 1 }}
                        value={f.telefono || ''}
                        disabled={!editing}
                        onChange={(e) => set('telefono', e.target.value.replace(/[^0-9+\-\s]/g, ''))}
                        placeholder="Número de teléfono"
                      />
                      {telClean && (
                        <a
                          href={`https://wa.me/${telClean}`}
                          target="_blank"
                          rel="noreferrer"
                          onMouseEnter={() => setWaHover(true)}
                          onMouseLeave={() => setWaHover(false)}
                          style={{
                            background: '#25D366',
                            borderRadius: 8,
                            padding: '6px 12px',
                            color: '#fff',
                            fontSize: 'var(--cc-caption)',
                            fontWeight: 700,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                            opacity: waHover ? 0.92 : 1,
                          }}
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  ) : (
                    <input
                      style={ui.cellInp}
                      value={f[row.key] || ''}
                      disabled={!editing}
                      onChange={(e) => {
                        let v = e.target.value
                        if (row.kind === 'nit') v = v.replace(/[^0-9]/g, '')
                        set(row.key, v)
                      }}
                      placeholder={row.key === 'razon_social' ? 'Nombre o razón social' : row.kind === 'nit' ? 'Solo números' : ''}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode === 'create' && (
        <div style={{ ...S.alert('warn'), marginTop: 12, fontSize: 'var(--cc-caption)' }}>
          Puede agregar pólizas y documentos contractuales aquí; se subirán después de crear.
          El pago de Seguridad Social se registra en cada corte.
        </div>
      )}

      <PolizasExcelBlock
        theme={theme}
        token={token}
        subId={subId}
        canEdit={docsEditable}
        mode={mode === 'create' ? 'stage' : 'live'}
        stagedRows={stagedPolizas}
        onStagedChange={onStagedPolizas}
        onMsg={onMsg}
      />

      <DocumentosCorteExcelBlock
        theme={theme}
        token={token}
        subId={subId}
        canEdit={docsEditable}
        mode={mode === 'create' ? 'stage' : 'live'}
        stagedRows={stagedDocs}
        onStagedChange={onStagedDocs}
        onMsg={onMsg}
      />
    </div>
  )
}

export { EMPTY as EMPTY_SUBCONTRATISTA_FORM }
