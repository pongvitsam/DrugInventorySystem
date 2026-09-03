/**
 * Sync กับ Google Apps Script Web App (Google Sheets)
 * เครื่องที่มีประวัติรับ-เบิกใหม่กว่าต้องไม่ถูกเครื่องเก่าทับ
 */
var RemoteDB = (function () {
  var GAS_URL_KEY = 'pharma:gasUrl';
  var REV_KEY = 'pharma:syncRevision';
  var BACKUP_KEY = 'pharma:safetyBackup';
  var HISTORY_CUTOFF_ = '2026-09-01';
  var POLL_MS = 30000;
  var loaded = false;
  var syncing = false;
  var localRevision = Number(localStorage.getItem(REV_KEY) || 0) || 0;
  var pollTimer = null;
  var pollCallback = null;
  var visibilityBound = false;
  var lastSyncAction = null;

  function consumeSyncAction() {
    var action = lastSyncAction;
    lastSyncAction = null;
    return action;
  }

  function hasLocalData_() {
    var settings = DB.readSettingsObj();
    if (String(settings.imported) === '1') return true;
    var items = DB.readObjects('Items');
    if (items && items.length > 0) return true;
    var stock = DB.readObjects('Stock');
    return !!(stock && stock.some(function (s) { return Number(s.qty) > 0; }));
  }

  function fingerprint_(data) {
    data = data || {};
    var receipts = data.Receipts || [];
    var receiptLines = data.ReceiptLines || [];
    var transfers = data.Transfers || [];
    var transferLines = data.TransferLines || [];
    var moves = data.Movements || [];
    var histDocs = 0;
    var histMoves = 0;
    var latest = '';
    function noteTime(v) {
      var t = String(v || '');
      if (t > latest) latest = t;
    }
    receipts.forEach(function (r) {
      var d = String(r.date || r.createdAt || '').slice(0, 10);
      noteTime(r.createdAt || r.date || '');
      if (d >= HISTORY_CUTOFF_) histDocs++;
    });
    transfers.forEach(function (r) {
      var d = String(r.date || r.createdAt || '').slice(0, 10);
      noteTime(r.createdAt || r.date || '');
      if (d >= HISTORY_CUTOFF_) histDocs++;
    });
    moves.forEach(function (m) {
      if (m.type === 'OPENING' || String(m.refId || '') === 'SEED') return;
      if (m.type === 'RECEIVE' || m.type === 'ISSUE' || m.type === 'COUNT' || m.type === 'RETURN') {
        histMoves++;
        noteTime(m.date || '');
        var d = String(m.date || '').slice(0, 10);
        if (d >= HISTORY_CUTOFF_) histDocs++;
      }
    });
    var settings = data.SettingsObj || {};
    var score = receipts.length * 100 + transfers.length * 100 +
      receiptLines.length + transferLines.length + histMoves;
    return {
      score: score,
      histDocs: histDocs,
      histMoves: histMoves,
      latest: latest,
      receipts: receipts.length,
      receiptLines: receiptLines.length,
      transfers: transfers.length,
      transferLines: transferLines.length,
      items: (data.Items || []).length,
      revision: Number(settings.syncRevision) || 0,
      updatedAt: String(settings.syncUpdatedAt || '')
    };
  }

  function fpLabel_(fp) {
    if (!fp) return 'ไม่มีข้อมูล';
    return (fp.receipts || 0) + ' ใบรับ · ' + (fp.transfers || 0) + ' ใบเบิก · ' +
      (fp.histMoves || 0) + ' รายการเคลื่อนไหว';
  }

  function hasRealActivity_(fp) {
    return !!(fp && ((fp.score || 0) > 0 || fp.histDocs > 0 || fp.histMoves > 0 ||
      fp.receipts > 0 || fp.transfers > 0));
  }

  function compareFreshness_(a, b) {
    if (!a && !b) return 'equal';
    if (!a) return 'b';
    if (!b) return 'a';
    var as = Number(a.score || 0);
    var bs = Number(b.score || 0);
    if (as !== bs) return as > bs ? 'a' : 'b';
    if (a.histDocs !== b.histDocs) return a.histDocs > b.histDocs ? 'a' : 'b';
    if (a.histMoves !== b.histMoves) return a.histMoves > b.histMoves ? 'a' : 'b';
    if (a.latest !== b.latest) return a.latest > b.latest ? 'a' : 'b';
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? 'a' : 'b';
    if (a.revision !== b.revision) return a.revision > b.revision ? 'a' : 'b';
    return 'equal';
  }

  function localFingerprint_() {
    return fingerprint_(DB.exportAll());
  }

  function readBackup_() {
    try {
      var raw = localStorage.getItem(BACKUP_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveSafetyBackup_() {
    var data = DB.exportAll();
    var fp = fingerprint_(data);
    if (!hasLocalData_() && !hasRealActivity_(fp)) return;
    var payload = { savedAt: new Date().toISOString(), fingerprint: fp, data: data };
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(payload));
    } catch (e) {
      try {
        payload.data = {
          SettingsObj: data.SettingsObj,
          SeqObj: data.SeqObj,
          Stock: data.Stock,
          Receipts: data.Receipts,
          ReceiptLines: data.ReceiptLines,
          Transfers: data.Transfers,
          TransferLines: data.TransferLines,
          Movements: data.Movements
        };
        payload.slim = true;
        localStorage.setItem(BACKUP_KEY, JSON.stringify(payload));
      } catch (e2) { /* ignore quota */ }
    }
  }

  function applyDump_(data, slim) {
    if (!data) return false;
    if (slim) {
      var merged = DB.exportAll();
      Object.keys(data).forEach(function (k) { merged[k] = data[k]; });
      DB.importAll(merged);
    } else {
      DB.importAll(data);
    }
    resetApiCaches_();
    return true;
  }

  function restoreBackupIfRicher_(remoteFp) {
    var backup = readBackup_();
    if (!backup || !backup.data || !backup.fingerprint) return false;
    var localFp = localFingerprint_();
    var best = localFp;
    var source = 'local';
    if (compareFreshness_(backup.fingerprint, best) === 'a') {
      best = backup.fingerprint;
      source = 'backup';
    }
    if (remoteFp && compareFreshness_(remoteFp, best) === 'a') return false;
    if (source !== 'backup') return false;
    if (!hasRealActivity_(backup.fingerprint)) return false;
    applyDump_(backup.data, backup.slim);
    lastSyncAction = 'restored';
    return true;
  }

  function getUrl() {
    if (window.PHARMA_CONFIG && window.PHARMA_CONFIG.gasUrl) {
      return normalizeGasUrl_(window.PHARMA_CONFIG.gasUrl);
    }
    return normalizeGasUrl_(localStorage.getItem(GAS_URL_KEY) || '');
  }

  function normalizeGasUrl_(url) {
    url = String(url || '').trim();
    if (!url) return '';
    // ตัด query/hash ที่ไม่จำเป็น
    url = url.split('#')[0];
    // ปฏิเสธ URL หน้า Editor — ใช้ไม่ได้กับ fetch
    if (/script\.google\.com\/.+\/(edit|home\/projects)/i.test(url) ||
        /\/projects\/[^/]+\/edit/i.test(url)) {
      return '';
    }
    // ต้องเป็น Web App /exec
    var m = url.match(/https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/i);
    if (m) return m[0];
    if (/\/exec\/?$/i.test(url) && /script\.google\.com/i.test(url)) {
      return url.replace(/\/$/, '');
    }
    return '';
  }

  function validateUrlMessage_(raw) {
    raw = String(raw || '').trim();
    if (!raw) return 'กรุณาใส่ URL Web App';
    if (/\/edit|\/home\/projects/i.test(raw)) {
      return 'นี่คือ URL หน้าแก้ไขโค้ด ไม่ใช่ Web App — ไป Deploy → Manage deployments แล้วคัดลอก URL ที่ลงท้าย /exec';
    }
    if (!normalizeGasUrl_(raw)) {
      return 'URL ไม่ถูกต้อง ต้องเป็น https://script.google.com/macros/s/.../exec';
    }
    return '';
  }

  function setUrl(url) {
    var raw = String(url || '').trim();
    var normalized = normalizeGasUrl_(raw);
    if (raw && !normalized) {
      // เก็บ raw ไว้ไม่ได้ — ล้างเพื่อไม่ให้เรียกผิด
      localStorage.removeItem(GAS_URL_KEY);
      loaded = false;
      return { ok: false, error: validateUrlMessage_(raw) };
    }
    if (normalized) localStorage.setItem(GAS_URL_KEY, normalized);
    else localStorage.removeItem(GAS_URL_KEY);
    loaded = false;
    return { ok: true, url: normalized };
  }

  function enabled() {
    return !!getUrl();
  }

  function baseUrl() {
    return getUrl().replace(/\/$/, '');
  }

  function fetchJson(url, options) {
    options = options || {};
    // ห้าม JSONP/ContentService — Google เด้งไป macros/echo แล้ว 403 จาก GitHub Pages
    if (!options.method || String(options.method).toUpperCase() === 'GET') {
      var q = '';
      var qi = url.indexOf('?');
      if (qi >= 0) q = url.slice(qi + 1).replace(/&?t=\d+/g, '').replace(/^&/, '');
      return iframeGet_(q);
    }
    return postViaIframe_(options.body);
  }

  /** GET ผ่าน iframe + postMessage (ข้าม CORS โดยไม่ผ่าน macros/echo) */
  function iframeGet_(query) {
    return new Promise(function (resolve, reject) {
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'display:none;width:0;height:0;border:0';
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('โหลดจาก Google ไม่สำเร็จ — กด Ctrl+F5 แล้วลองใหม่'));
      }, 30000);
      function onMsg(ev) {
        var d = ev && ev.data;
        if (!d || d.source !== 'DrugInventoryGAS') return;
        if (settled) return;
        settled = true;
        cleanup();
        resolve(d.payload);
      }
      function cleanup() {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }
      window.addEventListener('message', onMsg);
      iframe.src = baseUrl() + '?' + query +
        (query ? '&' : '') + 'mode=iframe&t=' + Date.now();
      document.body.appendChild(iframe);
    });
  }

  function postViaIframe_(bodyText) {
    return new Promise(function (resolve, reject) {
      var name = 'gasFrame' + Date.now();
      var iframe = document.createElement('iframe');
      iframe.name = name;
      iframe.style.cssText = 'display:none;width:0;height:0;border:0';
      document.body.appendChild(iframe);
      var form = document.createElement('form');
      form.method = 'POST';
      form.action = baseUrl();
      form.target = name;
      form.style.display = 'none';
      function addHidden(n, v) {
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = n;
        input.value = v;
        form.appendChild(input);
      }
      addHidden('payload', bodyText);
      addHidden('mode', 'iframe');
      document.body.appendChild(form);
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('บันทึกขึ้น Google ไม่สำเร็จ'));
      }, 45000);
      function onMsg(ev) {
        var d = ev && ev.data;
        if (!d || d.source !== 'DrugInventoryGAS') return;
        if (settled) return;
        settled = true;
        cleanup();
        resolve(d.payload);
      }
      function cleanup() {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        try { document.body.removeChild(form); } catch (e) {}
        setTimeout(function () {
          try { document.body.removeChild(iframe); } catch (e2) {}
        }, 500);
      }
      window.addEventListener('message', onMsg);
      form.submit();
    });
  }

  function resetApiCaches_() {
    if (typeof DrugAPI !== 'undefined' && DrugAPI.resetCaches) DrugAPI.resetCaches();
  }

  function applyRevision_(rev) {
    if (rev != null && !isNaN(Number(rev))) {
      localRevision = Number(rev) || 0;
      try { localStorage.setItem(REV_KEY, String(localRevision)); } catch (e) { /* ignore */ }
    }
  }

  function isEmptyRemote_(data) {
    if (!data) return true;
    var items = data.Items || [];
    var settings = data.SettingsObj || {};
    var imported = String(settings.imported) === '1';
    var fp = fingerprint_(data);
    return !imported && items.length === 0 && !hasRealActivity_(fp);
  }

  function applyRemotePayload_(res, force) {
    if (!res) return false;
    applyRevision_(res.revision);
    if (force || !isEmptyRemote_(res.data)) {
      saveSafetyBackup_();
      DB.importAll(res.data || {});
      resetApiCaches_();
      return true;
    }
    return false;
  }

  function postImport_(force) {
    return fetchJson(baseUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'import',
        data: DB.exportAll(),
        expectedRevision: force ? null : localRevision,
        force: !!force
      })
    });
  }

  function handleImportResult_(res) {
    if (res && res.conflict) {
      return fetchJson(baseUrl() + '?action=export&t=' + Date.now()).then(function (ex) {
        if (!ex || !ex.ok) throw new Error('ข้อมูลบน Google ใหม่กว่า และโหลดไม่สำเร็จ');
        var remoteFp = fingerprint_(ex.data);
        var localFp = localFingerprint_();
        if (compareFreshness_(localFp, remoteFp) === 'a' && hasRealActivity_(localFp)) {
          applyRevision_(ex.revision);
          return postImport_(true).then(handleImportResult_);
        }
        applyRemotePayload_(ex, true);
        loaded = true;
        throw new Error('มีข้อมูลใหม่กว่าบน Google — โหลดแล้ว กรุณาทำรายการอีกครั้ง');
      });
    }
    if (!res || !res.ok) {
      throw new Error((res && res.error) || 'บันทึกขึ้น Google ไม่สำเร็จ');
    }
    applyRevision_(res.revision);
  }

  function sync(opts) {
    opts = opts || {};
    if (!enabled()) return Promise.resolve();
    if (syncing) return Promise.resolve();
    syncing = true;
    return postImport_(!!opts.force).then(handleImportResult_).finally(function () {
      syncing = false;
    });
  }

  function ensureLoaded() {
    if (!enabled()) return Promise.resolve(false);
    if (loaded) return Promise.resolve(true);
    var url = baseUrl() + '?action=export&t=' + Date.now();
    return fetchJson(url).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.error) || 'โหลดจาก Google ไม่สำเร็จ');
      }
      var remoteFp = fingerprint_(res.data);
      restoreBackupIfRicher_(remoteFp);
      var localFp = localFingerprint_();
      var remoteEmpty = isEmptyRemote_(res.data);

      if (remoteEmpty) {
        applyRevision_(res.revision);
        loaded = true;
        if (hasRealActivity_(localFp)) {
          lastSyncAction = 'uploaded';
          return sync({ force: true });
        }
        return Promise.resolve();
      }

      var winner = compareFreshness_(localFp, remoteFp);
      if (winner === 'a' && hasRealActivity_(localFp)) {
        applyRevision_(res.revision);
        loaded = true;
        lastSyncAction = lastSyncAction === 'restored' ? 'restored' : 'kept-local';
        return sync({ force: true });
      }

      if (applyRemotePayload_(res, false)) lastSyncAction = 'pulled';
      loaded = true;
      return Promise.resolve();
    });
  }

  function refreshIfNewer() {
    if (!enabled()) return Promise.resolve({ changed: false });
    var url = baseUrl() + '?action=meta&t=' + Date.now();
    return fetchJson(url).then(function (meta) {
      if (!meta || !meta.ok) return { changed: false };
      var remoteRev = Number(meta.revision) || 0;
      if (remoteRev <= localRevision) return { changed: false, revision: localRevision };
      return fetchJson(baseUrl() + '?action=export&t=' + Date.now()).then(function (res) {
        if (!res || !res.ok) return { changed: false };
        var remoteFp = fingerprint_(res.data);
        var localFp = localFingerprint_();
        if (compareFreshness_(localFp, remoteFp) === 'a' && hasRealActivity_(localFp)) {
          applyRevision_(res.revision);
          lastSyncAction = 'kept-local';
          return sync({ force: true }).then(function () {
            return { changed: false, restored: true, revision: localRevision };
          });
        }
        var changed = applyRemotePayload_(res, true);
        loaded = true;
        return { changed: changed, revision: localRevision };
      });
    });
  }

  function ping() {
    return fetchJson(baseUrl() + '?action=ping&t=' + Date.now());
  }

  function pushLocal() {
    if (!enabled()) return Promise.reject(new Error('ยังไม่ได้ตั้ง URL Web App'));
    return sync({ force: true });
  }

  function pullRemote() {
    if (!enabled()) return Promise.reject(new Error('ยังไม่ได้ตั้ง URL Web App'));
    loaded = false;
    var url = baseUrl() + '?action=export&t=' + Date.now();
    return fetchJson(url).then(function (res) {
      if (!res || !res.ok || !res.data) {
        throw new Error((res && res.error) || 'โหลดจาก Google ไม่สำเร็จ');
      }
      applyRemotePayload_(res, true);
      loaded = true;
    });
  }

  function bindVisibility_() {
    if (visibilityBound) return;
    visibilityBound = true;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden || !enabled()) return;
      refreshIfNewer().then(function (r) {
        if (r.changed && pollCallback) pollCallback(r);
      }).catch(function () {});
    });
  }

  function startPolling(onChange) {
    stopPolling();
    if (!enabled()) return;
    pollCallback = onChange || null;
    bindVisibility_();
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      refreshIfNewer().then(function (r) {
        if (r.changed && pollCallback) pollCallback(r);
      }).catch(function () {});
    }, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    pollCallback = null;
  }

  function getRevision() {
    return localRevision;
  }

  function applyUrlFromSettings_(settings) {
    if (!settings || !settings.gasWebAppUrl) return;
    var url = normalizeGasUrl_(settings.gasWebAppUrl);
    if (!url || getUrl()) return;
    setUrl(url);
    loaded = false;
  }

  function describeSources() {
    var local = { name: 'local', label: 'เครื่องนี้', fingerprint: localFingerprint_(), data: null };
    var backup = readBackup_();
    var sources = [local];
    if (backup && backup.data) {
      sources.push({
        name: 'backup',
        label: 'สำเนากู้ในเครื่องนี้',
        fingerprint: backup.fingerprint || fingerprint_(backup.data),
        data: backup.data,
        slim: !!backup.slim
      });
    }
    var chain = Promise.resolve(sources);
    if (enabled()) {
      chain = fetchJson(baseUrl() + '?action=export&t=' + Date.now()).then(function (res) {
        if (res && res.ok && res.data) {
          sources.push({
            name: 'remote',
            label: 'Google',
            fingerprint: fingerprint_(res.data),
            data: res.data,
            revision: res.revision
          });
        }
        return sources;
      }).catch(function () { return sources; });
    }
    return chain.then(function (list) {
      var best = null;
      list.forEach(function (s) {
        s.summary = fpLabel_(s.fingerprint);
        if (!best || compareFreshness_(s.fingerprint, best.fingerprint) === 'a') best = s;
      });
      return { sources: list, richest: best };
    });
  }

  function restoreRichest() {
    return describeSources().then(function (info) {
      var best = info.richest;
      if (!best || !hasRealActivity_(best.fingerprint)) {
        throw new Error('ยังไม่พบชุดข้อมูลรับเข้า/เบิกที่กู้ได้บนเครื่องนี้หรือ Google');
      }
      if (best.name === 'backup') {
        applyDump_(best.data, best.slim);
        lastSyncAction = 'restored';
      } else if (best.name === 'remote') {
        applyDump_(best.data, false);
        applyRevision_(best.revision);
        lastSyncAction = 'pulled';
        loaded = true;
        return info;
      }
      loaded = true;
      if (enabled()) {
        return sync({ force: true }).then(function () { return info; });
      }
      return info;
    });
  }

  function importDump(data, opts) {
    opts = opts || {};
    if (!data || typeof data !== 'object') throw new Error('ไฟล์สำรองไม่ถูกต้อง');
    if (!data.Items && !data.Receipts && !data.Stock && !data.Transfers) {
      throw new Error('ไฟล์นี้ไม่ใช่ข้อมูลคลังยา');
    }
    var incoming = fingerprint_(data);
    var localFp = localFingerprint_();
    // อนุญาตนำเข้าซ้ำ (idempotent) — ทับทั้งชุด ไม่ซ้อน
    // ถ้าเครื่องมีข้อมูลมากกว่าไฟล์ ต้อง force ชัดเจน
    if (!opts.force && hasRealActivity_(localFp) && compareFreshness_(localFp, incoming) === 'a') {
      throw new Error('ข้อมูลในเครื่องนี้มีมากกว่าไฟล์ที่เลือก — ยืนยันทับทั้งหมดถ้าต้องการใช้ไฟล์นี้');
    }
    saveSafetyBackup_();
    applyDump_(data, false);
    loaded = true;
    lastSyncAction = 'imported-file';
    if (enabled()) return sync({ force: true });
    return Promise.resolve();
  }

  return {
    enabled: enabled,
    getUrl: getUrl,
    setUrl: setUrl,
    validateUrl: validateUrlMessage_,
    normalizeUrl: normalizeGasUrl_,
    build: 62,
    ensureLoaded: ensureLoaded,
    refreshIfNewer: refreshIfNewer,
    sync: sync,
    ping: ping,
    pushLocal: pushLocal,
    pullRemote: pullRemote,
    startPolling: startPolling,
    stopPolling: stopPolling,
    getRevision: getRevision,
    applyUrlFromSettings: applyUrlFromSettings_,
    consumeSyncAction: consumeSyncAction,
    describeSources: describeSources,
    restoreRichest: restoreRichest,
    importDump: importDump,
    localFingerprint: localFingerprint_,
    fpLabel: fpLabel_,
    resetSession: function () {
      loaded = false;
      stopPolling();
    }
  };
})();
