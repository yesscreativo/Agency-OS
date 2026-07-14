---
name: nuevo-doc
description: Crear un documento nuevo en Docs/ con la plantilla estándar de Agency OS y registrarlo en el índice del proyecto. Usar cuando el usuario pida crear un doc, spec, módulo o reporte nuevo.
---

# Crear documento nuevo

Argumentos esperados: tema del documento y, opcionalmente, carpeta destino.

1. **Elegir carpeta destino** por dominio (si el usuario no la indicó): funcional → `Docs/30-Functional/`, negocio → `20-Business/`, técnica → `40-Technical/` o `45-Architecture/`, datos → `70-Database/`, IA → `75-AI/`, API → `80-API/`, reportes → `35-Reports/`. Confirmar solo si es ambiguo.
2. **Nombre de archivo:** `Title-Case-Con-Guiones.md`, en el idioma dominante de la carpeta destino (mirar los archivos hermanos).
3. **Plantilla** (cuerpo en español):

   ```markdown
   # <Título>

   ## Objetivo
   <una o dos frases>

   ## Funcionalidades
   - ...

   ## Reglas
   - ...
   ```

   Secciones opcionales según el tipo: `## Flujo`, `## Configuración`, `## KPIs`.
4. **Etiquetar alcance:** marcar cada funcionalidad con `(MVP)`, `(V2)` o `(V3)` si se conoce.
5. **Consistencia:** si el documento menciona módulos, roles, tablas o eventos, usar los nombres de las fuentes canónicas listadas en `CLAUDE.md` (tabla "Fuentes de verdad"). No inventar variantes.
6. **Registrar en el índice:** añadir el documento a la sección de estructura de `Docs/99-Project/README.md` (crear la entrada de la carpeta si falta).
