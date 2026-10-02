/* ============================================================================
   ImageIA — providers.js
   Capa de proveedores de generación de imágenes.

   ┌─────────────────────────────────────────────────────────────────────────┐
   │  ZONA DE CONEXIÓN DE APIs REALES                                        │
   │                                                                         │
   │  Aquí se decide a qué servicio se envía cada petición. Hay 3 proveedores │
   │  listos:                                                                │
   │                                                                         │
   │   1. demo          → generador local (canvas), sin red. Por defecto.    │
   │   2. pollinations  → API real, gratuita y sin clave (pollinations.ai).  │
   │   3. custom        → TU API REST (Stable Diffusion WebUI / ComfyUI /    │
   │                      OpenAI-compatible / la que tú montes).             │
   │                                                                         │
   │  Para conectar una API propia:                                          │
   │    a) Configúrala desde la interfaz (⚙ Ajustes → API personalizada), o  │
   │    b) Si tu API no encaja con el formato estándar, adapta las funciones │
   │       buildCustomPayload() y parseCustomResponse() de abajo. Están      │
   │       documentadas con ejemplos (Automatic1111, OpenAI Images…).        │
   │                                                                         │
   │  Todos los proveedores reciben el mismo objeto `request`:               │
   │    {                                                                    │
   │      prompt, negative,       // textos finales (estilo ya mezclado)     │
   │      width, height,          // píxeles                                 │
   │      seed,                   // entero (o null si el proveedor no usa)  │
   │      steps, cfg,             // enteros/float (si el modelo los admite) │
   │      model,                  // id del modelo elegido                   │
   │      styleId,                // estilo visual elegido                   │
   │      referenceBlob,          // Blob de imagen de referencia (o null)   │
   │      baseSeed                // semilla madre (para "variaciones")      │
   │    }                                                                  │
   │  y deben devolver un Blob de imagen.                                    │
   └─────────────────────────────────────────────────────────────────────────┘
   ============================================================================ */
