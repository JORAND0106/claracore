/**
 * Export Excel del Listado de Precios alineado con membership N:N (capítulo + transversales).
 * Puro: sin React; fácil de probar.
 */

function cmpNatural(a, b) {
  const num = (s) => parseFloat(String(s || "").match(/^(\d+(\.\d+)?)/)?.[1] ?? "9999");
  const na = num(a);
  const nb = num(b);
  if (na !== nb) return na - nb;
  return String(a || "").localeCompare(String(b || ""), "es");
}

function cmpCodigoWbs(a, b) {
  return String(a || "").localeCompare(String(b || ""), "es", { numeric: true, sensitivity: "base" });
}

function cmpItemNumero(a, b) {
  return String(a || "").localeCompare(String(b || ""), "es", { numeric: true, sensitivity: "base" });
}

export function esAgrupadorTransversal(ag) {
  return Boolean(ag?.es_transversal)
    || String(ag?.codigo_wbs || "").toUpperCase().startsWith("T.")
    || (ag?.capitulo || "").trim() === "Transversales";
}

/** Agrupadores a los que pertenece el ítem (bridge N:N; fallback legado). */
export function agrupadoresDeItem(item, agrupadores) {
  if (!item) return [];
  const list = Array.isArray(agrupadores) ? agrupadores : [];
  const fromBridge = list.filter(
    (ag) => Array.isArray(ag.item_ids) && ag.item_ids.map(String).includes(String(item.id)),
  );
  if (fromBridge.length) {
    return [...fromBridge].sort((a, b) =>
      cmpCodigoWbs(a.codigo_wbs, b.codigo_wbs) || cmpNatural(a.nombre, b.nombre),
    );
  }
  const legacyId = item.agrupador_id;
  if (legacyId != null && legacyId !== "") {
    const ag = list.find((a) => String(a.id) === String(legacyId));
    return ag ? [ag] : [];
  }
  return [];
}

/** Texto celda Agrupador: "1.A Excavaciones · T.B Redes" o "Sin agrupador". */
export function etiquetaAgrupadoresItem(item, agrupadores) {
  const ags = agrupadoresDeItem(item, agrupadores);
  if (!ags.length) return "Sin agrupador";
  return ags
    .map((ag) => {
      const cod = (ag.codigo_wbs || "").trim();
      const nom = (ag.nombre || "").trim();
      if (cod && nom) return `${cod} ${nom}`;
      return cod || nom || "—";
    })
    .join(" · ");
}

/** Códigos WBS unidos: "1.A · T.B" o vacío si sin agrupador. */
export function codigosWbsItem(item, agrupadores) {
  const ags = agrupadoresDeItem(item, agrupadores);
  if (!ags.length) return "";
  return ags
    .map((ag) => (ag.codigo_wbs || "").trim())
    .filter(Boolean)
    .join(" · ");
}

export function itemsSinAgrupador(items, agrupadores) {
  const list = Array.isArray(items) ? items : [];
  const hasBridge = (agrupadores || []).some((a) => Array.isArray(a.item_ids));
  const idsEnAg = new Set();
  for (const ag of agrupadores || []) {
    if (Array.isArray(ag.item_ids)) {
      for (const id of ag.item_ids) idsEnAg.add(String(id));
    }
  }
  return list
    .filter((i) => {
      if (hasBridge || idsEnAg.size > 0) return !idsEnAg.has(String(i.id));
      return i.agrupador_id == null || i.agrupador_id === "";
    })
    .sort((a, b) => {
      const cc = cmpNatural(a.capitulo, b.capitulo);
      if (cc !== 0) return cc;
      return cmpItemNumero(a.item_numero, b.item_numero);
    });
}

function itemsByIdMap(items) {
  const m = {};
  for (const it of items || []) {
    m[it.id] = it;
    m[String(it.id)] = it;
  }
  return m;
}

function itemsDeAgrupador(ag, byId) {
  const ids = Array.isArray(ag.item_ids) ? ag.item_ids : [];
  return ids
    .map((id) => byId[id] || byId[String(id)] || {
      id,
      item_numero: String(id),
      descripcion: "(ítem no cargado en vista)",
      unidad: "",
      precio_unitario: null,
      competencia: "",
      capitulo: "",
      _stub: true,
    })
    .sort((a, b) => cmpItemNumero(a.item_numero, b.item_numero));
}

function totalAgrupador(hijos) {
  return hijos.reduce((s, i) => s + (Number(i.precio_unitario) || 0), 0);
}

/**
 * Filas de la hoja «Programación WBS»: capítulos → transversales → Sin agrupador.
 * Cada agrupador con ítems y total.
 */
