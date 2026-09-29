import { describe, expect, it } from "vitest";
import { groupLabel, groupPermissions } from "./permission-groups";

describe("groupLabel", () => {
  it("resuelve el prefijo de un código conocido a su etiqueta en español", () => {
    expect(groupLabel("quote.see_costs")).toBe("Cotizaciones");
    expect(groupLabel("quote_status.manage")).toBe("Estados de cotización");
    expect(groupLabel("project.manage")).toBe("Proyectos");
    expect(groupLabel("client.manage")).toBe("Clientes");
    expect(groupLabel("kam.manage")).toBe("KAM / PM");
    expect(groupLabel("people.manage")).toBe("Personas");
    expect(groupLabel("users.manage")).toBe("Usuarios y roles");
  });

  it("cae al prefijo capitalizado si no hay etiqueta mapeada", () => {
    expect(groupLabel("billing.manage")).toBe("Billing");
  });

  it("no revienta con un código sin punto", () => {
    expect(groupLabel("standalone")).toBe("Standalone");
  });
});

describe("groupPermissions", () => {
  it("agrupa por etiqueta y conserva los ítems de cada grupo", () => {
    const permissions = [
      { code: "quote.see_costs", name: "Ver costos" },
      { code: "project.manage", name: "Gestionar proyectos" },
      { code: "quote.send", name: "Enviar cotización" },
    ];
    const groups = groupPermissions(permissions);
    expect(groups).toEqual([
      { label: "Cotizaciones", items: [permissions[0], permissions[2]] },
      { label: "Proyectos", items: [permissions[1]] },
    ]);
  });

  it("ordena los grupos alfabéticamente por etiqueta", () => {
    const permissions = [
      { code: "users.manage", name: "Gestionar usuarios" },
      { code: "client.manage", name: "Gestionar clientes" },
    ];
    const groups = groupPermissions(permissions);
    expect(groups.map((g) => g.label)).toEqual(["Clientes", "Usuarios y roles"]);
  });

  it("devuelve una lista vacía si no hay permisos", () => {
    expect(groupPermissions([])).toEqual([]);
  });
});
