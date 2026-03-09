import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const API = "https://claracore-backend.azurewebsites.net";

// 6 acciones de permiso
const ACCIONES = ["ver", "crear", "editar", "eliminar", "validar", "exportar"];

// ─── ESTILOS BASE (sin dependencias externas) ──────────────────────────────
const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "rgba(10,18,25,0.82)",
    backdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },
  panel: {
    width: "min(1100px, 96vw)", height: "min(780px, 92vh)",
    background: "#0e1c24",
    borderRadius: 12,
    display: "flex",
    overflow: "hidden",
    boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,175,197,0.15)",
  },
  sidebar: {
    width: 210, minWidth: 210,
    background: "#081318",
    borderRight: "1px solid rgba(0,175,197,0.12)",
    display: "flex", flexDirection: "column",
    padding: "28px 0",
  },
  sidebarHeader: {
    padding: "0 20px 24px",
    borderBottom: "1px solid rgba(0,175,197,0.1)",
    marginBottom: 16,
  },
  logo: {
    fontSize: 18, fontWeight: 700, letterSpacing: 1.5,
    color: "#00afc5", fontFamily: "'Rajdhani', 'DM Sans', sans-serif",
    textTransform: "uppercase",
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
  contentHeader: {
    padding: "24px 32px 20px",
    borderBottom: "1px solid rgba(0,175,197,0.1)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#0b1920",
  },
  contentTitle: {
    fontSize: 20, fontWeight: 700, color: "#e0f4f7",
    fontFamily: "'Rajdhani', sans-serif", letterSpacing: 0.5,
  },
  contentSub: { fontSize: 12, color: "#4a7a87", marginTop: 3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 6,
    background: "rgba(0,175,197,0.08)", border: "1px solid rgba(0,175,197,0.2)",
    color: "#00afc5", fontSize: 16, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s",
  },
  scrollArea: {
    flex: 1, overflowY: "auto", padding: "24px 32px",
    scrollbarWidth: "thin", scrollbarColor: "#1e3a44 transparent",
  },
  // Tabla
  table: {
    width: "100%", borderCollapse: "collapse", fontSize: 13,
  },
  th: {
    textAlign: "left", padding: "10px 14px",
    background: "#081318", color: "#4a8a96",
    fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(0,175,197,0.12)",
  },
  td: {
    padding: "12px 14px", color: "#c0dde3",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    verticalAlign: "middle",
  },
  trHover: { background: "rgba(0,175,197,0.04)", transition: "background 0.15s" },
  // Badge estado
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
  // Botones
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
  // Input / Select
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
  // Card
  card: {
    background: "#0b1920", border: "1px solid rgba(0,175,197,0.1)",
    borderRadius: 8, padding: "20px 24px", marginBottom: 16,
  },
  cardTitle: { fontSize: 14, fontWeight: 600, color: "#8acdd8", marginBottom: 12 },
  // Chip checkbox permiso
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
  // Alert
  alert: (type) => ({
    padding: "10px 16px", borderRadius: 6, fontSize: 13,
    marginBottom: 16,
    background: type === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
    border: `1px solid ${type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
    color: type === "success" ? "#22c55e" : "#ef4444",
  }),
  // Empty state
  empty: {
    textAlign: "center", padding: "48px 0",
    color: "#2a4a54", fontSize: 14,
  },
  // Loader dot
  loader: {
    display: "inline-block", width: 8, height: 8, borderRadius: "50%",
    background: "#00afc5", margin: "0 3px",
    animation: "pulse 1.2s ease-in-out infinite",
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
      throw new Error(err.detail || "Error del servidor");
    }
    return res.json();
  }, [token]);
  return call;
}

function SeccionUsuarios({ call, cargos }) {
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

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [udata, rdata, cdata] = await Promise.all([
        call("GET", "/admin/todos-usuarios"),
        call("GET", "/roles").catch(() => []),
        call("GET", "/contratos").catch(() => []),
      ]);
      setUsuarios(udata);
      setRoles(rdata);
      setContratos(cdata);
      const initEdits = {};
      udata.forEach(u => {
        initEdits[u.id] = { cargo_id: u.cargo_id || "", rol_id: u.rol_id || "", contrato_id: u.contrato_id || "", estado: u.estado || "" };
      });
      setEdits(initEdits);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setLoading(false); }
  }, [call]);

  useEffect(() => { cargar(); }, [cargar]);

  const setEdit = (uid, field, val) => setEdits(e => ({ ...e, [uid]: { ...e[uid], [field]: val } }));

  const guardar = async (uid) => {
    setSaving(uid);
    try {
      await call("PUT", `/admin/usuarios/${uid}`, edits[uid]);
      setMsg({ type: "success", text: "Usuario actualizado." });
      cargar();
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
                  <td style={S.td}>
                    <div style={{ color: "#e0f4f7", fontWeight: 500 }}>{u.nombre} {u.apellidos}</div>
                    <div style={{ fontSize: 11, color: "#4a7a87" }}>{u.email}</div>
                  </td>
                  <td style={S.td}>
                    <select style={{ ...S.select, minWidth: 110, color: estadoBadge[edits[u.id]?.estado] || "#c0dde3" }}
                      value={edits[u.id]?.estado || ""}
                      onChange={e => setEdit(u.id, "estado", e.target.value)}>
                      <option value="pendiente">🟡 Pendiente</option>
                      <option value="aprobado">🟢 Aprobado</option>
                      <option value="rechazado">🔴 Rechazado</option>
                    </select>
                  </td>
                  <td style={S.td}>
                    <select style={{ ...S.select, minWidth: 140 }}
                      value={edits[u.id]?.cargo_id || ""}
                      onChange={e => setEdit(u.id, "cargo_id", e.target.value)}>
                      <option value="">Sin cargo</option>
                      {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </td>
                  <td style={S.td}>
                    <select style={{ ...S.select, minWidth: 130 }}
                      value={edits[u.id]?.rol_id || ""}
                      onChange={e => setEdit(u.id, "rol_id", e.target.value)}>
                      <option value="">Sin rol</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </td>
                  <td style={S.td}>
                    <select style={{ ...S.select, minWidth: 150 }}
                      value={edits[u.id]?.contrato_id || ""}
                      onChange={e => setEdit(u.id, "contrato_id", e.target.value)}>
                      <option value="">Sin contrato</option>
                      {contratos.map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}
                    </select>
                  </td>
                  <td style={S.td}>
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
                    <td colSpan={6} style={{ ...S.td, background: "rgba(0,175,197,0.04)", padding: "12px 20px" }}>
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
                        {(ucContratos[u.id] || []).length === 0 && <span style={{ color: "#4a7a87", fontSize: 12 }}>Sin contratos asignados</span>}
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
function SeccionCargos({ call, cargos, recargarCargos }) {
  const [nuevo, setNuevo] = useState("");
  const [msg, setMsg] = useState(null);
  const [eliminando, setEliminando] = useState(null);

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

      {/* Crear nuevo cargo */}
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

      {/* Listado */}
      <table style={S.table}>
        <thead>
          <tr>
            {["#", "Nombre del cargo", "Acción"].map(h => <th key={h} style={S.th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {cargos.map((c, i) => (
            <tr key={c.id}>
              <td style={{ ...S.td, color: "#2a5a6a", width: 40 }}>{i + 1}</td>
              <td style={S.td}>
                <span style={{ color: "#c0dde3" }}>{c.nombre}</span>
              </td>
              <td style={S.td}>
                <button
                  style={S.btn("danger", true)}
                  disabled={eliminando === c.id}
                  onClick={() => eliminar(c.id, c.nombre)}
                >
                  {eliminando === c.id ? "..." : "Eliminar"}
                </button>
              </td>
            </tr>
          ))}
          {cargos.length === 0 && (
            <tr><td colSpan={3} style={{ ...S.td, ...S.empty }}>Sin cargos registrados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── SECCIÓN 3: Matriz de permisos ─────────────────────────────────────────
function SeccionPermisos({ call, cargos }) {
  const [cargoId, setCargoId] = useState("");
  const [funciones, setFunciones] = useState([]);
  const [permisos, setPermisos] = useState({}); // { funcion_id: { accion: bool } }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const cargarPermisos = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      // Traemos funciones y permisos del cargo
      const [fns, perms] = await Promise.all([
        call("GET", "/funciones").catch(() => []),
        call("GET", `/admin/permisos/${id}`).catch(() => []),
      ]);
      setFunciones(fns);

      // Construir mapa { funcion_id: { accion: bool } }
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
    setPermisos(p => ({
      ...p,
      [funcion_id]: { ...p[funcion_id], [accion]: !p[funcion_id][accion] },
    }));
  };

  const toggleFilaCompleta = (funcion_id) => {
    const fila = permisos[funcion_id] || {};
    const todoActivo = ACCIONES.every(a => fila[a]);
    setPermisos(p => ({
      ...p,
      [funcion_id]: Object.fromEntries(ACCIONES.map(a => [a, !todoActivo])),
    }));
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

  return (
    <div>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float: "right", cursor: "pointer", opacity: 0.6 }}>✕</span>
        </div>
      )}

      {/* Selector de cargo */}
      <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{ color: "#4a8a96", fontSize: 13, whiteSpace: "nowrap" }}>Cargo a configurar:</div>
        <select
          style={{ ...S.select, flex: 1, maxWidth: 280 }}
          value={cargoId}
          onChange={e => setCargoId(e.target.value)}
        >
          <option value="">-- Selecciona un cargo --</option>
          {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {cargoId && (
          <button style={S.btn("primary", true)} onClick={guardar} disabled={saving}>
            {saving ? "Guardando..." : "💾 Guardar cambios"}
          </button>
        )}
      </div>

      {/* Leyenda de acciones */}
      {cargoId && !loading && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {ACCIONES.map(a => (
            <span key={a} style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 20,
              background: `${accionColor[a]}18`,
              border: `1px solid ${accionColor[a]}44`,
              color: accionColor[a], fontWeight: 600,
              textTransform: "capitalize",
            }}>
              {a}
            </span>
          ))}
        </div>
      )}

      {/* Matriz */}
      {!cargoId ? (
        <div style={S.empty}>Selecciona un cargo para configurar su matriz de permisos.</div>
      ) : loading ? (
        <div style={S.empty}><div style={{ color: "#00afc5" }}>Cargando permisos...</div></div>
      ) : funciones.length === 0 ? (
        <div style={S.empty}>No hay funciones registradas en el sistema.</div>
      ) : (
        <div style={{
          background: "#081318", borderRadius: 8,
          border: "1px solid rgba(0,175,197,0.1)", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: `220px repeat(${ACCIONES.length}, 1fr) 80px`,
            background: "#06101a",
            borderBottom: "1px solid rgba(0,175,197,0.15)",
          }}>
            <div style={{ ...S.th, padding: "12px 16px" }}>Función</div>
            {ACCIONES.map(a => (
              <div key={a} style={{
                ...S.th, textAlign: "center", padding: "12px 4px",
                color: accionColor[a],
              }}>
                {a}
              </div>
            ))}
            <div style={{ ...S.th, textAlign: "center" }}>Todo</div>
          </div>

          {/* Filas */}
          {funciones.map((f, idx) => {
            const fila = permisos[f.id] || {};
            const todoActivo = ACCIONES.every(a => fila[a]);
            return (
              <div key={f.id} style={{
                display: "grid",
                gridTemplateColumns: `220px repeat(${ACCIONES.length}, 1fr) 80px`,
                background: idx % 2 === 0 ? "transparent" : "rgba(0,175,197,0.025)",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
                alignItems: "center",
              }}>
                <div style={{ ...S.td, padding: "10px 16px" }}>
                  <span style={{ color: "#8acdd8", fontSize: 13 }}>{f.nombre}</span>
                  {f.descripcion && (
                    <div style={{ fontSize: 11, color: "#2a5a6a", marginTop: 1 }}>{f.descripcion}</div>
                  )}
                </div>
                {ACCIONES.map(a => (
                  <div key={a} style={{ textAlign: "center", padding: "10px 4px" }}>
                    <div
                      onClick={() => togglePermiso(f.id, a)}
                      style={{
                        width: 22, height: 22, borderRadius: 5,
                        margin: "0 auto", cursor: "pointer",
                        border: `1.5px solid ${fila[a] ? accionColor[a] : "rgba(255,255,255,0.1)"}`,
                        background: fila[a] ? `${accionColor[a]}22` : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, color: accionColor[a],
                        transition: "all 0.15s",
                      }}
                    >
                      {fila[a] ? "✓" : ""}
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: "center", padding: "10px 4px" }}>
                  <div
                    onClick={() => toggleFilaCompleta(f.id)}
                    title={todoActivo ? "Desactivar todos" : "Activar todos"}
                    style={{
                      width: 22, height: 22, borderRadius: 5,
                      margin: "0 auto", cursor: "pointer",
                      border: `1.5px solid ${todoActivo ? "#00afc5" : "rgba(255,255,255,0.12)"}`,
                      background: todoActivo ? "rgba(0,175,197,0.2)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "#00afc5",
                      transition: "all 0.15s",
                    }}
                  >
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
function SeccionResets({ call }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tempPasswords, setTempPasswords] = useState({});
  const [msg, setMsg] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setSolicitudes(await call("GET", "/admin/reset-requests")); }
    catch (e) { setMsg({ type: "error", text: e.message }); }
    finally { setLoading(false); }
  }, [call]);

  useEffect(() => { cargar(); }, [cargar]);

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
                <td style={S.td}><div style={{ color: "#e0f4f7", fontWeight: 500 }}>{s.email}</div></td>
                <td style={S.td}><span style={{ color: "#4a8a96" }}>{new Date(s.created_at).toLocaleDateString("es-CO")}</span></td>
                <td style={S.td}>
                  <input style={{ ...S.input, maxWidth: 180 }} type="text" placeholder="Ej: Temp1234"
                    value={tempPasswords[s.id] || ""}
                    onChange={e => setTempPasswords(p => ({ ...p, [s.id]: e.target.value }))} />
                </td>
                <td style={S.td}>
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
function SeccionContratos({ call }) {
  const [form, setForm] = useState({ numero: '', objeto: '', contratista: '', nit: '', interventoria: '', logo_contratista: '', logo_interventoria: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [contratos, setContratos] = useState([]);

  useEffect(() => {
    call("GET", "/contratos").then(setContratos).catch(() => {});
  }, [call]);

  function handleLogo(campo, e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, [campo]: ev.target.result }));
    reader.readAsDataURL(file);
  }

  async function handleGuardar() {
    if (!form.numero || !form.contratista) { setMsg({ type: 'error', text: 'Número y contratista son obligatorios' }); return; }
    setSaving(true); setMsg(null);
    try {
      await call("POST", "/contratos", form);
      setMsg({ type: 'success', text: 'Contrato creado correctamente' });
      setForm({ numero: '', objeto: '', contratista: '', nit: '', interventoria: '', logo_contratista: '', logo_interventoria: '' });
      const data = await call("GET", "/contratos");
      setContratos(data);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Error al crear contrato' });
    } finally { setSaving(false); }
  }

  const inp = { width: '100%', background: '#0a1628', border: '1.5px solid #1E3A5F', borderRadius: 8, padding: '9px 12px', color: '#E0F2FE', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 12 };
  const lbl = { fontSize: 11, fontWeight: 700, color: '#4a7a87', letterSpacing: 1, display: 'block', marginBottom: 4 };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* FORMULARIO */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#00afc5', marginBottom: 20 }}>➕ Nuevo Contrato</div>
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
          <button onClick={handleGuardar} disabled={saving} style={{ background: '#00afc5', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontSize: 13 }}>
            {saving ? 'Guardando...' : 'Guardar Contrato'}
          </button>
        </div>
        {/* LISTA */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#00afc5', marginBottom: 20 }}>📋 Contratos registrados</div>
          {contratos.length === 0 ? (
            <div style={{ color: '#4a7a87', fontSize: 13 }}>No hay contratos registrados</div>
          ) : contratos.map(c => (
            <div key={c.id} style={{ background: '#081318', border: '1px solid rgba(0,175,197,0.15)', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: '#00afc5', fontSize: 13 }}>{c.numero}</div>
              <div style={{ color: '#8acdd8', fontSize: 12, marginTop: 2 }}>{c.contratista}</div>
              {c.interventoria && <div style={{ color: '#4a7a87', fontSize: 11, marginTop: 2 }}>Interventoría: {c.interventoria}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {c.logo_contratista && <img src={c.logo_contratista} alt="logo" style={{ height: 28, borderRadius: 4, background: '#fff', padding: 2 }} />}
                {c.logo_interventoria && <img src={c.logo_interventoria} alt="logo" style={{ height: 28, borderRadius: 4, background: '#fff', padding: 2 }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────
/**
 * AdminPanel — Panel de administración ClaraCore
 *
 * Props:
 *   user    : { id, nombre, apellidos, cargo_nombre }  — usuario autenticado actual
 *   token   : string                                   — JWT de sesión
 *   onClose : () => void                               — callback para cerrar el panel
 *
 * Visibilidad recomendada en App.jsx:
 *   const canAdmin = ["Desarrollador", "Administrador"].includes(user?.cargo_nombre);
 *   { canAdmin && <button onClick={() => setShowAdmin(true)}>Admin</button> }
 *   { showAdmin && <AdminPanel user={user} token={token} onClose={() => setShowAdmin(false)} /> }
 */
export default function AdminPanel({ user, token, onClose }) {
  const [tab, setTab] = useState("usuarios");
  const [cargos, setCargos] = useState([]);
  const call = useApi(token);

  const cargarCargos = useCallback(async () => {
    try {
      const data = await call("GET", "/cargos");
      setCargos(data);
    } catch { /* silencioso */ }
  }, [call]);

  useEffect(() => { cargarCargos(); }, [cargarCargos]);

  const TABS = [
    { id: "usuarios",  label: "Gestión de Usuarios", icon: "👤" },
    { id: "cargos",    label: "Gestión de cargos",   icon: "🏷️" },
    { id: "permisos",  label: "Matriz de permisos",  icon: "🔑" },
    { id: "contratos", label: "Contratos",            icon: "📋" },
  ];

  const TITULOS = {
    usuarios:  { title: "Gestión de usuarios", sub: "Administra cargos, roles, contratos y estados" },
    cargos:    { title: "Gestión de cargos",   sub: "Crea y elimina cargos del sistema" },
    permisos:  { title: "Matriz de permisos",  sub: "Configura qué puede hacer cada cargo" },
    contratos: { title: "Contratos",    sub: "Crea y gestiona contratos del sistema" },
    resets:    { title: "Reset Claves", sub: "Autoriza solicitudes de cambio de contraseña" },
  };

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.panel}>

        {/* SIDEBAR */}
        <div style={S.sidebar}>
          <div style={S.sidebarHeader}>
            <div style={S.logo}>ClaraCore</div>
            <div style={S.logoSub}>PANEL ADMIN</div>
          </div>

          {TABS.map(t => (
            <div
              key={t.id}
              style={S.navItem(tab === t.id)}
              onClick={() => setTab(t.id)}
            >
              <div style={S.navDot(tab === t.id)} />
              <span>{t.label}</span>
            </div>
          ))}

          <div style={S.sidebarFooter}>
            <div style={S.userTag}>Sesión activa</div>
            <div style={S.userName}>
              {user?.nombre} {user?.apellidos}
            </div>
            <div style={{ ...S.userTag, marginTop: 2 }}>
              {user?.cargo_nombre || "Desarrollador"}
            </div>
          </div>
        </div>

        {/* CONTENIDO */}
        <div style={S.content}>
          <div style={S.contentHeader}>
            <div>
              <div style={S.contentTitle}>{TITULOS[tab].title}</div>
              <div style={S.contentSub}>{TITULOS[tab].sub}</div>
            </div>
            <button style={S.closeBtn} onClick={onClose} title="Cerrar">✕</button>
          </div>

          <div style={S.scrollArea}>
            {tab === "usuarios" && (
              <SeccionUsuarios call={call} cargos={cargos} />
            )}
            {tab === "cargos" && (
              <SeccionCargos call={call} cargos={cargos} recargarCargos={cargarCargos} />
            )}
            {tab === "permisos" && (
              <SeccionPermisos call={call} cargos={cargos} />
            )}
            {tab === "contratos" && (
              <SeccionContratos call={call} />
            )}
            {tab === "resets" && (
              <SeccionResets call={call} />
            )}
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
