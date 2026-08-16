/**
 * Panel Desarrollador — almacenamiento Azure por contrato.
 * Configura umbral gratuito, tarifas/rangos y asigna planes; muestra consumo por tipo.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatBytesHuman } from "../utils/storageQuota.js";

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
  const col = {
    textPrimary: theme?.textPrimary || "#0f172a",
    textMuted: theme?.textMuted || "#64748b",
    textTable: theme?.textTable || "#1e293b",
    borderColor: theme?.borderColor || "#e2e8f0",
    bgCard: theme?.bgCard || "#f8fafc",
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

  // Nueva tarifa
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
    fontSize: 10,
    color: col.textMuted,
    textTransform: "uppercase",
    padding: "8px 10px",
    borderBottom: `1px solid ${col.borderColor}`,
    whiteSpace: "nowrap",
  };
  const tdS = {
    fontSize: 12,
    padding: "8px 10px",
    borderBottom: `1px solid ${col.borderColor}88`,
    color: col.textTable,
    verticalAlign: "middle",
  };
  const inputS = {
    minHeight: 40,
    fontSize: 14,
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${col.borderColor}`,
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    color: col.textTable,
  };
  const btn = (variant) => ({
    minHeight: 40,
    padding: "8px 14px",
    borderRadius: 8,
    border: variant === "ghost" ? `1px solid ${col.borderColor}` : "none",
    background: variant === "primary" ? "#0f766e" : variant === "danger" ? "#dc2626" : col.bgCard,
    color: variant === "ghost" ? col.textTable : "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  });

  return (
    <div style={{ padding: "8px 4px 24px", maxWidth: 1200 }}>
      <div style={{ fontWeight: 800, fontSize: "var(--cc-h3)", color: col.textPrimary, marginBottom: 4 }}>
        Almacenamiento Azure
      </div>
      <div style={{ fontSize: 12, color: col.textMuted, marginBottom: 16, lineHeight: 1.45 }}>
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
            fontSize: 13,
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Umbral gratuito */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "flex-end",
          marginBottom: 16,
          padding: 16,
          background: col.bgCard,
          border: `1px solid ${col.borderColor}`,
          borderRadius: 10,
        }}
      >
        <div style={{ flex: "1 1 180px" }}>
          <label style={{ display: "block", fontSize: 11, color: col.textMuted, marginBottom: 4 }}>
            Umbral gratuito por contrato (GB)
          </label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={umbralGb}
            onChange={(e) => setUmbralGb(e.target.value)}
            style={inputS}
          />
        </div>
        <button type="button" onClick={() => void guardarUmbral()} disabled={savingConfig} style={btn("primary")}>
          {savingConfig ? "Guardando…" : "Guardar umbral"}
        </button>
        <button type="button" onClick={() => void cargar()} disabled={loading} style={btn("ghost")}>
          Actualizar
        </button>
        {config?.umbral_gratuito_human && (
          <div style={{ fontSize: 12, color: col.textMuted, alignSelf: "center" }}>
            Vigente: <strong>{config.umbral_gratuito_human}</strong>
          </div>
        )}
      </div>

      {/* Tarifas */}
      <div
        style={{
          marginBottom: 20,
          padding: 16,
          background: col.bgCard,
          border: `1px solid ${col.borderColor}`,
          borderRadius: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: col.textPrimary }}>
          Tarifas / rangos de capacidad
        </div>
        <div style={{ fontSize: 12, color: col.textMuted, marginBottom: 12 }}>
          Capacidad total permitida para contratos con ese plan. Precio COP/mes es referencia (sin facturación
          automática).
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ display: "block", fontSize: 11, color: col.textMuted, marginBottom: 4 }}>Nombre</label>
            <input value={tNombre} onChange={(e) => setTNombre(e.target.value)} placeholder="Hasta 100 GB" style={inputS} />
          </div>
          <div style={{ flex: "0 1 110px" }}>
            <label style={{ display: "block", fontSize: 11, color: col.textMuted, marginBottom: 4 }}>Capacidad (GB)</label>
            <input type="number" min={0.001} step={1} value={tGb} onChange={(e) => setTGb(e.target.value)} style={inputS} />
          </div>
          <div style={{ flex: "0 1 130px" }}>
            <label style={{ display: "block", fontSize: 11, color: col.textMuted, marginBottom: 4 }}>Precio COP/mes</label>
            <input type="number" min={0} step={1000} value={tPrecio} onChange={(e) => setTPrecio(e.target.value)} style={inputS} />
          </div>
          <button type="button" onClick={() => void crearTarifa()} disabled={savingTarifa} style={btn("primary")}>
            {savingTarifa ? "Guardando…" : "Agregar tarifa"}
          </button>
        </div>
        {tarifas.length === 0 ? (
          <div style={{ fontSize: 12, color: col.textMuted }}>Sin tarifas definidas.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
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
              {tarifas.map((t) => (
                <tr key={t.id}>
                  <td style={tdS}>{t.nombre}</td>
                  <td style={tdS}>{t.capacidad_human || formatBytesHuman(t.capacidad_bytes)}</td>
                  <td style={tdS}>
                    {Number(t.precio_cop_mes || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                  </td>
                  <td style={tdS}>{t.activo ? "Sí" : "No"}</td>
                  <td style={tdS}>
                    <button type="button" onClick={() => void eliminarTarifa(t.id, t.nombre)} style={{ ...btn("danger"), minHeight: 32, padding: "4px 10px", fontSize: 12 }}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Contratos */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar contrato…"
          style={{ ...inputS, flex: "1 1 220px", maxWidth: 360 }}
        />
        <label style={{ fontSize: 12, color: col.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={soloExcedidos} onChange={(e) => setSoloExcedidos(e.target.checked)} />
          Solo excedidos
        </label>
        <span style={{ fontSize: 12, color: col.textMuted }}>
          {filtrados.length} contrato{filtrados.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: col.textMuted }}>Cargando consumo…</div>
      ) : (
        <div className="cc-admin-table-scroll" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
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
                  <tr key={c.contrato_id} style={{ background: ok ? undefined : "#FEF2F2" }}>
                    <td style={tdS}>
                      <div style={{ fontWeight: 700 }}>#{c.numero || c.contrato_id}</div>
                      <div style={{ fontSize: 11, color: col.textMuted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                          fontSize: 11,
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
                        style={{ ...inputS, minHeight: 34, fontSize: 12, padding: "4px 8px" }}
                      >
                        <option value="">Umbral gratuito</option>
                        {tarifas
                          .filter((t) => t.activo)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre}
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
