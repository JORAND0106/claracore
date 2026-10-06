"""Evaluador mínimo de fórmulas de Excel para pruebas del informe mensual.

Cubre referencias de hoja, ROUND, IF, AND, OR, MIN, MID, LEN, SUM,
concatenación y aritmética. El redondeo es half-away-from-zero, como Excel.
"""
from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Tuple


class Blank:
    """Celda vacía. En Excel equivale a 0 en aritmética y a \"\" en texto."""

    def __repr__(self) -> str:
        return "BLANK"


BLANK = Blank()

_CELL_RE = re.compile(r"^\$?([A-Z]{1,3})\$?(\d+)$")


def excel_round(value: Any, digits: Any = 0) -> float:
    n = _num(value)
    d = int(_num(digits))
    factor = 10 ** d
    scaled = n * factor
    if scaled >= 0:
        return math.floor(scaled + 0.5) / factor
    return math.ceil(scaled - 0.5) / factor


def _num(value: Any) -> float:
    if isinstance(value, Blank) or value is None or value == "":
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    return float(value)


def _text(value: Any) -> str:
    if isinstance(value, Blank) or value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _truthy(value: Any) -> bool:
    if isinstance(value, Blank) or value is None or value == "":
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return bool(value)


def _cmp(op: str, left: Any, right: Any) -> bool:
    if op == "=":
        if _is_textish(left) or _is_textish(right):
            return _text(left).lower() == _text(right).lower()
        return _num(left) == _num(right)
    if op == "<>":
        return not _cmp("=", left, right)
    ln, rn = _num(left), _num(right)
    if op == "<":
        return ln < rn
    if op == ">":
        return ln > rn
    if op == "<=":
        return ln <= rn
    if op == ">=":
        return ln >= rn
    raise ValueError(f"operador {op}")


def _is_textish(value: Any) -> bool:
    return isinstance(value, str) or isinstance(value, Blank)


class _Parser:
    def __init__(self, formula: str):
        self.s = formula
        self.i = 0
        self.n = len(formula)

    def parse(self) -> Any:
        node = self._comparison()
        self._skip()
        if self.i != self.n:
            raise ValueError(f"sobra {self.s[self.i:]!r} en {self.s!r}")
        return node

    def _skip(self) -> None:
        while self.i < self.n and self.s[self.i] in " \t\n":
            self.i += 1

    def _peek(self) -> str:
        self._skip()
        return self.s[self.i] if self.i < self.n else ""

    def _comparison(self) -> Any:
        left = self._concat()
        op = self._take_cmp()
        if not op:
            return left
        right = self._concat()
        return ("cmp", op, left, right)

    def _take_cmp(self) -> Optional[str]:
        self._skip()
        for op in ("<=", ">=", "<>", "=", "<", ">"):
            if self.s.startswith(op, self.i):
                self.i += len(op)
                return op
        return None

    def _concat(self) -> Any:
        node = self._sum()
        while self._peek() == "&":
            self.i += 1
            node = ("&", node, self._sum())
        return node

    def _sum(self) -> Any:
        node = self._prod()
        while (op := self._peek()) and op in "+-":
            self.i += 1
            node = (op, node, self._prod())
        return node

    def _prod(self) -> Any:
        node = self._unary()
        while (op := self._peek()) and op in "*/":
            self.i += 1
            node = (op, node, self._unary())
        return node

    def _unary(self) -> Any:
        if self._peek() == "-":
            self.i += 1
            return ("neg", self._unary())
        if self._peek() == "+":
            self.i += 1
            return self._unary()
        return self._primary()

    def _primary(self) -> Any:
        self._skip()
        if self.i >= self.n:
            raise ValueError("fórmula incompleta")
        ch = self.s[self.i]
        if ch == "(":
            self.i += 1
            node = self._comparison()
            if self._peek() != ")":
                raise ValueError("falta )")
            self.i += 1
            return node
        if ch == '"':
            return ("str", self._string())
        if ch.isdigit() or (ch == "." and self.i + 1 < self.n and self.s[self.i + 1].isdigit()):
            return ("num", self._number())
        if ch == "'":
            sheet, coord = self._quoted_ref()
            return self._maybe_range(("ref", sheet, coord))
        if ch.isalpha() or ch == "$":
            name = self._name_or_cell()
            if _CELL_RE.match(name):
                return self._maybe_range(("ref", None, name.replace("$", "")))
            self._skip()
            if self._peek() == "(":
                self.i += 1
                args: List[Any] = []
                if self._peek() != ")":
                    while True:
                        args.append(self._arg())
                        if self._peek() == ",":
                            self.i += 1
                            continue
                        break
                if self._peek() != ")":
                    raise ValueError(f"falta ) tras {name}")
                self.i += 1
                return ("fn", name.upper(), args)
            raise ValueError(f"nombre suelto {name}")
        raise ValueError(f"token inesperado {self.s[self.i:]!r}")

    def _arg(self) -> Any:
        return self._comparison()

    def _maybe_range(self, ref_node: Any) -> Any:
        self._skip()
        if self._peek() != ":":
            return ref_node
        self.i += 1
        self._skip()
        if self.s[self.i] == "'":
            sheet, coord = self._quoted_ref()
            other = ("ref", sheet, coord)
        else:
            name = self._name_or_cell()
            if not _CELL_RE.match(name):
                raise ValueError(f"rango inválido {name}")
            other = ("ref", None, name.replace("$", ""))
        return ("range", ref_node, other)

    def _string(self) -> str:
        self.i += 1
        out = []
        while self.i < self.n:
            ch = self.s[self.i]
            if ch == '"':
                if self.i + 1 < self.n and self.s[self.i + 1] == '"':
                    out.append('"')
                    self.i += 2
                    continue
                self.i += 1
                return "".join(out)
            out.append(ch)
            self.i += 1
        raise ValueError("string sin cerrar")

    def _number(self) -> float:
        start = self.i
        while self.i < self.n and (self.s[self.i].isdigit() or self.s[self.i] == "."):
            self.i += 1
        return float(self.s[start:self.i])

    def _name_or_cell(self) -> str:
        start = self.i
        while self.i < self.n and (self.s[self.i].isalnum() or self.s[self.i] in "$_"):
            self.i += 1
        return self.s[start:self.i]

    def _quoted_ref(self) -> Tuple[str, str]:
        self.i += 1
        out = []
        while self.i < self.n:
            ch = self.s[self.i]
            if ch == "'":
                if self.i + 1 < self.n and self.s[self.i + 1] == "'":
                    out.append("'")
                    self.i += 2
                    continue
                self.i += 1
                break
            out.append(ch)
            self.i += 1
        else:
            raise ValueError("hoja sin cerrar")
        if self.i >= self.n or self.s[self.i] != "!":
            raise ValueError("falta !")
        self.i += 1
        coord = self._name_or_cell().replace("$", "")
        if not _CELL_RE.match(coord):
            raise ValueError(f"celda inválida {coord}")
        return "".join(out), coord


