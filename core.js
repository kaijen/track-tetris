/* Track-Tetris – gemeinsame Datenschicht (Core)
 * Kein DOM, keine Darstellung. State, Persistenz, Zeit-Mathematik, Im-/Export
 * und alle Mutationen. Wird von der Desktop- (app.js) und der Mobil-Version
 * (mobile.js) gleichermaßen genutzt, damit beide kompatibel bleiben.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'track-tetris-state-v1';
  const SCHEMA_VERSION = 1;
  const DEFAULT_PX = 1.8;
  const PX_STEPS = [0.8, 1.2, 1.8, 2.6, 3.6, 5];

  const listeners = [];
  let state;

  // ---- Helpers -----------------------------------------------------------
  function uid() {
    return 'id-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }
  function clampDuration(d) {
    const n = Math.round(Number(d));
    return Number.isFinite(n) && n > 0 ? n : 30;
  }
  function clampPx(p) {
    const n = Number(p);
    return Number.isFinite(n) && n >= 0.4 && n <= 8 ? n : DEFAULT_PX;
  }
  function validColor(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#4f8cff';
  }

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      startTime: '09:00',
      pxPerMin: DEFAULT_PX,
      templates: [
        { id: uid(), name: 'Keynote', duration: 45, color: '#4f8cff' },
        { id: uid(), name: 'Workshop', duration: 90, color: '#36c98f' },
        { id: uid(), name: 'Coffee Break', duration: 20, color: '#e0a64a' },
        { id: uid(), name: 'Mittagspause', duration: 60, color: '#c668d4' },
      ],
      tracks: [
        { id: uid(), name: 'Track A', blocks: [] },
        { id: uid(), name: 'Track B', blocks: [] },
      ],
    };
  }

  /** Validiert & repariert geladene Daten (Import / localStorage). */
  function normalizeState(data) {
    if (!data || typeof data !== 'object') throw new Error('Ungültiges Format');
    const out = {
      version: SCHEMA_VERSION,
      startTime: typeof data.startTime === 'string' && /^\d{1,2}:\d{2}$/.test(data.startTime)
        ? data.startTime : '09:00',
      pxPerMin: clampPx(data.pxPerMin),
      templates: [],
      tracks: [],
    };
    if (Array.isArray(data.templates)) {
      out.templates = data.templates.map((t) => ({
        id: t.id || uid(),
        name: String(t.name ?? 'Template'),
        duration: clampDuration(t.duration),
        color: validColor(t.color),
      }));
    }
    if (Array.isArray(data.tracks)) {
      out.tracks = data.tracks.map((tr) => ({
        id: tr.id || uid(),
        name: String(tr.name ?? 'Track'),
        blocks: Array.isArray(tr.blocks) ? tr.blocks.map((b) => ({
          id: b.id || uid(),
          templateId: b.templateId || null,
          name: String(b.name ?? 'Block'),
          duration: clampDuration(b.duration),
          color: validColor(b.color),
          isGap: !!b.isGap,
        })) : [],
      }));
    }
    if (out.tracks.length === 0) out.tracks = [{ id: uid(), name: 'Track A', blocks: [] }];
    return out;
  }

  // ---- Persistence -------------------------------------------------------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeState(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  }
  function notify() {
    save();
    listeners.forEach((fn) => fn(state));
  }
  function subscribe(fn) { listeners.push(fn); return fn; }

  // ---- Time helpers ------------------------------------------------------
  function parseTime(str) {
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m;
  }
  function formatTime(totalMin) {
    const minsInDay = ((totalMin % 1440) + 1440) % 1440;
    const h = Math.floor(minsInDay / 60);
    const m = minsInDay % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function formatDuration(min) {
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? h + ' h' : h + ' h ' + m + ' min';
  }
  function tickMinutes(px) {
    const candidates = [5, 10, 15, 30, 60, 120, 180];
    for (const c of candidates) if (c * px >= 42) return c;
    return 240;
  }

  // ---- Lookups -----------------------------------------------------------
  function findTrack(id) { return state.tracks.find((t) => t.id === id); }
  function trackTotal(track) { return track.blocks.reduce((s, b) => s + b.duration, 0); }

  // ---- Template mutations ------------------------------------------------
  function addTemplate({ name, duration, color }) {
    const n = String(name || '').trim();
    if (!n) return null;
    const tpl = { id: uid(), name: n, duration: clampDuration(duration), color: validColor(color) };
    state.templates.push(tpl);
    notify();
    return tpl;
  }
  function updateTemplate(id, { name, duration, color }) {
    const tpl = state.templates.find((t) => t.id === id);
    if (!tpl) return;
    if (name != null && String(name).trim()) tpl.name = String(name).trim();
    if (duration != null) tpl.duration = clampDuration(duration);
    if (color != null) tpl.color = validColor(color);
    notify();
  }
  function deleteTemplate(id) {
    state.templates = state.templates.filter((t) => t.id !== id);
    notify();
  }

  // ---- Track mutations ---------------------------------------------------
  function addTrack() {
    const letter = String.fromCharCode(65 + state.tracks.length);
    const tr = { id: uid(), name: 'Track ' + letter, blocks: [] };
    state.tracks.push(tr);
    notify();
    return tr;
  }
  function deleteTrack(id) {
    if (state.tracks.length <= 1) return false;
    state.tracks = state.tracks.filter((t) => t.id !== id);
    notify();
    return true;
  }
  function renameTrack(id, name) {
    const tr = findTrack(id);
    if (!tr) return;
    tr.name = String(name || '').trim() || 'Track';
    notify();
  }

  // ---- Block mutations ---------------------------------------------------
  function makeBlockFromTemplate(tpl) {
    return { id: uid(), templateId: tpl.id, name: tpl.name, duration: tpl.duration, color: tpl.color, isGap: false };
  }
  function addBlockFromTemplate(templateId, trackId, index) {
    const tpl = state.templates.find((t) => t.id === templateId);
    const tr = findTrack(trackId);
    if (!tpl || !tr) return;
    const at = index == null ? tr.blocks.length : index;
    tr.blocks.splice(at, 0, makeBlockFromTemplate(tpl));
    notify();
  }
  function addGap(trackId, { name, duration }, index) {
    const tr = findTrack(trackId);
    if (!tr) return;
    const block = {
      id: uid(), templateId: null,
      name: String(name || '').trim() || 'Pause',
      duration: clampDuration(duration),
      color: '#8b97a6', isGap: true,
    };
    const at = index == null ? tr.blocks.length : index;
    tr.blocks.splice(at, 0, block);
    notify();
  }
  function updateBlock(trackId, blockId, { name, duration, color }) {
    const tr = findTrack(trackId);
    const b = tr && tr.blocks.find((x) => x.id === blockId);
    if (!b) return;
    if (name != null && String(name).trim()) b.name = String(name).trim();
    if (duration != null) b.duration = clampDuration(duration);
    if (color != null && !b.isGap) b.color = validColor(color);
    notify();
  }
  function removeBlock(trackId, blockId) {
    const tr = findTrack(trackId);
    if (!tr) return;
    tr.blocks = tr.blocks.filter((b) => b.id !== blockId);
    notify();
  }
  /** Verschiebt einen Block (innerhalb oder zwischen Tracks) an Zielindex. */
  function moveBlock(srcTrackId, blockId, destTrackId, index) {
    const src = findTrack(srcTrackId);
    const dest = findTrack(destTrackId);
    if (!src || !dest) return;
    const srcIdx = src.blocks.findIndex((b) => b.id === blockId);
    if (srcIdx === -1) return;
    const [moved] = src.blocks.splice(srcIdx, 1);
    let insertAt = index == null ? dest.blocks.length : index;
    if (src === dest && srcIdx < insertAt) insertAt -= 1;
    dest.blocks.splice(insertAt, 0, moved);
    notify();
  }
  /** Verschiebt einen Block um delta Positionen innerhalb seines Tracks (Mobil). */
  function nudgeBlock(trackId, blockId, delta) {
    const tr = findTrack(trackId);
    if (!tr) return;
    const i = tr.blocks.findIndex((b) => b.id === blockId);
    if (i === -1) return;
    const j = Math.min(tr.blocks.length - 1, Math.max(0, i + delta));
    if (i === j) return;
    const [b] = tr.blocks.splice(i, 1);
    tr.blocks.splice(j, 0, b);
    notify();
  }

  // ---- Settings ----------------------------------------------------------
  function setStartTime(t) {
    state.startTime = /^\d{1,2}:\d{2}$/.test(t) ? t : '09:00';
    notify();
  }
  function setZoom(px) { state.pxPerMin = clampPx(px); notify(); }
  function stepZoom(dir) {
    let idx = PX_STEPS.findIndex((v) => Math.abs(v - state.pxPerMin) < 0.001);
    if (idx === -1) idx = PX_STEPS.indexOf(DEFAULT_PX);
    idx = Math.min(PX_STEPS.length - 1, Math.max(0, idx + dir));
    setZoom(PX_STEPS[idx]);
  }

  // ---- IO ----------------------------------------------------------------
  function toJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(text) {
    state = normalizeState(JSON.parse(text));
    notify();
  }
  function reset() { state = defaultState(); notify(); }

  // ---- Init --------------------------------------------------------------
  state = load() || defaultState();

  global.TT = {
    getState: () => state,
    subscribe,
    // helpers
    uid, parseTime, formatTime, formatDuration, tickMinutes,
    clampDuration, validColor, findTrack, trackTotal,
    // templates
    addTemplate, updateTemplate, deleteTemplate,
    // tracks
    addTrack, deleteTrack, renameTrack,
    // blocks
    addBlockFromTemplate, addGap, updateBlock, removeBlock, moveBlock, nudgeBlock,
    // settings
    setStartTime, setZoom, stepZoom,
    // io
    toJSON, importJSON, reset,
  };
})(window);
