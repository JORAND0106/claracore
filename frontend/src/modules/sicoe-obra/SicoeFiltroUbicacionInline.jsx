import PptoFiltroCampo from '../presupuesto/PptoFiltroCampo'
import SicoeFiltroPkMapa from './SicoeFiltroPkMapa'
import { sicoeFiltroDef } from './sicoeFiltroCatalogo'

const lbl = (t) => ({
  fontSize: 'var(--cc-caption)',
  fontWeight: 700,
  color: t.textMuted,
  marginBottom: 4,
  whiteSpace: 'nowrap',
})

const inp = (t) => ({
  background: t.inputBg,
  border: `1px solid ${t.border}`,
  borderRadius: 6,
  padding: '6px 8px',
  color: t.text,
  fontSize: 'var(--cc-sm)',
  width: '100%',
  boxSizing: 'border-box',
  minWidth: 0,
})

/**
 * Ubicación compacta: PK + tramo + calzada + abscisa en pocas líneas.
 */
export default function SicoeFiltroUbicacionInline({
  t,
  token,
  contratoId,
  f,
  onChange,
  opciones,
  pkList,
  catalogHelpers,
}) {
  const defTramo = sicoeFiltroDef('tramo')
  const defCostado = sicoeFiltroDef('costado')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <SicoeFiltroPkMapa
          t={t}
          token={token}
          contratoId={contratoId}
          pkList={pkList}
          pkIdSeleccionado={f.pk_id_id}
          pkLabel={f.pk_label}
          onSeleccionar={({ pk_id_id, pk_label }) => onChange({ pk_id_id, pk_label, pk_id: '' })}
          onLimpiar={() => onChange({ pk_id_id: '', pk_label: '', pk_id: '' })}
          compact
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, 1fr) minmax(120px, 1fr) minmax(88px, 0.9fr) minmax(88px, 0.9fr)',
          gap: 10,
          alignItems: 'end',
        }}
      >
        <div>
          <div style={lbl(t)}>Tramo</div>
          <PptoFiltroCampo def={defTramo} f={f} onChange={onChange} t={t} opciones={opciones} catalogHelpers={catalogHelpers} />
        </div>
        <div>
          <div style={lbl(t)}>Calzada</div>
          <PptoFiltroCampo def={defCostado} f={f} onChange={onChange} t={t} opciones={opciones} catalogHelpers={catalogHelpers} />
        </div>
        <div>
          <div style={lbl(t)}>Abscisa desde</div>
          <input
            type="text"
            placeholder="Desde"
            value={f.absIni || ''}
            onChange={(e) => onChange({ absIni: e.target.value })}
            style={inp(t)}
          />
        </div>
        <div>
          <div style={lbl(t)}>Abscisa hasta</div>
          <input
            type="text"
            placeholder="Hasta"
            value={f.absFin || ''}
            onChange={(e) => onChange({ absFin: e.target.value })}
            style={inp(t)}
          />
        </div>
      </div>
    </div>
  )
}
