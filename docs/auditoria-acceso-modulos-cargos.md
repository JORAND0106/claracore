# Informe — Control de acceso por módulo vs Gestión de Cargos

Fecha: 2026-10-05  
Rama: `cursor/seguridad-acceso-modulos-cargos-0e31`

## Hallazgos (antes de la corrección)

### 1. ROL `Administrativo` inyectaba acceso total a módulos (crítico)
En login y `/usuarios/me`, el rol Administrativo recibía la misma bolsa sintética de permisos que Desarrollador (`_permisos_desarrollador_acceso_total`). Efecto: menú y UI mostraban **todos** los módulos aunque la matriz del cargo no los tuviera.

**Afectados:** cualquier usuario con `roles.nombre = Administrativo`, con independencia del cargo.

### 2. ROL `Administrativo` otorgaba CRUD completo de RRHH
Backend (`tiene_permiso_rrhh`) y frontend (`permisoRrhh`) devolvían `true` para todas las acciones. El alcance original del rol es solo **ver valores económicos** en RRHH.

### 3. Cargo `Administrador` bypasseaba la matriz en varios módulos
- Panel Admin: todas las pestañas + `PERMISOS_ADMIN_TODOS`
- Informes CCD: acceso completo sin fila en matriz
- Almacén: `validar` automático
- Entrada a la app con matriz vacía (no se bloqueaba como al resto)

### 4. Desarrollador (por diseño)
Sigue siendo el único superusuario de plataforma. No se tocó ese bypass.

## Correcciones aplicadas

| Área | Cambio |
|---|---|
| `backend/main.py` login + `/usuarios/me` | Solo Desarrollador inyecta permisos totales. Administrativo ya no. |
| `backend/rrhh_permissions.py` + FE `rrhhPermisos.js` | Administrativo/Administrador: salarios solo si el cargo tiene RRHH·ver. CRUD RRHH solo por matriz. |
| `App.jsx` | Panel admin e Informes CCD solo por matriz (o Dev). Lockout con matriz vacía ya no exceptúa Administrador. |
| `AdminPanel.jsx` | Tabs y permisos de sección por matriz. Texto de ayuda del rol Administrativo actualizado. Contratos globales si matriz «contratos» o Dev. |
| `informes.py` | Quitado bypass cargo Administrador. |
| `almacen_permissions` + FE | Quitado bypass Administrador en `validar` (se mantiene Director de obra). |
| Tests RRHH | Actualizados al nuevo contrato de seguridad. |

## Pendientes / decisión de negocio

1. **Seguimiento** sigue abierto a usuarios autenticados (salvo Contador en FE). No se cambió para no cerrar el módulo a cargos sin fila «Seguimiento» configurada. ¿Debe respetar la matriz?
2. **SICOE** conserva elevaciones de validación ligadas al cargo Administrador **solo si** ya tiene `validar` en «Reporte de Cantidades».
3. **Director de obra** sigue pudiendo `validar` en Almacén por nombre de cargo (regla operativa). ¿Pasarlo también a matriz?
4. **Endpoints `/admin/cargos` y `/admin/permisos`**: varios solo exigen `get_current_user`. La UI ya oculta; falta endurecer API (recomendado en seguimiento).
5. **Verificación en producción de usuarios**: este entorno no tiene credenciales Supabase. Tras el deploy, conviene listar usuarios con rol Administrativo y cargos Administrador y confirmar menú + 403 en APIs de módulos no habilitados.

## Pruebas ejecutadas

- `node --test frontend/src/modules/rrhh/rrhhPermisos.test.js` → OK
- Asserciones backend RRHH (Administrativo sin/con matriz) → OK

## Pruebas reales recomendadas (post-deploy)

1. Usuario rol Administrativo + cargo sin RRHH → no ve módulos extra; no entra a RRHH.
2. Mismo rol + cargo con solo RRHH·ver → entra a RRHH, ve salarios, no crea/edita si la matriz no lo da; no ve Presupuesto/SICOE/etc.
3. Cargo Administrador sin filas Informes/Admin en matriz → no abre esos módulos; API Informes 403.
4. Desarrollador → acceso total intacto.
5. Intento de API directa (`/usuarios/me` sin inyección; rutas de módulo no habilitado → 403).
