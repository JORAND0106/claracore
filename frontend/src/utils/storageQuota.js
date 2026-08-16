/**
 * Mensajes de cuota de almacenamiento Azure por contrato.
 * El backend responde HTTP 413 con detail.code === "storage_quota_exceeded".
 */

export const STORAGE_QUOTA_CODE = "storage_quota_exceeded";

/** Extrae el payload de cuota desde un error de fetch/API. */
export function parseStorageQuotaError(err) {
  if (!err) return null;
  const detail = err.detail ?? err.body?.detail ?? err.data?.detail ?? err;
  if (!detail || typeof detail !== "object") return null;
  if (detail.code !== STORAGE_QUOTA_CODE) return null;
  return detail;
}

/** Texto claro para toast/alert cuando se bloquea una carga. */
export function storageQuotaMessage(err, fallback) {
  const d = parseStorageQuotaError(err);
  if (d?.message) return d.message;
  if (typeof err?.message === "string" && /almacenamiento|storage_quota/i.test(err.message)) {
    return err.message;
  }
  // FastAPI a veces serializa detail como string JSON en message
  try {
    const m = String(err?.message || "");
    if (m.includes(STORAGE_QUOTA_CODE)) {
      const parsed = JSON.parse(m);
      if (parsed?.message) return parsed.message;
    }
  } catch {
    /* ignore */
  }
  return fallback || "Se alcanzó el límite de almacenamiento de este contrato.";
}

export function formatBytesHuman(n) {
  let v = Number(n) || 0;
  if (v < 0) v = 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  if (i === 0) return `${Math.round(v)} ${units[i]}`;
  return `${v.toFixed(2)} ${units[i]}`;
}
