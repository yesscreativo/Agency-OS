"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { portalLogin } from "@/lib/portal-actions";
import type { AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Ingresando..." : "Entrar"}
    </Button>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense>
      <PortalLoginForm />
    </Suspense>
  );
}

function PortalLoginForm() {
  const [state, formAction] = useFormState(portalLogin, initialState);
  const searchParams = useSearchParams();
  const invalidLink = searchParams.get("error") === "enlace-invalido";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#f6f6f7]">Portal de clientes</h1>
        <p className="mt-1 text-[13.5px] text-[#a1a1aa]">Entra a tu espacio con Laburu.</p>
      </div>

      {invalidLink && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">
          El enlace venció, ya fue usado o no es válido. Solicita uno nuevo.
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="email" className="text-[#f6f6f7]">
            Email
          </Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>

        <div>
          <Label htmlFor="password" className="text-[#f6f6f7]">
            Contraseña
          </Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>

        <FieldError>{state.error}</FieldError>

        <SubmitButton />

        <Link
          href="/portal/recuperar"
          className="block text-center text-[12.5px] text-[#71717a] transition hover:text-[#b8ff3c]"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </div>
  );
}
