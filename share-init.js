// share-init.js — robust mount for settings tab (MV3 CSP-safe)
import { initBookmarkVaultShareJSON } from './share.js';

function ensureContainer(){
  let el = document.querySelector('#share-settings-block');
  const settings = document.querySelector('#settings');
  if (!el && settings) {
    el = document.createElement('div');
    el.className = 'field';
    el.id = 'share-settings-block';
    settings.appendChild(el);
  }
  return el;
}

function tryMount(){
  const el = ensureContainer();
  if (el && !el.dataset.bvMounted) {
    initBookmarkVaultShareJSON(el);
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  tryMount();
  let attempts = 0;
  const t = setInterval(()=>{
    attempts++;
    tryMount();
    if (attempts > 20 || (document.querySelector('#share-settings-block')?.dataset.bvMounted==='1')) {
      clearInterval(t);
    }
  }, 100);

  const obs = new MutationObserver(()=>tryMount());
  obs.observe(document.body, { childList:true, subtree:true });
});
