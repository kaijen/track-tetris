/* Track-Tetris – Mobil-Oberfläche (touch-first).
 * Nutzt window.TT (core.js). Kein Drag & Drop: Templates antippen fügt hinzu,
 * Blöcke werden per ↑/↓ umsortiert.
 */
(() => {
  'use strict';

  const { getState, subscribe, parseTime, formatTime, formatDuration, findTrack, trackTotal } = TT;

  const els = {
    startTime: document.getElementById('startTime'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    resetBtn: document.getElementById('resetBtn'),
    trackTabs: document.getElementById('trackTabs'),
    trackSummary: document.getElementById('trackSummary'),
    renameTrackBtn: document.getElementById('renameTrackBtn'),
    delTrackBtn: document.getElementById('delTrackBtn'),
    blockList: document.getElementById('blockList'),
    addGapBtn: document.getElementById('addGapBtn'),
    tplButtons: document.getElementById('tplButtons'),
    templateForm: document.getElementById('templateForm'),
    tplName: document.getElementById('tplName'),
    tplDuration: document.getElementById('tplDuration'),
    tplColor: document.getElementById('tplColor'),
    tplManageList: document.getElementById('tplManageList'),
    toast: document.getElementById('toast'),
    modal: document.getElementById('modal'),
    modalForm: document.getElementById('modalForm'),
    modalTitle: document.getElementById('modalTitle'),
    modalFields: document.getElementById('modalFields'),
    modalCancel: document.getElementById('modalCancel'),
  };

  let activeTrackId = null;

  function activeTrack(state) {
    let tr = state.tracks.find((t) => t.id === activeTrackId);
    if (!tr) { tr = state.tracks[0]; activeTrackId = tr ? tr.id : null; }
    return tr;
  }

  // =======================================================================
  //  RENDER
  // =======================================================================
  function render() {
    const state = getState();
    els.startTime.value = state.startTime;
    renderTabs(state);
    renderPanel(state);
    renderPalette(state);
    renderManage(state);
  }

  function renderTabs(state) {
    const tr = activeTrack(state);
    els.trackTabs.innerHTML = '';
    for (const track of state.tracks) {
      const b = document.createElement('button');
      b.className = 'm-tab' + (track === tr ? ' active' : '');
      b.textContent = track.name;
      b.addEventListener('click', () => { activeTrackId = track.id; render(); });
      els.trackTabs.appendChild(b);
    }
    const add = document.createElement('button');
    add.className = 'm-tab m-tab-add';
    add.textContent = '+';
    add.title = 'Track hinzufügen';
    add.addEventListener('click', () => { const t = TT.addTrack(); activeTrackId = t.id; });
    els.trackTabs.appendChild(add);
  }

  function renderPanel(state) {
    const track = activeTrack(state);
    if (!track) return;
    const startMin = parseTime(state.startTime);
    const total = trackTotal(track);
    els.trackSummary.textContent =
      `${state.startTime}–${formatTime(startMin + total)} · ${formatDuration(total)} · ${track.blocks.length} Blöcke`;

    const list = els.blockList;
    list.innerHTML = '';
    if (track.blocks.length === 0) {
      list.innerHTML = '<li class="m-empty">Noch leer – unten ein Template antippen.</li>';
      return;
    }
    let cursor = startMin;
    track.blocks.forEach((block, i) => {
      const start = cursor;
      cursor += block.duration;
      const li = document.createElement('li');
      li.className = 'm-block' + (block.isGap ? ' is-gap' : '');
      li.style.setProperty('--block-color', block.color);
      li.innerHTML = `
        <div class="m-block-main">
          <div class="m-block-time"></div>
          <div class="m-block-name"></div>
          <div class="m-block-dur"></div>
        </div>
        <div class="m-block-ctrls">
          <button class="c-up" title="Nach oben" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="c-edit" title="Bearbeiten">✎</button>
          <button class="c-down" title="Nach unten" ${i === track.blocks.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="c-del" title="Entfernen">🗑</button>
        </div>`;
      li.querySelector('.m-block-time').textContent = formatTime(start) + ' – ' + formatTime(start + block.duration);
      li.querySelector('.m-block-name').textContent = block.name;
      li.querySelector('.m-block-dur').textContent = formatDuration(block.duration);
      li.querySelector('.c-up').addEventListener('click', () => TT.nudgeBlock(track.id, block.id, -1));
      li.querySelector('.c-down').addEventListener('click', () => TT.nudgeBlock(track.id, block.id, 1));
      li.querySelector('.c-edit').addEventListener('click', () => editBlock(track.id, block.id));
      li.querySelector('.c-del').addEventListener('click', () => TT.removeBlock(track.id, block.id));
      list.appendChild(li);
    });
  }

  function renderPalette(state) {
    const track = activeTrack(state);
    els.tplButtons.innerHTML = '';
    if (state.templates.length === 0) {
      els.tplButtons.innerHTML = '<span class="m-empty">Keine Templates – unten anlegen.</span>';
      return;
    }
    for (const tpl of state.templates) {
      const b = document.createElement('button');
      b.className = 'm-tpl-add';
      b.style.setProperty('--chip-color', tpl.color);
      b.innerHTML = `<div>${escapeHtml(tpl.name)}</div><div class="d">${formatDuration(tpl.duration)}</div>`;
      b.addEventListener('click', () => {
        if (!track) return;
        TT.addBlockFromTemplate(tpl.id, track.id, null);
        toast(`„${tpl.name}" zu ${track.name} hinzugefügt.`);
      });
      els.tplButtons.appendChild(b);
    }
  }

  function renderManage(state) {
    const list = els.tplManageList;
    list.innerHTML = '';
    for (const tpl of state.templates) {
      const li = document.createElement('li');
      li.style.setProperty('--chip-color', tpl.color);
      li.innerHTML = `
        <span class="name"></span>
        <span class="dur"></span>
        <button data-act="edit" title="Bearbeiten">✎</button>
        <button data-act="del" title="Löschen">🗑</button>`;
      li.querySelector('.name').textContent = tpl.name;
      li.querySelector('.dur').textContent = formatDuration(tpl.duration);
      li.querySelector('[data-act="edit"]').addEventListener('click', () => editTemplate(tpl.id));
      li.querySelector('[data-act="del"]').addEventListener('click', () => deleteTemplate(tpl.id));
      list.appendChild(li);
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
      if (f.type === 'number') { input.min = '1'; input.step = '1'; input.inputMode = 'numeric'; }
      const id = 'mf-' + f.key;
      input.id = id; label.htmlFor = id;
      wrap.append(label, input);
      els.modalFields.appendChild(wrap);
      inputs[f.key] = input;
    }
    modalSubmit = () => {
      const v = {};
      for (const k of Object.keys(inputs)) v[k] = inputs[k].value;
      onSave(v);
    };
    els.modal.hidden = false;
  }
  function closeModal() { els.modal.hidden = true; modalSubmit = null; }

  els.modalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (modalSubmit) modalSubmit();
    closeModal();
  });
  els.modalCancel.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });

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
    openModal(block.isGap ? 'Lücke bearbeiten' : 'Block bearbeiten', fields, (v) => TT.updateBlock(trackId, blockId, v));
  }

  function editTemplate(id) {
    const tpl = getState().templates.find((t) => t.id === id);
    if (!tpl) return;
    openModal('Template bearbeiten', [
      { key: 'name', label: 'Name', type: 'text', value: tpl.name },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: tpl.duration },
      { key: 'color', label: 'Farbe', type: 'color', value: tpl.color },
    ], (v) => { TT.updateTemplate(id, v); toast('Template aktualisiert.'); });
  }

  function deleteTemplate(id) {
    const tpl = getState().templates.find((t) => t.id === id);
    if (!tpl) return;
    if (!confirm(`Template „${tpl.name}" löschen?`)) return;
    TT.deleteTemplate(id);
  }

  // =======================================================================
  //  CONTROLS
  // =======================================================================
  els.addGapBtn.addEventListener('click', () => {
    const track = activeTrack(getState());
    if (!track) return;
    openModal('Pause / Lücke einfügen', [
      { key: 'name', label: 'Bezeichnung', type: 'text', value: 'Pause' },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: 15 },
    ], (v) => TT.addGap(track.id, v));
  });

  els.renameTrackBtn.addEventListener('click', () => {
    const track = activeTrack(getState());
    if (!track) return;
    openModal('Track umbenennen', [
      { key: 'name', label: 'Name', type: 'text', value: track.name },
    ], (v) => TT.renameTrack(track.id, v.name));
  });

  els.delTrackBtn.addEventListener('click', () => {
    const track = activeTrack(getState());
    if (!track) return;
    if (track.blocks.length > 0 && !confirm(`Track „${track.name}" mit ${track.blocks.length} Blöcken löschen?`)) return;
    if (!TT.deleteTrack(track.id)) { toast('Mindestens ein Track muss bleiben.'); return; }
    activeTrackId = null;
  });

  els.templateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const created = TT.addTemplate({ name: els.tplName.value, duration: els.tplDuration.value, color: els.tplColor.value });
    if (created) { els.tplName.value = ''; els.tplDuration.value = '30'; toast('Template angelegt.'); }
  });

  els.startTime.addEventListener('change', () => TT.setStartTime(els.startTime.value));

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
    if (!confirm('Wirklich alles zurücksetzen?')) return;
    TT.reset();
    activeTrackId = null;
  });

  // =======================================================================
  //  MISC
  // =======================================================================
  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2500);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- Init --------------------------------------------------------------
  subscribe(render);
  render();
})();
