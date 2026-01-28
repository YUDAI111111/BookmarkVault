
// === Focus helpers (guarded) ===
window.getCurrentSection = window.getCurrentSection || function(){
  try{
    if (typeof ui !== 'undefined') {
      if (ui.setup && ui.setup.offsetParent !== null) return ui.setup;
      if (ui.locked && ui.locked.offsetParent !== null) return ui.locked;
      if (ui.list && ui.list.offsetParent !== null) return ui.list;
      if (ui.settings && ui.settings.offsetParent !== null) return ui.settings;
    }
  }catch(_){}
  const secs = document.querySelectorAll('section, .section, [role="region"]');
  for (const s of secs) if (s.offsetParent !== null) return s;
  return null;
};
window.focusAfterShow = window.focusAfterShow || function(section){
  try{
    section = section || (window.getCurrentSection ? window.getCurrentSection() : null);
    if(!section) return;
    const el = section.querySelector('input[type="password"], input[autofocus], input[type="text"], input, textarea, button, [href]');
    if (el) { try{ el.focus(); if (el.select) el.select(); }catch(_){ } }
  }catch(_){}
};


// Guarded helpers to avoid duplicate declarations
window.getCurrentSection = window.getCurrentSection || function(){
  try{
    if (typeof ui !== 'undefined') {
      if (ui.setup && ui.setup.offsetParent !== null) return ui.setup;
      if (ui.locked && ui.locked.offsetParent !== null) return ui.locked;
      if (ui.list && ui.list.offsetParent !== null) return ui.list;
      if (ui.settings && ui.settings.offsetParent !== null) return ui.settings;
    }
  }catch(_){}
  const secs = document.querySelectorAll('section, .section, [role="region"]');
  for (const s of secs) if (s.offsetParent !== null) return s;
  return null;
};

window.focusAfterShow = window.focusAfterShow || function(section){
  try{
    section = section || (window.getCurrentSection ? window.getCurrentSection() : null);
    if(!section) return;
    const el = section.querySelector('input[type="password"], input[autofocus], input[type="text"], input, textarea, button, [href]');
    if (el) { try{ el.focus(); if (el.select) el.select(); }catch(_){ } }
  }catch(_){}
};






// === Robust focus helper ===
function focusWhenVisible(el, attempts = 60) {
  if (!el) return;
  let n = 0;
  const tryFocus = () => {
    if (!el || n >= attempts) return;
    const visible = el.offsetParent !== null && !el.disabled;
    if (visible) {
      try {
        el.focus({ preventScroll: true });
        if (document.activeElement === el) return;
      } catch (e) {}
    }
    n++;
    requestAnimationFrame(tryFocus);
  };
  requestAnimationFrame(tryFocus);
}
// ====== ストレージキー・定数 ======
const LOCAL = chrome.storage.local;
const K_PIN_SALT="pinSaltB64", K_PIN_HASH="pinHashB64";
const K_ITEMS="vaultItems"; // [{id,type:'link'|'folder',parentId:null|id,order:number,ivB64,ctB64,createdAt}]
const K_SETTINGS="vaultSettings"; // { lineHeight, autoCloseSec, theme, showSearch }

// ====== DOM ======
const $=(s)=>document.querySelector(s);
const ui={
  setup:$('#setup'), locked:$('#locked'), list:$('#list'), settings:$('#settings'), import:$('#import'),
  setupPin:$('#setup-pin'), setupPin2:$('#setup-pin2'), setupSave:$('#setup-save'), setupMsg:$('#setup-msg'),
  pin:$('#pin'), lockMsg:$('#lock-msg'),
  addCurrent:$('#add-current'), newFolder:$('#new-folder'), importChrome:$('#import-chrome'),
  openSettings:$('#open-settings'), relock:$('#relock'),
  searchWrap:$('#search-wrap'), search:$('#search'),
  crumbs:$('#crumbs'), listContainer:$('#listContainer'), empty:$('#empty'),
  backToList:$('#back-to-list'), backToListFromImport:$('#back-to-list-from-import'),
  chromeTree:$('#chrome-tree'),
  lineHeight:$('#lineHeight'), autoClose:$('#autoClose'), settingsPreview:$('#settings-preview'), theme:$('#theme'), showSearch:$('#showSearch')
};

// ====== Utils ======
const enc=new TextEncoder(), dec=new TextDecoder();
const b64encode=(ab)=>btoa(String.fromCharCode(...new Uint8Array(ab)));
const b64decode=(b64)=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer;
const bufEq=(a,b)=>{if(a.byteLength!==b.byteLength) return false;const x=new Uint8Array(a),y=new Uint8Array(b);let d=0;for(let i=0;i<x.length;i++)d|=(x[i]^y[i]);return d===0;};
const firstLetter=(str='',fallback='•')=>{const s=(str||'').trim(); if(!s) return fallback; const ch=s[0].toUpperCase(); return /[A-Z0-9一-龠ぁ-んァ-ヶ]/.test(ch)?ch:fallback;};
const now=()=>Date.now();

