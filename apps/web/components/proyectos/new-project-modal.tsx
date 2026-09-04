"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, FieldError, Input, Label, Modal, Select } from "@agency-os/ui";
import { createProjectAction } from "@/lib/project-actions";
import { projectHref } from "@/lib/project-paths";

export interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

/** Alta de proyecto: cliente (obligatorio) + título. El cliente se puede
 * PRESELECCIONAR (`defaultClient`, p. ej. dentro del space de un cliente) pero
 * SIEMPRE queda editable para poder crear un proyecto a cualquier cliente. */
export function NewProjectModal({
  open,
  onClose,
  clients,
  defaultClient,
}: {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  defaultClient?: ClientOption;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(defaultClient?.id ?? "");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = Boolean(clientId) && Boolean(title.trim());

  const close = () => {
    onClose();
    setClientId(defaultClient?.id ?? "");
    setTitle("");
    setError(null);
  };

  const onCreate = () => {
    if (!canSubmit) return;
    setError(null);
    const clientName = clients.find((c) => c.id === clientId)?.name ?? "";
    startTransition(async () => {
      const res = await createProjectAction({ clientId, title });
      if (res.error) setError(res.error);
      else if (res.id)
        router.push(projectHref({ id: clientId, name: clientName }, { id: res.id, title: title.trim() }));
    });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nuevo proyecto"
      description="Selecciona el cliente y el nombre del proyecto."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={close} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={onCreate} disabled={isPending || !canSubmit}>
            Crear
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="np-client">Cliente *</Label>
          <Select id="np-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Selecciona…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` · ${c.company}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="np-title">Nombre del proyecto *</Label>
          <Input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {error && <FieldError>{error}</FieldError>}
      </div>
    </Modal>
  );
}
