// popup-guard.js — MV3-safe global error handlers + lightweight reporter
(function(){
  if (window.__bvGuardInstalled) return;
  window.__bvGuardInstalled = true;
  function log(type, msg, detail){
    try{
      const entry = { type, msg: String(msg||''), detail, ts: Date.now() };
      console[type === 'error' ? 'error' : 'warn']('[BV]', msg, detail || '');
      window.__bvLastLogs = (window.__bvLastLogs || []).slice(-9);
      window.__bvLastLogs.push(entry);
      chrome.storage.local.get({ __bvLogs: [] }).then(({__bvLogs})=>{
        __bvLogs.push(entry); if (__bvLogs.length>50) __bvLogs = __bvLogs.slice(-50);
        chrome.storage.local.set({ __bvLogs });
      }).catch(()=>{});
    }catch(_){}
  }
  window.addEventListener('error', (e)=>{
    log('error', e.message, { file: e.filename, line: e.lineno, col: e.colno, error: String(e.error||'') });
  });
  window.addEventListener('unhandledrejection', (e)=>{
    const reason = e && (e.reason?.stack || e.reason?.message || String(e.reason));
    log('error', 'unhandledrejection', { reason });
  });
  window.__bvLog = (m, d)=>log('warn', m, d);
})();