// ====== Crypto ======
async function pbkdf2Bits(pin,saltB64,iterations=120000){
  const mat=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
  const salt=b64decode(saltB64);
  return crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},mat,256);
}
async function importAesKeyFromBits(bits){return crypto.subtle.importKey('raw',bits,{name:'AES-GCM'},true,['encrypt','decrypt']);}
async function aesEncryptJson(aesKey,obj){const iv=crypto.getRandomValues(new Uint8Array(12));const pt=enc.encode(JSON.stringify(obj));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},aesKey,pt);return{ivB64:b64encode(iv.buffer),ctB64:b64encode(ct)};}
async function aesDecryptJson(aesKey,ivB64,ctB64){const iv=new Uint8Array(b64decode(ivB64));const ct=b64decode(ctB64);const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv},aesKey,ct);return JSON.parse(dec.decode(pt));}

// ====== 背景通信（フェイルセーフ） ======
function safeSend(msg, fallback=null){ return chrome.runtime.sendMessage(msg).catch(()=>fallback); }
async function bgGetUnlocked(){ const r = await safeSend({type:'GET_UNLOCKED'}, {unlocked:false}); return !!(r && r.unlocked); }
async function bgSetUnlocked(v){ await safeSend({type:'SET_UNLOCKED', value:!!v}); }
async function bgSetSessionKey(b64){ await safeSend({type:'SET_SESSION_KEY', keyB64:b64}); }
async function bgGetSessionKey(){ const r = await safeSend({type:'GET_SESSION_KEY'}, {keyB64:null}); return (r && r.keyB64) || null; }
async function openAndRelock(url){
  const ok = await safeSend({type:'OPEN_AND_RELOCK', url}, null);
  if (ok === null) { try { await chrome.tabs.create({ url }); } catch {} try { window.close(); } catch {} }
}
try{ chrome.runtime.connect({name:'popup'});}catch{}
window.addEventListener('pagehide',()=>{ safeSend({type:'POPUP_CLOSED'}); });

// ====== 表示制御 ======
let currentFolderId = null; // ルート＝null
function focusPinSoon(){ setTimeout(()=>(ui.pin && ui.pin.focus) && ui.pin.focus({preventScroll:true}),0); }
async function hasPin(){ const s=await LOCAL.get([K_PIN_SALT,K_PIN_HASH]); return !!(s[K_PIN_SALT]&&s[K_PIN_HASH]); }
async function showOnly(section){
/* FOCUS_AFTER_SHOW_PATCH */

/* FOCUS_SETUP_PATCH */
 for(const el of [ui.setup,ui.locked,ui.list,ui.settings,ui.import]) el.hidden=(el!==section); }



async function boot(){
  try{
    const s0 = await LOCAL.get(K_SETTINGS);
    applyTheme(((s0[K_SETTINGS] && s0[K_SETTINGS].theme)) || 'light');
  }catch(_){}
  try{
    if (!(await hasPin())){
      await showOnly(ui.setup);
      focusAfterShow(window.getCurrentSection ? window.getCurrentSection() : null);
      return;
    }
    await showOnly(ui.locked);
    focusPinSoon();
  }catch(_){}
  try{ observeImportArea(); }catch(_){}
  try{ tagImportRows(); }catch(_){}
  try{ await applySettings(); }catch(_){}
  startAutoCloseTimer();
}
// ====== 初期設定 ======
(ui.setupSave && ui.setupSave.addEventListener) && ui.setupSave.addEventListener('click',savePin);
(ui.setupPin && ui.setupPin.addEventListener) && ui.setupPin.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); (ui.setupPin2 && ui.setupPin2.focus) && ui.setupPin2.focus({preventScroll:true}); }});
(ui.setupPin2 && ui.setupPin2.addEventListener) && ui.setupPin2.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); savePin(); }});
async function savePin(){
  ui.setupMsg.textContent='';
  const p1=ui.setupPin.value.trim(), p2=ui.setupPin2.value.trim();
  if(!p1||p1.length<4){ ui.setupMsg.textContent='4桁以上で設定してください。'; return; }
  if(p1!==p2){ ui.setupMsg.textContent='PIN が一致しません。'; return; }
  const salt=crypto.getRandomValues(new Uint8Array(16)).buffer, saltB64=b64encode(salt);
  const bits=await pbkdf2Bits(p1,saltB64), hashB64=b64encode(bits);
  await LOCAL.set({[K_PIN_SALT]:saltB64,[K_PIN_HASH]:hashB64,[K_ITEMS]:[],[K_SETTINGS]:{lineHeight:1.4,autoCloseSec:30,theme:'light',showSearch:false}});
  ui.setupPin.value=ui.setupPin2.value='';
  await showOnly(ui.locked); focusPinSoon();
}

// ====== ロック解除 ======
(ui.pin && ui.pin.addEventListener) && ui.pin.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); unlock(); }});
async function unlock(){
  ui.lockMsg.textContent='';
  const pin=ui.pin.value.trim(); if(!pin) return;
  const s=await LOCAL.get([K_PIN_SALT,K_PIN_HASH]); const trial=await pbkdf2Bits(pin,s[K_PIN_SALT]);
  if(!bufEq(trial,b64decode(s[K_PIN_HASH]))){ ui.lockMsg.textContent='PIN が違います。'; return; }
  const aesKey=await importAesKeyFromBits(trial); const raw=await crypto.subtle.exportKey('raw',aesKey);
  await bgSetSessionKey(b64encode(raw)); await bgSetUnlocked(true); ui.pin.value='';
  await showOnly(ui.list); await normalizeAndRender();
  try{ observeImportArea(); }catch(_){}
  try{ tagImportRows(); }catch(_){}
  /* URL_HARDENER_AFTER_RENDER */
  try{ hardenUrlTruncation(); }catch(_){} await applySettings();
}

