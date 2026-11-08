"""Configuración DG — estructuras de contrato, tramos (ejes), sectores y PKs."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def espesor_total_capas(capas: list[dict]) -> float:
    total = 0.0
    for c in capas or []:
        try:
            total += float(c.get("espesor_m") or 0)
        except (TypeError, ValueError):
            pass
    return round(total, 6)


def cargar_capas_estructura(supabase, estructura_id: str) -> list[dict]:
    return (
        supabase.table("topo_diseno_estructura_capas")
        .select("*")
        .eq("estructura_id", estructura_id)
        .order("orden")
        .execute()
        .data
        or []
    )


def enriquecer_estructura(supabase, est: dict) -> dict:
    capas = cargar_capas_estructura(supabase, est["id"])
    return {**est, "capas": capas, "espesor_total_m": espesor_total_capas(capas)}


def listar_estructuras_contrato(supabase, contrato_id: int) -> list[dict]:
    rows = (
        supabase.table("topo_diseno_estructuras")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [enriquecer_estructura(supabase, r) for r in rows]


def obtener_estructura_contrato(supabase, contrato_id: int, estructura_id: str) -> dict:
    rows = (
        supabase.table("topo_diseno_estructuras")
        .select("*")
        .eq("id", estructura_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Estructura no encontrada")
    return enriquecer_estructura(supabase, rows[0])


def crear_estructura_contrato(
    supabase,
    contrato_id: int,
    nombre: str,
    capas: list[dict],
) -> dict:
    nom = (nombre or "").strip()
    if not nom:
        raise HTTPException(status_code=422, detail="Indique el nombre de la estructura.")
    if not capas:
        raise HTTPException(status_code=422, detail="Defina al menos una capa (terminado / rasante).")
    _validar_capas(capas)
    row = (
        supabase.table("topo_diseno_estructuras")
        .insert({
            "contrato_id": contrato_id,
            "eje_id": None,
            "nombre": nom,
            "vigente": True,
        })
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=500, detail="No se pudo crear la estructura.")
    est_id = row[0]["id"]
    _insertar_capas(supabase, est_id, capas, eje_id=None)
    return obtener_estructura_contrato(supabase, contrato_id, est_id)


def actualizar_estructura_contrato(
    supabase,
    contrato_id: int,
    estructura_id: str,
    nombre: Optional[str],
    capas: list[dict],
) -> dict:
    obtener_estructura_contrato(supabase, contrato_id, estructura_id)
    if not capas:
        raise HTTPException(status_code=422, detail="Defina al menos una capa (terminado / rasante).")
    _validar_capas(capas)
    patch: dict[str, Any] = {}
    if nombre and nombre.strip():
        patch["nombre"] = nombre.strip()
    if patch:
        supabase.table("topo_diseno_estructuras").update(patch).eq("id", estructura_id).execute()
    supabase.table("topo_diseno_estructura_capas").delete().eq("estructura_id", estructura_id).execute()
    _insertar_capas(supabase, estructura_id, capas, eje_id=None)
    return obtener_estructura_contrato(supabase, contrato_id, estructura_id)


def eliminar_estructura_contrato(supabase, contrato_id: int, estructura_id: str) -> dict:
    obtener_estructura_contrato(supabase, contrato_id, estructura_id)
    usados = (
        supabase.table("topo_diseno_tramo_sectores")
        .select("id", count="exact")
        .eq("estructura_id", estructura_id)
        .limit(1)
        .execute()
    )
    if (usados.count or 0) > 0:
        raise HTTPException(
            status_code=422,
            detail="La estructura está asignada a uno o más tramos. Quite los sectores antes de eliminarla.",
        )
    supabase.table("topo_diseno_estructuras").delete().eq("id", estructura_id).execute()
    return {"ok": True}


def _validar_capas(capas: list[dict]) -> None:
    nombres = []
    for i, c in enumerate(capas):
        nombre = (c.get("nombre") or "").strip()
        if not nombre:
            raise HTTPException(status_code=422, detail=f"Indique el nombre de la capa en la fila {i + 1}.")
        try:
            esp = float(c.get("espesor_m"))
        except (TypeError, ValueError):
            esp = 0
        if esp <= 0:
            raise HTTPException(status_code=422, detail=f"Espesor inválido en «{nombre}».")
        nombres.append(nombre.lower())
    if len(nombres) != len(set(nombres)):
        raise HTTPException(status_code=422, detail="Los nombres de capa deben ser únicos.")


def _insertar_capas(supabase, estructura_id: str, capas: list[dict], eje_id: Optional[str]) -> None:
    payload = []
    for i, c in enumerate(capas):
        payload.append({
            "eje_id": eje_id,
            "estructura_id": estructura_id,
            "orden": i + 1,
            "nombre": c["nombre"].strip(),
            "espesor_m": float(c["espesor_m"]),
            "referencia_analisis_orden": c.get("referencia_analisis_orden"),
            "sobre_ancho_m": float(c.get("sobre_ancho_m") or 0),
        })
    if payload:
        supabase.table("topo_diseno_estructura_capas").insert(payload).execute()


def listar_pks_tramo(supabase, eje_id: str) -> list[dict]:
    return (
        supabase.table("topo_diseno_tramo_pks")
        .select("*")
        .eq("eje_id", eje_id)
        .order("orden")
        .execute()
        .data
        or []
    )


def listar_sectores_tramo(supabase, eje_id: str) -> list[dict]:
    return (
        supabase.table("topo_diseno_tramo_sectores")
        .select("*")
        .eq("eje_id", eje_id)
        .order("orden")
        .execute()
        .data
        or []
    )


def enriquecer_sectores(supabase, contrato_id: int, sectores: list[dict]) -> list[dict]:
    out = []
    cache: dict[str, dict] = {}
    for s in sectores:
        eid = s["estructura_id"]
        if eid not in cache:
            try:
                cache[eid] = obtener_estructura_contrato(supabase, contrato_id, eid)
            except HTTPException:
                # Estructura legacy por eje (sin contrato_id) — cargar directo
                rows = (
                    supabase.table("topo_diseno_estructuras")
                    .select("*")
                    .eq("id", eid)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                cache[eid] = enriquecer_estructura(supabase, rows[0]) if rows else {
                    "id": eid, "nombre": "?", "capas": [], "espesor_total_m": 0,
                }
        est = cache[eid]
        out.append({
            **s,
            "estructura": {
                "id": est["id"],
                "nombre": est.get("nombre"),
                "espesor_total_m": est.get("espesor_total_m"),
                "capas": est.get("capas") or [],
            },
        })
    return out


def estructura_en_abscisa(sectores_enriquecidos: list[dict], abscisa: float) -> Optional[dict]:
    """Devuelve el dict estructura del sector que contiene la abscisa."""
    a = float(abscisa)
    for s in sectores_enriquecidos:
        ini = float(s["abscisa_inicio"])
        fin = float(s["abscisa_fin"])
        if ini - 1e-9 <= a <= fin + 1e-9:
            return s.get("estructura")
    if len(sectores_enriquecidos) == 1:
        return sectores_enriquecidos[0].get("estructura")
    return None


def capas_canonica_tramo(sectores_enriquecidos: list[dict]) -> list[dict]:
    """Capas de referencia para UI/entrega: primer sector (o unión por nombre)."""
    if not sectores_enriquecidos:
        return []
    return list(sectores_enriquecidos[0].get("estructura", {}).get("capas") or [])


def resumen_estructuras_tramo(sectores_enriquecidos: list[dict]) -> list[dict]:
    vistos: set[str] = set()
    out = []
    for s in sectores_enriquecidos:
        est = s.get("estructura") or {}
        eid = est.get("id")
        if not eid or eid in vistos:
            continue
        vistos.add(eid)
        out.append({
            "id": eid,
            "nombre": est.get("nombre"),
            "espesor_total_m": est.get("espesor_total_m") or 0,
            "num_capas": len(est.get("capas") or []),
        })
    return out


def validar_sectores_tramo(
    abscisa_inicio: float,
    abscisa_fin: float,
    sectores: list[dict],
) -> list[dict]:
    if abscisa_fin < abscisa_inicio:
        raise HTTPException(status_code=422, detail="La abscisa final debe ser ≥ a la de inicio.")
    if not sectores:
        raise HTTPException(status_code=422, detail="Asigne al menos una estructura al tramo.")
    out = []
    for i, s in enumerate(sectores):
        eid = s.get("estructura_id")
        if not eid:
            raise HTTPException(status_code=422, detail=f"Sector {i + 1}: seleccione una estructura.")
        try:
            ini = float(s.get("abscisa_inicio"))
            fin = float(s.get("abscisa_fin"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail=f"Sector {i + 1}: abscisas inválidas.") from None
        if fin < ini:
            raise HTTPException(status_code=422, detail=f"Sector {i + 1}: fin < inicio.")
        if ini < abscisa_inicio - 1e-9 or fin > abscisa_fin + 1e-9:
            raise HTTPException(
                status_code=422,
                detail=f"Sector {i + 1}: las abscisas deben estar dentro del tramo "
                       f"({abscisa_inicio} – {abscisa_fin}).",
            )
        out.append({
            "estructura_id": str(eid),
            "abscisa_inicio": ini,
            "abscisa_fin": fin,
            "orden": i,
        })
    if len(sectores) == 1:
        out[0]["abscisa_inicio"] = float(abscisa_inicio)
        out[0]["abscisa_fin"] = float(abscisa_fin)
    return out


def alerta_abscisas_diseno(
    abscisa_inicio: Optional[float],
    abscisa_fin: Optional[float],
    sectores: list[dict],
    rasante: list[dict],
) -> Optional[dict]:
    """Compara abscisas del diseño cargado vs tramo/sectores. None = sin alerta."""
    if not rasante or abscisa_inicio is None or abscisa_fin is None:
        return None
    vals = [float(r["abscisa"]) for r in rasante if r.get("abscisa") is not None]
    if not vals:
        return None
    rmin, rmax = min(vals), max(vals)
    msgs = []
    tol = 0.05
    if rmin < float(abscisa_inicio) - tol or rmax > float(abscisa_fin) + tol:
        msgs.append(
            f"El diseño cubre PK {rmin:.3f}–{rmax:.3f} y el tramo está definido "
            f"como {float(abscisa_inicio):.3f}–{float(abscisa_fin):.3f}."
        )
    if len(sectores) > 1:
        fuera = []
        for r in vals:
            ok = any(
                float(s["abscisa_inicio"]) - tol <= r <= float(s["abscisa_fin"]) + tol
                for s in sectores
            )
            if not ok:
                fuera.append(r)
        if fuera:
            msgs.append(
                f"{len(fuera)} estación(es) del diseño quedan fuera de los sectores configurados."
            )
    if not msgs:
        return None
    return {
        "tipo": "abscisas_diseno",
        "mensaje": " ".join(msgs),
        "diseno_min": rmin,
        "diseno_max": rmax,
        "tramo_inicio": float(abscisa_inicio),
        "tramo_fin": float(abscisa_fin),
    }


def reemplazar_pks_tramo(supabase, eje_id: str, pks: list[dict]) -> None:
    supabase.table("topo_diseno_tramo_pks").delete().eq("eje_id", eje_id).execute()
    if not pks:
        return
    payload = []
    vistos: set[str] = set()
    for i, p in enumerate(pks):
        pk_id = str(p.get("pk_id") or "").strip()
        if not pk_id or pk_id in vistos:
            continue
        vistos.add(pk_id)
        payload.append({
            "eje_id": eje_id,
            "pk_id": pk_id,
            "pk_label": (p.get("pk_label") or p.get("ubicacion_pk") or "").strip() or None,
            "tramo_plataforma": (p.get("tramo_plataforma") or p.get("ubicacion_tramo") or "").strip() or None,
            "costado": (p.get("costado") or p.get("ubicacion_costado") or "").strip() or None,
            "infraestructura": (
                p.get("infraestructura") or p.get("ubicacion_infraestructura") or ""
            ).strip() or None,
            "lat": p.get("lat") if p.get("lat") is not None else p.get("ubicacion_lat"),
            "lng": p.get("lng") if p.get("lng") is not None else p.get("ubicacion_lng"),
            "orden": i,
        })
    if payload:
        supabase.table("topo_diseno_tramo_pks").insert(payload).execute()


def reemplazar_sectores_tramo(supabase, eje_id: str, sectores: list[dict]) -> None:
    supabase.table("topo_diseno_tramo_sectores").delete().eq("eje_id", eje_id).execute()
    if not sectores:
        return
    payload = [{
        "eje_id": eje_id,
        "estructura_id": s["estructura_id"],
        "abscisa_inicio": s["abscisa_inicio"],
        "abscisa_fin": s["abscisa_fin"],
        "orden": s.get("orden", i),
    } for i, s in enumerate(sectores)]
    supabase.table("topo_diseno_tramo_sectores").insert(payload).execute()


def capas_para_abscisa(
    sectores_enriquecidos: list[dict],
    abscisa: float,
    capas_canonica: list[dict],
) -> list[dict]:
    """Resuelve capas del sector; alinea por nombre con la canónica cuando sea posible."""
    est = estructura_en_abscisa(sectores_enriquecidos, abscisa)
    capas = list((est or {}).get("capas") or [])
    if not capas:
        return capas_canonica
    if not capas_canonica:
        return capas
    # Si mismos nombres en mismo orden, devolver tal cual
    if [c.get("nombre") for c in capas] == [c.get("nombre") for c in capas_canonica]:
        return capas
    # Reordenar/mapear por nombre canónico; rellenar huecos con índice
    by_name = {(c.get("nombre") or "").lower(): c for c in capas}
    mapped = []
    for i, can in enumerate(capas_canonica):
        key = (can.get("nombre") or "").lower()
        if key in by_name:
            mapped.append(by_name[key])
        elif i < len(capas):
            mapped.append(capas[i])
        else:
            mapped.append(can)
    return mapped
