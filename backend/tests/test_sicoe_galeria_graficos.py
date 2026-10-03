"""Galería SICOE gráficos: historial + grafico_url, dedupe sin renumerar."""
import main as m


def test_extrae_desde_historial_y_url_actual():
    filas = [
        {
            "grafico_url": "https://cdn/actual.png",
            "grafico_numero": 5,
            "grafico_descripcion": "vigente",
            "graficos_historial": [
                {"url": "https://cdn/viejo.png", "numero": 3, "descripcion": "prev"},
                {"url": "https://cdn/actual.png", "numero": 5},
            ],
        }
    ]
    out = m._galeria_extraer_graficos_unicos(filas)
    urls = [x["url"] for x in out]
    assert "https://cdn/viejo.png" in urls
    assert "https://cdn/actual.png" in urls
    assert urls.count("https://cdn/actual.png") == 1
    by_url = {x["url"]: x["numero"] for x in out}
    assert by_url["https://cdn/viejo.png"] == 3
    assert by_url["https://cdn/actual.png"] == 5


def test_dedupe_mismo_grafico_en_varios_registros():
    filas = [
        {"grafico_url": "https://cdn/g1.png", "grafico_numero": 7, "graficos_historial": []},
        {
            "grafico_url": "https://cdn/g1.png",
            "grafico_numero": 7,
            "graficos_historial": [{"url": "https://cdn/g1.png", "numero": 7}],
        },
        {"grafico_url": "https://cdn/g2.png", "grafico_numero": 8, "graficos_historial": None},
    ]
    out = m._galeria_extraer_graficos_unicos(filas)
    assert len(out) == 2
    assert {x["numero"] for x in out} == {7, 8}


def test_historial_json_string_y_sin_renumerar():
    filas = [
        {
            "grafico_url": None,
            "grafico_numero": None,
            "graficos_historial": '[{"url":"https://cdn/h.png","numero":12}]',
        }
    ]
    out = m._galeria_extraer_graficos_unicos(filas)
    assert len(out) == 1
    assert out[0]["numero"] == 12
    assert out[0]["url"] == "https://cdn/h.png"


def test_omite_entradas_sin_url():
    out = m._galeria_extraer_graficos_unicos(
        [
            {"grafico_url": "", "grafico_numero": 1, "graficos_historial": [{"numero": 2}]},
            {"grafico_url": "https://cdn/ok.png", "grafico_numero": 9},
        ]
    )
    assert len(out) == 1
    assert out[0]["numero"] == 9
