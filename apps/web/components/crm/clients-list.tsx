"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { extractClientCode } from "@agency-os/domain";
import { Button, FieldError, Input, Label, Modal, Table, Td, Th } from "@agency-os/ui";
import { saveClient } from "@/lib/client-actions";

export interface ClientRow {
  id: string;
  code: string | null;
  name: string;
  company: string | null;
  responsible: string | null;
  email: string | null;
  phone: string | null;
  quoteCount: number;
}

export function ClientsList({
  rows,
  total,
  page,
  pageSize,
  q,
}: {
  rows: ClientRow[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [modalOpen, setModalOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (search.trim()) sp.set("q", search.trim());
    const qs = sp.toString();
    router.push(qs ? `/crm/clientes?${qs}` : "/crm/clientes");
  };

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (p > 1) sp.set("pagina", String(p));
    const qs = sp.toString();
    return qs ? `/crm/clientes?${qs}` : "/crm/clientes";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-muted">Administra los clientes de la agencia</p>
        </div>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          + Nuevo cliente
        </Button>
      </div>

      <form onSubmit={submitSearch} className="mt-6 flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, empresa o email…"
          aria-label="Buscar clientes"
          className="max-w-sm"
        />
        <Button variant="secondary" type="submit">
          Buscar
        </Button>
        {q && (
          <a
            href="/crm/clientes"
            className="self-center text-sm font-semibold text-green hover:underline"
          >
            Limpiar
          </a>
        )}
      </form>

      <div className="mt-5">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-glass px-8 py-16 text-center backdrop-blur-xl">
            <div className="text-lg font-semibold">
              {q ? "Sin resultados" : "Todavía no hay clientes"}
            </div>
            <p className="max-w-[44ch] text-sm text-muted">
              {q
                ? "Ningún cliente coincide con la búsqueda."
                : "Crea el primer cliente para empezar."}
            </p>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Nombre / Empresa</Th>
                <Th>Responsable</Th>
                <Th>Email</Th>
                <Th>Teléfono</Th>
                <Th className="text-right">Cotizaciones</Th>
                <Th className="text-right"> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="transition hover:bg-surface-2">
                  <Td>
                    <a
                      href={`/crm/clientes/${c.id}`}
                      className="whitespace-nowrap font-mono text-[13px] font-bold text-ink hover:text-green"
                    >
                      {c.code ?? "—"}
                    </a>
                  </Td>
                  <Td>
                    <div className="max-w-[28ch] truncate text-sm font-semibold">{c.name}</div>
                    {c.company && (
                      <div className="max-w-[28ch] truncate text-xs text-muted">{c.company}</div>
                    )}
                  </Td>
                  <Td className="text-muted">{c.responsible ?? "—"}</Td>
                  <Td className="text-muted">{c.email ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-muted">{c.phone ?? "—"}</Td>
                  <Td className="text-right font-mono text-sm">{c.quoteCount}</Td>
                  <Td className="text-right">
                    <a
                      href={`/crm/clientes/${c.id}`}
                      className="inline-block rounded-pill border border-line-strong px-4 py-1.5 text-xs font-semibold text-ink transition hover:border-green"
                    >
                      Editar
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between gap-3 text-sm text-muted">
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={pageHref(page - 1)}
                className="rounded-pill border border-line-strong px-4 py-2 font-medium text-ink transition hover:border-green"
              >
                ← Anterior
              </a>
            )}
            {page < totalPages && (
              <a
                href={pageHref(page + 1)}
                className="rounded-pill border border-line-strong px-4 py-2 font-medium text-ink transition hover:border-green"
              >
                Siguiente →
              </a>
            )}
          </div>
          <div>
            Página {page} de {totalPages} ({total} total)
          </div>
        </div>
      )}

      <NewClientModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

/** Alta rápida de cliente: nombre + código autosugerido + empresa + email. Al crear
 * navega a la ficha para completar el resto. */
function NewClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onNameChange = (value: string) => {
    setName(value);
    // Autosugerir el código desde empresa/nombre mientras no se haya editado a mano.
    if (!codeTouched) setCode(extractClientCode(company || value));
  };

  const onCreate = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveClient({
        name,
        code,
        company,
        email,
        nit: "",
        responsible: "",
        phone: "",
      });
      if (res.error) setError(res.error);
      else router.push(`/crm/clientes/${res.id}`);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo cliente"
      description="Completa lo básico; el resto se edita en la ficha."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={onCreate} disabled={isPending || !name.trim()}>
            Crear
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="nc-name">Nombre *</Label>
          <Input id="nc-name" value={name} onChange={(e) => onNameChange(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="nc-code">Código *</Label>
          <Input
            id="nc-code"
            value={code}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(e.target.value.toUpperCase());
            }}
          />
        </div>
        <div>
          <Label htmlFor="nc-company">Empresa</Label>
          <Input id="nc-company" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="nc-email">Email</Label>
          <Input
            id="nc-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <FieldError>{error}</FieldError>}
      </div>
    </Modal>
  );
}