export function filasHojaProgramacionWbs(items, agrupadores) {
  const byId = itemsByIdMap(items);
  const caps = {};
  const transversales = [];
  for (const ag of agrupadores || []) {
    if (esAgrupadorTransversal(ag)) {
      transversales.push(ag);
      continue;
    }
    const cap = (ag.capitulo || "").trim() || "Sin capítulo";
    if (!caps[cap]) caps[cap] = [];
    caps[cap].push(ag);
  }
  Object.values(caps).forEach((list) => {
    list.sort((a, b) =>
      cmpCodigoWbs(a.codigo_wbs, b.codigo_wbs)
      || (a.orden ?? 0) - (b.orden ?? 0)
      || cmpNatural(a.nombre, b.nombre),
    );
  });
  transversales.sort((a, b) =>
    cmpCodigoWbs(a.codigo_wbs, b.codigo_wbs) || cmpNatural(a.nombre, b.nombre),
  );

  const rows = [];
  const pushAgBlock = (ag, seccion) => {
    const hijos = itemsDeAgrupador(ag, byId);
    const total = totalAgrupador(hijos);
    const n = Array.isArray(ag.item_ids) ? ag.item_ids.length : hijos.length;
    rows.push({
      Sección: seccion,
      Tipo: "Agrupador",
      "Código WBS": ag.codigo_wbs || "",
      Nombre: ag.nombre || "",
      Capítulo: esAgrupadorTransversal(ag) ? "Transversales" : (ag.capitulo || ""),
      Ítem: "",
      Descripción: `${n} ítem${n !== 1 ? "s" : ""}`,
      Unidad: "",
      Competencia: "",
      "Valor Unitario": "",
      Total: total,
    });
    for (const it of hijos) {
      rows.push({
        Sección: seccion,
        Tipo: "Ítem",
        "Código WBS": ag.codigo_wbs || "",
        Nombre: ag.nombre || "",
        Capítulo: it.capitulo || "",
        Ítem: it.item_numero || "",
        Descripción: it.descripcion || "",
        Unidad: it.unidad || "",
        Competencia: it.competencia || "",
        "Valor Unitario": it.precio_unitario != null ? Number(it.precio_unitario) : "",
        Total: "",
      });
    }
  };

  const capKeys = Object.keys(caps).sort(cmpNatural);
  for (const cap of capKeys) {
    rows.push({
      Sección: cap,
      Tipo: "Capítulo",
      "Código WBS": "",
      Nombre: cap,
      Capítulo: cap,
      Ítem: "",
      Descripción: "",
      Unidad: "",
      Competencia: "",
      "Valor Unitario": "",
      Total: "",
    });
    for (const ag of caps[cap]) pushAgBlock(ag, cap);
  }

  if (transversales.length) {
    rows.push({
      Sección: "Transversales",
      Tipo: "Capítulo",
      "Código WBS": "",
      Nombre: "Transversales",
      Capítulo: "Transversales",
      Ítem: "",
      Descripción: "",
      Unidad: "",
      Competencia: "",
      "Valor Unitario": "",
      Total: "",
    });
    for (const ag of transversales) pushAgBlock(ag, "Transversales");
  }

  const sin = itemsSinAgrupador(items, agrupadores);
  if (sin.length) {
    rows.push({
      Sección: "Sin agrupador",
      Tipo: "Capítulo",
      "Código WBS": "",
      Nombre: `Sin agrupador (${sin.length})`,
      Capítulo: "",
      Ítem: "",
      Descripción: "",
      Unidad: "",
      Competencia: "",
      "Valor Unitario": "",
      Total: "",
    });
    const byCap = {};
    for (const it of sin) {
      const c = (it.capitulo || "").trim() || "Sin capítulo";
      if (!byCap[c]) byCap[c] = [];
      byCap[c].push(it);
    }
    for (const c of Object.keys(byCap).sort(cmpNatural)) {
      rows.push({
        Sección: "Sin agrupador",
        Tipo: "Capítulo",
        "Código WBS": "",
        Nombre: c,
        Capítulo: c,
        Ítem: "",
        Descripción: `${byCap[c].length} ítem(s)`,
        Unidad: "",
        Competencia: "",
        "Valor Unitario": "",
        Total: "",
      });
      for (const it of byCap[c]) {
        rows.push({
          Sección: "Sin agrupador",
          Tipo: "Ítem",
          "Código WBS": "",
          Nombre: "Sin agrupador",
          Capítulo: it.capitulo || "",
          Ítem: it.item_numero || "",
          Descripción: it.descripcion || "",
          Unidad: it.unidad || "",
          Competencia: it.competencia || "",
          "Valor Unitario": it.precio_unitario != null ? Number(it.precio_unitario) : "",
          Total: "",
        });
      }
    }
  }

  return rows;
}

/** Filas de la hoja principal (mismas columnas que antes; Agrupador multi-AG). */
export function filasHojaListadoPrecios(items, agrupadores) {
  const ordered = [...(items || [])].sort((a, b) => {
    const cc = cmpNatural(a.capitulo, b.capitulo);
    if (cc !== 0) return cc;
    const ck = String(a.competencia || "").localeCompare(String(b.competencia || ""), "es");
    if (ck !== 0) return ck;
    return cmpItemNumero(a.item_numero, b.item_numero);
  });
  return ordered.map((i) => ({
    Capítulo: i.capitulo || "",
    Agrupador: etiquetaAgrupadoresItem(i, agrupadores),
    "Código WBS": codigosWbsItem(i, agrupadores),
    Competencia: i.competencia || "",
    Ítem: i.item_numero || "",
    Descripción: i.descripcion || "",
    Unidad: i.unidad || "",
    "Valor Unitario": i.precio_unitario || 0,
    Estado: i.estado_precio || "",
    "Tipo de Precio": i.tipo_precio || "",
    "Especificación Técnica": i.especificacion_tecnica || "",
    "Acta de Fijación": i.acta_fijacion || "",
    "Acta Modificatoria": i.acta_modificatoria || "",
    Observaciones: i.observaciones || "",
    "Tipo de Cálculo": i.tipo_calculo || "",
  }));
}
