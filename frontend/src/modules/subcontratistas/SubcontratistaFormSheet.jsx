import { useState } from 'react'
import { tFrom, isDarkMode } from '../../theme/adminPanelTheme'
import {
  decimalAPuntosPct,
  fmtPctDesdeDecimal,
  puntosPctADecimal,
} from '../../admin/catalogoInsumosTributos'
import DocumentosCorteExcelBlock from './DocumentosCorteExcelBlock'
import PolizasExcelBlock from './PolizasExcelBlock'
import { fmtMoneda } from './subcontratistasDocsHelpers'
import { subcontratistasSheetCssVars, subcontratistasSheetStyles, subUi } from './subcontratistasSheetStyles'

const EMPTY = {
  razon_social: '',
  objeto_contrato: '',
  nit: '',
  nombre_contacto: '',
  telefono: '',
  anticipo: null,
  amortizacion_pct: null,
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
  const amortDecimal = puntosPctADecimal(f.amortizacion_pct)

  const lbl = {
    ...ui.tdLabel,
    background: isDarkMode(theme) ? 'rgba(0,175,197,0.04)' : 'rgba(0,119,182,0.03)',
  }
  const val = {
    ...ui.td,
    overflow: 'hidden',
  }

  return (
    <div style={{ ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)', fontFamily: 'inherit' }}>
      <div style={ui.sectionTitle}>Datos del subcontratista</div>
      <div style={{ ...ui.sheetWrap, maxHeight: 'none', overflowX: 'auto' }}>
        <table style={{ ...ui.sheetTable, tableLayout: 'fixed', minWidth: 640 }}>
          <colgroup>
            {/* Etiquetas más anchas para textos largos (Contacto / Rep. Legal) sin invadir el valor */}
            <col style={{ width: '22%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '30%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={lbl}>Razón Social *</td>
              <td style={val}>
                <input
                  style={ui.cellInp}
                  value={f.razon_social || ''}
                  disabled={!editing}
                  onChange={(e) => set('razon_social', e.target.value)}
                  placeholder="Nombre o razón social"
                />
              </td>
              <td style={lbl}>NIT</td>
              <td style={val}>
                <input
                  style={ui.cellInp}
                  value={f.nit || ''}
                  disabled={!editing}
                  onChange={(e) => set('nit', e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Solo números"
                />
              </td>
            </tr>
            <tr>
              <td style={lbl}>Objeto del Contrato</td>
              <td style={val} colSpan={3}>
                <textarea
                  style={{ ...ui.cellInp, height: 'auto', minHeight: 56, resize: 'vertical', padding: 6 }}
                  value={f.objeto_contrato || ''}
                  disabled={!editing}
                  onChange={(e) => set('objeto_contrato', e.target.value)}
                  placeholder="Descripción del objeto contractual…"
                />
              </td>
            </tr>
            <tr>
              <td style={lbl}>Nombre del Contacto / Rep. Legal</td>
              <td style={val}>
                <input
                  style={ui.cellInp}
                  value={f.nombre_contacto || ''}
                  disabled={!editing}
                  onChange={(e) => set('nombre_contacto', e.target.value)}
                  placeholder="Nombre completo"
                />
              </td>
              <td style={lbl}>Teléfono de Contacto</td>
              <td style={val}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, width: '100%' }}>
                  <input
                    style={{ ...ui.cellInp, flex: '1 1 auto', minWidth: 0 }}
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
                        flex: '0 0 auto',
                        background: '#25D366',
                        borderRadius: 8,
                        padding: '6px 10px',
                        color: '#fff',
                        fontSize: 'var(--cc-sm)',
                        lineHeight: 1.3,
                        fontWeight: 700,
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        fontFamily: 'inherit',
                        opacity: waHover ? 0.92 : 1,
                      }}
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </td>
            </tr>
            <tr>
              <td style={lbl}>Anticipo</td>
              <td style={val}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }}>
                  <input
                    style={{ ...ui.cellInp, flex: '1 1 auto', minWidth: 0, textAlign: 'right' }}
                    type="number"
                    min="0"
                    step="any"
                    disabled={!editing}
                    value={f.anticipo != null && f.anticipo !== '' ? f.anticipo : ''}
                    placeholder="0"
                    title="Valor en COP"
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '') set('anticipo', null)
                      else {
                        const n = Number(String(v).replace(',', '.'))
                        set('anticipo', Number.isFinite(n) ? n : null)
                      }
                    }}
                  />
                  <span style={{
                    flex: '0 0 auto',
                    minWidth: 72,
                    textAlign: 'right',
                    fontSize: 'var(--cc-caption)',
                    color: tTok.textMuted,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                  >
                    {fmtMoneda(f.anticipo)}
                  </span>
                </div>
              </td>
              <td style={lbl}>% de Amortización</td>
              <td style={val}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }}>
                  <input
                    style={{ ...ui.cellInp, flex: '1 1 auto', minWidth: 0, textAlign: 'right' }}
                    type="number"
                    min="0"
                    max="1"
                    step="any"
                    inputMode="decimal"
                    disabled={!editing}
                    value={amortDecimal}
                    placeholder="0.05"
                    title="Decimal (0.05 = 5%)"
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '') set('amortizacion_pct', null)
                      else set('amortizacion_pct', decimalAPuntosPct(v))
                    }}
                  />
                  <span style={{
                    flex: '0 0 auto',
                    minWidth: 52,
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: 'var(--cc-sm)',
                    color: tTok.primary,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                  title="Equivalente %"
                  >
                    {fmtPctDesdeDecimal(amortDecimal)}
                  </span>
                </div>
              </td>
            </tr>
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
