# Agency OS — Base de conocimiento

Proyecto de **especificación de producto** (todavía sin código): "Agency OS", plataforma para operar agencias y empresas de servicios. Todo vive en `Docs/`, 19 carpetas con prefijo numérico tipo Johnny-Decimal (00-Blueprint … 99-Project). Son ~114 archivos Markdown, en su mayoría esqueletos breves.

## Estado del proyecto
- Discovery y definición del Core cerrados (v1.0). Fase actual declarada: **UX + Desarrollo** (`Docs/99-Project/README.md`, `Milestones.md`, `Backlog.md`).
- Único entregable terminado: `Docs/90-Presentations/Agency-OS-Presentacion.html`.
- Stack decidido: Next.js + TypeScript + Tailwind, Supabase (Postgres/Auth/RLS/Edge Functions), OpenAI, n8n.

## Convenciones
- **Cuerpo de los documentos en español.** Los términos técnicos consolidados se mantienen en inglés (Work Item, SLA, Magic Link…).
- **Nombres de archivo nuevos:** `Title-Case-Con-Guiones.md` (como `Decision-Log.md`). No renombrar archivos existentes sin que el usuario lo pida.
- **Plantilla de documento funcional:** `# Título` + `## Objetivo`, `## Funcionalidades`, `## Reglas` (opcionales: `## Flujo`, `## Configuración`, `## KPIs`). Usa la skill `/nuevo-doc`.
- **Base de datos:** tablas y columnas en `snake_case` (`Docs/70-Database/Naming-Conventions.md`).
- **Etiquetas de alcance:** marcar features con `(MVP)`, `(V2)`, `(V3)` de forma explícita.

## Fuentes de verdad y espejos (mantener sincronizados)
Estas listas están duplicadas en varios archivos y ya han divergido. Al editar una, actualiza sus espejos o avisa de la divergencia:

| Dato | Canónico | Espejos |
|---|---|---|
| Lista de módulos | `10-Product/Modules.md` | `00-Blueprint/00-product-blueprint.md`, `10-Product/MVP.md`, `Plan.md`, `Roadmap.md`, `50-Design/Navigation.md`, `90-Presentations/*` |
| Roles/personas | `10-Product/Roles-Permissions.md` | `30-Functional/Dashboards.md`, `35-Reports/Dashboards.md`, `55-Research/User-Personas.md` |
| Modelo de datos | `70-Database/Tables.md` | `70-Database/ERD.md`, `40-Technical/Database.md` |
| Eventos de dominio | `40-Technical/Events.md` | `80-API/Webhooks.md` |
| Paleta y marca | `95-Assets/Colors.md` | `<style>` de `90-Presentations/Agency-OS-Presentacion.html` |
| Mensaje comercial | `90-Presentations/Pitch.md` | `OnePager.md`, `ExecutiveSummary.md`, `Agency-OS-Presentacion.html` |

## Incoherencias conocidas — NO propagar, reconciliar antes de implementar
1. **"Core"** tiene tres definiciones distintas: `00-Blueprint/00-product-blueprint.md` vs `30-Functional/Core.md` vs `10-Product/Modules.md`.
2. **Alcance del MVP** contradictorio entre `10-Product/MVP.md`, `Roadmap.md` y `Plan.md` (Work Items, IA, Portal Cliente cambian de fase según el archivo).
3. **`tickets` y `projects`** existen en API/Storage/Eventos pero no como tablas — se modelan como `work_items` (enum `WorkItemType`); explicitarlo siempre.
4. **Nombres de eventos** incoherentes: `task.*` (`40-Technical/Events.md`) vs `workitem.*` (`80-API/Webhooks.md`). No existe entidad "task" en el modelo.
5. **Agentes de IA:** `75-AI/Agents.md` los describe como presentes, pero `75-AI/Roadmap-AI.md` los sitúa en V2.
6. **`60-Development/Architecture-Decisions.md`** no contiene ADRs, es un duplicado del stack de `40-Technical/Architecture.md`.
7. **`99-Project/README.md`** lista solo 7 de las 19 carpetas — índice desactualizado.

## Skills del proyecto
- `/nuevo-doc` — crea un documento con la plantilla estándar y lo registra en el índice.
- `/auditar-docs` — verifica consistencia entre fuentes de verdad y espejos.
- `/actualizar-indice` — regenera la sección de estructura de `99-Project/README.md`.
