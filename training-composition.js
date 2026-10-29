/* Training coverage is categorical; angular sizes are not sample counts. */
(() => {
  'use strict';
  const mount = document.getElementById('training-explorer');
  if (!mount) return;
  const NS = 'http://www.w3.org/2000/svg';
  const fmt = value => Number(value).toLocaleString('en-US');
  const colors = {
    scene: {base: '#cbdcae', light: '#e6efd5', ink: '#586b41'},
    object: {base: '#edcf92', light: '#fae8c2', ink: '#856337'},
    interaction: {base: '#e9b6a8', light: '#fbe1dc', ink: '#9c6558'}
  };
  const overviews = {scene: 'assets/dataset-scenes.webp', object: 'assets/dataset-objects.webp', interaction: 'assets/dataset-interactions.webp'};
  const labelLines = {
    'strong-light': ['Strong', 'light'], 'reflective-surfaces': ['Reflective', 'surfaces'],
    'colored-lighting': ['Colored', 'lighting'], 'low-light': ['Low light'],
    'illumination-adaptation': ['Illumination', 'adaptation']
  };
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }
  function button(cls, text, action) {
    const node = el('button', cls, text);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }
  function image(src, alt, cls = '') {
    const node = el('img', cls);
    node.src = src;
    node.alt = alt || '';
    node.loading = 'lazy';
    node.draggable = false;
    return node;
  }
  function polar(radius, angle) {
    return [280 + radius * Math.sin(angle), 280 - radius * Math.cos(angle)];
  }
  function sector(inner, outer, start, end) {
    const a = polar(outer, start), b = polar(outer, end);
    const c = polar(inner, end), d = polar(inner, start);
    return `M${a} A${outer},${outer} 0 0 1 ${b} L${c} A${inner},${inner} 0 0 0 ${d} Z`;
  }
  function enlarge(src, title, cls = 'training-enlarge') {
    const node = button(cls, 'Open image ↗');
    node.dataset.figure = src;
    node.dataset.title = title;
    node.setAttribute('aria-label', `Enlarge ${title}`);
    return node;
  }

  async function initialize() {
    mount.setAttribute('aria-busy', 'true');
    const response = await fetch('training-examples.json?v=direct-six');
    if (!response.ok) throw new Error('Training examples are unavailable.');
    const data = await response.json();
    const groups = data.groups.map(group => ({
      ...group,
      categories: group.categories.filter(category => group.id !== 'interaction' || category.pairs?.length)
    }));
    if (!Array.isArray(groups) || groups.length !== 3) throw new Error('Training examples are incomplete.');
    const root = {id: 'all', label: 'InsertWorld'};
    const byId = new Map([[root.id, root]]);
    groups.forEach(group => {
      byId.set(group.id, group);
      group.categories.forEach(category => {
        category.group = group;
        byId.set(category.id, category);
      });
    });
    let selected = root;
    const segments = [];
    const controls = [];
    const live = el('p', 'training-sr-only');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    const toolbar = el('div', 'training-toolbar');
    const navigation = el('div', 'training-scopes');
    navigation.setAttribute('role', 'group');
    navigation.setAttribute('aria-label', 'Explore InsertWorld composition');
    [root, ...groups].forEach(node => {
      const control = button('training-scope', node === root ? 'All' : node.label, () => select(node));
      control.dataset.group = node.id;
      control.setAttribute('aria-pressed', String(node === root));
      navigation.append(control);
      controls.push({node, control});
    });
    toolbar.append(navigation, el('p', 'training-interaction-hint', 'Choose a slice. Explore its examples.'));

    const layout = el('div', 'training-explorer');
    const plot = el('div', 'training-map');
    const svg = svgEl('svg', {viewBox: '0 0 560 560', role: 'group', 'aria-labelledby': 'training-svg-title training-svg-desc'});
    const title = svgEl('title', {id: 'training-svg-title'});
    title.textContent = 'InsertWorld category explorer';
    const description = svgEl('desc', {id: 'training-svg-desc'});
    description.textContent = 'Select Scene, Object, or Interaction in the inner ring, or a category in the outer ring. Arrow keys move between slices; Enter or Space selects. Sector sizes show category coverage, not sample counts.';
    const labelPaths = svgEl('defs');
    const curvedLabels = [];
    const arcLayer = svgEl('g');
    const labelLayer = svgEl('g', {'aria-hidden': 'true', 'pointer-events': 'none'});
    const center = svgEl('g', {'aria-hidden': 'true', 'pointer-events': 'none'});
    const centerName = svgEl('text', {x: 280, y: 266, class: 'training-center-name', 'text-anchor': 'middle'});
    centerName.textContent = 'InsertWorld';
    const centerSmall = svgEl('text', {x: 280, y: 293, class: 'training-center-small', 'text-anchor': 'middle'});
    centerSmall.textContent = 'Training data';
    const centerHint = svgEl('text', {x: 280, y: 314, class: 'training-center-hint', 'text-anchor': 'middle'});
    centerHint.textContent = 'Select a slice';
    center.append(centerName, centerSmall, centerHint);
    svg.append(title, description, labelPaths, arcLayer, labelLayer, center);
    const preview = el('div', 'training-preview-caption');
    // Stacked copies reserve the longest caption, including hover previews.
    const previewCopies = new Map();
    byId.forEach(node => {
      const copy = el('div', 'training-preview-copy');
      copy.append(
        el('strong', '', node === root ? 'Three complementary views' : node.label),
        el('p', '', node === root ? 'Scenes, objects, and interactions describe the same training set.' : node.description)
      );
      copy.setAttribute('aria-hidden', 'true');
      previewCopies.set(node.id, copy);
      preview.append(copy);
    });
    plot.append(svg, preview, el('p', 'training-sector-note', 'Category coverage; sectors do not represent sample counts.'));
    const detail = el('div', 'training-detail');
    detail.id = 'training-selection';
    const detailPanels = new Map();
    let renderTarget;
    layout.append(plot, detail);
    mount.replaceChildren(toolbar, layout, live);

    function groupOf(node) { return node.group || (node === root ? null : node); }
    function isRelated(node, other) { return node === root || node === other || groupOf(node) === other || node === groupOf(other); }
    function showPreview(node) {
      const group = groupOf(node);
      preview.style.setProperty('--training-accent', group ? colors[group.id].base : '#b8ccda');
      previewCopies.forEach((copy, id) => {
        const active = id === node.id;
        copy.classList.toggle('is-active', active);
        copy.setAttribute('aria-hidden', String(!active));
      });
      segments.forEach(entry => {
        entry.path.classList.toggle('is-preview', entry.node === node && node !== root);
      });
    }
    function syncSelection() {
      const group = groupOf(selected);
      controls.forEach(entry => entry.control.setAttribute('aria-pressed', String(entry.node === (group || root))));
      segments.forEach(entry => {
        entry.path.classList.toggle('is-selected', entry.node === selected);
        entry.path.classList.toggle('is-muted', !isRelated(selected, entry.node));
        entry.path.setAttribute('aria-pressed', String(entry.node === selected));
      });
      centerName.textContent = group ? group.label : 'InsertWorld';
      centerSmall.textContent = group ? `${fmt(group.count)} ${group.unit}` : 'Training data';
      centerHint.textContent = group ? `${group.categories.length} categories shown` : 'Select a slice';
      showPreview(selected);
    }
    function select(node) {
      const moveKeyboardFocus = detail.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
      selected = node;
      syncSelection();
      renderDetail();
      if (moveKeyboardFocus) detail.querySelector('.training-detail-panel.is-active h4').focus({preventScroll: true});
      // Main scope buttons keep the reader's position; leaf selections may reveal their details.
      if (node.group && window.matchMedia('(max-width:760px)').matches) {
        requestAnimationFrame(() => detail.scrollIntoView({block:'start', behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth'}));
      }
      live.textContent = node === root ? 'All InsertWorld categories.' : `${node.group ? `${node.group.label}: ` : ''}${node.label} selected. Examples updated.`;
    }
    function connect(path, node) {
      path.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') showPreview(node); });
      path.addEventListener('pointerleave', () => showPreview(selected));
      path.addEventListener('focus', () => showPreview(node));
      path.addEventListener('blur', () => showPreview(selected));
      path.addEventListener('click', () => select(node));
      path.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); select(node); return;
        }
        const index = segments.findIndex(entry => entry.path === path);
        let next;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % segments.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + segments.length - 1) % segments.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = segments.length - 1;
        if (next !== undefined) { event.preventDefault(); segments[next].path.focus(); }
        if (event.key === 'Escape') { event.preventDefault(); select(root); controls[0].control.focus(); }
      });
    }
    function addSegment(node, inner, outer, a, b, group) {
      const path = svgEl('path', {
        d: sector(inner, outer, a + .008, b - .008),
        fill: node === group ? colors[group.id].base : colors[group.id].light,
        class: 'training-segment', role: 'button', tabindex: '0', 'aria-pressed': 'false',
        'aria-controls': 'training-selection', 'aria-label': node === group ? `${group.label}, ${fmt(group.count)} ${group.unit}. Explore ${group.categories.length} categories.` : `${group.label}: ${node.label}. Show examples.`
      });
      connect(path, node);
      arcLayer.append(path);
      segments.push({path, node});
      const mid = (a + b) / 2;
      const reversed = Math.cos(mid) < 0;
      const lines = node === group ? [node.label] : labelLines[node.id] || [node.label];
      lines.forEach((line, index) => {
        const offset = (index - (lines.length - 1) / 2) * 18;
        const radius = (inner + outer) / 2 + offset * (reversed ? 1 : -1);
        const start = a + .014;
        const end = b - .014;
        const from = polar(radius, reversed ? end : start);
        const to = polar(radius, reversed ? start : end);
        const pathId = `training-label-${node.id}-${index}`;
        labelPaths.append(svgEl('path', {
          id: pathId,
          d: `M${from} A${radius},${radius} 0 ${(end - start) > Math.PI ? 1 : 0} ${reversed ? 0 : 1} ${to}`
        }));
        const text = svgEl('text', {
          'text-anchor': 'middle', dy: '.32em',
          class: node === group ? 'training-group-label' : 'training-leaf-label',
          fill: colors[group.id].ink
        });
        const textPath = svgEl('textPath', {href: `#${pathId}`, startOffset: '50%'});
        textPath.textContent = line;
        text.append(textPath);
        labelLayer.append(text);
        curvedLabels.push({text, maxLength: radius * (end - start) - 3});
      });
    }
    function fitCurvedLabels() {
      curvedLabels.forEach(({text, maxLength}) => {
        text.style.removeProperty('font-size');
        const width = text.getComputedTextLength();
        if (width > maxLength && width > 0) {
          const size = parseFloat(getComputedStyle(text).fontSize);
          text.style.fontSize = `${size * maxLength / width}px`;
        }
      });
    }

    groups.forEach((group, i) => {
      const a = i * Math.PI * 2 / 3 - Math.PI / 3;
      const b = a + Math.PI * 2 / 3;
      addSegment(group, 103, 161, a, b, group);
      group.categories.forEach((category, j) => {
        const start = a + (b - a) * j / group.categories.length;
        const end = a + (b - a) * (j + 1) / group.categories.length;
        addSegment(category, 165, 263, start, end, group);
      });
    });

    requestAnimationFrame(fitCurvedLabels);
    document.fonts.ready.then(fitCurvedLabels);
    let fitFrame;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(fitCurvedLabels);
    });

    function categoryButton(category, cls = 'training-category-chip') {
      const node = button(cls, category.label, () => select(category));
      node.dataset.trainingCategory = category.id;
      node.setAttribute('aria-pressed', String(selected === category));
      node.style.setProperty('--training-light', colors[category.group.id].light);
      node.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') showPreview(category); });
      node.addEventListener('pointerleave', () => showPreview(selected));
      node.addEventListener('focus', () => showPreview(category));
      node.addEventListener('blur', () => showPreview(selected));
      return node;
    }
    function categoryChips(group) {
      const list = el('div', 'training-category-chips');
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', `${group.label} categories`);
      group.categories.forEach(category => list.append(categoryButton(category)));
      return list;
    }
    function heading(node) {
      const group = groupOf(node);
      renderTarget.style.setProperty('--training-accent', group ? colors[group.id].base : '#adc7cc');
      const top = el('div', 'training-detail-heading');
      const line = el('div', 'training-detail-title-line');
      const detailTitle = el('h4', '', node === root ? 'Explore the training set' : node.label);
      detailTitle.tabIndex = -1;
      line.append(detailTitle);
      if (node !== root && !node.group) line.append(el('span', 'training-total', `${fmt(node.count)} ${node.unit}`));
      if (node.group) {
        const back = button('training-back', `← ${group.label}`, () => select(group));
        top.append(back);
      }
      const description = node.id === 'object' ? 'Explore object geometry and materials. Hover an object to bring it forward.' : node === root ? 'Choose a category to see examples from the dataset figure.' : node.description;
      top.append(line, el('p', 'training-detail-description', description));
      renderTarget.append(top);
    }
    function moreExamples(group) {
      const note = el('p', 'training-more-examples');
      note.style.setProperty('--omission-ink', group ? colors[group.id].ink : '#8b7b66');
      note.textContent = 'A glimpse of InsertWorld';
      return note;
    }
    function renderOverview() {
      groups.forEach(group => {
        const card = el('div', 'training-overview-card');
        card.style.setProperty('--training-accent', colors[group.id].base);
        const groupButton = button('training-overview-button', undefined, () => select(group));
        groupButton.append(image(overviews[group.id], '', 'training-overview-thumb'));
        const copy = el('span', 'training-overview-copy');
        copy.append(el('strong', '', group.label), el('span', '', `${fmt(group.count)} ${group.unit}`));
        groupButton.append(copy, el('span', 'training-overview-arrow', '↗'));
        groupButton.setAttribute('aria-label', `Explore ${group.label}: ${fmt(group.count)} ${group.unit}`);
        card.append(groupButton, categoryChips(group));
        renderTarget.append(card);
      });
    }
    function firstImage(category) {
      return category.images?.[0]?.src || category.pairs?.[0]?.after || null;
    }
    function renderGroup(group) {
      if (group.id === 'interaction') return renderInteractionGrid(group);
      if (group.id === 'object') return renderObjectStacks(group);
      const grid = el('div', 'training-category-grid');
      group.categories.forEach(category => {
        const card = categoryButton(category, 'training-category-card');
        card.replaceChildren();
        const src = firstImage(category);
        if (src) card.append(image(src, ''));
        else card.append(el('span', 'training-coverage-placeholder', 'Listed in coverage'));
        card.append(el('span', 'training-category-card-label', category.label));
        grid.append(card);
      });
      renderTarget.append(grid);
    }
    function pairStage(item, category) {
      const stage = el('div', 'training-pair-stage');
      stage.style.setProperty('--training-split', '50%');
      stage.setAttribute('role', 'group');
      stage.setAttribute('aria-label', `Counterfactual training pair: ${category.label}`);
      stage.append(image(item.after, item.afterAlt || item.alt || `${category.label}, with object`, 'training-pair-after'));
      const before = el('div', 'training-pair-before');
      before.append(image(item.before, item.beforeAlt || `${category.label}, without object`));
      const range = el('input', 'training-pair-range');
      range.type = 'range'; range.min = '0'; range.max = '100'; range.value = '50';
      range.setAttribute('aria-label', `Reveal the scene without the object: ${category.label}`);
      range.setAttribute('aria-valuetext', '50 percent without object');
      range.addEventListener('input', () => {
        stage.style.setProperty('--training-split', `${range.value}%`);
        range.setAttribute('aria-valuetext', `${range.value} percent without object`);
      });
      stage.append(before, el('span', 'training-pair-label without', 'Without object'), el('span', 'training-pair-label with', 'With object'), el('span', 'training-pair-divider'), el('span', 'training-pair-handle', '↔'), range);
      stage.querySelector('.training-pair-handle').setAttribute('aria-hidden', 'true');
      return stage;
    }
    function renderInteractionGrid(group) {
      const grid = el('div', 'training-interaction-grid');
      group.categories.forEach(category => {
        const card = el('article', 'training-interaction-card');
        card.classList.toggle('is-highlighted', selected === category);
        card.dataset.category = category.id;
        card.append(pairStage(category.pairs[0], category), el('h5', '', category.label));
        grid.append(card);
      });
      renderTarget.append(grid);
    }
    function renderObjectStacks(group) {
      const grid = el('div', 'training-object-grid');
      group.categories.forEach(category => {
        const card = el('section', 'training-object-category');
        card.classList.toggle('is-highlighted', selected === category);
        card.dataset.category = category.id;
        const row = el('div', 'training-object-stack');
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', `${category.label} examples`);
        row.style.setProperty('--object-card-width', `${100 / (1 + (category.images.length - 1) * .45)}%`);
        category.images.forEach((item, index) => {
          const tile = button('training-object-tile');
          tile.style.setProperty('--object-order', index + 1);
          tile.setAttribute('aria-label', `${category.label}: ${item.alt}`);
          tile.append(image(item.src, item.alt));
          tile.addEventListener('click', () => {
            const wasActive = tile.classList.contains('is-active');
            grid.querySelectorAll('.training-object-tile.is-active').forEach(other => other.classList.remove('is-active'));
            if (!wasActive) tile.classList.add('is-active');
          });
          tile.addEventListener('blur', () => tile.classList.remove('is-active'));
          row.append(tile);
        });
        card.append(row, el('h5', '', category.label));
        grid.append(card);
      });
      renderTarget.append(grid, el('p', 'training-object-hint', 'Hover or focus an object to bring it forward. Tap on touch screens.'));
    }
    function exampleItems(category) {
      return [...(category.pairs || []).map(pair => ({type: 'pair', ...pair})), ...(category.images || []).map(item => ({type: 'image', ...item}))];
    }
    function renderLeaf(category) {
      let exampleIndex = 0;
      const items = exampleItems(category);
      const display = el('div', 'training-example-display');
      const controlsArea = el('div', 'training-example-navigation');
      const meta = el('p', 'training-example-meta');
      const position = el('span', 'training-example-position');
      const thumbnails = el('div', 'training-example-thumbnails');
      const thumbButtons = [];
      if (items.length > 1) {
        const previous = button('training-example-step', '←', () => changeExample(-1));
        previous.setAttribute('aria-label', `Previous ${category.label} example`);
        const next = button('training-example-step', '→', () => changeExample(1));
        next.setAttribute('aria-label', `Next ${category.label} example`);
        controlsArea.append(previous, position, next);
        items.forEach((item, index) => {
          const thumb = button('training-example-thumbnail', undefined, () => { exampleIndex = index; showItem(); });
          thumb.append(image(item.type === 'pair' ? item.after : item.src, ''));
          thumb.setAttribute('aria-label', `${category.label}, example ${index + 1}`);
          thumb.setAttribute('aria-pressed', String(index === exampleIndex));
          thumbnails.append(thumb);
          thumbButtons.push(thumb);
        });
      } else controlsArea.append(position);
      function showItem() {
        display.replaceChildren();
        const item = items[exampleIndex];
        if (item.type === 'pair') {
          const stage = pairStage(item, category);
          display.append(stage);
          meta.textContent = 'Drag to inspect the object and its effects on the scene.';
        } else {
          const large = enlarge(item.src, `${category.label} — training example`, 'training-large-image');
          large.replaceChildren(image(item.src, item.alt || category.label));
          large.append(el('span', 'training-image-expand', 'Enlarge ↗'));
          display.append(large);
          meta.textContent = 'Example from the InsertWorld dataset composition figure.';
        }
        position.textContent = `Example ${exampleIndex + 1} / ${items.length}`;
        thumbButtons.forEach((thumb, index) => thumb.setAttribute('aria-pressed', String(index === exampleIndex)));
      }
      function changeExample(delta) {
        exampleIndex = (exampleIndex + delta + items.length) % items.length;
        showItem();
        live.textContent = `${category.label}: example ${exampleIndex + 1} of ${items.length}.`;
      }
      if (items.length) {
        showItem();
        renderTarget.append(display, thumbnails, controlsArea, meta);
      } else {
        const missing = el('div', 'training-no-image');
        missing.append(el('span', 'training-coverage-tag', 'Category coverage'), el('p', '', category.note || 'The source figure lists this category but does not show a separate example.'), enlarge('assets/dataset-composition-full.webp', 'InsertWorld dataset composition', 'training-source-link'));
        missing.querySelector('button').textContent = 'View full composition figure ↗';
        renderTarget.append(missing);
      }
      if (category.note && items.length) renderTarget.append(el('p', 'training-category-note', category.note));
      const related = el('div', 'training-related');
      related.append(el('p', '', `More ${category.group.label.toLowerCase()} categories`), categoryChips(category.group));
      renderTarget.append(related);
    }
    // Each scope fits the same panel canvas, set by the map and its caption.
    // Keep inactive scopes inert while their controls retain local state.
    const panelNodes = [root, ...groups, ...groups.find(group => group.id === 'scene').categories];
    panelNodes.forEach(node => {
      const panel = el('div', 'training-detail-panel');
      panel.dataset.trainingPanel = node.id;
      panel.setAttribute('aria-hidden', 'true');
      panel.inert = true;
      detailPanels.set(node.id, panel);
      detail.append(panel);
      renderTarget = panel;
      heading(node);
      const body = el('div', 'training-panel-body');
      body.dataset.trainingKind = node === root ? 'overview' : node.group ? 'leaf' : node.id;
      panel.append(body);
      renderTarget = body;
      if (node === root) renderOverview();
      else if (node.group) renderLeaf(node);
      else renderGroup(node);
      panel.append(moreExamples(groupOf(node)));
    });
    function renderDetail() {
      const node = selected.group && ['object', 'interaction'].includes(selected.group.id) ? selected.group : selected;
      detailPanels.forEach((panel, id) => {
        const active = id === node.id;
        panel.classList.toggle('is-active', active);
        panel.inert = !active;
        panel.setAttribute('aria-hidden', String(!active));
      });
      detail.querySelectorAll('[data-training-category]').forEach(control => {
        control.setAttribute('aria-pressed', String(control.dataset.trainingCategory === selected.id));
      });
      detail.querySelectorAll('[data-category]').forEach(card => {
        card.classList.toggle('is-highlighted', card.dataset.category === selected.id);
      });
    }
    syncSelection();
    renderDetail();
    mount.setAttribute('aria-busy', 'false');
  }
  initialize().catch(() => {
    mount.setAttribute('aria-busy', 'false');
    const message = el('p', 'training-load-error', 'The interactive explorer could not load. You can still view the complete dataset figure.');
    mount.replaceChildren(message, enlarge('assets/dataset-composition-full.webp', 'InsertWorld dataset composition', 'training-source-link'));
  });
})();
