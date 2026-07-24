# CRM

## Objetivo
Administrar el ciclo comercial.

## Alcance V1
- Migración tecnológica.
- Sin cambios funcionales.
- Integración con Agency OS.

## Flujo
Lead → Prospecto → Cotización → Cliente → Contrato

## Integraciones
- Clientes
- Contratos
- Dashboard Comercial

## Matriz de permisos (roles del módulo CRM)
Definida en la migración `013_crm_role_matrix.sql`. El margen solo lo ve quien ve **ambos** precios (costo + cliente) → solo el admin. `administrador` (super) omite todas las restricciones.

| Capacidad | crm_admin | crm_creator | crm_viewer |
|---|---|---|---|
| Ver listado de cotizaciones | ✅ | ✅ | ✅ |
| Crear / editar cotización | ✅ | ✅ | ❌ (solo lectura) |
| Ver **precio costo** | ✅ | ✅ | ❌ |
| Ver **precio cliente** | ✅ | ❌ | ✅ |
| Ver **margen** | ✅ | ❌ | ❌ |
| Enviar al cliente + destinatarios | ✅ | ❌ | ❌ |
| Cambiar estado, docs comerciales, brief, órdenes a proveedor, eliminar | ✅ | ❌ | ❌ |
| Kanban / Dashboard / Clientes / KAMs-PMs / Estados | ✅ | ❌ | ❌ |
| Exportar PDF cliente | ✅ | ✅ (precio = **costo**) | ✅ (precio = **cliente**) |
| Exportar PDF interno (costos + margen) | ✅ | ❌ | ❌ |

Permisos: `quote.see_costs` (precio costo), `quote.see_client_price` (precio cliente), `quote.send`, `quote.approve` (estado/docs/brief/proveedor/eliminar), `quote.pipeline`, `quote.dashboard`, `client.manage`, `kam.manage`, `quote_status.manage`. El enmascarado de precios se hace **en el servidor**: el precio que un rol no puede ver no viaja al navegador.
