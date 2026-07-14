"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@agency-os/ui";
import { updatePassword, type AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Guardando..." : "Guardar nueva contraseña"}
    </Button>
  );
}

export default function UpdatePasswordPage() {
  const [state, formAction] = useFormState(updatePassword, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Nueva contraseña</h1>
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña nueva
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <SubmitButton />
      </form>
    </main>
  );
}
