import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const API = "https://claracore-backend.azurewebsites.net";

const ACCIONES = ["ver", "crear", "editar", "eliminar", "validar", "exportar"];

// ─── TOKENS DE COLOR POR TEMA ──────────────────────────────────────────────
// Evita repetir ternarios en cada componente
const C = (theme) => ({
  textPrimary:   theme === "light" ? "#0d3b52" : "#e0f4f7",
  textSecondary: theme === "light" ? "#2a6070" : "#4a7a87",
  textMuted:     theme === "light" ? "#4a7a87" : "#2a4a54",
  textTable:     theme === "light" ? "#1a3a48" : "#c0dde3",
  bgCard:        theme === "light" ? "#FFFFFF" : "#0b1920",
  bgInput:       theme === "light" ? "#F0F9FF" : "#081318",
  borderColor:   theme === "light" ? "#BAE6FD" : "rgba(0,175,197,0.2)",
});

// ─── ESTILOS BASE ──────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "rgba(10,18,25,0.82)",
    backdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },
  panel: (theme) => ({
    width: "min(1100px, 96vw)", height: "min(780px, 92vh)",
    background: theme === "light" ? "#F0F9FF" : "#0e1c24",
    borderRadius: 12,
    display: "flex",
    overflow: "hidden",
    boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,175,197,0.15)",
  }),
  sidebar: (theme) => ({
    width: 210, minWidth: 210,
    background: theme === "light" ? "#E0F2FE" : "#081318",
    borderRight: theme === "light" ? "1px solid #BAE6FD" : "1px solid rgba(0,175,197,0.12)",
    display: "flex", flexDirection: "column",
    padding: "28px 0",
  }),
  sidebarHeader: {
    padding: "0 20px 24px",
    borderBottom: "1px solid rgba(0,175,197,0.1)",
    marginBottom: 16,
  },
  logoSub: { fontSize: 11, color: "#4a7a87", letterSpacing: 1, marginTop: 2 },
  navItem: (active) => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "11px 20px", cursor: "pointer",
    background: active ? "rgba(0,175,197,0.12)" : "transparent",
    borderLeft: active ? "3px solid #00afc5" : "3px solid transparent",
    color: active ? "#00afc5" : "#5a8a96",
    fontSize: 13, fontWeight: active ? 600 : 400,
    transition: "all 0.18s",
    userSelect: "none",
  }),
  navDot: (active) => ({
    width: 7, height: 7, borderRadius: "50%",
    background: active ? "#00afc5" : "#2a4a54",
    flexShrink: 0,
  }),
  sidebarFooter: {
    marginTop: "auto", padding: "16px 20px",
    borderTop: "1px solid rgba(0,175,197,0.08)",
  },
  userTag: { fontSize: 11, color: "#4a7a87" },
  userName: { fontSize: 13, color: "#8acdd8", fontWeight: 600, marginTop: 2 },
  content: {
    flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
  },
  contentHeader: (theme) => ({
    padding: "24px 32px 20px",
    borderBottom: theme === "light" ? "1px solid #BAE6FD" : "1px solid rgba(0,175,197,0.1)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: theme === "light" ? "#FFFFFF" : "#0b1920",
  }),
  contentTitle: (theme) => ({
    fontSize: 20, fontWeight: 700,
    color: theme === "light" ? "#0d3b52" : "#e0f4f7",   // ← legible en ambos
    fontFamily: "'Rajdhani', sans-serif", letterSpacing: 0.5,
  }),
  contentSub: (theme) => ({
    fontSize: 12,
    color: theme === "light" ? "#2a6070" : "#4a7a87",   // ← legible en ambos
    marginTop: 3,
  }),
  closeBtn: {
    width: 32, height: 32, borderRadius: 6,
    background: "rgba(0,175,197,0.08)", border: "1px solid rgba(0,175,197,0.2)",
    color: "#00afc5", fontSize: 16, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s",
  },
  scrollArea: (theme) => ({
    flex: 1, overflowY: "auto", padding: "24px 32px",
    scrollbarWidth: "thin", scrollbarColor: "#1e3a44 transparent",
    background: theme === "light" ? "#F8FAFC" : "transparent",
  }),
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left", padding: "10px 14px",
    background: "#081318", color: "#4a8a96",
    fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(0,175,197,0.12)",
  },
  td: (theme) => ({
    padding: "12px 14px",
    color: theme === "light" ? "#1a3a48" : "#c0dde3",   // ← legible en ambos
    borderBottom: theme === "light" ? "1px solid #E0F2FE" : "1px solid rgba(255,255,255,0.04)",
    verticalAlign: "middle",
  }),
  badge: (estado) => ({
    display: "inline-block", padding: "3px 10px", borderRadius: 20,
    fontSize: 11, fontWeight: 600,
    background: estado === "pendiente" ? "rgba(245,158,11,0.15)"
      : estado === "aprobado" ? "rgba(34,197,94,0.15)"
      : "rgba(239,68,68,0.15)",
    color: estado === "pendiente" ? "#f59e0b"
      : estado === "aprobado" ? "#22c55e"
      : "#ef4444",
  }),
  btn: (variant = "primary", sm = false) => ({
    padding: sm ? "6px 14px" : "9px 20px",
    borderRadius: 6, cursor: "pointer",
    fontSize: sm ? 12 : 13, fontWeight: 600,
    border: "1px solid",
    transition: "all 0.15s",
    ...(variant === "primary" ? {
      background: "#00afc5", borderColor: "#00afc5", color: "#081318",
    } : variant === "success" ? {
      background: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.4)", color: "#22c55e",
    } : variant === "danger" ? {
      background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.4)", color: "#ef4444",
    } : variant === "ghost" ? {
      background: "transparent", borderColor: "rgba(0,175,197,0.2)", color: "#8acdd8",
    } : {
      background: "rgba(0,175,197,0.08)", borderColor: "rgba(0,175,197,0.2)", color: "#00afc5",
    }),
  }),
  input: {
    background: "#081318", border: "1px solid rgba(0,175,197,0.2)",
    borderRadius: 6, color: "#c0dde3", fontSize: 13,
    padding: "8px 12px", outline: "none", width: "100%",
  },
  select: {
    background: "#081318", border: "1px solid rgba(0,175,197,0.2)",
    borderRadius: 6, color: "#c0dde3", fontSize: 12,
    padding: "6px 10px", outline: "none", cursor: "pointer",
  },
  card: {
    background: "#0b1920", border: "1px solid rgba(0,175,197,0.1)",
    borderRadius: 8, padding: "20px 24px", marginBottom: 16,
  },
  cardTitle: { fontSize: 14, fontWeight: 600, color: "#8acdd8", marginBottom: 12 },
  chip: (active) => ({
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "4px 10px", borderRadius: 20, cursor: "pointer",
    fontSize: 11, fontWeight: 600, userSelect: "none",
    border: "1px solid",
    transition: "all 0.15s",
    background: active ? "rgba(0,175,197,0.18)" : "rgba(255,255,255,0.03)",
    borderColor: active ? "#00afc5" : "rgba(255,255,255,0.1)",
    color: active ? "#00afc5" : "#4a7a87",
  }),
  alert: (type) => ({
    padding: "10px 16px", borderRadius: 6, fontSize: 13,
    marginBottom: 16,
    background: type === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
    border: `1px solid ${type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
    color: type === "success" ? "#22c55e" : "#ef4444",
  }),
  empty: {
    textAlign: "center", padding: "48px 0",
    color: "#2a4a54", fontSize: 14,
  },
};

// ─── HOOK: llamadas a la API ───────────────────────────────────────────────
function useApi(token) {
  const call = useCallback(async (method, path, body = null) => {
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      // detail puede ser string (mensaje) o lista de objetos (errores de validación Pydantic)
      let msg = "Error del servidor";
      if (typeof err.detail === "string") msg = err.detail;
      else if (Array.isArray(err.detail)) msg = err.detail.map(e => e.msg).join(", ");
      else if (err.message) msg = err.message;
      throw new Error(msg);
    }
    return res.json();
  }, [token]);
  return call;
}

// Ejecuta fn en intervalo; fn se actualiza sin reiniciar el timer
function usePolling(fn, intervalMs) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; }, [fn]);
  useEffect(() => {
    const id = setInterval(() => ref.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

// ─── SECCIÓN 1: Gestión de Usuarios ───────────────────────────────────────
function SeccionUsuarios({ call, cargos, theme, userId }) {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [ucContratos, setUcContratos] = useState({});
  const [addingContrato, setAddingContrato] = useState({});

  const col = C(theme);

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [udata, rdata, cdata] = await Promise.all([
        call("GET", "/admin/todos-usuarios"),
        call("GET", "/roles").catch(() => []),
        call("GET", "/contratos").catch(() => []),
      ]);
      // Backend ya filtra Desarrollador (invisible para otros) pero lo muestra al propio Desarrollador
      setUsuarios(udata);
      setRoles(rdata);
      setContratos(cdata);
      const initEdits = {};
      udata.forEach(u => {
        initEdits[u.id] = {
          cargo_id: u.cargo_id || "",
          rol_id: u.rol_id || "",
          contrato_id: u.contrato_id || "",
          estado: u.estado || "",
        };
      });
      setEdits(prev => {
        const merged = { ...initEdits };
        Object.keys(prev).forEach(uid => { if (merged[uid]) merged[uid] = { ...merged[uid], ...prev[uid] }; });
        return merged;
      });
    } catch (e) {
      if (!silent) setMsg({ type: "error", text: e.message });
    } finally { if (!silent) setLoading(false); }
  }, [call]);

  useEffect(() => { cargar(); }, [cargar]);
  // Auto-refresh silencioso cada 30 s — detecta nuevos usuarios sin recargar página
  usePolling(() => cargar(true), 30000);

  const setEdit = (uid, field, val) => setEdits(e => ({ ...e, [uid]: { ...e[uid], [field]: val } }));

  const guardar = async (uid) => {
    setSaving(uid);
    const e = edits[uid];
    // Convertir "" a null para campos int — Pydantic rechaza string vacío en Optional[int]
    const payload = {
      cargo_id:    e.cargo_id    ? parseInt(e.cargo_id)    : null,
      rol_id:      e.rol_id      ? parseInt(e.rol_id)      : null,
      contrato_id: e.contrato_id ? parseInt(e.contrato_id) : null,
      estado:      e.estado      || null,
    };
    try {
      await call("PUT", `/admin/usuarios/${uid}`, payload);
      setMsg({ type: "success", text: "Usuario actualizado." });
      cargar(true);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setSaving(null); }
  };

  const cargarUcContratos = async (uid) => {
    try {
      const data = await call("GET", `/admin/usuario-contratos/${uid}`);
      setUcContratos(p => ({ ...p, [uid]: data }));
    } catch { setUcContratos(p => ({ ...p, [uid]: [] })); }
  };

  const toggleExpandir = (uid) => {
    if (expandido === uid) { setExpandido(null); return; }
    setExpandido(uid);
    cargarUcContratos(uid);
  };

  const agregarContrato = async (uid) => {
    const cid = addingContrato[uid];
    if (!cid) return;
    try {
      await call("POST", "/admin/usuario-contratos", { usuario_id: uid, contrato_id: parseInt(cid) });
      setMsg({ type: "success", text: "Contrato asignado." });
      cargarUcContratos(uid);
      setAddingContrato(p => ({ ...p, [uid]: "" }));
    } catch (e) { setMsg({ type: "error", text: e.message }); }
  };

  const quitarContrato = async (uid, cid) => {
    if (!window.confirm("¿Quitar este contrato al usuario?")) return;
    try {
      await call("DELETE", `/admin/usuario-contratos/${uid}/${cid}`);
      cargarUcContratos(uid);
    } catch (e) { setMsg({ type: "error", text: e.message }); }
  };

  const estadoBadge = { pendiente: "#f59e0b", aprobado: "#22c55e", rechazado: "#ef4444" };
  const tdStyle = S.td(theme);

  return (
    <div>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float: "right", cursor: "pointer", opacity: 0.6 }}>✕</span>
        </div>
      )}
      {loading ? (
        <div style={S.empty}><div style={{ color: "#00afc5" }}>Cargando...</div></div>
      ) : usuarios.length === 0 ? (
        <div style={S.empty}>No hay usuarios registrados.</div>
      ) : (
        <table style={S.table}>
          <thead>
            <tr>
              {["Usuario", "Estado", "Cargo", "Rol", "Contrato principal", "Acciones"].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <>
                <tr key={u.id}>
                  <td style={tdStyle}>
                    <div style={{ color: col.textPrimary, fontWeight: 500 }}>{u.nombre} {u.apellidos}</div>
                    <div style={{ fontSize: 11, color: col.textSecondary }}>{u.email}</div>
                  </td>
                  <td style={tdStyle}>
                    <select style={{ ...S.select, minWidth: 110, color: estadoBadge[edits[u.id]?.estado] || col.textTable }}
                      value={edits[u.id]?.estado || ""}
                      onChange={e => setEdit(u.id, "estado", e.target.value)}>
                      <option value="pendiente">🟡 Pendiente</option>
                      <option value="aprobado">🟢 Aprobado</option>
                      <option value="rechazado">🔴 Rechazado</option>
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select style={{ ...S.select, minWidth: 140 }}
                      value={edits[u.id]?.cargo_id || ""}
                      onChange={e => setEdit(u.id, "cargo_id", e.target.value)}>
                      <option value="">Sin cargo</option>
                      {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select style={{ ...S.select, minWidth: 130 }}
                      value={edits[u.id]?.rol_id || ""}
                      onChange={e => setEdit(u.id, "rol_id", e.target.value)}>
                      <option value="">Sin rol</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select style={{ ...S.select, minWidth: 150 }}
                      value={edits[u.id]?.contrato_id || ""}
                      onChange={e => setEdit(u.id, "contrato_id", e.target.value)}>
                      <option value="">Sin contrato</option>
                      {contratos.map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={S.btn("primary", true)} disabled={saving === u.id} onClick={() => guardar(u.id)}>
                        {saving === u.id ? "..." : "💾"}
                      </button>
                      <button style={S.btn("ghost", true)} title="Gestionar contratos" onClick={() => toggleExpandir(u.id)}>
                        {expandido === u.id ? "▲" : "📋"}
                      </button>
                    </div>
                  </td>
                </tr>
                {expandido === u.id && (
                  <tr key={`uc-${u.id}`}>
                    <td colSpan={6} style={{ ...tdStyle, background: "rgba(0,175,197,0.04)", padding: "12px 20px" }}>
                      <div style={{ fontSize: 12, color: "#00afc5", marginBottom: 8, fontWeight: 600 }}>
                        Contratos autorizados para {u.nombre}:
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                        {(ucContratos[u.id] || []).map(c => (
                          <span key={c.id} style={{ background: "rgba(0,175,197,0.1)", border: "1px solid rgba(0,175,197,0.3)", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#8acdd8", display: "flex", alignItems: "center", gap: 6 }}>
                            {c.numero}
                            <span style={{ cursor: "pointer", color: "#ef4444", fontWeight: 700 }} onClick={() => quitarContrato(u.id, c.id)}>×</span>
                          </span>
                        ))}
                        {(ucContratos[u.id] || []).length === 0 && <span style={{ color: col.textSecondary, fontSize: 12 }}>Sin contratos asignados</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select style={{ ...S.select, minWidth: 180 }}
                          value={addingContrato[u.id] || ""}
                          onChange={e => setAddingContrato(p => ({ ...p, [u.id]: e.target.value }))}>
                          <option value="">+ Agregar contrato...</option>
                          {contratos.map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}
                        </select>
                        <button style={S.btn("primary", true)} onClick={() => agregarContrato(u.id)}>Asignar</button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── SECCIÓN 2: CRUD Cargos ────────────────────────────────────────────────
function SeccionCargos({ call, cargos, recargarCargos, theme }) {
  const [nuevo, setNuevo] = useState("");
  const [msg, setMsg] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const col = C(theme);
  const tdStyle = S.td(theme);

  const crear = async () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    try {
      await call("POST", "/admin/cargos", { nombre });
      setMsg({ type: "success", text: `Cargo "${nombre}" creado.` });
      setNuevo("");
      recargarCargos();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  };

  const eliminar = async (id, nombre) => {
    if (!window.confirm(`¿Eliminar el cargo "${nombre}"? Los usuarios con este cargo perderán el acceso.`)) return;
    setEliminando(id);
    try {
      await call("DELETE", `/admin/cargos/${id}`);
      setMsg({ type: "success", text: `Cargo "${nombre}" eliminado.` });
      recargarCargos();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setEliminando(null);
    }
  };

  return (
    <div>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float: "right", cursor: "pointer", opacity: 0.6 }}>✕</span>
        </div>
      )}
      <div style={S.card}>
        <div style={S.cardTitle}>Nuevo cargo</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder="Nombre del cargo (ej: Residente de obra)"
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            onKeyDown={e => e.key === "Enter" && crear()}
          />
          <button style={{ ...S.btn("primary"), whiteSpace: "nowrap" }} onClick={crear}>
            + Agregar
          </button>
        </div>
      </div>
      <table style={S.table}>
        <thead>
          <tr>
            {["#", "Nombre del cargo", "Acción"].map(h => <th key={h} style={S.th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {cargos.map((c, i) => (
            <tr key={c.id}>
              <td style={{ ...tdStyle, color: col.textMuted, width: 40 }}>{i + 1}</td>
              <td style={tdStyle}><span style={{ color: col.textTable }}>{c.nombre}</span></td>
              <td style={tdStyle}>
                <button style={S.btn("danger", true)} disabled={eliminando === c.id} onClick={() => eliminar(c.id, c.nombre)}>
                  {eliminando === c.id ? "..." : "Eliminar"}
                </button>
              </td>
            </tr>
          ))}
          {cargos.length === 0 && (
            <tr><td colSpan={3} style={{ ...tdStyle, ...S.empty }}>Sin cargos registrados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── SECCIÓN 3: Matriz de permisos ─────────────────────────────────────────
function SeccionPermisos({ call, cargos, theme }) {
  const [cargoId, setCargoId] = useState("");
  const [funciones, setFunciones] = useState([]);
  const [permisos, setPermisos] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const col = C(theme);

  const cargarPermisos = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const [fns, perms] = await Promise.all([
        call("GET", "/funciones").catch(() => []),
        call("GET", `/admin/permisos/${id}`).catch(() => []),
      ]);
      setFunciones(fns);
      const mapa = {};
      fns.forEach(f => {
        mapa[f.id] = {};
        ACCIONES.forEach(a => { mapa[f.id][a] = false; });
      });
      perms.forEach(p => {
        if (mapa[p.funcion_id]) {
          ACCIONES.forEach(a => {
            if (p[a] !== undefined) mapa[p.funcion_id][a] = p[a];
          });
        }
      });
      setPermisos(mapa);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { cargarPermisos(cargoId); }, [cargoId, cargarPermisos]);

  const togglePermiso = (funcion_id, accion) => {
    setPermisos(p => ({ ...p, [funcion_id]: { ...p[funcion_id], [accion]: !p[funcion_id][accion] } }));
  };

  const toggleFilaCompleta = (funcion_id) => {
    const fila = permisos[funcion_id] || {};
    const todoActivo = ACCIONES.every(a => fila[a]);
    setPermisos(p => ({ ...p, [funcion_id]: Object.fromEntries(ACCIONES.map(a => [a, !todoActivo])) }));
  };

  const guardar = async () => {
    if (!cargoId) return;
    setSaving(true);
    try {
      const payload = funciones.map(f => ({
        cargo_id: parseInt(cargoId),
        funcion_id: f.id,
        ...Object.fromEntries(ACCIONES.map(a => [a, permisos[f.id]?.[a] ?? false])),
      }));
      await call("POST", "/admin/permisos", payload);
      setMsg({ type: "success", text: "Permisos guardados correctamente." });
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const accionColor = {
    ver: "#8acdd8", crear: "#22c55e", editar: "#f59e0b",
    eliminar: "#ef4444", validar: "#a78bfa", exportar: "#38bdf8",
  };

  const tdStyle = S.td(theme);

  return (
    <div>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float: "right", cursor: "pointer", opacity: 0.6 }}>✕</span>
        </div>
      )}
      <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{ color: col.textSecondary, fontSize: 13, whiteSpace: "nowrap" }}>Cargo a configurar:</div>
        <select style={{ ...S.select, flex: 1, maxWidth: 280 }} value={cargoId} onChange={e => setCargoId(e.target.value)}>
          <option value="">-- Selecciona un cargo --</option>
          {cargos.filter(c => c.nombre.toLowerCase() !== "desarrollador").map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {cargoId && (
          <button style={S.btn("primary", true)} onClick={guardar} disabled={saving}>
            {saving ? "Guardando..." : "💾 Guardar cambios"}
          </button>
        )}
      </div>
      {cargoId && !loading && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {ACCIONES.map(a => (
            <span key={a} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${accionColor[a]}18`, border: `1px solid ${accionColor[a]}44`, color: accionColor[a], fontWeight: 600, textTransform: "capitalize" }}>
              {a}
            </span>
          ))}
        </div>
      )}
      {!cargoId ? (
        <div style={S.empty}>Selecciona un cargo para configurar su matriz de permisos.</div>
      ) : loading ? (
        <div style={S.empty}><div style={{ color: "#00afc5" }}>Cargando permisos...</div></div>
      ) : funciones.length === 0 ? (
        <div style={S.empty}>No hay funciones registradas en el sistema.</div>
      ) : (
        <div style={{ background: "#081318", borderRadius: 8, border: "1px solid rgba(0,175,197,0.1)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: `220px repeat(${ACCIONES.length}, 1fr) 80px`, background: "#06101a", borderBottom: "1px solid rgba(0,175,197,0.15)" }}>
            <div style={{ ...S.th, padding: "12px 16px" }}>Función</div>
            {ACCIONES.map(a => (
              <div key={a} style={{ ...S.th, textAlign: "center", padding: "12px 4px", color: accionColor[a] }}>{a}</div>
            ))}
            <div style={{ ...S.th, textAlign: "center" }}>Todo</div>
          </div>
          {funciones.map((f, idx) => {
            const fila = permisos[f.id] || {};
            const todoActivo = ACCIONES.every(a => fila[a]);
            return (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: `220px repeat(${ACCIONES.length}, 1fr) 80px`, background: idx % 2 === 0 ? "transparent" : "rgba(0,175,197,0.025)", borderBottom: "1px solid rgba(255,255,255,0.03)", alignItems: "center" }}>
                <div style={{ ...tdStyle, padding: "10px 16px" }}>
                  <span style={{ color: "#8acdd8", fontSize: 13 }}>{f.nombre}</span>
                  {f.descripcion && <div style={{ fontSize: 11, color: "#2a5a6a", marginTop: 1 }}>{f.descripcion}</div>}
                </div>
                {ACCIONES.map(a => (
                  <div key={a} style={{ textAlign: "center", padding: "10px 4px" }}>
                    <div onClick={() => togglePermiso(f.id, a)} style={{ width: 22, height: 22, borderRadius: 5, margin: "0 auto", cursor: "pointer", border: `1.5px solid ${fila[a] ? accionColor[a] : "rgba(255,255,255,0.1)"}`, background: fila[a] ? `${accionColor[a]}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: accionColor[a], transition: "all 0.15s" }}>
                      {fila[a] ? "✓" : ""}
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: "center", padding: "10px 4px" }}>
                  <div onClick={() => toggleFilaCompleta(f.id)} title={todoActivo ? "Desactivar todos" : "Activar todos"} style={{ width: 22, height: 22, borderRadius: 5, margin: "0 auto", cursor: "pointer", border: `1.5px solid ${todoActivo ? "#00afc5" : "rgba(255,255,255,0.12)"}`, background: todoActivo ? "rgba(0,175,197,0.2)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#00afc5", transition: "all 0.15s" }}>
                    {todoActivo ? "★" : "☆"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── SECCIÓN LOGS ─────────────────────────────────────────────────────────────
function SeccionLogs({ call, theme }) {
  const col = C(theme)
  const API = "https://claracore-backend.azurewebsites.net"
  const token = localStorage.getItem("cc_token") || sessionStorage.getItem("cc_token")

  const [logs,          setLogs]          = useState([])
  const [usuarios,      setUsuarios]      = useState([])
  const [loading,       setLoading]       = useState(false)
  const [logSelec,      setLogSelec]      = useState(null)
  const [historial,     setHistorial]     = useState([])
  const [histLoading,   setHistLoading]   = useState(false)

  // Filtros
  const [filtUsuario,   setFiltUsuario]   = useState("")
  const [filtModulo,    setFiltModulo]    = useState("")
  const [filtAccion,    setFiltAccion]    = useState("")
  const [filtDesde,     setFiltDesde]     = useState("")
  const [filtHasta,     setFiltHasta]     = useState("")
  const [offset,        setOffset]        = useState(0)
  const LIMIT = 50

  const MODULOS = ["AUTH","PRESUPUESTO","COBRO","USUARIOS","CONTRATOS","PERMISOS","PRECIOS"]
  const ACCIONES = ["LOGIN","APROBAR","RECHAZAR","EDITAR","RECALCULAR","VALIDAR","IMPORTAR","CREAR","ELIMINAR"]
  const ACCION_COLOR = {
    LOGIN:"#0077B6", APROBAR:"#10B981", RECHAZAR:"#EF4444",
    EDITAR:"#F59E0B", RECALCULAR:"#7C3AED", VALIDAR:"#00A896",
    IMPORTAR:"#2E86AB", CREAR:"#16A34A", ELIMINAR:"#DC2626"
  }

  useEffect(() => {
    fetch(`${API}/logs/usuarios-lista`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setUsuarios).catch(() => {})
  }, [])

  useEffect(() => { cargarLogs(0) }, [filtUsuario, filtModulo, filtAccion, filtDesde, filtHasta])

  useEffect(() => {
    const iv = setInterval(() => cargarLogs(offset), 30000)
    return () => clearInterval(iv)
  }, [offset, filtUsuario, filtModulo, filtAccion, filtDesde, filtHasta])

  async function cargarLogs(off = 0) {
    setLoading(true); setOffset(off)
    const params = new URLSearchParams({ limit: LIMIT, offset: off })
    if (filtUsuario) params.set("usuario_id", filtUsuario)
    if (filtModulo)  params.set("modulo",     filtModulo)
    if (filtAccion)  params.set("accion",     filtAccion)
    if (filtDesde)   params.set("fecha_desde",filtDesde)
    if (filtHasta)   params.set("fecha_hasta",filtHasta)
    const data = await fetch(`${API}/logs?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).catch(() => [])
    setLogs(data); setLoading(false)
  }

  async function abrirHistorial(log) {
    setLogSelec(log); setHistLoading(true); setHistorial([])
    if (log.entidad_tipo && log.entidad_id) {
      const data = await fetch(`${API}/logs/entidad/${log.entidad_tipo}/${log.entidad_id}`,
        { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : []).catch(() => [])
      setHistorial(data)
    }
    setHistLoading(false)
  }

  const fmtFecha = iso => { try { const utc = iso.endsWith("Z") ? iso : iso + "Z"; return new Date(utc).toLocaleString("es-CO", { dateStyle:"short", timeStyle:"short", timeZone:"America/Bogota" }) } catch { return iso } }
  const tdS = { padding:"8px 10px", fontSize:12, borderBottom:`1px solid ${col.border}`, color: col.textTable }
  const thS = { padding:"8px 10px", fontSize:11, fontWeight:700, color: col.textMuted, borderBottom:`1px solid ${col.border}`, textAlign:"left", whiteSpace:"nowrap" }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16, padding:"12px 16px", background: col.bgCard, borderRadius:10, border:`1px solid ${col.border}` }}>
        <select value={filtUsuario} onChange={e => setFiltUsuario(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12, cursor:"pointer" }}>
          <option value="">👤 Todos los usuarios</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre} · {u.cargo}</option>)}
        </select>
        <select value={filtModulo} onChange={e => setFiltModulo(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12, cursor:"pointer" }}>
          <option value="">📦 Todos los módulos</option>
          {MODULOS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtAccion} onChange={e => setFiltAccion(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12, cursor:"pointer" }}>
          <option value="">⚡ Todas las acciones</option>
          {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" value={filtDesde} onChange={e => setFiltDesde(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12 }} />
        <input type="date" value={filtHasta} onChange={e => setFiltHasta(e.target.value)}
          style={{ background: col.inputBg, border:`1px solid ${col.border}`, borderRadius:6, padding:"5px 10px", color: col.textTable, fontSize:12 }} />
        <button onClick={() => { setFiltUsuario(""); setFiltModulo(""); setFiltAccion(""); setFiltDesde(""); setFiltHasta("") }}
          style={{ background:"#EF444422", border:"1px solid #EF444466", borderRadius:6, padding:"5px 12px", color:"#EF4444", fontSize:11, fontWeight:700, cursor:"pointer" }}>
          ✕ Limpiar
        </button>
        <button onClick={() => cargarLogs(0)}
          style={{ background:"#0077B622", border:"1px solid #0077B666", borderRadius:6, padding:"5px 12px", color:"#0077B6", fontSize:11, fontWeight:700, cursor:"pointer" }}>
          🔄 Actualizar
        </button>
        <span style={{ marginLeft:"auto", fontSize:12, color: col.textMuted, alignSelf:"center" }}>
          {logs.length} registros · click para ver historial
        </span>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color: col.textMuted }}>⏳ Cargando...</div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead style={{ background: col.bgCard }}>
              <tr>
                {["Fecha","Usuario","Cargo","Módulo","Acción","Entidad","Contrato","Resultado"].map(h => (
                  <th key={h} style={thS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={8} style={{ ...tdS, textAlign:"center", padding:40, color: col.textMuted }}>Sin registros</td></tr>
              ) : logs.map((log, i) => (
                <tr key={log.id} onClick={() => abrirHistorial(log)}
                  style={{ cursor:"pointer", background:"transparent", transition:"background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = col.hover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={tdS}>{fmtFecha(log.created_at)}</td>
                  <td style={{ ...tdS, fontWeight:600 }}>{log.usuario_nombre}</td>
                  <td style={{ ...tdS, color: col.textMuted }}>{log.cargo_nombre}</td>
                  <td style={tdS}>
                    <span style={{ background: col.bgCard, border:`1px solid ${col.border}`, borderRadius:4, padding:"2px 8px", fontSize:11 }}>
                      {log.modulo}
                    </span>
                  </td>
                  <td style={tdS}>
                    <span style={{ background: (ACCION_COLOR[log.accion]||"#666")+"22", color: ACCION_COLOR[log.accion]||"#666", border:`1px solid ${(ACCION_COLOR[log.accion]||"#666")}44`, borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>
                      {log.accion}
                    </span>
                  </td>
                  <td style={{ ...tdS, color: col.textMuted, fontSize:11 }}>
                    {log.entidad_tipo && `${log.entidad_tipo} #${log.entidad_id}`}
                  </td>
                  <td style={{ ...tdS, fontSize:11 }}>{log.contrato_numero || "—"}</td>
                  <td style={tdS}>
                    <span style={{ color: log.resultado === "ok" ? "#10B981" : "#EF4444", fontWeight:700, fontSize:11 }}>
                      {log.resultado === "ok" ? "✓" : "✗"} {log.resultado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:12, justifyContent:"center" }}>
        <button onClick={() => cargarLogs(Math.max(0, offset - LIMIT))} disabled={offset === 0}
          style={{ background:"transparent", border:`1px solid ${col.border}`, borderRadius:6, padding:"4px 14px", cursor: offset===0?"default":"pointer", color: offset===0?col.textMuted:col.textTable }}>‹ Anterior</button>
        <span style={{ fontSize:12, color: col.textMuted }}>Página {Math.floor(offset/LIMIT)+1}</span>
        <button onClick={() => cargarLogs(offset + LIMIT)} disabled={logs.length < LIMIT}
          style={{ background:"transparent", border:`1px solid ${col.border}`, borderRadius:6, padding:"4px 14px", cursor: logs.length<LIMIT?"default":"pointer", color: logs.length<LIMIT?col.textMuted:col.textTable }}>Siguiente ›</button>
      </div>

      {/* Modal historial */}
      {logSelec && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => setLogSelec(null)}>
          <div style={{ background: col.bgCard, border:`1px solid ${col.border}`, borderRadius:16, padding:28, width:620, maxWidth:"95vw", maxHeight:"80vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.35)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color: col.textTable }}>
                  📋 Historial — {logSelec.entidad_tipo} #{logSelec.entidad_id}
                </div>
                <div style={{ fontSize:11, color: col.textMuted, marginTop:2 }}>
                  {logSelec.modulo} · {logSelec.accion} · {fmtFecha(logSelec.created_at)}
                </div>
              </div>
              <button onClick={() => setLogSelec(null)} style={{ background:"transparent", border:"none", fontSize:18, cursor:"pointer", color: col.textMuted }}>✕</button>
            </div>

            {/* Detalle del log seleccionado */}
            {logSelec.detalle && Object.keys(typeof logSelec.detalle === 'string' ? JSON.parse(logSelec.detalle) : logSelec.detalle).length > 0 && (
              <div style={{ background: col.bg, borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12 }}>
                <div style={{ fontWeight:700, color: col.textMuted, fontSize:10, letterSpacing:"0.5px", marginBottom:6 }}>DETALLE DE ESTA ACCIÓN</div>
                {Object.entries(typeof logSelec.detalle === 'string' ? JSON.parse(logSelec.detalle) : logSelec.detalle).map(([k,v]) => (
                  <div key={k} style={{ display:"flex", gap:8, marginBottom:3 }}>
                    <span style={{ color: col.textMuted, minWidth:120 }}>{k}:</span>
                    <span style={{ color: col.textTable, fontWeight:500 }}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Historial completo de la entidad */}
            <div style={{ fontWeight:700, color: col.textMuted, fontSize:10, letterSpacing:"0.5px", marginBottom:8 }}>
              HISTORIAL COMPLETO DE ESTA ENTIDAD
            </div>
            <div style={{ overflowY:"auto", flex:1, display:"flex", flexDirection:"column", gap:8 }}>
              {histLoading ? (
                <div style={{ textAlign:"center", padding:20, color: col.textMuted }}>⏳ Cargando historial...</div>
              ) : historial.length === 0 ? (
                <div style={{ textAlign:"center", padding:20, color: col.textMuted }}>Sin historial adicional</div>
              ) : historial.map((h, i) => {
                const color = ACCION_COLOR[h.accion] || "#666"
                const esActual = h.id === logSelec.id
                return (
                  <div key={h.id} style={{ background: esActual ? color+"11" : col.bg, border:`1px solid ${esActual ? color+"44" : col.border}`, borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ background: color+"22", color, border:`1px solid ${color}44`, borderRadius:20, padding:"1px 8px", fontSize:10, fontWeight:700 }}>{h.accion}</span>
                        <span style={{ fontSize:11, fontWeight:600, color: col.textTable }}>{h.usuario_nombre}</span>
                        <span style={{ fontSize:10, color: col.textMuted }}>· {h.cargo_nombre}</span>
                      </div>
                      <span style={{ fontSize:10, color: col.textMuted }}>{fmtFecha(h.created_at)}</span>
                    </div>
                    {h.detalle && Object.keys(h.detalle).length > 0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 16px", marginTop:4 }}>
                        {Object.entries(typeof h.detalle === 'string' ? JSON.parse(h.detalle) : h.detalle).slice(0,5).map(([k,v]) => (
                          <span key={k} style={{ fontSize:10, color: col.textMuted }}>
                            {k}: <strong style={{ color: col.textTable }}>{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                    {esActual && <div style={{ fontSize:9, color, fontWeight:700, marginTop:4 }}>← ACCIÓN SELECCIONADA</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SECCIÓN 4: Reset de Claves ────────────────────────────────────────────
function SeccionResets({ call, theme }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tempPasswords, setTempPasswords] = useState({});
  const [msg, setMsg] = useState(null);
  const col = C(theme);
  const tdStyle = S.td(theme);

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setSolicitudes(await call("GET", "/admin/reset-requests")); }
    catch (e) { if (!silent) setMsg({ type: "error", text: e.message }); }
    finally { if (!silent) setLoading(false); }
  }, [call]);

  useEffect(() => { cargar(); }, [cargar]);
  // Auto-refresh cada 30 s — el admin ve solicitudes nuevas sin recargar
  usePolling(() => cargar(true), 30000);

  const autorizar = async (id) => {
    const temp = tempPasswords[id];
    if (!temp || temp.length < 6) { setMsg({ type: "error", text: "Ingresa una contraseña temporal de mínimo 6 caracteres" }); return; }
    try {
      await call("PUT", `/admin/reset-requests/${id}/autorizar`, { contrasena_temporal: temp });
      setMsg({ type: "success", text: "Reset autorizado. El usuario ya puede cambiar su contraseña." });
      cargar();
    } catch (e) { setMsg({ type: "error", text: e.message }); }
  };

  return (
    <div>
      {msg && <div style={S.alert(msg.type)}>{msg.text}<span onClick={() => setMsg(null)} style={{ float: "right", cursor: "pointer", opacity: 0.6 }}>✕</span></div>}
      {loading ? <div style={S.empty}>Cargando...</div>
      : solicitudes.length === 0 ? (
        <div style={S.empty}><div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>No hay solicitudes de reset pendientes.</div>
      ) : (
        <table style={S.table}>
          <thead><tr>{["Correo", "Fecha solicitud", "Contraseña temporal", "Acción"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {solicitudes.map(s => (
              <tr key={s.id}>
                <td style={tdStyle}><div style={{ color: col.textPrimary, fontWeight: 500 }}>{s.email}</div></td>
                <td style={tdStyle}><span style={{ color: col.textSecondary }}>{new Date(s.created_at).toLocaleDateString("es-CO")}</span></td>
                <td style={tdStyle}>
                  <input style={{ ...S.input, maxWidth: 180 }} type="text" placeholder="Ej: Temp1234"
                    value={tempPasswords[s.id] || ""}
                    onChange={e => setTempPasswords(p => ({ ...p, [s.id]: e.target.value }))} />
                </td>
                <td style={tdStyle}>
                  <button style={S.btn("success", true)} onClick={() => autorizar(s.id)}>✓ Autorizar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── SECCIÓN 5: Contratos ──────────────────────────────────────────────────
function SeccionContratos({ call, contratos, recargarContratos, perms = { crear: false, editar: false } }) {
  const FORM_VACIO = { numero: '', objeto: '', contratista: '', nit: '', interventoria: '', logo_contratista: '', logo_interventoria: '' };
  const [form, setForm] = useState(FORM_VACIO);
  const [editandoId, setEditandoId] = useState(null); // null = crear, number = editar
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [togglingFase, setTogglingFase] = useState(null); // id del contrato en proceso

  function handleLogo(campo, e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, [campo]: ev.target.result }));
    reader.readAsDataURL(file);
  }

  function iniciarEdicion(c) {
    setEditandoId(c.id);
    setForm({
      numero: c.numero || '', objeto: c.objeto || '',
      contratista: c.contratista || '', nit: c.nit || '',
      interventoria: c.interventoria || '',
      logo_contratista: c.logo_contratista || '',
      logo_interventoria: c.logo_interventoria || '',
    });
    setMsg(null);
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setMsg(null);
  }

  async function toggleFase(c) {
    const nuevaFase = (c.fase || 'PRESUPUESTO') === 'PRESUPUESTO' ? 'LIQUIDACION' : 'PRESUPUESTO';
    if (!window.confirm(`¿Cambiar el contrato "${c.numero}" a fase ${nuevaFase}?\n\n${nuevaFase === 'LIQUIDACION' ? 'Activará el tab de Análisis de Liquidación en el Dashboard.' : 'Desactivará el tab de Análisis de Liquidación.'}`)) return;
    setTogglingFase(c.id);
    try {
      await call("PUT", `/contratos/${c.id}`, { fase: nuevaFase });
      setMsg({ type: 'success', text: `Contrato "${c.numero}" cambiado a fase ${nuevaFase}` });
      recargarContratos();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Error al cambiar fase' });
    } finally { setTogglingFase(null); }
  }

  async function handleGuardar() {
    if (!form.numero || !form.contratista) { setMsg({ type: 'error', text: 'Número y contratista son obligatorios' }); return; }
    setSaving(true); setMsg(null);
    try {
      if (editandoId) {
        await call("PUT", `/contratos/${editandoId}`, form);
        setMsg({ type: 'success', text: 'Contrato actualizado correctamente' });
      } else {
        await call("POST", "/contratos", form);
        setMsg({ type: 'success', text: 'Contrato creado correctamente' });
      }
      setForm(FORM_VACIO);
      setEditandoId(null);
      recargarContratos();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Error al guardar contrato' });
    } finally { setSaving(false); }
  }

  const inp = { width: '100%', background: '#0a1628', border: '1.5px solid #1E3A5F', borderRadius: 8, padding: '9px 12px', color: '#E0F2FE', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 12 };
  const lbl = { fontSize: 11, fontWeight: 700, color: '#4a7a87', letterSpacing: 1, display: 'block', marginBottom: 4 };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* FORMULARIO */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#00afc5' }}>
              {editandoId ? '✏️ Editar Contrato' : '➕ Nuevo Contrato'}
            </div>
            {editandoId && (
              <button onClick={cancelarEdicion} style={{ background: 'transparent', border: '1px solid rgba(0,175,197,0.3)', borderRadius: 6, padding: '4px 12px', color: '#8acdd8', fontSize: 12, cursor: 'pointer' }}>
                ← Cancelar
              </button>
            )}
          </div>
          <label style={lbl}>NÚMERO DE CONTRATO *</label>
          <input style={inp} placeholder="Ej: IDU-1551-2017" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} />
          <label style={lbl}>OBJETO DEL CONTRATO</label>
          <input style={inp} placeholder="Descripción del objeto contractual" value={form.objeto} onChange={e => setForm(f => ({ ...f, objeto: e.target.value }))} />
          <label style={lbl}>CONTRATISTA *</label>
          <input style={inp} placeholder="Razón social" value={form.contratista} onChange={e => setForm(f => ({ ...f, contratista: e.target.value }))} />
          <label style={lbl}>NIT CONTRATISTA</label>
          <input style={inp} placeholder="Ej: 900.123.456-7" value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} />
          <label style={lbl}>INTERVENTORÍA</label>
          <input style={inp} placeholder="Razón social interventoría" value={form.interventoria} onChange={e => setForm(f => ({ ...f, interventoria: e.target.value }))} />
          <label style={lbl}>LOGO CONTRATISTA</label>
          <label style={{ display: 'block', background: '#0a1628', border: '2px dashed #1E3A5F', borderRadius: 8, padding: 12, textAlign: 'center', cursor: 'pointer', color: '#4a7a87', fontSize: 12, marginBottom: 12 }}>
            {form.logo_contratista ? '✅ Logo cargado' : '📂 Cargar logo contratista'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogo('logo_contratista', e)} />
          </label>
          <label style={lbl}>LOGO INTERVENTORÍA</label>
          <label style={{ display: 'block', background: '#0a1628', border: '2px dashed #1E3A5F', borderRadius: 8, padding: 12, textAlign: 'center', cursor: 'pointer', color: '#4a7a87', fontSize: 12, marginBottom: 16 }}>
            {form.logo_interventoria ? '✅ Logo cargado' : '📂 Cargar logo interventoría'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogo('logo_interventoria', e)} />
          </label>
          {msg && <div style={{ background: msg.type === 'error' ? '#2a0a0a' : '#0a2a1a', color: msg.type === 'error' ? '#f87171' : '#4ade80', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{msg.text}</div>}
        {(editandoId ? perms?.editar : perms?.crear) && (
          <button onClick={handleGuardar} disabled={saving} style={{ background: '#00afc5', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontSize: 13 }}>
            {saving ? 'Guardando...' : (editandoId ? 'Actualizar Contrato' : 'Guardar Contrato')}
          </button>
        )}
        </div>

        {/* LISTA DE CONTRATOS */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#00afc5', marginBottom: 20 }}>📋 Contratos registrados</div>
          {contratos.length === 0 ? (
            <div style={{ color: '#4a7a87', fontSize: 13 }}>No hay contratos registrados</div>
          ) : contratos.map(c => (
            <div key={c.id} style={{ background: editandoId === c.id ? 'rgba(0,175,197,0.08)' : '#081318', border: `1px solid ${editandoId === c.id ? 'rgba(0,175,197,0.4)' : 'rgba(0,175,197,0.15)'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#00afc5', fontSize: 13 }}>{c.numero}</div>
                  <div style={{ color: '#8acdd8', fontSize: 12, marginTop: 2 }}>{c.contratista}</div>
                  {c.interventoria && <div style={{ color: '#4a7a87', fontSize: 11, marginTop: 2 }}>Interventoría: {c.interventoria}</div>}
                  {/* Badge de fase */}
                  <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: (c.fase || 'PRESUPUESTO') === 'LIQUIDACION' ? 'rgba(245,158,11,0.12)' : 'rgba(0,175,197,0.10)', border: `1px solid ${(c.fase || 'PRESUPUESTO') === 'LIQUIDACION' ? 'rgba(245,158,11,0.4)' : 'rgba(0,175,197,0.3)'}`, borderRadius: 20, padding: '3px 10px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: (c.fase || 'PRESUPUESTO') === 'LIQUIDACION' ? '#F59E0B' : '#00afc5', letterSpacing: 1 }}>
                      {(c.fase || 'PRESUPUESTO') === 'LIQUIDACION' ? '⚖️ LIQUIDACIÓN' : '📋 PRESUPUESTO'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {c.logo_contratista && <img src={c.logo_contratista} alt="logo" style={{ height: 28, borderRadius: 4, background: '#fff', padding: 2 }} />}
                    {c.logo_interventoria && <img src={c.logo_interventoria} alt="logo" style={{ height: 28, borderRadius: 4, background: '#fff', padding: 2 }} />}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  {/* Toggle PRESUPUESTO / LIQUIDACIÓN */}
                  {perms?.editar && (
                    <div style={{ display: 'flex', gap: 0, background: '#0a1628', border: '1px solid rgba(0,175,197,0.25)', borderRadius: 8, overflow: 'hidden' }}>
                      {['PRESUPUESTO', 'LIQUIDACION'].map(fase => {
                        const activo = (c.fase || 'PRESUPUESTO') === fase;
                        const col = fase === 'LIQUIDACION' ? '#F59E0B' : '#00afc5';
                        return (
                          <button key={fase} disabled={activo || togglingFase === c.id}
                            onClick={() => toggleFase(c)}
                            style={{ background: activo ? col + '22' : 'transparent', color: activo ? col : '#4a7a87', border: 'none', borderRight: fase === 'PRESUPUESTO' ? '1px solid rgba(0,175,197,0.2)' : 'none', padding: '5px 10px', fontSize: 10, fontWeight: activo ? 700 : 400, cursor: activo ? 'default' : 'pointer', letterSpacing: 0.5, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                            {fase === 'PRESUPUESTO' ? '📋 Presupuesto' : '⚖️ Liquidación'}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                  {perms?.editar && (
                    <button
                      onClick={() => editandoId === c.id ? cancelarEdicion() : iniciarEdicion(c)}
                      style={{ background: 'transparent', border: '1px solid rgba(0,175,197,0.3)', borderRadius: 6, padding: '4px 10px', color: '#00afc5', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {editandoId === c.id ? '✕' : '✏️ Editar'}
                    </button>
                  )}
                  {perms?.eliminar && (
                    <button
                      onClick={async () => {
                        if (!window.confirm(`¿Eliminar contrato ${c.numero}? Esta acción no se puede deshacer.`)) return;
                        try {
                          await call("DELETE", `/contratos/${c.id}`);
                          recargarContratos();
                        } catch (e) { setMsg({ type: 'error', text: e.message }); }
                      }}
                      style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 10px', color: '#ef4444', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      🗑 Eliminar
                    </button>
                  )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



// ─── SECCIÓN 6: Listado de Precios ────────────────────────────────────────
function SeccionListadoPrecios({ call, user, perms, theme }) {
  const contratoId = user?.contrato_id;
  const [items,            setItems]            = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [msg,              setMsg]              = useState(null);
  const [popup,            setPopup]            = useState(null);
  const [stats,            setStats]            = useState(null);
  const [statsLoading,     setStatsLoading]     = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [recalculando,     setRecalculando]     = useState(false);
  const [showCrear,        setShowCrear]        = useState(false);
  const [crearForm,        setCrearForm]        = useState({ capitulo:"",item_numero:"",descripcion:"",unidad:"",competencia:"",tipo_precio:"",precio_unitario:"",especificacion_tecnica:"",acta_fijacion:"",acta_modificatoria:"",observaciones:"" });
  const [creating,         setCreating]         = useState(false);
  const [uModoCustomC,     setUModoCustomC]     = useState(false);
  const [uModoCustomP,     setUModoCustomP]     = useState(false);
  const [uCustomC,         setUCustomC]         = useState("");
  const [uCustomP,         setUCustomP]         = useState("");
  const [capModoCustomP,   setCapModoCustomP]   = useState(false);
  const [capCustomP,       setCapCustomP]       = useState("");
  const [capModoCustomC,   setCapModoCustomC]   = useState(false);
  const [capCustomC,       setCapCustomC]       = useState("");
  const [filtroTexto,      setFiltroTexto]      = useState("");
  const [filtroCapitulo,   setFiltroCapitulo]   = useState("");
  const [filtroEstado,     setFiltroEstado]     = useState("");

  const col    = C(theme);
  const tdStyle = S.td(theme);

  const UNIDADES    = ["CM","GL","HORA","KG","KM-CARRIL","LT","M","M2","M3","M3-KM","ML","TON","TRAMO","UN","UN/ME","UND"];
  const COMPETENCIAS = ["EAB","ENEL-CODENSA","ETB","Gas Natural","IDU","MOVISTAR"];

  const fmt     = (v) => v != null ? `$${Math.round(Number(v)).toLocaleString("es-CO")}` : "—";
  const cmpNatural = (a, b) => {
    const num = s => parseFloat((s||"").match(/^(\d+(\.\d+)?)/)?.[1] ?? "9999");
    const na = num(a), nb = num(b);
    if (na !== nb) return na - nb;
    return (a||"").localeCompare(b||"", "es");
  };
  const itemsOrdenados = [...items].sort((a, b) => {
    const cc = cmpNatural(a.capitulo, b.capitulo);
    return cc !== 0 ? cc : cmpNatural(a.item_numero, b.item_numero);
  });
  const itemsFiltrados = itemsOrdenados.filter(i => {
    if (filtroTexto    && !((i.descripcion||"")+" "+(i.item_numero||"")).toLowerCase().includes(filtroTexto.toLowerCase())) return false;
    if (filtroCapitulo && (i.capitulo||"") !== filtroCapitulo) return false;
    if (filtroEstado   && (i.estado_precio||"Pendiente") !== filtroEstado) return false;
    return true;
  });
  const capitulosUnicos = [...new Set(items.map(i => i.capitulo).filter(Boolean))].sort(cmpNatural);
  const fmtCant = (v) => v != null ? Number(v).toLocaleString("es-CO", { maximumFractionDigits: 4 }) : "—";

  // ── Carga ──────────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!contratoId) return;
    setLoading(true);
    try { setItems(await call("GET", `/listado-precios/${contratoId}`)); }
    catch (e) { setMsg({ type:"error", text:e.message }); }
    finally { setLoading(false); }
  }, [contratoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar(); }, [cargar]);

  // ── Popup detalle ──────────────────────────────────────────────────────────
  const abrirDetalle = async (item) => {
    setPopup({ ...item });
    setStats(null);
    setUModoCustomP(false);
    setUCustomP("");
    setStatsLoading(true);
    try { setStats(await call("GET", `/listado-precios/item/${item.id}/stats`)); }
    catch { setStats(null); }
    finally { setStatsLoading(false); }
  };

  const setPopupField = (k, v) => setPopup(p => ({ ...p, [k]: v }));

  const cambiarTipoPopup = (tipo) => {
    if (tipo === "Precio Contractual")
      setPopup(p => ({ ...p, tipo_precio:tipo, acta_fijacion:"Contractual", acta_modificatoria:"", estado_precio:"Aprobado" }));
    else
      setPopup(p => ({ ...p, tipo_precio:tipo, acta_fijacion:"", acta_modificatoria:"", estado_precio:"Pendiente" }));
  };

  const guardarEdicion = async () => {
    if (!popup) return;
    setSaving(true);
    try {
      await call("PUT", `/listado-precios/item/${popup.id}`, popup);
      setMsg({ type:"success", text:"✅ Precio actualizado correctamente." });
      const [updated, freshStats] = await Promise.all([
        call("GET", `/listado-precios/${contratoId}`),
        call("GET", `/listado-precios/item/${popup.id}/stats`).catch(() => null),
      ]);
      setItems(updated || []);
      const fresh = (updated || []).find(i => i.id === popup.id);
      if (fresh) setPopup({ ...fresh });
      if (freshStats) setStats(freshStats);
    } catch (e) { setMsg({ type:"error", text:e.message }); }
    finally { setSaving(false); }
  };

  const recalcular = async () => {
    if (!popup) return;
    if (!window.confirm("¿Recalcular todos los registros de cobro de este ítem de Pendiente → Aprobado?")) return;
    setRecalculando(true);
    try {
      const res = await call("POST", `/listado-precios/item/${popup.id}/recalcular`);
      setMsg({ type:"success", text:`✅ ${res.recalculados} registros de cobro actualizados a Aprobado.` });
    } catch (e) { setMsg({ type:"error", text:e.message }); }
    finally { setRecalculando(false); }
  };

  // ── Plantilla CSV ──────────────────────────────────────────────────────────
  const descargarPlantilla = () => {
    const filas = [
      "capitulo,competencia,item_numero,descripcion,unidad,precio_unitario,tipo_precio,especificacion_tecnica,acta_fijacion,acta_modificatoria,observaciones",
      "1.PRELIMINARES,IDU,1.01,REPLANTEO GENERAL,M2,601,Precio Contractual,Descripción técnica del ítem,,,",
      "2.EXCAVACIONES,IDU,2.01,EXCAVACION MECANICA,M3,4819,Precio No Previsto,Descripción técnica,15,3,Ítem adicional aprobado",
    ].join("\n");
    const blob = new Blob(["\uFEFF" + filas], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="plantilla_listado_precios.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── CSV import ─────────────────────────────────────────────────────────────
  const uploadCSV = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = ev.target.result.replace(/\r\n/g,"\n").replace(/\r/g,"\n");
        const lines = raw.split("\n").filter(l => l.trim());
        if (lines.length < 2) { setMsg({ type:"error", text:"El CSV no tiene datos." }); return; }
        const sep = lines[0].includes(";") ? ";" : ",";
        const parseRow = (line) => {
          const vals=[]; let cur=""; let inQ=false;
          for (let i=0;i<line.length;i++){
            const ch=line[i];
            if(ch==='"'){inQ=!inQ;}
            else if(ch===sep&&!inQ){vals.push(cur.trim());cur="";}
            else{cur+=ch;}
          }
          vals.push(cur.trim());
          return vals.map(v=>v.replace(/^"|"$/g,"").trim());
        };
        const CAMPOS={"capitulo":"capitulo","capítulo":"capitulo","competencia":"competencia","item_numero":"item_numero","ítem":"item_numero","item":"item_numero","nro":"item_numero","descripcion":"descripcion","descripción":"descripcion","unidad":"unidad","und":"unidad","precio_unitario":"precio_unitario","precio unitario":"precio_unitario","precio":"precio_unitario","valor":"precio_unitario","valorunitario":"precio_unitario","valor unitario":"precio_unitario","tipo_precio":"tipo_precio","tipo de precio":"tipo_precio","tipoprecio":"tipo_precio","especificacion_tecnica":"especificacion_tecnica","especificación técnica":"especificacion_tecnica","especificacion tecnica":"especificacion_tecnica","acta_fijacion":"acta_fijacion","acta de fijación":"acta_fijacion","acta fijacion":"acta_fijacion","acta_modificatoria":"acta_modificatoria","acta modificatoria":"acta_modificatoria","observaciones":"observaciones","estado_precio":"estado_precio"};
        const rawHeaders=parseRow(lines[0]).map(h=>h.toLowerCase());
        const headers=rawHeaders.map(h=>CAMPOS[h]||h);
        const parsed=lines.slice(1).map(line=>{
          const vals=parseRow(line); const obj={};
          headers.forEach((h,i)=>{if(vals[i]!==undefined&&vals[i]!=="")obj[h]=vals[i];});
          return obj;
        }).filter(r=>r.descripcion||r.item_numero);
        await call("POST",`/listado-precios/${contratoId}/bulk`,parsed);
        setMsg({type:"success",text:`✅ ${parsed.length} ítems cargados correctamente.`});
        cargar();
      } catch(ex){setMsg({type:"error",text:ex.message});}
    };
    reader.readAsText(file,"UTF-8");
    e.target.value="";
  };

  // ── XLSX export ────────────────────────────────────────────────────────────
  const exportarXLSX = () => {
    if (!items.length) return;
    const data = itemsOrdenados.map(i => ({
      "Capítulo":               i.capitulo                || "",
      "Competencia":            i.competencia             || "",
      "Ítem":                   i.item_numero             || "",
      "Descripción":            i.descripcion             || "",
      "Unidad":                 i.unidad                  || "",
      "Valor Unitario":         i.precio_unitario         || 0,
      "Estado":                 i.estado_precio           || "",
      "Tipo de Precio":         i.tipo_precio             || "",
      "Especificación Técnica": i.especificacion_tecnica  || "",
      "Acta de Fijación":       i.acta_fijacion           || "",
      "Acta Modificatoria":     i.acta_modificatoria      || "",
      "Observaciones":          i.observaciones           || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{wch:24},{wch:16},{wch:10},{wch:48},{wch:10},{wch:16},{wch:12},{wch:20},{wch:42},{wch:16},{wch:18},{wch:30}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Listado de Precios");
    XLSX.writeFile(wb, `listado_precios_${contratoId}.xlsx`);
    call("POST", `/listado-precios/${contratoId}/log-exportar`).catch(() => {});
  };

  // ── Crear precio ───────────────────────────────────────────────────────────
  const setCF = (k, v) => setCrearForm(p => ({ ...p, [k]: v }));

  const cambiarTipoCrear = (tipo) => {
    if (tipo === "Precio Contractual")
      setCrearForm(p => ({ ...p, tipo_precio:tipo, acta_fijacion:"Contractual", acta_modificatoria:"" }));
    else
      setCrearForm(p => ({ ...p, tipo_precio:tipo, acta_fijacion:"", acta_modificatoria:"" }));
  };

  const crearPrecio = async () => {
    const { item_numero, descripcion, unidad, tipo_precio, precio_unitario, especificacion_tecnica } = crearForm;
    if (!item_numero||!descripcion||!unidad||!tipo_precio||!precio_unitario||!especificacion_tecnica) {
      setMsg({ type:"error", text:"Complete todos los campos obligatorios (*)." }); return;
    }
    setCreating(true);
    try {
      await call("POST", `/listado-precios/${contratoId}/item`, {
        ...crearForm, precio_unitario: parseFloat(crearForm.precio_unitario) || 0,
      });
      setMsg({ type:"success", text:"✅ Precio creado correctamente." });
      setShowCrear(false);
      setCrearForm({ capitulo:"",item_numero:"",descripcion:"",unidad:"",competencia:"",tipo_precio:"",precio_unitario:"",especificacion_tecnica:"",acta_fijacion:"",acta_modificatoria:"",observaciones:"" });
      setUModoCustomC(false); setUCustomC("");
      cargar();
    } catch(e){ setMsg({ type:"error", text:e.message }); }
    finally { setCreating(false); }
  };

  // ── Variables derivadas ────────────────────────────────────────────────────
  const popupEsContractual = popup?.tipo_precio === "Precio Contractual";
  const popupEsAprobado    = popup?.estado_precio === "Aprobado";
  const crearEsContractual = crearForm.tipo_precio === "Precio Contractual";
  const puedeAprobarNP     = popup && !popupEsContractual &&
    popup.acta_fijacion && popup.acta_fijacion !== "0" &&
    popup.acta_modificatoria && popup.acta_modificatoria !== "0";

  // ── Estilos locales reutilizables ──────────────────────────────────────────
  const labelStyle   = { fontSize:11, color:col.textSecondary, marginBottom:5 };
  const inputStyle   = theme === "light" ? { ...S.input, background:"#FFFFFF", color:"#0d3b52", border:"1px solid #BAE6FD" } : S.input;
  const selectStyle  = theme === "light" ? { ...S.select, background:"#FFFFFF", color:"#0d3b52", border:"1px solid #BAE6FD", width:"100%" } : { ...S.select, width:"100%" };
  const overlayStyle = { position:"fixed",inset:0,zIndex:10001,background:"rgba(5,12,18,0.92)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center" };
  const modalStyle   = (w) => ({ width:`min(${w}px,95vw)`,maxHeight:"92vh",background:theme==="light"?"#F0F9FF":"#0b1920",borderRadius:14,border:"1px solid rgba(0,175,197,0.2)",boxShadow:"0 40px 100px rgba(0,0,0,0.7)",overflow:"hidden",display:"flex",flexDirection:"column" });
  const modalHead    = { padding:"18px 28px 14px",borderBottom:theme==="light"?"1px solid #BAE6FD":"1px solid rgba(0,175,197,0.12)",background:theme==="light"?"#E0F2FE":"#081318",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0 };
  const modalScroll  = { flex:1,overflowY:"auto",padding:"22px 28px",scrollbarWidth:"thin",scrollbarColor:"#1e3a44 transparent",background:theme==="light"?"#F8FAFC":"transparent" };
  const modalFoot    = { padding:"14px 28px",borderTop:theme==="light"?"1px solid #BAE6FD":"1px solid rgba(0,175,197,0.1)",background:theme==="light"?"#E0F2FE":"#081318",display:"flex",justifyContent:"flex-end",gap:10,flexShrink:0 };
  const secTitle     = { fontSize:10,color:"#00afc5",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:14 };
  const divider      = { borderTop:theme==="light"?"1px solid #BAE6FD":"1px solid rgba(0,175,197,0.1)",paddingTop:20,marginBottom:20 };

  const UnidadSelector = ({ value, onChange, modoCustom, setModoCustom, uCustom, setUCustom }) => (
    <div>
      {!modoCustom ? (
        <select style={{ ...S.select,width:"100%" }} value={UNIDADES.includes(value)?value:(value?"__prev__":"")}
          onChange={e => {
            if (e.target.value === "__custom__") { setModoCustom(true); setUCustom(""); onChange(""); }
            else if (e.target.value === "__prev__") { /* mantiene valor */ }
            else onChange(e.target.value);
          }}>
          <option value="">-- Selecciona --</option>
          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          {value && !UNIDADES.includes(value) && <option value="__prev__">{value}</option>}
          <option value="__custom__">+ Agregar unidad...</option>
        </select>
      ) : (
        <div style={{ display:"flex",gap:6 }}>
          <input style={{ ...S.input,padding:"5px 8px",fontSize:12 }} placeholder="Nueva unidad" value={uCustom}
            onChange={e => setUCustom(e.target.value)}
            onKeyDown={e => { if(e.key==="Enter"&&uCustom.trim()){ onChange(uCustom.trim().toUpperCase()); setModoCustom(false); }}} />
          <button style={S.btn("primary",true)} onClick={() => { if(uCustom.trim()){ onChange(uCustom.trim().toUpperCase()); setModoCustom(false); }}}>+</button>
          <button style={S.btn("ghost",true)} onClick={() => setModoCustom(false)}>✕</button>
        </div>
      )}
    </div>
  );

  if (!contratoId) return <div style={S.empty}>No hay contrato activo en tu sesión.</div>;

  return (
    <div>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float:"right",cursor:"pointer",opacity:0.6 }}>✕</span>
        </div>
      )}

      {/* ── Barra de acciones ── */}
      <div style={{ display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center" }}>
        {perms?.crear && <button style={S.btn("primary",true)} onClick={() => setShowCrear(true)}>+ Crear Precio</button>}
        {perms?.crear && (
          <label style={{ ...S.btn("ghost",true),cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4 }}>
            ⬆ Importar CSV
            <input type="file" accept=".csv" style={{ display:"none" }} onChange={uploadCSV} />
          </label>
        )}
        {perms?.exportar && items.length > 0 && (
          <button style={S.btn("ghost",true)} onClick={exportarXLSX}>⬇ Exportar XLSX</button>
        )}
        <button style={S.btn("ghost",true)} onClick={descargarPlantilla} title="Descarga un CSV de ejemplo con todos los campos">📋 Plantilla</button>
        {items.length > 0 && (
          <span style={{ marginLeft:"auto",fontSize:12,color:col.textMuted }}>{items.length.toLocaleString("es-CO")} precios</span>
        )}
      </div>

      {/* ── Filtros ── */}
      {items.length > 0 && !loading && (
        <div style={{ display:"flex",gap:10,flexWrap:"wrap",marginBottom:14,alignItems:"center" }}>
          <input style={{ ...S.input,padding:"6px 10px",fontSize:12,flex:"1 1 180px",maxWidth:260 }}
            placeholder="🔍 Buscar descripción o ítem..." value={filtroTexto}
            onChange={e=>setFiltroTexto(e.target.value)} />
          <select style={{ ...S.select,minWidth:160 }} value={filtroCapitulo}
            onChange={e=>setFiltroCapitulo(e.target.value)}>
            <option value="">Todos los capítulos</option>
            {capitulosUnicos.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select style={{ ...S.select,minWidth:130 }} value={filtroEstado}
            onChange={e=>setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="Aprobado">✓ Aprobado</option>
            <option value="Pendiente">⏳ Pendiente</option>
          </select>
          {(filtroTexto||filtroCapitulo||filtroEstado) && (
            <button style={S.btn("ghost",true)} onClick={()=>{setFiltroTexto("");setFiltroCapitulo("");setFiltroEstado("");}}>✕ Limpiar</button>
          )}
          {(filtroTexto||filtroCapitulo||filtroEstado) && (
            <span style={{ fontSize:12,color:col.textMuted }}>
              {itemsFiltrados.length.toLocaleString("es-CO")} de {items.length.toLocaleString("es-CO")} precios
            </span>
          )}
        </div>
      )}

      {/* ── Grilla ── */}
      {loading ? (
        <div style={S.empty}><span style={{ color:"#00afc5" }}>Cargando...</span></div>
      ) : items.length === 0 ? (
        <div style={S.empty}>No hay precios cargados para este contrato.<br/><span style={{ fontSize:12,color:col.textMuted }}>Usa "Crear Precio" o "Importar CSV".</span></div>
      ) : itemsFiltrados.length === 0 ? (
        <div style={S.empty}>Ningún precio coincide con los filtros aplicados.<br/><span style={{ fontSize:12,color:col.textMuted }}>Prueba ajustando los criterios de búsqueda.</span></div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                {["Capítulo","Competencia","Ítem","Descripción","Unidad","Valor Unitario","Estado"].map((h,i) => (
                  <th key={i} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemsFiltrados.map(item => (
                <tr key={item.id} onClick={() => abrirDetalle(item)} style={{ cursor:"pointer",transition:"background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background="rgba(0,175,197,0.05)"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                  <td style={{ ...tdStyle,color:col.textMuted,fontSize:12,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{item.capitulo||"—"}</td>
                  <td style={{ ...tdStyle,color:col.textMuted,fontSize:12 }}>{item.competencia||"—"}</td>
                  <td style={{ ...tdStyle,color:col.textSecondary,fontWeight:600,fontSize:12 }}>{item.item_numero||"—"}</td>
                  <td style={{ ...tdStyle,color:col.textTable }}>{item.descripcion}</td>
                  <td style={{ ...tdStyle,color:col.textSecondary,fontSize:12 }}>{item.unidad||"—"}</td>
                  <td style={{ ...tdStyle,color:"#22c55e",fontWeight:600,fontSize:12,textAlign:"right" }}>
                    {item.precio_unitario ? `$${Math.round(item.precio_unitario).toLocaleString("es-CO")}` : "—"}
                  </td>
                  <td style={tdStyle}>
                    <span style={S.badge(item.estado_precio==="Aprobado"?"aprobado":"pendiente")}>
                      {item.estado_precio||"Pendiente"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════ POPUP DETALLE ══════════════ */}
      {popup && (
        <div style={overlayStyle} onClick={e => e.target===e.currentTarget && setPopup(null)}>
          <div style={modalStyle(1100)}>

            <div style={modalHead}>
              <div>
                <div style={{ fontSize:10,color:col.textSecondary,letterSpacing:1,textTransform:"uppercase",marginBottom:3 }}>Detalle del Precio</div>
                <div style={{ fontSize:17,fontWeight:700,color:col.textPrimary,fontFamily:"'Rajdhani',sans-serif" }}>
                  {popup.item_numero} — {(popup.descripcion||"").substring(0,55)}{(popup.descripcion||"").length>55?"...":""}
                </div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                <span style={{ ...S.badge(popupEsAprobado?"aprobado":"pendiente"),fontSize:12,padding:"5px 14px" }}>
                  {popupEsAprobado?"✓ Aprobado":"⏳ Pendiente"}
                </span>
                <button style={S.closeBtn} onClick={() => setPopup(null)}>✕</button>
              </div>
            </div>

            <div style={{display:"flex",flex:1,overflow:"hidden"}}>

              {/* ── Panel izquierdo: formulario ── */}
              <div style={{flex:"0 0 56%",padding:"14px 20px",overflowY:"auto",borderRight:theme==="light"?"1px solid #BAE6FD":"1px solid rgba(0,175,197,0.12)"}}>
                <div style={{...secTitle,marginBottom:10}}>Información del Precio</div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <div style={labelStyle}>Capítulo</div>
                    {perms?.editar ? (
                      !capModoCustomP ? (
                        <select style={selectStyle} value={capitulosUnicos.includes(popup.capitulo||"")?popup.capitulo||"":""}
                          onChange={e=>{if(e.target.value==="__custom__"){setCapModoCustomP(true);setCapCustomP("");}else setPopupField("capitulo",e.target.value);}}>
                          <option value="">-- Selecciona --</option>
                          {capitulosUnicos.map(c=><option key={c} value={c}>{c}</option>)}
                          {popup.capitulo && !capitulosUnicos.includes(popup.capitulo) && <option value={popup.capitulo}>{popup.capitulo}</option>}
                          <option value="__custom__">+ Agregar capítulo...</option>
                        </select>
                      ) : (
                        <div style={{display:"flex",gap:6}}>
                          <input style={inputStyle} placeholder="Nuevo capítulo" value={capCustomP} onChange={e=>setCapCustomP(e.target.value)}
                            onKeyDown={e=>{if(e.key==="Enter"&&capCustomP.trim()){setPopupField("capitulo",capCustomP.trim());setCapModoCustomP(false);}}} />
                          <button style={S.btn("primary",true)} onClick={()=>{if(capCustomP.trim()){setPopupField("capitulo",capCustomP.trim());setCapModoCustomP(false);}}}>+</button>
                          <button style={S.btn("ghost",true)} onClick={()=>setCapModoCustomP(false)}>✕</button>
                        </div>
                      )
                    ) : (
                      <input style={{...inputStyle,opacity:0.55}} value={popup.capitulo||""} disabled />
                    )}
                  </div>
                  <div>
                    <div style={labelStyle}>Competencia</div>
                    <select style={{...selectStyle,opacity:perms?.editar?1:0.55}} value={popup.competencia||""} disabled={!perms?.editar} onChange={e=>setPopupField("competencia",e.target.value)}>
                      <option value="">-- Selecciona --</option>
                      {COMPETENCIAS.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <div style={labelStyle}>Ítem *</div>
                    <input style={{...inputStyle,opacity:perms?.editar?1:0.55}} value={popup.item_numero||""} disabled={!perms?.editar} onChange={e=>setPopupField("item_numero",e.target.value)} />
                  </div>
                  <div>
                    <div style={labelStyle}>Tipo de Precio *</div>
                    <select style={{...selectStyle,opacity:perms?.editar?1:0.55}} value={popup.tipo_precio||""} disabled={!perms?.editar} onChange={e=>cambiarTipoPopup(e.target.value)}>
                      <option value="">-- Selecciona --</option>
                      <option value="Precio Contractual">Precio Contractual</option>
                      <option value="Precio No Previsto">Precio No Previsto</option>
                    </select>
                  </div>
                </div>

                <div style={{marginBottom:10}}>
                  <div style={labelStyle}>Descripción *</div>
                  <input style={{...inputStyle,opacity:perms?.editar?1:0.55}} value={popup.descripcion||""} disabled={!perms?.editar} onChange={e=>setPopupField("descripcion",e.target.value)} />
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <div style={labelStyle}>Unidad *</div>
                    {perms?.editar ? (
                      <UnidadSelector value={popup.unidad||""} onChange={v=>setPopupField("unidad",v)}
                        modoCustom={uModoCustomP} setModoCustom={setUModoCustomP}
                        uCustom={uCustomP} setUCustom={setUCustomP} />
                    ) : (
                      <input style={{...inputStyle,opacity:0.55}} value={popup.unidad||""} disabled />
                    )}
                  </div>
                  <div>
                    <div style={labelStyle}>Valor Unitario *</div>
                    <input style={{...inputStyle,opacity:perms?.editar?1:0.55}} type="number" value={popup.precio_unitario||""} disabled={!perms?.editar} onChange={e=>setPopupField("precio_unitario",parseFloat(e.target.value)||0)} />
                  </div>
                  <div>
                    <div style={labelStyle}>Costo Directo</div>
                    <div style={{...inputStyle,opacity:0.5,pointerEvents:"none",color:"#22c55e",fontWeight:600}}>
                      {statsLoading?"...":fmt(stats?Math.round((stats.cant_presupuestada||0)*(popup.precio_unitario||0)):null)}
                    </div>
                  </div>
                </div>

                <div style={{marginBottom:10}}>
                  <div style={labelStyle}>Especificación Técnica *</div>
                  <textarea style={{...inputStyle,resize:"vertical",minHeight:54,opacity:perms?.editar?1:0.55}} value={popup.especificacion_tecnica||""} disabled={!perms?.editar} onChange={e=>setPopupField("especificacion_tecnica",e.target.value)} />
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <div style={labelStyle}>Acta de Fijación {!popupEsContractual?"*":""}</div>
                    <input style={{...inputStyle,opacity:(!perms?.editar||popupEsContractual)?0.45:1}}
                      value={popup.acta_fijacion||""} disabled={!perms?.editar||popupEsContractual}
                      placeholder={popupEsContractual?"Contractual (automático)":"Número de acta"}
                      onChange={e=>setPopupField("acta_fijacion",e.target.value.replace(/[^0-9]/g,""))} />
                  </div>
                  <div>
                    <div style={labelStyle}>Acta Modificatoria {!popupEsContractual?"*":""}</div>
                    <input style={{...inputStyle,opacity:(!perms?.editar||popupEsContractual)?0.45:1}}
                      value={popup.acta_modificatoria||""} disabled={!perms?.editar||popupEsContractual}
                      placeholder={popupEsContractual?"N/A":"Número de acta modificatoria"}
                      onChange={e=>setPopupField("acta_modificatoria",e.target.value.replace(/[^0-9]/g,""))} />
                  </div>
                </div>

                <div>
                  <div style={labelStyle}>Observaciones</div>
                  <textarea style={{...inputStyle,resize:"vertical",minHeight:46,opacity:perms?.editar?1:0.55}} value={popup.observaciones||""} disabled={!perms?.editar} onChange={e=>setPopupField("observaciones",e.target.value)} />
                </div>
              </div>

              {/* ── Panel derecho: balance + validación ── */}
              <div style={{flex:"0 0 44%",padding:"14px 20px",overflowY:"auto",display:"flex",flexDirection:"column",gap:18}}>

                <div>
                  <div style={{...secTitle,marginBottom:10}}>Balance Presupuesto vs Cobro</div>
                  {statsLoading ? (
                    <div style={{color:"#4a7a87",fontSize:13,padding:"6px 0"}}>Calculando estadísticas...</div>
                  ) : stats ? (
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {[
                        { label:"Presupuestado", cant:stats.cant_presupuestada, costo:stats.costo_presupuestado, color:"#00afc5", bg:"rgba(0,175,197,0.06)", border:"rgba(0,175,197,0.2)" },
                        { label:"Cobrado",        cant:stats.cant_cobrada,       costo:stats.costo_cobrado,       color:"#22c55e", bg:"rgba(34,197,94,0.06)",  border:"rgba(34,197,94,0.2)"  },
                        { label:stats.balance_cant>=0?"Disponible":"Excedido",
                          cant:stats.balance_cant, costo:stats.balance_costo,
                          color:stats.balance_cant>=0?"#22c55e":"#ef4444",
                          bg:stats.balance_cant>=0?"rgba(34,197,94,0.06)":"rgba(239,68,68,0.06)",
                          border:stats.balance_cant>=0?"rgba(34,197,94,0.2)":"rgba(239,68,68,0.2)" },
                      ].map(card => (
                        <div key={card.label} style={{background:card.bg,border:`1px solid ${card.border}`,borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:10,color:"#4a7a87",letterSpacing:0.8,textTransform:"uppercase",marginBottom:3}}>{card.label}</div>
                            <div style={{fontSize:18,fontWeight:700,color:card.color}}>{fmtCant(card.cant)}</div>
                            <div style={{fontSize:11,color:"#4a7a87",marginTop:1}}>{popup.unidad||""}</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:10,color:"#4a7a87",marginBottom:2}}>Costo Directo</div>
                            <div style={{fontSize:15,fontWeight:700,color:card.color}}>{fmt(card.costo)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{color:"#4a7a87",fontSize:13}}>No se pudieron cargar las estadísticas.</div>
                  )}
                </div>

                <div style={{borderTop:theme==="light"?"1px solid #BAE6FD":"1px solid rgba(0,175,197,0.1)",paddingTop:14}}>
                  <div style={{...secTitle,marginBottom:10}}>Validación del Precio</div>
                  <div style={{display:"flex",flexDirection:"column",gap:12,alignItems:"flex-start"}}>
                    <span style={{...S.badge(popupEsAprobado?"aprobado":"pendiente"),fontSize:13,padding:"6px 16px"}}>
                      {popupEsAprobado?"✓ Precio Aprobado":"⏳ Pendiente de Aprobación"}
                    </span>
                    {perms?.validar && !popupEsAprobado && !popupEsContractual && (
                      <span style={{fontSize:12,color:puedeAprobarNP?"#22c55e":"#f59e0b",lineHeight:1.6}}>
                        {puedeAprobarNP
                          ? "✓ Condiciones cumplidas — guarda los cambios para aprobar"
                          : "⚠ Complete Acta de Fijación y Acta Modificatoria (número > 0) para aprobar"}
                      </span>
                    )}
                    {perms?.validar && popupEsAprobado && (
                      <button style={S.btn("primary",true)} onClick={recalcular} disabled={recalculando}>
                        {recalculando?"Recalculando...":"⟳ Recalcular Cobros"}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div style={modalFoot}>
              <button style={S.btn("ghost")} onClick={() => setPopup(null)}>Cerrar</button>
              {perms?.editar && (
                <button style={S.btn("primary")} onClick={guardarEdicion} disabled={saving}>
                  {saving?"Guardando...":"💾 Guardar cambios"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL CREAR PRECIO ══════════════ */}
      {showCrear && (
        <div style={overlayStyle} onClick={e => e.target===e.currentTarget && setShowCrear(false)}>
          <div style={modalStyle(760)}>

            <div style={modalHead}>
              <div>
                <div style={{ fontSize:17,fontWeight:700,color:col.textPrimary,fontFamily:"'Rajdhani',sans-serif" }}>Crear Nuevo Precio</div>
                <div style={{ fontSize:11,color:col.textSecondary,marginTop:2 }}>Complete los campos para agregar un precio al listado</div>
              </div>
              <button style={S.closeBtn} onClick={() => setShowCrear(false)}>✕</button>
            </div>

            <div style={modalScroll}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
                <div>
                  <div style={labelStyle}>Capítulo</div>
                  {!capModoCustomC ? (
                    <select style={selectStyle} value={capitulosUnicos.includes(crearForm.capitulo)?crearForm.capitulo:""}
                      onChange={e=>{if(e.target.value==="__custom__"){setCapModoCustomC(true);setCapCustomC("");}else setCF("capitulo",e.target.value);}}>
                      <option value="">-- Selecciona --</option>
                      {capitulosUnicos.map(c=><option key={c} value={c}>{c}</option>)}
                      <option value="__custom__">+ Agregar capítulo...</option>
                    </select>
                  ) : (
                    <div style={{display:"flex",gap:6}}>
                      <input style={inputStyle} placeholder="Nuevo capítulo" value={capCustomC} onChange={e=>setCapCustomC(e.target.value)}
                        onKeyDown={e=>{if(e.key==="Enter"&&capCustomC.trim()){setCF("capitulo",capCustomC.trim());setCapModoCustomC(false);}}} />
                      <button style={S.btn("primary",true)} onClick={()=>{if(capCustomC.trim()){setCF("capitulo",capCustomC.trim());setCapModoCustomC(false);}}}>+</button>
                      <button style={S.btn("ghost",true)} onClick={()=>setCapModoCustomC(false)}>✕</button>
                    </div>
                  )}
                </div>
                <div>
                  <div style={labelStyle}>Competencia</div>
                  <select style={selectStyle} value={crearForm.competencia} onChange={e=>setCF("competencia",e.target.value)}>
                    <option value="">-- Selecciona --</option>
                    {COMPETENCIAS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
                <div>
                  <div style={labelStyle}>Ítem *</div>
                  <input style={inputStyle} value={crearForm.item_numero} onChange={e=>setCF("item_numero",e.target.value)} placeholder="Ej: 1.01" />
                </div>
                <div>
                  <div style={labelStyle}>Tipo de Precio *</div>
                  <select style={selectStyle} value={crearForm.tipo_precio} onChange={e=>cambiarTipoCrear(e.target.value)}>
                    <option value="">-- Selecciona --</option>
                    <option value="Precio Contractual">Precio Contractual</option>
                    <option value="Precio No Previsto">Precio No Previsto</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={labelStyle}>Descripción *</div>
                <input style={inputStyle} value={crearForm.descripcion} onChange={e=>setCF("descripcion",e.target.value)} />
              </div>

              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
                <div>
                  <div style={labelStyle}>Unidad *</div>
                  <UnidadSelector value={crearForm.unidad} onChange={v=>setCF("unidad",v)}
                    modoCustom={uModoCustomC} setModoCustom={setUModoCustomC}
                    uCustom={uCustomC} setUCustom={setUCustomC} />
                </div>
                <div>
                  <div style={labelStyle}>Valor Unitario *</div>
                  <input style={inputStyle} type="number" value={crearForm.precio_unitario} onChange={e=>setCF("precio_unitario",e.target.value)} placeholder="0" />
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={labelStyle}>Especificación Técnica *</div>
                <textarea style={{...inputStyle,resize:"vertical",minHeight:80}} value={crearForm.especificacion_tecnica} onChange={e=>setCF("especificacion_tecnica",e.target.value)} />
              </div>

              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
                <div>
                  <div style={labelStyle}>Acta de Fijación {!crearEsContractual?"*":""}</div>
                  <input style={{...inputStyle,opacity:crearEsContractual?0.45:1}}
                    value={crearForm.acta_fijacion} disabled={crearEsContractual}
                    placeholder={crearEsContractual?"Contractual (automático)":"Número de acta"}
                    onChange={e=>setCF("acta_fijacion",e.target.value.replace(/[^0-9]/g,""))} />
                </div>
                <div>
                  <div style={labelStyle}>Acta Modificatoria {!crearEsContractual?"*":""}</div>
                  <input style={{...inputStyle,opacity:crearEsContractual?0.45:1}}
                    value={crearForm.acta_modificatoria} disabled={crearEsContractual}
                    placeholder={crearEsContractual?"N/A":"Número de acta modificatoria"}
                    onChange={e=>setCF("acta_modificatoria",e.target.value.replace(/[^0-9]/g,""))} />
                </div>
              </div>

              <div style={{ marginBottom:8 }}>
                <div style={labelStyle}>Observaciones</div>
                <textarea style={{...inputStyle,resize:"vertical",minHeight:60}} value={crearForm.observaciones} onChange={e=>setCF("observaciones",e.target.value)} />
              </div>
            </div>
            <div style={modalFoot}>
              <button style={S.btn("ghost")} onClick={() => setShowCrear(false)}>Cancelar</button>
              <button style={S.btn("primary")} onClick={crearPrecio} disabled={creating}>{creating?"Creando...":"✓ Crear Precio"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────
// ─── MAPA: qué funciones habilitan cada tab del panel ─────────────────────────
// El nombre debe coincidir (case-insensitive) con el campo funcion_nombre en permisos
const TAB_FUNCIONES = {
  usuarios:  ["aprobar usuarios", "crear usuarios"],
  cargos:    ["panel de administración"],
  permisos:  ["panel de administración"],
  contratos: ["contratos"],
  precios:   ["listado de precios"],
  resets:    ["panel de administración"],
};

export default function AdminPanel({ user, token, onClose, activeTheme }) {
  const call = useApi(token);
  const [cargos, setCargos] = useState([]);
  const [contratos, setContratos] = useState([]);

  const isDeveloper = user?.cargo_nombre?.toLowerCase() === "desarrollador";
  const isAdmin     = user?.cargo_nombre?.toLowerCase() === "administrador";

  // ── Filtrar tabs según permisos del usuario ────────────────────────────────
  function canSeeTab(tabId) {
    const tab = TABS_TODOS.find(t => t.id === tabId);
    if (tab?.soloAdmin) return isDeveloper || isAdmin;
    if (isDeveloper || isAdmin) return true;
    const funciones = TAB_FUNCIONES[tabId] || [];
    return funciones.some(fname =>
      (user?.permisos || []).some(p =>
        p.funcion_nombre?.toLowerCase() === fname &&
        (p.ver || p.crear || p.editar || p.eliminar || p.validar || p.exportar)
      )
    );
  }

  const TABS_TODOS = [
    { id: "usuarios",  label: "Gestión de Usuarios" },
    { id: "cargos",    label: "Gestión de cargos"   },
    { id: "permisos",  label: "Matriz de permisos"  },
    { id: "contratos", label: "Contratos"            },
    { id: "precios",   label: "Listado de Precios"   },
    { id: "resets",    label: "Reset Claves"         },
    { id: "logs",      label: "📋 Logs del Sistema", soloAdmin: true },
  ];
  const TABS = TABS_TODOS.filter(t => canSeeTab(t.id));

  const [tab, setTab] = useState(() => TABS[0]?.id || "usuarios");

  const TITULOS = {
    usuarios:  { title: "Gestión de usuarios",    sub: "Administra cargos, roles, contratos y estados" },
    cargos:    { title: "Gestión de cargos",      sub: "Crea y elimina cargos del sistema" },
    permisos:  { title: "Matriz de permisos",     sub: "Configura qué puede hacer cada cargo" },
    contratos: { title: "Contratos",              sub: "Crea y gestiona contratos del sistema" },
    precios:   { title: "Listado de Precios",     sub: "Edita, carga y descarga el listado de precios por contrato" },
    resets:    { title: "Reset Claves",           sub: "Autoriza solicitudes de cambio de contraseña" },
    logs:      { title: "Logs del Sistema",       sub: "Auditoría completa de acciones en la plataforma" },
  };

  const cargarCargos = useCallback(async () => {
    try { setCargos(await call("GET", "/cargos")); } catch {}
  }, [call]);

  const cargarContratos = useCallback(async () => {
    try { setContratos(await call("GET", "/contratos")); } catch {}
  }, [call]);

  useEffect(() => {
    cargarCargos();
    cargarContratos();
  }, [cargarCargos, cargarContratos]);

  // Permisos del usuario sobre "Listado de Precios" para pasar a la sección
  const precioPerms = (user?.permisos || []).find(
    p => p.funcion_nombre?.toLowerCase() === "listado de precios"
  ) || {};

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.panel(activeTheme)}>

        {/* SIDEBAR */}
        <div style={S.sidebar(activeTheme)}>
          <div style={S.sidebarHeader}>
            <img
              src="/CLARA.CORE.png"
              alt="ClaraCore"
              style={{ height: 32, marginBottom: 6, filter: activeTheme === "light" ? "none" : "brightness(0) invert(1)" }}
            />
            <div style={S.logoSub}>PANEL ADMIN</div>
          </div>

          {TABS.map(t => (
            <div key={t.id} style={S.navItem(tab === t.id)} onClick={() => setTab(t.id)}>
              <div style={S.navDot(tab === t.id)} />
              <span>{t.label}</span>
            </div>
          ))}

          <div style={S.sidebarFooter}>
            <div style={S.userTag}>Sesión activa</div>
            <div style={S.userName}>{user?.nombre} {user?.apellidos}</div>
            <div style={{ ...S.userTag, marginTop: 2 }}>{user?.cargo_nombre}</div>
          </div>
        </div>

        {/* CONTENIDO */}
        <div style={S.content}>
          <div style={S.contentHeader(activeTheme)}>
            <div>
              <div style={S.contentTitle(activeTheme)}>{TITULOS[tab]?.title}</div>
              <div style={S.contentSub(activeTheme)}>{TITULOS[tab]?.sub}</div>
            </div>
            <button style={S.closeBtn} onClick={onClose} title="Cerrar">✕</button>
          </div>

          <div style={S.scrollArea(activeTheme)}>
            {tab === "usuarios"  && <SeccionUsuarios  call={call} cargos={cargos} theme={activeTheme} userId={user?.id} />}
            {tab === "cargos"    && <SeccionCargos    call={call} cargos={cargos} recargarCargos={cargarCargos} theme={activeTheme} />}
            {tab === "permisos"  && <SeccionPermisos  call={call} cargos={cargos} theme={activeTheme} />}
            {tab === "contratos" && <SeccionContratos call={call} contratos={contratos} recargarContratos={cargarContratos}
            perms={isDeveloper || isAdmin ? { ver: true, crear: true, editar: true, eliminar: true, exportar: true } :
              (() => {
                const p = (user?.permisos || []).find(p => p.funcion_nombre?.toLowerCase() === "contratos");
                return {
                  ver:      p?.ver      || false,
                  crear:    p?.crear    || false,
                  editar:   p?.editar   || false,
                  eliminar: p?.eliminar || false,
                  exportar: p?.exportar || false,
                };
              })()
            }
          />}
            {tab === "precios"   && <SeccionListadoPrecios call={call} user={user} perms={isDeveloper || isAdmin ? { ver: true, crear: true, editar: true, eliminar: true, exportar: true, validar: true } : precioPerms} theme={activeTheme} />}
            {tab === "resets"    && <SeccionResets    call={call} theme={activeTheme} />}
              {tab === "logs"      && <SeccionLogs      call={call} theme={activeTheme} />}
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </div>
  );
}

