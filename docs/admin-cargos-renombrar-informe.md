# Informe — Renombrar cargos y copias fijas de `cargo_nombre`

## Cómo se propaga el nombre nuevo

Los usuarios de plataforma guardan `usuarios.cargo_id` (FK), no una copia del nombre.
`cargo_nombre` se resuelve al vuelo desde `cargos.nombre` en:

- login / emisión de JWT
- `GET /usuarios/me` (la app refresca esto en polling)
- listados de Gestión de Usuarios (`/admin/todos-usuarios`, pendientes, etc.)

Tras un `PUT /admin/cargos/{id}` solo se actualiza `cargos.nombre`. Permisos (`permisos.cargo_id`),
módulos de la matriz y asignaciones de usuarios **no se tocan**.

## Lugares con copia fija (no se modifican en este cambio)

| Lugar | Qué guarda | Efecto al renombrar |
|---|---|---|
| Informes CCD firmas (`elaboro_cargo`, `reviso_cargo`, …) | Texto en config/snapshot del informe | Documentos/PDFs ya generados conservan el texto histórico |
| PDFs / Excel de informes (`usuario_cargo` en contexto de generación) | Snapshot al generar | Archivos ya emitidos no cambian |
| Orden de pago PDF (`elaboro_cargo`) | Texto embebido | Histórico intacto |
| RRHH `rrhh_trabajadores.cargo_aspira` | Cargo al que aspira el trabajador (texto libre, no FK a `cargos`) | Independiente de Gestión de Cargos; no se actualiza |
| JWT `cargo_nombre` | Copia en el token hasta el próximo login/`/usuarios/me` | La UI se actualiza con el poll de `/usuarios/me` |

## Nombres usados en lógica (no son snapshot, pero importan)

Algunas reglas comparan el nombre del cargo (`desarrollador`, `administrador`, `contador`,
`director de obra`, `subcontratista`, …). Si se renombra uno de esos cargos canónicos,
esas reglas dejarán de reconocerlos hasta ajustar código o restaurar el nombre.
Esto se reporta para decisión de negocio; este cambio no bloquea el rename.
