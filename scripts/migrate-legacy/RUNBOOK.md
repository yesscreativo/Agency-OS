# Runbook — Migración FINAL de BBDD (cotizador legacy → agency-os)

Procedimiento para migrar **todos** los datos del cotizador desde el proyecto legacy/PROD
`oiixyyvhqqmcaioamolj` al proyecto `agency-os` `hicbkpwywwhnhiawulmu`, dejando agency-os como
**espejo exacto** del legacy. El piloto (PETUS + Sergio) ya validó el ETL end-to-end
(2026-07-29). Diseño detallado en
`Docs/superpowers/specs/2026-07-29-migracion-piloto-cotizador-design.md`.

> El script del piloto y el de la migración final son **el mismo**
> (`scripts/migrate-legacy/`). El piloto usa `--only-clients`; la final corre **sin ese flag**.
> Idempotente (preserva los UUID legacy como PK) → se puede re-correr sin duplicar.

---

## 0. Antes de empezar

- **Backup fresco del legacy.** El backup en `backups/prod-oiixyyvhqqmcaioamolj-20260710/` está
  desactualizado. Tomar uno nuevo (esquema + datos) justo antes de la migración.
- **`.env`** de `scripts/migrate-legacy/` con las 4 variables (URLs + ambas `service_role` +
  `TARGET_ORG_ID`). Gitignored.
- Elegir una ventana de baja actividad (nadie creando cotizaciones en el legacy durante el run).
- Volumen de referencia (crece): ~60 clientes · ~254 cotizaciones · ~1400 ítems · ~285
  versiones · ~120 recipients · ~6 órdenes proveedor · 37 briefs en Storage.

---

## 1. Resolver los 3 pendientes conocidos

Estos NO están implementados en el script todavía. Hay que resolverlos **antes/durante** la
final (agregarlos al script o ejecutarlos como paso manual). La autoría (`created_by`) **no** es
pendiente: se deja en null a propósito (no es KPI; verificado).

### 1a. Limpiar agency-os (data demo/seed y de prueba)

Para que producción arranque limpia. Borra SOLO la data de negocio del CRM de la org; **conserva
catálogos** (`quote_statuses`, `roles`, `permissions`, `modules`) y las cuentas
(`users`/`people`/`user_roles`). Respeta el orden inverso de FKs:

```sql
-- org Laburu = a1ae8645-a2fa-4660-9376-27af61d25f17
begin;
delete from supplier_orders  where quote_id in (select id from quotes where organization_id = :org);
delete from quote_versions   where quote_id in (select id from quotes where organization_id = :org);
delete from quote_recipients where quote_id in (select id from quotes where organization_id = :org);
delete from quote_items      where quote_id in (select id from quotes where organization_id = :org);
delete from quotes           where organization_id = :org;
delete from clients          where organization_id = :org;
delete from kams             where organization_id = :org;   -- se recrean desde el legacy
commit;
```

- **Storage**: vaciar el bucket `briefs` del destino (los briefs se re-copian en la migración).
- **Nota kams.user_id**: si en prod hay KAM ya enlazadas a usuarios reales, ese enlace se pierde
  al borrar/recrear; re-enlazar después (o exportar el mapa nombre→user_id antes de limpiar).
- Alternativa: implementar un flag `--wipe` en el script que ejecute esto antes del import.

### 1b. Códigos de cotización duplicados en el legacy

`quotes.code` es **UNIQUE global** en destino (`quotes_code_key`). El legacy tiene **2 códigos
repetidos** que, sin tratar, harían fallar el segundo `insert`:

| code | nº quotes | ids legacy |
|---|---|---|
| `JUNMER02062026-01` | 2 | 21ccaf33-97a9-45c5-b25d-f5e8b5813b07 · eb9a7222-905f-49db-b775-41bd3afe4fea |
| `MARLAB24032026-01` | 2 | 4053ec14-2d40-4101-9374-f349b054535a · 618c129c-7857-429c-bdc7-45ca94070a54 |

Detección (re-correr por si aparecen más antes de la final):

```sql
select quote_code, count(*), string_agg(id::text, ', ')
from quotes where quote_code is not null and quote_code <> ''
group by quote_code having count(*) > 1;
```

Resolución (decidir con Yesid caso por caso): conservar el código en la cotización más antigua y
al duplicado renombrarle el correlativo (p. ej. `-02`) o marcarlo. Implementar en
`transform.ts::toQuote` una desambiguación de `code` (mantener un `Set` de códigos ya usados y
sufijar el repetido) + reportarlo como anomalía.

### 1c. Backfill de `quote_code_counters`

Tabla destino: `(client_id uuid, day date, last_seq int)`. `next_quote_seq()` la incrementa por
`(client_id, day)`. Si no se rellena, las cotizaciones **nuevas** post-migración empezarían el
correlativo en 01 y colisionarían con las migradas. Backfill (post-import), parseando el código
`MES+CLI+DDMMAAAA-NN`:

```sql
-- last_seq = mayor NN por cliente y día (fecha embebida en el código)
insert into quote_code_counters (client_id, day, last_seq)
select q.client_id,
       to_date(substring(q.code from 7 for 8), 'DDMMYYYY') as day,
       max((split_part(q.code, '-', 2))::int)            as last_seq
from quotes q
where q.organization_id = :org and q.code ~ '^[A-Z]{6}\d{8}-\d+$'
group by q.client_id, to_date(substring(q.code from 7 for 8), 'DDMMYYYY')
on conflict (client_id, day) do update set last_seq = greatest(quote_code_counters.last_seq, excluded.last_seq);
```

(Verificar el índice/PK real de `quote_code_counters` antes de usar `on conflict`.)

---

## 2. Ejecución

```bash
# 1) Dry-run COMPLETO — revisar conteos vs legacy y anomalías, sin escribir
pnpm --filter migrate-legacy migrate -- --dry-run

# 2) Resolver anomalías nuevas que aparezcan (además de las de la sección 1)

# 3) Limpiar agency-os (sección 1a) + tener listo el manejo de dup-codes (1b)

# 4) Run REAL (sin filtro = todos los clientes)
pnpm --filter migrate-legacy migrate

# 5) Backfill de quote_code_counters (sección 1c)
```

---

## 3. Verificación

- **Conteos por tabla** en destino cuadran con el legacy (clients/quotes/items/recipients/
  versions/supplier_orders).
- **Multi-moneda**: cotizaciones en USD se ven correctas.
- **Briefs**: abrir un par (signed URL) desde cotizaciones migradas.
- **KAMs**: creadas y enlazadas (`quotes.kam_id`); dashboard rankea por KAM.
- **Dashboard/KPIs** cargan sin error con el volumen real.
- **Contador**: crear una cotización nueva para un cliente con histórico → el correlativo
  continúa (no repite).

---

## 4. Seguridad / rollback

- `--rollback` **sin `--only-clients`** borra TODO lo migrado (filas + objetos de Storage). Úsalo
  solo si hay que revertir por completo.
- El **backup fresco del legacy** (sección 0) es la red de seguridad final. El legacy no se toca
  (solo lectura).

---

## 5. Fuera de alcance

Tablas legacy ajenas al cotizador (no se migran): `form_submissions`, `form_dawpet`, `csat`,
`shopify_stores`, `vtex_stores`. Autoría de usuarios (`created_by`/`assigned_to`/`sent_by` =
null). Usuarios/`auth.users` (las cuentas se crean por Google/invitación).
