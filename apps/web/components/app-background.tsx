"use client";

import { useEffect, useRef, useState } from "react";

/** Fondo ambiental del área autenticada (estilo "Stitch"): auroras de color que
 * entran desde los bordes izquierdo/derecho + una grilla de puntos cuyos puntos
 * se iluminan y agrandan cerca del cursor (spotlight que sigue al mouse). WebGL
 * puro, decorativo (fijo detrás del contenido, sin capturar eventos). Con
 * `prefers-reduced-motion` pinta un solo frame congelado y desactiva el mouse. */

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_grain;
uniform vec2  u_mouse;         // en espacio 'p' (aspecto corregido)
uniform float u_mousePresent;  // 0..1
uniform float u_spotRadius;
uniform float u_dotSpacing;    // px * dpr
uniform float u_dotBaseAlpha;
uniform float u_dotHotAlpha;
uniform float u_auroraGain;
uniform float u_isLight;       // 0 oscuro / 1 claro
uniform vec3  u_cyan;          // extremo exterior/inferior del ala
uniform vec3  u_blue;          // medio
uniform vec3  u_purple;        // interior/superior
uniform vec3  u_magenta;       // punta interior
uniform vec3  u_dotColor;
uniform vec3  u_spotColor;
uniform vec3  u_bg;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
    dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Gradiente de color a lo ancho del ala: cian (exterior) -> azul -> morado -> magenta.
vec3 auroraGrad(float a){
  vec3 c = mix(u_cyan, u_blue, smoothstep(0.0, 0.5, a));
  c = mix(c, u_purple, smoothstep(0.42, 0.85, a));
  c = mix(c, u_magenta, smoothstep(0.82, 1.0, a));
  return c;
}

// Un "ala" de aurora que sale de una esquina inferior y barre hacia el centro-abajo.
// mirror: 0.0 = ala izquierda, 1.0 = ala derecha. across (0..1) posiciona el
// color a lo ancho de la banda (0 borde inferior/exterior, 1 interior/superior).
float wing(vec2 uv, float mirror, float t, out float across){
  float x = mix(uv.x, 1.0 - uv.x, mirror);                 // 0 en el borde exterior
  float yc = 0.56 - x * 0.9 + 0.05 * snoise(vec2(x * 3.5 + mirror * 7.0, t * 0.25));
  float d  = uv.y - yc;                                     // distancia a la línea central
  across   = clamp(d / 0.34 + 0.5, 0.0, 1.0);
  float gg = d / 0.17;
  float band  = exp(-gg * gg);                              // banda gaussiana suave
  float reach = smoothstep(0.66, 0.02, x);                 // se desvanece hacia el centro
  float flow  = 0.72 + 0.28 * snoise(vec2(x * 5.0 - t * 0.6, mirror * 3.0 + t * 0.2));
  return band * reach * flow;
}

