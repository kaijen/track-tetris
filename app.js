/* Track-Tetris – Desktop-Oberfläche.
 * Nutzt window.TT (core.js) für State/Logik; hier nur Darstellung, Drag & Drop,
 * Modal-Dialog und Datei-Im-/Export.
 */
(() => {
  'use strict';

  const {
    getState, subscribe, parseTime, formatTime, formatDuration, tickMinutes,
    clampDuration, validColor, findTrack, trackTotal,
  } = TT;

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

  // =======================================================================
  //  RENDER
  // =======================================================================
  function render() {
    const state = getState();
    els.startTime.value = state.startTime;
    els.zoomLabel.textContent = state.pxPerMin.toFixed(1) + ' px/min';
    renderTemplates(state);
    renderTracks(state);
  }

  function renderTemplates(state) {
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

  function renderTracks(state) {
    const board = els.trackBoard;
    board.innerHTML = '';
    const startMin = parseTime(state.startTime);
    const px = state.pxPerMin;
    const tick = tickMinutes(px);
    const tickPx = tick * px;

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

      const head = document.createElement('div');
      head.className = 'lane-head';

      const nameRow = document.createElement('div');
      nameRow.className = 'track-name-row';
      const nameInput = document.createElement('input');
      nameInput.className = 'track-name';
      nameInput.value = track.name;
      nameInput.addEventListener('change', () => TT.renameTrack(track.id, nameInput.value));
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

    const addTile = document.createElement('button');
    addTile.className = 'add-track-tile';
    addTile.textContent = '+ Track';
    addTile.addEventListener('click', () => TT.addTrack());
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
      TT.removeBlock(track.id, block.id);
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
  let dragData = null;

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
      if (!canvas.contains(e.relatedTarget)) canvas.classList.remove('drag-over');
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
      TT.addBlockFromTemplate(dragData.templateId, targetTrack.id, index);
    } else if (dragData.kind === 'block') {
      TT.moveBlock(dragData.trackId, dragData.blockId, targetTrack.id, index);
    }
  }

  // =======================================================================
  //  MODAL
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
  function closeModal() { els.modal.hidden = true; modalSubmit = null; }

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
  //  EDIT ACTIONS
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
      TT.updateBlock(trackId, blockId, v);
    });
  }

  function addGap(trackId) {
    openModal('Lücke / Pause einfügen', [
      { key: 'name', label: 'Bezeichnung', type: 'text', value: 'Pause' },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: 15 },
    ], (v) => TT.addGap(trackId, v));
  }

  function editTemplate(id) {
    const tpl = getState().templates.find((t) => t.id === id);
    if (!tpl) return;
    openModal('Template bearbeiten', [
      { key: 'name', label: 'Name', type: 'text', value: tpl.name },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: tpl.duration },
      { key: 'color', label: 'Farbe', type: 'color', value: tpl.color },
    ], (v) => {
      TT.updateTemplate(id, v);
      toast('Template aktualisiert. Bereits platzierte Blöcke bleiben unverändert.');
    });
  }

  function deleteTemplate(id) {
    const tpl = getState().templates.find((t) => t.id === id);
    if (!tpl) return;
    if (!confirm(`Template „${tpl.name}" löschen? Bereits platzierte Blöcke bleiben erhalten.`)) return;
    TT.deleteTemplate(id);
  }

  function deleteTrack(id) {
    const tr = findTrack(id);
    if (!tr) return;
    if (tr.blocks.length > 0 && !confirm(`Track „${tr.name}" mit ${tr.blocks.length} Blöcken löschen?`)) return;
    if (!TT.deleteTrack(id)) toast('Mindestens ein Track muss bestehen bleiben.');
  }

  // =======================================================================
  //  FORMS / CONTROLS
  // =======================================================================
  els.templateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const created = TT.addTemplate({
      name: els.tplName.value,
      duration: els.tplDuration.value,
      color: els.tplColor.value,
    });
    if (created) {
      els.tplName.value = '';
      els.tplDuration.value = '30';
      els.tplName.focus();
    }
  });

  els.startTime.addEventListener('change', () => TT.setStartTime(els.startTime.value));
  els.zoomIn.addEventListener('click', () => TT.stepZoom(1));
  els.zoomOut.addEventListener('click', () => TT.stepZoom(-1));
  els.addTrackBtn.addEventListener('click', () => TT.addTrack());

  // =======================================================================
  //  EXPORT / IMPORT
  // =======================================================================
  els.exportBtn.addEventListener('click', () => {
    const blob = new Blob([TT.toJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `konferenz-zeitplan-${new Date().toISOString().slice(0, 10)}.json`;
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
      try { TT.importJSON(reader.result); toast('Zeitplan geladen.'); }
      catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
    };
    reader.readAsText(file);
    els.importFile.value = '';
  });

  els.resetBtn.addEventListener('click', () => {
    if (!confirm('Wirklich alles zurücksetzen? Nicht exportierte Änderungen gehen verloren.')) return;
    TT.reset();
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

  // ---- Init --------------------------------------------------------------
  subscribe(render);
  render();
})();
