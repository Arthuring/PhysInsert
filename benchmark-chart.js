/* PhysInsert-Bench composition. All proportions use the full 400-case benchmark. */
(() => {
  'use strict';
  const mount = document.getElementById('benchmark-chart');
  if (!mount) return;
  const NS = 'http://www.w3.org/2000/svg';
  const colors = {
    optical: ['#cbd9a4', '#dce6c4', '#e8eed8'],
    e2o: ['#cbd9a4', '#d4e0b7', '#e2eaca'],
    o2e: ['#cbd9a4', '#dee7c7', '#ebf0dc'],
    mutual: ['#cbd9a4', '#d0dcb0', '#e3ebcd'],
    structural: ['#edbdb4', '#f3d0c8', '#f8e3dd'],
    spatial: ['#edbdb4', '#f1cbc4', '#f7dfd9'],
    mechanical: ['#edbdb4', '#f5dcae', '#faeacd']
  };
  const fmt = value => Number(value).toLocaleString('en-US');
  const pct = value => `${Number(value.toFixed(2))}%`;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svgEl = (tag, attrs = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  function polar(radius, angle) {
    return [260 + radius * Math.sin(angle), 260 - radius * Math.cos(angle)];
  }
  function sector(inner, outer, start, end) {
    // Split a complete ring in two arcs, since SVG cannot draw a full circle in one arc.
    if (end - start >= Math.PI * 2 - 0.00001) {
      const mid = start + Math.PI;
      const a = polar(outer, start), b = polar(outer, mid);
      const c = polar(inner, start), d = polar(inner, mid);
      return `M${a} A${outer},${outer} 0 1 1 ${b} A${outer},${outer} 0 1 1 ${a} L${c} A${inner},${inner} 0 1 0 ${d} A${inner},${inner} 0 1 0 ${c} Z`;
    }
    const a = polar(outer, start), b = polar(outer, end);
    const c = polar(inner, end), d = polar(inner, start);
    const large = end - start > Math.PI ? 1 : 0;
    return `M${a} A${outer},${outer} 0 ${large} 1 ${b} L${c} A${inner},${inner} 0 ${large} 0 ${d} Z`;
  }
  const descendants = node => [node, ...(node.children || []).flatMap(descendants)];
  const contains = (parent, child) => child === parent || child.ancestors.includes(parent);

  async function initialize() {
    mount.classList.add('bench-chart');
    mount.setAttribute('aria-busy', 'true');
    const response = await fetch('benchmark-data.json');
    if (!response.ok) throw new Error(`Benchmark data returned ${response.status}`);
    const data = await response.json();
    const root = data.hierarchy;
    const nodes = new Map();
    function index(node, ancestors = []) {
      node.ancestors = ancestors;
      node.depth = ancestors.length;
      nodes.set(node.id, node);
      (node.children || []).forEach(child => index(child, [...ancestors, node]));
    }
    index(root);
    let scope = root, selected = root;
    let paths = [], tagButtons = [];

    const toolbar = el('div', 'bench-toolbar');
    toolbar.append(el('p', 'bench-summary', 'Select a segment or tag to explore the benchmark.'));
    const scopes = el('div', 'bench-scopes');
    scopes.setAttribute('role', 'group');
    scopes.setAttribute('aria-label', 'Benchmark composition scope');
    const scopeButtons = [root, ...root.children].map(node => {
      const button = el('button', 'bench-scope', node === root ? 'All' : node.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', node === root ? 'true' : 'false');
      button.addEventListener('click', () => {
        scope = node;
        selected = node;
        scopeButtons.forEach(entry => entry.button.setAttribute('aria-pressed', String(entry.node === node)));
        render();
        announce(node);
      });
      scopes.append(button);
      return {node, button};
    });
    toolbar.append(scopes);

    const layout = el('div', 'bench-chart-layout');
    const plot = el('div', 'bench-plot');
    const svg = svgEl('svg', {viewBox: '0 0 520 520', role: 'group', 'aria-labelledby': 'bench-svg-title bench-svg-desc'});
    const title = svgEl('title', {id: 'bench-svg-title'});
    title.textContent = 'PhysInsert-Bench composition';
    const desc = svgEl('desc', {id: 'bench-svg-desc'});
    desc.textContent = 'Three concentric rings show two major categories, five groups, and twenty physical tags. Select any segment or tag to inspect its case count. All percentages refer to the full 400-case benchmark.';
    svg.append(title, desc);
    const arcLayer = svgEl('g');
    const labelLayer = svgEl('g', {'aria-hidden': 'true', 'pointer-events': 'none'});
    const center = svgEl('g', {'aria-hidden': 'true', 'pointer-events': 'none'});
    const centerCount = svgEl('text', {x: 260, y: 246, class: 'bench-center-count', 'text-anchor': 'middle'});
    const centerUnit = svgEl('text', {x: 260, y: 267, class: 'bench-center-unit', 'text-anchor': 'middle'});
    centerUnit.textContent = 'cases';
    const centerName = svgEl('text', {x: 260, y: 291, class: 'bench-center-name', 'text-anchor': 'middle'});
    center.append(centerCount, centerUnit, centerName);
    svg.append(arcLayer, labelLayer, center);
    plot.append(svg, el('p', 'bench-ring-key', 'Category → Group → Physical tag'));

    const detail = el('div', 'bench-detail');
    const eyebrow = el('p', 'bench-detail-eyebrow', 'PhysInsert-Bench');
    const detailTitle = el('h3', 'bench-detail-title');
    const breadcrumb = el('p', 'bench-breadcrumb');
    const metrics = el('div', 'bench-detail-metrics');
    const number = el('strong', 'bench-detail-number');
    const metricText = el('span', 'bench-detail-metric-label');
    metrics.append(number, metricText);
    const bar = el('div', 'bench-share-track');
    bar.setAttribute('aria-hidden', 'true');
    const fill = el('div', 'bench-share-fill');
    bar.append(fill);
    const share = el('p', 'bench-share');
    const definition = el('p', 'bench-definition');
    const hint = el('p', 'bench-hint', 'Hover to preview. Click or tap a segment or tag to keep it selected.');
    const browse = el('button', 'bench-browse-selection', 'Browse all 400 cases →');
    browse.type = 'button';
    browse.addEventListener('click', () => document.dispatchEvent(new CustomEvent('benchmark:browse', {detail: {id: browse.dataset.node || root.id}})));
    detail.append(eyebrow, detailTitle, breadcrumb, metrics, bar, share, definition, browse, hint);
    layout.append(plot, detail);

    const tagArea = el('div', 'bench-tag-area');
    const tagHeading = el('div', 'bench-tag-heading');
    tagHeading.append(el('h3', '', 'Explore the physical tags'), el('p', '', 'Each case belongs to one displayed tag.'));
    const tags = el('div', 'bench-tags');
    tagArea.append(tagHeading, tags);
    const key = el('p', 'bench-definitions');
    key.append(el('strong', '', 'E2O'), document.createTextNode(' environment → object'), el('span', 'bench-key-separator', '·'), el('strong', '', 'O2E'), document.createTextNode(' object → environment'), el('span', 'bench-key-separator', '·'), el('strong', '', 'Mutual'), document.createTextNode(' both directions'));
    const live = el('p', 'bench-screen-reader');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    mount.replaceChildren(toolbar, layout, tagArea, key, live);

    function announce(node) {
      live.textContent = `${node.label}: ${fmt(node.value)} cases, ${pct(node.value / data.totalCases * 100)} of the full benchmark.`;
    }
    function update(node) {
      centerCount.textContent = fmt(node.value);
      centerName.replaceChildren();
      const words = (node === root ? 'PhysInsert-Bench' : node.label).split(' ');
      let lines = [''];
      for (const word of words) {
        const last = lines.length - 1;
        if (lines[last] && `${lines[last]} ${word}`.length > 17) lines.push(word);
        else lines[last] += `${lines[last] ? ' ' : ''}${word}`;
      }
      lines.forEach((line, i) => {
        const span = svgEl('tspan', {x: 260, dy: i ? 17 : 0});
        span.textContent = line;
        centerName.append(span);
      });
      detailTitle.textContent = node === root ? 'A benchmark of physical interactions' : node.label;
      breadcrumb.textContent = node === root ? '2 categories · 5 groups · 20 physical tags' : node.ancestors.filter(a => a !== root).map(a => a.label).join(' / ') || 'Major category';
      browse.dataset.node = node.id;
      browse.textContent = `Browse ${fmt(node.value)} ${node.value === 1 ? 'case' : 'cases'} →`;
      browse.setAttribute('aria-label', `Browse ${fmt(node.value)} ${node === root ? 'PhysInsert-Bench' : node.label} cases`);
      number.textContent = fmt(node.value);
      metricText.textContent = node.value === 1 ? 'case' : 'cases';
      const percentage = node.value / data.totalCases * 100;
      fill.style.width = `${percentage}%`;
      const branch = node.depth ? node.ancestors[1] || node : root;
      fill.style.background = branch.id === 'optical' ? '#9eb16c' : branch.id === 'structural' ? '#d4968b' : '#8eaa95';
      share.textContent = `${pct(percentage)} of all ${fmt(data.totalCases)} benchmark cases`;
      const definitionMap = {
        'physinsert-bench': 'Controlled evaluation across optical interactions and structural adaptation.',
        optical: 'Lighting and optical interactions between an inserted object and its environment.',
        structural: 'Spatial relationships and mechanical configurations.',
        e2o: 'Environment-to-object: how the scene changes the appearance of the inserted object.',
        o2e: 'Object-to-environment: how the inserted object changes its surroundings.',
        mutual: 'Mutual optical interactions between the object and its surroundings.',
        spatial: 'Scale, viewpoint, and occlusion relationships.',
        mechanical: 'Resting, hanging, leaning, containment, and deformable configurations.'
      };
      definition.textContent = definitionMap[node.id] || `${node.ancestors[node.ancestors.length - 1].label} · ${node.ancestors[1].label} physical tag`;
      paths.forEach(entry => {
        const relevant = node === root || contains(node, entry.node) || contains(entry.node, node);
        entry.path.classList.toggle('is-dim', !relevant);
        entry.path.classList.toggle('is-highlighted', entry.node === node);
        entry.path.setAttribute('aria-pressed', String(entry.node === selected));
      });
      tagButtons.forEach(entry => {
        entry.button.classList.toggle('is-highlighted', entry.node === node);
        entry.button.setAttribute('aria-pressed', String(entry.node === selected));
      });
    }
    function select(node) {
      selected = node;
      update(node);
      announce(node);
    }
    function connect(target, node) {
      target.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') update(node); });
      target.addEventListener('pointerleave', () => update(selected));
      target.addEventListener('focus', () => update(node));
      target.addEventListener('blur', () => update(selected));
      target.addEventListener('click', () => select(node));
    }
    function render() {
      arcLayer.replaceChildren();
      labelLayer.replaceChildren();
      tags.replaceChildren();
      paths = [];
      tagButtons = [];
      const majors = scope === root ? root.children : [scope];
      let start = 0;
      const rings = [[84, 133], [136, 184], [187, 239]];
      function addSegment(node, ring, a, b) {
        const [inner, outer] = rings[ring];
        const paletteKey = node.depth === 1 ? node.id : node.depth === 2 ? node.id : node.ancestors[2].id;
        const palette = colors[paletteKey] || colors.optical;
        const path = svgEl('path', {
          d: sector(inner, outer, a, b), fill: palette[ring], class: 'bench-segment',
          role: 'button', tabindex: '0', 'aria-pressed': 'false',
          'aria-label': `${node.label}, ${fmt(node.value)} cases, ${pct(node.value / data.totalCases * 100)} of the full benchmark. ${node.ancestors.filter(n => n !== root).map(n => n.label).join(', ')}`
        });
        const tooltip = svgEl('title');
        tooltip.textContent = `${node.label}: ${fmt(node.value)} cases (${pct(node.value / data.totalCases * 100)})`;
        path.append(tooltip);
        connect(path, node);
        path.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node); }
        });
        arcLayer.append(path);
        paths.push({path, node});
        const span = b - a;
        const mid = (a + b) / 2;
        if (ring < 2 || node.value >= 10) {
          const radius = (inner + outer) / 2;
          const point = polar(radius, mid);
          const angle = mid * 180 / Math.PI;
          let rotation = angle;
          if (angle > 90 && angle < 270) rotation += 180;
          const text = svgEl('text', {
            x: point[0], y: point[1], dy: '.35em', 'text-anchor': 'middle',
            transform: `rotate(${rotation},${point[0]},${point[1]})`,
            class: ring === 2 ? 'bench-leaf-count' : 'bench-ring-label'
          });
          text.textContent = ring === 2 ? node.value : node.label;
          // Middle labels are shorter than their available arc lengths in every scope.
          if (span > 0.13) labelLayer.append(text);
        }
        if (node.children) {
          let cursor = a;
          node.children.forEach(child => {
            const end = cursor + (b - a) * child.value / node.value;
            addSegment(child, ring + 1, cursor, end);
            cursor = end;
          });
        }
      }
      majors.forEach(major => {
        const end = start + 2 * Math.PI * major.value / scope.value;
        addSegment(major, 0, start, end);
        start = end;
      });
      majors.flatMap(major => major.children).forEach(group => {
        const groupBlock = el('section', 'bench-tag-group');
        groupBlock.style.setProperty('--tag-accent', colors[group.id][1]);
        const header = el('h4');
        header.append(document.createTextNode(group.label), el('span', '', fmt(group.value)));
        groupBlock.append(header);
        group.children.forEach(node => {
          const button = el('button', 'bench-tag');
          button.type = 'button';
          button.setAttribute('aria-pressed', 'false');
          button.setAttribute('aria-label', `${node.label}, ${fmt(node.value)} cases, ${pct(node.value / data.totalCases * 100)} of the full benchmark`);
          button.append(el('span', 'bench-tag-label', node.label), el('span', 'bench-tag-count', fmt(node.value)));
          connect(button, node);
          groupBlock.append(button);
          tagButtons.push({button, node});
        });
        tags.append(groupBlock);
      });
      update(selected);
    }
    render();
    mount.removeAttribute('aria-busy');
  }
  initialize().catch(error => {
    mount.removeAttribute('aria-busy');
    mount.replaceChildren(el('p', 'bench-chart-error', 'PhysInsert-Bench comprises 400 cases from 103 scenes: 180 Optical and 220 Structural cases. The interactive chart is temporarily unavailable.'));
    console.error('Unable to load benchmark composition:', error);
  });
})();
