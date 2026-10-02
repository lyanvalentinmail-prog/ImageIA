/* ============================================================
   ImageIA — utils.js
   Utilidades genéricas: DOM, toasts, iconos, portapapeles, PRNG…
   ============================================================ */
(function () {
  'use strict';

  /* ---------- DOM ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function el(tag, attrs, html) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (html != null) node.innerHTML = html;
    return node;
  }

  /* ---------- Varios ---------- */
  const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const randomSeed = () => Math.floor(Math.random() * 2147483647);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatBytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function formatDate(ts) {
    try {
      return new Date(ts).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return new Date(ts).toLocaleString();
    }
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* PRNG determinista (misma semilla => misma imagen en modo demo) */
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 2166136261;
    s = String(s || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* ---------- Base64 <-> Blob ---------- */
  function b64ToBlob(b64, type) {
    const parts = String(b64).split(',');
    let data = parts.length > 1 && parts[0].indexOf('base64') !== -1 ? parts[1] : parts[0];
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type || 'image/png' });
  }

  /* ---------- Portapapeles / descarga ---------- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* seguimos con el fallback */ }
    try {
      const ta = el('textarea', { style: 'position:fixed;opacity:0;pointer-events:none' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename || 'imagen.png' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- Iconos SVG (set propio, trazo 2, 24×24) ---------- */
  const P = (d) => '<path d="' + d + '"/>';
  const ICONS = {
    sparkles: P('M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z') + P('M19 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z'),
    dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none"/>',
    wand: P('M15 4V2') + P('M15 16v-2') + P('M8 9h2') + P('M20 9h2') + P('M17.8 11.8L19 13') + P('M15 9h.01') + P('M17.8 6.2L19 5') + P('M12.2 6.2L11 5') + P('M3 21l9-9') + P('M12.2 11.8L11 13'),
    heart: P('M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z'),
    download: P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4') + '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/>' + P('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'),
    refresh: '<polyline points="23 4 23 10 17 10"/>' + P('M20.49 15a9 9 0 1 1-2.12-9.36L23 10'),
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>',
    shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
    trash: '<polyline points="3 6 5 6 21 6"/>' + P('M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'),
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    upload: P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4') + '<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    expand: P('M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3'),
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    brush: P('M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08') + P('M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"')
  };

  function icon(name) {
    const body = ICONS[name] || ICONS.image;
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  /* Sustituye <span data-icon="nombre"></span> por el SVG */
  function hydrateIcons(root) {
    $$('[data-icon]', root || document).forEach(function (n) {
      n.innerHTML = icon(n.getAttribute('data-icon'));
      n.removeAttribute('data-icon');
    });
  }

  /* ---------- Toasts ---------- */
  const TOAST_ICONS = { ok: 'check', err: 'alert', info: 'info' };

  function toast(msg, type, ms) {
    type = type || 'info';
    const root = $('#toast-root');
    if (!root) return;
    const t = el('div', { class: 'toast ' + type, role: 'status' });
    t.innerHTML = icon(TOAST_ICONS[type] || 'info') + '<span>' + escapeHtml(msg) + '</span>';
    root.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(() => t.remove(), 260);
    }, ms || 3400);
  }

  /* ---------- Diálogo de confirmación (promesa) ---------- */
  let confirmBusy = false;
  function confirmDialog(message, options) {
    options = options || {};
    return new Promise(function (resolve) {
      const modal = $('#modal-confirm');
      if (!modal || confirmBusy) {
        /* fallback sin modal */
        resolve(window.confirm(message));
        return;
      }
      confirmBusy = true;
      const txt = $('#cf-text'), ok = $('#cf-ok'), cancel = $('#cf-cancel');
      txt.textContent = message;
      ok.textContent = options.okText || 'Eliminar';
      ok.className = 'btn ' + (options.danger === false ? 'btn-primary' : 'btn-danger');
      modal.classList.remove('hidden');

      function done(val) {
        confirmBusy = false;
        modal.classList.add('hidden');
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        modal.querySelector('.modal-backdrop').removeEventListener('click', onCancel);
        resolve(val);
      }
      function onOk() { done(true); }
      function onCancel() { done(false); }
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      modal.querySelector('.modal-backdrop').addEventListener('click', onCancel);
    });
  }

  /* ---------- Storage seguro (iframes / modo privado) ---------- */
  const mem = {};
  const ls = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (e) { return mem[key] != null ? mem[key] : null; }
    },
    set(key, val) {
      try { window.localStorage.setItem(key, val); } catch (e) { mem[key] = val; }
    }
  };

  /* ---------- Export ---------- */
  window.Utils = {
    $, $$, el, uid, clamp, randomSeed, sleep, escapeHtml, formatBytes, formatDate,
    debounce, mulberry32, hashStr, b64ToBlob, copyText, downloadBlob,
    icon, hydrateIcons, toast, confirmDialog, ls
  };
})();
