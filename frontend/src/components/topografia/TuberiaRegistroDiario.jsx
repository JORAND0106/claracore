import { useEffect, useState } from 'react'
import FirmaDigital from './FirmaDigital'
import { btnPrimary, card, inputStyle, PermisoAviso, puede, useTopografiaApi } from './topografiaShared'

export default function TuberiaRegistroDiario({ contratoId, token, tuberia, permisos }) {
  const { api } = useTopografiaApi(contratoId, token)
  const [puntos, setPuntos] = useState([])
  const [registro, setRegistro] = useState(null)
  const [tubos, setTubos] = useState([])
  const [formReg, setFormReg] = useState({ fecha: new Date().toISOString().slice(0, 10), bm_referencia_id: '', altura_instrumento: '', operador: '' })
  const [formTubo, setFormTubo] = useState({ numero_tubo: 1, abscisa_inicio: '', abscisa_fin: '', cota_diseno_inicio: '', cota_diseno_fin: '', lectura_mira_inicio: '', lectura_mira_fin: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    api('/puntos/verificados').then(setPuntos).catch(() => {})
  }, [api])

  if (!tuberia?.id) {
    return <div style={card}>Seleccione un tramo de tuberia.</div>
  }

  const crearRegistro = async () => {
    try {
      const row = await api(`/tuberias/${tuberia.id}/registros`, { method: 'POST', body: JSON.stringify(formReg) })
      setRegistro(row)
    } catch (e) { setError(e.message) }
  }

  const agregarTubo = async () => {
    if (!registro?.id) return
    const row = await api(`/tuberias/${tuberia.id}/registros/${registro.id}/tubos`, {
      method: 'POST',
      body: JSON.stringify({
        ...formTubo,
        numero_tubo: Number(formTubo.numero_tubo),
        abscisa_inicio: Number(formTubo.abscisa_inicio),
        abscisa_fin: Number(formTubo.abscisa_fin),
        cota_diseno_inicio: formTubo.cota_diseno_inicio === '' ? null : Number(formTubo.cota_diseno_inicio),
        cota_diseno_fin: formTubo.cota_diseno_fin === '' ? null : Number(formTubo.cota_diseno_fin),
        lectura_mira_inicio: formTubo.lectura_mira_inicio === '' ? null : Number(formTubo.lectura_mira_inicio),
        lectura_mira_fin: formTubo.lectura_mira_fin === '' ? null : Number(formTubo.lectura_mira_fin),
      }),
    })
    setTubos([...tubos, row])
    setFormTubo({ ...formTubo, numero_tubo: Number(formTubo.numero_tubo) + 1 })
  }

  return (
    <div>
      {error && <div style={{ color: '#dc2626', marginBottom: 8 }}>{error}</div>}
      <PermisoAviso permisos={permisos} accion="crear">
      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Registro diario — {tuberia.nombre}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
          <input type="date" value={formReg.fecha} onChange={(e) => setFormReg({ ...formReg, fecha: e.target.value })} style={inputStyle} />
          <select value={formReg.bm_referencia_id} onChange={(e) => setFormReg({ ...formReg, bm_referencia_id: e.target.value })} style={inputStyle}>
            <option value="">BM referencia</option>
            {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input placeholder="Altura instrumento" value={formReg.altura_instrumento} onChange={(e) => setFormReg({ ...formReg, altura_instrumento: e.target.value })} style={inputStyle} />
          <input placeholder="Operador" value={formReg.operador} onChange={(e) => setFormReg({ ...formReg, operador: e.target.value })} style={inputStyle} />
        </div>
        <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={crearRegistro}>Iniciar registro del dia</button>
      </div>
      </PermisoAviso>

      {registro && (
        <div style={card}>
          <h4>Instalar tubo</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
            <input placeholder="# Tubo" value={formTubo.numero_tubo} onChange={(e) => setFormTubo({ ...formTubo, numero_tubo: e.target.value })} style={inputStyle} />
            <input placeholder="Abscisa ini" value={formTubo.abscisa_inicio} onChange={(e) => setFormTubo({ ...formTubo, abscisa_inicio: e.target.value })} style={inputStyle} />
            <input placeholder="Abscisa fin" value={formTubo.abscisa_fin} onChange={(e) => setFormTubo({ ...formTubo, abscisa_fin: e.target.value })} style={inputStyle} />
            <input placeholder="Lectura ini" value={formTubo.lectura_mira_inicio} onChange={(e) => setFormTubo({ ...formTubo, lectura_mira_inicio: e.target.value })} style={inputStyle} />
            <input placeholder="Lectura fin" value={formTubo.lectura_mira_fin} onChange={(e) => setFormTubo({ ...formTubo, lectura_mira_fin: e.target.value })} style={inputStyle} />
            <input placeholder="Cota diseno ini" value={formTubo.cota_diseno_inicio} onChange={(e) => setFormTubo({ ...formTubo, cota_diseno_inicio: e.target.value })} style={inputStyle} />
            <input placeholder="Cota diseno fin" value={formTubo.cota_diseno_fin} onChange={(e) => setFormTubo({ ...formTubo, cota_diseno_fin: e.target.value })} style={inputStyle} />
          </div>
          <PermisoAviso permisos={permisos} accion="editar">
          <button type="button" style={{ ...btnPrimary, marginTop: 8 }} onClick={agregarTubo}>Registrar tubo</button>
          </PermisoAviso>
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#f1f5f9' }}><th>#</th><th>Abscisa</th><th>Cota campo</th><th>Delta</th><th>OK</th></tr></thead>
            <tbody>
              {tubos.map((t) => (
                <tr key={t.id}><td>{t.numero_tubo}</td><td>{t.abscisa_inicio}-{t.abscisa_fin}</td><td>{t.cota_campo_inicio}</td><td>{t.delta_inicio}</td><td>{t.dentro_tolerancia ? 'SI' : 'NO'}</td></tr>
              ))}
            </tbody>
          </table>
          <PermisoAviso permisos={permisos} accion="editar">
          <div style={{ marginTop: 12 }}>
            <FirmaDigital onConfirm={(f) => api(`/tuberias/${tuberia.id}/firma`, { method: 'POST', body: JSON.stringify({ nombre_firmante: 'Topografo', firma_base64: f }) })} />
          </div>
          </PermisoAviso>
        </div>
      )}
    </div>
  )
}