(function () {
  'use strict';

  const LS_KEY = 'imageia.settings.v1';
  const POLLINATIONS_URL = 'https://image.pollinations.ai/prompt/';
  const POLLINATIONS_MODELS_URL = 'https://image.pollinations.ai/models';

  /* --------------------------------------------------------------------------
     Ajustes persistentes (localStorage). No se envían a ningún sitio salvo
     que actives un proveedor externo.
     -------------------------------------------------------------------------- */
  const DEFAULT_SETTINGS = {
    provider: 'demo',
    custom: {
      url: '',
      auth: '',                 // p. ej.  "Bearer sk-..."  (cabecera Authorization completa)
      format: 'json',           // 'json' | 'openai' | 'binary'
      field: 'image',           // nombre del campo del JSON con el base64
      models: 'stable-diffusion',
      caps: { seed: true, steps: true, cfg: true, negative: true, reference: false }
    }
  };

  let settings = loadSettings();

  function loadSettings() {
    const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    try {
      const raw = Utils.ls.get(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.provider) base.provider = s.provider;
        if (s && s.custom) {
          Object.keys(s.custom).forEach(function (k) {
            if (k === 'caps') Object.assign(base.custom.caps, s.custom.caps || {});
            else base.custom[k] = s.custom[k];
          });
        }
      }
    } catch (e) { /* ajustes corruptos: usamos los por defecto */ }
    return base;
  }

  function saveSettings() {
    Utils.ls.set(LS_KEY, JSON.stringify(settings));
  }

  /* --------------------------------------------------------------------------
     CAPACIDADES por modelo: la interfaz activa/desactiva seed, steps, cfg,
     negative prompt e imagen de referencia según esto.
     -------------------------------------------------------------------------- */
  const DEMO_MODELS = [
    {
      id: 'demo-art', label: 'Demo Artístico (local)',
      caps: { seed: true, steps: true, cfg: true, negative: true, reference: true },
      note: 'Generador procedural local: seed, steps y CFG afectan al resultado.'
    },
    {
      id: 'demo-fast', label: 'Demo Rápido (local)',
      caps: { seed: true, steps: false, cfg: false, negative: false, reference: true },
      note: 'Versión simplificada del generador local (solo admite seed y referencia).'
    }
  ];

  function listModels() {
    if (settings.provider === 'demo') {
      return Promise.resolve(DEMO_MODELS.map(function (m) { return { id: m.id, label: m.label, caps: m.caps, note: m.note }; }));
    }

    if (settings.provider === 'pollinations') {
      /* Lista dinámica de modelos de pollinations.ai (con fallback estático). */
      return Promise.resolve()
        .then(function () {
          return fetch(POLLINATIONS_MODELS_URL)
            .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
            .then(function (list) {
              const ids = (Array.isArray(list) ? list : [])
                .map(function (m) { return typeof m === 'string' ? m : (m && m.name); })
                .filter(function (id) { return !!id; });
              return ids.length ? ids : ['flux', 'turbo'];
            });
        })
        .catch(function () { return ['flux', 'turbo']; })   /* sin red / fetch no disponible */
        .then(function (ids) {
          return ids.map(function (id) {
            return {
              id: id,
              label: id + ' (Pollinations)',
              caps: { seed: true, steps: false, cfg: false, negative: false, reference: false },
              note: 'API pública gratuita. Admite prompt, tamaño y seed (no steps/CFG/negativo).'
            };
          });
        });
    }

    /* custom: modelos definidos por el usuario */
    const caps = {
      seed: !!settings.custom.caps.seed,
      steps: !!settings.custom.caps.steps,
      cfg: !!settings.custom.caps.cfg,
      negative: !!settings.custom.caps.negative,
      reference: !!settings.custom.caps.reference
    };
    const ids = String(settings.custom.models || 'mi-modelo')
      .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return Promise.resolve(ids.map(function (id) {
      return { id: id, label: id, caps: caps, note: 'Modelo de tu API personalizada.' };
    }));
  }

  /* --------------------------------------------------------------------------
     ENTRADA PRINCIPAL: genera una imagen y devuelve un Blob.
     -------------------------------------------------------------------------- */
  function generate(request, signal) {
    if (settings.provider === 'demo') return DemoGenerator.generate(request);
    if (settings.provider === 'pollinations') return generatePollinations(request, signal);
    return generateCustom(request, signal);
  }

  /* ==========================================================================
     PROVEEDOR 2 · pollinations.ai  (API real, gratuita, sin clave)
     Docs: https://pollinations.ai  ·  GET image/prompt/{prompt}?width&height&seed&model
     ========================================================================== */
  async function generatePollinations(req, signal) {
    const params = new URLSearchParams({
      width: String(req.width),
      height: String(req.height),
      seed: String(req.seed != null ? req.seed : Utils.randomSeed()),
      model: String(req.model || 'flux'),
      nologo: 'true',
      private: 'true',
      enhance: 'false'
    });
    const url = POLLINATIONS_URL + encodeURIComponent(req.prompt) + '?' + params.toString();

    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { signal: signal });
        if (res.ok) {
          const blob = await res.blob();
          if (!blob || blob.size < 100) throw new Error('respuesta vacía');
          return blob;
        }
        lastErr = new Error('HTTP ' + res.status + ' ' + res.statusText);
        /* 429 (rate limit) o 5xx → reintentar con espera */
        if (res.status !== 429 && res.status < 500) throw lastErr;
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        lastErr = e;
      }
      await Utils.sleep(4000 * (attempt + 1));
    }
    throw new Error('Pollinations no respondió (' + (lastErr && lastErr.message ? lastErr.message : 'error') + '). Prueba de nuevo en unos segundos.');
  }

  /* ==========================================================================
     PROVEEDOR 3 · API PERSONALIZADA (REST)
     --------------------------------------------------------------------------
     Envía un POST JSON a `settings.custom.url` con este cuerpo base:
        {
          "prompt": "...", "negative_prompt": "...",
          "width": 1024, "height": 1024,
          "seed": 123, "steps": 25, "cfg_scale": 7,
          "model": "..."
        }
     (solo se incluyen los campos que tu configuración marca como admitidos)

     3 formatos de respuesta soportados sin tocar código:
       · json    → JSON con base64 en el campo configurado (p. ej. {"image": "..."}).
                   También acepta arrays ("images": ["..."]) y dataURLs.
       · openai  → formato Images de OpenAI: {"data":[{"b64_json": "..."}]}
       · binary  → la respuesta ES la imagen (image/png, image/jpeg…)

     EJEMPLOS:
       · Automatic1111 / Forge (Stable Diffusion WebUI):
           URL:      http://127.0.0.1:7860/sdapi/v1/txt2img
           Formato:  json · Campo: images
           (arranca el WebUI con --api y pon "--cors-allow-origins=*")
       · Compatible OpenAI (/v1/images/generations):
           URL:      https://api.openai.com/v1/images/generations
           Formato:  openai · Auth: Bearer sk-...
       · Cualquier endpoint propio que devuelva base64 o binario.
     ========================================================================== */
  function buildCustomPayload(req) {
    const c = settings.custom;
    const caps = c.caps || {};
    const body = { prompt: req.prompt, model: req.model };
    if (caps.negative && req.negative) body.negative_prompt = req.negative;
    body.width = req.width;
    body.height = req.height;
    if (caps.seed && req.seed != null) body.seed = req.seed;
    if (caps.steps) body.steps = req.steps;
    if (caps.cfg) body.cfg_scale = req.cfg;

    /* --- img2img: si tu API admite imagen de referencia -------------------
       La imagen llega como Blob en req.referenceBlob. Conviértela al formato
       que espere tu backend, por ejemplo:

       if (caps.reference && req.referenceBlob) {
         const b64 = await Utils.blobToBase64(req.referenceBlob);   // helper sugerido
         body.init_image = b64;                  // Automatic1111: body.init_images = [b64]
         body.denoising_strength = 0.6;          // <-- ajusta el nombre de tus campos
       }
    ----------------------------------------------------------------------- */
    return body;
  }

  async function parseCustomResponse(res) {
    const c = settings.custom;
    if (c.format === 'binary') {
      const blob = await res.blob();
      if (!blob.type || blob.type.indexOf('image/') !== 0) {
        throw new Error('La respuesta no es una imagen (recibido: ' + (blob.type || 'desconocido') + ')');
      }
      return blob;
    }

    const json = await res.json().catch(function () {
      throw new Error('La respuesta no es JSON válido');
    });

    if (c.format === 'openai') {
      /* { "data": [ { "b64_json": "..." } ] } */
      const item = json && json.data && json.data[0];
      const b64 = item && (item.b64_json || item.image);
      if (!b64) throw new Error('La respuesta no contiene data[0].b64_json');
      return Utils.b64ToBlob(b64, 'image/png');
    }

    /* formato json con campo configurable: acepta "image", "images", arrays… */
    const candidates = [c.field, 'image', 'images', 'b64_json', 'b64', 'base64', 'output', 'result'];
    for (let i = 0; i < candidates.length; i++) {
      let v = json[candidates[i]];
      if (v == null) continue;
      while (Array.isArray(v)) v = v[0];
      if (typeof v === 'string' && v.length > 32) return Utils.b64ToBlob(v, 'image/png');
      if (v && typeof v === 'object') {           /* {url: "..."} → la descargamos */
        const u = v.url || v.image_url || v.image;
        if (typeof u === 'string' && /^https?:/.test(u)) {
          const r2 = await fetch(u);
          return await r2.blob();
        }
      }
    }
    throw new Error('No se encontró ninguna imagen en la respuesta (revisa el campo configurado)');
  }

  async function generateCustom(req, signal) {
    const c = settings.custom;
    if (!c.url || !/^https?:\/\//i.test(c.url)) {
      throw new Error('Configura una URL válida en ⚙ Ajustes → API personalizada');
    }
    const headers = { 'Content-Type': 'application/json' };
    if (c.auth) headers['Authorization'] = c.auth;

    const res = await fetch(c.url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(buildCustomPayload(req)),
      signal: signal
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 140); } catch (e) { /* sin detalle */ }
      throw new Error('HTTP ' + res.status + ' de tu API' + (detail ? ': ' + detail : ''));
    }
    return await parseCustomResponse(res);
  }

  /* --------------------------------------------------------------------------
     Export
     -------------------------------------------------------------------------- */
  window.Providers = {
    get settings() { return settings; },
    setProvider: function (id) { settings.provider = id; saveSettings(); },
    updateCustom: function (custom) {
      settings.custom = custom;
      saveSettings();
    },
    listModels: listModels,
    generate: generate,
    labels: {
      demo: 'Demo local',
      pollinations: 'Pollinations.ai',
      custom: 'API personalizada'
    }
  };
})();
