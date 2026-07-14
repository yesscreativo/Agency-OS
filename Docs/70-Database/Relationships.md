# Relaciones

Organization -> Clients
Client -> Contracts
Contract -> Services
Service -> Work Items
Work Item -> Time Entries
User -> Time Entries
Work Item -> Comments

## Implementado (CRM/Cotizaciones, 2026-07-14)

**Nota de reconciliación:** el cotizador viejo tenía una tabla `organizations` que en realidad
describía la empresa del cliente (nit, responsable) — distinta del `Organization` de esta spec
(el tenant de la agencia). Se resolvió fusionando esos campos en `clients` y reservando
`organizations` exclusivamente para el tenant.

```
Organization (tenant) -> People -> Users -> User_Roles -> Roles -> Permissions
Organization (tenant) -> Clients -> Quotes -> Quote_Items
                                            -> Quote_Recipients (magic link cliente)
                                            -> Quote_Versions
                                            -> Supplier_Orders (magic link proveedor)
Users (created_by/assigned_to) -> Quotes
```
