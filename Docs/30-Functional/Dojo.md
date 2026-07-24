# Dojo (Samurái Office)

> Capa de **engagement y presencia gamificada**: cada persona de la agencia tiene un avatar samurái que refleja en tiempo real si está en línea, en qué está trabajando y su estado de ánimo. Inspirado en "Pixel Agent", pero con identidad propia (dojo/oficina samurái).

## Objetivo
Aumentar la conexión del equipo con la herramienta y entre sí, haciendo visible el trabajo del día de forma **divertida y no invasiva**. Convertir acciones reales de la operación (completar Work Items, cotizaciones, cerrar tickets) en progresión de juego, para incentivar el uso diario de Agency OS.

> **Principio rector:** es una capa de *cultura y juego*, **no de vigilancia**. Todo lo que exponga presencia/actividad debe ser **opt-in** y con controles de privacidad claros. Si se percibe como monitoreo, fracasa. Ver `## Reglas`.

## Funcionalidades

### 1. Constructor de avatar (MVP)
- Cada usuario arma su samurái con un set de piezas: **casco, armadura, arma, color/estandarte, accesorios**.
- El color del estandarte puede heredar del **rol/área** (KAM, PM, Diseño…) para leer de un vistazo a quién ve.
- Configuración guardada por usuario. Piezas base gratis; piezas premium se desbloquean con puntos (ver progresión).

### 2. Presencia en tiempo real (MVP)
- Al hacer login, el avatar aparece **en línea**.
- Estados: `en línea`, `ausente/AFK`, `enfocado (no molestar)`, `offline`.
- Sesión corta: el login **expira a las 24 h** para que la gente vuelva a entrar y revise la herramienta a diario (login Google = re-entrar es 1 clic).

### 3. Estado "trabajando en tarea" (MVP)
- Si el usuario tiene un **Work Item en progreso**, su samurái se muestra **sentado en el escritorio** con un **label de la tarea** encima.
- Se alimenta del estado real de `work_items` (status = in_progress) + Time Tracking si está activo.
- Al terminar la tarea: animación de "envainar katana" / efecto de logro.

### 4. Estado de ánimo (MVP)
- El usuario elige su mood (ej: 🔥 a full, 😌 tranquilo, 😵 saturado, 🎯 enfocado).
- Se muestra como burbuja/emote sobre el avatar.
- Agregado (anónimo/opcional) puede alimentar un **pulso de bienestar del equipo** para RRHH.

### 5. Interacción entre avatars (V2)
- Emotes rápidos: saludar, chocar los cinco, aplaudir, "gracias".
- Reacciones a hitos de otros (alguien cerró una cotización → todos pueden aplaudir).
- (Avanzado) proximidad: acercarse a un compañero abre chat/emote.

### 6. La oficina/dojo navegable (V2)
- Escena tipo pixel-art (top-down) donde los avatares se mueven por salas (zona de escritorios, cocina, sala de reuniones).
- Cada zona = un contexto (escritorio = trabajando, sala = reunión, etc.).
- *Esta es la parte más cara de construir (ver `## Complejidad`).*

### 7. Mini-juego de combate + ranking (V3)
- Retar a un compañero a un **combate** (por turnos, no tiempo real → mucho más viable).
- **Ranking / leaderboard** por honor (puntos de combate).
- Puntos ganados en combate + en trabajo real desbloquean **armas, armaduras, cosméticos**.
- Eventos: torneos por temporada, clanes/squads por área con leaderboard de equipo.

## Progresión (economía de juego)
- **XP (experiencia):** por acciones reales — completar Work Items a tiempo, enviar cotización, cerrar ticket, registrar horas. Sube de nivel al samurái.
- **Honor (moneda):** se gasta en cosméticos y armas. Se gana por XP, rachas de login diario, y combates.
- **Rachas (streaks):** entrar y avanzar tareas días seguidos da bonus (refuerza el objetivo de sesión de 24 h).
- **Logros/insignias:** "Primera cotización", "100 Work Items", "Racha de 30 días", etc.

