"use client";
/**
 * Two reaching hands drawn every frame as a black dot-matrix (LED halftone) on a canvas.
 * The luminance source is one 2x2 photo sheet; each hand drifts, rolls and breathes, and
 * periodically dissolves dot by dot into a second pose and back (20 s loop).
 */
import { useEffect, useRef } from "react";

const SHEET =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261030_025250_100df7b8-31fd-4614-aa4a-c1b7d5b6b273.png&w=1600&q=85";

// [x, y, w, h] as fractions of the sheet
const SRC = {
  LA: [0, 0.06, 0.47, 0.4],
  RA: [0.53, 0.06, 0.47, 0.4],
  LB: [0, 0.55, 0.47, 0.4],
  RB: [0.53, 0.55, 0.47, 0.4],
} as const;
type Key = keyof typeof SRC;

const LOOP = 20;
const LEVELS = [0, 0.26, 0.52, 0.78, 1];
const DOT = "#0d0d0d";

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mixAt = (t: number, on: number, off: number, dur: number) => smooth(on, on + dur, t) * (1 - smooth(off, off + dur, t));

export function Hands() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0,
      H = 0,
      DPR = 1,
      step = 7,
      rowStep = 14,
      cols = 0,
      rows = 0,
      R = 3;
    let seeds = new Float32Array(0);
    const fA = document.createElement("canvas");
    const fB = document.createElement("canvas");
    const cA = fA.getContext("2d", { willReadFrequently: true })!;
    const cB = fB.getContext("2d", { willReadFrequently: true })!;
    const tiles: Partial<Record<Key, HTMLCanvasElement>> = {};
    let ready = false;
    let raf = 0;
    let stopped = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      step = Math.max(5, W / 205);
      rowStep = step * 2.05;
      cols = Math.ceil(W / step);
      rows = Math.ceil(H / rowStep);
      R = step * 0.46;
      fA.width = fB.width = cols;
      fA.height = fB.height = rows;
      seeds = new Float32Array(cols * rows);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) seeds[j * cols + i] = 0.55 * hash(i, j) + 0.45 * hash(j * 3.1, 7.7);
    };

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      (Object.keys(SRC) as Key[]).forEach((k) => {
        const [x, y, w, h] = SRC[k];
        const tw = 420;
        const th = Math.round((tw * (h * sh)) / (w * sw));
        const c = document.createElement("canvas");
        c.width = tw;
        c.height = th;
        const g = c.getContext("2d")!;
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.drawImage(img, x * sw, y * sh, w * sw, h * sh, 0, 0, tw, th);
        tiles[k] = c;
      });
      ready = true;
    };
    img.src = SHEET;

    const drawHand = (g: CanvasRenderingContext2D, tile: HTMLCanvasElement, left: boolean, t: number) => {
      const portrait = H > W;
      const a = (2 * Math.PI * t) / LOOP;
      const ph = left ? 0 : Math.PI;
      const hw = W * (portrait ? 0.66 : 0.53);
      const hh = hw * ((0.4 * 1520) / (0.47 * 2688));
      const cy = H * (portrait ? 0.66 : 0.54);
      const reach = (0.035 * Math.sin(a + ph) + 0.012 * Math.sin(2 * a + 1.3 + ph)) * W;
      const scale = 1 + 0.07 * Math.sin(a + 0.9 + ph);
      const rot = (left ? 1 : -1) * 0.045 * Math.sin(a + 2.1 + ph);
      const x = left ? reach - W * 0.045 : W - hw + W * 0.045 - reach;
      const px = left ? 0 : W;
      g.save();
      g.scale(cols / W, rows / H);
      g.translate(px, cy);
      g.rotate(rot);
      g.scale(scale, scale);
      g.translate(-px, -cy);
      g.drawImage(tile, x, cy - hh / 2, hw, hh);
      g.restore();
    };

    const render = (time: number) => {
      const t = ((time % LOOP) + LOOP) % LOOP;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!ready || !tiles.LA || !tiles.RA || !tiles.LB || !tiles.RB || cols === 0) return;

      for (const [g, l, r] of [
        [cA, tiles.LA, tiles.RA],
        [cB, tiles.LB, tiles.RB],
      ] as const) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = "#fff";
        g.fillRect(0, 0, cols, rows);
        g.imageSmoothingEnabled = true;
        drawHand(g, l, true, t);
        drawHand(g, r, false, t);
      }
      const dA = cA.getImageData(0, 0, cols, rows).data;
      const dB = cB.getImageData(0, 0, cols, rows).data;

      const portrait = H > W;
      const mL = mixAt(t, 6.2, 14.6, 1.6);
      const mR = mixAt(t, 2.4, 10.4, 1.6);
      const tick = Math.floor(t * 7);
      const qw = portrait ? 0.44 : 0.2;
      const qy = portrait ? 0.33 : 0.385;

      ctx.fillStyle = DOT;
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        const shift = hash(j, tick) > 0.965 ? Math.round((hash(tick, j) - 0.5) * 8) : 0;
        const cyDot = (j + 0.5) * rowStep;
        const ey = (cyDot / H - qy) / 0.085;
        for (let i = 0; i < cols; i++) {
          const seed = seeds[j * cols + i];
          const m = i < cols / 2 ? mL : mR;
          const useB = seed < m;
          const si = clamp(i - shift, 0, cols - 1);
          const d = useB ? dB : dA;
          const lum = d[(j * cols + si) * 4] / 255;
          let v = clamp((1 - lum - 0.16) / 0.42, 0, 1);
          if (v <= 0) continue;
          if (m > 0.001 && m < 0.999) {
            const dist = Math.abs(seed - m);
            if (dist < 0.12) {
              v *= dist / 0.12;
              if (hash(i + tick, j) <= 0.4) v *= 0.3;
            }
          }
          v *= 0.86 + 0.14 * Math.sin(t * 3.2 + seed * 40);
          const cx = Math.abs((i + 0.5) / cols - 0.5);
          v *= smooth(0.035, 0.11, cx);
          const ex = cx / qw;
          v *= smooth(0.85, 1.25, Math.hypot(ex, ey));
          let level = 0;
          for (let k = LEVELS.length - 1; k >= 1; k--) {
            if (v >= LEVELS[k] - 0.13) {
              level = k;
              break;
            }
          }
          if (level === 0) continue;
          const r = level === 1 ? R * 0.38 : R * LEVELS[level];
          const x = (i + 0.5) * step;
          ctx.moveTo(x + r, cyDot);
          ctx.arc(x, cyDot, r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    };

    (window as unknown as { __render?: (t: number) => void }).__render = render;
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const t0 = performance.now();
    const frame = (now: number) => {
      if (stopped) return;
      render((now - t0) / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas id="dots" ref={ref} aria-hidden="true" />;
}
