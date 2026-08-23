import { useEffect, useMemo, useState } from 'react'
import FirmaDigital from './FirmaDigital'
import TopoExcelSheet from './TopoExcelSheet'
import { topoSheetStyles } from './topoSheetStyles'
import { PermisoAviso, puede, useTopografiaApi, useTopoTheme } from './topografiaShared'

export default function TuberiaRegistroDiario({ contratoId, token, tuberia, permisos }) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
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
    return <div style={ui.card}>Seleccione un tramo de tuberia.</div>
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
      <div style={{ ...ui.card, marginBottom: 16 }}>
        <TopoExcelSheet
          sheet={sheet}
          title={`Registro diario — ${tuberia.nombre}`}
          minWidth={520}
          columns={[
            { key: 'fecha', label: 'Fecha', width: '22%' },
            { key: 'bm', label: 'BM referencia', width: '28%' },
            { key: 'hi', label: 'Altura instrumento', width: '25%' },
            { key: 'op', label: 'Operador', width: '25%' },
          ]}
          cells={[
            <input key="f" type="date" value={formReg.fecha} onChange={(e) => setFormReg({ ...formReg, fecha: e.target.value })} style={sheet.cellInp} />,
            <select key="b" value={formReg.bm_referencia_id} onChange={(e) => setFormReg({ ...formReg, bm_referencia_id: e.target.value })} style={sheet.cellSelect}>
              <option value="">BM referencia</option>
              {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>,
            <input key="h" placeholder="Altura instrumento" value={formReg.altura_instrumento} onChange={(e) => setFormReg({ ...formReg, altura_instrumento: e.target.value })} style={sheet.cellInp} />,
            <input key="o" placeholder="Operador" value={formReg.operador} onChange={(e) => setFormReg({ ...formReg, operador: e.target.value })} style={sheet.cellInp} />,
          ]}
        />
        <button type="button" style={{ ...ui.btnPrimary, marginTop: 4 }} onClick={crearRegistro}>Iniciar registro del dia</button>
      </div>
      </PermisoAviso>

      {registro && (
        <div style={ui.card}>
          <TopoExcelSheet
            sheet={sheet}
            title="Instalar tubo"
            minWidth={720}
            columns={[
              { key: 'num', label: '# Tubo', width: '10%' },
              { key: 'ai', label: 'Abscisa ini', width: '13%' },
              { key: 'af', label: 'Abscisa fin', width: '13%' },
              { key: 'li', label: 'Lectura ini', width: '13%' },
              { key: 'lf', label: 'Lectura fin', width: '13%' },
              { key: 'ci', label: 'Cota dis. ini', width: '14%' },
              { key: 'cf', label: 'Cota dis. fin', width: '14%' },
            ]}
            cells={[
              <input key="n" value={formTubo.numero_tubo} onChange={(e) => setFormTubo({ ...formTubo, numero_tubo: e.target.value })} style={sheet.cellInp} />,
              <input key="ai" value={formTubo.abscisa_inicio} onChange={(e) => setFormTubo({ ...formTubo, abscisa_inicio: e.target.value })} style={sheet.cellInp} />,
              <input key="af" value={formTubo.abscisa_fin} onChange={(e) => setFormTubo({ ...formTubo, abscisa_fin: e.target.value })} style={sheet.cellInp} />,
              <input key="li" value={formTubo.lectura_mira_inicio} onChange={(e) => setFormTubo({ ...formTubo, lectura_mira_inicio: e.target.value })} style={sheet.cellInp} />,
              <input key="lf" value={formTubo.lectura_mira_fin} onChange={(e) => setFormTubo({ ...formTubo, lectura_mira_fin: e.target.value })} style={sheet.cellInp} />,
              <input key="ci" value={formTubo.cota_diseno_inicio} onChange={(e) => setFormTubo({ ...formTubo, cota_diseno_inicio: e.target.value })} style={sheet.cellInp} />,
              <input key="cf" value={formTubo.cota_diseno_fin} onChange={(e) => setFormTubo({ ...formTubo, cota_diseno_fin: e.target.value })} style={sheet.cellInp} />,
            ]}
          />
          <PermisoAviso permisos={permisos} accion="editar">
            <button type="button" style={{ ...ui.btnPrimary, marginTop: 4 }} onClick={agregarTubo}>Agregar tubo</button>
          </PermisoAviso>
          <div style={{ ...sheet.sheetWrap, marginTop: 12 }} className="cc-topo-table-scroll">
            <table style={{ ...sheet.sheetTable, tableLayout: 'auto', minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={sheet.th}>#</th>
                  <th style={sheet.th}>Abscisa</th>
                  <th style={sheet.th}>Cota campo</th>
                  <th style={sheet.th}>Delta</th>
                  <th style={sheet.th}>OK</th>
                </tr>
              </thead>
              <tbody>
                {tubos.map((t) => (
                  <tr key={t.id}>
                    <td style={sheet.td}>{t.numero_tubo}</td>
                    <td style={sheet.td}>{t.abscisa_inicio}–{t.abscisa_fin}</td>
                    <td style={sheet.td}>{t.cota_campo_inicio ?? '—'}</td>
                    <td style={sheet.td}>{t.delta_inicio ?? '—'}</td>
                    <td style={sheet.td}>{t.dentro_tolerancia ? 'SI' : 'NO'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {puede(permisos, 'editar') && (
            <div style={{ marginTop: 16 }}>
              <FirmaDigital onConfirm={(f) => api(`/tuberias/${tuberia.id}/firma`, { method: 'POST', body: JSON.stringify({ nombre_firmante: 'Topografo', firma_base64: f }) })} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