// ====== 設定 ======
(ui.openSettings && ui.openSettings.addEventListener) && ui.openSettings.addEventListener('click',async()=>{ await showOnly(ui.settings); await applySettings(); });
(ui.backToList && ui.backToList.addEventListener) && ui.backToList.addEventListener('click',async()=>{ await showOnly(ui.list); await renderList(); await applySettings(); });
(ui.relock && ui.relock.addEventListener) && ui.relock.addEventListener('click',async()=>{ await bgSetUnlocked(false); await bgSetSessionKey(null); await showOnly(ui.locked); focusPinSoon(); });

function applyTheme(theme){ document.body.classList.toggle('theme-light',theme==='light'); document.body.classList.toggle('theme-dark',theme==='dark'); }
async function applySettings(){
  const s=await LOCAL.get(K_SETTINGS);
  const {lineHeight=1.4,autoCloseSec=30,theme='light',showSearch=false}=s[K_SETTINGS]||{};
  document.body.style.lineHeight=lineHeight;
  ui.lineHeight.value=lineHeight; ui.autoClose.value=autoCloseSec; ui.theme.value=theme; ui.showSearch.checked=showSearch;
  applyTheme(theme);
  ui.searchWrap.hidden=!showSearch;
  ui.settingsPreview.style.lineHeight=lineHeight;
  ui.settingsPreview.textContent=`行間=${lineHeight}, 自動閉じ=${autoCloseSec}秒`;
}
(ui.theme && ui.theme.addEventListener) && ui.theme.addEventListener('change',async()=>{ const st=await LOCAL.get(K_SETTINGS); const theme=ui.theme.value; await LOCAL.set({[K_SETTINGS]:{...st[K_SETTINGS],theme}}); applyTheme(theme); });
(ui.lineHeight && ui.lineHeight.addEventListener) && ui.lineHeight.addEventListener('input',async()=>{ const v=parseFloat(ui.lineHeight.value); const st=await LOCAL.get(K_SETTINGS); await LOCAL.set({[K_SETTINGS]:{...st[K_SETTINGS],lineHeight:v}}); document.body.style.lineHeight=v; ui.settingsPreview.style.lineHeight=v; });
(ui.autoClose && ui.autoClose.addEventListener) && ui.autoClose.addEventListener('input',async()=>{ const v=parseInt(ui.autoClose.value,10); const st=await LOCAL.get(K_SETTINGS); await LOCAL.set({[K_SETTINGS]:{...st[K_SETTINGS],autoCloseSec:v}}); resetAutoCloseTimer(); });
(ui.showSearch && ui.showSearch.addEventListener) && ui.showSearch.addEventListener('change',async()=>{ const st=await LOCAL.get(K_SETTINGS); const show=ui.showSearch.checked; await LOCAL.set({[K_SETTINGS]:{...st[K_SETTINGS],showSearch:show}}); ui.searchWrap.hidden=!show; });

