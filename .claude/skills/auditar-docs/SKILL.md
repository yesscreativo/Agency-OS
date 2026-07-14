---
name: auditar-docs
description: Auditar la consistencia de la documentación de Agency OS entre fuentes de verdad y sus espejos (módulos, roles, modelo de datos, eventos, alcance MVP, paleta, mensaje comercial). Usar cuando el usuario pida revisar, auditar o sincronizar los docs.
---

# Auditoría de consistencia de Docs/

Ejecutar estas verificaciones y reportar divergencias con rutas concretas. No editar nada sin que el usuario lo pida (salvo que invoque la skill pidiendo "arreglar").

1. **Módulos:** comparar la lista de módulos de `10-Product/Modules.md` (canónica) contra `00-Blueprint/00-product-blueprint.md`, `10-Product/MVP.md`, `Plan.md`, `Roadmap.md`, `50-Design/Navigation.md` y `90-Presentations/Pitch.md`.
2. **Roles:** comparar `10-Product/Roles-Permissions.md` contra `30-Functional/Dashboards.md`, `35-Reports/Dashboards.md` y `55-Research/User-Personas.md`. (Divergencia conocida: "Colaborador" falta en `35-Reports/Dashboards.md`.)
3. **Modelo de datos:** `70-Database/Tables.md` vs `70-Database/ERD.md` vs `40-Technical/Database.md` — mismas entidades, `snake_case` según `70-Database/Naming-Conventions.md`.
4. **API ↔ BD:** cada recurso de `80-API/Endpoints.md` y bucket de `80-API/Storage.md` debe mapear a una tabla de `70-Database/Tables.md` o explicitar que es una vista de `work_items` (caso `tickets`/`projects`).
5. **Eventos:** `40-Technical/Events.md` vs `80-API/Webhooks.md` — misma nomenclatura (`workitem.*` vs `task.*` es la divergencia conocida).
6. **Alcance MVP:** `10-Product/MVP.md` vs `Roadmap.md` vs `Plan.md` vs `75-AI/Roadmap-AI.md` — cada feature debe estar en la misma fase en todos.
7. **Paleta:** valores CSS del `<style>` de `90-Presentations/Agency-OS-Presentacion.html` vs `95-Assets/Colors.md`.
8. **Índice:** carpetas y archivos reales de `Docs/` vs la sección de estructura de `99-Project/README.md`.
9. **Glosario:** términos usados en los docs (Audit Engine, Approval Engine, etc.) deben existir en `00-Blueprint/Glossary.md`, y viceversa (sin entradas huérfanas).

Formato del reporte: agrupar por verificación, cada divergencia con `ruta:qué-dice` en ambos lados, y cerrar con una lista priorizada de arreglos propuestos.
