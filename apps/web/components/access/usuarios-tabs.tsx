"use client";

import { useState, type ReactNode } from "react";
import { UnderlineTabs } from "@agency-os/ui";

interface UsuariosTabsProps {
  usersContent: ReactNode;
  rolesContent: ReactNode;
}

/** El server component de /usuarios sigue haciendo todo el fetch de datos y
 * renderiza AccessManager/AreasManager/RolesManager (todos "use client") como
 * elementos ya armados — este wrapper solo decide cuál mostrar, sin tocar el
 * fetching. */
export function UsuariosTabs({ usersContent, rolesContent }: UsuariosTabsProps) {
  const [tab, setTab] = useState<"usuarios" | "roles">("usuarios");

  return (
    <div>
      <UnderlineTabs
        items={[
          { key: "usuarios", label: "Usuarios" },
          { key: "roles", label: "Roles" },
        ]}
        activeKey={tab}
        onSelect={(key) => setTab(key === "roles" ? "roles" : "usuarios")}
        className="mb-6"
      />
      {tab === "usuarios" ? usersContent : rolesContent}
    </div>
  );
}