// ====== AES鍵 ======
async function getAesKeyFromSession(){ const b64=await bgGetSessionKey(); if(!b64) throw new Error('鍵がありません（ロック中）'); const raw=b64decode(b64); return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']); }

// ====== データ: 読み書き・マイグレーション ======
async function loadItems(){ const s=await LOCAL.get(K_ITEMS); return s[K_ITEMS]||[]; }
async function saveItems(items){ await LOCAL.set({[K_ITEMS]:items}); }

async function normalizeAndRender(){
  let items=await loadItems(); let changed=false;
  items=items.map((it,idx)=>{
    if(!('type' in it)){ changed=true; return {...it, type:'link', parentId:null, order:idx}; }
    if(!('parentId' in it)){ changed=true; it.parentId=null; }
    if(typeof it.order!=='number'){ changed=true; it.order=idx; }
    return it;
  });
  if(changed) await saveItems(items);
  await renderList();
}

async function getAes(){ return getAesKeyFromSession(); }
async function addLink(title,url,parentId=currentFolderId){
  const aes=await getAes(); const {ivB64,ctB64}=await aesEncryptJson(aes,{title,url});
  const items=await loadItems(); const order = nextOrder(items,parentId);
  items.push({id:crypto.randomUUID(), type:'link', parentId, order, ivB64, ctB64, createdAt:now()});
  await saveItems(items);
}
async function addFolder(title,parentId=currentFolderId){
  const aes=await getAes(); const {ivB64,ctB64}=await aesEncryptJson(aes,{title});
  const items=await loadItems(); const order = nextOrder(items,parentId);
  items.push({id:crypto.randomUUID(), type:'folder', parentId, order, ivB64, ctB64, createdAt:now()});
  await saveItems(items);
}
function nextOrder(items,parentId){ const same=items.filter(i=>i.parentId===parentId); return same.length?Math.max(...same.map(i=>i.order||0))+1:0; }

async function updateItemData(id, mutator){
  const aes=await getAes(); const items=await loadItems();
  const idx=items.findIndex(x=>x.id===id); if(idx<0) return;
  const data=await aesDecryptJson(aes, items[idx].ivB64, items[idx].ctB64);
  const newData=await mutator({...data});
  const enc=await aesEncryptJson(aes,newData);
  items[idx]={...items[idx],...enc}; await saveItems(items);
}
async function renameItem(id,newTitle){ await updateItemData(id,(d)=>{ d.title=newTitle; return d; }); }
async function setItemStyle(id, style){ await updateItemData(id,(d)=>{ d.style=style; return d; }); }
async function getItemData(aes,it){ return aesDecryptJson(aes,it.ivB64,it.ctB64); }
async function removeItem(id){
  let items=await loadItems();
  const allIdsToDelete=new Set([id]);
  let changed=true;
  while(changed){
    changed=false;
    for(const it of items){ if(it.parentId && allIdsToDelete.has(it.parentId) && !allIdsToDelete.has(it.id)){ allIdsToDelete.add(it.id); changed=true; } 
  

  focusAfterShow(window.getCurrentSection ? window.getCurrentSection() : null);
// after showing target section, focus appropriate input robustly
setTimeout(() => {
  try{
    const sec = (window.getCurrentSection ? window.getCurrentSection() : null);
    if (sec === ui.setup && ui.setupPin) {
      focusWhenVisible(ui.setupPin);
    } else if (sec === ui.locked && ui.pin) {
      focusWhenVisible(ui.pin);
    }
  }catch(_){ }
}, 0);
}
  }
  items=items.filter(x=>!allIdsToDelete.has(x.id));
  await saveItems(items);
}
async function moveItem(id, newParentId, newOrder=null){
  const items=await loadItems(); const idx=items.findIndex(x=>x.id===id); if(idx<0) return;
  items[idx].parentId = newParentId;
  if(newOrder===null){ items[idx].order = nextOrder(items,newParentId); }
  else { items[idx].order = newOrder; }
  await saveItems(items);
}
async function reorderWithinParent(parentId, orderedIds){
  const items=await loadItems(); let n=0;
  for(const id of orderedIds){ const it=items.find(x=>x.id===id && x.parentId===parentId); if(it){ it.order=n++; } }
  await saveItems(items);
}

// ====== UI：パンくず ======
function renderCrumbs(breadcrumb){
  ui.crumbs.innerHTML='';
  const addCrumb=(label,id)=>{ const span=document.createElement('span'); span.className='crumb'; span.textContent=label; try{ if(this && this.classList && this.classList.contains('url')) this.title = label; }catch(_){} span.addEventListener('click',async()=>{ currentFolderId=id; await renderList(); }); ui.crumbs.appendChild(span); };
  addCrumb('すべて',null);
  if(!breadcrumb.length) return;
  ui.crumbs.appendChild(Object.assign(document.createElement('span'),{className:'sep',textContent:'>'}));
  breadcrumb.forEach((c,i)=>{
    addCrumb(c.title, c.id);
    if(i<breadcrumb.length-1){ ui.crumbs.appendChild(Object.assign(document.createElement('span'),{className:'sep',textContent:'>'})); }
  });
}

async function buildBreadcrumb(){
  const items=await loadItems();
  const aes=await getAes();
  const path=[];
  let cur=currentFolderId;
  const byId=new Map(items.map(i=>[i.id,i]));
  while(cur){
    const it=byId.get(cur); if(!it) break;
    const d=await getItemData(aes,it);
    path.unshift({id:it.id, title:d.title||'フォルダ'});
    cur=it.parentId||null;
  }
  return path;
}

// ====== UI：行（Vault） ======
function itemRowBase(it, data){
  const row=document.createElement('div'); row.className='item'; row.dataset.id=it.id; row.draggable=true;
  if(it.type==='folder') row.classList.add('folder');

  const icon=document.createElement('div'); icon.className='icon';
  icon.textContent = it.type==='folder' ? '📁' : firstLetter(data.title || (data.url?new URL(data.url).hostname:'' ));
  row.appendChild(icon);

  const name=document.createElement('div'); name.className='name'; name.textContent=data.title|| (it.type==='folder'?'フォルダ':'');
  row.appendChild(name);

  const kebab=document.createElement('button'); kebab.className='kebab'; kebab.title='メニュー';
  kebab.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
  row.appendChild(kebab);

  if(data.style){ if(data.style.bg) row.style.background = data.style.bg; if(data.style.fg) row.style.color = data.style.fg; }

  return {row, name, kebab};
}

function isEditing(){ return !!document.querySelector('.name[contenteditable="true"]'); }

function bindRowOpen(row, it, data){
  if(it.type==='folder'){
    row.addEventListener('click', async (e)=>{ if(isEditing()) return; e.preventDefault(); currentFolderId=it.id; await renderList(); });
  } else {
    row.addEventListener('click', async (e)=>{ if(isEditing()) return; e.preventDefault(); await openAndRelock(data.url); window.close(); });
    row.addEventListener('auxclick', async (e)=>{ if(isEditing()) return; if(e.button===1){ e.preventDefault(); await openAndRelock(data.url); window.close(); }});
  }
}

function startInlineEdit(nameEl, id){
  if(nameEl.isContentEditable) return;
  nameEl.setAttribute('contenteditable','true'); nameEl.focus();
  const sel=window.getSelection(), range=document.createRange();
  range.selectNodeContents(nameEl); sel.removeAllRanges(); sel.addRange(range);
  const commit=async()=>{ nameEl.removeAttribute('contenteditable'); const t=nameEl.textContent.trim(); await renameItem(id,t); };
  nameEl.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key==='Escape'){ e.preventDefault(); nameEl.blur(); }});
  nameEl.addEventListener('blur',commit,{once:true});
  ['mousedown','click'].forEach(ev=> nameEl.addEventListener(ev,(e)=>{ if(nameEl.isContentEditable) e.stopPropagation(); }));
}