## Reglas
- **Privacidad primero:** mostrar presencia/actividad es **opt-in**. El usuario puede ocultar su estado o su label de tarea en cualquier momento.
- **No es una herramienta de control:** los datos del Dojo **no** se usan para evaluación de desempeño ni sanciones. Nada de "quién estuvo offline". Métricas de juego ≠ métricas de RRHH.
- El estado "trabajando" se deriva del estado real de `work_items`; no se inventa actividad.
- Piezas y combate son **cosméticos/lúdicos**: no otorgan ventajas operativas ni permisos.
- El pulso de bienestar (mood agregado) es **anónimo** y opcional.
- La sesión de 24 h aplica a la plataforma en general (config de Auth), no solo al Dojo.

## Flujo (MVP)
1. Usuario hace login (Google) → avatar aparece en línea en el Dojo.
2. Toma un Work Item → pasa a `in_progress` → su samurái se sienta con el label de la tarea.
3. Ajusta su mood si quiere.
4. Termina la tarea → animación de logro + XP.
5. A las 24 h la sesión expira → vuelve a entrar al día siguiente (racha).

## Configuración
- **Presencia:** Supabase **Realtime Presence** (ya en el stack) para online/offline y estados.
- **Sesión 24 h:** configuración de expiración de JWT / refresh token en Supabase Auth.
- **Estado de tarea:** se escucha el canal Realtime de `work_items` + eventos de dominio.
- **Render MVP:** tablero de avatares (grid/lineup), **sin** motor de juego.
- **Render V2 (oficina navegable):** motor de canvas cliente (PixiJS o Phaser).
- **Assets pixel-art:** el mayor costo NO es código sino **arte** (sets de samurái, piezas, animaciones). Opciones: pack de assets con licencia (itch.io / LPC) o ilustrador. Definir antes de V2.

## Complejidad (estimación por capas)

| Capa | Esfuerzo | Nota |
|---|---|---|
| Constructor de avatar | 🟡 Medio | El costo real es el arte, no el código |
| Presencia online/offline | 🟢 Bajo | Realtime Presence lo resuelve nativo |
| Sesión 24 h | 🟢 Bajo | Config de Auth |
| Estado "trabajando + label" | 🟡 Medio | Enganchar a `work_items` + Realtime |
| Estado de ánimo | 🟢 Bajo | Campo + emote |
| Interacción (emotes) | 🟡 Medio | Broadcast por Realtime |
| **Oficina navegable (room)** | 🔴 Alto | Motor de juego, sync de posición multijugador ≈ mini-MMO |
| **Combate + ranking + economía** | 🔴 Alto | Diseño de juego, balanceo, anti-abuso |

## Fases sugeridas
- **Fase 1 — "Sala de presencia" (MVP barato, 80% del valor):** tablero de avatares con estado (online/AFK/enfocado), label de tarea en progreso, y mood. Sin sala navegable. Alto impacto, bajo costo.
- **Fase 2 — Dojo navegable + interacción (V2):** oficina pixel-art con movimiento, emotes, zonas. Requiere definir assets y motor.
- **Fase 3 — Combate, ranking y economía (V3):** combate por turnos, leaderboard, desbloqueables, clanes/torneos.

## Ideas adicionales
- **Modo enfoque (Pomodoro):** el samurái medita; marca "no molestar" y da XP por sesión completada.
- **AFK:** el samurái duerme/descansa cuando la persona está inactiva.
- **Boss/raid colectivo:** meta del equipo (ej: cerrar N cotizaciones del mes) = jefe que el squad derrota juntos.
- **Notificaciones temáticas:** avisos como pergaminos/mensajeros.
- **Temporadas y eventos:** dojo con sakura en primavera, decoración por fechas.
- **Clanes/squads por área** con leaderboard de equipo (sano, no punitivo).
- **Mascota/espíritu animal** desbloqueable que acompaña al avatar.
- **Skins de escritorio** según logros.
- **Sonido/feedback:** efecto de katana al completar una tarea.

## KPIs
- Logins diarios / DAU y WAU.
- % de usuarios con avatar personalizado.
- Rachas activas (usuarios con streak ≥ 7 días).
- Correlación entre actividad en Dojo y Work Items completados a tiempo.
- Adopción de moods / participación en interacciones.
- (V3) Combates jugados, participación en torneos.

## Dependencias
- **Core** (usuarios/roles) — para identidad y color por rol.
- **Work Items** — fuente del estado "trabajando".
- **Time Tracking** — refuerza el estado de tarea activa.
- **Notificaciones / Realtime** — presencia e interacción.
- **RRHH** — solo para el pulso de bienestar agregado (opcional, anónimo).
