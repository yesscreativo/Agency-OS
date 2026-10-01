import { describe, expect, it } from "vitest";
import {
  countBusinessDays,
  isVacationDateBlocked,
  leaveRequestStatusLabel,
  LEAVE_REQUEST_TYPE_LABELS,
  LEAVE_REQUEST_TYPES,
} from "./leave";

describe("LEAVE_REQUEST_TYPES", () => {
  it("tiene los 7 tipos con etiqueta en español", () => {
    expect(LEAVE_REQUEST_TYPES).toHaveLength(7);
    for (const t of LEAVE_REQUEST_TYPES) {
      expect(LEAVE_REQUEST_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});

describe("isVacationDateBlocked", () => {
  it("bloquea si la fecha cae del 23 a fin de mes y hoy ya pasó el 23 de ESE mes", () => {
    expect(isVacationDateBlocked("2026-11-27", "2026-11-25")).toBe(true);
  });

  it("no bloquea si hoy todavía no llega al 23 del mes de la fecha, aunque sea un mes futuro", () => {
    expect(isVacationDateBlocked("2026-11-27", "2026-10-05")).toBe(false);
  });

  it("no bloquea una fecha antes del día 23 del mes, sin importar hoy", () => {
    expect(isVacationDateBlocked("2026-11-10", "2026-11-25")).toBe(false);
  });

  it("no bloquea si hoy es exactamente el día 23 del mes de la fecha (el límite es inclusive: 23 es el último día permitido para pedir)", () => {
    expect(isVacationDateBlocked("2026-11-27", "2026-11-22")).toBe(false);
    expect(isVacationDateBlocked("2026-11-27", "2026-11-23")).toBe(true);
  });
});

describe("countBusinessDays", () => {
  it("cuenta de lunes a viernes, sin festivos, inclusivo", () => {
    expect(countBusinessDays("2026-11-02", "2026-11-06", [])).toBe(5);
  });

  it("excluye sábado y domingo", () => {
    expect(countBusinessDays("2026-11-02", "2026-11-08", [])).toBe(5);
  });

  it("excluye festivos que caigan en día hábil", () => {
    expect(countBusinessDays("2026-11-02", "2026-11-06", ["2026-11-04"])).toBe(4);
  });

  it("un festivo en fin de semana no resta (ya estaba excluido)", () => {
    expect(countBusinessDays("2026-11-02", "2026-11-08", ["2026-11-07"])).toBe(5);
  });
});

describe("leaveRequestStatusLabel", () => {
  it("pendiente de jefe", () => {
    expect(leaveRequestStatusLabel("pending", "pending")).toBe("Pendiente jefe");
  });
  it("pendiente de RRHH", () => {
    expect(leaveRequestStatusLabel("approved", "pending")).toBe("Pendiente RRHH");
  });
  it("aprobada", () => {
    expect(leaveRequestStatusLabel("approved", "approved")).toBe("Aprobada");
  });
  it("rechazada por el jefe", () => {
    expect(leaveRequestStatusLabel("rejected", "pending")).toBe("Rechazada (jefe)");
  });
  it("rechazada por RRHH", () => {
    expect(leaveRequestStatusLabel("approved", "rejected")).toBe("Rechazada (RRHH)");
  });
});
