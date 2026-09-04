import { describe, expect, it } from "vitest";
import { parseMentions, validateComment } from "./mentions";

const users = [
  { id: "u1", name: "Yesid Parra" },
  { id: "u2", name: "Ana" },
  { id: "u3", name: "Ana María" },
  { id: "u4", name: "José Núñez" },
];

describe("parseMentions", () => {
  it("resuelve una mención de nombre completo a su id", () => {
    expect(parseMentions("hola @Yesid Parra, revisa esto", users)).toEqual(["u1"]);
  });

  it("no marca un nombre que es prefijo de otro más largo mencionado", () => {
    // "@Ana María" NO debe además marcar a "Ana"
    expect(parseMentions("cc @Ana María", users)).toEqual(["u3"]);
  });

  it("sí marca el nombre corto cuando se menciona solo", () => {
    expect(parseMentions("gracias @Ana", users)).toEqual(["u2"]);
  });

  it("es insensible a mayúsculas y acentos", () => {
    expect(parseMentions("ping @jose nunez", users)).toEqual(["u4"]);
  });

  it("devuelve ids únicos aunque se mencione dos veces", () => {
    expect(parseMentions("@Ana y otra vez @Ana", users)).toEqual(["u2"]);
  });

  it("resuelve varias menciones distintas", () => {
    const r = parseMentions("@Ana y @Yesid Parra", users);
    expect(r.sort()).toEqual(["u1", "u2"]);
  });

  it("ignora @ sin nombre conocido", () => {
    expect(parseMentions("@Desconocido hola", users)).toEqual([]);
  });

  it("no marca cuando el nombre aparece sin @", () => {
    expect(parseMentions("Ana dijo que sí", users)).toEqual([]);
  });

  it("devuelve [] con texto vacío o sin usuarios", () => {
    expect(parseMentions("", users)).toEqual([]);
    expect(parseMentions("@Ana", [])).toEqual([]);
  });
});

describe("validateComment", () => {
  it("acepta un cuerpo con texto", () => {
    expect(validateComment("un comentario")).toEqual({ valid: true });
  });

  it("rechaza cuerpo vacío o solo espacios", () => {
    expect(validateComment("   ").valid).toBe(false);
    expect(validateComment("").valid).toBe(false);
  });

  it("rechaza cuerpos que exceden el máximo", () => {
    expect(validateComment("x".repeat(5001)).valid).toBe(false);
  });

  it("acepta justo en el límite", () => {
    expect(validateComment("x".repeat(5000))).toEqual({ valid: true });
  });
});
