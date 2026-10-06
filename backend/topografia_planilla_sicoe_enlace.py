"""Enlace planilla de tubería ↔ reporte de cantidades (SICOE Obra).

Reutiliza, sin estados nuevos ni cambios a la validación existente:

- Listado de ítems: ``GET /sicoe-obra/{contrato}/listado-precios-busqueda``
  (id, capitulo, item_numero, descripcion, unidad, precio_unitario).
- Pestaña Ítem/Registros: reporte ``estado = "No Revisados"`` cuando cada
  registro ya trae ``item_numero`` (la misma regla que asignar-ítem).
  ``"Sin Asignar Ítem"`` queda para registros creados a mano u otros orígenes.
- Sellado: niveles activos en ``Aprobado`` + ``_sicoe_aplicar_bloqueado_si_nivel_es_maximo``
  (``bloqueado``). El bloqueo de edición ya lo hace ``_registro_nivel_max_aprobado``.
- Reapertura de datos: la doble llave existente deja esos niveles en
  ``No Revisado`` y ``bloqueado`` en falso. Esta capa solo consulta ese resultado.
- Logs: ``campos_modificados`` ``{campo, anterior, nuevo}`` y snapshots
  ``valor_anterior`` / ``valor_nuevo`` (la trazabilidad ya arma Campo/Anterior/Nuevo).
- Permiso de asignar: crear o editar en «reporte de cantidades»
  (``_cargo_permiso_crear/editar_reporte_cantidades_user_id``). Desarrollador
  sigue el mismo atajo que la edición completa de SICOE.
- Alerta de ícono: ``IconoModuloConAlerta`` / ``cc-buzon-badge``.

El vínculo es el identificador del ítem de la línea (``item_listado_id``) junto
con el código estable ``cantidades:EXC`` / ``descuentos:DESC_A1``. No usa la
posición de la fila. Un registro creado a mano no entra en ``enlaces``.
"""
from __future__ import annotations

from typing import Any, Optional

from topografia_planilla_tuberia import (
    _meta_item_descuento,
    normalizar_origen_key_sicoe,
    origen_key_linea_sicoe,
    redondear_costo_directo_sicoe,
)

ESTADO_REPORTE_CON_ITEM = "No Revisados"
ESTADO_REPORTE_SIN_ITEM = "Sin Asignar Ítem"

CAMPOS_SYNC_REGISTRO = ("longitud", "ancho", "espesor", "cantidad_total")
META_ITEMS = "sicoe_items_por_linea"
META_DIMS = "sicoe_dims_por_linea"
META_LINKS = "sicoe_reportes"

_EPS = 0.001


def puede_asignar_item_cobro(
    *,
    es_desarrollador: bool = False,
    puede_crear: bool = False,
    puede_editar: bool = False,
) -> bool:
    """Quien crea o edita el reporte de cantidades (o Desarrollador)."""
    return bool(es_desarrollador or puede_crear or puede_editar)


