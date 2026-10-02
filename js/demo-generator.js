/* ============================================================
   ImageIA — demo-generator.js
   Generador de imágenes DEMO 100 % local (canvas procedural).
   No usa ninguna API: sirve para probar toda la interfaz sin
   conexión. La misma semilla produce siempre la misma imagen.

   El resto de proveedores reales se conectan en providers.js.
   ============================================================ */
(function () {
  'use strict';

  const TAU = Math.PI * 2;

  /* ---------- helpers de dibujo ---------- */

  function loadImage(blob) {
    return new Promise(function (resolve, reject) {
      if (typeof createImageBitmap === 'function') {
        createImageBitmap(blob).then(resolve, function () { fallback(); });
      } else {
        fallback();
      }
      function fallback() {
        try {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          const timer = setTimeout(function () {
            img.onload = img.onerror = null;
            URL.revokeObjectURL(url);
            reject(new Error('Tiempo de espera agotado al leer la referencia'));
          }, 10000);
          img.onload = function () {
            clearTimeout(timer);
            resolve(img);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          };
          img.onerror = function () {
            clearTimeout(timer);
            URL.revokeObjectURL(url);
            reject(new Error('No se pudo leer la imagen de referencia'));
          };
          img.src = url;
        } catch (e) { reject(e); }
      }
    });
  }

  function drawCover(ctx, img, x, y, w, h, alpha, comp) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (comp) ctx.globalCompositeOperation = comp;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function mountains(ctx, w, h, horizon, rng, fill, amp) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    let y = horizon - rng() * h * 0.08;
    ctx.lineTo(0, y);
    const seg = Math.max(8, Math.floor(w / 34));
    for (let i = 1; i <= seg; i++) {
      y = horizon - rng() * h * amp;
      ctx.lineTo((w * i) / seg, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function star4(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.closePath();
  }

  /* ============================================================
     generate(request) -> Promise<Blob>
     request: { prompt, negative, width, height, seed, steps, cfg,
                model, styleId, referenceBlob, baseSeed }
     - seed  : composición (misma seed => misma imagen)
     - steps : densidad de detalle (capas y partículas)
     - cfg   : saturación / contraste de la paleta
     - negative: altera ligeramente la paleta (solo en demo)
     - baseSeed: semilla de paleta compartida (variaciones)
     ============================================================ */
  async function generate(req) {
    const w = Math.max(64, Math.min(1536, req.width | 0 || 1024));
    const h = Math.max(64, Math.min(1536, req.height | 0 || 1024));
    const seed = (req.seed | 0) >>> 0;
    const steps = Math.max(1, Math.min(50, req.steps | 0 || 25));
    const cfg = Math.max(1, Math.min(20, +req.cfg || 7));

    const style = (window.PromptKit && PromptKit.getStyle(req.styleId)) || PromptKit.getStyle('ninguno');
    const d = style.demo || {};
    const fast = req.model === 'demo-fast';

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

    const palSeed = ((req.baseSeed != null ? req.baseSeed : seed) >>> 0) ^ (Utils.hashStr(req.negative || '') & 0xffff) ^ 0x9e37;
    const palRng = Utils.mulberry32(palSeed);
    const rng = Utils.mulberry32(seed);

    /* ---------- paleta según estilo + seed + cfg ---------- */
    const hues = d.hues || [210, 270, 320];
    const hue = hues[Math.floor(palRng() * hues.length)] + (palRng() * 36 - 18);
    let sat = (d.sat != null ? d.sat : 60) * (0.75 + cfg / 28);
    sat = Utils.clamp(sat, 8, 100);
    const L = d.light != null ? d.light : 55;
    const dark = !!d.dark;

    const c = function (hh, ss, ll, aa) {
      const norm = ((hh % 360) + 360) % 360;
      return 'hsla(' + norm.toFixed(1) + ',' + Utils.clamp(ss, 0, 100).toFixed(0) + '%,' +
        Utils.clamp(ll, 0, 100).toFixed(0) + '%,' + (aa == null ? 1 : aa) + ')';
    };

    /* ---------- cielo ---------- */
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, c(hue, sat, dark ? 11 : Math.max(14, L - 34)));
    sky.addColorStop(0.55, c(hue + 22, sat * 0.85, dark ? 19 : L - 13));
    sky.addColorStop(1, c(hue + 46, sat * 0.72, dark ? 27 : Math.min(90, L + 12)));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const horizon = h * (0.6 + rng() * 0.2);

    /* ---------- estrellas ---------- */
    const starCount = fast ? 40 : (dark || L < 45 ? Math.round(140 + steps * 3) : 50);
    for (let i = 0; i < starCount; i++) {
      const x = rng() * w, y = rng() * horizon;
      const r = rng() * 1.4 + 0.3;
      ctx.globalAlpha = 0.25 + rng() * 0.65;
      ctx.fillStyle = rng() < 0.85 ? '#ffffff' : c(hue + 160, 80, 80);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ---------- sol / luna ---------- */
    const sunX = w * (0.15 + rng() * 0.7);
    const sunY = h * (0.1 + rng() * 0.3);
    const sunR = Math.min(w, h) * (0.06 + rng() * 0.1);
    const sunHue = hue + 150 + palRng() * 60;

    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 3.4);
    glow.addColorStop(0, c(sunHue, sat, 72, 0.5));
    glow.addColorStop(1, c(sunHue, sat, 72, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - sunR * 3.4, sunY - sunR * 3.4, sunR * 6.8, sunR * 6.8);

    if (d.retroSun) {
      /* sol retro con franjas */
      ctx.save();
      ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, TAU); ctx.clip();
      const sg = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
      sg.addColorStop(0, c(sunHue - 20, 95, 62));
      sg.addColorStop(1, c(sunHue + 25, 90, 52));
      ctx.fillStyle = sg;
      ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
      ctx.fillStyle = c(hue, sat, dark ? 13 : 16, 0.9);
      let sy = sunY + sunR * 0.05, th = sunR * 0.09;
      while (sy < sunY + sunR) { ctx.fillRect(sunX - sunR, sy, sunR * 2, th); sy += th * 2.1; th *= 1.32; }
      ctx.restore();
    } else {
      const disc = ctx.createRadialGradient(sunX - sunR * 0.25, sunY - sunR * 0.25, sunR * 0.1, sunX, sunY, sunR);
      disc.addColorStop(0, c(sunHue, sat * 0.6, 92));
      disc.addColorStop(1, c(sunHue, sat, 66));
      ctx.fillStyle = disc;
      ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, TAU); ctx.fill();
    }

    /* rayos de estilo anime */
    if (d.rays && !fast) {
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = c(sunHue, sat, 78);
      for (let i = 0; i < 14; i++) {
        ctx.rotate(TAU / 14);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(sunR * 5, -sunR * 0.55);
        ctx.lineTo(sunR * 5, sunR * 0.55);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* ---------- nubes / bruma ---------- */
    if (!d.minimal) {
      const clouds = fast ? 2 : 4 + Math.floor(rng() * 4);
      for (let i = 0; i < clouds; i++) {
        const cy = h * (0.08 + rng() * 0.5);
        const cw = w * (0.18 + rng() * 0.3), ch = h * (0.015 + rng() * 0.05);
        ctx.fillStyle = c(hue + 30, sat * 0.5, dark ? 26 : L + 6, 0.16 + rng() * 0.12);
        ctx.beginPath();
        ctx.ellipse(rng() * w, cy, cw, ch, 0, 0, TAU);
        ctx.fill();
      }
    }

    /* ---------- montañas ---------- */
    const layers = fast ? 2 : (d.minimal ? 1 : 3 + Math.floor(rng() * 2));
    for (let i = 0; i < layers; i++) {
      const t = i / Math.max(1, layers - 1);          /* 0 lejos -> 1 cerca */
      const ll = dark ? 16 + t * 10 : L - 24 + t * 16;
      mountains(ctx, w, h, horizon + t * h * 0.05, rng, c(hue + i * 14, sat * (0.55 + t * 0.3), Math.max(4, ll)), 0.1 + t * 0.16);
    }

    /* ---------- agua o suelo ---------- */
    const water = !d.grid && rng() < 0.5;
    if (d.grid) {
      /* rejilla de neón en perspectiva (cyberpunk / retro) */
      ctx.fillStyle = c(hue, sat * 0.5, dark ? 8 : 12);
      ctx.fillRect(0, horizon, w, h - horizon);
      const neon = c(hue + 150, 100, 62, 0.55);
      ctx.save();
      ctx.strokeStyle = neon;
      ctx.shadowColor = c(hue + 150, 100, 62, 0.9);
      ctx.shadowBlur = Math.max(4, w / 180);
      ctx.lineWidth = Math.max(1, w / 900);
      const vp = sunX;
      for (let i = -12; i <= 12; i++) {
        ctx.beginPath();
        ctx.moveTo(vp + i * w * 0.07, horizon);
        ctx.lineTo(vp + i * w * 0.62, h);
        ctx.stroke();
      }
      let yy = horizon, gap = (h - horizon) / 16;
      for (let i = 0; i < 16 && yy < h; i++) {
        yy += gap * Math.pow(1.22, i);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
      }
      ctx.restore();
    } else if (water) {
      const wg = ctx.createLinearGradient(0, horizon, 0, h);
      wg.addColorStop(0, c(hue + 40, sat * 0.8, dark ? 22 : L - 6));
      wg.addColorStop(1, c(hue + 55, sat * 0.6, dark ? 10 : Math.max(8, L - 26)));
      ctx.fillStyle = wg;
      ctx.fillRect(0, horizon, w, h - horizon);
      const lines = fast ? 24 : Math.min(220, steps * 6);
      ctx.strokeStyle = c(sunHue, sat, 74, 0.35);
      ctx.lineWidth = Math.max(1, h / 700);
      for (let i = 0; i < lines; i++) {
        const t = rng();
        const y = horizon + Math.pow(t, 1.7) * (h - horizon);
        const len = w * (0.04 + rng() * 0.22);
        const x = rng() * (w - len);
        ctx.globalAlpha = 0.12 + rng() * 0.4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      const gg = ctx.createLinearGradient(0, horizon, 0, h);
      gg.addColorStop(0, c(hue + 10, sat * 0.45, dark ? 12 : L - 20));
      gg.addColorStop(1, c(hue + 20, sat * 0.35, dark ? 6 : Math.max(5, L - 34)));
      ctx.fillStyle = gg;
      ctx.fillRect(0, horizon, w, h - horizon);
    }

    /* ---------- orbe 3D ---------- */
    if (d.orb && !fast) {
      const or = Math.min(w, h) * (0.12 + rng() * 0.12);
      const ox = w * (0.25 + rng() * 0.5), oy = h * (0.28 + rng() * 0.3);
      const og = ctx.createRadialGradient(ox - or * 0.35, oy - or * 0.4, or * 0.1, ox, oy, or);
      og.addColorStop(0, c(hue + 180, 40, 88));
      og.addColorStop(0.55, c(hue + 190, sat, 52));
      og.addColorStop(1, c(hue + 200, sat * 0.7, 18));
      ctx.fillStyle = og;
      ctx.beginPath(); ctx.arc(ox, oy, or, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(ox, oy + or * 1.25, or * 0.8, or * 0.16, 0, 0, TAU);
      ctx.fill();
    }

    /* ---------- partículas ---------- */
    const pCount = Math.round(Math.min(1200, steps * 24) * (fast ? 0.25 : 1) * (d.minimal ? 0.15 : 1));
    for (let i = 0; i < pCount; i++) {
      const x = rng() * w, y = rng() * h;
      const r = rng() * (w / 900) + 0.4;
      ctx.globalAlpha = 0.08 + rng() * 0.5;
      ctx.fillStyle = rng() < 0.7 ? c(sunHue, sat, 80) : c(hue + 120, sat, 78);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ---------- destellos (fantasía) ---------- */
    if (d.sparkles && !fast) {
      ctx.save();
      ctx.shadowColor = c(sunHue, 90, 85, 0.9);
      ctx.shadowBlur = 12;
      for (let i = 0; i < 14; i++) {
        const x = rng() * w, y = rng() * h * 0.85, r = (2 + rng() * 5) * (w / 800 + 0.6);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + rng() * 0.5) + ')';
        star4(ctx, x, y, r);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ---------- manchas de acuarela ---------- */
    if (d.soft && !fast) {
      for (let i = 0; i < 7; i++) {
        const x = rng() * w, y = rng() * h, r = Math.min(w, h) * (0.1 + rng() * 0.22);
        for (let p = 0; p < 3; p++) {
          ctx.fillStyle = c(hue + palRng() * 90, sat * 0.8, L + 8, 0.05);
          ctx.beginPath();
          ctx.ellipse(x + (rng() - 0.5) * r * 0.3, y + (rng() - 0.5) * r * 0.3, r, r * (0.6 + rng() * 0.4), rng() * TAU, 0, TAU);
          ctx.fill();
        }
      }
    }

    /* ---------- semitonos (cómic) ---------- */
    if (d.halftone && !fast) {
      const gap = Math.max(7, w / 80);
      ctx.fillStyle = 'rgba(6,8,14,0.22)';
      for (let y = 0; y < h; y += gap) {
        const r = 0.8 + 2.4 * (y / h);
        for (let x = (y / gap) % 2 === 0 ? 0 : gap / 2; x < w; x += gap) {
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
      }
    }

    /* ---------- imagen de referencia (img2img simulado) ---------- */
    if (req.referenceBlob) {
      try {
        const img = await loadImage(req.referenceBlob);
        drawCover(ctx, img, 0, 0, w, h, 0.32, 'source-over');
        drawCover(ctx, img, 0, 0, w, h, 0.18, 'overlay');
        ctx.strokeStyle = c(sunHue, 90, 70, 0.5);
        ctx.lineWidth = Math.max(2, w / 240);
        ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
      } catch (e) { /* si falla la referencia, seguimos sin ella */ }
    }

    /* ---------- viñeta (según CFG) ---------- */
    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,' + Utils.clamp(cfg / 22, 0.18, 0.6) + ')');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    /* ---------- grano ---------- */
    if (!d.pixel && !fast && !d.minimal) {
      const grains = d.grain ? 1200 : 500;
      for (let i = 0; i < grains; i++) {
        ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
        ctx.fillRect(rng() * w, rng() * h, 1.2, 1.2);
      }
    }

    /* ---------- pixelado final (pixel art) ---------- */
    if (d.pixel) {
      const scale = 6;
      const sw = Math.max(16, Math.round(w / scale)), sh = Math.max(16, Math.round(h / scale));
      const small = document.createElement('canvas');
      small.width = sw; small.height = sh;
      const sctx = small.getContext('2d');
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(canvas, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
    }

    /* ---------- etiqueta discreta ---------- */
    const fs = Math.max(9, Math.round(h / 68));
    ctx.font = '600 ' + fs + 'px ' + 'system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fillText('demo local · ImageIA', w - 8, h - 8);

    return await new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('No se pudo generar la imagen local'));
        }, d.pixel ? 'image/png' : 'image/jpeg', 0.92);
      } catch (e) { reject(e); }
    });
  }

  window.DemoGenerator = { generate: generate };
})();
