# Migración piloto del cotizador legacy → Agency OS — Diseño

**Fecha:** 2026-07-29 · **Rama:** `Feat/vista-publicas` · **Estado:** aprobado por Yesid (pendiente su revisión del spec escrito).

## Objetivo

Ensayar la migración de datos del cotizador legacy con un subconjunto pequeño y de
**máxima cobertura de casos**, para descubrir mapeos y datos que no anticipamos, ANTES de
la migración completa. El script del piloto **es** el de la migración final: solo cambia un
filtro de clientes.

- **Origen:** Supabase legacy/PROD `oiixyyvhqqmcaioamolj` (solo lectura).
- **Destino:** Supabase `agency-os` `hicbkpwywwhnhiawulmu`, organización `Laburu`
  (`a1ae8645-a2fa-4660-9376-27af61d25f17`).
- **Piloto:** clientes **PETUS (SILVERAGRO S.A.S)** + **Sergio (Laburu)** → ~7 cotizaciones y
  todos sus descendientes. Cubre multi-moneda (COP+USD de PETUS), órdenes a proveedor y
  grupos de ítems (Sergio), recipients, versiones y varios estados.

## Mecánica

- Script TS en `scripts/migrate-legacy/` (se corre con `tsx`).
- Dos clientes Supabase **service-role**: uno lee legacy, otro escribe agency-os.
- Config por `.env` local del script (NO se commitea): `LEGACY_SUPABASE_URL`,
  `LEGACY_SERVICE_ROLE_KEY` (la que ya se expuso, sigue válida),
  `AGENCY_SUPABASE_URL`, `AGENCY_SERVICE_ROLE_KEY`.
- Flags:
  - `--only-clients="PETUS,Sergio"` → piloto. Sin el flag → migración completa.
  - `--dry-run` → imprime el plan y las anomalías sin escribir nada.
  - `--rollback` → borra en destino por los UUID conocidos (los mismos del legacy).
- **Idempotente por diseño:** se **preservan los UUID legacy como PK** en destino → upsert por
  `id`, los FKs internos (cotización→cliente, ítem→cotización, …) se mantienen gratis, es
  re-ejecutable y trivial de identificar/limpiar.
- Escribe con service-role → bypassa RLS (correcto para un ETL).

## Orden de carga (respeta FKs)

`clients → kams → quotes → quote_items → quote_recipients → quote_versions → supplier_orders`
→ luego **copia de briefs** (Storage). Todas las filas con
`organization_id = a1ae8645-a2fa-4660-9376-27af61d25f17`.

## Mapeo por tabla

| Tabla destino | Mapeo desde legacy |
|---|---|
| `clients` | `id, name, email, phone, company, nit, responsible, created_at` preservados. `code` = autosugerido del nombre (reusa `extractClientCode` de `@agency-os/domain`), con **dedup contra los códigos ya existentes** en destino. `organization_id`=Laburu. `deleted_at`=null. |
| `kams` | Se crean desde los `kam_pm` (texto) de las cotizaciones migradas, cruzando por nombre con `kams_pms` para traer `active`→`is_active`. `user_id`=null (se enlaza a la persona real después). Si un `kam_pm` no matchea ninguna `kams_pms` → se crea igual (`is_active=true`) y se reporta. |
| `quotes` | Todo preservado: `id, client_id, currency, has_iva, iva_percentage, quote_name, event_date, message, internal_notes, quote_code→code, purchase_order, invoice_number, brief_url, rejection_reason, clickup_task_id`, timestamps (`created_at, sent_at, accepted_at, rejected_at, closed_at`). `status`: los 9 códigos legacy ya existen en el catálogo `quote_statuses` del destino (mapeo 1:1). `quote_type`: `proyecto`/`evolutivo`/null → enum destino. `kam_id`: resuelto contra las `kams` creadas por nombre. `created_by`/`assigned_to`/`sent_by`=**null** (piloto). |
| `quote_items` | Copia directa: `id, quote_id, description, quantity, client_price, cost_price, status` (enum pending/accepted/rejected/changes 1:1), `client_comment, sort_order, supplier, is_group, created_at`. |
| `quote_recipients` | `id, quote_id, name, email, client_comment, viewed_at, created_at` + **token y `expires_at` preservados** (vencidos; es histórico). |
| `quote_versions` | `id, quote_id, version_number, snapshot` (jsonb tal cual, documento congelado), `created_at`. `created_by`=null. |
| `supplier_orders` | `id, quote_id, supplier_name, supplier_email, items` (jsonb), `status` (enum), `sent_at, confirmed_at, supplier_comment, created_at`, **token preservado**. `expires_at`: si el legacy es null → `created_at + 30 días` (destino es NOT NULL). `message`=null (columna nueva). |