// --- メニュー（位置自動調整＋シートfallback＋Esc閉じ）
let openedMenu=null, onDocKeydown=null;
function closeMenu(){ if(openedMenu){ openedMenu.remove(); openedMenu=null; } if(onDocKeydown){ document.removeEventListener('keydown', onDocKeydown); onDocKeydown=null; } }
function openMenu(anchorBtn, builder){
  closeMenu();
  const menu=document.createElement('div'); menu.className='menu'; menu.style.visibility='hidden';
  builder(menu); document.body.appendChild(menu);

  const margin=8, rect=anchorBtn.getBoundingClientRect(), vw=window.innerWidth, vh=window.innerHeight;
  const mW=menu.offsetWidth||200, mH=menu.offsetHeight||140;
  let top=rect.bottom+6, left=Math.min(Math.max(rect.right - mW, margin), vw - mW - margin);
  if(top + mH > vh - margin){ top = rect.top - mH - 6; }
  const cannotFit = (top < margin) || (mH > vh - 2*margin);
  if(cannotFit){
    menu.classList.add('menu-sheet');
    const closeRow=document.createElement('div'); closeRow.className='close-row';
    const closeBtn=document.createElement('button'); closeBtn.textContent='閉じる'; closeBtn.addEventListener('click', closeMenu);
    closeRow.appendChild(closeBtn); menu.appendChild(closeRow);
  }else{
    top = Math.min(Math.max(top, margin), vh - mH - margin);
    left = Math.min(Math.max(left, margin), vw - mW - margin);
    menu.style.top=`${top}px`; menu.style.left=`${left}px`;
  }
  menu.style.visibility='visible'; openedMenu=menu;

  const onDocClick=(e)=>{ if(!openedMenu) return; if(!openedMenu.contains(e.target)){ closeMenu(); document.removeEventListener('click', onDocClick, true); } };
  setTimeout(()=>document.addEventListener('click', onDocClick, true),0);
  onDocKeydown=(e)=>{ if(e.key==='Escape') closeMenu(); };
  document.addEventListener('keydown', onDocKeydown);
  anchorBtn.closest(('.item') && ('.item').scrollIntoView) && ('.item').scrollIntoView({block:'nearest'});
}

// 行を構築
function makeRow(it, data){
  const {row, name, kebab}=itemRowBase(it, data);
  bindRowOpen(row, it, data);

  row.addEventListener('contextmenu',(e)=>{ e.preventDefault(); e.stopPropagation(); startInlineEdit(name, it.id); });

  kebab.addEventListener('click',(e)=>{
    e.stopPropagation();
    openMenu(kebab, (menu)=>{
      const b1=document.createElement('button'); b1.textContent='名前を編集'; b1.addEventListener('click',()=>{ startInlineEdit(name, it.id); closeMenu(); });
      const b2=document.createElement('button'); b2.textContent='削除'; b2.addEventListener('click', async()=>{ try { await removeItem(it.id); } catch(e) { console.warn("[BV] removeItem failed", e); } await renderList(); closeMenu(); });
      menu.appendChild(b1); menu.appendChild(b2);

      const title=document.createElement('div'); title.textContent='色を変更'; title.className='title'; menu.appendChild(title);
      const row1=document.createElement('div'); row1.className='row';
      const fgLabel=document.createElement('span'); fgLabel.textContent='文字'; const fg=document.createElement('input'); fg.type='color'; fg.value=(( data.style && data.style.fg ))||'#000000';
      row1.appendChild(fgLabel); row1.appendChild(fg);
      const row2=document.createElement('div'); row2.className='row';
      const bgLabel=document.createElement('span'); bgLabel.textContent='背景'; const bg=document.createElement('input'); bg.type='color'; bg.value=(( data.style && data.style.bg ))||'#ffffff';
      row2.appendChild(bgLabel); row2.appendChild(bg);
      const row3=document.createElement('div'); row3.className='row';
      const apply=document.createElement('button'); apply.textContent='適用';
      const clear=document.createElement('button'); clear.textContent='クリア';
      row3.appendChild(apply); row3.appendChild(clear);
      menu.appendChild(row1); menu.appendChild(row2); menu.appendChild(row3);

      apply.addEventListener('click', async()=>{ await setItemStyle(it.id, {fg:fg.value,bg:bg.value}); await renderList(); closeMenu(); });
      clear.addEventListener('click', async()=>{ await setItemStyle(it.id, {fg:null,bg:null}); await renderList(); closeMenu(); });
    });
  });

  // D&D：上下どちらにも挿入＋インジケータ
  row.addEventListener('dragstart',(e)=>{ e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed='move'; });
  row.addEventListener('dragover',(e)=>{
    e.preventDefault();
    if(it.type==='folder'){ row.classList.add('drag-over'); return; } // フォルダは「中へ移動」に専念
    const r=row.getBoundingClientRect(); const before=(e.clientY - r.top) < (r.height/2);
    row.classList.toggle('drop-before', before);
    row.classList.toggle('drop-after', !before);
  });
  row.addEventListener('dragleave',()=>{
    row.classList.remove('drag-over','drop-before','drop-after');
  });
  row.addEventListener('drop', async (e)=>{
    e.preventDefault();
    const srcId=e.dataTransfer.getData('text/plain'); if(!srcId || srcId===it.id) return;
    row.classList.remove('drag-over','drop-before','drop-after');
    const items=await loadItems(); const src=items.find(x=>x.id===srcId); if(!src) return;

    // フォルダにドロップ：そのフォルダに移動
    if(it.type==='folder'){
      await moveItem(srcId, it.id, null);
      await renderList(); return;
    }

    // リオーダー：上/下の半分で before/after を決定
    const r=row.getBoundingClientRect(); const before=(e.clientY - r.top) < (r.height/2);
    const parentId = it.parentId;
    if(src.parentId!==parentId){ await moveItem(srcId, parentId, null); }

    const cur=await loadItems();
    const siblings=cur.filter(x=>x.parentId===parentId && x.id!==srcId).sort((a,b)=>a.order-b.order);
    const targetIndex = siblings.findIndex(s=>s.id===it.id);
    const insertIndex = before ? targetIndex : targetIndex+1;

    const orderedIds = [
      ...siblings.slice(0, insertIndex).map(s=>s.id),
      srcId,
      ...siblings.slice(insertIndex).map(s=>s.id),
    ];
    await reorderWithinParent(parentId, orderedIds);
    await renderList();
  });

  return row;
}

