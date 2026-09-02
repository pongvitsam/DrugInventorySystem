/**
 * Sync กับ Google Apps Script Web App (Google Sheets)
 * รองรับหลายอุปกรณ์: revision tracking, auto-refresh, polling
 */
var RemoteDB = (function () {
  var GAS_URL_KEY = 'pharma:gasUrl';
  var POLL_MS = 30000;
  var loaded = false;
  var syncing = false;
  var localRevision = 0;
  var pollTimer = null;
  var pollCallback = null;
  var visibilityBound = false;

  function getUrl() {
    if (window.PHARMA_CONFIG && window.PHARMA_CONFIG.gasUrl) {
      return String(window.PHARMA_CONFIG.gasUrl).trim();
    }
    return String(localStorage.getItem(GAS_URL_KEY) || '').trim();
  }

  function setUrl(url) {
    url = String(url || '').trim();
    if (url) localStorage.setItem(GAS_URL_KEY, url);
    else localStorage.removeItem(GAS_URL_KEY);
    loaded = false;
    localRevision = 0;
  }

  function enabled() {
    return !!getUrl();
  }

  function baseUrl() {
    return getUrl().replace(/\/$/, '');
  }

  function fetchJson(url, options) {
    return fetch(url, options || {}).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function resetApiCaches_() {
    if (typeof DrugAPI !== 'undefined' && DrugAPI.resetCaches) DrugAPI.resetCaches();
  }

  function applyRevision_(rev) {
    if (rev != null && !isNaN(Number(rev))) localRevision = Number(rev) || 0;
  }

  function isEmptyRemote_(data) {
    if (!data) return true;
    var items = data.Items || [];
    var settings = data.SettingsObj || {};
    var imported = String(settings.imported) === '1';
    return !imported && items.length === 0;
  }

  function applyRemotePayload_(res, force) {
    if (!res) return false;
    applyRevision_(res.revision);
    if (force || !isEmptyRemote_(res.data)) {
      DB.importAll(res.data || {});
      resetApiCaches_();
      return true;
    }
    return false;
  }

  function ensureLoaded() {
    if (!enabled()) return Promise.resolve(false);
    if (loaded) return Promise.resolve(true);
    var url = baseUrl() + '?action=export&t=' + Date.now();
    return fetchJson(url).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.error) || 'โหลดจาก Google ไม่สำเร็จ');
      }
      applyRemotePayload_(res, false);
      loaded = true;
      return true;
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
        var changed = applyRemotePayload_(res, true);
        loaded = true;
        return { changed: changed, revision: localRevision };
      });
    });
  }

  function sync() {
    if (!enabled()) return Promise.resolve();
    if (syncing) return Promise.resolve();
    syncing = true;
    var url = baseUrl();
    return fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'import', data: DB.exportAll() })
    }).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.error) || 'บันทึกขึ้น Google ไม่สำเร็จ');
      }
      applyRevision_(res.revision);
    }).finally(function () {
      syncing = false;
    });
  }

  function ping() {
    return fetchJson(baseUrl() + '?action=ping&t=' + Date.now());
  }

  function pushLocal() {
    if (!enabled()) return Promise.reject(new Error('ยังไม่ได้ตั้ง URL Web App'));
    return sync();
  }

  function pullRemote() {
    if (!enabled()) return Promise.reject(new Error('ยังไม่ได้ตั้ง URL Web App'));
    loaded = false;
    localRevision = 0;
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
    var url = String(settings.gasWebAppUrl).trim();
    if (!url || getUrl()) return;
    setUrl(url);
    loaded = false;
  }

  return {
    enabled: enabled,
    getUrl: getUrl,
    setUrl: setUrl,
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
    resetSession: function () {
      loaded = false;
      localRevision = 0;
      stopPolling();
    }
  };
})();
