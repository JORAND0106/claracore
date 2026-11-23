import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  agrupadoresDeItem,
  etiquetaAgrupadoresItem,
  codigosWbsItem,
  itemsSinAgrupador,
  filasHojaListadoPrecios,
  filasHojaProgramacionWbs,
} from "./listadoPreciosExcelExport.js";

const ags = [
  { id: 1, codigo_wbs: "1.A", nombre: "Excavaciones", capitulo: "1. CAP", item_ids: [10, 11], es_transversal: false },
  { id: 2, codigo_wbs: "T.B", nombre: "Redes húmedas", capitulo: "Transversales", item_ids: [10, 20], es_transversal: true },
  { id: 3, codigo_wbs: "3.A", nombre: "Cap3", capitulo: "3. CAP", item_ids: [30], es_transversal: false },
];

const items = [
  { id: 10, capitulo: "1. CAP", item_numero: "1.1", descripcion: "Multi", precio_unitario: 100, competencia: "ICCU" },
  { id: 11, capitulo: "1. CAP", item_numero: "1.2", descripcion: "Solo 1.A", precio_unitario: 50 },
  { id: 20, capitulo: "2. CAP", item_numero: "2.1", descripcion: "En TX", precio_unitario: 200 },
  { id: 30, capitulo: "3. CAP", item_numero: "NP-07", descripcion: "Cap3", precio_unitario: 80 },
  { id: 40, capitulo: "3. CAP", item_numero: "NP-08", descripcion: "Sin AG", precio_unitario: 10, agrupador_id: null },
];

describe("listadoPreciosExcelExport", () => {
  it("lista todos los agrupadores del ítem multi", () => {
    const a = agrupadoresDeItem(items[0], ags);
    assert.deepEqual(a.map((x) => x.codigo_wbs), ["1.A", "T.B"]);
    assert.equal(etiquetaAgrupadoresItem(items[0], ags), "1.A Excavaciones · T.B Redes húmedas");
    assert.equal(codigosWbsItem(items[0], ags), "1.A · T.B");
  });

  it("marca Sin agrupador", () => {
    assert.equal(etiquetaAgrupadoresItem(items[4], ags), "Sin agrupador");
    assert.deepEqual(itemsSinAgrupador(items, ags).map((i) => i.id), [40]);
  });

  it("filas listado conservan columnas y multi-AG", () => {
    const rows = filasHojaListadoPrecios(items, ags);
    const multi = rows.find((r) => r.Ítem === "1.1");
    assert.ok(multi.Agrupador.includes("1.A Excavaciones"));
    assert.ok(multi.Agrupador.includes("T.B Redes húmedas"));
    assert.equal(multi["Código WBS"], "1.A · T.B");
    const sin = rows.find((r) => r.Ítem === "NP-08");
    assert.equal(sin.Agrupador, "Sin agrupador");
    assert.equal(sin["Código WBS"], "");
  });

  it("hoja WBS: capítulos, transversales y sin agrupador al final", () => {
    const rows = filasHojaProgramacionWbs(items, ags);
    const tiposCap = rows.filter((r) => r.Tipo === "Capítulo").map((r) => r.Nombre);
    assert.equal(tiposCap[0], "1. CAP");
    assert.ok(tiposCap.includes("Transversales"));
    assert.ok(tiposCap.some((n) => String(n).startsWith("Sin agrupador")));
    const idxTx = rows.findIndex((r) => r.Tipo === "Capítulo" && r.Nombre === "Transversales");
    const idxSin = rows.findIndex((r) => r.Tipo === "Capítulo" && String(r.Nombre).startsWith("Sin agrupador"));
    assert.ok(idxTx > -1);
    assert.ok(idxSin > idxTx);
    const ag1A = rows.find((r) => r.Tipo === "Agrupador" && r["Código WBS"] === "1.A");
    assert.equal(ag1A.Total, 150);
  });
});
