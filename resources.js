'use strict';
(() => {
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const shortLabels={data:'HF Data',model:'HF Model'};
 const icons={arxiv:'<path d="m6 4 12 16M18 4 6 20M9 3l11 15"/>',code:'<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',data:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',model:'<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>'};
 const render=items=>{
  document.querySelector('#resources').innerHTML=items.map(item=>{const label=escape(item.label),displayLabel=escape(shortLabels[item.kind]||item.label),icon=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[item.kind]||icons.arxiv}</svg>`,body=`${icon}<span class="resource-label">${displayLabel}${item.url?'':'<small>Coming soon</small>'}</span>`;return item.url?`<a class="resource-button available" data-resource-kind="${escape(item.kind)}" href="${escape(item.url)}" aria-label="${label}" title="${label}" target="_blank" rel="noopener">${body}</a>`:`<button class="resource-button unavailable" data-resource-kind="${escape(item.kind)}" disabled title="${label} — Coming soon" aria-label="${label} — Coming soon">${body}</button>`}).join('');
 };
 fetch('resources.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(render).catch(()=>render([{kind:'arxiv',label:'arXiv',url:null},{kind:'code',label:'Code',url:null},{kind:'data',label:'Hugging Face · Data',url:null},{kind:'model',label:'Hugging Face · Model',url:null}]));
})();