async function renderList(){
  const aes=await getAes();
  const items=await loadItems();
  const bc=await buildBreadcrumb(); renderCrumbs(bc);
  const q=(ui.search.value||'').trim().toLowerCase();

  const visible=items.filter(i=>i.parentId===currentFolderId).sort((a,b)=>a.order-b.order);

  ui.listContainer.innerHTML=''; let count=0;
  for(const it of visible){
    try{
      const data=await getItemData(aes,it);
      const title=data.title||''; const url=data.url||'';
      if(q && !(title.toLowerCase().includes(q)||url.toLowerCase().includes(q))) continue;
      const row=makeRow(it,data);
      ui.listContainer.appendChild(row); count++;
    }catch{}
  }
  ui.empty.hidden = count>0;
}

// ====== ヘッダー操作 ======
(ui.addCurrent && ui.addCurrent.addEventListener) && ui.addCurrent.addEventListener('click',async()=>{
  const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  if(!tab||!tab.url) return alert('URL取得不可');
  if(/^(chrome|chrome-extension):\/\//i.test(tab.url)) return alert('保存不可のURLです');
  await addLink(tab.title||tab.url, tab.url, currentFolderId);
  await renderList();
});
(ui.newFolder && ui.newFolder.addEventListener) && ui.newFolder.addEventListener('click',async()=>{ await addFolder('新しいフォルダ', currentFolderId); await renderList(); });
(ui.search && ui.search.addEventListener) && ui.search.addEventListener('input',renderList);

// ====== インポート画面（見た目を整理したツリー） ======
(ui.importChrome && ui.importChrome.addEventListener) && ui.importChrome.addEventListener('click',async()=>{
  await showOnly(ui.import);
  ui.chromeTree.innerHTML='';
  const tree=await chrome.bookmarks.getTree();

  function collectUrls(nodes,out=[]){ for(const n of nodes){ if(n.url) out.push({title:n.title||n.url,url:n.url}); if(n.children) collectUrls(n.children,out);} return out; }

  function mkIcon(ch){ const d=document.createElement('div'); d.className='icon'; d.textContent=ch; try{ if(this && this.classList && this.classList.contains('url')) this.title = ch; }catch(_){} return d; }
  function mkMiniBtn(title, svgPathD){
    const b=document.createElement('button'); b.className='icon-mini'; b.title=title; b.setAttribute('aria-label',title);
    b.innerHTML=`<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="${svgPathD}"/></svg>`;
    return b;
  }

  function renderNodes(nodes, parent){
    for(const n of nodes){
      if(n.url){
        const row=document.createElement('div'); row.className='leaf-row';
        const left=document.createElement('div'); left.className='row';
        const icon=mkIcon(firstLetter(n.title || new URL(n.url).hostname));
        const a = document.createElement('a');
      try{a.classList.add('url');}catch(_ ){} /* URL_ANCHOR */
      try{a.classList.add('url');}catch(_){/*ignore*/} a.textContent=n.title||n.url; a.href=n.url;
      try{ a.title = n.url; }catch(_){} a.target='_blank';
        left.appendChild(icon); left.appendChild(a);
        const add=mkMiniBtn('追加','M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z');
        add.addEventListener('click', async()=>{ await addLink(n.title||n.url,n.url,currentFolderId); add.disabled=true; add.title='追加済み'; });
        row.appendChild(left); row.appendChild(add);
        parent.appendChild(row);
      } else {
        const det=document.createElement('details'); det.className='entry';
        const sum=document.createElement('summary');
        const sumRow=document.createElement('div'); sumRow.className='summary-title';
        const folderIcon=document.createElement('span'); folderIcon.textContent='📁';
        const label=document.createElement('span'); label.textContent=n.title||'フォルダ';
        sumRow.appendChild(folderIcon); sumRow.appendChild(label);

        const actions=document.createElement('div'); actions.className='row';
        const importBtn=mkMiniBtn('このフォルダを取り込む','M5 20h14v-2H5v2z M11 3h2v8h3l-4 4-4-4h3z');
        importBtn.addEventListener('click', async (e)=>{ e.stopPropagation(); const urls=collectUrls(n.children||[]); let added=0; for(const u of urls){ await addLink(u.title,u.url,currentFolderId); added++; } alert(`${added} 件取り込みました`); });
        actions.appendChild(importBtn);

        sum.appendChild(sumRow); sum.appendChild(actions);
        det.appendChild(sum);

        const children=document.createElement('div'); children.className='children';
        det.appendChild(children);
        if(n.children) renderNodes(n.children, children);

        parent.appendChild(det);
      }
    }
  }

  renderNodes(tree, ui.chromeTree);
});
(ui.backToListFromImport && ui.backToListFromImport.addEventListener) && ui.backToListFromImport.addEventListener('click',async()=>{ await showOnly(ui.list); await renderList(); await applySettings(); });

// ====== 自動クローズ ======
let autoCloseTimer=null;
async function startAutoCloseTimer(){ const s=await LOCAL.get(K_SETTINGS); const sec=((s[K_SETTINGS] && s[K_SETTINGS].autoCloseSec))||30; resetAutoCloseTimer(sec); }
function resetAutoCloseTimer(secOverride){ if(autoCloseTimer) clearTimeout(autoCloseTimer); autoCloseTimer=setTimeout(()=>{ try{window.close();}catch{} }, (secOverride||30)*1000); }
['mousemove','keydown','click','wheel'].forEach(ev=> document.addEventListener(ev, ()=>resetAutoCloseTimer((ui.autoClose && ui.autoClose.value)||30)));

// ====== 起動 ======
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot);
try{ observeImportArea(); }catch(_){}
try{ tagImportRows(); }catch(_){}

  /* URL_HARDENER_READY */
  try{ hardenUrlTruncation(); }catch(_){}
  try{ window.addEventListener('resize', hardenUrlTruncation, {passive:true}); }catch(_){}
 } else { boot(); }



