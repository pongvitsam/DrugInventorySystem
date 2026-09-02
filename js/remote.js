/**
 * Sync กับ Google Apps Script Web App (Google Sheets)
 * ตั้ง URL ในหน้าตั้งค่า — เก็บใน localStorage (pharma:gasUrl)
 */
var RemoteDB = (function () {
  var GAS_URL_KEY = 'pharma:gasUrl';
  var loaded = false;
  var syncing = false;

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

  function isEmptyRemote_(data) {
    if (!data) return true;
    var items = data.Items || [];
    var settings = data.SettingsObj || {};
    var imported = String(settings.imported) === '1';
    return !imported && items.length === 0;
  }

  function ensureLoaded() {
    if (!enabled()) return Promise.resolve(false);
    if (loaded) return Promise.resolve(true);
    var url = baseUrl() + '?action=export&t=' + Date.now();
    return fetchJson(url).then(function (res) {
      if (!res || !res.ok || !res.data) {
        throw new Error((res && res.error) || 'โหลดจาก Google ไม่สำเร็จ');
      }
      if (!isEmptyRemote_(res.data)) {
        DB.importAll(res.data);
      }
      loaded = true;
      return true;
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
    var url = baseUrl() + '?action=export&t=' + Date.now();
    return fetchJson(url).then(function (res) {
      if (!res || !res.ok || !res.data) {
        throw new Error((res && res.error) || 'โหลดจาก Google ไม่สำเร็จ');
      }
      DB.importAll(res.data);
      loaded = true;
    });
  }

  return {
    enabled: enabled,
    getUrl: getUrl,
    setUrl: setUrl,
    ensureLoaded: ensureLoaded,
    sync: sync,
    ping: ping,
    pushLocal: pushLocal,
    pullRemote: pullRemote,
    resetSession: function () {
      loaded = false;
    }
  };
})();
