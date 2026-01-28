// share.js — JSON-only Export/Import (overwrite-only), MV3-safe & null-guarded
export async function initBookmarkVaultShareJSON(container){
  const root = (typeof container==='string') ? document.querySelector(container) : container;
  if (!root) return;
  if (root.dataset.bvMounted === '1') return;

  root.classList.add('bv-wrap');
  root.innerHTML = `
    <div class="bv-sec">
      <div class="bv-row" style="margin-bottom:.2rem">
        <button class="bv-btn" id="bv-export-json">エクスポート（.json）</button>
        <span class="bv-muted">現在のデータをJSONで保存</span>
      </div>
      <div class="bv-row">
        <label class="bv-file">
          <input type="file" id="bv-import-file" accept=".json">
          <span class="bv-btn">インポート（.json）</span>
        </label>
        <button class="bv-btn" id="bv-import-run" disabled>完全上書きでインポート</button>
      </div>
      <div id="bv-status" class="bv-muted" style="margin-top:.25rem;"></div>
    </div>
  `;

  const ui = {
    exportJson: root.querySelector('#bv-export-json'),
    file: root.querySelector('#bv-import-file'),
    run: root.querySelector('#bv-import-run'),
    status: root.querySelector('#bv-status'),
  };

  if (!ui.exportJson || !ui.file || !ui.run || !ui.status) {
    setTimeout(()=>initBookmarkVaultShareJSON(root), 50);
    return;
  }

  function dl(text, name){
    const blob = new Blob([text], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
  }
  function fmtBytes(n){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;}

  async function dumpAll(){ return await chrome.storage.local.get(null); }
  async function restore(data){
    const now=new Date().toISOString().replace(/[:.]/g,'-');
    const backup=await chrome.storage.local.get(null);
    await chrome.storage.local.set({['__backup_'+now]:backup});
    const keys=Object.keys(backup);
    if(keys.length) await chrome.storage.local.remove(keys);
    await chrome.storage.local.set(data);
  }

  ui.exportJson.addEventListener('click', async ()=>{
    try{
      ui.status.textContent='';
      const all=await dumpAll();
      const name=`BookmarkVault_${new Date().toISOString().slice(0,10)}.json`;
      dl(JSON.stringify(all,null,2), name);
    }catch(e){
      console.error(e);
      ui.status.innerHTML=`<span class="bv-err">エクスポート失敗: ${e.message||e}</span>`;
    }
  });

  let fileCache=null;
  ui.file.addEventListener('change', async (ev)=>{
    ui.status.textContent='';
    const f=ev.target.files?.[0];
    if(!f){ fileCache=null; ui.run.disabled=true; return; }
    const buf=await f.arrayBuffer();
    const txt=new TextDecoder().decode(buf);
    fileCache={name:f.name,text:txt,size:f.size};
    ui.run.disabled=false;
    ui.status.innerHTML=`<span class="bv-ok">読み込み済み:</span> ${f.name} / ${fmtBytes(f.size)}`;
  });

  ui.run.addEventListener('click', async ()=>{
    if(!fileCache) return;
    ui.run.disabled=true;
    ui.status.textContent='インポート中…';
    try{
      const incoming=JSON.parse(fileCache.text);
      await restore(incoming);
      ui.status.innerHTML=`<span class="bv-ok">インポート完了。</span>拡張のUIを再読み込みしてください。`;
    }catch(e){
      console.error(e);
      ui.status.innerHTML=`<span class="bv-err">インポート失敗: ${e.message||e}</span>`;
    }finally{
      ui.run.disabled=false;
    }
  });

  root.dataset.bvMounted = '1';
}
