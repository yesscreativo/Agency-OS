"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { portalSetPassword } from "@/lib/portal-actions";
import type { AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Guardando..." : "Guardar contraseña"}
    </Button>
  );
}

export default function PortalActivarPage() {
  const [state, formAction] = useFormState(portalSetPassword, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#f6f6f7]">Activa tu cuenta</h1>
        <p className="mt-1 text-[13.5px] text-[#a1a1aa]">Define tu contraseña para entrar al portal.</p>
      </div>

      <div>
        <Label htmlFor="password" className="text-[#f6f6f7]">
          Contraseña
        </Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>

      <FieldError>{state.error}</FieldError>

      <SubmitButton />
    </form>
  );
}
