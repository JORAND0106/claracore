import { useMemo, useState } from "react";
import CcModalBrandHeader from "../components/CcModalBrandHeader";
import { isDarkMode } from "../theme/adminPanelTheme";

/**
 * Selector multi-agrupador WBS (popup independiente de plataforma).
 * Orden: capítulo del ítem → transversales → otros capítulos.
 */
export default function ListadoAgrupadorMultiPicker({
  theme,
  tTok,
  overlayStyle,
  modalStyle,
  labelStyle,
  inputStyle,
  S,
  item,
  agrupadores,
  selectedIds,
  onConfirm,
  onCancel,
  fmt,
}) {
  const [busqueda, setBusqueda] = useState("");
  const [draft, setDraft] = useState(() => new Set((selectedIds || []).map(String)));

  const esTx = (ag) =>
    Boolean(ag?.es_transversal)
    || String(ag?.codigo_wbs || "").toUpperCase().startsWith("T.")
    || ag?.capitulo === "Transversales";

  const itemCap = (item?.capitulo || "").trim();

  const ordenados = useMemo(() => {
    const list = [...(agrupadores || [])];
    const rank = (ag) => {
      if (esTx(ag)) return 1;
      if ((ag.capitulo || "").trim() === itemCap) return 0;
      return 2;
    };
    list.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const ca = String(a.codigo_wbs || "");
      const cb = String(b.codigo_wbs || "");
      if (ca !== cb) return ca.localeCompare(cb, "es", { numeric: true, sensitivity: "base" });
      return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
    });
    const q = busqueda.trim().toLowerCase();
    if (!q) return list;
    return list.filter((ag) => {
      const cod = String(ag.codigo_wbs || "").toLowerCase();
      const nom = String(ag.nombre || "").toLowerCase();
      return cod.includes(q) || nom.includes(q);
    });
  }, [agrupadores, busqueda, itemCap]);

  const toggle = (agId) => {
    const sid = String(agId);
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const tipValor = (ag) => {
    const n = Number(ag.items_count ?? ag.items_total ?? (Array.isArray(ag.item_ids) ? ag.item_ids.length : 0)) || 0;
    const val = ag.precio_unitario_suma_hijos;
    const valTxt = typeof fmt === "function" && val != null ? fmt(val) : (val != null ? `$${Number(val).toLocaleString("es-CO")}` : "—");
    return `${n} ítem${n !== 1 ? "s" : ""} · valor ${valTxt}`;
  };

  const quedaraTx = (ag) => {
    if (esTx(ag)) return false;
    const agCap = (ag.capitulo || "").trim();
    return Boolean(itemCap && agCap && agCap !== itemCap && agCap !== "Transversales");
  };

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onCancel?.()}>
      <div
        style={{ ...modalStyle(520), padding: 0, maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Seleccionar agrupadores WBS"
      >
        <CcModalBrandHeader theme={theme} />
        <div style={{
          padding: "14px 18px 10px",
          borderBottom: `1px solid ${tTok.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}>
          <div>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: tTok.textPrimary || undefined,
              fontFamily: "'Rajdhani',sans-serif",
            }}>
              Agrupador WBS
            </div>
            <div style={{ fontSize: 12, color: tTok.textSecondary || "#94a3b8", marginTop: 2 }}>
              {item?.item_numero ? `Ítem ${item.item_numero}` : "Ítem"}
              {itemCap ? ` · ${itemCap}` : ""}
            </div>
          </div>
          <button type="button" style={S.closeBtn(theme)} onClick={onCancel} aria-label="Cerrar">✕</button>
        </div>

        <div style={{ padding: "12px 18px 8px" }}>
          <div style={labelStyle}>Buscar</div>
          <input
            style={inputStyle}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Código o nombre…"
            autoFocus
          />
        </div>

        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 10px 12px",
          maxHeight: 380,
        }}>
          {ordenados.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: tTok.textMuted || "#94a3b8", textAlign: "center" }}>
              {agrupadores?.length ? "Sin coincidencias." : "No hay agrupadores creados en este contrato."}
            </div>
          ) : (
            ordenados.map((ag) => {
              const checked = draft.has(String(ag.id));
              const tipTx = quedaraTx(ag)
                ? "Al incluir este ítem, el agrupador pasará a transversal (nuevo código T.*)"
                : null;
              return (
                <label
                  key={ag.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: checked
                      ? (isDarkMode(theme) ? "rgba(0,175,197,0.12)" : "rgba(0,175,197,0.08)")
                      : "transparent",
                    borderBottom: `1px solid ${tTok.border}`,
                  }}
                  data-cc-tooltip={tipValor(ag)}
                  data-cc-tooltip-variant="help"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(ag.id)}
                    style={{ width: 16, height: 16, accentColor: tTok.primary || "#00afc5", flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: tTok.primary || "#00afc5", marginRight: 6 }}>
                      {ag.codigo_wbs || "—"}
                    </span>
                    <span style={{ fontSize: 13 }}>{ag.nombre}</span>
                    {esTx(ag) && (
                      <span
                        style={{ marginLeft: 6, fontSize: 11, color: tTok.primary, fontWeight: 700 }}
                        data-cc-tooltip="Agrupador transversal"
                        data-cc-tooltip-variant="short"
                      >⊞</span>
                    )}
                    {tipTx && (
                      <span
                        style={{ marginLeft: 6, fontSize: 12, color: "#f59e0b", fontWeight: 700 }}
                        data-cc-tooltip={tipTx}
                        data-cc-tooltip-variant="help"
                        aria-label="Pasará a transversal"
                      >⚠</span>
                    )}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div style={{
          padding: "12px 18px",
          borderTop: `1px solid ${tTok.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{ fontSize: 12, color: tTok.textSecondary || "#94a3b8" }}>
            {draft.size} seleccionado{draft.size !== 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={S.btn("ghost")} onClick={onCancel}>Cancelar</button>
            <button
              type="button"
              style={S.btn("primary")}
              onClick={() => onConfirm?.(Array.from(draft).map((id) => {
                const n = Number(id);
                return Number.isFinite(n) ? n : id;
              }))}
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
