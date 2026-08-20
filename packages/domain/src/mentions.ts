// Menciones @usuario en comentarios de work items. El editor inserta el nombre
// completo del usuario (`@Nombre Apellido`) al elegirlo del autocompletado; aquí
// resolvemos esos tokens de vuelta a user_id para notificar. La resolución final
// es del servidor (no confiamos en ids que venga del cliente).

const MAX_COMMENT_LENGTH = 5000;

/** Normaliza para comparar sin distinguir mayúsculas ni acentos. */
function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface MentionUser {
  id: string;
  name: string;
}

/** Extrae menciones `@Nombre` del cuerpo y las resuelve a user_id únicos. En cada
 * `@` gana el nombre más largo que encaje (así "@Ana María" no marca también a
 * "Ana"), y solo si termina en frontera de palabra. */
export function parseMentions(body: string, users: MentionUser[]): string[] {
  if (!body || users.length === 0) return [];
  const nb = norm(body);
  // Más largos primero: en un mismo `@` el nombre más específico gana.
  const normed = users
    .map((u) => ({ id: u.id, n: norm(u.name) }))
    .filter((u) => u.n.length > 0)
    .sort((a, b) => b.n.length - a.n.length);

  const found = new Set<string>();
  for (let i = 0; i < nb.length; i++) {
    if (nb[i] !== "@") continue;
    for (const u of normed) {
      if (!nb.startsWith(u.n, i + 1)) continue;
      const after = nb[i + 1 + u.n.length];
      // Frontera: fin de cadena o carácter que no sea letra/número (no cortar
      // un nombre en mitad de otra palabra).
      if (after === undefined || !/[\p{L}\p{N}]/u.test(after)) {
        found.add(u.id);
        break; // el match más largo en este `@` ya ganó
      }
    }
  }
  return [...found];
}

/** Valida el cuerpo de un comentario. Espeja el estilo de `validateWorkItemTitle`. */
export function validateComment(body: string): { valid: boolean; error?: string } {
  if (!body.trim()) return { valid: false, error: "El comentario no puede estar vacío." };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { valid: false, error: `El comentario supera los ${MAX_COMMENT_LENGTH} caracteres.` };
  }
  return { valid: true };
}
