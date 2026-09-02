#!/usr/bin/env python3
"""Add CcModalBrandHeader to modal files missing it."""
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / 'src'

SKIP_FILES = {
    'CcModalBrandHeader.jsx',
    'CcAvisoModal.jsx',
    'CcConfirmModal.jsx',
    'TopoConfirmModal.jsx',
    'TopoErrorModal.jsx',
    'SicoeMediaLightbox.jsx',
    'poligonalModalIniciar.test.jsx',
    'TopoConflictModal.jsx',
    'EntradasFiltrosModal.jsx',
    'SalidasFiltrosModal.jsx',
    'SolicitudesFiltrosModal.jsx',
    'ModalPkMapaLeaflet.jsx',
    'EsquemaEditorModal.jsx',  # reexport only
}

IMPORT_MAP = [
    ('components/topografia/offline/', "import CcModalBrandHeader from '../../CcModalBrandHeader'"),
    ('components/topografia/', "import CcModalBrandHeader from '../CcModalBrandHeader'"),
    ('components/esquema/', "import CcModalBrandHeader from '../CcModalBrandHeader'"),
    ('components/panelCalculadora/', "import CcModalBrandHeader from '../CcModalBrandHeader'"),
    ('components/', "import CcModalBrandHeader from './CcModalBrandHeader'"),
    ('modules/seguimiento/', "import CcModalBrandHeader from '../../components/CcModalBrandHeader'"),
    ('modules/presupuesto/', "import CcModalBrandHeader from '../../components/CcModalBrandHeader'"),
    ('modules/sicoe-obra/', "import CcModalBrandHeader from '../../components/CcModalBrandHeader'"),
    ('modules/ayuda/', "import CcModalBrandHeader from '../../components/CcModalBrandHeader'"),
    ('almacen/', "import CcModalBrandHeader from '../components/CcModalBrandHeader'"),
    ('offline/', "import CcModalBrandHeader from '../components/CcModalBrandHeader'"),
    ('contabilidad/', "import CcModalBrandHeader from '../components/CcModalBrandHeader'"),
    ('admin/', "import CcModalBrandHeader from '../components/CcModalBrandHeader'"),
]

ROOT_IMPORT = "import CcModalBrandHeader from './components/CcModalBrandHeader'"

SHEET_MARKERS = [
    'cc-seguim-modal-sheet',
    'cc-ppto-modal-sheet',
    'cc-sicoe-filtro-modal-sheet',
    'cc-almacen-form-modal',
    'cc-contrato-modal-dialog',
    'cc-reporte-sheet',
    'cc-almacen-modal-sheet',
]


def rel_path(p: Path) -> str:
    return str(p.relative_to(SRC)).replace('\\', '/')


def import_line_for(path: Path) -> str:
    rel = rel_path(path)
    for prefix, imp in IMPORT_MAP:
        if rel.startswith(prefix):
            return imp
    if '/' not in rel:
        return ROOT_IMPORT
    raise ValueError(f'No import rule for {rel}')


def theme_prop(content: str) -> str:
    if re.search(r'\(\s*\{\s*t\s*[,}]', content) or re.search(r',\s*t\s*[,}]', content):
        return 'theme={t}'
    if re.search(r'\(\s*\{\s*theme\s*[,}]', content) or re.search(r',\s*theme\s*[,}]', content):
        return 'theme={theme}'
    return 'theme={t}'


def add_import(content: str, imp: str) -> str:
    if 'import CcModalBrandHeader' in content:
        return content
    m = re.search(r'^import .+$', content, re.M)
    if m:
        return content[: m.end()] + '\n' + imp + content[m.end() :]
    return imp + '\n' + content


def jsx_opening_tag_end(content: str, tag_start: int) -> int:
    i = tag_start + 1
    in_string = None
    brace_depth = 0
    while i < len(content):
        c = content[i]
        if in_string:
            if c == in_string:
                in_string = None
        elif c in ('"', "'"):
            in_string = c
        elif c == '{':
            brace_depth += 1
        elif c == '}':
            brace_depth = max(0, brace_depth - 1)
        elif c == '>' and brace_depth == 0:
            return i
        i += 1
    return -1


def indent_at(content: str, pos: int) -> str:
    line_start = content.rfind('\n', 0, pos) + 1
    return re.match(r'(\s*)', content[line_start:pos]).group(1)


def tag_is_overlay(tag_text: str) -> bool:
    if re.search(r"position:\s*['\"]fixed['\"]", tag_text) and re.search(
        r'inset:\s*0|top:\s*0', tag_text
    ):
        return True
    for marker in (
        'cc-seguim-modal-overlay',
        'cc-ppto-modal-overlay',
        'cc-sicoe-filtro-modal-overlay',
        'cc-almacen-modal-overlay',
    ):
        if marker in tag_text:
            return True
    return False


def find_next_element_panel(content: str, after: int) -> tuple[int, str] | None:
    i = after + 1
    while i < len(content) and content[i] in ' \t\n\r':
        i += 1
    if i >= len(content) or content[i] != '<':
        return None
    tag_start = i
    m = re.match(r'<(div|form|aside)\b', content[i:])
    if not m:
        return None
    close = jsx_opening_tag_end(content, tag_start)
    if close < 0:
        return None
    tag_text = content[tag_start : close + 1]
    if any(x in tag_text for x in SHEET_MARKERS):
        pass
    elif not (
        'stopPropagation' in tag_text
        or 'bgCard' in tag_text
        or 'borderRadius' in tag_text
        or 'overflow' in tag_text
        or 'cc-almacen' in tag_text
        or 'cc-reporte' in tag_text
        or 'sx.shell' in tag_text
        or 'style={modal}' in tag_text
    ):
        return None
    return close + 1, indent_at(content, tag_start) + '  '


