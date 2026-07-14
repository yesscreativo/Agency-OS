"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@agency-os/ui";
import { requestPasswordReset, type AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Enviando..." : "Enviar enlace de recuperación"}
    </Button>
  );
}

export default function ResetPasswordPage() {
  const [state, formAction] = useFormState(requestPasswordReset, initialState);

  if (state.success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="max-w-sm text-center text-sm text-slate-600">
          Si el email existe, te enviamos un enlace para restablecer tu contraseña.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Recuperar contraseña</h1>
          <p className="text-sm text-slate-500">Te enviamos un enlace a tu email.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <SubmitButton />

        <a href="/login" className="block text-center text-sm text-slate-500 hover:underline">
          Volver a login
        </a>
      </form>
    </main>
  );
}
