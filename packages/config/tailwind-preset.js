/** Preset compartido del design system "Agency OS".
 * Los valores reales viven como CSS variables en apps/web/app/globals.css
 * (tema oscuro por defecto, claro vía [data-theme="light"]).
 * Fuente canónica de la paleta: Docs/95-Assets/Colors.md */
/** @type {import("tailwindcss").Config} */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Space Grotesk", "sans-serif"],
        mono: ["var(--font-mono)", "Space Mono", "monospace"],
      },
      colors: {
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        elev: "var(--elev)",
        ink: "var(--text)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        green: {
          DEFAULT: "var(--green)",
          soft: "var(--green-soft)",
          ink: "var(--green-ink)",
        },
        purple: {
          DEFAULT: "var(--purple)",
          strong: "var(--purple-strong)",
          soft: "var(--purple-soft)",
        },
        danger: "var(--danger)",
        line: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
      },
      borderRadius: {
        // Escala del DS: sm 8 · md 14 · lg 20 · xl 28 · pill
        sm: "8px",
        DEFAULT: "12px",
        md: "14px",
        lg: "20px",
        xl: "28px",
        pill: "99px",
      },
      boxShadow: {
        raised: "0 2px 8px rgba(0,0,0,.18)",
        overlay: "var(--shadow)",
        focus: "0 0 0 3px var(--green-soft)",
      },
    },
  },
  plugins: [],
};
