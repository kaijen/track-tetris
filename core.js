/* Track-Tetris – gemeinsame Datenschicht (Core)
 * Kein DOM, keine Darstellung. State, Persistenz, Zeit-Mathematik, Im-/Export
 * und alle Mutationen. Genutzt von Desktop (app.js) und Mobil (mobile.js).
 *
 * Modell mit Blocking-/Plenum-Blöcken (volle Breite + Synchronisationspunkt):
 *   state.spine      = geordnete Liste der Plenum-Blöcke (gelten über ALLE Tracks)
 *   track.segments[] = parallele Inhalte je Abschnitt; Länge = spine.length + 1
 *   Layout (von oben):  seg0, plenum0, seg1, plenum1, …, plenum(n-1), seg(n)
 *   Ein Plenum startet, wenn der längste Track des vorigen Abschnitts fertig ist
 *   (kürzere Tracks „warten"); danach starten alle Tracks gemeinsam wieder.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'track-tetris-state-v1';
  const SCHEMA_VERSION = 2;
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
      spine: [],
      tracks: [
        { id: uid(), name: 'Track A', segments: [[]] },
        { id: uid(), name: 'Track B', segments: [[]] },
      ],
    };
  }

  function normBlock(b) {
    return {
      id: b.id || uid(),
      templateId: b.templateId || null,
      name: String(b.name ?? 'Block'),
      duration: clampDuration(b.duration),
      color: validColor(b.color),
      isGap: !!b.isGap,
    };
  }
  function normPlenary(b) {
    return {
      id: b.id || uid(),
      name: String(b.name ?? 'Plenum'),
      duration: clampDuration(b.duration),
      color: validColor(b.color),
      blocking: true,
    };
  }

  /** Stellt sicher, dass track.segments genau (spine.length + 1) Einträge hat. */
  function ensureSegments(track, count) {
    if (!Array.isArray(track.segments)) track.segments = [[]];
    while (track.segments.length < count) track.segments.push([]);
    if (track.segments.length > count) {
      const extra = track.segments.splice(count - 1);
      track.segments[count - 1] = extra.flat();
    }
  }

  /** Validiert & repariert geladene Daten (Import / localStorage), inkl. v1→v2. */
  function normalizeState(data) {
    if (!data || typeof data !== 'object') throw new Error('Ungültiges Format');
    const out = {
      version: SCHEMA_VERSION,
      startTime: typeof data.startTime === 'string' && /^\d{1,2}:\d{2}$/.test(data.startTime)
        ? data.startTime : '09:00',
      pxPerMin: clampPx(data.pxPerMin),
      templates: [],
      spine: [],
      tracks: [],
    };
    if (Array.isArray(data.templates)) {
      out.templates = data.templates.map((t) => ({
        id: t.id || uid(),
        name: String(t.name ?? 'Template'),
        duration: clampDuration(t.duration),
        color: validColor(t.color),
        blocking: !!t.blocking,
      }));
    }
    if (Array.isArray(data.spine)) out.spine = data.spine.map(normPlenary);

    if (Array.isArray(data.tracks)) {
      out.tracks = data.tracks.map((tr) => {
        let segments;
        if (Array.isArray(tr.segments)) {
          segments = tr.segments.map((seg) => (Array.isArray(seg) ? seg.map(normBlock) : []));
        } else {
          // v1-Format: flache blocks-Liste -> ein Abschnitt
          segments = [Array.isArray(tr.blocks) ? tr.blocks.map(normBlock) : []];
        }
        return { id: tr.id || uid(), name: String(tr.name ?? 'Track'), segments };
      });
    }
    if (out.tracks.length === 0) out.tracks = [{ id: uid(), name: 'Track A', segments: [[]] }];
    out.tracks.forEach((tr) => ensureSegments(tr, out.spine.length + 1));
    return out;
  }

  // ---- Persistence -------------------------------------------------------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeState(JSON.parse(raw));
    } catch (_) { return null; }
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
    const minsInDay = ((Math.round(totalMin) % 1440) + 1440) % 1440;
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

  // ---- Lookups & layout --------------------------------------------------
  function findTrack(id) { return state.tracks.find((t) => t.id === id); }
  function segmentCount() { return state.spine.length + 1; }
  function blocksDur(blocks) { return blocks.reduce((s, b) => s + b.duration, 0); }
  function trackSegment(track, i) { return (track.segments[i] || []); }
  function trackTotalDuration(track) {
    // Summe aller Blöcke + Plenen (Plenum zählt für jeden Track gleich mit)
    let sum = state.spine.reduce((s, p) => s + p.duration, 0);
    track.segments.forEach((seg) => { sum += blocksDur(seg); });
    return sum;
  }

  /** Dauer jedes Abschnitts = längster Track in diesem Abschnitt. */
  function segmentDurations() {
    const n = segmentCount();
    const out = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (const tr of state.tracks) out[i] = Math.max(out[i], blocksDur(trackSegment(tr, i)));
    }
    return out;
  }

  /** Globale Zeit-Struktur: Start/Dauer je Abschnitt und je Plenum. */
  function computeSchedule() {
    const startMin = parseTime(state.startTime);
    const segDur = segmentDurations();
    const rows = [];
    let cursor = startMin;
    const n = state.spine.length;
    for (let i = 0; i <= n; i++) {
      rows.push({ kind: 'seg', index: i, start: cursor, dur: segDur[i] });
      cursor += segDur[i];
      if (i < n) {
        const p = state.spine[i];
        rows.push({ kind: 'plen', index: i, block: p, start: cursor, dur: p.duration });
        cursor += p.duration;
      }
    }
    return { rows, segDur, startMin, totalEnd: cursor };
  }

  // ---- Template mutations ------------------------------------------------
  function addTemplate({ name, duration, color, blocking }) {
    const n = String(name || '').trim();
    if (!n) return null;
    const tpl = { id: uid(), name: n, duration: clampDuration(duration), color: validColor(color), blocking: !!blocking };
    state.templates.push(tpl);
    notify();
    return tpl;
  }
  function updateTemplate(id, { name, duration, color, blocking }) {
    const tpl = state.templates.find((t) => t.id === id);
    if (!tpl) return;
    if (name != null && String(name).trim()) tpl.name = String(name).trim();
    if (duration != null) tpl.duration = clampDuration(duration);
    if (color != null) tpl.color = validColor(color);
    if (blocking != null) tpl.blocking = !!blocking;
    notify();
  }
  function deleteTemplate(id) {
    state.templates = state.templates.filter((t) => t.id !== id);
    notify();
  }

  // ---- Track mutations ---------------------------------------------------
  function addTrack() {
    const letter = String.fromCharCode(65 + state.tracks.length);
    const segments = Array.from({ length: segmentCount() }, () => []);
    const tr = { id: uid(), name: 'Track ' + letter, segments };
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

  // ---- Plenum / Blocking mutations --------------------------------------
  /** Fügt einen Plenum-Block ein. atIndex = Position im Spine (default: ans Ende). */
  function addBlocking({ name, duration, color }, atIndex) {
    const p = normPlenary({ name, duration, color: color || '#5566d6' });
    const at = atIndex == null ? state.spine.length : Math.min(state.spine.length, Math.max(0, atIndex));
    state.spine.splice(at, 0, p);
    state.tracks.forEach((tr) => tr.segments.splice(at + 1, 0, []));
    notify();
    return p;
  }
  function updateBlocking(id, { name, duration, color }) {
    const p = state.spine.find((x) => x.id === id);
    if (!p) return;
    if (name != null && String(name).trim()) p.name = String(name).trim();
    if (duration != null) p.duration = clampDuration(duration);
    if (color != null) p.color = validColor(color);
    notify();
  }
  /** Entfernt ein Plenum; die beiden angrenzenden Abschnitte werden vereint. */
  function removeBlocking(id) {
    const p = state.spine.findIndex((x) => x.id === id);
    if (p === -1) return;
    state.tracks.forEach((tr) => {
      tr.segments[p] = (tr.segments[p] || []).concat(tr.segments[p + 1] || []);
      tr.segments.splice(p + 1, 1);
    });
    state.spine.splice(p, 1);
    notify();
  }

  // ---- Block mutations (innerhalb eines Abschnitts) ----------------------
  function makeBlockFromTemplate(tpl) {
    return { id: uid(), templateId: tpl.id, name: tpl.name, duration: tpl.duration, color: tpl.color, isGap: false };
  }
  function addBlockFromTemplate(templateId, trackId, segIndex, index) {
    const tpl = state.templates.find((t) => t.id === templateId);
    const tr = findTrack(trackId);
    if (!tpl || !tr) return;
    const seg = tr.segments[segIndex];
    if (!seg) return;
    const at = index == null ? seg.length : index;
    seg.splice(at, 0, makeBlockFromTemplate(tpl));
    notify();
  }
  function addGap(trackId, segIndex, { name, duration }, index) {
    const tr = findTrack(trackId);
    const seg = tr && tr.segments[segIndex];
    if (!seg) return;
    const block = {
      id: uid(), templateId: null,
      name: String(name || '').trim() || 'Pause',
      duration: clampDuration(duration),
      color: '#8b97a6', isGap: true,
    };
    const at = index == null ? seg.length : index;
    seg.splice(at, 0, block);
    notify();
  }
  function findBlock(trackId, segIndex, blockId) {
    const tr = findTrack(trackId);
    const seg = tr && tr.segments[segIndex];
    if (!seg) return null;
    return seg.find((b) => b.id === blockId) || null;
  }
  function updateBlock(trackId, segIndex, blockId, { name, duration, color }) {
    const b = findBlock(trackId, segIndex, blockId);
    if (!b) return;
    if (name != null && String(name).trim()) b.name = String(name).trim();
    if (duration != null) b.duration = clampDuration(duration);
    if (color != null && !b.isGap) b.color = validColor(color);
    notify();
  }
  function removeBlock(trackId, segIndex, blockId) {
    const tr = findTrack(trackId);
    const seg = tr && tr.segments[segIndex];
    if (!seg) return;
    tr.segments[segIndex] = seg.filter((b) => b.id !== blockId);
    notify();
  }
  /** Verschiebt einen Block (Track/Abschnitt/Position frei). */
  function moveBlock(srcTrackId, srcSeg, blockId, destTrackId, destSeg, index) {
    const src = findTrack(srcTrackId);
    const dest = findTrack(destTrackId);
    if (!src || !dest || !src.segments[srcSeg] || !dest.segments[destSeg]) return;
    const sArr = src.segments[srcSeg];
    const i = sArr.findIndex((b) => b.id === blockId);
    if (i === -1) return;
    const [moved] = sArr.splice(i, 1);
    const dArr = dest.segments[destSeg];
    let insertAt = index == null ? dArr.length : index;
    if (sArr === dArr && i < insertAt) insertAt -= 1;
    dArr.splice(insertAt, 0, moved);
    notify();
  }
  /** Verschiebt einen Block um delta innerhalb seines Abschnitts (Mobil). */
  function nudgeBlock(trackId, segIndex, blockId, delta) {
    const tr = findTrack(trackId);
    const seg = tr && tr.segments[segIndex];
    if (!seg) return;
    const i = seg.findIndex((b) => b.id === blockId);
    if (i === -1) return;
    const j = Math.min(seg.length - 1, Math.max(0, i + delta));
    if (i === j) return;
    const [b] = seg.splice(i, 1);
    seg.splice(j, 0, b);
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
  function importJSON(text) { state = normalizeState(JSON.parse(text)); notify(); }
  function reset() { state = defaultState(); notify(); }

  // ---- Init --------------------------------------------------------------
  state = load() || defaultState();

  global.TT = {
    getState: () => state,
    subscribe,
    // helpers
    uid, parseTime, formatTime, formatDuration, tickMinutes,
    clampDuration, validColor,
    findTrack, segmentCount, segmentDurations, computeSchedule,
    blocksDur, trackSegment, trackTotalDuration,
    // templates
    addTemplate, updateTemplate, deleteTemplate,
    // tracks
    addTrack, deleteTrack, renameTrack,
    // plenum / blocking
    addBlocking, updateBlocking, removeBlocking,
    // blocks
    addBlockFromTemplate, addGap, updateBlock, removeBlock, moveBlock, nudgeBlock,
    // settings
    setStartTime, setZoom, stepZoom,
    // io
    toJSON, importJSON, reset,
  };
})(window);
