# Assets

Archivos estáticos de la app (imágenes y videos). Todo lo que está en `public/` se sirve desde la raíz del sitio:

- `public/assets/images/logo.png` → `http://localhost:3000/assets/images/logo.png`
- `public/assets/videos/demo.mp4` → `http://localhost:3000/assets/videos/demo.mp4`

En el código se referencian con la ruta absoluta, sin `public/`:

```tsx
<img src="/assets/images/logo.png" alt="Logo" />
```

## Fondo del login

El login usa `videos/bg-app-animado.mp4` como fondo con `images/bg-app.png` de poster (se ve mientras el video carga). Para cambiarlo, reemplaza esos dos archivos manteniendo los nombres.

## Convenciones
- Nombres en `kebab-case` y en inglés: `hero-dashboard.png`, `client-onboarding.mp4`.
- Optimizar antes de subir: imágenes grandes a WebP/AVIF, videos a MP4 (H.264) comprimido.
- Este repo es público — no subir material con datos reales de clientes.
