/* One complete rendered example: a paired scene and a reference grid. */
(() => {
  'use strict';
  const mount = document.getElementById('apple-example');
  if (!mount) return;
  const node = (tag, className = '', text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const img = (src, alt, className = '') => {
    const element = node('img', className);
    element.src = src;
    element.alt = alt;
    element.loading = 'lazy';
    element.draggable = false;
    return element;
  };
  const button = (className, text, action) => {
    const element = node('button', className, text);
    element.type = 'button';
    if (action) element.addEventListener('click', action);
    return element;
  };
  const enlarge = (src, title, className = '') => {
    const element = button(className, '↗');
    element.dataset.figure = src;
    element.dataset.title = title;
    element.setAttribute('aria-label', `Enlarge ${title}`);
    return element;
  };
  const pendingImages = new Map();
  const decode = src => {
    if (pendingImages.has(src)) return pendingImages.get(src);
    const image = new Image();
    image.src = src;
    const pending = image.decode().then(() => image).finally(() => pendingImages.delete(src));
    pendingImages.set(src, pending);
    return pending;
  };

  async function initialize() {
    mount.setAttribute('aria-busy', 'true');
    const response = await fetch('apple-example.json?v=environment-v1');
    if (!response.ok) throw new Error('Example manifest could not be loaded.');
    const data = await response.json();
    const pairs = (data.pairs || []).filter(pair => pair.with && pair.without);
    const matrix = data.referenceMatrix || {};
    const views = (matrix.views || []).filter(view => view.id && view.thumbnail);
    const lights = (matrix.lights || []).filter(light => light.id && light.preview);
    const combinations = new Map((matrix.images || [])
      .filter(item => item.image && views.some(view => view.id === item.view) && lights.some(light => light.id === item.light))
      .map(item => [JSON.stringify([item.view, item.light]), item]));
    const lookup = (view, light) => combinations.get(JSON.stringify([view.id, light.id]));
    if (!pairs.length || !views.length || !lights.length || !combinations.size) throw new Error('Example is incomplete.');
    let selectedView = views.find(view => view.id === matrix.defaultView) || views[0];
    let selectedLight = lights.find(light => light.id === matrix.defaultLight) || lights[0];
    if (!lookup(selectedView, selectedLight)) {
      const first = combinations.values().next().value;
      selectedView = views.find(view => view.id === first.view);
      selectedLight = lights.find(light => light.id === first.light);
    }
    let committedView = selectedView;
    let committedLight = selectedLight;
    let committedKey = null;
    let pendingKey = null;
    let hoverTimer = null;
    let requestId = 0;
    let pairRequestId = 0;
    const heading = node('div', 'apple-example-heading');
    const title = node('h3', '', data.title || 'One object, paired scenes and varied references');
    title.id = 'apple-example-title';
    mount.setAttribute('aria-labelledby', title.id);
    const introduction = node('p', '', data.description || 'Explore the apple example from our data construction figure.');
    heading.append(title, introduction);

    const layout = node('div', 'apple-example-grid');
    const scenePanel = node('div', 'apple-scene-panel');
    const sceneHeading = node('div', 'apple-panel-heading');
    sceneHeading.append(node('h4', '', 'With–without scene pair'), node('span', 'apple-panel-tag', 'Same camera · same lighting'));
    const pairControls = node('div', 'apple-pair-controls');
    pairControls.setAttribute('role', 'group');
    pairControls.setAttribute('aria-label', 'Choose paired scene');
    const pairButtons = pairs.map(pair => {
      const control = button('apple-light-button', pair.label, () => selectPair(pair));
      control.dataset.pair = pair.id;
      control.setAttribute('aria-pressed', String(pair === pairs[0]));
      pairControls.append(control);
      return {control, pair};
    });
    const stage = node('div', 'apple-pair-stage');
    const pairWidth = Number(pairs[0].width), pairHeight = Number(pairs[0].height);
    stage.style.setProperty('--apple-pair-ratio', pairWidth > 0 && pairHeight > 0 ? `${pairWidth}/${pairHeight}` : '1');
    stage.style.setProperty('--apple-split', '45%');
    const withImage = img(pairs[0].with, 'Scene with the apple object', 'apple-pair-image');
    const withoutLayer = node('div', 'apple-without-layer');
    const withoutImage = img(pairs[0].without, 'The same scene without the apple object', 'apple-pair-image');
    withoutLayer.append(withoutImage);
    const line = node('span', 'apple-pair-line');
    line.setAttribute('aria-hidden', 'true');
    const handle = node('span', 'apple-pair-handle', '↔');
    handle.setAttribute('aria-hidden', 'true');
    const range = node('input', 'apple-pair-range');
    range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '0.1'; range.value = '45';
    range.setAttribute('aria-label', 'Compare the scene without and with the apple object');
    range.setAttribute('aria-describedby', 'apple-pair-help');
    function setSplit(value) {
      range.value = value;
      stage.style.setProperty('--apple-split', `${value}%`);
      range.setAttribute('aria-valuetext', `${Math.round(value)}% of the scene without the object revealed`);
    }
    range.addEventListener('input', () => setSplit(range.value));
    setSplit(45);
    stage.append(withImage, withoutLayer, line, handle, range);
    const ends = node('div', 'apple-pair-endpoints');
    const withoutButton = button('apple-pair-endpoint', 'Without object', () => setSplit(100));
    const withButton = button('apple-pair-endpoint', 'With object', () => setSplit(0));
    ends.append(withoutButton, node('span', 'apple-pair-drag', 'Drag to compare'), withButton);
    const help = node('p', 'apple-panel-note', 'The camera and lighting stay fixed; the pair captures the object and the effects it creates in the scene.');
    help.id = 'apple-pair-help';
    const pairDownloads = node('div', 'apple-pair-open');
    const withoutOpen = enlarge(pairs[0].without, 'Apple example · Without object', 'apple-open-link');
    withoutOpen.textContent = 'Without ↗';
    const withOpen = enlarge(pairs[0].with, 'Apple example · With object', 'apple-open-link');
    withOpen.textContent = 'With ↗';
    pairDownloads.append(withoutOpen, withOpen);
    const pairLive = node('p', 'apple-demo-status');
    pairLive.setAttribute('role', 'status');
    scenePanel.append(sceneHeading, pairControls, stage, ends, help, pairDownloads, pairLive);

    const referencePanel = node('div', 'apple-reference-panel');
    const referenceHeading = node('div', 'apple-panel-heading');
    referenceHeading.append(node('h4', '', 'Reference object'), node('span', 'apple-panel-tag', 'Choose a viewpoint and a light'));
    const axisLabels = node('div', 'apple-reference-axis-labels');
    const viewLabel = node('span', 'apple-axis-label', 'Viewpoint');
    viewLabel.id = 'apple-viewpoint-label';
    const referenceCaption = node('p', 'apple-reference-caption');
    axisLabels.append(viewLabel, referenceCaption);
    const workbench = node('div', 'apple-reference-workbench');
    const viewSelector = node('div', 'apple-view-selector');
    const viewRail = node('div', 'apple-view-rail');
    viewRail.setAttribute('role', 'group');
    viewRail.setAttribute('aria-labelledby', viewLabel.id);
    viewRail.style.setProperty('--apple-view-count', views.length);
    const viewButtons = views.map(view => {
      const control = button('apple-view-button', undefined, () => select(view, selectedLight));
      previewOnHoverAndFocus(control, () => select(view, selectedLight));
      control.dataset.appleView = view.id;
      control.append(img(view.thumbnail, '', 'apple-view-thumb'), node('span', 'apple-selector-label', view.label));
      control.setAttribute('aria-label', `Viewpoint: ${view.label}`);
      viewRail.append(control);
      return {control, view};
    });
    viewSelector.append(viewRail);
    const referenceFrame = button('apple-reference-frame');
    referenceFrame.setAttribute('aria-label', 'Enlarge selected apple reference');
    referenceFrame.disabled = true;
    const referenceImage = img(lookup(selectedView, selectedLight).image, '', 'apple-reference-image');
    const zoomMark = node('span', 'apple-reference-zoom', '↗');
    zoomMark.setAttribute('aria-hidden', 'true');
    referenceFrame.append(referenceImage, zoomMark);
    workbench.append(viewSelector, referenceFrame);
    const lightLabel = node('p', 'apple-lighting-title', 'Lighting environment');
    lightLabel.id = 'apple-lighting-label';
    const lightRail = node('div', 'apple-light-rail');
    lightRail.setAttribute('role', 'group');
    lightRail.setAttribute('aria-labelledby', lightLabel.id);
    lightRail.style.setProperty('--apple-light-count', lights.length);
    const lightButtons = lights.map(light => {
      const control = button('apple-environment-button', undefined, () => select(selectedView, light));
      previewOnHoverAndFocus(control, () => select(selectedView, light));
      control.dataset.appleLight = light.id;
      control.append(img(light.preview, '', 'apple-environment-thumb'), node('span', 'apple-selector-label', light.label));
      control.setAttribute('aria-label', `Lighting: ${light.label}`);
      lightRail.append(control);
      return {control, light};
    });
    const live = node('p', 'apple-demo-status');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    referencePanel.append(referenceHeading, axisLabels, workbench, lightLabel, lightRail, live);
    layout.append(scenePanel, referencePanel);
    mount.replaceChildren(heading, layout);
    mount.classList.add('apple-example');
    mount.removeAttribute('aria-busy');

    async function selectPair(pair) {
      cancelHoverPreview();
      const currentRequest = ++pairRequestId;
      pairButtons.forEach(({control, pair:item}) => control.setAttribute('aria-pressed', String(item === pair)));
      scenePanel.setAttribute('aria-busy', 'true');
      pairLive.textContent = 'Loading paired scene…';
      try {
        const loaded = await Promise.all([decode(pair.with), decode(pair.without)]);
        if (currentRequest !== pairRequestId) return;
        withImage.src = loaded[0].src;
        withoutImage.src = loaded[1].src;
        withImage.alt = `${pair.label}: scene with the apple object`;
        withoutImage.alt = `${pair.label}: the same scene without the apple object`;
        withOpen.dataset.figure = pair.with;
        withoutOpen.dataset.figure = pair.without;
        withOpen.dataset.title = `Apple example · ${pair.label} · With object`;
        withoutOpen.dataset.title = `Apple example · ${pair.label} · Without object`;
        pairLive.textContent = '';
      } catch {
        if (currentRequest === pairRequestId) pairLive.textContent = 'This pair could not be loaded. Try another scene.';
      } finally {
        if (currentRequest === pairRequestId) scenePanel.removeAttribute('aria-busy');
      }
    }
    function syncSelection() {
      viewButtons.forEach(({control, view}) => {
        control.setAttribute('aria-pressed', String(view === selectedView));
        control.disabled = !lookup(view, selectedLight);
      });
      lightButtons.forEach(({control, light}) => {
        control.setAttribute('aria-pressed', String(light === selectedLight));
        control.disabled = !lookup(selectedView, light);
      });
    }
    function cancelHoverPreview() {
      if (hoverTimer !== null) clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    function previewOnHoverAndFocus(control, action) {
      control.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'mouse' || control.disabled) return;
        cancelHoverPreview();
        hoverTimer = setTimeout(() => {
          hoverTimer = null;
          if (!control.disabled && control.matches(':hover')) action();
        }, 150);
      });
      control.addEventListener('pointerleave', cancelHoverPreview);
      control.addEventListener('pointerdown', cancelHoverPreview);
      control.addEventListener('focus', () => {
        if (!control.disabled && control.matches(':focus-visible')) action();
      });
    }
    async function select(view, light) {
      cancelHoverPreview();
      const selected = lookup(view, light);
      if (!selected) return;
      const key = JSON.stringify([view.id, light.id]);
      if (key === pendingKey || (key === committedKey && pendingKey === null)) return;
      selectedView = view;
      selectedLight = light;
      const selectionLabel = `${view.label} · ${light.label}`;
      const currentRequest = ++requestId;
      syncSelection();
      if (key === committedKey) {
        pendingKey = null;
        referencePanel.removeAttribute('aria-busy');
        live.textContent = '';
        return;
      }
      pendingKey = key;
      referencePanel.setAttribute('aria-busy', 'true');
      live.textContent = `Loading ${selectionLabel}…`;
      try {
        const loaded = await decode(selected.image);
        if (currentRequest !== requestId) return;
        referenceImage.src = loaded.src;
        referenceImage.alt = `Apple object reference: ${selectionLabel}`;
        referenceFrame.dataset.figure = selected.image;
        referenceFrame.dataset.title = `Apple reference · ${selectionLabel}`;
        referenceFrame.setAttribute('aria-label', `Enlarge apple reference: ${selectionLabel}`);
        referenceFrame.disabled = false;
        referenceCaption.textContent = selectionLabel;
        committedView = view;
        committedLight = light;
        committedKey = key;
        live.textContent = '';
      } catch {
        if (currentRequest !== requestId) return;
        selectedView = committedView;
        selectedLight = committedLight;
        syncSelection();
        live.textContent = 'This reference could not be loaded. Try another view.';
      } finally {
        if (currentRequest === requestId) {
          pendingKey = null;
          referencePanel.removeAttribute('aria-busy');
        }
      }
    }
    select(selectedView, selectedLight);
  }
  initialize().catch(() => {
    mount.removeAttribute('aria-busy');
    mount.replaceChildren(node('p', 'apple-example-error', 'The complete example could not be loaded. Please refresh to try again.'));
  });
})();
