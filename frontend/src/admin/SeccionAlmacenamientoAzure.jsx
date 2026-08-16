/**
 * Panel Desarrollador — almacenamiento Azure por contrato.
 * Usa el mismo tema (claro/oscuro/descanso) y tipografía var(--cc-*) que el resto del Admin.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatBytesHuman } from "../utils/storageQuota.js";
import { tFrom, isDarkMode, isRestMode } from "../theme/adminPanelTheme";

const GIB = 1024 ** 3;

function gbFromBytes(b) {
  const n = Number(b) || 0;
  return Math.round((n / GIB) * 1000) / 1000;
}

function bytesFromGb(gb) {
  const n = Number(gb);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * GIB);
}

export default function SeccionAlmacenamientoAzure({ call, theme }) {
  const t = theme && typeof theme === "object" && theme.text ? theme : tFrom(theme, null);
  const mode = typeof theme === "string" ? theme : isDarkMode(theme) ? "dark" : isRestMode(theme) ? "rest" : "light";
  const dark = isDarkMode(mode);
  const rest = isRestMode(mode);

  const col = {
    textPrimary: t.text,
    textMuted: t.textMuted,
    textTable: t.text,
    borderColor: t.border,
    bgCard: t.bgCard,
    inputBg: t.inputBg,
    primary: t.primary,
    bg: t.bg,
  };

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [config, setConfig] = useState(null);
  const [tarifas, setTarifas] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [umbralGb, setUmbralGb] = useState("5");
  const [savingConfig, setSavingConfig] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [soloExcedidos, setSoloExcedidos] = useState(false);
  const [reconciliando, setReconciliando] = useState(false);
  const [lastReconcile, setLastReconcile] = useState(null);

  const [tNombre, setTNombre] = useState("");
  const [tGb, setTGb] = useState("100");
  const [tPrecio, setTPrecio] = useState("0");
  const [savingTarifa, setSavingTarifa] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const j = await call("GET", "/admin/storage/contratos");
      setConfig(j?.config || null);
      setTarifas(Array.isArray(j?.tarifas) ? j.tarifas : []);
      setContratos(Array.isArray(j?.contratos) ? j.contratos : []);
      const ug = j?.config?.umbral_gratuito_bytes;
      if (ug != null) setUmbralGb(String(gbFromBytes(ug)));
      if (j?.schema_ready === false || j?.config?.schema_ready === false) {
        setMsg({
          type: "warn",
          text:
            "Falta aplicar la migración SQL 20260816170000_contrato_storage_quota.sql en Supabase. " +
            "Hasta entonces no se contabiliza ni se restringe la carga.",
        });
      }
    } catch (e) {
      setMsg({ type: "err", text: e?.message || String(e) });
      setContratos([]);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardarUmbral = async () => {
    const gb = Number(umbralGb);
    if (!Number.isFinite(gb) || gb < 0) {
      setMsg({ type: "warn", text: "Ingrese un umbral gratuito válido en GB (≥ 0)." });
      return;
    }
    setSavingConfig(true);
    setMsg(null);
    try {
      const j = await call("PUT", "/admin/storage/config", {
        umbral_gratuito_bytes: bytesFromGb(gb),
        umbral_gratuito_gb: gb,
      });
      setConfig(j);
      setMsg({ type: "ok", text: `Umbral gratuito actualizado a ${formatBytesHuman(j.umbral_gratuito_bytes)}.` });
      await cargar();
    } catch (e) {
      setMsg({ type: "err", text: e?.message || String(e) });
    } finally {
      setSavingConfig(false);
    }
  };

  const crearTarifa = async () => {
    const nombre = (tNombre || "").trim();
    const gb = Number(tGb);
    const precio = Number(tPrecio);
    if (!nombre) {
      setMsg({ type: "warn", text: "Nombre de tarifa requerido." });
      return;
    }
    if (!Number.isFinite(gb) || gb <= 0) {
      setMsg({ type: "warn", text: "Capacidad en GB debe ser > 0." });
      return;
    }
    setSavingTarifa(true);
    setMsg(null);
    try {
      await call("POST", "/admin/storage/tarifas", {
        nombre,
        capacidad_gb: gb,
        capacidad_bytes: bytesFromGb(gb),
        precio_cop_mes: Number.isFinite(precio) ? precio : 0,
        orden: Math.round(gb),
        activo: true,
      });
      setTNombre("");
      setMsg({ type: "ok", text: `Tarifa «${nombre}» guardada.` });
      await cargar();
    } catch (e) {
      setMsg({ type: "err", text: e?.message || String(e) });
    } finally {
      setSavingTarifa(false);
    }
  };

  const eliminarTarifa = async (id, nombre) => {
    if (!window.confirm(`¿Eliminar la tarifa «${nombre}»? Los contratos que la usen quedarán en umbral gratuito.`)) {
      return;
    }
    try {
      await call("DELETE", `/admin/storage/tarifas/${id}`);
      setMsg({ type: "ok", text: "Tarifa eliminada." });
      await cargar();
    } catch (e) {
      setMsg({ type: "err", text: e?.message || String(e) });
    }
  };

  const asignarPlan = async (contratoId, tarifaId) => {
    try {
      await call("PUT", `/admin/storage/contratos/${contratoId}`, {
        tarifa_id: tarifaId === "" || tarifaId == null ? 0 : Number(tarifaId),
      });
      await cargar();
    } catch (e) {
      setMsg({ type: "err", text: e?.message || String(e) });
    }
  };

  const reconciliar = async () => {
    if (
      !window.confirm(
        "¿Recalcular el consumo real desde Azure Blob Storage?\n\n" +
          "Esto sobrescribe los contadores en Postgres con el peso actual de fotos, documentos y otros " +
          "por contrato (incluye archivos históricos previos al sistema de cuota). Puede tardar unos minutos."
      )
    ) {
      return;
    }
    setReconciliando(true);
    setMsg(null);
    try {
      const j = await call(
        "POST",
        "/admin/storage/reconciliar",
        { zero_missing: true },
        { timeoutMs: 10 * 60 * 1000, maxRetries: 1 },
      );
      setLastReconcile(j);
      const n = j?.contratos_actualizados ?? 0;
      const attributed = j?.blobs_attributed ?? 0;
      const changed = (j?.contratos || []).filter((c) => (c.delta_total || 0) !== 0).length;
      setMsg({
        type: "ok",
        text:
          `Reconciliación lista: ${n} contrato(s), ${attributed} blob(s) atribuidos` +
          (j?.elapsed_ms != null ? ` en ${(j.elapsed_ms / 1000).toFixed(1)} s` : "") +
          (changed ? `. ${changed} con cambio de total.` : "."),
      });
      await cargar();
    } catch (e) {
      setMsg({ type: "err", text: e?.message || String(e) });
    } finally {
      setReconciliando(false);
    }
  };

  const filtrados = useMemo(() => {
    const q = (filtro || "").trim().toLowerCase();
    return contratos.filter((c) => {
      if (soloExcedidos && c.dentro_limite) return false;
      if (!q) return true;
      const blob = `${c.numero || ""} ${c.objeto || ""} ${c.contratista || ""} ${c.contrato_id}`.toLowerCase();
      return blob.includes(q);
    });
  }, [contratos, filtro, soloExcedidos]);

  const thS = {
    textAlign: "left",
    fontSize: "var(--cc-label)",
    fontWeight: 600,
    letterSpacing: 0.5,
    color: dark || rest ? (dark ? "#4a8a96" : "rgba(242,235,224,0.9)") : "#4a8a96",
    textTransform: "uppercase",
    padding: "6px 10px",
    background: dark ? "#020617" : rest ? "#2E2A25" : "#081318",
    borderBottom: dark ? "1px solid rgba(0,175,197,0.12)" : `1px solid ${col.borderColor}`,
    whiteSpace: "nowrap",
  };
  const tdS = {
    fontSize: "var(--cc-sm)",
    padding: "6px 10px",
    borderBottom: dark
      ? "1px solid rgba(255,255,255,0.04)"
      : `1px solid ${rest ? "rgba(201,184,164,0.45)" : col.borderColor}`,
    color: col.textTable,
    verticalAlign: "middle",
  };
  const inputS = {
    minHeight: 40,
    fontSize: "var(--cc-input)",
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${col.borderColor}`,
    width: "100%",
    boxSizing: "border-box",
    background: col.inputBg,
    color: col.textTable,
    outline: "none",
  };
  const btn = (variant) => ({
    minHeight: 40,
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid",
    borderColor:
      variant === "primary"
        ? col.primary
        : variant === "danger"
          ? "rgba(239,68,68,0.45)"
          : col.borderColor,
    background:
      variant === "primary"
        ? col.primary
        : variant === "danger"
          ? "rgba(239,68,68,0.12)"
          : "transparent",
    color:
      variant === "primary"
        ? dark
          ? "#081318"
          : "#fff"
        : variant === "danger"
          ? "#ef4444"
          : col.textTable,
    fontWeight: 600,
    cursor: reconciliando || savingConfig || savingTarifa ? "wait" : "pointer",
    fontSize: "var(--cc-sm)",
  });

  const cardS = {
    marginBottom: 16,
    padding: 16,
    background: col.bgCard,
    border: `1px solid ${col.borderColor}`,
    borderRadius: 10,
  };

  const labelS = {
    display: "block",
    fontSize: "var(--cc-label)",
    color: col.textMuted,
    marginBottom: 4,
    fontWeight: 600,
  };

  return (
    <div style={{ padding: "8px 4px 24px", maxWidth: 1200, fontSize: "var(--cc-body)", color: col.textPrimary }}>
      <div style={{ fontWeight: 800, fontSize: "var(--cc-h3)", color: col.textPrimary, marginBottom: 4 }}>
        Almacenamiento Azure
      </div>
      <div style={{ fontSize: "var(--cc-sm)", color: col.textMuted, marginBottom: 16, lineHeight: 1.45 }}>
        Contabiliza el peso de archivos por contrato (fotos vs documentos), define el umbral gratuito y
        tarifas de referencia por capacidad. Al superar el límite sin plan asignado, se bloquea la carga
        de nuevos archivos. El cobro automático al cliente queda fuera de este módulo.
      </div>

      {msg && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 8,
            background: msg.type === "ok" ? "#10B98118" : msg.type === "warn" ? "#F59E0B18" : "#EF444418",
            border: `1px solid ${msg.type === "ok" ? "#10B98144" : msg.type === "warn" ? "#F59E0B44" : "#EF444444"}`,
            color: col.textTable,
            fontSize: "var(--cc-sm)",
          }}
        >
          {msg.text}
        </div>
      )}

      <div style={{ ...cardS, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 180px" }}>
          <label style={labelS}>Umbral gratuito por contrato (GB)</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={umbralGb}
            onChange={(e) => setUmbralGb(e.target.value)}
            style={inputS}
          />
        </div>
        <button type="button" onClick={() => void guardarUmbral()} disabled={savingConfig || reconciliando} style={btn("primary")}>
          {savingConfig ? "Guardando…" : "Guardar umbral"}
        </button>
        <button type="button" onClick={() => void cargar()} disabled={loading || reconciliando} style={btn("ghost")}>
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => void reconciliar()}
          disabled={loading || reconciliando}
          style={btn("ghost")}
          title="Recalcula pesos reales desde Azure (archivos históricos incluidos)"
        >
          {reconciliando ? "Reconciliando…" : "Reconciliar desde Azure"}
        </button>
        {config?.umbral_gratuito_human && (
          <div style={{ fontSize: "var(--cc-sm)", color: col.textMuted, alignSelf: "center" }}>
            Vigente: <strong style={{ color: col.textPrimary }}>{config.umbral_gratuito_human}</strong>
          </div>
        )}
      </div>

      {lastReconcile && (
        <div
          style={{
            ...cardS,
            fontSize: "var(--cc-sm)",
            color: col.textMuted,
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: col.textPrimary }}>Última reconciliación:</strong>{" "}
          {lastReconcile.contratos_actualizados} contrato(s), {lastReconcile.blobs_scanned} blob(s) escaneados,{" "}
          {lastReconcile.blobs_attributed} atribuidos
          {lastReconcile.elapsed_ms != null ? ` · ${(lastReconcile.elapsed_ms / 1000).toFixed(1)} s` : ""}.
          {(lastReconcile.container_errors || []).length > 0 && (
            <div style={{ color: "#ef4444", marginTop: 6 }}>
              Contenedores con error: {(lastReconcile.container_errors || []).map((e) => e.container).join(", ")}
            </div>
          )}
        </div>
      )}

      <div style={cardS}>
        <div style={{ fontWeight: 700, fontSize: "var(--cc-md)", marginBottom: 8, color: col.textPrimary }}>
          Tarifas / rangos de capacidad
        </div>
        <div style={{ fontSize: "var(--cc-sm)", color: col.textMuted, marginBottom: 12 }}>
          Capacidad total permitida para contratos con ese plan. Precio COP/mes es referencia (sin facturación
          automática).
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
          <div style={{ flex: "1 1 160px" }}>
            <label style={labelS}>Nombre</label>
            <input value={tNombre} onChange={(e) => setTNombre(e.target.value)} placeholder="Hasta 100 GB" style={inputS} />
          </div>
          <div style={{ flex: "0 1 110px" }}>
            <label style={labelS}>Capacidad (GB)</label>
            <input type="number" min={0.001} step={1} value={tGb} onChange={(e) => setTGb(e.target.value)} style={inputS} />
          </div>
          <div style={{ flex: "0 1 130px" }}>
            <label style={labelS}>Precio COP/mes</label>
            <input type="number" min={0} step={1000} value={tPrecio} onChange={(e) => setTPrecio(e.target.value)} style={inputS} />
          </div>
          <button type="button" onClick={() => void crearTarifa()} disabled={savingTarifa || reconciliando} style={btn("primary")}>
            {savingTarifa ? "Guardando…" : "Agregar tarifa"}
          </button>
        </div>
        {tarifas.length === 0 ? (
          <div style={{ fontSize: "var(--cc-sm)", color: col.textMuted }}>Sin tarifas definidas.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480, fontSize: "var(--cc-sm)" }}>
            <thead>
              <tr>
                {["Nombre", "Capacidad", "COP/mes", "Activa", ""].map((h) => (
                  <th key={h || "a"} style={thS}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tarifas.map((tr) => (
                <tr key={tr.id}>
                  <td style={tdS}>{tr.nombre}</td>
                  <td style={tdS}>{tr.capacidad_human || formatBytesHuman(tr.capacidad_bytes)}</td>
                  <td style={tdS}>
                    {Number(tr.precio_cop_mes || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                  </td>
                  <td style={tdS}>{tr.activo ? "Sí" : "No"}</td>
                  <td style={tdS}>
                    <button
                      type="button"
                      onClick={() => void eliminarTarifa(tr.id, tr.nombre)}
                      style={{ ...btn("danger"), minHeight: 32, padding: "4px 10px", fontSize: "var(--cc-caption)" }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar contrato…"
          style={{ ...inputS, flex: "1 1 220px", maxWidth: 360 }}
        />
        <label style={{ fontSize: "var(--cc-sm)", color: col.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={soloExcedidos} onChange={(e) => setSoloExcedidos(e.target.checked)} />
          Solo excedidos
        </label>
        <span style={{ fontSize: "var(--cc-sm)", color: col.textMuted }}>
          {filtrados.length} contrato{filtrados.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: col.textMuted, fontSize: "var(--cc-sm)" }}>
          Cargando consumo…
        </div>
      ) : (
        <div className="cc-admin-table-scroll" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860, fontSize: "var(--cc-sm)" }}>
            <thead>
              <tr>
                {["Contrato", "Fotos", "Documentos", "Otros", "Total", "Límite", "%", "Estado", "Plan"].map((h) => (
                  <th key={h} style={thS}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => {
                const ok = !!c.dentro_limite;
                return (
                  <tr
                    key={c.contrato_id}
                    style={{
                      background: ok
                        ? undefined
                        : dark
                          ? "rgba(239,68,68,0.12)"
                          : "#FEF2F2",
                    }}
                  >
                    <td style={tdS}>
                      <div style={{ fontWeight: 700 }}>#{c.numero || c.contrato_id}</div>
                      <div
                        style={{
                          fontSize: "var(--cc-caption)",
                          color: col.textMuted,
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.objeto || c.contratista || ""}
                      </div>
                    </td>
                    <td style={tdS}>{c.fotos_human}</td>
                    <td style={tdS}>{c.documentos_human}</td>
                    <td style={tdS}>{c.otros_human}</td>
                    <td style={{ ...tdS, fontWeight: 700 }}>{c.used_human}</td>
                    <td style={tdS}>{c.limit_human}</td>
                    <td style={tdS}>{c.pct_usado}%</td>
                    <td style={tdS}>
                      <span
                        style={{
                          fontSize: "var(--cc-caption)",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: ok ? "#10B98122" : "#EF444422",
                          color: ok ? "#059669" : "#DC2626",
                        }}
                      >
                        {ok ? "Dentro" : "Excedido"}
                      </span>
                    </td>
                    <td style={tdS}>
                      <select
                        value={c.tarifa_id ?? ""}
                        onChange={(e) => void asignarPlan(c.contrato_id, e.target.value)}
                        style={{ ...inputS, minHeight: 34, fontSize: "var(--cc-sm)", padding: "4px 8px" }}
                      >
                        <option value="">Umbral gratuito</option>
                        {tarifas
                          .filter((tr) => tr.activo)
                          .map((tr) => (
                            <option key={tr.id} value={tr.id}>
                              {tr.nombre}
                            </option>
                          ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...tdS, textAlign: "center", color: col.textMuted }}>
                    Sin contratos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
