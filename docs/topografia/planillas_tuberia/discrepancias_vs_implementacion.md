# Discrepancias: inventario XLSM vs implementación Claracore

Fuente de verdad: `Planilla_Tuberia_original.xlsm` → `inventario_planilla_tuberia_xlsm.json` + `layout_map_planilla_tuberia.json`  
Implementación revisada: `backend/topografia_planilla_tuberia.py`, `backend/topografia_planilla_tuberia_routes.py`, `frontend/.../planillaTuberia/*`

## 1. Cabecera / título

| Excel (literal) | App actual |
|---|---|
| Título F1:L4 lista `$P$1:$P$2`: «PLANILLA DE INSTALACIÓN DE TUBERÍA ALCANTARILLAS» / «PLANILLA DE INSTALACIÓN DE FILTROS» | Select `ALCANTARILLA` / `FILTRO`; sin bloque de título fusionado |
| Código `INF-ING - TOP - 001 - V0` (M1) | Ausente |
| Contratista: / Interventoría: / Apoyo a la Supervisión / FECHA DE ELABORACIÓN | Ausentes |
| INFORMACION DEL CONTRATO (G5:N8) | Solo `contrato_id` |
| Abs Inicial / Abs Final / PK_ID / Costado (I10:M11) | PK + Costado; Abs no en franja Excel |

## 2. Georreferenciación (B12:G13)

| Excel | App |
|---|---|
| Abscisa Inicial, Norte Abs Inicial, Este Abs Incial, Abscisa Final, Norte Abs Final, Este Abs Final | Solo `norte_ref` / `este_ref`; sin bloque GEO de 6 celdas |

## 3. Parámetros de tubería (I12:M13)

| Excel | App |
|---|---|
| θ TUBERÍA (Mts), ESP. TUBERÍA, AREA TUBERÍA `=ROUND(PI()*((I13/2)+J13)^2,3)`, MATERIAL, TIPO DE RED | Ø, Espesor, Material; sin AREA TUBERÍA ni TIPO DE RED |

## 4. Áreas / atraque (B14:G15)

| Excel | App |
|---|---|
| Area 1 = segmento circular LET/ACOS | Area1 = `B·h − tubo/N` |
| Area 2 = AREA TUBERÍA − Area1 | Area2 = `tubo·(1−1/N)` |
| Altura Atraque `1:1…1:6` | `relacion_atraque` ✓ |
| Altura Relleno `=2·(θ/2+esp)/N` | ✓ (`altura_relleno_m`) |
| **Cama Triturado** (F15, solo ALCANTARILLA) | **Ausente** |
| Anc. Excavación (G15) | `ancho_excavacion_m` ✓ |

## 5. Cartera (B16:J36) + panel GRAFICO (K16:N42)

| Excel | App |
|---|---|
| Abscisa, Terreno Natural, Subrasante de Vía (cond.), Cota Lomo\|Terminado Filtro, Cota Fondo Excavación, Altura Excavacion/Triturado/Relleno, Ancho Geotextil | Abreviados TN / Subrasante\|Terminado / CFE / H.* |
| H.Trit ALC=`$E$15+$F$15`; FILTRO=`E−F` | Siempre `h_atr` |
| H.Rell ALC=`G−(E15+F15)`; FILTRO=`0` | `nivel−(CFE+d_ext)` ambos |
| Ancho Geo FILTRO=`AVERAGE(Hprev:H)·2+$G$15·2`; ALC vacío | ALC=`B+2·h_exc`; FILTRO=`B+2·(h_trit+h_rell)` |
| Panel GRAFICO por celdas | SVG sección; Excel export sin GRAFICO |

## 6. Resumen de Cantidades (B43:H50)

| Excel | App |
|---|---|
| Excavación Varias, Excavación Roca, Long Tubería, Triturado / Atraque, Relleno Gran., Geotextil | `EXC,TRI,REL,GEO,TUB` — nombres distintos; sin Roca |
| Columnas Item, Long, Ancho, Espesor, Desc., Cantidad | Cód, Ítem, Ud, Bruto, Desc, Neto |
| TRI = `L·B·prom(h_trit)−Desc` | TRI = `Area1·L` |
| Roca espesor fijo `0.05` | No implementado |

## 7. Descuentos Específicos (I43:N50)

| Excel | App |
|---|---|
| Tubería Filtro / Area 1 / Area 2 / Otros | `DESC_TUB` (+ `DESC_POZO`/`DESC_FILT`) |
| Columnas Long, Ancho, Espesor, Cantidad | Solo cantidad |
| Editor dimensional | FE envía `descuentos_manuales: []` |

## 8. Perfil + firmas

| Excel | App |
|---|---|
| ScatterChart «Perfil Longitudinal de Tubería» (TN / Terminado Filtro / Cota Fondo) vía `Tbl_Auxiliares` | SVG en FE; Excel/PDF sin chart |
| Elaboró / Aprobó | Tres roles distintos |

## 9. Motor — fórmulas objetivo (literales XLSM)

- **Area1** B15: `r=I13/2+J13`, `h=E15`, `ROUND(r²·ACOS((r−h)/r)−(r−h)·√(2rh−h²),3)`
- **Area2** C15: `ROUND(K13−B15,3)`
- **AREA TUBERÍA** K13: `ROUND(PI()*((I13/2)+J13)^2,3)`
- **Altura Relleno** E15: `ROUND(2*(I13/2+J13)/N,3)` (N=denominador de D15)
- **Cartera** G=`C−F`; H ALC=`E15+F15` / FILTRO=`E−F`; I ALC=`G−(E15+F15)` / FILTRO=`0`; J FILTRO=`AVERAGE(Hprev:H)*2+G15*2`
- **Cantidades**: Long×Ancho×Espesor; Desc en Triturado (`G48=N46` ALC / `N45` FILTRO); H49 sin restar G49
- **Descuentos**: product dimensional; ítems condicionales por tipo

## 10. Nota E16

Fórmula original `=IF(F1=Q1,"Cota Lomo","Terminado Filtro")` con Q1 vacío → siempre «Terminado Filtro». El resto usa `$F$1=$P$1`. Reconstrucción UI: ALCANTARILLA→«Cota Lomo», FILTRO→«Terminado Filtro» (coherente con P1/P2); se documenta el typo Q1.

## 11. Alcance de corrección (sin romper modelo)

- Ampliar `meta_cabecera` / `firmas` (JSONB) para partes, contrato, cama triturado, geo N/E final, Elaboró/Aprobó.
- No cambiar endpoints/tablas salvo campos opcionales en JSONB / params ya aceptados.
- Reescribir motor, FE, PDF y Excel contra este inventario.
