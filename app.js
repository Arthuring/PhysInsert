'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cases=[];
const groups=[
 {id:'physinsert-bench-results',className:'simulation',title:'PhysInsert-Bench',source:'Controlled evaluation',intro:'Results on our controlled, rendered benchmark: illumination, reflections, contact, and viewpoint adaptation.',note:'Generated results from the held-out PhysInsert-Bench evaluation set.',cases:["benchmark-50", "benchmark-9", "benchmark-74", "benchmark-38", "benchmark-108", "benchmark-151", "benchmark-30", "benchmark-283", "benchmark-353", "benchmark-6", "benchmark-68", "benchmark-384"]},
 {id:'real-backgrounds',className:'real',title:'Real-image compositions',source:'RealBokeh × Distinctions-646',intro:'New compositions using real background photographs and independently captured object references.',note:'Backgrounds: RealBokeh. Object references: Distinctions-646. These examples belong to the real-image user-study set. Before images use the same input canvas as the generated results.',cases:["B17-F17", "B05-F06", "B05-F20", "B07-F07", "B06-F01", "B19-F11", "B25-F16", "B08-F22", "B02-F06", "B03-F02", "B15-F11", "B16-F17"]},
 {id:'dreambooth',className:'dreambooth',title:'DreamBooth',source:'DreamBooth',intro:'Single-reference insertion with DreamBooth subjects, including changes in viewpoint and pose.',note:'DreamBooth subject references, shown with their original backgrounds and generated results.',cases:["dreambooth-19", "dreambooth-15", "dreambooth-37", "dreambooth-13", "dreambooth-20", "dreambooth-21", "dreambooth-24", "dreambooth-3", "dreambooth-10", "dreambooth-12", "dreambooth-22", "dreambooth-26"]},
 {id:'in-the-wild',className:'wild',title:'PhysInsert-Bench-Wild',source:'PhysInsert-Bench-Wild',intro:'Object insertion in real scenes: lighting adaptation, viewpoint changes, and object–scene interactions.',note:'Real-scene evaluation on PhysInsert-Bench-Wild. Each example is labeled by the effect it illustrates.',cases:["wild-toy", "wild-wall-art", "wild-armchair-front", "wild-dining-bench", "wild-chicken-low-view", "wild-bunny-racer", "wild-case-9", "wild-case-10", "wild-case-63", "wild-case-3", "wild-case-25", "wild-case-87"]}
];
groups.sort((a,b)=>['real-backgrounds','physinsert-bench-results','in-the-wild','dreambooth'].indexOf(a.id)-['real-backgrounds','physinsert-bench-results','in-the-wild','dreambooth'].indexOf(b.id));
const comparisons=[{"id": "B05-F06", "label": "Figurine · windowsill", "observation": "PhysInsert turns the figurine to match the upward view and cool shade of the windowsill. Nano Banana Pro keeps the warm, front-facing appearance of the reference."}, {"id": "B15-F06", "label": "Figurine · occlusion", "observation": "PhysInsert places the figurine on the tabletop behind the hat, with its lower part partly occluded. Nano Banana Pro places the smaller figurine on the hat brim."}, {"id": "B05-F20", "label": "Bonsai · viewpoint", "observation": "PhysInsert shows the underside of the pot and darkens the foliage within the window recess. Nano Banana Pro exposes the soil and trunk from a more frontal view."}, {"id": "B19-F11", "label": "Teddy bear · chair", "observation": "PhysInsert turns the teddy bear with the chair and places its arms behind the armrests. Nano Banana Pro keeps a more frontal pose, closer to the reference."}, {"id": "B25-F16", "label": "Cocktail · interior", "observation": "PhysInsert gives the glass a shallower rim and softer highlights within the indoor scene. Nano Banana Pro retains stronger red highlights and a more frontal view of the glass."}, {"id": "B08-F22", "label": "Bag · hanging", "observation": "PhysInsert bends the bag handles over the top rail and gives the bag the scene’s cool shading. Nano Banana Pro keeps the handles upright and adds a warm glow to the bag."}, {"id": "B09-F12", "label": "Teddy bear · car hood", "observation": "PhysInsert adapts the bear to the sloping hood with soft shading near its feet. Nano Banana Pro adds a broad, dark silhouette across the bright hood reflection.", "highlight": {"role": "nano_pro", "shape": "ellipse", "cx": 0.685, "cy": 0.485, "rx": 0.113, "ry": 0.085, "rotation": 0, "label": "Inconsistent cast shadow", "imageSize": [960, 720]}}, {"id": "B15-F11", "label": "Teddy bear · tabletop", "observation": "PhysInsert seats the bear on the tabletop behind the hat, with the brim occluding part of its body. Nano Banana Pro puts a much smaller bear on the hat brim."}, {"id": "B16-F18", "label": "Drink · reflection", "observation": "PhysInsert darkens the drink and its reflection within the dim interior. Nano Banana Pro preserves brighter, reference-like colors and a clearer mirrored copy on the tabletop."}, {"id": "wild-toy", "label": "Toy car · cool light", "observation": "PhysInsert gives the toy the cool blue shading of the rock scene. Nano Banana Pro retains warm highlights and casts a hard silhouette up the rock.", "highlight": {"role": "nano_pro", "shape": "ellipse", "cx": 0.248, "cy": 0.289, "rx": 0.151, "ry": 0.102, "rotation": 25, "label": "Inconsistent cast shadow", "imageSize": [960, 640]}}];
function slider(it,{eager=false,dialog=false,gallery=false}={}){
 const initial=gallery?12:it.id==='benchmark-50'?20:37;
 return `<div class="compare-stage" style="--split:${initial}%;--ratio:${it.width}/${it.height}" role="group" aria-label="Before and after: ${esc(it.label)}"><img class="result-image" src="${esc(it.ours)}" alt="PhysInsert result: ${esc(it.label)}" ${eager?'fetchpriority="high"':'loading="lazy"'} draggable="false"><div class="before-image-wrap"><img src="${esc(it.background)}" alt="${it.group==='real-backgrounds'?'Background on the inference canvas before insertion':'Original background before insertion'}" ${eager?'':'loading="lazy"'} draggable="false"></div><span class="image-label before">Before</span><span class="image-label after">PhysInsert</span><div class="slider-line"></div><div class="slider-handle" aria-hidden="true">↔</div><input class="range-slider" type="range" min="0" max="100" value="${initial}" aria-label="Compare before and after: ${esc(it.label)}" aria-valuetext="${initial} percent original background">${dialog?'':`<button class="zoom-case" data-case="${esc(it.id)}" aria-label="Enlarge ${esc(it.label)}">⤢</button>`}</div>`;
}
function reference(it,cls='reference-thumb'){return `<button class="${cls}" data-reference="${esc(it.id)}" aria-label="Enlarge object reference: ${esc(it.label)}"><img src="${esc(it.reference)}" alt="Object reference" loading="lazy"><span class="reference-label">Reference</span></button>`;}
function bindSliders(root){root.querySelectorAll('.range-slider').forEach(el=>el.addEventListener('input',()=>{el.closest('.compare-stage').style.setProperty('--split',el.value+'%');el.setAttribute('aria-valuetext',el.value+' percent original background');}));}
function prepareGroups(){
 groups.forEach(group=>{
  const sourceGroup=group.id==='physinsert-bench-results'?'physinsert-bench':group.id;
  const available=new Set(cases.filter(item=>item.group===sourceGroup&&item.gallery!==false).map(item=>item.id));
  if(!group.cases.length || new Set(group.cases).size!==group.cases.length || group.cases.some(id=>!available.has(id))) throw new Error(`Incomplete result selection: ${group.id}`);
  const count=document.querySelector(`.source-link[aria-controls="${group.id}"] small`);
  if(count)count.textContent=group.cases.length;
 });
}
function renderResultPanel(g){
 const panel=document.getElementById(g.id);
 if(panel.dataset.rendered==='true')return;
 const i=groups.indexOf(g);
 panel.innerHTML=`<div class="group-heading"><h3 id="${g.id}-title"><span class="group-number">0${i+1}</span>${g.title}</h3><p class="group-description"><strong>${esc(g.source)}</strong><br>${esc(g.intro)}</p></div><div class="group-grid">${g.cases.map(id=>{const it=cases.find(x=>x.id===id);return `<article class="result-card" data-source="${esc(it.group)}" data-result-id="${esc(it.id)}">${slider(it,{gallery:true})}<div class="card-caption">${reference(it)}<div><h4>${esc(it.label)}</h4><p>${esc(it.tags[0])}</p></div></div></article>`}).join('')}</div><p class="group-endnote">${esc(g.note)}</p>`;
 bindSliders(panel);
 panel.dataset.rendered='true';
}
function selectResultGroup(id,{updateHash=false,focus=false}={}){
 const group=groups.find(g=>g.id===id);
 if(!group || !cases.length)return;
 renderResultPanel(group);
 groups.forEach(g=>{
  const active=g.id===id;
  const tab=document.getElementById(`result-tab-${g.id}`);
  tab.setAttribute('aria-selected',String(active));
  tab.tabIndex=active?0:-1;
  document.getElementById(g.id).hidden=!active;
 });
 $('#result-tab-status').textContent=`${group.title}: ${group.cases.length} examples.`;
 if(updateHash)history.replaceState(null,'',`#${id}`);
 if(focus)document.getElementById(`result-tab-${id}`).focus({preventScroll:true});
}
function renderGroups(){
 $('#result-groups').innerHTML=groups.map(g=>`<section id="${g.id}" class="result-group ${g.className}" role="tabpanel" aria-labelledby="result-tab-${g.id}" tabindex="0" hidden></section>`).join('');
 const requested=location.hash.slice(1);
 const initial=groups.some(g=>g.id===requested)?requested:groups[0].id;
 selectResultGroup(initial);
 if(initial===requested)requestAnimationFrame(()=>document.querySelector('.source-nav').scrollIntoView({block:'start',behavior:'auto'}));
}
const resultTabList=document.querySelector('.source-nav');
resultTabList.addEventListener('click',event=>{
 const tab=event.target.closest('[role="tab"]');
 if(tab)selectResultGroup(tab.getAttribute('aria-controls'),{updateHash:true});
});
resultTabList.addEventListener('keydown',event=>{
 const tab=event.target.closest('[role="tab"]');
 if(!tab)return;
 const tabs=Array.from(resultTabList.querySelectorAll('[role="tab"]'));
 let index=tabs.indexOf(tab);
 if(event.key==='ArrowRight')index=(index+1)%tabs.length;
 else if(event.key==='ArrowLeft')index=(index-1+tabs.length)%tabs.length;
 else if(event.key==='Home')index=0;
 else if(event.key==='End')index=tabs.length-1;
 else return;
 event.preventDefault();
 selectResultGroup(tabs[index].getAttribute('aria-controls'),{updateHash:true,focus:true});
});
window.addEventListener('hashchange',()=>selectResultGroup(location.hash.slice(1)));
function shadowHighlight(selected){
 const h=selected.highlight;
 if(!h)return '';
 const [w,height]=h.imageSize;
 return `<svg class="comparison-shadow-highlight" viewBox="0 0 ${w} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><ellipse cx="${h.cx*w}" cy="${h.cy*height}" rx="${h.rx*w}" ry="${h.ry*height}" transform="rotate(${h.rotation||0} ${h.cx*w} ${h.cy*height})" vector-effect="non-scaling-stroke"/></svg>`;
}
function showComparison(id){
 const original=cases.find(x=>x.id===id), selected=comparisons.find(x=>x.id===id);
 const it={...original,nano_pro:selected.nanoAsset||original.nano_pro};
 $('#comparison-tabs').innerHTML=comparisons.map(c=>`<button class="comparison-tab" data-comparison="${c.id}" aria-pressed="${id===c.id}">${esc(c.label)}</button>`).join('');
 $('#comparison-content').innerHTML=`<div class="comparison-context"><h3>${esc(it.label)}</h3><span>${esc(it.dataset)} · ${esc(it.tags[0])}</span></div><div class="comparison-layout" style="--comparison-ratio:${it.width}/${it.height}"><div class="comparison-input"><button class="comparison-background" data-image="${esc(it.background)}" data-title="Background — ${esc(it.label)}" aria-label="Enlarge background"><img src="${esc(it.background)}" alt="Original background"><span class="reference-label">Background</span></button>${reference(it)}</div>${[['nano_pro','Nano Banana Pro'],['ours','PhysInsert (Ours)']].map(([role,label])=>`<div class="comparison-panel ${role}"><div class="comparison-panel-label">${label}</div><button class="image-button" data-image="${esc(it[role])}" data-title="${label} — ${esc(it.label)}" aria-label="Enlarge ${label} result"><img src="${esc(it[role])}" alt="${label}: ${esc(it.label)}" loading="eager">${role==='nano_pro'?shadowHighlight(selected):''}</button></div>`).join('')}</div>${selected.observation?`<p class="comparison-observation">${esc(selected.observation)}</p>`:''}`;
}

