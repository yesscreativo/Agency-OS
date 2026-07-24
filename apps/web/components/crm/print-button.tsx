"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="cursor-pointer rounded-pill bg-[#0d0f08] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-85 print:hidden"
    >
      Imprimir / Guardar como PDF
    </button>
  );
}
