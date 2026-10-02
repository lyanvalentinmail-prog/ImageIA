/* ============================================================
   ImageIA — prompts.js
   Estilos visuales, banco de prompts aleatorios y "mejora" de
   prompt (reglas locales, sin servicios externos).
   ============================================================ */
(function () {
  'use strict';

  /* ======================================================
     ESTILOS
     positive/negative: modificadores que se añaden al prompt
     demo: parámetros visuales usados por el generador local
     ====================================================== */
  const STYLES = [
    {
      id: 'ninguno', label: 'Ninguno', emoji: '⬜',
      positive: '', negative: '',
      demo: { hues: [210, 260, 320], sat: 60, light: 55 }
    },
    {
      id: 'anime', label: 'Anime', emoji: '🌸',
      positive: 'estilo anime, ilustración detallada, colores vibrantes, línea limpia, iluminación suave',
      negative: 'fotorrealista, render 3D, arte tosco',
      demo: { hues: [310, 330, 25], sat: 68, light: 64, pastel: true, rays: true }
    },
    {
      id: 'realista', label: 'Realista', emoji: '📷',
      positive: 'fotorrealista, fotografía profesional, lente 50 mm, profundidad de campo, iluminación natural',
      negative: 'dibujo, anime, cartoon, ilustración',
      demo: { hues: [205, 220, 30], sat: 42, light: 50, grain: true }
    },
    {
      id: '3d', label: '3D', emoji: '🧊',
      positive: 'render 3D, materiales PBR, iluminación global, sombreado suave, octane render',
      negative: 'plano, 2D, dibujo a mano',
      demo: { hues: [215, 265, 190], sat: 58, light: 58, orb: true }
    },
    {
      id: 'fantasia', label: 'Fantasía', emoji: '🐉',
      positive: 'arte de fantasía épica, mundo mágico, atmósfera encantada, colores etéreos',
      negative: 'moderno, mundano, urbano',
      demo: { hues: [265, 295, 185], sat: 66, light: 56, sparkles: true }
    },
    {
      id: 'pixel', label: 'Pixel Art', emoji: '🕹️',
      positive: 'pixel art, 16 bits, dithering, paleta limitada, estética retro de videojuego',
      negative: 'suavizado, fotorrealista, desenfocado',
      demo: { hues: [200, 280, 330], sat: 78, light: 55, pixel: true }
    },
    {
      id: 'cyberpunk', label: 'Cyberpunk', emoji: '🌃',
      positive: 'estética cyberpunk, neones brillantes, megaciudad futurista, lluvia nocturna, alta tecnología',
      negative: 'rural, luz de día, tecnología antigua',
      demo: { hues: [288, 315, 186], sat: 92, light: 44, dark: true, neon: true, grid: true }
    },
    {
      id: 'acuarela', label: 'Acuarela', emoji: '🎨',
      positive: 'pintura en acuarela, pinceladas suaves, bordes difuminados, textura de papel',
      negative: 'digital, nitidez extrema, render 3D',
      demo: { hues: [20, 45, 200], sat: 52, light: 70, soft: true }
    },
    {
      id: 'comic', label: 'Cómic', emoji: '💥',
      positive: 'cómic, tinta gruesa, trama de semitonos, colores planos vibrantes, novela gráfica',
      negative: 'fotorrealista, acuarela, suave',
      demo: { hues: [0, 40, 222], sat: 82, light: 55, halftone: true }
    },
    {
      id: 'minimal', label: 'Minimalista', emoji: '⚪',
      positive: 'minimalista, composición simple, amplio espacio negativo, formas geométricas, paleta limitada',
      negative: 'detallado, caótico, texturas complejas',
      demo: { hues: [222, 232, 0], sat: 26, light: 62, minimal: true }
    },
    {
      id: 'retro', label: 'Retro 80s', emoji: '📼',
      positive: 'estética retro años 80, vaporwave, sol degradado, rejilla de neón, cromado',
      negative: 'moderno, minimalista',
      demo: { hues: [318, 335, 258], sat: 82, light: 56, grid: true, neon: true, retroSun: true, dark: true }
    }
  ];

  function getStyle(id) {
    for (let i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i];
    return STYLES[0];
  }

  /* ======================================================
     BANCO DE PROMPTS ALEATORIOS (español)
     ====================================================== */
  const SUBJECTS = [
    'un astronauta solitario', 'una zorra de nueve colas', 'un dragón de cristal',
    'una arquitecta futurista', 'un gato samurái', 'un robot jardinero',
    'una ballena voladora', 'una hechicera de la luna', 'un buceador de épocas antiguas',
    'una ciudad flotante entre nubes', 'un faro abandonado', 'un ciervo de luz',
    'una pirámide cubierta de vegetación', 'un caballero de armadura dorada',
    'una niña con una linterna mágica', 'un tren que atraviesa el espacio',
    'un mercado callejero nocturno', 'una medusa bioluminiscente',
    'un búho mecánico', 'una reina de hielo', 'un bosque de girasoles gigantes',
    'un pescador de estrellas', 'una biblioteca infinita', 'un colibrí de fuego'
  ];

  const ACTIONS = [
    'meditando en silencio', 'cuidando flores bioluminiscentes', 'surfeando una tormenta eléctrica',
    'leyendo un libro gigante', 'tocando un violín de luz', 'perdido en la niebla',
    'construyendo una máquina de sueños', 'observando el horizonte', 'danzando entre partículas doradas',
    'descansando bajo la lluvia', 'empezando una gran aventura', 'recogiendo frutos de colores',
    'vagando sin rumbo', 'defendiendo un antiguo secreto'
  ];

  const PLACES = [
    'en un bosque de bambú gigante', 'sobre los tejados de una megaciudad', 'en una playa de arena negra',
    'dentro de una biblioteca infinita', 'en un desierto de cristal', 'bajo una aurora boreal',
    'en una estación espacial abandonada', 'en un jardín japonés en primavera', 'entre ruinas cubiertas de musgo',
    'en la cima de una montaña nevada', 'en un callejón lleno de neones', 'sobre un mar de nubes',
    'en una cueva de cristales', 'junto a un lago espejo al amanecer', 'en un campo de lavanda infinito',
    'en la superficie de un asteroide'
  ];

  const LIGHTS = [
    'iluminación dorada del atardecer', 'luz de neón reflejada en el suelo mojado',
    'rayos de sol atravesando la niebla', 'luz de luna fría y azulada',
    'contraluz dramático', 'amanecer rosado y suave', 'luz cálida de velas',
    'destellos de magia flotando en el aire', 'iluminación cinematográfica volumétrica'
  ];

  const EXTRAS = [
    'vista aérea', 'primer plano detallado', 'gran angular',
    'composición cinematográfica', 'partículas flotando en el aire',
    'reflejos perfectos en el agua', 'nubes dramáticas', 'atmósfera onírica',
    'colores complementarios intensos'
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function randomPrompt() {
    const parts = [pick(SUBJECTS) + ' ' + pick(ACTIONS) + ', ' + pick(PLACES), pick(LIGHTS)];
    if (Math.random() < 0.6) parts.push(pick(EXTRAS));
    return parts.join(', ');
  }

  /* ======================================================
     MEJORA DE PROMPT (heurística local)
     Añade modificadores de calidad/iluminación/composición
     que no estén ya presentes, coherentes con el estilo.
     ====================================================== */
  const QUALITY_TOKENS = [
    'obra maestra', 'altísimo nivel de detalle', 'nitidez 8K',
    'iluminación cinematográfica', 'colores vibrantes', 'composición profesional',
    'renderizado de alta calidad'
  ];

  function tokenize(prompt) {
    return String(prompt || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  /**
   * Devuelve { text, added } con el prompt enriquecido.
   * No llama a ningún servicio externo.
   */
  function enhancePrompt(prompt, styleId) {
    const style = getStyle(styleId);
    const base = String(prompt || '').trim();
    if (!base) return { text: randomPrompt(), added: ['prompt aleatorio (estaba vacío)'] };

    const existing = tokenize(base);
    const added = [];

    function addToken(token) {
      const norm = token.toLowerCase();
      const dup = existing.some((t) => t === norm || t.indexOf(norm) !== -1 || norm.indexOf(t) !== -1);
      if (!dup) { existing.push(norm); added.push(token); }
    }

    /* 1) modificadores del estilo activo */
    (style.positive || '').split(',').forEach((t) => { if (t.trim()) addToken(t.trim()); });

    /* 2) si no hay mención de luz, añadir una */
    const hasLight = /luz|iluminaci|atardecer|amanecer|noche|ne[oó]n|sol |luna|penumbra|oscur/i.test(base);
    if (!hasLight) addToken(pick(LIGHTS));

    /* 3) tokens de calidad (máximo 4) */
    const shuffled = QUALITY_TOKENS.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length && added.filter((a) => QUALITY_TOKENS.indexOf(a) !== -1).length < 4; i++) {
      addToken(shuffled[i]);
    }

    const text = base + (added.length ? ', ' + added.join(', ') : '');
    return { text, added };
  }

  window.PromptKit = { STYLES, getStyle, randomPrompt, enhancePrompt };
})();
