"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "agency-os-theme";

/** Conmuta data-theme en <html> entre oscuro (por defecto) y claro, y lo persiste. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    }
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex cursor-pointer items-center gap-2 rounded-pill border border-line-strong bg-surface px-3.5 py-2 font-sans text-[13px] font-medium text-ink transition hover:border-green ${className}`}
    >
      <span className="h-2 w-2 rounded-pill bg-green" />
      Tema: {theme === "dark" ? "Oscuro" : "Claro"}
    </button>
  );
}
