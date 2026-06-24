/* Track-Tetris – Desktop-Oberfläche.
 * Nutzt window.TT (core.js). Hier nur Darstellung, Drag & Drop, Modal, Datei-I/O.
 */
(() => {
  'use strict';

  const {
    getState, subscribe, formatTime, formatDuration, tickMinutes,
    findTrack, computeSchedule, blocksDur, trackSegment, trackTotalDuration,
  } = TT;

  const MIN_SEG_EMPTY = 48; // px Höhe für (sichtbare) leere Abschnitte
  const MIN_PLEN = 30;      // px Mindesthöhe Plenum-Band
  const SLIM_SEG = 16;      // px Höhe für ausgeblendete leere Abschnitte

  const els = {
    startTime: document.getElementById('startTime'),
    templateForm: document.getElementById('templateForm'),
    tplName: document.getElementById('tplName'),
    tplDuration: document.getElementById('tplDuration'),
    tplColor: document.getElementById('tplColor'),
    tplBlocking: document.getElementById('tplBlocking'),
    templateList: document.getElementById('templateList'),
    trackBoard: document.getElementById('trackBoard'),
    addTrackBtn: document.getElementById('addTrackBtn'),
    addPlenumBtn: document.getElementById('addPlenumBtn'),
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
      li.className = 'template-chip' + (tpl.blocking ? ' is-blocking' : '');
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
      li.querySelector('.tpl-name').textContent = (tpl.blocking ? '🔒 ' : '') + tpl.name;
      li.querySelector('.tpl-dur').textContent =
        formatDuration(tpl.duration) + (tpl.blocking ? ' · Plenum' : '');
      li.addEventListener('dragstart', (e) => {
        dragData = { kind: 'template', templateId: tpl.id, blocking: tpl.blocking };
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', tpl.id);
      });
      li.addEventListener('dragend', () => { li.classList.remove('dragging'); dragData = null; clearPlaceholders(); });
      li.querySelector('[data-act="edit"]').addEventListener('click', () => editTemplate(tpl.id));
      li.querySelector('[data-act="del"]').addEventListener('click', () => deleteTemplate(tpl.id));
      list.appendChild(li);
    }
  }

  function renderTracks(state) {
    const board = els.trackBoard;
    board.innerHTML = '';
    const px = state.pxPerMin;
    const tick = tickMinutes(px);
    const schedule = computeSchedule();
    const hidden = TT.hiddenSegments();
    const rows = schedule.rows;

    // Pixelhöhe je Zeile – identisch für Lineal und Tracks. Komplett leere
    // Abschnitte (dur 0) werden zu einem schmalen "+ Parallel"-Streifen.
    const rowPx = rows.map((r) => {
      if (r.kind === 'plen') return Math.max(r.dur * px, MIN_PLEN);
      if (hidden.has(r.index)) return SLIM_SEG;
      return r.dur > 0 ? r.dur * px : MIN_SEG_EMPTY;
    });

    board.style.setProperty('--tick-px', (tick * px) + 'px');

    // --- Lineal-Lane ---
    const rulerLane = document.createElement('div');
    rulerLane.className = 'lane ruler-lane';
    const rulerHead = document.createElement('div');
    rulerHead.className = 'lane-head';
    rulerHead.innerHTML = '<div class="track-meta"><span>Zeit</span></div>';
    const rulerBody = document.createElement('div');
    rulerBody.className = 'ruler-body';
    rows.forEach((r, idx) => {
      const slim = r.kind === 'seg' && hidden.has(r.index);
      const cell = document.createElement('div');
      cell.className = 'ruler-cell ' + (r.kind === 'plen' ? 'is-plen' : 'is-seg');
      cell.style.height = rowPx[idx] + 'px';
      // Zeit-Label nur, wenn es echte Zeit markiert (ausgeblendete 0-Min-
      // Abschnitte hätten dieselbe Zeit wie das folgende Plenum -> weglassen)
      if (!slim) cell.innerHTML = `<span class="ruler-time">${formatTime(r.start)}</span>`;
      if (r.kind === 'seg' && !slim) {
        const ins = document.createElement('button');
        ins.className = 'ruler-insert';
        ins.title = 'Plenum nach diesem Abschnitt einfügen';
        ins.textContent = '+ Plenum';
        ins.addEventListener('click', () => addPlenum(r.index));
        cell.appendChild(ins);
      }
      rulerBody.appendChild(cell);
    });
    // Endzeit-Label
    const endCell = document.createElement('div');
    endCell.className = 'ruler-cell is-end';
    endCell.innerHTML = `<span class="ruler-time">${formatTime(schedule.totalEnd)}</span>`;
    rulerBody.appendChild(endCell);
    rulerLane.append(rulerHead, rulerBody);
    board.appendChild(rulerLane);

    // --- Track-Lanes ---
    for (const track of state.tracks) {
      const lane = document.createElement('div');
      lane.className = 'lane';
      lane.dataset.trackId = track.id;

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
      const total = trackTotalDuration(track);
      meta.innerHTML = `<span>Σ ${formatDuration(total)}</span>`;
      head.append(nameRow, meta);

      const body = document.createElement('div');
      body.className = 'lane-body';
      rows.forEach((r, idx) => {
        if (r.kind === 'plen') {
          body.appendChild(buildPlenumBar(r.block, r.start, rowPx[idx]));
        } else {
          body.appendChild(buildSegZone(track, r.index, r.start, r.dur, px, rowPx[idx], hidden.has(r.index)));
        }
      });

      lane.append(head, body);
      board.appendChild(lane);
    }

    const addTile = document.createElement('button');
    addTile.className = 'add-track-tile';
    addTile.textContent = '+ Track';
    addTile.addEventListener('click', () => TT.addTrack());
    board.appendChild(addTile);
  }

  function buildPlenumBar(block, startMin, heightPx) {
    const el = document.createElement('div');
    el.className = 'plenum-bar';
    el.style.setProperty('--block-color', block.color);
    el.style.height = heightPx + 'px';
    el.title = `Plenum: ${block.name} · ${formatTime(startMin)}–${formatTime(startMin + block.duration)} (alle Tracks)`;
    el.innerHTML = `
      <div class="plenum-actions">
        <button class="act-edit" title="Bearbeiten">✎</button>
        <button class="act-del" title="Plenum entfernen">×</button>
      </div>
      <span class="plenum-name"></span>
      <span class="plenum-time"></span>`;
    el.querySelector('.plenum-name').textContent = '🔒 ' + block.name;
    el.querySelector('.plenum-time').textContent =
      formatTime(startMin) + '–' + formatTime(startMin + block.duration);
    el.querySelector('.act-edit').addEventListener('click', () => editPlenum(block.id));
    el.querySelector('.act-del').addEventListener('click', () => TT.removeBlocking(block.id));
    return el;
  }

  function buildSegZone(track, segIndex, segStart, segDur, px, heightPx, slim) {
    const zone = document.createElement('div');
    zone.className = 'seg-zone' + (slim ? ' is-slim' : '');
    zone.style.height = heightPx + 'px';
    zone.dataset.trackId = track.id;
    zone.dataset.segIndex = String(segIndex);

    if (slim) {
      // Komplett leerer Abschnitt: nur dezenter Drop-Streifen
      const hint = document.createElement('div');
      hint.className = 'seg-slim-hint';
      hint.textContent = '+ Parallel';
      hint.title = 'Hier Parallel-Programm einfügen (Template hierher ziehen)';
      zone.appendChild(hint);
      setupSegDnD(zone, track, segIndex);
      return zone;
    }

    const blocks = trackSegment(track, segIndex);
    let cursor = segStart;
    for (const block of blocks) {
      zone.appendChild(buildBlockEl(track, segIndex, block, cursor, px));
      cursor += block.duration;
    }

    const used = blocksDur(blocks);
    if (blocks.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'seg-empty';
      hint.textContent = '⊕';
      hint.title = 'Templates hierher ziehen';
      zone.appendChild(hint);
    } else if (segDur - used > 0) {
      // „Wartezeit" bis zum nächsten Plenum (kürzerer Track)
      const wait = document.createElement('div');
      wait.className = 'seg-wait';
      wait.style.height = (segDur - used) * px + 'px';
      wait.title = `wartet ${formatDuration(segDur - used)} bis zum nächsten Plenum`;
      zone.appendChild(wait);
    }

    setupSegDnD(zone, track, segIndex);
    return zone;
  }

  function buildBlockEl(track, segIndex, block, startMin, px) {
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
    el.querySelector('.act-del').addEventListener('click', (e) => { e.stopPropagation(); TT.removeBlock(track.id, segIndex, block.id); });
    el.querySelector('.act-edit').addEventListener('click', (e) => { e.stopPropagation(); editBlock(track.id, segIndex, block.id); });
    el.addEventListener('dblclick', () => editBlock(track.id, segIndex, block.id));

    el.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      dragData = { kind: 'block', trackId: track.id, segIndex, blockId: block.id };
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', block.id);
    });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragData = null; clearPlaceholders(); });
    return el;
  }

  // =======================================================================
  //  DRAG & DROP
  // =======================================================================
  let dragData = null;

  function clearPlaceholders() {
    document.querySelectorAll('.block-drop-placeholder').forEach((p) => p.remove());
    document.querySelectorAll('.seg-zone.drag-over').forEach((b) => b.classList.remove('drag-over'));
  }

  function setupSegDnD(zone, track, segIndex) {
    zone.addEventListener('dragover', (e) => {
      if (!dragData) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = dragData.kind === 'template' ? 'copy' : 'move';
      zone.classList.add('drag-over');
      showPlaceholder(zone, e.clientY);
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
      if (!dragData) return;
      e.preventDefault();
      if (dragData.kind === 'template') {
        const tpl = getState().templates.find((t) => t.id === dragData.templateId);
        if (tpl && tpl.blocking) {
          // Blocking-Template -> Plenum an der nächstgelegenen Abschnittsgrenze
          const rect = zone.getBoundingClientRect();
          const upper = e.clientY < rect.top + rect.height / 2;
          const at = Math.max(0, upper ? segIndex - 1 : segIndex);
          TT.addBlocking({ name: tpl.name, duration: tpl.duration, color: tpl.color }, at);
        } else {
          TT.addBlockFromTemplate(dragData.templateId, track.id, segIndex, placeholderIndex(zone));
        }
      } else if (dragData.kind === 'block') {
        TT.moveBlock(dragData.trackId, dragData.segIndex, dragData.blockId, track.id, segIndex, placeholderIndex(zone));
      }
      clearPlaceholders();
    });
  }

  function showPlaceholder(zone, clientY) {
    clearPlaceholders();
    zone.classList.add('drag-over');
    const ph = document.createElement('div');
    ph.className = 'block-drop-placeholder';
    if (dragData && dragData.blocking) {
      // Blocking-Template: Plenum oben oder unten am Abschnitt
      ph.classList.add('plenum-drop');
      const rect = zone.getBoundingClientRect();
      const upper = clientY < rect.top + rect.height / 2;
      if (upper) zone.insertBefore(ph, zone.firstChild);
      else zone.appendChild(ph);
      return;
    }
    const blockEls = [...zone.querySelectorAll('.block:not(.dragging)')];
    const after = blockEls.find((el) => {
      const r = el.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    if (after) zone.insertBefore(ph, after);
    else {
      const filler = zone.querySelector('.seg-empty, .seg-wait');
      if (filler) zone.insertBefore(ph, filler);
      else zone.appendChild(ph);
    }
  }

  function placeholderIndex(zone) {
    const ph = zone.querySelector('.block-drop-placeholder');
    if (!ph) return trackSegment(findTrack(zone.dataset.trackId), Number(zone.dataset.segIndex)).length;
    let idx = 0;
    for (const child of zone.children) {
      if (child === ph) break;
      if (child.classList.contains('block') && !child.classList.contains('dragging')) idx++;
    }
    return idx;
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
      input.type = f.type === 'check' ? 'checkbox' : (f.type || 'text');
      if (f.type === 'check') { input.checked = !!f.value; wrap.classList.add('is-check'); }
      else { input.value = f.value ?? ''; }
      if (f.type === 'number') { input.min = '1'; input.step = '1'; }
      const id = 'mf-' + f.key;
      input.id = id; label.htmlFor = id;
      if (f.type === 'check') wrap.append(input, label);
      else wrap.append(label, input);
      els.modalFields.appendChild(wrap);
      inputs[f.key] = input;
    }
    modalSubmit = () => {
      const v = {};
      for (const k of Object.keys(inputs)) {
        const el = inputs[k];
        v[k] = el.type === 'checkbox' ? el.checked : el.value;
      }
      onSave(v);
    };
    els.modal.hidden = false;
    const first = els.modalFields.querySelector('input');
    if (first) { first.focus(); first.select(); }
  }
  function closeModal() { els.modal.hidden = true; modalSubmit = null; }
  els.modalForm.addEventListener('submit', (e) => { e.preventDefault(); if (modalSubmit) modalSubmit(); closeModal(); });
  els.modalCancel.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !els.modal.hidden) closeModal(); });

  // =======================================================================
  //  EDIT ACTIONS
  // =======================================================================
  function editBlock(trackId, segIndex, blockId) {
    const tr = findTrack(trackId);
    const block = tr && (tr.segments[segIndex] || []).find((b) => b.id === blockId);
    if (!block) return;
    const fields = [
      { key: 'name', label: 'Name', type: 'text', value: block.name },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: block.duration },
    ];
    if (!block.isGap) fields.push({ key: 'color', label: 'Farbe', type: 'color', value: block.color });
    openModal(block.isGap ? 'Lücke bearbeiten' : 'Block bearbeiten', fields, (v) => TT.updateBlock(trackId, segIndex, blockId, v));
  }

  function addPlenum(atIndex) {
    openModal('Plenum-Block (alle Tracks)', [
      { key: 'name', label: 'Bezeichnung', type: 'text', value: 'Keynote' },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: 45 },
      { key: 'color', label: 'Farbe', type: 'color', value: '#5566d6' },
    ], (v) => TT.addBlocking(v, atIndex));
  }

  function editPlenum(id) {
    const p = getState().spine.find((x) => x.id === id);
    if (!p) return;
    openModal('Plenum bearbeiten', [
      { key: 'name', label: 'Bezeichnung', type: 'text', value: p.name },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: p.duration },
      { key: 'color', label: 'Farbe', type: 'color', value: p.color },
    ], (v) => TT.updateBlocking(id, v));
  }

  function editTemplate(id) {
    const tpl = getState().templates.find((t) => t.id === id);
    if (!tpl) return;
    openModal('Template bearbeiten', [
      { key: 'name', label: 'Name', type: 'text', value: tpl.name },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: tpl.duration },
      { key: 'color', label: 'Farbe', type: 'color', value: tpl.color },
      { key: 'blocking', label: '🔒 Blocking (Plenum über alle Tracks)', type: 'check', value: tpl.blocking },
    ], (v) => { TT.updateTemplate(id, v); toast('Template aktualisiert. Bereits platzierte Blöcke bleiben unverändert.'); });
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
    const count = tr.segments.reduce((s, seg) => s + seg.length, 0);
    if (count > 0 && !confirm(`Track „${tr.name}" mit ${count} Blöcken löschen?`)) return;
    if (!TT.deleteTrack(id)) toast('Mindestens ein Track muss bestehen bleiben.');
  }

  // =======================================================================
  //  CONTROLS
  // =======================================================================
  els.templateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const created = TT.addTemplate({
      name: els.tplName.value, duration: els.tplDuration.value,
      color: els.tplColor.value, blocking: els.tplBlocking.checked,
    });
    if (created) { els.tplName.value = ''; els.tplDuration.value = '30'; els.tplBlocking.checked = false; els.tplName.focus(); }
  });

  els.startTime.addEventListener('change', () => TT.setStartTime(els.startTime.value));
  els.zoomIn.addEventListener('click', () => TT.stepZoom(1));
  els.zoomOut.addEventListener('click', () => TT.stepZoom(-1));
  els.addTrackBtn.addEventListener('click', () => TT.addTrack());
  els.addPlenumBtn.addEventListener('click', () => addPlenum(null));

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

  subscribe(render);
  render();
})();
