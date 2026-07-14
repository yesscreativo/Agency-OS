// Extraído de save()/uploadBrief() en js/index.js del cotizador viejo.
//
// Nota: el código viejo solo validaba `items[0].description` (el primer ítem), no
// "al menos uno". Aquí se implementa la regla como está descrita en el plan del
// producto — cualquier ítem con descripción es válido, no solo el primero.

export interface QuoteValidationItem {
  description: string | null | undefined;
}

export interface QuoteValidationRecipient {
  email: string | null | undefined;
}

export interface ValidateQuoteInput {
  items: QuoteValidationItem[];
  recipients: QuoteValidationRecipient[];
  isSending: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateQuote({ items, recipients, isSending }: ValidateQuoteInput): ValidationResult {
  const errors: string[] = [];

  const hasDescribedItem = items.some((item) => !!item.description?.trim());
  if (!hasDescribedItem) {
    errors.push("Agrega al menos un item con descripción");
  }

  if (isSending && recipients.length === 0) {
    errors.push("Agrega al menos un destinatario");
  }

  return { valid: errors.length === 0, errors };
}

export const MAX_BRIEF_SIZE_BYTES = 10 * 1024 * 1024;

export function validateBriefSize(sizeBytes: number): { valid: boolean; error?: string } {
  if (sizeBytes > MAX_BRIEF_SIZE_BYTES) {
    return { valid: false, error: "Archivo demasiado grande (máx 10MB)" };
  }
  return { valid: true };
}
