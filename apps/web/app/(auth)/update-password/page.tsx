"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { updatePassword, type AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Guardando..." : "Guardar nueva contraseña"}
    </Button>
  );
}

export default function UpdatePasswordPage() {
  const [state, formAction] = useFormState(updatePassword, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#f6f6f7]">Nueva contraseña</h1>
      </div>

      <div>
        <Label htmlFor="password" className="text-[#f6f6f7]">
          Contraseña nueva
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <FieldError>{state.error}</FieldError>

      <SubmitButton />
    </form>
  );
}
