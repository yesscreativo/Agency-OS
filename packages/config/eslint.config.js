const tseslint = require("typescript-eslint");

/** Config base compartida. Cada paquete/app la extiende y agrega sus propios plugins (ej. next/core-web-vitals). */
module.exports = tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/.turbo/**", "**/coverage/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
