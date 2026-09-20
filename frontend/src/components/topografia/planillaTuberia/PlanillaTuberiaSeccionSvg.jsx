/**
 * SVG tipado de sección típica (datos del motor backend).
 * ALCANTARILLA: relleno + cama/triturado + tubo con pared (SeccionTub).
 * FILTRO: excavación llena de triturado y tubo cerca del fondo (SeccionFil).
 */
import seccionAlcantarillaPng from './media/seccion_alcantarilla.png'
import seccionFiltroPng from './media/seccion_filtro.png'

export default function PlanillaTuberiaSeccionSvg({ seccionTipica, ui }) {
  const st = seccionTipica || {}
  const tipo = String(st.tipo || 'ALCANTARILLA').toUpperCase()
  const esFiltro = tipo === 'FILTRO'
  const png = esFiltro ? seccionFiltroPng : seccionAlcantarillaPng
  const titulo = esFiltro ? 'Sección Filtro' : 'Sección Típica Tubería'

  const B = Math.max(Number(st.ancho_excavacion_m) || 1.2, 0.4)
  const D = Math.max(Number(st.diametro_externo_m) || 0.6, 0.2)
  const hRel = Math.max(Number(st.altura_relleno_m) || 0.2, 0.05)
  const hExc = Math.max(Number(st.prom_altura_excavacion) || B, 0.5)
  const cama = Math.max(Number(st.cama_triturado_m) || 0, 0)
  const hTrit = Math.max(Number(st.prom_altura_triturado) || hRel + cama, 0.05)

  return (
    <div style={{ border: `1px solid ${ui?.border || '#cbd5e1'}`, borderRadius: 8, padding: 8, background: ui?.cardBg || '#fff' }}>
      <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, marginBottom: 4, color: ui?.textMuted || '#64748b' }}>
        {titulo} — {tipo}
      </div>
      <img
        src={png}
        alt={titulo}
        style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block', margin: '0 auto' }}
      />
      <div style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginTop: 6 }}>
        {`B=${B.toFixed(2)} m · Øext=${D.toFixed(3)} m · h_exc=${hExc.toFixed(2)} m`}
        {esFiltro
          ? ` · Alt Tritur.=${hTrit.toFixed(3)} m`
          : ` · h_atr=${hRel.toFixed(3)} m (${st.relacion_atraque || ''})`}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>
        {`A1=${Number(st.area_1_m2 || 0).toFixed(4)} m² · A2=${Number(st.area_2_m2 || 0).toFixed(4)} m²`}
      </div>
    </div>
  )
}
