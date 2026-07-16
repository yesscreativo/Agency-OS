/** Fondo compartido de las vistas de acceso: video del samurái con poster
 * (public/assets/) bajo un lavado oscuro/morado, detrás de la tarjeta de vidrio. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050506] p-4">
      <video
        muted
        loop
        autoPlay
        playsInline
        poster="/assets/images/bg-app.png"
        className="absolute inset-0 z-0 h-full w-full object-cover"
      >
        <source src="/assets/videos/bg-app-animado.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(5,5,6,.55),rgba(5,5,6,.82)),radial-gradient(120%_90%_at_80%_10%,rgba(109,40,217,.35),transparent_55%)]" />
      <div className="relative z-[2] w-full max-w-[360px]">
        <div className="rounded-[22px] border border-white/10 bg-[rgba(20,20,24,.72)] p-8 shadow-[0_20px_60px_rgba(0,0,0,.5)] backdrop-blur-2xl">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#b8ff3c] text-[15px] font-bold text-[#0d0f08]">
              A
            </span>
            <span className="text-base font-bold tracking-tight text-[#f6f6f7]">
              Agency <span className="text-[#b8ff3c]">OS</span>
            </span>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
