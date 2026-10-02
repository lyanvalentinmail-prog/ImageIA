/* ============================================================
   ImageIA — app.js
   Controlador principal: estado, eventos, generación, galería,
   favoritos, historial y modales.
   ============================================================ */
(function () {
  'use strict';

  const { $, $$, el, uid, clamp, randomSeed, escapeHtml, formatBytes, formatDate,
    debounce, icon, hydrateIcons, toast, confirmDialog, ls,
    copyText, downloadBlob } = Utils;

  const STATE_KEY = 'imageia.state.v1';

  const RATIOS = {
    '1:1': [1, 1], '16:9': [16, 9], '9:16': [9, 16], '4:3': [4, 3], '3:4': [3, 4]
  };

  /* ============================================================
     Estado
     ============================================================ */
  const state = {
    provider: 'demo',
    models: [],
    model: null,
    style: 'ninguno',
    ratio: '1:1',
    quality: 1024,
    qty: 1,
    seedRandom: true,
    seed: randomSeed(),
    steps: 25,
    cfg: 7,
    reference: null,        /* {blob, url, name, size} */
    generating: false,
    abortCtrl: null,
    session: [],            /* últimos resultados (lote actual) */
    gallery: [],            /* historial completo (desc de Store) */
    urls: {},               /* id -> objectURL */
    modalRec: null
  };

  const els = {};

  function cacheEls() {
    const ids = [
      'tab-create', 'tab-gallery', 'view-create', 'view-gallery',
      'input-prompt', 'btn-random-prompt', 'btn-enhance-prompt', 'btn-clear-prompt',
      'input-negative', 'negative-field', 'negative-hint',
      'ref-dropzone', 'ref-input', 'ref-preview', 'ref-img', 'ref-name', 'ref-size',
      'btn-remove-ref', 'ref-hint',
      'style-chips', 'select-model', 'model-caps',
      'ratio-group', 'select-quality', 'qty-group', 'dims-label',
      'input-seed', 'btn-seed-dice', 'btn-seed-lock', 'seed-hint',
      'steps-block', 'slider-steps', 'steps-value', 'steps-hint',
      'cfg-block', 'slider-cfg', 'cfg-value', 'cfg-hint',
      'btn-generate', 'btn-cancel', 'gen-status',
      'provider-name', 'btn-open-settings', 'btn-config-provider',
      'results-grid', 'results-empty', 'results-count',
      'gallery-search', 'gallery-filter', 'gallery-count', 'btn-clear-gallery',
      'gallery-grid', 'gallery-empty',
      'modal-image', 'im-img', 'im-prompt', 'im-negative-box', 'im-negative', 'im-meta',
      'im-download', 'im-favorite', 'im-copy', 'im-variations', 'im-regenerate',
      'im-remix', 'im-reference', 'im-copy-settings', 'im-delete',
      'modal-settings', 'select-provider', 'fs-demo', 'fs-pollinations', 'fs-custom',
      'input-api-url', 'input-api-auth', 'select-api-format', 'input-json-field',
      'input-models', 'chk-seed', 'chk-steps', 'chk-cfg', 'chk-negative', 'chk-reference',
      'btn-save-settings',
      'mob-generate', 'mob-cancel'
    ];
    ids.forEach(function (id) { els[id] = document.getElementById(id); });
  }

  /* ============================================================
     Init
     ============================================================ */
  async function init() {
    cacheEls();
    hydrateIcons();
    bindEvents();
    renderStyleChips();
    restoreState();
    await applyProvider(Providers.settings.provider, { silent: true });
    syncModelSelect();
    updateCapsUI();
    updateDims();
    updateSeedUI();
    updateRefUI();
    updateProviderLine();
    renderSession();
    switchView('create');

    try {
      await Store.init();
      if (!Store.isPersistent) {
        console.warn('[ImageIA] IndexedDB no disponible: la galería no persistirá entre sesiones.');
      }
      await refreshGallery();
    } catch (e) {
      console.warn('[ImageIA] No se pudo abrir el almacenamiento local', e);
    }
  }

  /* ============================================================
     Eventos
     ============================================================ */
  function bindEvents() {
    /* Pestañas */
    els['tab-create'].addEventListener('click', function () { switchView('create'); });
    els['tab-gallery'].addEventListener('click', function () { switchView('gallery'); });

    /* Prompt */
    els['btn-random-prompt'].addEventListener('click', function () {
      els['input-prompt'].value = PromptKit.randomPrompt();
      persistState();
      toast('Prompt aleatorio generado ✨', 'info');
    });
    els['btn-enhance-prompt'].addEventListener('click', function () {
      const res = PromptKit.enhancePrompt(els['input-prompt'].value, state.style);
      els['input-prompt'].value = res.text;
      persistState();
      if (res.added.length) toast('Prompt mejorado · +' + res.added.length + ' modificadores', 'ok');
      else toast('El prompt ya incluía los modificadores sugeridos', 'info');
    });
    els['btn-clear-prompt'].addEventListener('click', function () {
      els['input-prompt'].value = '';
      els['input-prompt'].focus();
      persistState();
    });
    els['input-prompt'].addEventListener('input', debounce(persistState, 400));
    els['input-negative'].addEventListener('input', debounce(persistState, 400));

    /* Referencia */
    els['ref-dropzone'].addEventListener('click', function () { els['ref-input'].click(); });
    els['ref-dropzone'].addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els['ref-input'].click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      els['ref-dropzone'].addEventListener(ev, function (e) { e.preventDefault(); els['ref-dropzone'].classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      els['ref-dropzone'].addEventListener(ev, function (e) { e.preventDefault(); els['ref-dropzone'].classList.remove('dragover'); });
    });
    els['ref-dropzone'].addEventListener('drop', function (e) {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setReference(f);
    });
    els['ref-input'].addEventListener('change', function () {
      if (this.files && this.files[0]) setReference(this.files[0]);
      this.value = '';
    });
    els['btn-remove-ref'].addEventListener('click', function () { clearReference(); });

    /* Estilos */
    els['style-chips'].addEventListener('click', function (e) {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.style = chip.getAttribute('data-style');
      $$('.chip', els['style-chips']).forEach(function (c) { c.classList.toggle('active', c === chip); });
      persistState();
    });

    /* Modelo */
    els['select-model'].addEventListener('change', function () {
      state.model = findModel(this.value) || state.models[0];
      updateCapsUI();
      persistState();
    });

    /* Ratio / calidad / cantidad (delegación en grupos segmentados) */
    bindSeg(els['ratio-group'], function (val) { state.ratio = val; updateDims(); persistState(); });
    bindSeg(els['qty-group'], function (val) { state.qty = +val || 1; persistState(); });
    els['select-quality'].addEventListener('change', function () {
      state.quality = +this.value || 1024;
      updateDims();
      persistState();
    });

    /* Seed */
    els['input-seed'].addEventListener('input', function () {
      const v = parseInt(this.value, 10);
      if (!isNaN(v)) { state.seed = v >>> 0; persistState(); }
    });
    els['btn-seed-dice'].addEventListener('click', function () {
      state.seed = randomSeed();
      state.seedRandom = false;
      updateSeedUI();
      persistState();
      toast('Semilla fija: ' + state.seed, 'info', 1800);
    });
    els['btn-seed-lock'].addEventListener('click', function () {
      state.seedRandom = !state.seedRandom;
      if (!state.seedRandom && state.seed == null) state.seed = randomSeed();
      updateSeedUI();
      persistState();
    });

    /* Steps / CFG */
    els['slider-steps'].addEventListener('input', function () {
      state.steps = +this.value;
      els['steps-value'].textContent = this.value;
      persistState();
    });
    els['slider-cfg'].addEventListener('input', function () {
      state.cfg = +this.value;
      els['cfg-value'].textContent = this.value;
      persistState();
    });

    /* Generar / cancelar */
    els['btn-generate'].addEventListener('click', function () { generate({ mode: 'new' }); });
    els['mob-generate'].addEventListener('click', function () { generate({ mode: 'new' }); });
    els['btn-cancel'].addEventListener('click', cancelGeneration);
    els['mob-cancel'].addEventListener('click', cancelGeneration);

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (state.generating) return;
        const openModal = $$('.modal:not(.hidden)').length > 0;
        if (!openModal) generate({ mode: 'new' });
      }
      if (e.key === 'Escape') closeTopModal();
    });

    /* Galería */
    els['gallery-search'].addEventListener('input', debounce(renderGallery, 160));
    els['gallery-filter'].addEventListener('change', renderGallery);
    els['btn-clear-gallery'].addEventListener('click', clearGallery);

    /* Acciones delegadas en tarjetas (resultados y galería) */
    [els['results-grid'], els['gallery-grid']].forEach(function (grid) {
      grid.addEventListener('click', onCardAction);
    });

    /* Modal imagen */
    bindModal(els['modal-image']);
    els['im-meta'].addEventListener('click', function (e) {
      const b = e.target.closest('[data-seed]');
      if (!b) return;
      const v = parseInt(b.getAttribute('data-seed'), 10);
      if (!isNaN(v)) {
        state.seed = v >>> 0;
        state.seedRandom = false;
        updateSeedUI();
        persistState();
        toast('Semilla fijada: ' + state.seed, 'info', 1800);
      }
    });
    els['im-download'].addEventListener('click', function () { if (state.modalRec) downloadRecord(state.modalRec); });
    els['im-favorite'].addEventListener('click', function () { if (state.modalRec) toggleFavorite(state.modalRec); });
    els['im-copy'].addEventListener('click', function () {
      if (!state.modalRec) return;
      copyText(state.modalRec.promptFull || state.modalRec.prompt).then(function (ok) {
        toast(ok ? 'Prompt copiado al portapapeles' : 'No se pudo copiar', ok ? 'ok' : 'err');
      });
    });
    els['im-variations'].addEventListener('click', function () {
      if (state.modalRec) { closeModal(els['modal-image']); generate({ mode: 'variation', from: state.modalRec }); }
    });
    els['im-regenerate'].addEventListener('click', function () {
      if (state.modalRec) { closeModal(els['modal-image']); generate({ mode: 'regen', from: state.modalRec }); }
    });
    els['im-remix'].addEventListener('click', function () {
      if (state.modalRec) { remixRecord(state.modalRec); }
    });
    els['im-reference'].addEventListener('click', function () {
      if (!state.modalRec) return;
      setReferenceFromRecord(state.modalRec);
    });
    els['im-copy-settings'].addEventListener('click', function () {
      if (!state.modalRec) return;
      const r = state.modalRec;
      const payload = {
        prompt: r.promptFull || r.prompt,
        negative_prompt: r.negativeFull || '',
        model: r.model,
        width: r.width,
        height: r.height,
        seed: r.seed,
        steps: r.steps,
        cfg: r.cfg,
        estilo: r.styleLabel,
        proveedor: r.providerLabel
      };
      copyText(JSON.stringify(payload, null, 2)).then(function (ok) {
        toast(ok ? 'Ajustes copiados como JSON' : 'No se pudo copiar', ok ? 'ok' : 'err');
      });
    });
    els['im-delete'].addEventListener('click', function () {
      if (state.modalRec) deleteRecord(state.modalRec);
    });

    /* Modal ajustes */
    bindModal(els['modal-settings']);
    els['btn-open-settings'].addEventListener('click', openSettings);
    els['btn-config-provider'].addEventListener('click', openSettings);
    els['select-provider'].addEventListener('change', function () {
      const v = this.value;
      els['fs-demo'].classList.toggle('hidden', v !== 'demo');
      els['fs-pollinations'].classList.toggle('hidden', v !== 'pollinations');
      els['fs-custom'].classList.toggle('hidden', v !== 'custom');
    });
    els['btn-save-settings'].addEventListener('click', saveSettings);
  }

  function bindSeg(container, onChange) {
    container.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn || !btn.dataset.value) return;
      $$('button', container).forEach(function (b) { b.classList.toggle('active', b === btn); });
      onChange(btn.dataset.value);
    });
  }

  function bindModal(modal) {
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal(modal);
    });
  }

  function closeModal(modal) { modal.classList.add('hidden'); }

  function closeTopModal() {
    const open = $$('.modal:not(.hidden)');
    if (open.length) closeModal(open[open.length - 1]);
  }

  /* ============================================================
     Vistas
     ============================================================ */
  function switchView(view) {
    const isCreate = view === 'create';
    els['tab-create'].setAttribute('aria-selected', String(isCreate));
    els['tab-gallery'].setAttribute('aria-selected', String(!isCreate));
    els['view-create'].classList.toggle('hidden', !isCreate);
    els['view-gallery'].classList.toggle('hidden', isCreate);
    document.body.classList.toggle('view-create-active', isCreate);
    if (!isCreate) renderGallery();
  }

  /* ============================================================
     Proveedor / modelos / capacidades
     ============================================================ */
  async function applyProvider(providerId, opts) {
    state.provider = providerId;
    let models = [];
    try {
      models = await Providers.listModels();
    } catch (e) {
      models = [];
    }
    if (!models.length) {
      models = [{ id: 'demo-art', label: 'Demo Artístico (local)', caps: { seed: true, steps: true, cfg: true, negative: true, reference: true }, note: '' }];
    }
    state.models = models;
    const prev = findModel(state.model && state.model.id)
      || findModel(state._restoredModel)
      || findModel(opts && opts.modelId)
      || models[0];
    state.model = prev;
    updateProviderLine();
  }

  function findModel(id) {
    if (!id) return null;
    for (let i = 0; i < state.models.length; i++) if (state.models[i].id === id) return state.models[i];
    return null;
  }

  function syncModelSelect() {
    const sel = els['select-model'];
    sel.innerHTML = '';
    state.models.forEach(function (m) {
      const o = el('option', { value: m.id });
      o.textContent = m.label;
      sel.appendChild(o);
    });
    if (state.model) sel.value = state.model.id;
  }

  function capsOf() {
    return (state.model && state.model.caps) || { seed: true, steps: true, cfg: true, negative: true, reference: true };
  }

  function updateCapsUI() {
    const caps = capsOf();
    /* modelo: línea de capacidades */
    const bits = [
      caps.seed ? '✔ seed' : '✘ seed',
      caps.steps ? '✔ steps' : '✘ steps',
      caps.cfg ? '✔ CFG' : '✘ CFG',
      caps.negative ? '✔ negativo' : '✘ negativo',
      caps.reference ? '✔ referencia' : '✘ referencia'
    ];
    els['model-caps'].textContent = bits.join(' · ');
    els['model-caps'].title = (state.model && state.model.note) || '';

    /* steps */
    const stepsOk = !!caps.steps;
    els['slider-steps'].disabled = !stepsOk;
    els['steps-block'].classList.toggle('unsupported', !stepsOk);
    els['steps-hint'].textContent = stepsOk ? 'Más steps = más detalle (y más lento).' : 'No compatible con este modelo.';
    els['steps-hint'].classList.toggle('warn', !stepsOk);

    /* cfg */
    const cfgOk = !!caps.cfg;
    els['slider-cfg'].disabled = !cfgOk;
    els['cfg-block'].classList.toggle('unsupported', !cfgOk);
    els['cfg-hint'].textContent = cfgOk ? 'Cuánto se sigue el prompt (mayor = más estricto).' : 'No compatible con este modelo.';
    els['cfg-hint'].classList.toggle('warn', !cfgOk);

    /* negativo */
    const negOk = !!caps.negative;
    els['input-negative'].disabled = !negOk;
    els['negative-field'].classList.toggle('unsupported', !negOk);
    els['negative-hint'].textContent = negOk ? '' : 'El modelo actual no admite prompt negativo.';
    els['negative-hint'].classList.toggle('warn', !negOk);

    /* seed */
    els['input-seed'].disabled = state.seedRandom || !caps.seed;
    els['btn-seed-dice'].disabled = !caps.seed;
    els['btn-seed-lock'].disabled = !caps.seed;
    els['seed-hint'].textContent = !caps.seed
      ? 'Este modelo no admite seed.'
      : 'La misma semilla reproduce la misma imagen.';
    els['seed-hint'].classList.toggle('warn', !caps.seed);

    updateRefUI();
  }

  function updateProviderLine() {
    els['provider-name'].textContent = Providers.labels[state.provider] || state.provider;
  }

  /* ============================================================
     Formato / dimensiones
     ============================================================ */
  function computeDims() {
    const r = RATIOS[state.ratio] || RATIOS['1:1'];
    const base = state.quality;
    let w, h;
    if (r[0] >= r[1]) { w = base; h = (base * r[1]) / r[0]; }
    else { h = base; w = (base * r[0]) / r[1]; }
    const round8 = function (v) { return Math.max(64, Math.round(v / 8) * 8); };
    return { w: round8(w), h: round8(h) };
  }

  function updateDims() {
    const d = computeDims();
    els['dims-label'].textContent = d.w + ' × ' + d.h + ' px';
  }

  /* ============================================================
     Seed UI
     ============================================================ */
  function updateSeedUI() {
    const caps = capsOf();
    const fixed = !state.seedRandom;
    els['input-seed'].value = fixed ? state.seed : '';
    els['input-seed'].disabled = !fixed || !caps.seed;
    els['input-seed'].placeholder = fixed ? '' : 'aleatoria';
    els['btn-seed-lock'].innerHTML = icon(fixed ? 'lock' : 'unlock');
    els['btn-seed-lock'].classList.toggle('active', fixed);
    els['btn-seed-lock'].title = fixed ? 'Semilla fija (clic para aleatorizar)' : 'Semilla aleatoria (clic para fijar)';
  }

  /* ============================================================
     Referencia
     ============================================================ */
  function setReference(file) {
    if (!file || !/^image\//.test(file.type)) {
      toast('El archivo no es una imagen', 'err');
      return;
    }
    clearReference();
    const url = URL.createObjectURL(file);
    state.reference = { blob: file, url: url, name: file.name || 'referencia', size: file.size };
    els['ref-img'].src = url;
    els['ref-name'].textContent = file.name || 'Imagen de referencia';
    els['ref-size'].textContent = formatBytes(file.size);
    els['ref-preview'].classList.remove('hidden');
    els['ref-dropzone'].classList.add('hidden');
    updateRefUI();
    toast('Imagen de referencia añadida', 'ok');
  }

  function setReferenceFromRecord(rec) {
    const caps = capsOf();
    if (!caps.reference) {
      toast('El modelo actual no admite imagen de referencia', 'err');
      return;
    }
    const name = 'imageia-' + rec.id + (rec.blob.type === 'image/jpeg' ? '.jpg' : '.png');
    try {
      const file = new File([rec.blob], name, { type: rec.blob.type || 'image/png' });
      setReference(file);
      closeModal(els['modal-image']);
      switchView('create');
    } catch (e) {
      /* File no soportado: usamos el blob directamente */
      clearReference();
      const url = URL.createObjectURL(rec.blob);
      state.reference = { blob: rec.blob, url: url, name: name, size: rec.blob.size };
      els['ref-img'].src = url;
      els['ref-name'].textContent = name;
      els['ref-size'].textContent = formatBytes(rec.blob.size);
      els['ref-preview'].classList.remove('hidden');
      els['ref-dropzone'].classList.add('hidden');
      closeModal(els['modal-image']);
      switchView('create');
      toast('Imagen de referencia añadida', 'ok');
    }
  }

  function clearReference() {
    if (state.reference && state.reference.url) {
      try { URL.revokeObjectURL(state.reference.url); } catch (e) { /* noop */ }
    }
    state.reference = null;
    els['ref-preview'].classList.add('hidden');
    els['ref-dropzone'].classList.remove('hidden');
    updateRefUI();
  }

  function updateRefUI() {
    const caps = capsOf();
    const ok = !!caps.reference;
    els['ref-dropzone'].classList.toggle('disabled', !ok);
    els['ref-dropzone'].setAttribute('aria-disabled', String(!ok));
    if (!ok) {
      els['ref-hint'].textContent = 'El modelo actual no admite imagen de referencia.';
      els['ref-hint'].classList.add('warn');
      els['ref-dropzone'].removeEventListener && null;
    } else if (state.reference) {
      els['ref-hint'].textContent = 'Se usará como base de la generación (img2img).';
      els['ref-hint'].classList.remove('warn');
    } else {
      els['ref-hint'].textContent = 'Opcional: se usará como base si el modelo lo admite.';
      els['ref-hint'].classList.remove('warn');
    }
  }

  /* ============================================================
     Estilos (chips)
     ============================================================ */
  function renderStyleChips() {
    els['style-chips'].innerHTML = '';
    PromptKit.STYLES.forEach(function (s) {
      const chip = el('button', {
        class: 'chip' + (s.id === state.style ? ' active' : ''),
        type: 'button',
        'data-style': s.id,
        title: s.positive ? ('Añade: ' + s.positive) : 'Sin modificadores de estilo'
      });
      chip.innerHTML = '<span class="chip-emoji">' + s.emoji + '</span>' + escapeHtml(s.label);
      els['style-chips'].appendChild(chip);
    });
  }

  /* ============================================================
     Plan de generación
     ============================================================ */
  function buildPlan(mode, from) {
    const model = from ? (findModel(from.model) || state.model || state.models[0]) : state.model;
    if (!model) throw new Error('No hay modelos disponibles. Revisa ⚙ Ajustes.');
    const caps = model.caps;

    let userPrompt, userNegative, fullPrompt, fullNeg, width, height, steps, cfg, styleId, ratio;

    if (from) {
      userPrompt = from.prompt;
      userNegative = from.negative || '';
      styleId = from.styleId || 'ninguno';
      fullPrompt = from.promptFull || from.prompt;
      fullNeg = from.negativeFull || '';
      width = from.width;
      height = from.height;
      steps = from.steps || 25;
      cfg = from.cfg || 7;
      ratio = from.ratio || ratioOfDims(width, height);
    } else {
      userPrompt = els['input-prompt'].value.trim();
      if (!userPrompt) throw new Error('Escribe un prompt para generar una imagen');
      userNegative = els['input-negative'].value.trim();
      styleId = state.style;
      const style = PromptKit.getStyle(styleId);
      fullPrompt = userPrompt + (style.positive ? ', ' + style.positive : '');
      fullNeg = [userNegative, style.negative].filter(Boolean).join(', ');
      const d = computeDims();
      width = d.w; height = d.h;
      steps = +state.steps || 25;
      cfg = +state.cfg || 7;
      ratio = state.ratio;
    }

    /* aplicar capacidades del modelo */
    if (!caps.negative) fullNeg = '';
    if (!caps.steps) steps = 25;
    if (!caps.cfg) cfg = 7;

    /* imagen de referencia */
    let referenceBlob = null;
    if (mode === 'variation' && from && caps.reference) referenceBlob = from.blob;
    else if (state.reference && caps.reference) referenceBlob = state.reference.blob;

    const baseSeed = mode === 'variation' && from ? from.seed : null;

    return {
      userPrompt: userPrompt, userNegative: userNegative,
      fullPrompt: fullPrompt, fullNeg: fullNeg,
      width: width, height: height, steps: steps, cfg: cfg,
      styleId: styleId, ratio: ratio,
      model: model, referenceBlob: referenceBlob, baseSeed: baseSeed
    };
  }

  function ratioOfDims(w, h) {
    let best = '1:1', bestErr = Infinity;
    Object.keys(RATIOS).forEach(function (k) {
      const r = RATIOS[k];
      const err = Math.abs(w / h - r[0] / r[1]);
      if (err < bestErr) { bestErr = err; best = k; }
    });
    return best;
  }

  /* ============================================================
     Generación
     ============================================================ */
  async function generate(opts) {
    opts = opts || {};
    const mode = opts.mode || 'new';
    const from = opts.from || null;

    if (state.generating) { toast('Ya hay una generación en curso', 'info'); return; }

    let plan;
    try { plan = buildPlan(mode, from); }
    catch (e) { toast(e.message, 'err'); return; }

    const count = clamp(state.qty || 1, 1, 4);
    const seeds = [];
    for (let i = 0; i < count; i++) {
      if (mode === 'variation') seeds.push((((from && from.seed) || 0) + i + 1) >>> 0);
      else if (mode === 'regen') seeds.push((((from && from.seed) || 0) + 101 + i) >>> 0);
      else seeds.push(state.seedRandom ? randomSeed() : ((state.seed + i) >>> 0));
    }

    /* preparar UI */
    switchView('create');
    state.generating = true;
    state.abortCtrl = new AbortController();
    updateGenUI(true, 'Preparando…');
    renderSessionSkeletons(count, plan.width / plan.height);

    const parentType = mode === 'variation' ? 'variación' : (mode === 'regen' ? 'regeneración' : null);
    const parentId = from ? from.id : null;
    const skels = $$('.skeleton', els['results-grid']);
    let done = 0;

    for (let i = 0; i < count; i++) {
      if (state.abortCtrl.signal.aborted) break;
      const skel = skels[i];
      if (skel) skel.querySelector('.skel-label').textContent = 'Generando ' + (i + 1) + ' de ' + count + '…';
      updateGenUI(true, 'Generando ' + (i + 1) + ' de ' + count + '…');

      try {
        const blob = await Providers.generate({
          prompt: plan.fullPrompt,
          negative: plan.fullNeg,
          width: plan.width,
          height: plan.height,
          seed: seeds[i],
          steps: plan.steps,
          cfg: plan.cfg,
          model: plan.model.id,
          styleId: plan.styleId,
          referenceBlob: plan.referenceBlob,
          baseSeed: plan.baseSeed
        }, state.abortCtrl.signal);

        const rec = {
          id: uid(),
          blob: blob,
          prompt: plan.userPrompt,
          promptFull: plan.fullPrompt,
          negative: plan.userNegative,
          negativeFull: plan.fullNeg,
          provider: state.provider,
          providerLabel: Providers.labels[state.provider] || state.provider,
          model: plan.model.id,
          modelLabel: plan.model.label,
          styleId: plan.styleId,
          styleLabel: PromptKit.getStyle(plan.styleId).label,
          width: plan.width,
          height: plan.height,
          ratio: plan.ratio,
          seed: seeds[i],
          steps: plan.steps,
          cfg: plan.cfg,
          createdAt: Date.now(),
          favorite: false,
          parentType: parentType,
          parentId: parentId,
          hasRef: !!plan.referenceBlob
        };

        await Store.add(rec);
        state.gallery.unshift(rec);
        state.session.push(rec);

        if (skel) {
          const card = buildCard(rec, 'result');
          skel.replaceWith(card);
        }
        done++;
      } catch (e) {
        if (e && e.name === 'AbortError') break;
        console.error('[ImageIA] error generando', e);
        if (skel) {
          skel.classList.add('failed');
          skel.querySelector('.skel-info').innerHTML =
            icon('alert') + '<span>Error: ' + escapeHtml((e && e.message) || 'desconocido') + '</span>';
        }
        toast('Error al generar la imagen ' + (i + 1) + ': ' + ((e && e.message) || 'desconocido'), 'err', 5200);
      }
    }

    /* limpiar skeletons pendientes */
    $$('.skeleton', els['results-grid']).forEach(function (s) {
      if (!s.classList.contains('failed')) s.remove();
    });

    const wasCancelled = !!state._cancelled;
    state.generating = false;
    state.abortCtrl = null;
    updateSessionCount();
    if (done > 0 && !wasCancelled) {
      toast(done + (done === 1 ? ' imagen generada' : ' imágenes generadas'), 'ok');
    }
    state._cancelled = false;
    updateGenUI(false, done > 0 ? done + (done === 1 ? ' imagen · ' : ' imágenes · ') + PromptKit.getStyle(plan.styleId).label : 'Sin resultados');
    if (!$('#view-gallery').classList.contains('hidden')) renderGallery();
    persistState();
  }

  function cancelGeneration() {
    if (!state.generating || !state.abortCtrl) return;
    state.abortCtrl.abort();
    state._cancelled = true;
    toast('Generación cancelada', 'info');
  }

  function updateGenUI(generating, statusText) {
    [els['btn-generate'], els['mob-generate']].forEach(function (b) {
      b.disabled = generating;
      b.innerHTML = generating ? '<span class="spinner"></span> Generando…' : icon('zap') + '<span>Generar</span>';
    });
    els['btn-cancel'].classList.toggle('hidden', !generating);
    els['mob-cancel'].classList.toggle('hidden', !generating);
    els['gen-status'].innerHTML = generating
      ? '<span class="spinner"></span><span>' + escapeHtml(statusText || '') + '</span>'
      : '<span>' + escapeHtml(statusText || '') + '</span>';
  }

  /* ============================================================
     Tarjetas
     ============================================================ */
  function urlFor(rec) {
    if (!state.urls[rec.id]) state.urls[rec.id] = URL.createObjectURL(rec.blob);
    return state.urls[rec.id];
  }

  function releaseUrl(id) {
    if (state.urls[id]) {
      try { URL.revokeObjectURL(state.urls[id]); } catch (e) { /* noop */ }
      delete state.urls[id];
    }
  }

  function buildCard(rec, ctx) {
    const card = el('article', {
      class: 'card',
      'data-id': rec.id,
      tabindex: '0'
    });
    card.style.setProperty('--ar', rec.width + ' / ' + rec.height);

    const badge = rec.parentType
      ? '<span class="badge-type">' + escapeHtml(rec.parentType) + '</span>'
      : '';

    const media = el('div', { class: 'card-media', title: 'Ver detalles' });
    media.innerHTML = '<img src="' + urlFor(rec) + '" alt="' + escapeHtml(rec.prompt || 'imagen generada') +
      '" loading="lazy" decoding="async">' + badge;
    media.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;   /* los botones tienen su propia acción */
      openImageModal(rec);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target === card) openImageModal(rec);
    });

    const fav = el('button', {
      class: 'card-fav' + (rec.favorite ? ' active' : ''),
      title: rec.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos',
      'aria-label': 'Favorito',
      'data-act': 'fav'
    });
    fav.innerHTML = icon('heart');
    media.appendChild(fav);

    const bar = el('div', { class: 'card-bar' });
    const actions = ctx === 'gallery'
      ? [['download', 'Descargar'], ['expand', 'Ver detalles']]
      : [['download', 'Descargar'], ['copy', 'Copiar prompt'], ['grid', 'Variaciones'], ['refresh', 'Regenerar'], ['shuffle', 'Remix'], ['expand', 'Ver detalles']];
    actions.forEach(function (a) {
      const b = el('button', {
        class: 'icon-btn', 'data-act': a[0], title: a[1], 'aria-label': a[1]
      });
      b.innerHTML = icon(a[0]);
      bar.appendChild(b);
    });
    if (ctx === 'gallery') {
      const del = el('button', { class: 'icon-btn danger', 'data-act': 'delete', title: 'Eliminar', 'aria-label': 'Eliminar' });
      del.innerHTML = icon('trash');
      bar.appendChild(del);
    }
    media.appendChild(bar);
    card.appendChild(media);

    const foot = el('div', { class: 'card-foot' });
    foot.innerHTML = '<span class="cprompt">' + escapeHtml(rec.prompt || rec.promptFull || '') + '</span>' +
      '<span class="cseed" title="Semilla">seed ' + rec.seed + '</span>';
    card.appendChild(foot);

    return card;
  }

  function onCardAction(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    if (!card) return;
    const rec = findRecord(card.getAttribute('data-id'));
    if (!rec) return;
    const act = btn.getAttribute('data-act');

    if (act === 'fav') toggleFavorite(rec);
    else if (act === 'download') downloadRecord(rec);
    else if (act === 'copy') {
      copyText(rec.promptFull || rec.prompt).then(function (ok) {
        toast(ok ? 'Prompt copiado al portapapeles' : 'No se pudo copiar', ok ? 'ok' : 'err');
      });
    }
    else if (act === 'grid') generate({ mode: 'variation', from: rec });
    else if (act === 'refresh') generate({ mode: 'regen', from: rec });
    else if (act === 'shuffle') remixRecord(rec);
    else if (act === 'expand') openImageModal(rec);
    else if (act === 'delete') deleteRecord(rec);
  }

  function findRecord(id) {
    for (let i = 0; i < state.gallery.length; i++) if (state.gallery[i].id === id) return state.gallery[i];
    return null;
  }

  /* ============================================================
     Acciones sobre registros
     ============================================================ */
  async function toggleFavorite(rec) {
    rec.favorite = !rec.favorite;
    try { await Store.put(rec); } catch (e) { console.warn(e); }
    /* actualizar UI en todas las tarjetas con ese id */
    $$('[data-id="' + rec.id + '"] .card-fav').forEach(function (b) {
      b.classList.toggle('active', rec.favorite);
    });
    if (state.modalRec && state.modalRec.id === rec.id) syncFavoriteBtn();
    if (!$('#view-gallery').classList.contains('hidden') && els['gallery-filter'].value === 'fav') renderGallery();
    toast(rec.favorite ? 'Añadida a favoritos ❤' : 'Quitada de favoritos', 'info', 1600);
  }

  function downloadRecord(rec) {
    const ext = (rec.blob && rec.blob.type === 'image/jpeg') ? 'jpg' : (rec.blob && rec.blob.type === 'image/webp' ? 'webp' : 'png');
    downloadBlob(rec.blob, 'imageia-' + rec.styleId + '-' + rec.seed + '.' + ext);
    toast('Descargando imagen…', 'info', 1600);
  }

  async function deleteRecord(rec) {
    const ok = await confirmDialog('¿Eliminar esta imagen de la galería? Esta acción no se puede deshacer.');
    if (!ok) return;
    try { await Store.remove(rec.id); } catch (e) { console.warn(e); }
    state.gallery = state.gallery.filter(function (r) { return r.id !== rec.id; });
    state.session = state.session.filter(function (r) { return r.id !== rec.id; });
    releaseUrl(rec.id);
    $$('[data-id="' + rec.id + '"]').forEach(function (n) { n.remove(); });
    if (state.modalRec && state.modalRec.id === rec.id) closeModal(els['modal-image']);
    updateSessionCount();
    renderGallery();
    toast('Imagen eliminada', 'info', 1600);
  }

  async function clearGallery() {
    if (!state.gallery.length) { toast('La galería ya está vacía', 'info'); return; }
    const ok = await confirmDialog('¿Vaciar toda la galería e historial? Se borrarán también tus favoritos.', { okText: 'Vaciar todo' });
    if (!ok) return;
    try { await Store.clear(); } catch (e) { console.warn(e); }
    Object.keys(state.urls).forEach(releaseUrl);
    state.gallery = [];
    state.session = [];
    renderSession();
    renderGallery();
    toast('Galería vaciada', 'ok');
  }

  /* ============================================================
     Remix: cargar los ajustes de una imagen en el panel
     ============================================================ */
  function remixRecord(rec) {
    els['input-prompt'].value = rec.prompt || rec.promptFull || '';
    els['input-negative'].value = rec.negative || '';
    state.style = rec.styleId || 'ninguno';
    renderStyleChips();

    if (RATIOS[rec.ratio]) state.ratio = rec.ratio;
    else state.ratio = ratioOfDims(rec.width, rec.height);
    syncSeg(els['ratio-group'], state.ratio);

    state.quality = rec.width >= rec.height ? nearestQuality(rec.width) : nearestQuality(rec.height);
    els['select-quality'].value = String(state.quality);
    updateDims();

    if (rec.steps) { state.steps = clamp(rec.steps, 1, 50); els['slider-steps'].value = state.steps; els['steps-value'].textContent = state.steps; }
    if (rec.cfg) { state.cfg = clamp(rec.cfg, 1, 20); els['slider-cfg'].value = state.cfg; els['cfg-value'].textContent = state.cfg; }

    const m = findModel(rec.model);
    if (m) { state.model = m; els['select-model'].value = m.id; }

    state.seed = rec.seed != null ? rec.seed : randomSeed();
    state.seedRandom = false;
    updateCapsUI();
    updateSeedUI();
    persistState();

    /* en remix usamos la propia imagen como referencia, si el modelo lo admite */
    if (capsOf().reference && rec.blob) {
      setReferenceFromRecord(rec);
      toast('Remix listo: ajusta el prompt y genera', 'ok');
    } else {
      closeModal(els['modal-image']);
      switchView('create');
      toast('Remix listo: ajusta el prompt y genera', 'ok');
    }
    els['input-prompt'].focus();
  }

  function nearestQuality(px) {
    const opts = [512, 768, 1024];
    let best = 1024, err = Infinity;
    opts.forEach(function (q) { const e = Math.abs(px - q); if (e < err) { err = e; best = q; } });
    return best;
  }

  function syncSeg(container, value) {
    $$('button', container).forEach(function (b) {
      b.classList.toggle('active', b.dataset.value === String(value));
    });
  }

  /* ============================================================
     Render: sesión de resultados
     ============================================================ */
  function renderSessionSkeletons(count, ar) {
    state.session = [];
    els['results-grid'].innerHTML = '';
    for (let i = 0; i < count; i++) {
      const s = el('div', { class: 'skeleton' });
      s.style.setProperty('--ar', String(ar));
      s.innerHTML = '<div class="skel-shine"></div><div class="skel-info"><span class="spinner"></span><span class="skel-label">En cola…</span></div>';
      els['results-grid'].appendChild(s);
    }
    els['results-empty'].classList.add('hidden');
    updateSessionCount();
  }

  function renderSession() {
    els['results-grid'].innerHTML = '';
    state.session.slice().reverse().forEach(function (rec) {
      els['results-grid'].appendChild(buildCard(rec, 'result'));
    });
    els['results-empty'].classList.toggle('hidden', state.session.length > 0);
    updateSessionCount();
  }

  function updateSessionCount() {
    els['results-count'].textContent = state.session.length
      ? state.session.length + (state.session.length === 1 ? ' imagen' : ' imágenes')
      : '';
  }

  /* ============================================================
     Render: galería / historial
     ============================================================ */
  async function refreshGallery() {
    try {
      state.gallery = await Store.list();
    } catch (e) {
      console.warn('[ImageIA] no se pudo leer la galería', e);
    }
    renderGallery();
  }

  function renderGallery() {
    const filter = els['gallery-filter'].value;
    const q = els['gallery-search'].value.trim().toLowerCase();
    let items = state.gallery;
    if (filter === 'fav') items = items.filter(function (r) { return r.favorite; });
    if (q) {
      items = items.filter(function (r) {
        return ((r.prompt || '') + ' ' + (r.promptFull || '')).toLowerCase().indexOf(q) !== -1;
      });
    }

    els['gallery-grid'].innerHTML = '';
    items.forEach(function (rec) {
      els['gallery-grid'].appendChild(buildCard(rec, 'gallery'));
    });

    const total = state.gallery.length;
    els['gallery-count'].textContent = items.length === total
      ? (total ? total + (total === 1 ? ' imagen' : ' imágenes') : '')
      : items.length + ' de ' + total;

    const empty = !items.length;
    els['gallery-empty'].classList.toggle('hidden', !empty);
    if (empty) {
      els['gallery-empty'].querySelector('h3').textContent = q || filter === 'fav'
        ? 'Nada por aquí'
        : 'Tu galería está vacía';
      els['gallery-empty'].querySelector('p').textContent = q || filter === 'fav'
        ? 'Prueba con otra búsqueda o cambia el filtro.'
        : 'Las imágenes que generes aparecerán aquí, junto a todo su historial y ajustes.';
    }
  }

  /* ============================================================
     Modal de imagen
     ============================================================ */
  function openImageModal(rec) {
    state.modalRec = rec;
    els['im-img'].src = urlFor(rec);
    els['im-prompt'].textContent = rec.promptFull || rec.prompt || '';
    const hasNeg = !!(rec.negativeFull || rec.negative);
    els['im-negative-box'].classList.toggle('hidden', !hasNeg);
    els['im-negative'].textContent = rec.negativeFull || rec.negative || '';

    const rows = [];
    rows.push(['Modelo', escapeHtml(rec.modelLabel || rec.model || '—')]);
    rows.push(['Proveedor', escapeHtml(rec.providerLabel || rec.provider || '—')]);
    rows.push(['Estilo', '<span class="tag">' + escapeHtml(rec.styleLabel || '—') + '</span>']);
    rows.push(['Tamaño', rec.width + ' × ' + rec.height + ' px · ' + escapeHtml(rec.ratio || '')]);
    rows.push(['Semilla', escapeHtml(String(rec.seed != null ? rec.seed : '—')) +
      ' <button class="link-btn" data-seed="' + rec.seed + '">usar</button>']);
    rows.push(['Steps', rec.steps != null ? String(rec.steps) : '—']);
    rows.push(['CFG', rec.cfg != null ? String(rec.cfg) : '—']);
    rows.push(['Referencia', rec.hasRef ? 'sí (img2img)' : 'no']);
    rows.push(['Archivo', escapeHtml(formatBytes(rec.blob && rec.blob.size))]);
    rows.push(['Fecha', escapeHtml(formatDate(rec.createdAt))]);
    if (rec.parentType) rows.push(['Tipo', '<span class="tag neutral">' + escapeHtml(rec.parentType) + '</span>']);

    els['im-meta'].innerHTML = rows.map(function (r) {
      return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>';
    }).join('');

    syncFavoriteBtn();
    els['modal-image'].classList.remove('hidden');
    const imCard = els['modal-image'].querySelector('.modal-card');
    if (imCard) imCard.focus({ preventScroll: true });
  }

  function syncFavoriteBtn() {
    if (!state.modalRec) return;
    const b = els['im-favorite'];
    b.classList.toggle('btn-fav', true);
    b.classList.toggle('active', !!state.modalRec.favorite);
    b.innerHTML = icon('heart') + '<span>' + (state.modalRec.favorite ? 'Quitar favorito' : 'Favorito') + '</span>';
  }

  /* ============================================================
     Modal de ajustes (proveedores)
     ============================================================ */
  function openSettings() {
    const s = Providers.settings;
    els['select-provider'].value = s.provider;
    els['fs-demo'].classList.toggle('hidden', s.provider !== 'demo');
    els['fs-pollinations'].classList.toggle('hidden', s.provider !== 'pollinations');
    els['fs-custom'].classList.toggle('hidden', s.provider !== 'custom');

    const c = s.custom;
    els['input-api-url'].value = c.url || '';
    els['input-api-auth'].value = c.auth || '';
    els['select-api-format'].value = c.format || 'json';
    els['input-json-field'].value = c.field || 'image';
    els['input-models'].value = c.models || '';
    els['chk-seed'].checked = !!c.caps.seed;
    els['chk-steps'].checked = !!c.caps.steps;
    els['chk-cfg'].checked = !!c.caps.cfg;
    els['chk-negative'].checked = !!c.caps.negative;
    els['chk-reference'].checked = !!c.caps.reference;

    els['modal-settings'].classList.remove('hidden');
    const setCard = els['modal-settings'].querySelector('.modal-card');
    if (setCard) setCard.focus({ preventScroll: true });
  }

  async function saveSettings() {
    const provider = els['select-provider'].value;
    const custom = {
      url: els['input-api-url'].value.trim(),
      auth: els['input-api-auth'].value.trim(),
      format: els['select-api-format'].value,
      field: els['input-json-field'].value.trim() || 'image',
      models: els['input-models'].value.trim() || 'mi-modelo',
      caps: {
        seed: els['chk-seed'].checked,
        steps: els['chk-steps'].checked,
        cfg: els['chk-cfg'].checked,
        negative: els['chk-negative'].checked,
        reference: els['chk-reference'].checked
      }
    };
    if (provider === 'custom' && !/^https?:\/\//i.test(custom.url)) {
      toast('Introduce una URL válida (http/https) para tu API', 'err');
      els['input-api-url'].focus();
      return;
    }

    Providers.setProvider(provider);
    Providers.updateCustom(custom);

    const prevModelId = state.model && state.model.id;
    await applyProvider(provider, { modelId: prevModelId });
    syncModelSelect();
    updateCapsUI();
    updateSeedUI();
    updateRefUI();
    closeModal(els['modal-settings']);

    toast('Proveedor: ' + (Providers.labels[provider] || provider), 'ok');
    if (provider === 'custom') toast('Recuerda: adapta buildCustomPayload() en js/providers.js si tu API usa otros campos', 'info', 5000);
  }

  /* ============================================================
     Persistencia de la configuración del panel
     ============================================================ */
  function persistState() {
    const s = {
      style: state.style, ratio: state.ratio, quality: state.quality, qty: state.qty,
      seedRandom: state.seedRandom, seed: state.seed, steps: state.steps, cfg: state.cfg,
      model: state.model && state.model.id,
      prompt: els['input-prompt'] ? els['input-prompt'].value : '',
      negative: els['input-negative'] ? els['input-negative'].value : ''
    };
    try { ls.set(STATE_KEY, JSON.stringify(s)); } catch (e) { /* noop */ }
  }

  function restoreState() {
    let s = null;
    try { s = JSON.parse(ls.get(STATE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s) { els['slider-steps'].value = state.steps; els['steps-value'].textContent = state.steps; return; }

    if (PromptKit.getStyle(s.style).id === s.style) state.style = s.style;
    if (RATIOS[s.ratio]) state.ratio = s.ratio;
    if ([512, 768, 1024].indexOf(s.quality) !== -1) state.quality = s.quality;
    state.qty = clamp(s.qty || 1, 1, 4);
    if (typeof s.seedRandom === 'boolean') state.seedRandom = s.seedRandom;
    if (typeof s.seed === 'number') state.seed = s.seed >>> 0;
    state.steps = clamp(s.steps || 25, 1, 50);
    state.cfg = clamp(s.cfg || 7, 1, 20);
    state._restoredModel = s.model || null;

    renderStyleChips();
    syncSeg(els['ratio-group'], state.ratio);
    syncSeg(els['qty-group'], state.qty);
    els['select-quality'].value = String(state.quality);
    els['slider-steps'].value = state.steps;
    els['steps-value'].textContent = state.steps;
    els['slider-cfg'].value = state.cfg;
    els['cfg-value'].textContent = state.cfg;
    els['input-prompt'].value = s.prompt || '';
    els['input-negative'].value = s.negative || '';
  }

  /* ============================================================
     Arranque
     ============================================================ */
  init().catch(function (e) {
    console.error('[ImageIA] error de inicialización', e);
    try { toast('Error al iniciar la aplicación: ' + e.message, 'err'); } catch (e2) { /* noop */ }
  });
})();
