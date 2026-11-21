# Verificación — Barra de iconos y limpieza visual (Programación de Obra)

Fecha: 2026-11-21. Rama: `cursor/prog-obra-barra-iconos-ui`.

## Cambios visibles

1. **Ribbon fuera del header global** — Automática / Curva S / Comparar / Exportar / Eliminar viven en la cabecera del panel lateral del módulo. Manual de uso, Bloc y asistente no se tocan.
2. **Presupuesto / Estado / Leyenda** — Palabra clave visible; detalle en `data-cc-tooltip`.
3. **Banner** — Solo `Borrador nºN` (sin truncar); detalle en tooltip.
4. **`/mapa … ms`** — Solo rol Desarrollador, como icono ⏱ con tooltip.
5. **Plano / Programación|Ejecutado / Sincronizar** — Solo icono + tooltip; misma función.

## Pruebas automáticas

```
node --test src/modules/sicoe-obra/progObraRibbonLayout.scenario.test.js
→ 4 passed
```

## QA manual pendiente (iPad + computador × temas)

- [ ] Todos los iconos del módulo visibles y tocables al primer toque (sin quedar bajo Manual/Bloc/asistente).
- [ ] Ningún texto cortado en banner, panel o leyenda.
- [ ] Ningún overlay del mapa tapa a otro (ejecución · borrador/conmutador · leyenda · basemap).
- [ ] Temas Claro, Oscuro, Automático y Descanso.

## Sin interferencia con el prompt técnico

No se modificó CPM, segregación, costos, permisos ni exportes (solo UI de chrome del módulo y App.jsx para retirar el ribbon del header).