void main() {
  vec2 uv = vUv;
  float ratio = u_resolution.x / u_resolution.y;
  float t = u_time;

  // ---- Auroras: dos alas desde las esquinas inferiores ----
  float acL; float wL = wing(uv, 0.0, t, acL);
  float acR; float wR = wing(uv, 1.0, t, acR);
  vec3  aCol = auroraGrad(acL) * wL + auroraGrad(acR) * wR;
  float aW   = wL + wR;

  vec3 added  = u_bg + aCol * u_auroraGain;                        // oscuro: suma (brilla)
  vec3 avg    = aCol / max(aW, 0.001);
  vec3 subbed = mix(u_bg, avg, clamp(aW * u_auroraGain, 0.0, 0.8)); // claro: tiñe
  vec3 col = mix(added, subbed, u_isLight);

  // ---- Grilla de puntos ----
  vec2  g   = uv * u_resolution / u_dotSpacing;
  vec2  cid = floor(g) + 0.5;
  vec2  fc  = fract(g) - 0.5;
  float dcell = length(fc);
  vec2  cUv = cid * u_dotSpacing / u_resolution;
  vec2  cP  = vec2((cUv.x - 0.5) * ratio, cUv.y - 0.5);

  // Spotlight: el punto crece/brilla según cercanía del centro de celda al mouse.
  float md   = distance(cP, u_mouse);
  float spot = u_mousePresent * (1.0 - smoothstep(0.0, u_spotRadius, md));

  float baseR   = 0.032;
  float r       = mix(baseR, baseR * 2.1, spot);
  float dotMask = 1.0 - smoothstep(r, r + 0.05, dcell);
  // Los puntos también se realzan levemente sobre las auroras (como en Stitch).
  float reveal  = clamp(aW * u_auroraGain, 0.0, 1.0);
  float dotA    = dotMask * clamp(mix(u_dotBaseAlpha, u_dotHotAlpha, spot) + reveal * 0.25, 0.0, 0.85);
  vec3  dotCol  = mix(u_dotColor, u_spotColor, spot);
  col = mix(col, dotCol, dotA);

  // Grano sutil para romper el banding de los gradientes.
  float grain = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453 + u_time);
  col += (grain - 0.5) * u_grain * 0.08;

  gl_FragColor = vec4(col, 1.0);
}
`;

/** Paletas por tema. En oscuro las auroras brillan sobre negro; en claro tiñen
 * suavemente sobre gris claro. teal/azul/magenta son literales (el design system
 * no tiene esos tokens); morado y verde sí son de la paleta de marca. */
const THEMES = {
  dark: {
    bg: "#0a0a0b",
    cyan: "#22d3ee",
    blue: "#3b6dff",
    purple: "#7c3aed",
    magenta: "#c026d3",
    dot: "#4a4a55",
    spot: "#e6f0ff", // realce sutil (no verde), como Stitch
    auroraGain: 0.85,
    dotBaseAlpha: 0.16,
    dotHotAlpha: 0.5,
  },
  light: {
    bg: "#f2f2f3",
    cyan: "#22b8c9",
    blue: "#3b6dff",
    purple: "#7c3aed",
    magenta: "#b83cff",
    dot: "#c4c4cf",
    spot: "#6d28d9",
    auroraGain: 0.55,
    dotBaseAlpha: 0.26,
    dotHotAlpha: 0.5,
  },
} as const;

const SPEED = 0.6;
const GRAIN = 0.15;
const DOT_SPACING = 22; // px lógicos entre puntos (se multiplica por dpr)
const SPOT_RADIUS = 0.2; // radio del spotlight en espacio 'p'
// Instante congelado para prefers-reduced-motion (composición agradable, estática).
const FROZEN_MS = 20000;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function currentTheme(): keyof typeof THEMES {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function AppBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [theme, setTheme] = useState<keyof typeof THEMES | null>(null);
  // Posición del mouse: t* = objetivo (del listener), sin prefijo = valor suavizado.
  const mouse = useRef({ x: 0, y: 0, tx: 0, ty: 0, present: 0, tPresent: 0 });

  // El tema vive en data-theme del <html> y el ThemeToggle lo cambia sin recargar.
  useEffect(() => {
    setTheme(currentTheme());
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!theme) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return; // sin WebGL queda el bg-bg sólido del contenedor

    const palette = THEMES[theme];

    const createShader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const pos = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const locs = {
      res: u("u_resolution"),
      time: u("u_time"),
      mouse: u("u_mouse"),
      mousePresent: u("u_mousePresent"),
      dotSpacing: u("u_dotSpacing"),
    };

    // Uniforms estáticos (no cambian por frame): se setean una vez.
    const setVec3 = (name: string, hex: string) => {
      const [r, g, b] = hexToRgb(hex);
      gl.uniform3f(u(name), r, g, b);
    };
    gl.uniform1f(u("u_grain"), GRAIN);
    gl.uniform1f(u("u_spotRadius"), SPOT_RADIUS);
    gl.uniform1f(u("u_auroraGain"), palette.auroraGain);
    gl.uniform1f(u("u_dotBaseAlpha"), palette.dotBaseAlpha);
    gl.uniform1f(u("u_dotHotAlpha"), palette.dotHotAlpha);
    gl.uniform1f(u("u_isLight"), theme === "light" ? 1 : 0);
    setVec3("u_cyan", palette.cyan);
    setVec3("u_blue", palette.blue);
    setVec3("u_purple", palette.purple);
    setVec3("u_magenta", palette.magenta);
    setVec3("u_dotColor", palette.dot);
    setVec3("u_spotColor", palette.spot);
    setVec3("u_bg", palette.bg);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const drawFrame = (tMs: number) => {
      const m = mouse.current;
      const k = 0.1; // suavizado del spotlight para que no salte
      m.x += (m.tx - m.x) * k;
      m.y += (m.ty - m.y) * k;
      m.present += (m.tPresent - m.present) * k;
      gl.uniform2f(locs.res, canvas.width, canvas.height);
      gl.uniform1f(locs.time, tMs * 0.001 * SPEED);
      gl.uniform2f(locs.mouse, m.x, m.y);
      gl.uniform1f(locs.mousePresent, m.present);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 1.5);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(locs.dotSpacing, DOT_SPACING * dpr);
      if (reducedMotion) drawFrame(FROZEN_MS); // sin loop hay que repintar a mano
    };
    resize();
    window.addEventListener("resize", resize);

    // El contenedor es pointer-events-none, así que el mouse se escucha en window.
    const onMove = (e: PointerEvent) => {
      const ratio = canvas.width / canvas.height;
      const nx = e.clientX / window.innerWidth;
      const ny = 1 - e.clientY / window.innerHeight; // vUv.y sube, clientY baja
      mouse.current.tx = (nx - 0.5) * ratio;
      mouse.current.ty = ny - 0.5;
      mouse.current.tPresent = 1;
    };
    const onLeave = () => {
      mouse.current.tPresent = 0;
    };
    if (!reducedMotion) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerleave", onLeave);
    }

    let raf = 0;
    if (reducedMotion) {
      drawFrame(FROZEN_MS);
    } else {
      const render = (t: number) => {
        drawFrame(t);
        raf = requestAnimationFrame(render);
      };
      raf = requestAnimationFrame(render);
    }

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, [theme]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Velo hacia --bg para bajar el contraste del efecto y proteger legibilidad */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 0%, transparent 0%, var(--bg) 130%)",
          opacity: 0.55,
        }}
      />
    </div>
  );
}
