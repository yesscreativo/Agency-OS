# Colors

## Objetivo
Definir la paleta oficial de Agency OS (design system v1, jul 2026): verde neón como color de acción, morado como marca secundaria y neutros de bajo croma para superficies y texto.

## Colores de marca

| Color | Hex | Uso |
|---|---|---|
| Verde · Acción | `#b8ff3c` | Acción primaria, estados positivos, foco |
| Morado · Marca | `#6d28d9` | Marca secundaria, acentos, foco alternativo |
| Negro · Lienzo | `#0a0a0b` | Fondo del tema oscuro |

## Tokens semánticos

Cambian con el tema. Implementados como CSS variables en `apps/web/app/globals.css` y expuestos en Tailwind vía `packages/config/tailwind-preset.js`.

| Token | Oscuro (por defecto) | Claro |
|---|---|---|
| `--bg` | `#0a0a0b` | `#f2f2f3` |
| `--surface` | `#161618` | `#ffffff` |
| `--surface-2` | `#1e1e22` | `#f5f5f6` |
| `--elev` | `#26262b` | `#ffffff` |
| `--border` | `rgba(255,255,255,.09)` | `rgba(0,0,0,.08)` |
| `--border-strong` | `rgba(255,255,255,.17)` | `rgba(0,0,0,.16)` |
| `--text` | `#f6f6f7` | `#161618` |
| `--muted` | `#a1a1aa` | `#71717a` |
| `--faint` | `#6b6b73` | `#a1a1aa` |
| `--green` | `#b8ff3c` | `#8fdb1a` |
| `--green-soft` | `rgba(184,255,60,.14)` | `rgba(143,219,26,.16)` |
| `--green-ink` | `#0d0f08` | `#0d0f08` |
| `--purple` | `#8b5cf6` | `#6d28d9` |
| `--purple-strong` | `#6d28d9` | `#6d28d9` |
| `--purple-soft` | `rgba(124,58,237,.20)` | `rgba(109,40,217,.10)` |
| `--danger` | `#ff5c6c` | `#e0384a` |
| `--shadow` | `0 8px 30px rgba(0,0,0,.45)` | `0 10px 30px rgba(0,0,0,.10)` |

## Reglas
- Un solo botón primario (verde) por vista.
- El verde claro (`#8fdb1a`) sustituye al neón en tema claro para mantener contraste sobre blanco.
- Texto sobre verde siempre en `--green-ink` (`#0d0f08`).
- Accesibilidad: verificar contraste AA en combinaciones nuevas antes de añadirlas.

## Nota de sincronización
El espejo `Docs/90-Presentations/Agency-OS-Presentacion.html` usa todavía una paleta anterior — **divergencia pendiente de reconciliar**. Fuente de referencia del design system: proyecto Claude Design "Agency OS Design System" (`.dc.html`).