// ===== 追加: Forgot PIN フロー =====
(()=>{
  const openBtn = document.getElementById('bv-btn-reset');
  const modal   = document.getElementById('bv-reset-modal');
  const cancel  = document.getElementById('bv-btn-cancel');
  const confirm = document.getElementById('bv-btn-confirm');
  if(!openBtn || !modal || !cancel || !confirm) return;

  const open = () => {
    modal.classList.remove('bv-hidden');
    try{ confirm.focus({preventScroll:true}); }catch{}
    const esc = (e)=>{ if(e.key==='Escape') close(); };
    modal._esc = esc; document.addEventListener('keydown', esc);
  };
  const close = () => {
    modal.classList.add('bv-hidden');
    if(modal._esc){ document.removeEventListener('keydown', modal._esc); modal._esc=null; }
  };

  openBtn.addEventListener('click', (e)=>{ e.preventDefault(); open(); });
  cancel.addEventListener('click', (e)=>{ e.preventDefault(); close(); });
  confirm.addEventListener('click', async (e)=>{
    e.preventDefault();
    try{
      await chrome.storage.local.clear();
      try{ await chrome.runtime.sendMessage({type:'SET_UNLOCKED', value:false}); }catch{}
      try{ await chrome.runtime.sendMessage({type:'SET_SESSION_KEY', keyB64:null}); }catch{}
    }finally{
      location.reload();
    }
  });
})();


// fixed: guarded focusAfterShow implementation
window.focusAfterShow = window.focusAfterShow || function(section){
  try{
    section = section || (window.getCurrentSection ? window.getCurrentSection() : null);
    setTimeout(() => {
      try{
        if (!section) return;
        if (section === ui.setup && ui.setupPin) {
          focusWhenVisible(ui.setupPin, 60);
        } else if (section === ui.locked && ui.pin) {
          focusWhenVisible(ui.pin, 60);
        }
      }catch(e){}
    }, 50);
  }catch(e){}
};


// === v1.0.10: Harden URL truncation in Chrome import view ===
function hardenUrlTruncation() {
  const root = document.querySelector('#chrome-import') || document.querySelector('#import') || document;
  if (!root) return;
  // For each anchor that looks like a bookmark URL, enforce classes & titles
  const anchors = root.querySelectorAll('a[href^="http"]');
  anchors.forEach(a => {
    try {
      a.classList.add('url-clip');
      if (!a.title) a.title = a.href || a.textContent || '';
      const cell = a.parentElement;
      if (cell && cell.classList) cell.classList.add('url-cell');
      // Ensure the visual row can flex; tag the closest row-ish container
      let p = a.parentElement;
      let depth = 0;
      while (p && depth < 5) {
        if (p.classList && p.classList.contains('row')) { break; }
        p = p.parentElement; depth++;
      }
      // If no .row found nearby, it's fine; CSS generic .url-clip still applies
    } catch (_) {}
  });
}



// === v1.0.12: Generic tagging for import rows to ensure URL truncation ===
function tagImportRows(root){
  const scope = root || document.querySelector('#chrome-import') || document.querySelector('#import') || document;
  if (!scope) return;
  // Find anchors that look like bookmark URLs
  const links = scope.querySelectorAll('a[href^="http"]');
  links.forEach(a => {
    try{
      // Find a reasonable row container
      let row = a.closest('.row, .item, .entry, li, .card, .list-item');
      if (!row) row = a.parentElement && a.parentElement.parentElement || a.parentElement;
      if (!row) return;
      row.classList.add('bv-row');
      a.classList.add('bv-url');
      // Mark URL cell
      if (a.parentElement) a.parentElement.classList.add('bv-urlcell');
      // Tooltip full URL
      if (!a.title) a.title = a.href || a.textContent || '';
    }catch(_){}
  });
}
function observeImportArea(){
  const root = document.querySelector('#chrome-import') || document.querySelector('#import');
  if (!root) return;
  const mo = new MutationObserver(() => tagImportRows(root));
  mo.observe(root, { childList:true, subtree:true });
  // initial
  tagImportRows(root);
}



