'use strict';
(() => {
  const root = document.querySelector('.hero-showcase');
  if (!root) return;
  const cases = {
    lighting: {name:'Lighting', number:'01', title:'A new scene. A new light.', ours:'Cool-lit reference objects take on the warm sunlight of their new surroundings.', reference:'Juice carafe, glasses and apples under cool lighting.', scene:'An empty sunlit wooden tabletop with window blinds.', dimensions:[1024,800]},
    interaction: {name:'Interaction', number:'02', title:'An object changes its surroundings.', ours:'The carafe reflects the nearby apples, while the mirror reflects the inserted carafe.', reference:'A transparent reference cutout of a glass carafe filled with orange juice.', scene:'Apples and glasses on a wooden table beside a mirror, before the carafe is inserted.', dimensions:[1024,747]},
    viewpoint: {name:'Viewpoint', number:'03', title:'Same objects. A new perspective.', ours:'The inserted arrangement adapts to the higher viewpoint of the target scene.', reference:'Juice carafe, glasses and apples viewed from a low oblique angle.', scene:'An empty wooden tabletop viewed from above.', dimensions:[1024,746]}
  };
  const order = Object.keys(cases);
  const tabs = [...root.querySelectorAll('[data-hero-case]')];
  const panel = root.querySelector('#hero-example');
  const result = root.querySelector('#hero-result');
  const output = root.querySelector('#hero-result-image');
  const caption = root.querySelector('.hero-caption');
  const status = root.querySelector('.hero-load-status');
  const controls = root.querySelector('.hero-demo-controls');
  const toggle = root.querySelector('.hero-autoplay');
  const replay = root.querySelector('.hero-replay');
  const phaseButtons = [...root.querySelectorAll('[data-hero-phase]')];
  const scrubber = root.querySelector('.hero-scrubber');
  const blendSlider = root.querySelector('#hero-blend-slider');
  const note = root.querySelector('.hero-paste-note');
  const modal = document.querySelector('#viewer-dialog');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const timeline = {paste:400, dissolve:1800, ours:1000, change:500};
  const total = timeline.paste + timeline.dissolve + timeline.ours;
  const decoded = new Map();
  let configuration = {};
  let active = 'lighting';
  let requestedKey = active;
  let ready = false;
  let loading = false;
  let pendingAutomatic = false;
  let requestId = 0;
  let elapsed = 0;
  let lastTime = null;
  let frame = null;
  let userPaused = motion.matches;
  let inView = false;
  let suspended = false;
  let chapterAnimation = null;
  let outgoing = null;
  let phase = '';
  let manualBlend = null;

  const canvas = document.createElement('span');
  canvas.className = 'hero-scene-canvas';
  const paste = document.createElement('span');
  paste.className = 'hero-paste-composite';
  paste.setAttribute('aria-hidden', 'true');
  const scene = document.createElement('img');
  scene.className = 'hero-paste-scene';
  scene.alt = '';
  const object = document.createElement('img');
  object.className = 'hero-paste-object';
  object.alt = '';
  paste.append(scene, object);
  canvas.append(paste);
  result.insertBefore(canvas, output);
  canvas.append(output);
  paste.hidden = true;
  const live = root.querySelector('.hero-demo-status');

  function asset(path) {
    if (typeof path !== 'string') throw new Error('Missing illustration asset');
    const url = new URL(path, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(new URL('assets/', location.href).pathname)) throw new Error('Invalid illustration asset');
    return url.href;
  }
  function loadImage(path) {
    const url = asset(path);
    if (!decoded.has(url)) {
      const image = new Image();
      image.src = url;
      decoded.set(url, image.decode().then(() => image).catch(error => { decoded.delete(url); throw error; }));
    }
    return decoded.get(url);
  }
  function validConfig(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Missing illustration');
    const crop = raw.scene?.crop || [0,0,1,1];
    if (!Array.isArray(crop) || crop.length !== 4 || crop.some(v => !Number.isFinite(v)) || crop[0]<0 || crop[1]<0 || crop[2]<=0 || crop[3]<=0 || crop[0]+crop[2]>1.001 || crop[1]+crop[3]>1.001) throw new Error('Invalid scene crop');
    const placement = raw.placement;
    if (!placement || ['x','y','width','height'].some(k=>!Number.isFinite(placement[k])) || placement.width<=0 || placement.height<=0) throw new Error('Invalid reference placement');
    asset(raw.scene.src); asset(raw.reference.src);
    if (raw.reference.mask) asset(raw.reference.mask);
    return {...raw, scene:{...raw.scene,crop}};
  }
  async function prepare(key) {
    const standard = await Promise.all(['reference','scene','ours'].map(role=>loadImage(`assets/hero-${key}-${role}.webp`)));
    let illustration = null;
    try {
      const spec = validConfig(configuration[key]);
      const sources = await Promise.all([loadImage(spec.scene.src), loadImage(spec.reference.src), ...(spec.reference.mask ? [loadImage(spec.reference.mask)] : [])]);
      const [width,height] = cases[key].dimensions;
      const crop = spec.scene.crop;
      const croppedRatio = sources[0].naturalWidth*crop[2] / (sources[0].naturalHeight*crop[3]);
      if (Math.abs(croppedRatio/(width/height)-1)>.015) throw new Error('Scene crop has the wrong aspect ratio');
      illustration = {spec, sceneImage:sources[0]};
    } catch (error) {
      // A missing cutout must never turn an unrelated baseline into a fake direct paste.
      illustration = null;
    }
    return {standard,illustration};
  }
  function resizeCanvas() {
    const [width,height] = cases[active].dimensions;
    const scale = Math.min(result.clientWidth/width, result.clientHeight/height);
    canvas.style.width = `${width*scale}px`;
    canvas.style.height = `${height*scale}px`;
    if (outgoing) {
      const ratio = Number(outgoing.dataset.ratio);
      const w = Math.min(result.clientWidth,result.clientHeight*ratio);
      outgoing.style.width = `${w}px`;
      outgoing.style.height = `${w/ratio}px`;
    }
  }
  function stopClock() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTime = null;
  }
  function canPlay() {
    return ready && !userPaused && inView && !document.hidden && !suspended && !modal?.open;
  }
  function setPhase(next) {
    if (next === phase) return;
    phase = next;
    root.dataset.heroPhase = next;
    phaseButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.heroPhase===next)));
    live.textContent = next==='paste' ? 'Direct cut-and-paste illustration.' : next==='transition' ? 'Transitioning to PhysInsert.' : 'PhysInsert result.';
  }
  function drawTime() {
    const available = root.dataset.pasteAvailable === 'true';
    let blend = Math.max(0,Math.min(1,(elapsed-timeline.paste)/timeline.dissolve));
    // Smoothstep changes opacity only; source colors and model pixels remain intact.
    blend = blend*blend*(3-2*blend);
    if (motion.matches) blend = elapsed<timeline.paste ? 0 : 1;
    // A direct gesture can inspect any intermediate state, including with reduced motion.
    if (manualBlend !== null) blend = manualBlend;
    if (!available) blend = 1;
    output.style.opacity = String(blend);
    root.style.setProperty('--hero-progress',String(Math.min(1,elapsed/total)));
    root.style.setProperty('--hero-blend',String(blend));
    root.style.setProperty('--hero-slider-progress',`${blend*100}%`);
    if (blendSlider) {
      blendSlider.value = String(blend*100);
      blendSlider.setAttribute('aria-valuetext',`${Math.round(blend*100)}% PhysInsert`);
    }
    setPhase(blend===0 ? 'paste' : blend===1 ? 'ours' : 'transition');
    result.setAttribute('aria-label', blend===1 ? 'Enlarge PhysInsert result' : 'View full PhysInsert result');
  }
  function seekBlend(value) {
    if (!ready || root.dataset.pasteAvailable !== 'true') return;
    cancelChapterAnimation();++requestId;loading=false;pendingAutomatic=false;
    panel.setAttribute('aria-busy','false');status.hidden=true;
    userPaused=true;
    manualBlend=Math.max(0,Math.min(1,value));
    // Invert smoothstep so Play continues from this exact mix instead of jumping.
    const time=0.5-Math.sin(Math.asin(1-2*manualBlend)/3);
    elapsed=manualBlend===0 ? 0 : timeline.paste+time*timeline.dissolve;
    drawTime();syncPlayback();
  }
  function syncPlayback() {
    const running = canPlay() && !loading;
    root.dataset.playback = running ? 'playing' : 'paused';
    toggle.setAttribute('aria-label',userPaused ? 'Play automatic comparison' : 'Pause automatic comparison');
    toggle.title = userPaused ? 'Play' : 'Pause';
    toggle.dataset.mode = userPaused ? 'play' : 'pause';
    toggle.querySelector('.hero-play-label').textContent = userPaused ? 'Play' : 'Pause';
    caption.setAttribute('aria-live',running ? 'off' : 'polite');
    live.setAttribute('aria-live',running ? 'off' : 'polite');
    if (chapterAnimation) {
      if (running) chapterAnimation.play(); else chapterAnimation.pause();
    }
    if (running && !chapterAnimation) {
      if (frame===null) frame=requestAnimationFrame(tick);
    } else stopClock();
  }
  function tick(time) {
    frame=null;
    if (!canPlay() || loading || chapterAnimation) { syncPlayback(); return; }
    if (lastTime!==null) elapsed+=time-lastTime;
    lastTime=time;
    drawTime();
    if (elapsed>=total) switchCase(order[(order.indexOf(active)+1)%order.length],true);
    else frame=requestAnimationFrame(tick);
  }
  function cancelChapterAnimation() {
    if (chapterAnimation) { const animation=chapterAnimation;chapterAnimation=null;animation.cancel(); }
    outgoing?.remove();
    outgoing=null;
  }
  function revealChapter(previous) {
    if (!previous || motion.matches || !previous.animate) return;
    outgoing=previous;
    outgoing.className='hero-chapter-outgoing';
    outgoing.setAttribute('aria-hidden','true');
    outgoing.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
    outgoing.dataset.ratio=previous.dataset.ratio;
    result.append(outgoing);
    resizeCanvas();
    const old=outgoing;
    const animation=old.animate([{opacity:1},{opacity:0}],{duration:timeline.change,easing:'ease-in-out'});
    chapterAnimation=animation;
    animation.finished.catch(()=>{}).finally(()=>{
      old.remove();
      if (chapterAnimation!==animation) return;
      chapterAnimation=null;outgoing=null;syncPlayback();
    });
  }
  async function switchCase(key, automatic=false) {
    if (!cases[key]) return;
    requestedKey=key;
    const request=++requestId;
    pendingAutomatic=automatic;
    if (!automatic) userPaused=motion.matches;
    loading=true;
    stopClock();
    cancelChapterAnimation();
    panel.setAttribute('aria-busy','true');
    status.textContent='Loading example…';status.hidden=false;
    syncPlayback();
    let prepared;
    try { prepared=await prepare(key); }
    catch (error) {
      if (request!==requestId) return;
      loading=false;pendingAutomatic=false;userPaused=true;
      status.textContent='Image unavailable. Select the example to retry.';
      panel.setAttribute('aria-busy','false');syncPlayback();return;
    }
    if (request!==requestId) return;
    const previous=ready && active!==key ? canvas.cloneNode(true) : null;
    if (previous) previous.dataset.ratio=String(cases[active].dimensions[0]/cases[active].dimensions[1]);
    const current=cases[key];
    active=key;ready=true;loading=false;pendingAutomatic=false;
    root.dataset.heroActive=key;
    panel.setAttribute('aria-labelledby',`hero-tab-${key}`);
    panel.setAttribute('aria-busy','false');
    status.hidden=true;
    tabs.forEach(tab=>{
      const selected=tab.dataset.heroCase===key;
      tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
    });
    ['reference','scene'].forEach(role=>{
      const button=root.querySelector(`#hero-${role}`);
      const path=`assets/hero-${key}-${role}.webp`;
      button.dataset.image=path;
      button.dataset.title=`${current.name} · ${role==='reference'?'Object reference':'Target scene'}`;
      const img=button.querySelector('img');img.src=path;img.alt=current[role];
    });
    const path=`assets/hero-${key}-ours.webp`;
    result.dataset.image=path;result.dataset.title=`${current.name} · PhysInsert`;
    output.src=path;[output.width,output.height]=current.dimensions;
    // CSS owns one fixed frame; resizeCanvas fits each complete image inside it.
    output.alt=`PhysInsert: ${current.ours}`;
    const illustration=prepared.illustration;
    root.dataset.pasteAvailable=String(Boolean(illustration));
    paste.hidden=!illustration;
    phaseButtons.find(b=>b.dataset.heroPhase==='paste').disabled=!illustration;
    note.hidden=!illustration;
    if (scrubber) scrubber.hidden=false;
    if (blendSlider) blendSlider.disabled=!illustration;
    if (illustration) {
      const {spec,sceneImage}=illustration;
      const [x,y,w]=spec.scene.crop;
      const [width,height]=current.dimensions;
      const sceneWidth=width/w;
      const sceneHeight=sceneWidth*sceneImage.naturalHeight/sceneImage.naturalWidth;
      scene.src=spec.scene.src;
      Object.assign(scene.style,{left:`${-x/w*100}%`,top:`${-y*sceneHeight/height*100}%`,width:`${sceneWidth/width*100}%`,height:`${sceneHeight/height*100}%`});
      object.src=spec.reference.src;
      const p=spec.placement;
      Object.assign(object.style,{left:`${p.x*100}%`,top:`${p.y*100}%`,width:`${p.width*100}%`,height:`${p.height*100}%`,maskImage:spec.reference.mask?`url("${asset(spec.reference.mask)}")`:'none',webkitMaskImage:spec.reference.mask?`url("${asset(spec.reference.mask)}")`:'none'});
    }
    root.querySelector('#hero-caption-index').textContent=`${current.number} / 03`;
    root.querySelector('#hero-case-title').textContent=current.title;
    root.querySelector('#hero-case-description').textContent=current.ours;
    manualBlend=null;
    elapsed=motion.matches ? timeline.paste+timeline.dissolve : 0;
    resizeCanvas();drawTime();
    controls.hidden=false;
    root.querySelector('#hero-result-label').hidden=true;
    revealChapter(previous);syncPlayback();
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>switchCase(tab.dataset.heroCase));
    tab.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabs.length-1;
      else return;
      event.preventDefault();tabs[next].focus();tabs[next].click();
    });
  });
  toggle.addEventListener('click',()=>{
    userPaused=!userPaused;
    if(!userPaused)manualBlend=null;
    if(userPaused&&loading&&pendingAutomatic&&ready){
      ++requestId;loading=false;pendingAutomatic=false;
      panel.setAttribute('aria-busy','false');status.hidden=true;
    }
    syncPlayback();
  });
  replay.addEventListener('click',()=>{
    if(!ready)return;
    cancelChapterAnimation();++requestId;loading=false;pendingAutomatic=false;panel.setAttribute('aria-busy','false');status.hidden=true;manualBlend=null;elapsed=0;userPaused=false;drawTime();syncPlayback();
  });
  phaseButtons.forEach(button=>button.addEventListener('click',()=>{
    cancelChapterAnimation();++requestId;loading=false;pendingAutomatic=false;panel.setAttribute('aria-busy','false');status.hidden=true;
    manualBlend=null;userPaused=true;elapsed=button.dataset.heroPhase==='paste'?0:timeline.paste+timeline.dissolve;
    drawTime();syncPlayback();
  }));
  if(blendSlider){
    blendSlider.addEventListener('pointerdown',()=>seekBlend(Number(output.style.opacity)));
    blendSlider.addEventListener('input',()=>seekBlend(Number(blendSlider.value)/100));
  }
  document.addEventListener('visibilitychange',syncPlayback);
  window.addEventListener('pagehide',()=>{suspended=true;syncPlayback();});
  window.addEventListener('pageshow',()=>{suspended=false;syncPlayback();});
  motion.addEventListener('change',()=>{
    if(motion.matches){userPaused=true;manualBlend=null;cancelChapterAnimation();elapsed=timeline.paste+timeline.dissolve;drawTime();}
    syncPlayback();
  });
  if(modal)new MutationObserver(syncPlayback).observe(modal,{attributes:true,attributeFilter:['open']});
  new IntersectionObserver(entries=>{
    inView=entries[0].isIntersecting&&entries[0].intersectionRatio>=.25;syncPlayback();
  },{threshold:[0,.25]}).observe(root);
  new ResizeObserver(resizeCanvas).observe(result);
  resizeCanvas();root.dataset.heroActive=active;
  fetch('assets/hero-paste-config.json?v=paste-v1').then(response=>{
    if(!response.ok)throw new Error('Illustration unavailable');return response.json();
  }).then(data=>{if(data.version===1&&data.cases)configuration=data.cases;}).catch(()=>{}).finally(()=>{
    switchCase(requestedKey).then(()=>Promise.allSettled(order.map(prepare)));
  });
})();
