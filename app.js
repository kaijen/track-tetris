/* Track-Tetris – Konferenz-Rahmenzeitplaner
 * Reines Vanilla-JS, kein Backend. State im Browser, Persistenz via JSON-Export/Import.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'track-tetris-state-v1';
  const SCHEMA_VERSION = 1;

  // Zoom (Pixel pro Minute) für die Zeitachse
  const PX_STEPS = [0.8, 1.2, 1.8, 2.6, 3.6, 5];
  const DEFAULT_PX = 1.8;

  // ---- State -------------------------------------------------------------
  /** @type {{version:number,startTime:string,pxPerMin:number,templates:Array,tracks:Array}} */
  let state = loadState() || defaultState();

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

  function uid() {
    return 'id-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  // ---- DOM refs ----------------------------------------------------------
  const els = {
    startTime: document.getElementById('startTime'),
    templateForm: document.getElementById('templateForm'),
    tplName: document.getElementById('tplName'),
    tplDuration: document.getElementById('tplDuration'),
    tplColor: document.getElementById('tplColor'),
    templateList: document.getElementById('templateList'),
    trackBoard: document.getElementById('trackBoard'),
    addTrackBtn: document.getElementById('addTrackBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    resetBtn: document.getElementById('resetBtn'),
    toast: document.getElementById('toast'),
    zoomIn: document.getElementById('zoomIn'),
    zoomOut: document.getElementById('zoomOut'),
    zoomLabel: document.getElementById('zoomLabel'),
    modal: document.getElementById('modal'),
    modalForm: document.getElementById('modalForm'),
    modalTitle: document.getElementById('modalTitle'),
    modalFields: document.getElementById('modalFields'),
    modalCancel: document.getElementById('modalCancel'),
  };

  // ---- Persistence -------------------------------------------------------
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) { /* storage voll/blockiert – ignorieren */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeState(JSON.parse(raw));
    } catch (_) {
      return null;
    }
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

  // ---- Time helpers ------------------------------------------------------
  function parseTime(str) {
    const [h, m] = str.split(':').map(Number);
    return (h * 60 + m);
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

  // ---- Lookups -----------------------------------------------------------
  function findTrack(trackId) {
    return state.tracks.find((t) => t.id === trackId);
  }
  function trackTotal(track) {
    return track.blocks.reduce((sum, b) => sum + b.duration, 0);
  }

  /** Tick-Intervall (Minuten), so dass Linien nicht zu dicht stehen (>= ~42px). */
  function tickMinutes() {
    const candidates = [5, 10, 15, 30, 60, 120, 180];
    for (const c of candidates) {
      if (c * state.pxPerMin >= 42) return c;
    }
    return 240;
  }

  // =======================================================================
  //  RENDER
  // =======================================================================
  function render() {
    renderTemplates();
    renderTracks();
    renderZoom();
    saveState();
  }

  function renderZoom() {
    els.zoomLabel.textContent = state.pxPerMin.toFixed(1) + ' px/min';
  }

  function renderTemplates() {
    const list = els.templateList;
    list.innerHTML = '';
    if (state.templates.length === 0) {
      list.innerHTML = '<li class="empty-hint">Noch keine Templates.<br>Lege oben welche an.</li>';
      return;
    }
    for (const tpl of state.templates) {
      const li = document.createElement('li');
      li.className = 'template-chip';
      li.draggable = true;
      li.style.setProperty('--chip-color', tpl.color);
      li.dataset.templateId = tpl.id;
      li.innerHTML = `
        <div class="tpl-info">
          <div class="tpl-name"></div>
          <div class="tpl-dur"></div>
        </div>
        <div class="tpl-actions">
          <button class="btn btn-icon" data-act="edit" title="Bearbeiten">✎</button>
          <button class="btn btn-icon" data-act="del" title="Löschen">🗑</button>
        </div>`;
      li.querySelector('.tpl-name').textContent = tpl.name;
      li.querySelector('.tpl-dur').textContent = formatDuration(tpl.duration);

      li.addEventListener('dragstart', (e) => {
        dragData = { kind: 'template', templateId: tpl.id };
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', tpl.id);
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        dragData = null;
        clearPlaceholders();
      });

      li.querySelector('[data-act="edit"]').addEventListener('click', () => editTemplate(tpl.id));
      li.querySelector('[data-act="del"]').addEventListener('click', () => deleteTemplate(tpl.id));
      list.appendChild(li);
    }
  }

  function renderTracks() {
    const board = els.trackBoard;
    board.innerHTML = '';
    const startMin = parseTime(state.startTime);
    const px = state.pxPerMin;
    const tick = tickMinutes();
    const tickPx = tick * px;

    // Höhe der Zeitachse = längster Track (mind. 1 Tick), damit alle Lanes ausgerichtet sind
    const maxTotal = Math.max(0, ...state.tracks.map(trackTotal));
    const axisMinutes = Math.max(maxTotal, tick);
    const axisHeight = axisMinutes * px;

    board.style.setProperty('--tick-px', tickPx + 'px');

    // --- Ruler-Lane ---
    const rulerLane = document.createElement('div');
    rulerLane.className = 'lane ruler-lane';
    const rulerHead = document.createElement('div');
    rulerHead.className = 'lane-head';
    rulerHead.innerHTML = '<div class="track-meta"><span>Zeit</span></div>';
    const ruler = document.createElement('div');
    ruler.className = 'ruler';
    ruler.style.height = axisHeight + 'px';
    for (let m = 0; m <= axisMinutes + 0.001; m += tick) {
      const t = document.createElement('div');
      t.className = 'ruler-tick';
      t.style.top = (m * px) + 'px';
      t.textContent = formatTime(startMin + m);
      ruler.appendChild(t);
    }
    rulerLane.append(rulerHead, ruler);
    board.appendChild(rulerLane);

    // --- Track-Lanes ---
    for (const track of state.tracks) {
      const lane = document.createElement('div');
      lane.className = 'lane';
      lane.dataset.trackId = track.id;

      const total = trackTotal(track);
      const endMin = startMin + total;

      // Head
      const head = document.createElement('div');
      head.className = 'lane-head';

      const nameRow = document.createElement('div');
      nameRow.className = 'track-name-row';
      const nameInput = document.createElement('input');
      nameInput.className = 'track-name';
      nameInput.value = track.name;
      nameInput.addEventListener('change', () => {
        track.name = nameInput.value.trim() || 'Track';
        render();
      });
      const delTrackBtn = document.createElement('button');
      delTrackBtn.className = 'btn btn-icon';
      delTrackBtn.textContent = '🗑';
      delTrackBtn.title = 'Track löschen';
      delTrackBtn.addEventListener('click', () => deleteTrack(track.id));
      nameRow.append(nameInput, delTrackBtn);

      const meta = document.createElement('div');
      meta.className = 'track-meta';
      meta.innerHTML = `<span>${state.startTime}–${formatTime(endMin)}</span><span>${formatDuration(total)}</span>`;

      const addGapBtn = document.createElement('button');
      addGapBtn.className = 'btn add-gap';
      addGapBtn.textContent = '+ Lücke';
      addGapBtn.title = 'Pause / Leerzeit einfügen (zum Synchronisieren)';
      addGapBtn.addEventListener('click', () => addGap(track.id));

      head.append(nameRow, meta, addGapBtn);

      // Canvas
      const canvas = document.createElement('div');
      canvas.className = 'track-canvas';
      canvas.dataset.trackId = track.id;
      canvas.style.minHeight = axisHeight + 'px';

      let cursor = startMin;
      for (const block of track.blocks) {
        canvas.appendChild(buildBlockEl(track, block, cursor, px));
        cursor += block.duration;
      }
      if (track.blocks.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'canvas-empty';
        hint.textContent = 'Templates hierher ziehen';
        canvas.appendChild(hint);
      }

      setupTrackDnD(canvas, track);
      lane.append(head, canvas);
      board.appendChild(lane);
    }

    // Add-track tile
    const addTile = document.createElement('button');
    addTile.className = 'add-track-tile';
    addTile.textContent = '+ Track';
    addTile.addEventListener('click', addTrack);
    board.appendChild(addTile);
  }

  function buildBlockEl(track, block, startMin, px) {
    const el = document.createElement('div');
    el.className = 'block' + (block.isGap ? ' is-gap' : '');
    el.draggable = true;
    el.style.setProperty('--block-color', block.color);
    el.style.height = Math.max(1, block.duration * px) + 'px';
    if (block.duration * px < 34) el.classList.add('is-tiny');
    el.dataset.blockId = block.id;
    el.title = `${block.name} · ${formatTime(startMin)}–${formatTime(startMin + block.duration)} · ${formatDuration(block.duration)}\nDoppelklick zum Bearbeiten`;
    el.innerHTML = `
      <div class="block-actions">
        <button class="act-edit" title="Bearbeiten">✎</button>
        <button class="act-del" title="Entfernen">×</button>
      </div>
      <div class="block-time"></div>
      <div class="block-name"></div>
      <div class="block-dur"></div>`;
    el.querySelector('.block-time').textContent =
      formatTime(startMin) + ' – ' + formatTime(startMin + block.duration);
    el.querySelector('.block-name').textContent = block.name;
    el.querySelector('.block-dur').textContent = formatDuration(block.duration);

    const actions = el.querySelector('.block-actions');
    actions.addEventListener('mousedown', (e) => e.stopPropagation());
    el.querySelector('.act-del').addEventListener('click', (e) => {
      e.stopPropagation();
      removeBlock(track.id, block.id);
    });
    el.querySelector('.act-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      editBlock(track.id, block.id);
    });
    el.addEventListener('dblclick', () => editBlock(track.id, block.id));

    el.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      dragData = { kind: 'block', trackId: track.id, blockId: block.id };
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', block.id);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      dragData = null;
      clearPlaceholders();
    });
    return el;
  }

  // =======================================================================
  //  DRAG & DROP
  // =======================================================================
  let dragData = null; // { kind:'template', templateId } | { kind:'block', trackId, blockId }

  function clearPlaceholders() {
    document.querySelectorAll('.block-drop-placeholder').forEach((p) => p.remove());
    document.querySelectorAll('.track-canvas.drag-over').forEach((b) => b.classList.remove('drag-over'));
  }

  function setupTrackDnD(canvas, track) {
    canvas.addEventListener('dragover', (e) => {
      if (!dragData) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = dragData.kind === 'template' ? 'copy' : 'move';
      canvas.classList.add('drag-over');
      showPlaceholder(canvas, e.clientY);
    });
    canvas.addEventListener('dragleave', (e) => {
      if (!canvas.contains(e.relatedTarget)) {
        canvas.classList.remove('drag-over');
      }
    });
    canvas.addEventListener('drop', (e) => {
      if (!dragData) return;
      e.preventDefault();
      const index = placeholderIndex(canvas);
      handleDrop(track, index);
      clearPlaceholders();
    });
  }

  function showPlaceholder(canvas, clientY) {
    clearPlaceholders();
    canvas.classList.add('drag-over');
    const ph = document.createElement('div');
    ph.className = 'block-drop-placeholder';
    const blockEls = [...canvas.querySelectorAll('.block:not(.dragging)')];
    const after = blockEls.find((el) => {
      const r = el.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    if (after) canvas.insertBefore(ph, after);
    else canvas.appendChild(ph);
  }

  function placeholderIndex(canvas) {
    const ph = canvas.querySelector('.block-drop-placeholder');
    if (!ph) return findTrack(canvas.dataset.trackId).blocks.length;
    let idx = 0;
    for (const child of canvas.children) {
      if (child === ph) break;
      if (child.classList.contains('block') && !child.classList.contains('dragging')) idx++;
    }
    return idx;
  }

  function handleDrop(targetTrack, index) {
    if (dragData.kind === 'template') {
      const tpl = state.templates.find((t) => t.id === dragData.templateId);
      if (!tpl) return;
      const block = {
        id: uid(),
        templateId: tpl.id,
        name: tpl.name,
        duration: tpl.duration,
        color: tpl.color,
        isGap: false,
      };
      targetTrack.blocks.splice(index, 0, block);
    } else if (dragData.kind === 'block') {
      const srcTrack = findTrack(dragData.trackId);
      if (!srcTrack) return;
      const srcIdx = srcTrack.blocks.findIndex((b) => b.id === dragData.blockId);
      if (srcIdx === -1) return;
      const [moved] = srcTrack.blocks.splice(srcIdx, 1);
      let insertAt = index;
      // Korrektur, wenn innerhalb desselben Tracks nach hinten verschoben
      if (srcTrack === targetTrack && srcIdx < index) insertAt = index - 1;
      targetTrack.blocks.splice(insertAt, 0, moved);
    }
    render();
  }

  // =======================================================================
  //  MODAL (reusable edit dialog)
  // =======================================================================
  let modalSubmit = null;
  function openModal(title, fields, onSave) {
    els.modalTitle.textContent = title;
    els.modalFields.innerHTML = '';
    const inputs = {};
    for (const f of fields) {
      const wrap = document.createElement('div');
      wrap.className = 'modal-field';
      const label = document.createElement('label');
      label.textContent = f.label;
      const input = document.createElement('input');
      input.type = f.type || 'text';
      input.value = f.value ?? '';
      if (f.type === 'number') { input.min = '1'; input.step = '1'; }
      const id = 'mf-' + f.key;
      input.id = id;
      label.htmlFor = id;
      wrap.append(label, input);
      els.modalFields.appendChild(wrap);
      inputs[f.key] = input;
    }
    modalSubmit = () => {
      const values = {};
      for (const k of Object.keys(inputs)) values[k] = inputs[k].value;
      onSave(values);
    };
    els.modal.hidden = false;
    const first = els.modalFields.querySelector('input');
    if (first) { first.focus(); first.select(); }
  }

  function closeModal() {
    els.modal.hidden = true;
    modalSubmit = null;
  }

  els.modalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (modalSubmit) modalSubmit();
    closeModal();
  });
  els.modalCancel.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.modal.hidden) closeModal();
  });

  // =======================================================================
  //  BLOCK / GAP EDIT
  // =======================================================================
  function editBlock(trackId, blockId) {
    const tr = findTrack(trackId);
    const block = tr && tr.blocks.find((b) => b.id === blockId);
    if (!block) return;
    const fields = [
      { key: 'name', label: 'Name', type: 'text', value: block.name },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: block.duration },
    ];
    if (!block.isGap) fields.push({ key: 'color', label: 'Farbe', type: 'color', value: block.color });
    openModal(block.isGap ? 'Lücke bearbeiten' : 'Block bearbeiten', fields, (v) => {
      block.name = v.name.trim() || block.name;
      block.duration = clampDuration(v.duration);
      if (v.color) block.color = validColor(v.color);
      render();
    });
  }

  function addGap(trackId) {
    const tr = findTrack(trackId);
    if (!tr) return;
    openModal('Lücke / Pause einfügen', [
      { key: 'name', label: 'Bezeichnung', type: 'text', value: 'Pause' },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: 15 },
    ], (v) => {
      tr.blocks.push({
        id: uid(),
        templateId: null,
        name: v.name.trim() || 'Pause',
        duration: clampDuration(v.duration),
        color: '#8b97a6',
        isGap: true,
      });
      render();
    });
  }

  // =======================================================================
  //  TEMPLATE CRUD
  // =======================================================================
  els.templateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.tplName.value.trim();
    const duration = clampDuration(els.tplDuration.value);
    if (!name) return;
    state.templates.push({ id: uid(), name, duration, color: els.tplColor.value });
    els.tplName.value = '';
    els.tplDuration.value = '30';
    render();
    els.tplName.focus();
  });

  function editTemplate(id) {
    const tpl = state.templates.find((t) => t.id === id);
    if (!tpl) return;
    openModal('Template bearbeiten', [
      { key: 'name', label: 'Name', type: 'text', value: tpl.name },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: tpl.duration },
      { key: 'color', label: 'Farbe', type: 'color', value: tpl.color },
    ], (v) => {
      tpl.name = v.name.trim() || tpl.name;
      tpl.duration = clampDuration(v.duration);
      tpl.color = validColor(v.color);
      render();
      toast('Template aktualisiert. Bereits platzierte Blöcke bleiben unverändert.');
    });
  }

  function deleteTemplate(id) {
    const tpl = state.templates.find((t) => t.id === id);
    if (!tpl) return;
    if (!confirm(`Template „${tpl.name}" löschen? Bereits platzierte Blöcke bleiben erhalten.`)) return;
    state.templates = state.templates.filter((t) => t.id !== id);
    render();
  }

  // =======================================================================
  //  TRACK CRUD
  // =======================================================================
  function addTrack() {
    const letter = String.fromCharCode(65 + state.tracks.length); // A, B, C…
    state.tracks.push({ id: uid(), name: 'Track ' + letter, blocks: [] });
    render();
  }

  function deleteTrack(id) {
    if (state.tracks.length <= 1) {
      toast('Mindestens ein Track muss bestehen bleiben.');
      return;
    }
    const tr = findTrack(id);
    if (tr && tr.blocks.length > 0 && !confirm(`Track „${tr.name}" mit ${tr.blocks.length} Blöcken löschen?`)) return;
    state.tracks = state.tracks.filter((t) => t.id !== id);
    render();
  }

  function removeBlock(trackId, blockId) {
    const tr = findTrack(trackId);
    if (!tr) return;
    tr.blocks = tr.blocks.filter((b) => b.id !== blockId);
    render();
  }

  // =======================================================================
  //  START TIME / ZOOM
  // =======================================================================
  els.startTime.addEventListener('change', () => {
    state.startTime = els.startTime.value || '09:00';
    render();
  });

  function setZoom(dir) {
    const i = PX_STEPS.findIndex((v) => Math.abs(v - state.pxPerMin) < 0.001);
    let idx = i === -1 ? PX_STEPS.indexOf(DEFAULT_PX) : i;
    idx = Math.min(PX_STEPS.length - 1, Math.max(0, idx + dir));
    state.pxPerMin = PX_STEPS[idx];
    render();
  }
  els.zoomIn.addEventListener('click', () => setZoom(1));
  els.zoomOut.addEventListener('click', () => setZoom(-1));

  // =======================================================================
  //  EXPORT / IMPORT
  // =======================================================================
  els.exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `konferenz-zeitplan-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Als JSON exportiert.');
  });

  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = normalizeState(JSON.parse(reader.result));
        syncInputs();
        render();
        toast('Zeitplan geladen.');
      } catch (err) {
        toast('Import fehlgeschlagen: ' + err.message);
      }
    };
    reader.readAsText(file);
    els.importFile.value = '';
  });

  els.resetBtn.addEventListener('click', () => {
    if (!confirm('Wirklich alles zurücksetzen? Nicht exportierte Änderungen gehen verloren.')) return;
    state = defaultState();
    syncInputs();
    render();
  });

  // =======================================================================
  //  MISC
  // =======================================================================
  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3000);
  }

  function syncInputs() {
    els.startTime.value = state.startTime;
  }

  els.addTrackBtn.addEventListener('click', addTrack);

  // ---- Init --------------------------------------------------------------
  syncInputs();
  render();
})();
