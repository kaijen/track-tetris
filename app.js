/* Track-Tetris – Konferenz-Rahmenzeitplaner
 * Reines Vanilla-JS, kein Backend. State im Browser, Persistenz via JSON-Export/Import.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'track-tetris-state-v1';
  const SCHEMA_VERSION = 1;

  // ---- State -------------------------------------------------------------
  /** @type {{version:number,startTime:string,templates:Array,tracks:Array}} */
  let state = loadState() || defaultState();

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      startTime: '09:00',
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

  // =======================================================================
  //  RENDER
  // =======================================================================
  function render() {
    renderTemplates();
    renderTracks();
    saveState();
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

    for (const track of state.tracks) {
      const trackEl = document.createElement('div');
      trackEl.className = 'track';
      trackEl.dataset.trackId = track.id;

      const total = trackTotal(track);
      const endMin = startMin + total;

      // Head
      const head = document.createElement('div');
      head.className = 'track-head';
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
      head.append(nameInput, delTrackBtn);

      // Meta
      const meta = document.createElement('div');
      meta.className = 'track-meta';
      meta.innerHTML = `<span>${state.startTime}–${formatTime(endMin)}</span><span>${track.blocks.length} Blöcke</span>`;

      // Blocks container
      const blocksEl = document.createElement('div');
      blocksEl.className = 'track-blocks';
      blocksEl.dataset.trackId = track.id;

      let cursor = startMin;
      for (const block of track.blocks) {
        const blockEl = buildBlockEl(track, block, cursor);
        blocksEl.appendChild(blockEl);
        cursor += block.duration;
      }
      if (track.blocks.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'empty-hint';
        hint.textContent = 'Templates hierher ziehen';
        blocksEl.appendChild(hint);
      }

      setupTrackDnD(blocksEl, track);

      // Foot
      const foot = document.createElement('div');
      foot.className = 'track-foot';
      foot.innerHTML = `<span>Gesamt</span><span>${formatDuration(total)}</span>`;

      trackEl.append(head, meta, blocksEl, foot);
      board.appendChild(trackEl);
    }

    // Add-track tile
    const addTile = document.createElement('button');
    addTile.className = 'add-track-tile';
    addTile.textContent = '+ Track hinzufügen';
    addTile.addEventListener('click', addTrack);
    board.appendChild(addTile);
  }

  function buildBlockEl(track, block, startMin) {
    const el = document.createElement('div');
    el.className = 'block';
    el.draggable = true;
    el.style.setProperty('--block-color', block.color);
    el.dataset.blockId = block.id;
    el.innerHTML = `
      <button class="block-remove" title="Entfernen">×</button>
      <div class="block-time"></div>
      <div class="block-name"></div>
      <div class="block-dur"></div>`;
    el.querySelector('.block-time').textContent =
      formatTime(startMin) + ' – ' + formatTime(startMin + block.duration);
    el.querySelector('.block-name').textContent = block.name;
    el.querySelector('.block-dur').textContent = formatDuration(block.duration);

    el.querySelector('.block-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeBlock(track.id, block.id);
    });

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
    document.querySelectorAll('.track-blocks.drag-over').forEach((b) => b.classList.remove('drag-over'));
  }

  function setupTrackDnD(blocksEl, track) {
    blocksEl.addEventListener('dragover', (e) => {
      if (!dragData) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = dragData.kind === 'template' ? 'copy' : 'move';
      blocksEl.classList.add('drag-over');
      showPlaceholder(blocksEl, e.clientY);
    });
    blocksEl.addEventListener('dragleave', (e) => {
      if (!blocksEl.contains(e.relatedTarget)) {
        blocksEl.classList.remove('drag-over');
      }
    });
    blocksEl.addEventListener('drop', (e) => {
      if (!dragData) return;
      e.preventDefault();
      const index = placeholderIndex(blocksEl);
      handleDrop(track, index);
      clearPlaceholders();
    });
  }

  function showPlaceholder(blocksEl, clientY) {
    clearPlaceholders();
    blocksEl.classList.add('drag-over');
    const ph = document.createElement('div');
    ph.className = 'block-drop-placeholder';
    const blockEls = [...blocksEl.querySelectorAll('.block:not(.dragging)')];
    const after = blockEls.find((el) => {
      const r = el.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    if (after) blocksEl.insertBefore(ph, after);
    else {
      const hint = blocksEl.querySelector('.empty-hint');
      if (hint) blocksEl.insertBefore(ph, hint);
      else blocksEl.appendChild(ph);
    }
  }

  function placeholderIndex(blocksEl) {
    const ph = blocksEl.querySelector('.block-drop-placeholder');
    if (!ph) return findTrack(blocksEl.dataset.trackId).blocks.length;
    let idx = 0;
    for (const child of blocksEl.children) {
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
      };
      targetTrack.blocks.splice(index, 0, block);
    } else if (dragData.kind === 'block') {
      const srcTrack = findTrack(dragData.trackId);
      if (!srcTrack) return;
      const srcIdx = srcTrack.blocks.findIndex((b) => b.id === dragData.blockId);
      if (srcIdx === -1) return;
      const [moved] = srcTrack.blocks.splice(srcIdx, 1);
      let insertAt = index;
      // Korrektur, wenn innerhalb desselben Tracks nach vorne verschoben
      if (srcTrack === targetTrack && srcIdx < index) insertAt = index - 1;
      targetTrack.blocks.splice(insertAt, 0, moved);
    }
    render();
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
    const name = prompt('Template-Name:', tpl.name);
    if (name === null) return;
    const durStr = prompt('Dauer in Minuten:', String(tpl.duration));
    if (durStr === null) return;
    tpl.name = name.trim() || tpl.name;
    tpl.duration = clampDuration(durStr);
    render();
    toast('Template aktualisiert. Bereits platzierte Blöcke bleiben unverändert.');
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
  //  START TIME
  // =======================================================================
  els.startTime.addEventListener('change', () => {
    state.startTime = els.startTime.value || '09:00';
    render();
  });

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
