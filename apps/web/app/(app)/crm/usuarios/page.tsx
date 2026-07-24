import { redirect } from "next/navigation";

// El catálogo de KAM/PM es del módulo CRM; el acceso general de personas vive
// en /usuarios (solo Administrador de sistema).
export default function CrmUsuariosRedirect() {
  redirect("/crm/kams");
}
