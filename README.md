# ImageIA · Generador de imágenes con IA

Interfaz web (HTML + CSS + JavaScript puro, sin frameworks ni build) para generar imágenes con IA,
inspirada en las funciones de herramientas tipo Perchance pero con diseño y código propios.

Funciona **100 % en el navegador** y viene lista para publicar en **GitHub Pages**.

---

## ✨ Funciones

| Función | Detalle |
|---|---|
| 🪄 Generación por prompt | Botón **Generar**, atajo `Ctrl/Cmd + Enter` |
| 🚫 Prompt negativo | Se desactiva automáticamente si el modelo no lo admite |
| 🤖 Modelo / cantidad / resolución | Selector de modelo con lista dinámica, 1–4 imágenes, 512/768/1024 px |
| 🖼 Relaciones de aspecto | `1:1`, `16:9`, `9:16`, `4:3`, `3:4` (dimensiones exactas calculadas y ajustadas a múltiplos de 8) |
| 🎛 Seed · Steps · CFG | Se activan/desactivan según las capacidades del modelo ("cuando son compatibles") |
| 🎨 Estilos | Anime, Realista, 3D, Fantasía, Pixel Art, Cyberpunk, Acuarela, Cómic, Minimalista, Retro 80s… cada uno añade modificadores al prompt (positivos y negativos) |
| 🔁 Regenerar / Variaciones / Remix | Regenerar (misma config, semilla nueva) · Variaciones (semillas hermanas + imagen como referencia) · Remix (carga todos los ajustes de la imagen en el panel) |
| 📷 Imagen de referencia | Subida por clic o arrastrar-y-soltar (img2img) cuando el modelo lo admite |
| 🗂 Galería e historial | Persistencia local (IndexedDB), búsqueda por prompt y filtro |
| ⭐ Favoritos y descarga | Marcar/desmarcar y descargar en un clic |
| 📋 Copiar prompt | En las tarjetas y en el modal de detalles |
| 🎲 Prompt aleatorio / ✨ mejora de prompt | Banco de prompts en español + mejora heurística local (sin servicios externos) |
| 🌙 Tema oscuro moderno | Responsive para Android (móvil) y PC, barra de generación fija en móvil |

## 🧪 Proveedores de imágenes (importantísimo)

**No se incluye ninguna API inventada.** La app trae una capa de proveedores
(`js/providers.js`) con tres opciones, elegibles desde **⚙ Ajustes**:

### 1. Demo local (por defecto)
Un generador procedural con `<canvas>` que corre en tu navegador: **sin red, sin claves, sin APIs**.
Respeta seed/steps/CFG y sirve para probar toda la interfaz (las imágenes son abstractas, decorativas).

### 2. Pollinations.ai (API real, gratuita, sin clave)
Conecta con `https://image.pollinations.ai` (servicio público real). Admite prompt, tamaño, seed y modelo
(`flux`, `turbo`…). No admite steps/CFG/negativo/referencia: la interfaz lo detecta y desactiva esos controles.
Puede tener límites de velocidad.

### 3. API personalizada (tu propia API)
Estructura preparada para conectar **cualquier** backend REST:

- Envía `POST` JSON con `prompt, negative_prompt, width, height, seed, steps, cfg_scale, model`.
- Tres formatos de respuesta configurables sin tocar código:
  - **JSON con base64** en un campo configurable (`image`, `images`, `b64_json`…; acepta arrays y dataURLs).
  - **Formato OpenAI Images** (`data[].b64_json`).
  - **Binario** (la respuesta es directamente la imagen).
- Cabecera `Authorization` configurable (se guarda solo en tu navegador).
- Checkboxes para declarar qué admite tu API (seed/steps/CFG/negativo/referencia).

Ejemplos listos:

| Backend | URL | Formato |
|---|---|---|
| Automatic1111 / Forge (Stable Diffusion WebUI) | `http://127.0.0.1:7860/sdapi/v1/txt2img` | JSON · campo `images` *(arranca el WebUI con `--api --cors-allow-origins=*`)* |
| Cualquier API compatible con OpenAI | `https://…/v1/images/generations` | OpenAI Images + `Authorization: Bearer …` |
| Endpoint propio que devuelva `{"image": "<base64>"}` | la que sea | JSON · campo `image` |

Si tu API usa otros nombres de campo, adapta las funciones documentadas
`buildCustomPayload()` y `parseCustomResponse()` en `js/providers.js` (están comentadas paso a paso).

## 📁 Estructura del proyecto

```
ImageIA/
├── index.html            # Interfaz completa (una sola página)
├── css/
│   └── styles.css        # Tema oscuro, responsive (PC + Android)
├── js/
│   ├── utils.js          # Helpers: DOM, toasts, iconos SVG, clipboard, PRNG…
│   ├── prompts.js        # Estilos, banco de prompts aleatorios, mejora de prompt
│   ├── demo-generator.js # Generador demo local (canvas procedural, determinista)
│   ├── providers.js      # ⭐ Capa de proveedores (demo / pollinations / tu API)
│   ├── db.js             # Galería e historial (IndexedDB con fallback en memoria)
│   └── app.js            # Controlador: estado, eventos, generación, modales
├── .nojekyll             # Para GitHub Pages
└── README.md
```

## 🚀 Uso en local

Opción rápida: abre `index.html` directamente en el navegador (el modo demo funciona incluso con `file://`).

Opción con servidor (recomendada para probar APIs externas):

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

## 🌐 Publicar en GitHub Pages

1. Haz push de este repositorio a GitHub.
2. En el repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Rama `main`, carpeta `/ (root)`, guarda.
4. Tu web quedará en `https://tu-usuario.github.io/ImageIA/`.

No hay paso de build: son archivos estáticos. `.nojekyll` evita que Pages procese los archivos con Jekyll.

## 🔒 Privacidad y almacenamiento

- El **modo demo no envía nada** a ningún servidor: las imágenes se generan en tu dispositivo.
- La galería se guarda en **IndexedDB de tu navegador** (con fallback a memoria si no está disponible).
- Los ajustes (proveedor, endpoint, cabecera de autorización) se guardan en `localStorage`, solo en tu equipo.
- Si activas Pollinations o una API externa, los prompts salen de tu navegador hacia ese servicio.

## 🧭 Notas técnicas

- JavaScript clásico (sin módulos ni bundler) para funcionar en cualquier hosting estático.
- La semilla fija reproduce imágenes idénticas en proveedores deterministas (demo incluido).
- "Variaciones" usa semillas hermanas y (si el modelo lo admite) la imagen original como referencia.
- "Remix" vuelca prompt, estilo, formato, seed, steps y CFG de una imagen en el panel para retocarla.
- Compatible con navegadores modernos (Chrome/Edge/Firefox/Safari de escritorio y Android).