def normalizar_item_asignado(raw: Any) -> Optional[dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    numero = str(raw.get("item_numero") or "").strip()
    if not numero:
        return None
    lid = raw.get("item_listado_id", raw.get("id"))
    item_id: Optional[int]
    try:
        item_id = int(lid) if lid is not None and str(lid).strip() != "" else None
    except (TypeError, ValueError):
        item_id = None
    vlr_raw = raw.get("precio_unitario", raw.get("vlr_unitario"))
    try:
        vlr = float(vlr_raw) if vlr_raw is not None and vlr_raw != "" else None
    except (TypeError, ValueError):
        vlr = None
    capitulo = str(raw.get("capitulo") or "").strip() or None
    descripcion = str(raw.get("descripcion") or raw.get("item_descripcion") or "").strip()
    unidad = str(raw.get("unidad") or "").strip() or None
    return {
        "item_listado_id": item_id,
        "item_numero": numero,
        "descripcion": descripcion,
        "unidad": unidad,
        "precio_unitario": vlr,
        "capitulo": capitulo,
    }


def normalizar_items_por_linea(raw: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for key, val in raw.items():
        origen = normalizar_origen_key_sicoe(key)
        item = normalizar_item_asignado(val)
        if origen and item:
            out[origen] = item
    return out


def items_desde_meta(meta: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(meta, dict):
        return {}
    return normalizar_items_por_linea(meta.get(META_ITEMS))


def origen_padre_item(linea: dict[str, Any], tipo: Optional[str] = None) -> str:
    """Clave ``cantidades:CODIGO`` de la que sale el ítem de cobro de la línea."""
    tabla = str(linea.get("_origen_tabla") or "cantidades").strip().lower()
    codigo = str(linea.get("_origen_codigo") or "").strip().upper()
    if tabla != "descuentos":
        return f"cantidades:{codigo}" if codigo else ""
    padre = str(linea.get("_item_cant_codigo") or "").strip().upper()
    if not padre:
        padre = str(
            (_meta_item_descuento(codigo, str(tipo or "")) or {}).get("item_cant_codigo") or ""
        ).strip().upper()
    return f"cantidades:{padre}" if padre else ""


def item_de_linea(
    linea: dict[str, Any],
    items: dict[str, dict[str, Any]],
    tipo: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    key = origen_padre_item(linea, tipo)
    if not key:
        return None
    return items.get(key)


def lineas_sin_item(
    lineas: list[dict[str, Any]],
    items: dict[str, dict[str, Any]],
    tipo: Optional[str] = None,
) -> list[dict[str, str]]:
    """Líneas con cantidad (las que ya vienen filtradas) sin ítem resuelto."""
    faltan: list[dict[str, str]] = []
    for linea in lineas or []:
        if not isinstance(linea, dict):
            continue
        if item_de_linea(linea, items, tipo):
            continue
        faltan.append({
            "origen": origen_key_linea_sicoe(linea),
            "nombre": str(linea.get("nombre") or linea.get("_origen_codigo") or "").strip(),
        })
    return faltan


def mensaje_faltan_items(faltan: list[dict[str, str]]) -> str:
    nombres = [f.get("nombre") or f.get("origen") or "línea" for f in faltan]
    lista = ", ".join(nombres[:8])
    extra = f" y {len(nombres) - 8} más" if len(nombres) > 8 else ""
    return (
        "Asigne el ítem de cobro en cada línea con cantidad antes de crear el reporte: "
        f"{lista}{extra}."
    )


def item_capitulo_distinto(item: dict[str, Any], capitulo_reporte: str) -> bool:
    cap_item = str(item.get("capitulo") or "").strip()
    cap_rep = str(capitulo_reporte or "").strip()
    if not cap_item or not cap_rep:
        return False
    return cap_item != cap_rep


def campos_item_en_registro(linea: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    """Campos de ítem para ``so_registros``. No toca niveles ni ``bloqueado``."""
    vlr = item.get("precio_unitario")
    data: dict[str, Any] = {
        "item_numero": item.get("item_numero"),
        "item_descripcion": item.get("descripcion") or None,
        "vlr_unitario": vlr,
    }
    cant = linea.get("cantidad_total")
    if cant is not None and vlr is not None:
        try:
            data["costo_directo"] = redondear_costo_directo_sicoe(float(cant) * float(vlr))
        except (TypeError, ValueError):
            pass
    return data


def signo_linea(linea: dict[str, Any]) -> int:
    try:
        cant = float(linea.get("cantidad_total"))
    except (TypeError, ValueError):
        return 1
    return -1 if cant < 0 else 1


def construir_enlace(
    linea: dict[str, Any],
    item: dict[str, Any],
    *,
    registro_id: Optional[int] = None,
    numero_registro: Optional[int] = None,
) -> dict[str, Any]:
    """Identidad del vínculo: ítem de la línea + origen estable, no la posición."""
    return {
        "origen": origen_key_linea_sicoe(linea),
        "item_listado_id": item.get("item_listado_id"),
        "item_numero": item.get("item_numero"),
        "registro_id": registro_id,
        "numero_registro": numero_registro,
        "signo": signo_linea(linea),
    }


def registro_esta_enlazado(enlaces: Any, registro_id: Any) -> bool:
    try:
        rid = int(registro_id)
    except (TypeError, ValueError):
        return False
    for en in enlaces or []:
        if not isinstance(en, dict):
            continue
        try:
            if int(en.get("registro_id")) == rid:
                return True
        except (TypeError, ValueError):
            continue
    return False


def enlaces_de_meta(meta: Any) -> list[dict[str, Any]]:
    if not isinstance(meta, dict):
        return []
    raw = meta.get(META_LINKS)
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for link in raw:
        if not isinstance(link, dict):
            continue
        for en in link.get("enlaces") or []:
            if isinstance(en, dict) and en.get("registro_id") is not None:
                out.append(dict(en))
    return out


def _num(v: Any, ndigits: int) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return round(float(v), ndigits)
    except (TypeError, ValueError):
        return None


def _igual(a: Any, b: Any, ndigits: int = 2) -> bool:
    aa, bb = _num(a, ndigits), _num(b, ndigits)
    if aa is None and bb is None:
        return True
    if aa is None or bb is None:
        return False
    return abs(aa - bb) <= _EPS


def diff_campos_sync(anterior: dict[str, Any], nuevo: dict[str, Any]) -> list[dict[str, Any]]:
    """Solo dimensiones y cantidad. Misma forma Campo/Anterior/Nuevo de SICOE."""
    cambios: list[dict[str, Any]] = []
    for campo in CAMPOS_SYNC_REGISTRO:
        nd = 2 if campo == "cantidad_total" else 3
        if campo not in nuevo:
            continue
        if _igual(anterior.get(campo), nuevo.get(campo), nd):
            continue
        cambios.append({
            "campo": campo,
            "anterior": anterior.get(campo),
            "nuevo": nuevo.get(campo),
        })
    return cambios


def snapshots_de_diff(cambios: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    antes: dict[str, Any] = {}
    despues: dict[str, Any] = {}
    for c in cambios or []:
        campo = str(c.get("campo") or "")
        if not campo:
            continue
        antes[campo] = c.get("anterior")
        despues[campo] = c.get("nuevo")
    return antes, despues


def detalle_sync_log(
    cambios: list[dict[str, Any]],
    *,
    origen_cambio: str,
    planilla_id: Any = None,
    reporte_id: Any = None,
    registro_id: Any = None,
    item_numero: Any = None,
) -> dict[str, Any]:
    return {
        "origen_cambio": origen_cambio,
        "planilla_id": planilla_id,
        "reporte_id": reporte_id,
        "registro_id": registro_id,
        "item_numero": item_numero,
        "campos_modificados": cambios,
    }


def registro_esta_sellado(row: Optional[dict], campo_nivel_max: str) -> bool:
    """Nivel máximo en Aprobado. Misma lectura que ``_registro_nivel_max_aprobado``."""
    if not isinstance(row, dict) or not campo_nivel_max:
        return False
    return str(row.get(campo_nivel_max) or "").strip() == "Aprobado"


def payload_sellado_registro(
    niveles: list[int],
    uid: Optional[int],
    now: str,
) -> dict[str, Any]:
    """Niveles activos en Aprobado. ``bloqueado`` lo confirma el helper de SICOE."""
    update: dict[str, Any] = {}
    for n in niveles or []:
        try:
            ni = int(n)
        except (TypeError, ValueError):
            continue
        if not 1 <= ni <= 6:
            continue
        update[f"nivel{ni}_estado"] = "Aprobado"
        update[f"nivel{ni}_usuario_id"] = uid
        update[f"nivel{ni}_fecha"] = now
    update["bloqueado"] = True
    return update


def puede_reabrir_para_editar(
    registros: list[Optional[dict]],
    campo_nivel_max: str,
) -> tuple[bool, str]:
    """True solo si ningún registro enlazado sigue sellado en el nivel máximo."""
    for row in registros or []:
        if registro_esta_sellado(row, campo_nivel_max):
            return False, (
                "Para reabrir la planilla, revierta primero los registros enlazados "
                "con la doble llave de SICOE Obra. Mientras estén sellados en el "
                "nivel máximo de validación no se pueden modificar."
            )
    return True, ""


def fusionar_meta_cliente(db_meta: Any, client_meta: Any) -> dict[str, Any]:
    """El formulario actualiza ítems y el resto de la cabecera.

    Vínculos, alertas y dimensiones empujadas desde el reporte quedan en el
    servidor: un guardado con la meta que tenía abierta la pantalla no los pisa.
    """
    base = dict(db_meta) if isinstance(db_meta, dict) else {}
    incoming = dict(client_meta) if isinstance(client_meta, dict) else {}
    merged = {**base, **incoming}
    if META_LINKS in base:
        merged[META_LINKS] = base[META_LINKS]
    if META_DIMS in base:
        merged[META_DIMS] = base[META_DIMS]
    if META_ITEMS in incoming:
        merged[META_ITEMS] = normalizar_items_por_linea(incoming.get(META_ITEMS))
    return merged


def items_cambiaron(antes: Any, despues: Any) -> bool:
    return normalizar_items_por_linea(antes) != normalizar_items_por_linea(despues)


def _natural_de(calculo: dict, origen: str) -> dict[str, Any]:
    tabla, _, codigo = str(origen or "").partition(":")
    codigo = codigo.upper()
    if tabla == "cantidades":
        for n in calculo.get("netos") or []:
            if str(n.get("codigo") or "").upper() == codigo:
                return {
                    "long": n.get("long"),
                    "ancho": n.get("ancho"),
                    "espesor": n.get("espesor"),
                    "cantidad": n.get("bruto"),
                }
        return {}
    fuentes = list(calculo.get("descuentos") or [])
    fuentes += list(calculo.get("descuentos_volumen_detalle") or [])
    for d in fuentes:
        if str(d.get("codigo") or "").upper() == codigo:
            return {
                "long": d.get("long"),
                "ancho": d.get("ancho"),
                "espesor": d.get("espesor"),
                "cantidad": d.get("cantidad"),
            }
    return {}


def override_vigente(ov: Any, natural: dict[str, Any]) -> bool:
    """El empuje del reporte sigue vigente mientras la planilla no cambie la base."""
    if not isinstance(ov, dict):
        return False
    base = ov.get("base")
    if not isinstance(base, dict):
        return True
    for k in ("long", "ancho", "espesor", "cantidad"):
        if k not in base:
            continue
        if not _igual(base.get(k), natural.get(k), 2):
            return False
    return True


def _aplicar_neto(row: dict[str, Any], ov: dict[str, Any]) -> dict[str, Any]:
    nuevo = dict(row)
    for k in ("long", "ancho", "espesor"):
        if ov.get(k) is not None:
            nuevo[k] = _num(ov.get(k), 2)
    if ov.get("cantidad") is None:
        return nuevo
    nuevo_bruto = _num(ov.get("cantidad"), 2)
    viejo_bruto = _num(row.get("bruto"), 2)
    viejo_neto = _num(row.get("neto"), 2)
    if viejo_bruto is None:
        viejo_bruto = viejo_neto if viejo_neto is not None else 0.0
    if viejo_neto is None:
        viejo_neto = viejo_bruto
    delta = float(nuevo_bruto or 0) - float(viejo_bruto or 0)
    nuevo["bruto"] = nuevo_bruto
    nuevo["neto"] = round(float(viejo_neto or 0) + delta, 2)
    return nuevo


def _aplicar_descuento(row: dict[str, Any], ov: dict[str, Any]) -> dict[str, Any]:
    nuevo = dict(row)
    for k in ("long", "ancho", "espesor"):
        if ov.get(k) is not None:
            nuevo[k] = _num(ov.get(k), 2)
    if ov.get("cantidad") is not None:
        cant = _num(ov.get("cantidad"), 2)
        nuevo["cantidad"] = abs(cant) if cant is not None else cant
    return nuevo


def aplicar_dims_enlace(calculo: Optional[dict], dims: Any) -> dict[str, Any]:
    """Aplica overrides solo donde la base de la planilla no cambió.

    Sin mapa, o con claves cuya base ya no coincide, el cálculo queda igual.
    """
    if not isinstance(calculo, dict):
        return {}
    if not isinstance(dims, dict) or not dims:
        return calculo
    netos = []
    for n in calculo.get("netos") or []:
        if not isinstance(n, dict):
            netos.append(n)
            continue
        key = f"cantidades:{str(n.get('codigo') or '').upper()}"
        ov = dims.get(key)
        natural = _natural_de(calculo, key)
        if isinstance(ov, dict) and override_vigente(ov, natural):
            netos.append(_aplicar_neto(n, ov))
        else:
            netos.append(n)
    descuentos = []
    for d in calculo.get("descuentos") or []:
        if not isinstance(d, dict):
            descuentos.append(d)
            continue
        key = f"descuentos:{str(d.get('codigo') or '').upper()}"
        ov = dims.get(key)
        natural = _natural_de(calculo, key)
        if isinstance(ov, dict) and override_vigente(ov, natural):
            descuentos.append(_aplicar_descuento(d, ov))
        else:
            descuentos.append(d)
    volumen = []
    for d in calculo.get("descuentos_volumen_detalle") or []:
        if not isinstance(d, dict):
            volumen.append(d)
            continue
        key = f"descuentos:{str(d.get('codigo') or '').upper()}"
        ov = dims.get(key)
        natural = _natural_de(calculo, key)
        if isinstance(ov, dict) and override_vigente(ov, natural):
            volumen.append(_aplicar_descuento(d, ov))
        else:
            volumen.append(d)
    out = dict(calculo)
    out["netos"] = netos
    out["descuentos"] = descuentos
    out["descuentos_volumen_detalle"] = volumen
    out["descuentos_altura_detalle"] = volumen
    return out


def override_desde_registro(
    registro: dict[str, Any],
    *,
    signo: int,
    natural: dict[str, Any],
) -> dict[str, Any]:
    """Dimensiones y cantidad del registro → fila de la planilla, con base natural."""
    cant = registro.get("cantidad_total")
    try:
        cant_f = float(cant) if cant is not None and cant != "" else None
    except (TypeError, ValueError):
        cant_f = None
    if cant_f is not None and int(signo) < 0:
        cant_f = abs(cant_f)
    return {
        "long": registro.get("longitud"),
        "ancho": registro.get("ancho"),
        "espesor": registro.get("espesor"),
        "cantidad": None if cant_f is None else round(cant_f, 2),
        "base": {
            "long": natural.get("long"),
            "ancho": natural.get("ancho"),
            "espesor": natural.get("espesor"),
            "cantidad": natural.get("cantidad"),
        },
    }


def codigo_manual_de_origen(origen: str) -> Optional[str]:
    """EXC_ROC / OTROS / DESC_OTROS / origen de DESC_VOL_* viven en overrides manuales."""
    tabla, _, codigo = str(origen or "").partition(":")
    codigo = codigo.upper()
    if codigo.startswith("DESC_VOL_"):
        return codigo[len("DESC_VOL_"):]
    if tabla == "cantidades" and (codigo == "EXC_ROC" or codigo.startswith("OTROS")):
        return codigo
    if tabla == "descuentos" and codigo.startswith("DESC_OTROS"):
        return codigo
    return None


def patch_manual_desde_override(
    manuales: Any,
    codigo: str,
    ov: dict[str, Any],
) -> list[dict[str, Any]]:
    """Escribe Long/Ancho/Espesor en la lista manual, conservando el resto."""
    cod = str(codigo or "").upper()
    lista = [dict(x) for x in (manuales or []) if isinstance(x, dict)]
    idx = next(
        (i for i, x in enumerate(lista) if str(x.get("codigo") or "").upper() == cod),
        -1,
    )
    base = dict(lista[idx]) if idx >= 0 else {"codigo": cod}
    for k in ("long", "ancho", "espesor"):
        if ov.get(k) is not None:
            base[k] = ov.get(k)
    base["codigo"] = cod
    if idx >= 0:
        lista[idx] = base
    else:
        lista.append(base)
    return lista


def enlace_coincide_item(enlace: dict[str, Any], item: Optional[dict[str, Any]]) -> bool:
    """El vínculo sigue al ítem asignado, no a la fila."""
    if not isinstance(enlace, dict):
        return False
    eid = enlace.get("item_listado_id")
    if eid is None or item is None:
        return True
    try:
        return int(eid) == int(item.get("item_listado_id"))
    except (TypeError, ValueError):
        return str(eid) == str(item.get("item_listado_id") or "")


def marcar_alerta_link(link: dict[str, Any], now: str) -> dict[str, Any]:
    out = dict(link)
    out["alerta_sync_at"] = now
    return out


def limpiar_alerta_link(link: dict[str, Any]) -> dict[str, Any]:
    out = dict(link)
    out.pop("alerta_sync_at", None)
    return out


def planilla_tiene_alerta_sync(planilla: Optional[dict]) -> bool:
    if not isinstance(planilla, dict):
        return False
    meta = planilla.get("meta_cabecera") if isinstance(planilla.get("meta_cabecera"), dict) else {}
    links = meta.get(META_LINKS)
    if not isinstance(links, list):
        return False
    return any(isinstance(lk, dict) and lk.get("alerta_sync_at") for lk in links)


def contar_planillas_con_alerta_sync(planillas: list[dict]) -> int:
    return sum(1 for p in planillas or [] if planilla_tiene_alerta_sync(p))
