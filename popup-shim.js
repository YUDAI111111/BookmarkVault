// popup-shim.js — defines focusAfterShow if absent & auto-focus PIN on setup
(function(){
  if (!window.getCurrentSection) {
    window.getCurrentSection = function(){
      try{
        const ui = window.ui || {};
        if (ui.setup && ui.setup.offsetParent !== null) return ui.setup;
        if (ui.locked && ui.locked.offsetParent !== null) return ui.locked;
        if (ui.list && ui.list.offsetParent !== null) return ui.list;
      }catch(_){}
      const secs = document.querySelectorAll('section, .section, [role="region"]');
      for (const s of secs) if (s.offsetParent !== null) return s;
      return null;
    };
  }
  function focusFirstInside(root){
    if (!root) return;
    const sel = [
      'input[type="password"]',
      'input[autofocus]',
      'input[type="text"]',
      'input, textarea',
      'button, [role="button"]',
      'a[href]'
    ].join(',');
    const el = root.querySelector(sel);
    if (el) { try{ el.focus(); if (el.select) el.select(); }catch(_){ } }
  }
  if (typeof window.focusAfterShow !== 'function') {
    window.focusAfterShow = function(section){ focusFirstInside(section || window.getCurrentSection()); };
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    const tryFocus = ()=>{
      const setup = (window.ui && window.ui.setup) || document.querySelector('#setup, [data-view="setup"]');
      if (setup && setup.offsetParent !== null) { focusFirstInside(setup); return true; }
      return false;
    };
    if (!tryFocus()) { let n=0; const t=setInterval(()=>{ n++; if (tryFocus() || n>20) clearInterval(t); }, 100); }
  });
})();