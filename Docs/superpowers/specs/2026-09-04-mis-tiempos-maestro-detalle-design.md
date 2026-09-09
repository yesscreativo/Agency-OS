# "Mis tiempos" — layout maestro-detalle — Diseño

**Fecha:** 2026-09-04
**Estado:** nuevo spec
**Objetivo:** que "Mis tiempos" (scope `mine`) escale bien con muchos clientes y muchas entradas acumuladas por cliente, reemplazando las cards-acordeón por un layout maestro-detalle.

## Contexto

La primera versión de "Mis tiempos por cliente" (spec `2026-09-04-mis-tiempos-por-cliente-design.md`, ya implementada) usa cards por cliente que se expanden inline (acordeón). Con muchos clientes, la página se vuelve muy larga (varias cards expandidas apilan mucho contenido); con un cliente de historial largo, su acordeón expandido también se vuelve muy largo. Este spec reemplaza `ClientTimeCards` (acordeón) por un layout maestro-detalle.

## Funcionalidades

### 1. Columna izquierda: lista de clientes

- Filas compactas: nombre del cliente + tiempo total del periodo filtrado.
- Ordenadas de mayor a menor tiempo (mismo orden que ya da `groupTimeByClient`).
- Buscador por nombre arriba de la lista (filtro en memoria, sin ida al servidor — los datos del periodo ya están cargados).
- Selección: un cliente a la vez, resaltado visualmente. Al cargar la página, se auto-selecciona el primero (mayor tiempo).

### 2. Columna derecha: detalle del cliente seleccionado

- Desglose por proyecto del cliente (chips con tiempo, igual que ya existe).
- Debajo, el listado de entradas de ese cliente en el periodo, en un contenedor de **altura máxima fija con scroll interno** (clase `ds-scroll`, mismo patrón que la lista de clientes del sidebar de Proyectos) — sin paginado ni agrupación por mes.

### 3. Responsive

Apila en pantallas angostas (lista arriba, detalle abajo) — mismo patrón `flex-col sm:flex-row` que ya usa el layout de Proyectos.

## Reglas

- Sin cambios de servidor: mismos datos que ya trae `reportEntries`/`page.tsx`. Selección y búsqueda son estado local de un componente cliente nuevo — no hay parámetros de URL nuevos.
- No se toca `scope=team`, el filtro de fechas libre, ni el total general de arriba.
- Si no hay ningún cliente con tiempo en el periodo, se muestra el mismo estado vacío que ya existe.

## Componentes

- **Reemplaza** `apps/web/components/proyectos/client-time-cards.tsx` (acordeón) por un componente nuevo con el mismo rol de "vista por cliente en `mine`", con layout maestro-detalle y estado de selección/búsqueda.
- `time-report.tsx` cambia únicamente la línea que monta el componente de `mine` — el resto de su lógica (total, filtros, bifurcación por scope) no cambia.

## Fuera de alcance

- Paginado o agrupación por mes de las entradas (se eligió scroll interno simple).
- Persistir la selección o la búsqueda en la URL.
- Cualquier cambio a `scope=team`.

## Resultado esperado

"Mis tiempos" con decenas de clientes y meses de historial se navega cómodo: la lista de la izquierda no crece indefinidamente en pantalla (es una lista con su propio scroll/búsqueda) y el detalle de un cliente con muchas entradas tampoco alarga la página completa.