def find_panel_insert(content: str) -> tuple[int, str] | None:
    # sx.shell
    m = re.search(r'<div style=\{sx\.shell\}', content)
    if m:
        close = jsx_opening_tag_end(content, m.start())
        if close >= 0:
            return close + 1, indent_at(content, m.start()) + '  '

    # Sheet markers
    for marker in SHEET_MARKERS:
        idx = 0
        while True:
            pos = content.find(marker, idx)
            if pos < 0:
                break
            tag_start = content.rfind('<', 0, pos)
            close = jsx_opening_tag_end(content, tag_start)
            if close >= 0:
                return close + 1, indent_at(content, tag_start) + '  '
            idx = pos + 1

    # role=dialog / alertdialog
    for role in ('dialog', 'alertdialog'):
        for m in re.finditer(rf'role=["\']{role}["\']', content):
            tag_start = content.rfind('<', 0, m.start())
            close = jsx_opening_tag_end(content, tag_start)
            if close < 0:
                continue
            tag_text = content[tag_start : close + 1]
            if tag_is_overlay(tag_text):
                child = find_next_element_panel(content, close)
                if child:
                    return child
                continue
            return close + 1, indent_at(content, tag_start) + '  '

    # stopPropagation inner card (PerfilUsuarioModal)
    pos = 0
    while True:
        m = re.search(r'<div\b', content[pos:])
        if not m:
            break
        abs_start = pos + m.start()
        close = jsx_opening_tag_end(content, abs_start)
        if close >= 0:
            tag_text = content[abs_start : close + 1]
            if 'stopPropagation' in tag_text and 'bgCard' in tag_text:
                return close + 1, indent_at(content, abs_start) + '  '
        pos = abs_start + 4

    # Politicas overflow hidden panel (no role)
    m = re.search(r'overflow:\s*[\'"]hidden[\'"]', content)
    if m and 'PoliticasConfidencialidad' in content:
        tag_start = content.rfind('<div', 0, m.start())
        close = jsx_opening_tag_end(content, tag_start)
        if close >= 0:
            return close + 1, indent_at(content, tag_start) + '  '

    return None


def process_file(path: Path) -> bool:
    content = path.read_text(encoding='utf-8')
    if 'CcModalBrandHeader' in content:
        return False
    if path.name in SKIP_FILES:
        return False

    insert = find_panel_insert(content)
    if insert is None:
        print(f'WARN: no insert point: {rel_path(path)}', file=sys.stderr)
        return False

    idx, child_indent = insert
    tp = theme_prop(content)
    snippet = f'{child_indent}<CcModalBrandHeader {tp} />\n'
    content = content[:idx] + snippet + content[idx:]
    content = add_import(content, import_line_for(path))
    path.write_text(content, encoding='utf-8')
    return True


def main():
    targets = []
    for p in SRC.rglob('*.jsx'):
        if p.name in SKIP_FILES or '.test.' in p.name:
            continue
        text = p.read_text(encoding='utf-8', errors='ignore')
        if 'CcModalBrandHeader' in text:
            continue
        if (
            'role="dialog"' in text
            or "role='dialog'" in text
            or 'role="alertdialog"' in text
            or 'Modal' in p.name
        ):
            targets.append(p)

    extra = [
        'TrazabilidadRegistroModal.jsx',
        'PoliticasConfidencialidadModal.jsx',
        'components/RefreshCacheGuard.jsx',
        'components/PanelSoporteTecnico.jsx',
        'modules/seguimiento/BitacoraAdjuntos.jsx',
        'modules/seguimiento/SeguimientoCalendario.jsx',
        'modules/seguimiento/LibroDigitalVista.jsx',
        'modules/seguimiento/ActaTemasTable.jsx',
        'modules/seguimiento/ActaEditor.jsx',
        'modules/seguimiento/ActaCompromisosAbiertosTable.jsx',
        'modules/seguimiento/BitacoraEntradaEditor.jsx',
        'modules/presupuesto/ModuloPresupuesto.jsx',
        'modules/presupuesto/PptoValidacionIcon.jsx',
        'modules/presupuesto/PptoSicoeGaleriaPicker.jsx',
        'modules/presupuesto/PptoGraficosGaleriaPicker.jsx',
        'modules/ayuda/MapaNavegacionVista.jsx',
        'components/topografia/PoligonalGrafico.jsx',
        'components/topografia/DisenoEstructuraPanel.jsx',
        'components/panelCalculadora/PanelCalculadora.jsx',
        'contabilidad/ContabilidadDocumentos.jsx',
        'admin/SeccionCatalogoInsumos.jsx',
        'ModuloInicio.jsx',
        'ModuloInformes.jsx',
        'ModuloGuias.jsx',
        'ModuloAuditorSST.jsx',
        'ProgObraDepAyuda.jsx',
        'modules/sicoe-obra/SicoeItemInfoPopup.jsx',
    ]
    for rel in extra:
        p = SRC / rel
        if p.exists() and p not in targets:
            targets.append(p)

    changed = []
    for p in sorted(set(targets)):
        if process_file(p):
            changed.append(rel_path(p))

    print(f'Updated {len(changed)} files:')
    for c in changed:
        print(f'  {c}')


if __name__ == '__main__':
    main()
