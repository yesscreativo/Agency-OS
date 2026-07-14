---
name: actualizar-indice
description: Regenerar la sección de estructura de Docs/99-Project/README.md para que refleje las carpetas y archivos reales de Docs/. Usar cuando el índice esté desactualizado o tras crear/mover documentos.
---

# Actualizar índice del proyecto

1. Listar las carpetas reales de `Docs/` (`ls Docs/`) y sus archivos `.md`.
2. Reescribir la sección de estructura de `Docs/99-Project/README.md` con **todas** las carpetas en orden numérico, una línea por carpeta con una descripción breve de su propósito, y debajo la lista de documentos como enlaces relativos.
3. No tocar el resto del README (estado del proyecto, fases).
4. Ignorar `.DS_Store` y archivos no documentales.
