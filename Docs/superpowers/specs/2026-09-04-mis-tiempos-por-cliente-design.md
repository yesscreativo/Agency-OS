# "Mis tiempos" por cliente — Diseño

**Fecha:** 2026-09-04
**Estado:** nuevo spec
**Objetivo:** reorganizar la vista "Mis tiempos" (`/proyectos/tiempos`, scope `mine`) en cards por cliente, para saber cuánto tiempo se ha invertido en cada uno, con desglose por proyecto y detalle de entradas al expandir.

## Contexto

`/proyectos/tiempos` (implementado en la sesión de time tracking Fase 3) hoy muestra, para ambos scopes (`mine`/`team`), un total + desglose por colaborador + una lista plana de entradas, con filtros de proyecto y rango de fechas libre (`from`/`to`).

El usuario quiere que "Mis tiempos" (scope `mine`) responda "¿cuánto tiempo he gastado en cada cliente?" — hoy no se puede saber sin leer la lista plana entrada por entrada. `scope=team` ("Tiempos del equipo") **no cambia** en este spec — su rediseño (cards por colaborador, acceso restringido a "Director de área") es un proyecto aparte que depende de un concepto que aún no existe (Áreas), y se brainstormea después.

## Objetivo

1. En `mine`, agrupar el tiempo por cliente y mostrarlo como cards.
2. Al expandir una card, ver el desglose por proyecto del cliente y, debajo, el detalle de entradas de ese cliente en el periodo filtrado.
3. Mantener el filtro de fechas libre (`from`/`to`) tal cual existe hoy — **no se reemplaza por un navegador de periodo** (decisión explícita del usuario, revirtiendo una propuesta anterior).

## Funcionalidades

### 1. Filtros de "Mis tiempos" (scope `mine`)

- Se **quita** el dropdown de "Proyecto" (ya no aplica: ahora se navega cliente → proyecto vía las cards). Sigue existiendo en `scope=team`, que no cambia.
- Los inputs de fecha (`from`/`to`) y el botón "Filtrar"/"Limpiar filtros" quedan exactamente igual que hoy.

### 2. Cards por cliente

- Una card por cliente con tiempo registrado en el periodo filtrado: nombre del cliente + total de tiempo.
- Ordenadas de mayor a menor tiempo.
- El total general (`Total`, arriba) se mantiene, sin el desglose por colaborador (no aporta nada en `mine`: el único colaborador es el usuario). El desglose por colaborador se mantiene sin cambios en `scope=team`.

### 3. Expandir una card

Al hacer clic (expand/collapse inline, sin navegar a otra ruta ni recargar):
- **Arriba:** desglose por proyecto de ese cliente — nombre del proyecto + tiempo, ordenado de mayor a menor.
- **Abajo:** listado de las entradas de ese cliente en el periodo (fecha, tarea, proyecto — si el cliente tiene más de uno —, duración, nota). Sin avatar/nombre de usuario (siempre es el propio usuario en `mine`).

## Reglas

- Un cliente sin ninguna entrada en el periodo filtrado no genera card (igual que hoy con el estado vacío si no hay ninguna).
- Si un proyecto no tuviera cliente (no debería ocurrir — Fase A exige cliente obligatorio al crear un proyecto), sus entradas caen en un bucket "Sin cliente" defensivo, para no perder datos silenciosamente.
- `scope=team` no se modifica en este trabajo: mantiene filtro de proyecto, lista plana y desglose por colaborador tal como están.

## Modelo de datos

Sin tablas nuevas. Se extiende el embed de `reportEntries` (`packages/db/src/repositories/work-item-time.ts`) para traer también el proyecto y su cliente:

```
project:work_items!work_item_time_entries_project_id_fkey(id, title, client:clients(id, name))
```

(FK `work_item_time_entries_project_id_fkey` ya verificada en la sesión anterior). `TimeEntryForReport` gana `projectId`, `projectTitle`, `clientId`, `clientName`.

## Lógica pura (domain, con tests)

Nueva función en `packages/domain`, siguiendo el patrón de `groupMinutesByUser`:

```ts
export interface ClientTimeProjectGroup { projectId: string; projectTitle: string; minutes: number }
export interface ClientTimeGroup { clientId: string; clientName: string; minutes: number; projects: ClientTimeProjectGroup[] }

export function groupTimeByClient<T extends {
  clientId: string; clientName: string; projectId: string; projectTitle: string; minutes: number;
}>(entries: T[]): ClientTimeGroup[]
```

Agrupa por cliente y, dentro de cada cliente, por proyecto; ambos niveles ordenados de mayor a menor minutos.

## Componentes

- `apps/web/components/proyectos/time-report.tsx`: bifurca por `scope`. `team` sigue exactamente igual (sin cambios de código más allá de los que ya existen). `mine`: sin dropdown de proyecto en el filtro; sin desglose por colaborador en el total; renderiza `<ClientTimeCards>` en vez de la lista plana.
- `apps/web/components/proyectos/client-time-cards.tsx` (nuevo, `"use client"`): recibe las entradas ya enriquecidas (con `clientId`/`clientName`/`projectId`/`projectTitle`) del periodo filtrado, usa `groupTimeByClient` para las cards, maneja el expand/collapse (estado local, sin URL) y renderiza el desglose por proyecto + entradas al expandir.

## Fuera de alcance

- Navegador de periodo (semana/mes/año con flechas) — descartado explícitamente por el usuario; se mantiene el filtro de fechas libre actual.
- Cualquier cambio a `scope=team` / "Tiempos del equipo" — es su propio proyecto (Áreas + Director de área + cards por colaborador), a brainstormear después.
- Filtro de cliente explícito (dropdown) — no hace falta: las cards ya son la forma de navegar por cliente.

## Resultado esperado

En `/proyectos/tiempos` (scope `mine`), el usuario ve de un vistazo cuánto tiempo lleva en cada cliente en el periodo filtrado, y puede expandir cualquiera para ver el desglose por proyecto y el detalle de entradas — sin tocar el filtro de fechas que ya conoce.