// === v1.0.13: Inline-style enforcement for long URL truncation ===
function forceUrlEllipsis(root){
  const scope = root || document.querySelector('#chrome-import') || document.querySelector('#import') || document;
  if (!scope) return;
  const links = scope.querySelectorAll('a[href^="http"]');
  links.forEach(a => {
    try{
      // On the anchor itself
      a.style.display = 'block';
      a.style.overflow = 'hidden';
      a.style.textOverflow = 'ellipsis';
      a.style.whiteSpace = 'nowrap';
      a.style.maxWidth = '100%';
      a.style.minWidth = '0';
      if (!a.title) a.title = a.href || a.textContent || '';
      // On its parent container: allow shrink
      const p = a.parentElement;
      if (p && p.style){
        // Let the middle cell shrink in flex/grid/inline contexts
        if (!p.style.minWidth) p.style.minWidth = '0';
        if (!p.style.flex) p.style.flex = '1 1 auto';
        // If parent row is a flex row but not set, try to make it layout-friendly
        const pr = p.parentElement;
        if (pr && pr.style){
          // Avoid breaking existing layout; only set minWidth on the URL container
          if (!pr.style.columnGap && getComputedStyle(pr).display === 'flex'){
            // no-op: layout already flex
          }
        }
      }
    }catch(e){}
  });
}
// Observe & re-apply on DOM changes and resize
(function setupUrlEllipsisObservers(){
  const root = document.querySelector('#chrome-import') || document.querySelector('#import') || document.body;
  try{
    forceUrlEllipsis(root);
    const mo = new MutationObserver(() => forceUrlEllipsis(root));
    mo.observe(root, { childList:true, subtree:true });
    try{
      const ro = new ResizeObserver(() => forceUrlEllipsis(root));
      ro.observe(root);
    }catch(_){ window.addEventListener('resize', () => forceUrlEllipsis(root), {passive:true}); }
  }catch(_){}
})();




// === v1.0.14: Generic row-level truncation for Chromeブックマーク view (enhanced in 1.0.15) ===
(function enforceBookmarkRows(){
  function isPlusButton(el){
    if (!el) return false;
    const t = (el.getAttribute('aria-label')||'').trim();
    if (t === '+' || t.toLowerCase() === 'add' || t === '追加') return true;
    if ((el.textContent||'').trim() === '+') return true;
    // allow role or data-icon hints
    if (el.getAttribute('role') === 'button' && (el.dataset.icon === 'plus' || /plus/i.test(el.className))) return true;
    return false;
  }
  function applyRowLayout(row, anchor){
    try{
      // Make a 3-column grid: [label] [url] [button]
      const cs = getComputedStyle(row);
      if (cs.display !== 'grid'){
        row.style.display = 'grid';
        row.style.gridTemplateColumns = 'auto 1fr auto';
        row.style.alignItems = 'center';
        row.style.columnGap = row.style.columnGap || '8px';
      }

      // Anchor ellipsis (inline to win specificity wars)
      anchor.style.display = 'block';
      anchor.style.overflow = 'hidden';
      anchor.style.textOverflow = 'ellipsis';
      anchor.style.whiteSpace = 'nowrap';
      anchor.style.maxWidth = '100%';
      anchor.style.minWidth = '0';
      if (!anchor.title) anchor.title = anchor.href || anchor.textContent || '';

      // URL cell should live in the 2nd column and be shrinkable
      const urlCell = anchor.parentElement || row;
      if (urlCell && urlCell.style){
        urlCell.style.minWidth = '0';
        urlCell.style.gridColumn = '2';
      }

      // Find plus button in this row and pin it to the right edge (3rd column)
      const candidates = row.querySelectorAll('button, a, span, i');
      let plus = null;
      for (const c of candidates){
        if (isPlusButton(c)) { plus = c; break; }
      }
      if (plus && plus.style){
        plus.style.gridColumn = '3';
        plus.style.justifySelf = 'end';
        // In case grid isn't applied for any reason, margin-left:auto as secondary
        if (!plus.style.marginLeft) plus.style.marginLeft = 'auto';
      }

      // If there's a left label element (single char), try to place it explicitly in column 1
      const firstChild = row.children[0];
      if (firstChild && firstChild !== urlCell && firstChild !== plus && firstChild.style){
        if (!firstChild.style.gridColumn) firstChild.style.gridColumn = '1';
      }
    }catch(_){}
  }

  function scan(root){
    const scope = root || document;
    const anchors = scope.querySelectorAll('a[href^="http"]');
    anchors.forEach(a => {
      let row = a.closest('.row, .item, .entry, .card, .list-item, li, div');
      while (row && row !== document.body){
        // row must contain the anchor and some button-like element
        const buttons = Array.from(row.querySelectorAll('button, a, span, i')).filter(isPlusButton);
        if (buttons.length){
          applyRowLayout(row, a);
          break;
        }
        row = row.parentElement;
      }
    });
  }

  try{
    scan(document);
    const mo = new MutationObserver(() => scan(document));
    mo.observe(document.body, {childList:true, subtree:true});
    try{
      const ro = new ResizeObserver(() => scan(document));
      ro.observe(document.body);
    }catch(_){ window.addEventListener('resize', () => scan(document), {passive:true}); }
  }catch(_){}
})();