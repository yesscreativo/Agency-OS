/** Layout mínimo para vistas imprimibles: sin shell de navegación, fondo papel. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-[#161618]">{children}</div>;
}
