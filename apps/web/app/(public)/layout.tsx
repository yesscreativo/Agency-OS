/** Layout de las vistas públicas por magic link (cliente y proveedor): sin shell de
 * navegación, sin sesión, fondo papel claro. Independiente del theme toggle de la app. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme="light": fuerza los tokens de tema (--glass, --border, --text,
    // --muted…) a sus valores claros. Sin esto, un componente del app que use
    // esas clases (ej. ProjectGantt en la vista pública del Gantt) hereda por
    // default los valores OSCUROS del root — un "glass" casi negro sobre este
    // fondo papel claro se ve como un gris lavado, no como vidrio.
    <div data-theme="light" className="min-h-screen bg-[#f4f4f5] text-[#161618]">
      <header className="border-b border-[#e4e4e7] bg-white">
        <div className="mx-auto flex max-w-[860px] items-center px-6 py-4 sm:px-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/images/LBRU-negro.svg" alt="Laburu" className="h-7 w-auto" />
        </div>
      </header>
      {children}
    </div>
  );
}