def _col_row(coord: str) -> Tuple[int, int]:
    m = _CELL_RE.match(coord.upper())
    if not m:
        raise ValueError(coord)
    col = 0
    for ch in m.group(1):
        col = col * 26 + (ord(ch) - 64)
    return col, int(m.group(2))


class FormulaBook:
    def __init__(self, wb):
        self.wb = wb
        self.cache: Dict[Tuple[str, int, int], Any] = {}
        self.stack: set = set()

    def eval_formula(self, sheet: str, formula: str) -> Any:
        src = formula[1:] if formula.startswith("=") else formula
        node = _Parser(src).parse()
        return self._ev(sheet, node)

    def eval_cell(self, sheet: str, row: int, col: int) -> Any:
        key = (sheet, row, col)
        if key in self.cache:
            return self.cache[key]
        if key in self.stack:
            raise ValueError(f"referencia circular {key}")
        cell = self.wb[sheet].cell(row, col)
        value = cell.value
        if isinstance(value, str) and value.startswith("="):
            self.stack.add(key)
            try:
                result = self.eval_formula(sheet, value)
            finally:
                self.stack.discard(key)
        elif value is None:
            result = BLANK
        else:
            result = value
        self.cache[key] = result
        return result

    def _ev(self, sheet: str, node: Any) -> Any:
        if not isinstance(node, tuple):
            return node
        kind = node[0]
        if kind == "num":
            return node[1]
        if kind == "str":
            return node[1]
        if kind == "ref":
            sh, coord = node[1] or sheet, node[2]
            col, row = _col_row(coord)
            return self.eval_cell(sh, row, col)
        if kind == "range":
            return self._range_values(sheet, node[1], node[2])
        if kind == "neg":
            return -_num(self._ev(sheet, node[1]))
        if kind == "&":
            return _text(self._ev(sheet, node[1])) + _text(self._ev(sheet, node[2]))
        if kind in "+-*/":
            a, b = _num(self._ev(sheet, node[1])), _num(self._ev(sheet, node[2]))
            if kind == "+":
                return a + b
            if kind == "-":
                return a - b
            if kind == "*":
                return a * b
            return a / b
        if kind == "cmp":
            return _cmp(node[1], self._ev(sheet, node[2]), self._ev(sheet, node[3]))
        if kind == "fn":
            return self._fn(sheet, node[1], node[2])
        raise ValueError(f"nodo {kind}")

    def _range_values(self, sheet: str, left: Any, right: Any) -> List[Any]:
        sh1, c1 = left[1] or sheet, left[2]
        sh2, c2 = right[1] or sh1, right[2]
        if sh1 != sh2:
            raise ValueError("rango entre hojas")
        col1, row1 = _col_row(c1)
        col2, row2 = _col_row(c2)
        out = []
        for row in range(min(row1, row2), max(row1, row2) + 1):
            for col in range(min(col1, col2), max(col1, col2) + 1):
                out.append(self.eval_cell(sh1, row, col))
        return out

    def _fn(self, sheet: str, name: str, args: List[Any]) -> Any:
        if name == "ROUND":
            return excel_round(self._ev(sheet, args[0]), self._ev(sheet, args[1]) if len(args) > 1 else 0)
        if name == "LEN":
            return len(_text(self._ev(sheet, args[0])))
        if name == "MID":
            text = _text(self._ev(sheet, args[0]))
            start = int(_num(self._ev(sheet, args[1])))
            length = int(_num(self._ev(sheet, args[2])))
            if start < 1:
                start = 1
            return text[start - 1:start - 1 + max(length, 0)]
        if name == "IF":
            cond = self._ev(sheet, args[0])
            branch = args[1] if _truthy(cond) else args[2]
            return self._ev(sheet, branch)
        if name == "AND":
            return all(_truthy(self._ev(sheet, a)) for a in args)
        if name == "OR":
            return any(_truthy(self._ev(sheet, a)) for a in args)
        if name == "MIN":
            return min(_num(self._ev(sheet, a)) for a in args)
        if name == "MAX":
            return max(_num(self._ev(sheet, a)) for a in args)
        if name == "SUM":
            total = 0.0
            for arg in args:
                val = self._ev(sheet, arg)
                seq = val if isinstance(val, list) else [val]
                for item in seq:
                    if isinstance(item, str):
                        continue
                    total += _num(item)
            return total
        raise ValueError(f"función no soportada {name}")