## Briefs (Storage)

Legacy: bucket `briefs` **público**, 37 objetos. Destino: bucket `briefs` **privado**
(el app sirve por signed URL). Por cada cotización migrada con `brief_url`:

1. Descargar el archivo del legacy.
2. Subirlo al bucket `briefs` privado del destino (misma ruta/objeto lógico).
3. **Reescribir `quotes.brief_url`** al formato de *ruta del objeto* que el app espera para
   generar signed URLs (no la URL pública legacy).

Si la descarga o subida falla para algún brief → no bloquea la cotización; se reporta.

## Casos límite (manejo defensivo + reporte)

Verificado sobre TODO el legacy: 0 cotizaciones sin cliente, 0 clientes sin email,
`quote_type` solo ∈ {proyecto, evolutivo, null}. Manejo restante:

1. `quote_type` fuera del enum destino → null + reporte (no debería pasar; solo defensivo).
2. `kam_pm` sin match en `kams_pms` → crear KAM igual + reporte.
3. `supplier_orders.expires_at` null en legacy → `created_at + 30 días`.
4. Brief que no se puede copiar → cotización migra igual, `brief_url` reportado.
5. Colisión de `code` de cliente con demo existente → dedup con sufijo + reporte.

El script imprime al final un **reporte**: filas insertadas/actualizadas por tabla + lista de
anomalías detectadas.

## Fuera de alcance (a propósito)

- **Autoría real** (`created_by`/`assigned_to` → usuarios): en el piloto va null. Hay 10
  `internal_users` reales referenciados; la estrategia de preservarlos se decide en la
  migración **final** (crear filas de persona ahora y enlazar cuando existan las cuentas
  reales, mismo criterio que las KAM).
- **`quote_code_counters`**: backfill del correlativo por cliente/día. Imprescindible para la
  migración **final** (o las cotizaciones nuevas colisionarán), irrelevante en el piloto.
- **Migrar `auth.users`/usuarios** (las cuentas se crean por Google/invitación).
- **Tablas legacy ajenas al cotizador** (confirmado con Yesid): `form_submissions`,
  `form_dawpet`, `csat`, `shopify_stores`, `vtex_stores` — pertenecen a módulos futuros, no
  a este proyecto.

## Verificación (al terminar el piloto)

1. Revisar el **reporte** del script (conteos + anomalías).
2. En la app (`/crm`, cuenta con permiso): filtrar por PETUS y Sergio; los conteos cuadran.
3. Abrir la cotización **USD de PETUS** (multi-moneda) — importes, ítems, versiones.
4. Abrir la cotización de **Sergio con orden a proveedor** — sección proveedor + grupos.
5. Verificar que un **brief** abre (signed URL) desde una cotización migrada que lo tenga.
6. Correr `--rollback` y confirmar que deja el destino limpio (prueba de idempotencia).

## Aprendizajes esperados para la migración final

- Formato exacto de traducción de `brief_url` público→ruta privada.
- Volumen/tiempo por 254 cotizaciones y 1400+ ítems.
- Estrategia de autoría (`created_by`) y de `quote_code_counters`.
- Cualquier anomalía que el reporte destape y que hoy no anticipamos.