function openDialog(title,content){$('#viewer-title').textContent=title;$('#viewer-content').innerHTML=content;document.body.classList.add('dialog-open');$('#viewer-dialog').showModal();bindSliders($('#viewer-content'));}
function openCase(id){const it=cases.find(x=>x.id===id);openDialog(it.label,`<div class="dialog-case"><div class="dialog-reference"><figure class="dialog-reference-figure"><img src="${esc(it.reference)}" alt="Input object reference"><figcaption class="reference-label">Reference</figcaption></figure><p>${esc(it.dataset)}</p></div>${slider(it,{dialog:true,eager:true})}</div><p class="dialog-note">Drag the slider, or use the arrow keys, to compare the background and PhysInsert result.</p>`);}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.case)openCase(b.dataset.case);if(b.dataset.reference){const it=cases.find(x=>x.id===b.dataset.reference);openDialog('Object reference — '+it.label,`<img class="full-figure" src="${esc(it.reference)}" alt="Input object reference">`);}if(b.dataset.comparison)showComparison(b.dataset.comparison);if(b.dataset.figure||b.dataset.image)openDialog(b.dataset.title,b.dataset.crop==='pipeline'?`<div class="pipeline-crop"><img src="${esc(b.dataset.figure)}" alt="${esc(b.dataset.title)}"></div>`:`<img class="full-figure" src="${esc(b.dataset.figure||b.dataset.image)}" alt="${esc(b.dataset.title)}">`);});
$('.dialog-close').addEventListener('click',()=>$('#viewer-dialog').close());
$('#viewer-dialog').addEventListener('close',()=>document.body.classList.remove('dialog-open'));
$('#viewer-dialog').addEventListener('click',e=>{if(e.target===$('#viewer-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#viewer-dialog').close();}});
$('.menu-toggle').addEventListener('click',()=>{const open=$('.menu-toggle').getAttribute('aria-expanded')!=='true';$('.menu-toggle').setAttribute('aria-expanded',String(open));$('#navigation').classList.toggle('open',open);});
$('#navigation').addEventListener('click',e=>{if(e.target.closest('a')){$('.menu-toggle').setAttribute('aria-expanded','false');$('#navigation').classList.remove('open');}});
fetch('cases.json?v=windowsill-v1').then(r=>{if(!r.ok)throw new Error('Results unavailable');return r.json()}).then(data=>{cases=data;prepareGroups();renderGroups();showComparison(comparisons[0].id);}).catch(()=>{$('#result-groups').innerHTML='<p class="load-error">The examples could not load. Please refresh, or view the paper above.</p>';});
