"""
Motor CPM (Critical Path Method) — Fase 2
Opera a nivel nodo = (pk_id, capitulo).
Algoritmo: forward pass → backward pass → holguras → ruta crítica.

Estrategia de calendario:
  Convierte fechas a índices de días hábiles (enteros) usando la lista
  de días hábiles del rango del proyecto. Toda la aritmética CPM es
  entera. Al final convierte índices de vuelta a fechas.
  Esto evita aritmética de calendario en el núcleo del algoritmo.

Convención de add_dias_habiles (prog_obra_calendar):
  add_dias_habiles(d, n) = último día de un bloque de n días hábiles
  comenzando en el primer día hábil en o después de d (inclusive).
  → add_dias_habiles(d, 1) = siguiente_dia_habil(d)
  → El bloque [d, add_dias_habiles(d, n)] contiene exactamente n días hábiles.

Tipos de dependencia (lag en días hábiles):
  FS  Finish-Start:   dest.ES ≥ orig.EF + lag + 1  (índices)
  SS  Start-Start:    dest.ES ≥ orig.ES + lag
  FF  Finish-Finish:  dest.EF ≥ orig.EF + lag
  SF  Start-Finish:   dest.EF ≥ orig.ES + lag
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx

from prog_obra_calendar import (
    CalendarioNoHabilesCache,
    es_dia_habil,
)

_log = logging.getLogger(__name__)

NodeKey = Tuple[str, str, str]  # (pk_id, capitulo, agrupador_id or "")
_INF = 10 ** 9


# ─────────────────────────────────────────────────────────────────────────────
# Estructuras de datos
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class NodoCPM:
    pk_id: str
    capitulo: str
    duracion: int          # días hábiles del capítulo
    fecha_inicio_base: date
    fecha_fin_base: date
    agrupador_id: str = ""   # vacío = nodo capítulo completo
    # Resultados — se rellenan por calcular_cpm()
    fecha_inicio_temprana: Optional[date] = None
    fecha_fin_temprana: Optional[date] = None
    fecha_inicio_tardia: Optional[date] = None
    fecha_fin_tardia: Optional[date] = None
    holgura_total: int = 0
    holgura_libre: int = 0
    es_ruta_critica: bool = False

    @property
    def key(self) -> NodeKey:
        return (self.pk_id, self.capitulo, self.agrupador_id or "")


@dataclass
class DependenciaCPM:
    pk_id_origen: str
    capitulo_origen: str
    pk_id_destino: str
    capitulo_destino: str
    tipo: str    # FS | SS | FF | SF
    lag_dias: int = 0
    agrupador_id_origen: str = ""
    agrupador_id_destino: str = ""

    @property
    def origen(self) -> NodeKey:
        return (self.pk_id_origen, self.capitulo_origen, self.agrupador_id_origen or "")

    @property
    def destino(self) -> NodeKey:
        return (self.pk_id_destino, self.capitulo_destino, self.agrupador_id_destino or "")


@dataclass
class ResultadoCPM:
    ok: bool = True
    error: Optional[str] = None
    nodos: List[NodoCPM] = field(default_factory=list)
    ruta_critica: List[NodeKey] = field(default_factory=list)
    nodos_afectados_cascada: List[NodeKey] = field(default_factory=list)
    ciclos: List[List[NodeKey]] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Índice de días hábiles
# ─────────────────────────────────────────────────────────────────────────────

def _build_wd_index(
    date_min: date,
    date_max: date,
    contrato_id: int,
    cache: CalendarioNoHabilesCache,
    padding_days: int = 500,
) -> tuple[list[date], dict[date, int]]:
    """
    Genera lista de días hábiles [date_min - padding, date_max + padding]
    y un dict date → índice entero.
    El padding garantiza que fechas calculadas por CPM quepan en el índice.
    """
    start = date_min - timedelta(days=padding_days)
    end   = date_max + timedelta(days=padding_days)
    working_days: list[date] = []
    d = start
    while d <= end:
        if es_dia_habil(d, contrato_id, cache):
            working_days.append(d)
        d += timedelta(days=1)
    wd_to_idx: dict[date, int] = {wd: i for i, wd in enumerate(working_days)}
    return working_days, wd_to_idx


def _nearest_idx(d: date, wd_to_idx: dict[date, int], working_days: list[date]) -> int:
    """Retorna el índice del día hábil más cercano (en o después de d)."""
    if d in wd_to_idx:
        return wd_to_idx[d]
    # Avanzar hasta encontrar un día hábil
    probe = d
    for _ in range(14):
        probe += timedelta(days=1)
        if probe in wd_to_idx:
            return wd_to_idx[probe]
    # Fallback: primer elemento del índice
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# Núcleo CPM
# ─────────────────────────────────────────────────────────────────────────────

def calcular_cpm(
    nodos: list[NodoCPM],
    dependencias: list[DependenciaCPM],
    contrato_id: int,
    cache: CalendarioNoHabilesCache,
) -> ResultadoCPM:
    """
    Ejecuta el CPM completo sobre los nodos y dependencias dados.
    Modifica los campos de resultado de cada NodoCPM in-place.
    Retorna ResultadoCPM con estado y ruta crítica.
    """
    if not nodos:
        return ResultadoCPM(ok=True, nodos=[], ruta_critica=[])

    # ── 1. Construir índice de días hábiles ────────────────────────────────
    all_dates = [n.fecha_inicio_base for n in nodos] + [n.fecha_fin_base for n in nodos]
    date_min = min(all_dates)
    date_max = max(all_dates)
    working_days, wd_to_idx = _build_wd_index(date_min, date_max, contrato_id, cache)
    max_idx = len(working_days) - 1

    def to_idx(d: date) -> int:
        return _nearest_idx(d, wd_to_idx, working_days)

    def to_date(idx: int) -> Optional[date]:
        if 0 <= idx <= max_idx:
            return working_days[idx]
        return None

    # ── 2. Construir grafo dirigido ────────────────────────────────────────
    G = nx.DiGraph()
    node_map: dict[NodeKey, NodoCPM] = {}
    for n in nodos:
        G.add_node(n.key)
        node_map[n.key] = n

    # Filtrar dependencias cuyos nodos existen en el grafo
    valid_deps: list[DependenciaCPM] = []
    for dep in dependencias:
        if dep.origen in node_map and dep.destino in node_map:
            G.add_edge(dep.origen, dep.destino, tipo=dep.tipo, lag=dep.lag_dias)
            valid_deps.append(dep)
        else:
            _log.warning(
                "Dependencia ignorada — nodo(s) sin fechas: %s → %s",
                dep.origen, dep.destino,
            )

    # ── 3. Detección de ciclos ─────────────────────────────────────────────
    if not nx.is_directed_acyclic_graph(G):
        raw_cycles = list(nx.simple_cycles(G))
        return ResultadoCPM(
            ok=False,
            error=(
                f"El grafo contiene {len(raw_cycles)} ciclo(s). "
                f"Primer ciclo: {' → '.join(str(n) for n in raw_cycles[0])}"
            ),
            ciclos=raw_cycles,
        )

    topo_order = list(nx.topological_sort(G))

    # ── 4. Inicializar índices ES / EF ─────────────────────────────────────
    ES: dict[NodeKey, int] = {}
    EF: dict[NodeKey, int] = {}
    dur: dict[NodeKey, int] = {}

    for n in nodos:
        es_i = to_idx(n.fecha_inicio_base)
        ef_i = to_idx(n.fecha_fin_base)
        # duracion = número de días hábiles del bloque (mínimo 1)
        d_i = max(1, ef_i - es_i + 1)
        dur[n.key] = d_i
        ES[n.key] = es_i
        EF[n.key] = ef_i

    # ── 5. Forward pass ───────────────────────────────────────────────────
    for key in topo_order:
        # Propagar restricción a cada sucesor
        for _, succ_key, edge_data in G.out_edges(key, data=True):
            tipo: str = edge_data["tipo"]
            lag:  int = edge_data["lag"]
            _apply_forward(ES, EF, dur, key, succ_key, tipo, lag)

        # Recalcular EF del nodo después de recibir restricciones de predecesores
        EF[key] = ES[key] + dur[key] - 1

    # ── 6. Backward pass ──────────────────────────────────────────────────
    # LF de todos los nodos hoja inicializado al EF máximo del proyecto
    project_ef = max(EF.values())
    LF: dict[NodeKey, int] = {k: project_ef for k in node_map}
    LS: dict[NodeKey, int] = {}

    for key in reversed(topo_order):
        # Propagar restricción a cada predecesor
        for pred_key, _, edge_data in G.in_edges(key, data=True):
            tipo: str = edge_data["tipo"]
            lag:  int = edge_data["lag"]
            _apply_backward(LF, LS, dur, pred_key, key, tipo, lag, ES)

        LS[key] = LF[key] - dur[key] + 1

    # ── 7. Holguras y ruta crítica ────────────────────────────────────────
    ruta_critica: list[NodeKey] = []
    for key, n in node_map.items():
        ht = LS[key] - ES[key]   # holgura total (en días hábiles índice)
        n.holgura_total = max(0, ht)
        n.es_ruta_critica = (ht == 0)
        if n.es_ruta_critica:
            ruta_critica.append(key)

    # Holgura libre: min ES de sucesores FS - EF_propio - 1
    for key, n in node_map.items():
        libre = _INF
        for _, succ_key, edge_data in G.out_edges(key, data=True):
            tipo = edge_data["tipo"]
            lag  = edge_data["lag"]
            if tipo == "FS":
                libre = min(libre, ES[succ_key] - EF[key] - 1 - lag)
            elif tipo == "SS":
                libre = min(libre, ES[succ_key] - ES[key] - lag)
            elif tipo == "FF":
                libre = min(libre, EF[succ_key] - EF[key] - lag)
            elif tipo == "SF":
                libre = min(libre, EF[succ_key] - ES[key] - lag)
        n.holgura_libre = max(0, libre if libre < _INF else n.holgura_total)

    # ── 8. Convertir índices a fechas ─────────────────────────────────────
    for key, n in node_map.items():
        n.fecha_inicio_temprana = to_date(ES[key])
        n.fecha_fin_temprana    = to_date(EF[key])
        n.fecha_inicio_tardia   = to_date(LS[key])
        n.fecha_fin_tardia      = to_date(LF[key])

    return ResultadoCPM(
        ok=True,
        nodos=nodos,
        ruta_critica=ruta_critica,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de forward / backward
# ─────────────────────────────────────────────────────────────────────────────

def _apply_forward(
    ES: dict, EF: dict, dur: dict,
    orig: NodeKey, dest: NodeKey,
    tipo: str, lag: int,
) -> None:
    """
    Actualiza ES[dest] (y EF[dest] para FF/SF) según la dependencia.
    Índices de días hábiles enteros.

    Reglas (índices):
      FS: dest.ES >= orig.EF + lag + 1
      SS: dest.ES >= orig.ES + lag
      FF: dest.EF >= orig.EF + lag  → dest.ES = dest.EF - dur + 1
      SF: dest.EF >= orig.ES + lag  → dest.ES = dest.EF - dur + 1
    """
    if tipo == "FS":
        new_es = EF[orig] + lag + 1
        if new_es > ES[dest]:
            ES[dest] = new_es
            EF[dest] = ES[dest] + dur[dest] - 1

    elif tipo == "SS":
        new_es = ES[orig] + lag
        if new_es > ES[dest]:
            ES[dest] = new_es
            EF[dest] = ES[dest] + dur[dest] - 1

    elif tipo == "FF":
        new_ef = EF[orig] + lag
        if new_ef > EF[dest]:
            EF[dest] = new_ef
            ES[dest] = EF[dest] - dur[dest] + 1

    elif tipo == "SF":
        new_ef = ES[orig] + lag
        if new_ef > EF[dest]:
            EF[dest] = new_ef
            ES[dest] = EF[dest] - dur[dest] + 1


def _apply_backward(
    LF: dict, LS: dict, dur: dict,
    pred: NodeKey, succ: NodeKey,
    tipo: str, lag: int,
    ES: dict,
) -> None:
    """
    Actualiza LF[pred] (y LS[pred] para SS/SF) según la dependencia.

    Reglas inversas (índices):
      FS: pred.LF ≤ succ.LS - lag - 1   →  LF[pred] = min(LF[pred], LS[succ] - lag - 1)
      SS: pred.LS ≤ succ.LS - lag       →  LF[pred] = min(LF[pred], succ.LS - lag + dur[pred] - 1)
      FF: pred.LF ≤ succ.LF - lag       →  LF[pred] = min(LF[pred], LF[succ] - lag)
      SF: pred.LS ≤ succ.LF - lag       →  LF[pred] = min(LF[pred], succ.LF - lag + dur[pred] - 1)
    """
    succ_ls = LF[succ] - dur[succ] + 1  # LS del sucesor

    if tipo == "FS":
        constraint = succ_ls - lag - 1
        if constraint < LF[pred]:
            LF[pred] = constraint

    elif tipo == "SS":
        # pred.LS ≤ succ.LS - lag  →  pred.LF = pred.LS + dur - 1 ≤ succ.LS - lag + dur - 1
        constraint = succ_ls - lag + dur[pred] - 1
        if constraint < LF[pred]:
            LF[pred] = constraint

    elif tipo == "FF":
        constraint = LF[succ] - lag
        if constraint < LF[pred]:
            LF[pred] = constraint

    elif tipo == "SF":
        # pred.LS ≤ succ.LF - lag  →  pred.LF ≤ succ.LF - lag + dur - 1
        constraint = LF[succ] - lag + dur[pred] - 1
        if constraint < LF[pred]:
            LF[pred] = constraint


# ─────────────────────────────────────────────────────────────────────────────
# Utilidad: detectar nodos afectados por cambio de fecha en cascada
# ─────────────────────────────────────────────────────────────────────────────

def nodos_afectados_por(
    changed_keys: list[NodeKey],
    dependencias: list[DependenciaCPM],
) -> list[NodeKey]:
    """
    Dado un conjunto de nodos modificados, retorna todos los descendientes
    (transitivos) en el grafo de dependencias.
    Útil para notificar al usuario qué capítulos cambiarán en cascada.
    """
    G = nx.DiGraph()
    for dep in dependencias:
        G.add_edge(dep.origen, dep.destino)

    afectados: set[NodeKey] = set()
    for key in changed_keys:
        if key in G:
            descendants = nx.descendants(G, key)
            afectados.update(descendants)

    # Excluir los nodos que iniciaron el cambio
    afectados -= set(changed_keys)
    return list(afectados)
