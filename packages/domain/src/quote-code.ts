// Extraído de generateQuoteCode() en js/index.js del cotizador viejo.
// Formato: MES(3) + CLIENTE(3) + DD + MM + AAAA + "-" + NN
// El secuencial (NN) ya no se calcula aquí — lo resuelve next_quote_seq() en la BD
// (contador atómico) para eliminar la condición de carrera del código viejo.

const MONTHS = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
] as const;

export function extractClientCode(nameOrCompany: string | null | undefined): string {
  const raw = (nameOrCompany ?? "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (!raw) return "XXX";
  return raw.slice(0, 3).padEnd(3, "X");
}

export interface BuildQuoteCodeInput {
  clientName?: string | null;
  clientCompany?: string | null;
  date: Date;
  seq: number;
}

export function buildQuoteCode({ clientName, clientCompany, date, seq }: BuildQuoteCodeInput): string {
  const month = MONTHS[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  const monthNum = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const clientCode = extractClientCode(clientCompany || clientName);
  const nextSeq = String(seq).padStart(2, "0");

  return `${month}${clientCode}${day}${monthNum}${year}-${nextSeq}`;
}
