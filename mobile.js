/* Track-Tetris – Mobil-Oberfläche (touch-first).
 * Nutzt window.TT (core.js). Kein Drag & Drop: Templates antippen fügt zum
 * gewählten Abschnitt hinzu; Blöcke per ↑/↓ sortieren. Plenum-Blöcke gelten
 * über alle Tracks und erscheinen daher in jedem Track-Tab.
 */
(() => {
  'use strict';

  const { getState, subscribe, formatTime, formatDuration, findTrack, computeSchedule, trackTotalDuration } = TT;

  const els = {
    startTime: document.getElementById('startTime'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    resetBtn: document.getElementById('resetBtn'),
    trackTabs: document.getElementById('trackTabs'),
    trackSummary: document.getElementById('trackSummary'),
    addPlenumBtn: document.getElementById('addPlenumBtn'),
    renameTrackBtn: document.getElementById('renameTrackBtn'),
    delTrackBtn: document.getElementById('delTrackBtn'),
    blockList: document.getElementById('blockList'),
    addGapBtn: document.getElementById('addGapBtn'),
    tplButtons: document.getElementById('tplButtons'),
    addTarget: document.getElementById('addTarget'),
    templateForm: document.getElementById('templateForm'),
    tplName: document.getElementById('tplName'),
    tplDuration: document.getElementById('tplDuration'),
    tplColor: document.getElementById('tplColor'),
    tplBlocking: document.getElementById('tplBlocking'),
    tplManageList: document.getElementById('tplManageList'),
    toast: document.getElementById('toast'),
    modal: document.getElementById('modal'),
    modalForm: document.getElementById('modalForm'),
    modalTitle: document.getElementById('modalTitle'),
    modalFields: document.getElementById('modalFields'),
    modalCancel: document.getElementById('modalCancel'),
  };

  let activeTrackId = null;
  let activeSeg = 0;

  function activeTrack(state) {
    let tr = state.tracks.find((t) => t.id === activeTrackId);
    if (!tr) { tr = state.tracks[0]; activeTrackId = tr ? tr.id : null; }
    return tr;
  }
  function clampSeg(state) {
    const count = state.spine.length + 1;
    if (activeSeg < 0 || activeSeg >= count) activeSeg = count - 1;
  }

  // =======================================================================
  //  RENDER
  // =======================================================================
  function render() {
    const state = getState();
    clampSeg(state);
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
    const { rows, totalEnd } = computeSchedule();
    els.trackSummary.textContent =
      `${state.startTime}–${formatTime(totalEnd)} · Σ ${formatDuration(trackTotalDuration(track))}`;

    const list = els.blockList;
    list.innerHTML = '';
    for (const r of rows) {
      if (r.kind === 'plen') {
        list.appendChild(buildPlenumItem(r.block, r.start));
      } else {
        buildSegGroup(state, track, r, list);
      }
    }
  }

  function buildPlenumItem(block, startMin) {
    const li = document.createElement('li');
    li.className = 'm-plenum';
    li.style.setProperty('--block-color', block.color);
    li.innerHTML = `
      <div class="m-block-main">
        <div class="m-block-time"></div>
        <div class="m-block-name"></div>
      </div>
      <div class="m-block-ctrls m-plenum-ctrls">
        <button class="c-edit" title="Bearbeiten">✎</button>
        <button class="c-del" title="Plenum entfernen">🗑</button>
      </div>`;
    li.querySelector('.m-block-time').textContent =
      formatTime(startMin) + ' – ' + formatTime(startMin + block.duration) + ' · alle Tracks';
    li.querySelector('.m-block-name').textContent = '🔒 ' + block.name;
    li.querySelector('.c-edit').addEventListener('click', () => editPlenum(block.id));
    li.querySelector('.c-del').addEventListener('click', () => TT.removeBlocking(block.id));
    return li;
  }

  function buildSegGroup(state, track, row, list) {
    const segIndex = row.index;
    const blocks = track.segments[segIndex] || [];
    const isTarget = segIndex === activeSeg;

    const header = document.createElement('li');
    header.className = 'm-seg-head' + (isTarget ? ' target' : '');
    header.innerHTML = `<span></span><span class="m-seg-pick">${isTarget ? '● Ziel' : 'hierher'}</span>`;
    header.querySelector('span').textContent =
      (state.spine.length ? `Abschnitt ${segIndex + 1}` : 'Programm') + ' · ab ' + formatTime(row.start);
    header.addEventListener('click', () => { activeSeg = segIndex; render(); });
    list.appendChild(header);

    if (blocks.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'm-empty';
      empty.textContent = isTarget ? 'leer – unten Template antippen' : 'leer';
      list.appendChild(empty);
      return;
    }
    let cursor = row.start;
    blocks.forEach((block, i) => {
      const start = cursor;
      cursor += block.duration;
      const li = document.createElement('li');
      li.className = 'm-block' + (block.isGap ? ' is-gap' : '');
      li.style.setProperty('--block-color', block.color);
      li.dataset.seg = String(segIndex);
      li.dataset.track = track.id;
      li.dataset.blockId = block.id;
      li.innerHTML = `
        <div class="m-drag-handle" title="Ziehen zum Sortieren">⠿</div>
        <div class="m-block-main">
          <div class="m-block-time"></div>
          <div class="m-block-name"></div>
          <div class="m-block-dur"></div>
        </div>
        <div class="m-block-ctrls">
          <button class="c-up" title="Nach oben" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="c-edit" title="Bearbeiten">✎</button>
          <button class="c-down" title="Nach unten" ${i === blocks.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="c-del" title="Entfernen">🗑</button>
        </div>`;
      setupDragHandle(li.querySelector('.m-drag-handle'), li);
      li.querySelector('.m-block-time').textContent = formatTime(start) + ' – ' + formatTime(start + block.duration);
      li.querySelector('.m-block-name').textContent = block.name;
      li.querySelector('.m-block-dur').textContent = formatDuration(block.duration);
      li.querySelector('.c-up').addEventListener('click', () => TT.nudgeBlock(track.id, segIndex, block.id, -1));
      li.querySelector('.c-down').addEventListener('click', () => TT.nudgeBlock(track.id, segIndex, block.id, 1));
      li.querySelector('.c-edit').addEventListener('click', () => editBlock(track.id, segIndex, block.id));
      li.querySelector('.c-del').addEventListener('click', () => TT.removeBlock(track.id, segIndex, block.id));
      list.appendChild(li);
    });
  }

  function renderPalette(state) {
    const track = activeTrack(state);
    els.addTarget.textContent = state.spine.length ? `→ Abschnitt ${activeSeg + 1}` : '';
    els.tplButtons.innerHTML = '';
    if (state.templates.length === 0) {
      els.tplButtons.innerHTML = '<span class="m-empty">Keine Templates – unten anlegen.</span>';
      return;
    }
    for (const tpl of state.templates) {
      const b = document.createElement('button');
      b.className = 'm-tpl-add' + (tpl.blocking ? ' is-blocking' : '');
      b.style.setProperty('--chip-color', tpl.color);
      b.innerHTML = `<div>${(tpl.blocking ? '🔒 ' : '') + escapeHtml(tpl.name)}</div>` +
        `<div class="d">${formatDuration(tpl.duration)}${tpl.blocking ? ' · Plenum' : ''}</div>`;
      b.addEventListener('click', () => {
        if (!track) return;
        if (tpl.blocking) {
          TT.addBlocking({ name: tpl.name, duration: tpl.duration, color: tpl.color }, activeSeg);
          toast(`Plenum „${tpl.name}" hinzugefügt.`);
        } else {
          TT.addBlockFromTemplate(tpl.id, track.id, activeSeg, null);
          toast(`„${tpl.name}" hinzugefügt.`);
        }
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
      li.querySelector('.name').textContent = (tpl.blocking ? '🔒 ' : '') + tpl.name;
      li.querySelector('.dur').textContent = formatDuration(tpl.duration);
      li.querySelector('[data-act="edit"]').addEventListener('click', () => editTemplate(tpl.id));
      li.querySelector('[data-act="del"]').addEventListener('click', () => deleteTemplate(tpl.id));
      list.appendChild(li);
    }
  }

  // =======================================================================
  //  TOUCH DRAG & DROP (Sortieren innerhalb eines Abschnitts)
  // =======================================================================
  let drag = null;

  function setupDragHandle(handle, li) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button > 0) return;
      drag = { li, seg: li.dataset.seg, track: li.dataset.track, blockId: li.dataset.blockId, pointerId: e.pointerId, handle };
      li.classList.add('m-dragging');
      try { handle.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      e.preventDefault();
    });
    handle.addEventListener('pointermove', dragMove);
    handle.addEventListener('pointerup', dragEnd);
    handle.addEventListener('pointercancel', dragEnd);
  }

  function sameSegBlocks() {
    return [...els.blockList.children].filter(
      (el) => el.classList.contains('m-block') && el.dataset.seg === drag.seg);
  }

  function dragMove(e) {
    if (!drag) return;
    e.preventDefault();
    const y = e.clientY;
    const sibs = sameSegBlocks().filter((el) => el !== drag.li);
    let ref = null;
    for (const el of sibs) {
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) { ref = el; break; }
    }
    if (ref) {
      if (drag.li.nextSibling !== ref) els.blockList.insertBefore(drag.li, ref);
    } else {
      const last = sibs[sibs.length - 1];
      if (last && last.nextSibling !== drag.li) els.blockList.insertBefore(drag.li, last.nextSibling);
    }
  }

  function dragEnd() {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.li.classList.remove('m-dragging');
    try { d.handle.releasePointerCapture(d.pointerId); } catch (_) { /* ignore */ }
    // Zielindex = Anzahl gleicher-Abschnitt-Blöcke vor dem gezogenen Element
    let index = 0;
    for (const el of els.blockList.children) {
      if (el === d.li) break;
      if (el.classList.contains('m-block') && el.dataset.seg === d.seg) index++;
    }
    TT.moveBlock(d.track, Number(d.seg), d.blockId, d.track, Number(d.seg), index);
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
      if (f.type === 'number') { input.min = '1'; input.step = '1'; input.inputMode = 'numeric'; }
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
  }
  function closeModal() { els.modal.hidden = true; modalSubmit = null; }
  els.modalForm.addEventListener('submit', (e) => { e.preventDefault(); if (modalSubmit) modalSubmit(); closeModal(); });
  els.modalCancel.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });

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
  els.addPlenumBtn.addEventListener('click', () => {
    openModal('Plenum-Block (alle Tracks)', [
      { key: 'name', label: 'Bezeichnung', type: 'text', value: 'Keynote' },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: 45 },
      { key: 'color', label: 'Farbe', type: 'color', value: '#5566d6' },
    ], (v) => { TT.addBlocking(v, null); toast('Plenum hinzugefügt.'); });
  });

  els.addGapBtn.addEventListener('click', () => {
    const track = activeTrack(getState());
    if (!track) return;
    openModal('Pause / Lücke einfügen', [
      { key: 'name', label: 'Bezeichnung', type: 'text', value: 'Pause' },
      { key: 'duration', label: 'Dauer (Minuten)', type: 'number', value: 15 },
    ], (v) => TT.addGap(track.id, activeSeg, v));
  });

  els.renameTrackBtn.addEventListener('click', () => {
    const track = activeTrack(getState());
    if (!track) return;
    openModal('Track umbenennen', [{ key: 'name', label: 'Name', type: 'text', value: track.name }], (v) => TT.renameTrack(track.id, v.name));
  });

  els.delTrackBtn.addEventListener('click', () => {
    const track = activeTrack(getState());
    if (!track) return;
    const count = track.segments.reduce((s, seg) => s + seg.length, 0);
    if (count > 0 && !confirm(`Track „${track.name}" mit ${count} Blöcken löschen?`)) return;
    if (!TT.deleteTrack(track.id)) { toast('Mindestens ein Track muss bleiben.'); return; }
    activeTrackId = null;
  });

  els.templateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const created = TT.addTemplate({
      name: els.tplName.value, duration: els.tplDuration.value,
      color: els.tplColor.value, blocking: els.tplBlocking.checked,
    });
    if (created) { els.tplName.value = ''; els.tplDuration.value = '30'; els.tplBlocking.checked = false; toast('Template angelegt.'); }
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
    activeSeg = 0;
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

  subscribe(render);
  render();
})();
