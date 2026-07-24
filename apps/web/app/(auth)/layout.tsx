"use client";

import { useRef } from "react";

/** Fondo compartido de las vistas de acceso: video del samurái en pausa
 * (public/assets/) que se reproduce acelerado al enviar el formulario,
 * bajo un lavado oscuro/morado, detrás de la tarjeta de vidrio. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const playVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = 1.75;
    video.play().catch(() => {});
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050506] p-4">
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="auto"
        poster="/assets/images/bg-app.png"
        className="absolute inset-0 z-0 h-full w-full object-cover"
      >
        <source src="/assets/videos/bg-app-animado.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(5,5,6,.68),rgba(5,5,6,.9)),radial-gradient(120%_90%_at_80%_10%,rgba(109,40,217,.32),transparent_55%)]" />
      <div className="relative z-[2] w-full max-w-[360px]" onSubmitCapture={playVideo}>
        <div
          className="rounded-[22px] border border-white/15 bg-white/[0.07] p-8 shadow-[0_20px_60px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-2xl"
          style={
            {
              // Tokens locales: inputs y textos en modo vidrio dentro de la tarjeta
              "--surface": "rgba(255,255,255,.05)",
              "--border-strong": "rgba(255,255,255,.16)",
              "--text": "#f6f6f7",
            } as React.CSSProperties
          }
        >
          <div className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/images/logo-Aos.png" alt="Agency OS" className="h-6 w-auto" />
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
