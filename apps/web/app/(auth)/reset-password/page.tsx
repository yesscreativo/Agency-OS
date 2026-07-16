"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { requestPasswordReset, type AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Enviando..." : "Enviar enlace de recuperación"}
    </Button>
  );
}

export default function ResetPasswordPage() {
  const [state, formAction] = useFormState(requestPasswordReset, initialState);

  if (state.success) {
    return (
      <p className="text-center text-sm leading-relaxed text-[#a1a1aa]">
        Si el email existe, te enviamos un enlace para restablecer tu contraseña.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#f6f6f7]">
          Recuperar contraseña
        </h1>
        <p className="mt-1 text-[13.5px] text-[#a1a1aa]">Te enviamos un enlace a tu email.</p>
      </div>

      <div>
        <Label htmlFor="email" className="text-[#f6f6f7]">
          Email
        </Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <FieldError>{state.error}</FieldError>

      <SubmitButton />

      <a
        href="/login"
        className="block text-center text-[12.5px] text-[#71717a] transition hover:text-[#b8ff3c]"
      >
        Volver a login
      </a>
    </form>
  );
}
