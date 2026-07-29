/**
 * Pestaña admin: columnas visibles SicoeObra / Presupuesto por contrato.
 */
import {
  PRESUPUESTO_COLUMNAS,
  SICOE_OBRA_COLUMNAS,
  mergeGrillasUiConfig,
  patchColumnVisible,
} from '../utils/grillasUiConfig'

function ModuloBlock({ titulo, hint, modulo, catalog, config, setConfig, ui, font, disabled }) {
  const merged = mergeGrillasUiConfig(config)
  const cols = merged[modulo]?.columns || []
  const byId = new Map(cols.map((c) => [c.id, c]))

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: font.body, fontWeight: 700, color: ui.primary, marginBottom: 4 }}>{titulo}</div>
      <div style={{ fontSize: font.caption, color: ui.textMuted, marginBottom: 10, lineHeight: 1.4 }}>{hint}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {catalog.map((meta) => {
          const cfg = byId.get(meta.id) || { visible: true }
          const locked = !!meta.locked
          return (
            <label
              key={meta.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${ui.border}`,
                background: ui.inputBg,
                opacity: locked ? 0.75 : 1,
                cursor: locked || disabled ? 'default' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={locked ? true : cfg.visible !== false}
                disabled={locked || disabled}
                onChange={(e) => {
                  if (locked || disabled) return
                  setConfig(patchColumnVisible(config, modulo, meta.id, e.target.checked))
                }}
              />
              <span style={{ flex: 1, fontSize: font.sm, color: ui.text, fontWeight: 600 }}>{meta.label}</span>
              <span style={{ fontSize: font.caption, color: ui.textMuted }}>
                {locked ? 'Obligatoria' : meta.id}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export default function ContratoGrillasUiTab({ form, setForm, ui, font, disabled }) {
  const config = mergeGrillasUiConfig(form?.grillas_ui_config)
  const setConfig = (next) => setForm((f) => ({ ...f, grillas_ui_config: next }))

  return (
    <div>
      <div style={{ fontSize: font.body, fontWeight: 700, color: ui.primary, marginBottom: 8 }}>
        Columnas de grilla por módulo
      </div>
      <div style={{ fontSize: font.caption, color: ui.textMuted, lineHeight: 1.45, marginBottom: 16 }}>
        Define qué columnas ve todo el mundo en este contrato. SicoeObra y Presupuesto se configuran por separado.
        Los anchos también se pueden ajustar arrastrando el borde de cada columna en la grilla (se guardan aquí).
      </div>
      <ModuloBlock
        titulo="SicoeObra"
        hint="Grilla de reportes. Oculte p. ej. Costado en contratos de calzada sencilla."
        modulo="sicoe_obra"
        catalog={SICOE_OBRA_COLUMNAS}
        config={config}
        setConfig={setConfig}
        ui={ui}
        font={font}
        disabled={disabled}
      />
      <ModuloBlock
        titulo="Presupuesto"
        hint="Tabla principal de ítems / ID_POL."
        modulo="presupuesto"
        catalog={PRESUPUESTO_COLUMNAS}
        config={config}
        setConfig={setConfig}
        ui={ui}
        font={font}
        disabled={disabled}
      />
    </div>
  )
}
