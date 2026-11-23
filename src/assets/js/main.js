(() => {
  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Theme ----------
  $('.theme-toggle')?.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  });

  // ---------- Mobile nav ----------
  const navBtn = $('.nav-toggle');
  const nav = document.getElementById('main-nav');
  navBtn?.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    navBtn.setAttribute('aria-expanded', String(open));
  });

  // ---------- Toast ----------
  const toastEl = $('.toast');
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 3200);
  };

  // ---------- Format catalog ----------
  const CAT = window.WREN_CATALOG || { groups: [], inputOnly: [], extraTargets: {}, pdfTargets: [] };
  const PAGES = new Set(window.WREN_PAGES || []);
  const LABELS = { WEBP: 'WebP' };
  const label = (f) => LABELS[f] || f;
  const groupOf = (f) => CAT.groups.find((g) => g.formats.includes(f));
  const slugFor = (a, b) => `${a}-to-${b}`.toLowerCase().replace(/\./g, '');
  // What most people want when they start from a format in each family
  const PREFERRED = {
    image: ['JPG', 'PNG'], spreadsheet: ['XLSX', 'CSV'], font: ['WOFF2', 'TTF'], audio: ['MP3', 'WAV'], video: ['MP4', 'MP3'],
    document: ['PDF', 'DOCX'], presentation: ['PDF'], ebook: ['EPUB', 'PDF'], vector: ['SVG', 'PNG'], archive: ['ZIP'],
  };

  const targetsFor = (from) => {
    if (from === 'PDF') return CAT.pdfTargets.slice();
    const g = groupOf(from);
    if (!g) return [];
    const own = g.formats.filter((f) => f !== from && !CAT.inputOnly.includes(f));
    const extra = (CAT.extraTargets[g.slug] || []).filter((f) => f !== from && !own.includes(f));
    return own.concat(extra);
  };
  const bestTarget = (from, current) => {
    const t = targetsFor(from);
    if (t.includes(current)) return current;
    return (PREFERRED[groupOf(from)?.slug] || []).find((f) => t.includes(f)) || t[0];
  };
  // Group a flat list of formats by catalog group, in catalog order
  const grouped = (list) => {
    const out = CAT.groups
      .map((g) => ({ slug: g.slug, name: g.name, formats: g.formats.filter((f) => list.includes(f)) }))
      .filter((g) => g.formats.length);
    // Formats outside the visible families (PDF, HTML) go together under "Document"
    const rest = list.filter((f) => !CAT.groups.some((g) => g.formats.includes(f)));
    if (rest.length) out.push({ slug: 'document', name: 'Document', formats: rest });
    return out;
  };

  // ---------- Format picker popover (one shared element) ----------
  const pop = document.createElement('div');
  pop.className = 'fmt-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = `
    <div class="fmt-pop-head">
      <span class="fmt-pop-title"></span>
      <button type="button" class="icon-btn fmt-pop-close" aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <label class="fmt-search">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" placeholder="Search format" autocomplete="off" spellcheck="false" aria-label="Search format">
    </label>
    <div class="fmt-pop-body">
      <ul class="fmt-groups" role="tablist"></ul>
      <div class="fmt-grid"></div>
    </div>
    <p class="fmt-legend" hidden><i></i> Coming soon</p>`;
  const backdrop = document.createElement('div');
  backdrop.className = 'fmt-backdrop';
  backdrop.hidden = true;
  document.body.append(backdrop, pop);

  const popTitle = $('.fmt-pop-title', pop);
  const popSearch = $('input', pop);
  const popGroups = $('.fmt-groups', pop);
  const popGrid = $('.fmt-grid', pop);
  const popLegend = $('.fmt-legend', pop);
  let popState = null; // { anchor, groups, current, activeGroup, onPick }

  const renderPop = () => {
    const { groups, current, activeGroup } = popState;
    const term = popSearch.value.trim().toUpperCase().replace(/^\./, '');
    popGroups.innerHTML = groups.map((g) =>
      `<li><button type="button" role="tab" data-pgroup="${g.slug}" aria-selected="${!term && g.slug === activeGroup}">${esc(g.name)}<span>${g.formats.length}</span></button></li>`
    ).join('');
    let list;
    if (term) {
      const all = groups.flatMap((g) => g.formats);
      list = all.filter((f) => f.includes(term)).sort((a, b) => (b.startsWith(term) - a.startsWith(term)));
    } else {
      list = (groups.find((g) => g.slug === activeGroup) || groups[0]).formats;
    }
    popGrid.innerHTML = list.length
      ? list.map((f) => {
          const soon = popState.side === 'to' && !PAGES.has(slugFor(popState.from, f));
          return `<button type="button" class="fmt-opt${f === current ? ' is-current' : ''}" data-fmt="${esc(f)}">${esc(label(f))}${soon ? '<i title="Coming soon"></i>' : ''}</button>`;
        }).join('')
      : `<p class="fmt-empty">No format called “${esc(popSearch.value)}”.</p>`;
    popLegend.hidden = !popGrid.querySelector('i');
  };

  const placePop = () => {
    if (pop.hidden || !popState) return;
    if (matchMedia('(max-width: 640px)').matches) { pop.style.cssText = ''; return; }
    // Line the panel up with the converter card, just under the picker buttons
    const box = popState.anchor.closest('[data-converter]').getBoundingClientRect();
    const r = popState.anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const w = Math.min(Math.max(box.width - 16, 420), vw - 24);
    let left = box.left + (box.width - w) / 2;
    left = Math.max(12, Math.min(left, vw - w - 12));
    pop.style.width = `${w}px`;
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${r.bottom + window.scrollY + 8}px`;
  };

  const closePop = (refocus = true) => {
    if (pop.hidden) return;
    pop.hidden = true;
    backdrop.hidden = true;
    popState.anchor.setAttribute('aria-expanded', 'false');
    if (refocus) popState.anchor.focus();
    popState = null;
  };

  const openPop = (state) => {
    if (popState) closePop(false);
    popState = state;
    popTitle.textContent = state.side === 'from' ? 'Convert from' : `Convert ${label(state.from)} to`;
    popSearch.value = '';
    renderPop();
    pop.hidden = false;
    backdrop.hidden = false;
    state.anchor.setAttribute('aria-expanded', 'true');
    placePop();
    popSearch.focus({ preventScroll: true });
  };

  popGroups.addEventListener('click', (e) => {
    const b = e.target.closest("[data-pgroup]");
    if (!b) return;
    popState.activeGroup = b.dataset.pgroup;
    popSearch.value = '';
    renderPop();
  });
  popGroups.addEventListener('mouseover', (e) => {
    const b = e.target.closest("[data-pgroup]");
    if (!b || popSearch.value || b.dataset.pgroup === popState.activeGroup) return;
    popState.activeGroup = b.dataset.pgroup;
    renderPop();
  });
  popGrid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmt]');
    if (!b) return;
    const pick = popState.onPick;
    closePop(false);
    pick(b.dataset.fmt);
  });
  popSearch.addEventListener('input', renderPop);
  popSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('.fmt-opt', popGrid)?.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); $('.fmt-opt', popGrid)?.focus(); }
  });
  popGrid.addEventListener('keydown', (e) => {
    const opts = $$('.fmt-opt', popGrid);
    const i = opts.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = Math.round(popGrid.clientWidth / opts[0].offsetWidth) || 1;
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (move) { e.preventDefault(); (opts[i + move] || (move < 0 && i + move < 0 ? popSearch : null))?.focus(); }
  });
  $('.fmt-pop-close', pop).addEventListener('click', () => closePop());
  backdrop.addEventListener('click', () => closePop(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  document.addEventListener('mousedown', (e) => {
    if (popState && !pop.contains(e.target) && !popState.anchor.contains(e.target)) closePop(false);
  });
  window.addEventListener('resize', placePop);

  // ---------- Converter widgets ----------
  const fmtSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
  const extOf = (name) => {
    const e = (name.includes('.') ? name.split('.').pop() : '').toUpperCase();
    return ({ JPEG: 'JPG', JPE: 'JPG', TIF: 'TIFF', HIF: 'HEIF' })[e] || e.slice(0, 7) || 'FILE';
  };
  const NO_ALPHA = new Set(['JPG', 'JFIF', 'BMP', 'PDF']);
  const LOSSY = new Set(['JPG', 'JFIF', 'WEBP', 'AVIF']);
  const THUMBABLE = /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/;
  const engines = {};
  const isSheet = (fmt) => groupOf(fmt)?.slug === 'spreadsheet';
  const isFont = (fmt) => groupOf(fmt)?.slug === 'font';
  const isAudio = (fmt) => groupOf(fmt)?.slug === 'audio';
  // Each family of formats has its own engine; each loads only when needed
  const engineFor = (fmt) => {
    const file = isSheet(fmt) ? 'sheet-engine' : isFont(fmt) ? 'font-engine' : isAudio(fmt) ? 'audio-engine' : 'engine';
    return (engines[file] ||= import(`/assets/js/${file}.js`));
  };
  const ACCEPT = {
    image: 'image/*,.heic,.heif,.jfif,.tif,.tiff,.psd,.tga,.ico,.svg,.arw,.cr2,.cr3,.dng,.nef,.orf,.rw2',
    audio: 'audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.oga,.opus,.aiff,.aif,.amr,.wma,.mp4,.mov,.webm,.mkv,video/mp4,video/quicktime,video/webm',
    font: '.ttf,.otf,.woff,.woff2,.eot,font/ttf,font/otf,font/woff,font/woff2',
    spreadsheet: '.csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,.numbers,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const converters = $$('[data-converter]');
  const ICON_DL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>';
  const ICON_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  converters.forEach((box) => {
    const mode = box.dataset.mode || 'convert';
    const zone = $('[data-dropzone]', box);
    const input = $('[data-file-input]', box);
    const list = $('[data-file-list]', box);
    const bar = $('[data-bar]', box);
    const optsEl = $('[data-options]', box);
    const btn = $('[data-convert]', box);
    const goLabel = $('[data-go-label]', box);
    const status = $('[data-pair-status]', box);
    const results = $('[data-results]', box);
    const resultsSummary = $('[data-results-summary]', box);
    const fromBtn = $('[data-fmt-btn="from"]', box);
    const toBtn = $('[data-fmt-btn="to"]', box);
    const pageSlug = box.dataset.pageSlug;
    const verb = goLabel.textContent;
    let from = box.dataset.from;
    let to = box.dataset.to;
    let items = []; // { file, state: ready|working|done|error, result, error, thumb }
    let merged = null; // combined PDF result
    let busy = false;

    // ---- options (remembered while the visitor changes format) ----
    const o = {
      quality: mode === 'compress' ? 70 : 85, background: '#ffffff', width: '', page: 'fit', merge: true,
      cmode: 'quality', targetKB: 200, format: 'same', rmode: 'px', rw: '', rh: '', percent: 50,
      sheets: 'all', separator: ',', bom: true, bitrate: '',
    };
    const seg = (key, choices) => `<div class="seg" role="radiogroup">${choices.map(([v, l]) =>
      `<button type="button" role="radio" aria-checked="${o[key] === v}" data-seg="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const formatSelect = (choices) => `<label class="field"><span>Save as</span><select data-opt="format">${choices.map(([v, l]) =>
      `<option value="${v}"${o.format === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const qualityField = `<label class="field field-grow"><span>Quality <output>${o.quality}</output>%</span><input type="range" min="5" max="100" value="${o.quality}" data-opt="quality"></label>`;

    const renderOptions = () => {
      let h = '';
      if (mode === 'convert' && isSheet(from)) {
        const sel = (key, label, choices) => `<label class="field"><span>${label}</span><select data-opt="${key}">${choices.map(([v, l]) =>
          `<option value="${v}"${o[key] === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
        if (from !== 'CSV' && from !== 'TSV') h += sel('sheets', 'Sheets', [['all', 'All sheets'], ['first', 'First sheet only']]);
        if (to === 'CSV') {
          h += sel('separator', 'Separator', [[',', 'Comma ,'], [';', 'Semicolon ;'], ['|', 'Pipe |']]);
          h += `<label class="check"><input type="checkbox" data-opt="bom"${o.bom ? ' checked' : ''}> Excel-friendly (keeps accents and non-English text)</label>`;
        }
        if (to === 'PDF') h += sel('page', 'Page size', [['A4', 'A4'], ['LETTER', 'US Letter']]);
      } else if (mode === 'convert' && isAudio(from)) {
        if (['MP3', 'M4A', 'AAC', 'OGG', 'OPUS'].includes(to)) {
          const def = to === 'OPUS' ? '128' : '192';
          const cur = o.bitrate || def;
          const rates = [['96', '96 kbps (small)'], ['128', '128 kbps'], ['192', '192 kbps (recommended)'], ['256', '256 kbps'], ['320', '320 kbps (best)']]
            .map(([v, l]) => [v, to === 'OPUS' && v === '128' ? '128 kbps (recommended)' : to === 'OPUS' && v === '192' ? '192 kbps' : l]);
          h += `<label class="field"><span>Quality</span><select data-opt="bitrate">${rates.map(([v, l]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
        }
      } else if (mode === 'convert' && isFont(from)) {
        // Fonts need no settings: packing is lossless
      } else if (mode === 'convert') {
        if (LOSSY.has(to)) h += qualityField;
        if (to === 'PDF') {
          h += `<label class="field"><span>Page size</span><select data-opt="page">
            <option value="fit"${o.page === 'fit' ? ' selected' : ''}>Same as image</option>
            <option value="A4"${o.page === 'A4' ? ' selected' : ''}>A4</option>
            <option value="LETTER"${o.page === 'LETTER' ? ' selected' : ''}>US Letter</option></select></label>`;
          if (items.length > 1) h += `<label class="check"><input type="checkbox" data-opt="merge"${o.merge ? ' checked' : ''}> One PDF for all images</label>`;
        } else {
          h += `<label class="field field-num"><span>${from === 'SVG' ? 'Width' : 'Resize width'} (px)</span><input type="number" min="1" max="20000" inputmode="numeric" placeholder="${from === 'SVG' ? 'Auto' : 'Original'}" value="${o.width}" data-opt="width"></label>`;
        }
        if (NO_ALPHA.has(to) && to !== 'PDF') h += `<label class="field field-color"><span>Background</span><input type="color" value="${o.background}" data-opt="background" title="Fills transparent areas"></label>`;
      } else if (mode === 'compress') {
        h += `<div class="field"><span>Make smaller by</span>${seg('cmode', [['quality', 'Quality'], ['size', 'Target size']])}</div>`;
        h += o.cmode === 'quality' ? qualityField
          : `<label class="field field-num"><span>Max size (KB)</span><input type="number" min="5" step="10" inputmode="numeric" value="${o.targetKB}" data-opt="targetKB"></label>`;
        h += formatSelect([['same', 'Same as original'], ['JPG', 'JPG'], ['WEBP', 'WebP'], ['AVIF', 'AVIF'], ['PNG', 'PNG']]);
      } else if (mode === 'resize') {
        h += `<div class="field"><span>Resize by</span>${seg('rmode', [['px', 'Pixels'], ['pct', 'Percent']])}</div>`;
        h += o.rmode === 'px'
          ? `<label class="field field-num"><span>Width</span><input type="number" min="1" max="20000" inputmode="numeric" placeholder="Auto" value="${o.rw}" data-opt="rw"></label>
             <label class="field field-num"><span>Height</span><input type="number" min="1" max="20000" inputmode="numeric" placeholder="Auto" value="${o.rh}" data-opt="rh"></label>`
          : `<label class="field field-num"><span>Percent</span><input type="number" min="1" max="1000" inputmode="numeric" value="${o.percent}" data-opt="percent"></label>`;
        h += formatSelect([['same', 'Same as original'], ['JPG', 'JPG'], ['PNG', 'PNG'], ['WEBP', 'WebP']]);
      }
      optsEl.innerHTML = h;
    };
    optsEl.addEventListener('input', (e) => {
      const el = e.target.closest('[data-opt]');
      if (!el) return;
      o[el.dataset.opt] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'range') el.previousElementSibling.querySelector('output').textContent = el.value;
      resetDone();
    });
    optsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-seg]');
      if (!b) return;
      o[b.dataset.seg] = b.dataset.v;
      renderOptions();
      resetDone();
    });

    // ---- format pair ----
    const updatePair = () => {
      input.accept = ACCEPT[groupOf(from)?.slug] || ACCEPT.image;
      if (!fromBtn) return;
      $('[data-val]', fromBtn).textContent = label(from);
      $('[data-val]', toBtn).textContent = label(to);
      const ready = PAGES.has(slugFor(from, to));
      status.hidden = ready;
      if (!ready) status.innerHTML = `<span class="badge">Coming soon</span> ${esc(label(from))} to ${esc(label(to))} is not ready yet. This pair is not ready yet. We are adding new formats regularly.`;
      btn.disabled = !ready || busy;
      renderOptions();
      resetDone();
    };
    const go = () => {
      const slug = slugFor(from, to);
      updatePair();
      if (PAGES.has(slug) && slug !== pageSlug && items.length === 0) location.href = `/${slug}/`;
    };

    fromBtn?.addEventListener('click', () => {
      if (popState?.anchor === fromBtn) return closePop();
      openPop({
        side: 'from', anchor: fromBtn, current: from,
        groups: grouped(CAT.groups.flatMap((g) => g.formats)),
        activeGroup: groupOf(from)?.slug,
        onPick: (f) => { from = f; to = bestTarget(from, to); updatePair(); toBtn.click(); },
      });
    });
    toBtn?.addEventListener('click', () => {
      if (popState?.anchor === toBtn) return closePop();
      const groups = grouped(targetsFor(from));
      openPop({
        side: 'to', anchor: toBtn, from, current: to, groups,
        activeGroup: (groups.find((g) => g.formats.includes(to)) || groups[0])?.slug,
        onPick: (f) => { to = f; go(); },
      });
    });

    // ---- file list ----
    const resetDone = () => {
      if (busy) return;
      let changed = false;
      items.forEach((it) => { if (it.state !== 'ready') { dropResult(it); it.state = 'ready'; changed = true; } });
      if (merged) { URL.revokeObjectURL(merged.url); merged = null; changed = true; }
      if (changed) render();
    };
    const dropResult = (it) => { if (it.result?.url) URL.revokeObjectURL(it.result.url); it.result = null; it.error = null; };

    const resultRow = (r, extra = '') => {
      r.url ||= URL.createObjectURL(r.blob);
      return `<a class="btn btn-sm btn-dl" href="${r.url}" download="${esc(r.name)}">${ICON_DL} Download${extra}</a>`;
    };

    const setStatus = (it, text) => {
      it.statusText = text;
      const li = list.children[items.indexOf(it)];
      const chip = li && li.querySelector('.is-working .status-text');
      if (chip) chip.textContent = text;
    };

    const render = () => {
      const n = items.length;
      list.hidden = n === 0 && !merged;
      bar.hidden = n === 0;
      zone.classList.toggle('has-files', n > 0);
      const done = items.filter((i) => i.state === 'done').length;
      const failed = items.filter((i) => i.state === 'error').length;
      const allDone = n > 0 && done + failed === n && !busy;
      goLabel.textContent = busy ? 'Working…' : `${verb}${n > 1 ? ` ${n} files` : ''}`;
      btn.hidden = allDone && done > 0;
      optsEl.hidden = allDone && done > 0;
      bar.hidden = n === 0 || (allDone && done > 0);
      results.hidden = !(allDone && (done > 0 || merged));
      $('[data-zip]', box).hidden = !(done > 1 && !merged);
      if (allDone) {
        const before = items.filter((i) => i.state === 'done').reduce((a, i) => a + i.file.size, 0);
        const after = merged ? merged.blob.size : items.filter((i) => i.state === 'done').reduce((a, i) => a + i.result.blob.size, 0);
        const pct = before ? Math.max(-99, Math.round((after / before - 1) * 100)) : 0;
        resultsSummary.innerHTML = `<strong>${merged ? 1 : done} ${(merged ? 1 : done) === 1 ? 'file' : 'files'} ready.</strong> ${fmtSize(before)} → ${fmtSize(after)}${pct ? ` <span class="delta ${pct < 0 ? 'down' : 'up'}">${pct > 0 ? '+' : ''}${pct}%</span>` : ''}${failed ? ` · ${failed} failed` : ''}`;
      }

      list.innerHTML = '';
      items.forEach((it, i) => {
        const li = document.createElement('li');
        li.className = `file-item is-${it.state}`;
        if (!it.thumb && THUMBABLE.test(it.file.type) && it.file.size < 40e6) it.thumb = URL.createObjectURL(it.file);
        const fontExt = ['TTF', 'OTF', 'WOFF', 'WOFF2'].includes(extOf(it.file.name));
        if (fontExt && !it.fontFam && it.file.size < 30e6) {
          it.fontFam = `wren-preview-${Math.random().toString(36).slice(2)}`;
          it.file.arrayBuffer().then((buf) => new FontFace(it.fontFam, buf).load())
            .then((face) => { document.fonts.add(face); it.fontReady = true; $$(`[data-font="${it.fontFam}"]`).forEach((el) => el.classList.add('is-ready')); })
            .catch(() => {});
        }
        const thumb = it.fontFam ? `<span class="file-thumb file-thumb-font${it.fontReady ? ' is-ready' : ''}" data-font="${it.fontFam}" style="font-family:'${it.fontFam}',serif">Aa</span>` : it.thumb ? `<img class="file-thumb" src="${it.thumb}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'file-thumb',textContent:'${esc(extOf(it.file.name))}'}))">`
          : `<span class="file-thumb">${esc(extOf(it.file.name))}</span>`;
        let meta = `${esc(extOf(it.file.name))} · ${fmtSize(it.file.size)}`;
        let right = '';
        if (it.state === 'ready') right = `<span class="file-status">${mode === 'convert' ? `→ ${esc(label(to))}` : 'Ready'}</span>`;
        if (it.state === 'working') right = `<span class="file-status is-working"><span class="spinner"></span><span class="status-text">${esc(it.statusText || 'Working')}</span></span>`;
        if (it.state === 'done' && it.result) {
          const r = it.result;
          const pct = Math.max(-99, Math.round((r.blob.size / it.file.size - 1) * 100));
          meta = `${esc(extOf(it.file.name))} ${fmtSize(it.file.size)} → <strong>${esc(extOf(r.name))} ${fmtSize(r.blob.size)}</strong>${pct ? ` <span class="delta ${pct < 0 ? 'down' : 'up'}">${pct > 0 ? '+' : ''}${pct}%</span>` : ''}${r.width ? ` · ${r.width}×${r.height}` : ''}${r.sheets > 1 ? ` · ${r.sheets} sheets` : ''}${r.font ? ` · ${esc(r.font)}` : ''}${r.unchanged ? ' · already as small as it gets' : ''}`;
          right = resultRow(r);
        }
        if (it.state === 'done' && !it.result) right = '<span class="file-status">Added to PDF</span>';
        if (it.state === 'error') { meta = `<span class="file-error">${esc(it.error)}</span>`; right = '<span class="file-status is-error">Failed</span>'; }
        li.innerHTML = `${thumb}<div class="file-info"><div class="file-name">${esc(it.file.name)}</div><div class="file-meta">${meta}</div></div>${right}<button type="button" class="icon-btn file-remove" aria-label="Remove ${esc(it.file.name)}"${busy ? ' disabled' : ''}>${ICON_X}</button>`;
        $('.file-remove', li).onclick = () => {
          dropResult(it);
          if (it.thumb) URL.revokeObjectURL(it.thumb);
          items.splice(i, 1);
          if (merged) { URL.revokeObjectURL(merged.url); merged = null; items.forEach((x) => (x.state = 'ready')); }
          renderOptions();
          render();
        };
        list.append(li);
      });
      if (merged) {
        const li = document.createElement('li');
        li.className = 'file-item is-done is-merged';
        li.innerHTML = `<span class="file-thumb">PDF</span><div class="file-info"><div class="file-name">${esc(merged.name)}</div><div class="file-meta"><strong>${fmtSize(merged.blob.size)}</strong> · ${items.filter((x) => x.state === 'done').length} pages</div></div>${resultRow(merged)}`;
        list.append(li);
      }
    };

    const add = (fileList) => {
      const incoming = [...fileList].filter((f) => f.size > 0);
      if (!incoming.length || busy) return;
      resetDone();
      items = items.concat(incoming.map((file) => ({ file, state: 'ready' }))).slice(0, 100);
      if (fromBtn) {
        const ext = extOf(incoming[0].name);
        if (ext !== from && groupOf(ext)) { from = ext; to = bestTarget(from, to); updatePair(); }
      }
      // Fetch the converter code while the visitor is still choosing options
      engineFor(from).then((E) => { E.preload(from); E.preload(to); incoming.forEach((f) => E.preload(extOf(f.name))); }).catch(() => {});
      renderOptions();
      render();
    };
    box.addFiles = add;

    const clearAll = () => {
      items.forEach((it) => { dropResult(it); if (it.thumb) URL.revokeObjectURL(it.thumb); });
      if (merged) URL.revokeObjectURL(merged.url);
      items = []; merged = null;
      renderOptions();
      render();
    };

    // ---- run ----
    const run = async () => {
      if (busy || !items.length) return;
      let E;
      try { E = await engineFor(mode === 'convert' ? from : 'JPG'); } catch (e) { toast('The converter could not load. Check your connection and reload the page.'); return; }
      busy = true;
      btn.disabled = true;
      const todo = items.filter((it) => it.state !== 'done');
      todo.forEach((it) => { it.state = 'working'; it.error = null; it.statusText = null; });
      render();
      const msg = (e) => (e instanceof E.ConvertError ? e.message : 'Something went wrong with this file. It may be damaged or in an unusual variant.');
      const num = (v) => (v === '' || v == null ? undefined : Math.max(1, Math.round(+v)));

      if (mode === 'convert' && to === 'PDF' && !isSheet(from)) {
        const out = await E.toPdf(todo.map((it) => it.file), { page: o.page, merge: o.merge && todo.length > 1 }, (i, err) => {
          if (err) { todo[i].state = 'error'; todo[i].error = msg(err); console.error(err); }
        });
        if (o.merge && todo.length > 1) {
          todo.forEach((it) => { if (it.state !== 'error') it.state = 'done'; });
          merged = out[0] || null;
        } else {
          let k = 0;
          todo.forEach((it) => { if (it.state !== 'error') { it.state = 'done'; it.result = out[k++]; } });
        }
      } else {
        for (const it of todo) {
          try {
            if (mode === 'compress') {
              it.result = await E.compress(it.file, {
                quality: o.quality / 100, targetKB: o.cmode === 'size' ? num(o.targetKB) : undefined,
                format: o.format === 'same' ? undefined : o.format,
              });
            } else if (mode === 'resize') {
              it.result = await E.resize(it.file, o.rmode === 'pct'
                ? { percent: num(o.percent) || 100, format: o.format === 'same' ? undefined : o.format }
                : { width: num(o.rw), height: num(o.rh), format: o.format === 'same' ? undefined : o.format });
            } else if (isAudio(from)) {
              if (!E.isLoaded()) setStatus(it, 'Loading converter');
              it.result = await E.convert(it.file, to, { bitrate: o.bitrate }, (x) => setStatus(it, `Working ${Math.round(x * 100)}%`));
            } else if (isFont(from)) {
              it.result = await E.convert(it.file, to);
            } else if (isSheet(from)) {
              it.result = await E.convert(it.file, to, { sheets: o.sheets, separator: o.separator, bom: o.bom, page: o.page === 'fit' ? 'A4' : o.page });
            } else {
              it.result = await E.convert(it.file, to, { quality: o.quality / 100, background: o.background, width: num(o.width) });
            }
            it.state = 'done';
          } catch (e) {
            it.state = 'error';
            it.error = msg(e);
            console.error(e);
          }
          render();
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      busy = false;
      btn.disabled = false;
      render();
      const ok = items.filter((it) => it.state === 'done').length;
      if (ok) results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    btn.addEventListener('click', run);
    $('[data-clear]', box).addEventListener('click', clearAll);
    $('[data-zip]', box).addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const E = await engineFor('JPG');
        const blob = await E.zip(items.filter((it) => it.state === 'done' && it.result).map((it) => it.result));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'wrenconvert.zip';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } finally { b.disabled = false; }
    });

    $('[data-choose]', box).addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { add(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('is-over')));
    zone.addEventListener('drop', (e) => { e.preventDefault(); add(e.dataTransfer.files); });
    // Allow dropping anywhere on the card, not only the dashed area
    box.addEventListener('dragover', (e) => e.preventDefault());
    box.addEventListener('drop', (e) => { if (!zone.contains(e.target)) { e.preventDefault(); add(e.dataTransfer.files); } });

    updatePair();
    renderOptions();
  });

  // Paste files anywhere on the page (Ctrl+V / Cmd+V)
  document.addEventListener('paste', (e) => {
    const target = converters[0];
    if (!target || e.target.closest?.('input, textarea')) return;
    const pasted = [...(e.clipboardData?.files || [])];
    if (pasted.length) { e.preventDefault(); target.addFiles(pasted); target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });

  // ---------- Offline support ----------
  if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
    window.addEventListener('load', () => navigator.serviceWorker?.register('/sw.js').catch(() => {}));
  }

  // ---------- All-tools search ----------
  const search = $('[data-tool-search]');
  search?.addEventListener('input', () => {
    // Every word must match: "heic jpg" finds "HEIC to JPG"
    const words = search.value.toLowerCase().replace(/\bjpeg\b/g, 'jpg').replace(/\btif\b/g, 'tiff').split(/[\s,]+/).filter((w) => w && w !== 'to');
    let any = false;
    $$('[data-group]').forEach((g) => {
      let groupHit = false;
      $$('[data-item]', g).forEach((it) => {
        const text = it.dataset.item.toLowerCase();
        const hit = words.every((w) => text.includes(w));
        it.hidden = !hit;
        groupHit ||= hit;
      });
      $$('[data-row]', g).forEach((r) => { r.hidden = !$$('[data-item]', r).some((x) => !x.hidden); });
      g.hidden = !groupHit;
      any ||= groupHit;
    });
    $('[data-no-results]').hidden = any;
  });
})();
