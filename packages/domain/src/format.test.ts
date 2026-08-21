import { describe, expect, it } from "vitest";
import {
  dateRangeLabel,
  daysOverdue,
  escapeHtml,
  formatDate,
  formatDateShort,
  formatMoney,
  formatRelative,
  initialsOf,
  isOverdue,
  overdueLabel,
} from "./format";

// Los montos formateados incluyen un espacio irrompible (NBSP,  ) entre el
// símbolo y el número — se compara contra el propio `Intl.NumberFormat` en vez de
// hardcodear el string exacto, para no depender de la versión de ICU del runtime.
function expectedMoney(amount: number, currency: string, decimals: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

describe("formatMoney", () => {
  it("formats COP with 0 decimals", () => {
    expect(formatMoney(1500000, "COP")).toBe(expectedMoney(1500000, "COP", 0));
  });

  it("formats USD with 2 decimals, es-CO separators", () => {
    expect(formatMoney(1500.5, "USD")).toBe(expectedMoney(1500.5, "USD", 2));
  });

  it("defaults to COP when currency is omitted", () => {
    expect(formatMoney(1000)).toBe(expectedMoney(1000, "COP", 0));
  });

  it("returns '--' for null/undefined", () => {
    expect(formatMoney(null)).toBe("--");
    expect(formatMoney(undefined)).toBe("--");
  });

  it("formats zero as a real amount, not as missing", () => {
    expect(formatMoney(0, "COP")).toBe(expectedMoney(0, "COP", 0));
  });
});

describe("formatDate", () => {
  it("formats a date in es-CO short form", () => {
    expect(formatDate("2026-03-06T12:00:00Z")).toBe("06 de mar de 2026");
  });

  it("returns '--' for falsy input", () => {
    expect(formatDate(null)).toBe("--");
    expect(formatDate(undefined)).toBe("--");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-08-20T12:00:00Z");

  it("muestra 'hace un momento' para <1 min", () => {
    expect(formatRelative("2026-08-20T11:59:30Z", now)).toBe("hace un momento");
  });

  it("muestra minutos", () => {
    expect(formatRelative("2026-08-20T11:45:00Z", now)).toBe("hace 15 min");
  });

  it("muestra horas", () => {
    expect(formatRelative("2026-08-20T09:00:00Z", now)).toBe("hace 3 h");
  });

  it("muestra días hasta 7", () => {
    expect(formatRelative("2026-08-18T12:00:00Z", now)).toBe("hace 2 d");
  });

  it("cae a fecha absoluta para >7 días", () => {
    const iso = "2026-08-01T12:00:00Z";
    expect(formatRelative(iso, now)).toBe(formatDate(iso));
  });

  it("devuelve '--' para input vacío", () => {
    expect(formatRelative(null, now)).toBe("--");
  });
});

describe("formatDateShort", () => {
  it("formatea día/mes sin año, sin correr por timezone", () => {
    expect(formatDateShort("2026-08-10")).toBe("10/8");
    expect(formatDateShort("2026-12-01")).toBe("1/12");
  });

  it("devuelve '--' para vacío", () => {
    expect(formatDateShort(null)).toBe("--");
    expect(formatDateShort(undefined)).toBe("--");
  });
});

describe("dateRangeLabel", () => {
  it("muestra rango con conteo de días inclusivo", () => {
    expect(dateRangeLabel("2026-08-10", "2026-08-12")).toBe("10/8 → 12/8 (3d)");
  });

  it("un solo día muestra (1d)", () => {
    expect(dateRangeLabel("2026-08-10", "2026-08-10")).toBe("10/8 → 10/8 (1d)");
  });

  it("solo fecha de vencimiento", () => {
    expect(dateRangeLabel(null, "2026-08-12")).toBe("12/8");
  });

  it("solo fecha de inicio", () => {
    expect(dateRangeLabel("2026-08-10", null)).toBe("10/8");
  });

  it("sin fechas devuelve cadena vacía", () => {
    expect(dateRangeLabel(null, null)).toBe("");
  });
});

describe("initialsOf", () => {
  it("toma la inicial del primer y último nombre", () => {
    expect(initialsOf("Yesid Parra")).toBe("YP");
  });

  it("con un solo nombre usa una inicial", () => {
    expect(initialsOf("Ana")).toBe("A");
  });

  it("ignora espacios extra y usa primera+última palabra", () => {
    expect(initialsOf("  José  de la  Cruz ")).toBe("JC");
  });

  it("devuelve '?' para vacío", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});

describe("isOverdue / daysOverdue / overdueLabel", () => {
  const today = new Date(2026, 7, 21); // 21 ago 2026 (mes 0-index)

  it("no está retrasada sin fecha de vencimiento", () => {
    expect(isOverdue(null, false, today)).toBe(false);
    expect(daysOverdue(null, today)).toBe(0);
  });

  it("no está retrasada si vence hoy o en el futuro", () => {
    expect(isOverdue("2026-08-21", false, today)).toBe(false);
    expect(isOverdue("2026-08-25", false, today)).toBe(false);
  });

  it("está retrasada si venció antes de hoy y no está hecha", () => {
    expect(isOverdue("2026-08-20", false, today)).toBe(true);
    expect(daysOverdue("2026-08-18", today)).toBe(3);
  });

  it("nunca está retrasada si la tarea está hecha", () => {
    expect(isOverdue("2026-08-01", true, today)).toBe(false);
  });

  it("overdueLabel usa singular/plural", () => {
    expect(overdueLabel("2026-08-20", today)).toBe("Retrasada 1 día");
    expect(overdueLabel("2026-08-18", today)).toBe("Retrasada 3 días");
    expect(overdueLabel("2026-08-21", today)).toBe("");
  });
});

describe("escapeHtml", () => {
  it("escapes &, \", < and >", () => {
    expect(escapeHtml(`<b>"Tom & Jerry"</b>`)).toBe(
      "&lt;b&gt;&quot;Tom &amp; Jerry&quot;&lt;/b&gt;",
    );
  });

  it("returns an empty string for falsy input", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml("")).toBe("");
  });
});
