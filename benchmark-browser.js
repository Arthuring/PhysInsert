/* PhysInsert-Bench: a progressive, buildless browser of the complete benchmark. */
(() => {
  'use strict';
  const mount = document.getElementById('benchmark-browser');
  if (!mount) return;
  const PAGE_SIZE = 24;
  const FEATURED_IDS = ["case-308", "case-081", "case-204", "case-171", "case-219", "case-357", "case-119", "case-387", "case-023", "case-103", "case-195", "case-044", "case-383", "case-026", "case-315", "case-030", "case-220", "case-313", "case-323", "case-372", "case-079", "case-074", "case-393", "case-350"];
  const featuredRank = new Map(FEATURED_IDS.map((id, index) => [id, index]));
  const state = {suite: 'all', group: '', tag: '', query: '', page: 0};
  const number = value => value.toLocaleString('en-US');
  const caseName = item => `Case${String(item.index).padStart(3, '0')}`;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text, action) => {
    const node = make('button', className, text);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  };
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dataset = null;
  let loadPromise = null;
  let filtered = [];
  let dialogOpener = null;

  mount.classList.add('bb-browser');
  const drawer = make('details', 'bb-drawer');
  const summary = make('summary', 'bb-summary');
  const summaryCopy = make('span', 'bb-summary-copy');
  const summaryTitle = make('span', 'bb-summary-title', 'Explore the complete benchmark');
  const summarySubtitle = make('span', 'bb-summary-subtitle', 'Loading a preview…');
  const summaryIcon = make('span', 'bb-summary-icon');
  summaryIcon.setAttribute('aria-hidden', 'true');
  summaryCopy.append(summaryTitle, summarySubtitle);
  const preview = make('span', 'bb-preview');
  preview.setAttribute('aria-hidden', 'true');
  summary.append(summaryCopy, summaryIcon, preview);
  const panel = make('div', 'bb-panel');
  const filters = make('div', 'bb-filters');
  const scopes = make('div', 'bb-scopes');
  scopes.setAttribute('role', 'group');
  scopes.setAttribute('aria-label', 'Benchmark case category');
  const scopeButtons = ['all', 'optical', 'structural'].map(suite => {
    const node = button('bb-scope', suite === 'all' ? 'All' : suite[0].toUpperCase() + suite.slice(1), () => {
      state.suite = suite;
      state.group = '';
      state.tag = '';
      state.page = 0;
      refreshFilters();
      renderGrid();
    });
    node.setAttribute('aria-pressed', String(suite === 'all'));
    scopes.append(node);
    return {suite, node};
  });
  function field(labelText, control) {
    const label = make('label', 'bb-field');
    label.append(make('span', '', labelText), control);
    return label;
  }
  const groupSelect = make('select', 'bb-select');
  const tagSelect = make('select', 'bb-select');
  const search = make('input', 'bb-search');
  search.type = 'search';
  search.placeholder = 'Case ID, object, or tag';
  search.autocomplete = 'off';
  const reset = button('bb-reset', 'Clear filters', () => {
    Object.assign(state, {suite: 'all', group: '', tag: '', query: '', page: 0});
    search.value = '';
    refreshFilters();
    renderGrid();
    search.focus({preventScroll: true});
  });
  filters.append(scopes, field('Group', groupSelect), field('Physical tag', tagSelect), field('Find a case', search), reset);
  const gridHead = make('div', 'bb-grid-head');
  const count = make('p', 'bb-count');
  count.tabIndex = -1;
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  count.setAttribute('aria-atomic', 'true');
  gridHead.append(count, make('p', 'bb-grid-hint', 'Ground-truth previews · select a case to inspect its inputs'));
  const grid = make('div', 'bb-grid');
  grid.setAttribute('role', 'list');
  grid.setAttribute('aria-label', 'Benchmark cases');
  const status = make('div', 'bb-status');
  status.setAttribute('role', 'status');
  const pagination = make('nav', 'bb-pagination');
  pagination.setAttribute('aria-label', 'Benchmark case pages');
  const previous = button('bb-page-button', '← Previous', () => changePage(state.page - 1));
  const pageLabel = make('span', 'bb-page-label');
  const next = button('bb-page-button', 'Next →', () => changePage(state.page + 1));
  pagination.append(previous, pageLabel, next);
  panel.append(filters, gridHead, status, grid, pagination);
  drawer.append(summary, panel);

  const dialog = make('dialog', 'bb-dialog');
  dialog.setAttribute('aria-labelledby', 'bb-dialog-title');
  dialog.setAttribute('aria-describedby', 'bb-dialog-meta');
  const dialogHeader = make('div', 'bb-dialog-header');
  const dialogHeading = make('div', 'bb-dialog-heading');
  const dialogTitle = make('h2', 'bb-dialog-title');
  dialogTitle.id = 'bb-dialog-title';
  const dialogMeta = make('p', 'bb-dialog-meta');
  dialogMeta.id = 'bb-dialog-meta';
  dialogHeading.append(dialogTitle, dialogMeta);
  const close = button('bb-dialog-close', '×', () => dialog.close());
  close.setAttribute('aria-label', 'Close benchmark case');
  close.autofocus = true;
  dialogHeader.append(dialogHeading, close);
  const dialogContent = make('div', 'bb-dialog-content');
  dialog.append(dialogHeader, dialogContent);
  mount.replaceChildren(drawer, dialog);

  function setStatus(message, error = false) {
    status.replaceChildren(make('p', '', message));
    status.hidden = false;
    if (error) status.append(button('bb-retry', 'Try again', () => ensureLoaded()));
  }
  function validate(payload) {
    if (!payload || payload.totalCases !== 400 || !Array.isArray(payload.cases) || payload.cases.length !== payload.totalCases) {
      throw new Error('The complete benchmark manifest is unavailable.');
    }
    const seen = new Set();
    for (const item of payload.cases) {
      if (!Number.isInteger(item.index) || item.index < 0 || item.index >= payload.totalCases || seen.has(item.index) ||
          item.id !== `case-${String(item.index).padStart(3, '0')}` || !['optical', 'structural'].includes(item.suite) ||
          !['e2o', 'o2e', 'mutual', 'spatial', 'mechanical'].includes(item.group) ||
          ['title', 'suiteLabel', 'groupLabel', 'tag', 'tagLabel'].some(key => typeof item[key] !== 'string' || !item[key]) ||
          ['thumb', 'background', 'reference', 'gt'].some(key => typeof item[key] !== 'string' || !/^assets\/benchmark\/[a-z0-9._-]+\.(?:webp|png|jpe?g)$/i.test(item[key]))) {
        throw new Error('A benchmark manifest entry is incomplete.');
      }
      seen.add(item.index);
    }
    payload.cases.sort((a, b) => a.index - b.index);
    return payload;
  }
  async function ensureLoaded() {
    if (dataset) return dataset;
    if (loadPromise) return loadPromise;
    panel.setAttribute('aria-busy', 'true');
    filters.hidden = true;
    gridHead.hidden = true;
    pagination.hidden = true;
    setStatus('Loading benchmark cases…');
    summarySubtitle.textContent = 'Loading a preview…';
    loadPromise = (async () => {
      try {
        const response = await fetch('benchmark-cases.json');
        if (!response.ok) throw new Error(`Benchmark manifest returned ${response.status}`);
        dataset = validate(await response.json());
        summaryTitle.textContent = `Browse all ${number(dataset.totalCases)} cases`;
        summarySubtitle.textContent = 'Reference · background · ground truth';
        renderPreview();
        refreshFilters();
        if (drawer.open) renderGrid();
        return dataset;
      } catch (error) {
        summarySubtitle.textContent = 'Preview unavailable · open to retry';
        setStatus('The benchmark could not be loaded. Please try again.', true);
        return null;
      } finally {
        panel.removeAttribute('aria-busy');
        loadPromise = null;
      }
    })();
    return loadPromise;
  }
  function renderPreview() {
    preview.replaceChildren();
    FEATURED_IDS.slice(0, 6).forEach(id => {
      const item = dataset.cases.find(candidate => candidate.id === id);
      const image = make('img', 'bb-preview-image');
      image.src = item.thumb;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 240;
      image.height = 180;
      image.addEventListener('error', () => image.classList.add('bb-image-unavailable'), {once: true});
      preview.append(image);
    });
  }
  function options(select, items, key, labelKey, defaultLabel, value) {
    const values = new Map(items.map(item => [item[key], item[labelKey]]));
    const all = make('option', '', defaultLabel);
    all.value = '';
    select.replaceChildren(all);
    values.forEach((label, id) => {
      const option = make('option', '', label);
      option.value = id;
      select.append(option);
    });
    select.value = values.has(value) ? value : '';
    return select.value;
  }
  function refreshFilters() {
    if (!dataset) return;
    filters.hidden = false;
    gridHead.hidden = false;
    scopeButtons.forEach(({suite, node}) => node.setAttribute('aria-pressed', String(state.suite === suite)));
    const suiteCases = dataset.cases.filter(item => state.suite === 'all' || item.suite === state.suite);
    state.group = options(groupSelect, suiteCases, 'group', 'groupLabel', 'All groups', state.group);
    const groupCases = suiteCases.filter(item => !state.group || item.group === state.group);
    state.tag = options(tagSelect, groupCases, 'tag', 'tagLabel', 'All physical tags', state.tag);
    reset.disabled = state.suite === 'all' && !state.group && !state.tag && !state.query;
  }
  function filterCases() {
    const words = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = dataset.cases.filter(item => {
      if (state.suite !== 'all' && item.suite !== state.suite || state.group && item.group !== state.group || state.tag && item.tag !== state.tag) return false;
      const haystack = [caseName(item), item.id, String(item.index), item.title, item.suiteLabel, item.groupLabel, item.tagLabel].join(' ').toLowerCase();
      return words.every(word => haystack.includes(word));
    });
    if (state.suite === 'all' && !state.group && !state.tag && !words.length) {
      matches.sort((a, b) => (featuredRank.get(a.id) ?? PAGE_SIZE + a.index) - (featuredRank.get(b.id) ?? PAGE_SIZE + b.index));
    }
    return matches;
  }
  function card(item) {
    const wrap = make('div', 'bb-card-wrap');
    wrap.setAttribute('role', 'listitem');
    const node = button(`bb-card bb-${item.suite}`, '', () => openCase(item, node));
    node.setAttribute('aria-label', `View ${caseName(item)}: ${item.title}. ${item.tagLabel}.`);
    const imageWrap = make('span', 'bb-card-image');
    const image = make('img');
    image.src = item.thumb;
    image.alt = '';
    image.width = 320;
    image.height = 240;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      image.hidden = true;
      imageWrap.append(make('span', 'bb-thumbnail-error', 'Preview unavailable'));
    }, {once: true});
    imageWrap.append(image);
    const copy = make('span', 'bb-card-copy');
    const meta = make('span', 'bb-card-meta');
    meta.append(make('span', 'bb-case-id', caseName(item)), make('span', 'bb-card-tag', item.tagLabel));
    copy.append(meta, make('span', 'bb-card-title', item.title));
    node.append(imageWrap, copy);
    wrap.append(node);
    return wrap;
  }
  function renderGrid() {
    if (!dataset || !drawer.open) return;
    filters.hidden = false;
    gridHead.hidden = false;
    filtered = filterCases();
    const pages = Math.ceil(filtered.length / PAGE_SIZE);
    state.page = Math.max(0, Math.min(state.page, pages - 1));
    const start = state.page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, filtered.length);
    count.textContent = filtered.length ? `${number(start + 1)}–${number(end)} of ${number(filtered.length)} ${filtered.length === 1 ? 'case' : 'cases'}${filtered.length === dataset.totalCases ? '' : ` · ${number(dataset.totalCases)} total`}` : `0 of ${number(dataset.totalCases)} cases`;
    grid.replaceChildren(...filtered.slice(start, end).map(card));
    status.hidden = filtered.length > 0;
    if (!filtered.length) {
      setStatus('No cases match these filters. Try another tag or a shorter search.');
      status.append(button('bb-retry', 'Show all cases', () => reset.click()));
    }
    pagination.hidden = pages <= 1;
    previous.disabled = state.page === 0;
    next.disabled = state.page >= pages - 1;
    pageLabel.textContent = `Page ${state.page + 1} of ${Math.max(1, pages)}`;
    reset.disabled = state.suite === 'all' && !state.group && !state.tag && !state.query;
  }
  function changePage(page) {
    state.page = page;
    renderGrid();
    count.focus({preventScroll: true});
    gridHead.scrollIntoView({behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start'});
  }
  function fullImage(item, label, key) {
    const figure = make('figure', `bb-full-image bb-full-${key}`);
    const caption = make('figcaption', '', label);
    const canvas = make('div', 'bb-full-canvas');
    const loading = make('span', 'bb-image-status', 'Loading image…');
    const image = make('img');
    image.alt = `${label} for ${caseName(item)}: ${item.title}`;
    image.decoding = 'async';
    image.addEventListener('load', () => loading.remove(), {once: true});
    image.addEventListener('error', () => {
      image.hidden = true;
      loading.textContent = 'Image unavailable';
    }, {once: true});
    image.src = item[key];
    canvas.append(loading, image);
    figure.append(caption, canvas);
    return figure;
  }
  function openCase(item, opener) {
    dialogOpener = opener;
    dialogTitle.textContent = `${caseName(item)} · ${item.title}`;
    dialogMeta.textContent = `${item.suiteLabel} / ${item.groupLabel} / ${item.tagLabel}`;
    const imageGrid = make('div', 'bb-dialog-images');
    imageGrid.append(fullImage(item, 'Reference', 'reference'), fullImage(item, 'Background', 'background'), fullImage(item, 'Ground truth', 'gt'));
    dialogContent.replaceChildren(imageGrid);
    if (typeof item.prompt === 'string' && item.prompt.trim()) {
      const instruction = make('div', 'bb-instruction');
      instruction.append(make('h3', '', 'Placement instruction'), make('p', '', item.prompt));
      dialogContent.append(instruction);
    }
    dialog.showModal();
    document.body.classList.add('bb-modal-open');
  }
  dialog.addEventListener('close', () => {
    document.body.classList.remove('bb-modal-open');
    dialogContent.replaceChildren();
    if (dialogOpener && dialogOpener.isConnected) dialogOpener.focus({preventScroll: true});
    dialogOpener = null;
  });
  let backdropPress = false;
  dialog.addEventListener('pointerdown', event => { backdropPress = event.target === dialog; });
  dialog.addEventListener('click', event => {
    if (!backdropPress || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    backdropPress = false;
  });
  groupSelect.addEventListener('change', () => {
    state.group = groupSelect.value;
    state.tag = '';
    state.page = 0;
    refreshFilters();
    renderGrid();
  });
  tagSelect.addEventListener('change', () => {
    state.tag = tagSelect.value;
    state.page = 0;
    renderGrid();
  });
  search.addEventListener('input', () => {
    state.query = search.value;
    state.page = 0;
    renderGrid();
  });
  drawer.addEventListener('toggle', async () => {
    if (drawer.open && await ensureLoaded()) renderGrid();
  });
  document.addEventListener('benchmark:browse', async event => {
    if (!await ensureLoaded()) { drawer.open = true; return; }
    const id = event.detail && event.detail.id;
    Object.assign(state, {suite: 'all', group: '', tag: '', query: '', page: 0});
    search.value = '';
    if (['optical', 'structural'].includes(id)) state.suite = id;
    else {
      const byGroup = dataset.cases.find(item => item.group === id);
      const byTag = dataset.cases.find(item => item.tag === id);
      if (byGroup) Object.assign(state, {suite: byGroup.suite, group: byGroup.group});
      else if (byTag) Object.assign(state, {suite: byTag.suite, group: byTag.group, tag: byTag.tag});
    }
    drawer.open = true;
    refreshFilters();
    renderGrid();
    summary.focus({preventScroll: true});
    mount.scrollIntoView({behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start'});
  });
  ensureLoaded();
})();
