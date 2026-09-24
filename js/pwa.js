/**
 * PWA helpers — ลงทะเบียน Service Worker + ปุ่มติดตั้งแอป
 */
var PharmaPWA = (function () {
  var deferredPrompt_ = null;

  function isStandalone_() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function isIos_() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  function updateInstallUi_() {
    var card = document.getElementById('pwaInstallCard');
    var btn = document.getElementById('pwaInstallBtn');
    var tip = document.getElementById('pwaInstallTip');
    if (!card) return;

    if (isStandalone_()) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    if (deferredPrompt_ && btn) {
      btn.style.display = '';
      btn.disabled = false;
      if (tip) tip.textContent = 'ติดตั้งบนเครื่องนี้เพื่อเปิดแบบแอปจากหน้าจอโฮม';
    } else if (isIos_()) {
      if (btn) btn.style.display = 'none';
      if (tip) {
        tip.innerHTML = 'บน iPhone/iPad: กด <b>แชร์</b> → <b>เพิ่มไปยังหน้าจอโฮม</b>';
      }
    } else {
      if (btn) btn.style.display = 'none';
      if (tip) tip.textContent = 'เปิดด้วย Chrome/Edge แล้วจะมีปุ่มติดตั้งเมื่อพร้อม (ต้องใช้ HTTPS)';
    }
  }

  function register_() {
    if (!('serviceWorker' in navigator)) return;
    var swUrl = 'sw.js';
    navigator.serviceWorker.register(swUrl).then(function (reg) {
      // ตรวจอัปเดตเป็นระยะเมื่อกลับมาที่แท็บ
      setInterval(function () {
        try { reg.update(); } catch (e) { /* ignore */ }
      }, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          try { reg.update(); } catch (e) { /* ignore */ }
        }
      });
    }).catch(function () { /* SW ล้มเหลวไม่บล็อกแอป */ });
  }

  function bindInstall_() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt_ = e;
      updateInstallUi_();
    });
    window.addEventListener('appinstalled', function () {
      deferredPrompt_ = null;
      updateInstallUi_();
      if (typeof toast === 'function') toast('ติดตั้งแอปแล้ว');
    });
    var btn = document.getElementById('pwaInstallBtn');
    if (btn && !btn._pwaBound) {
      btn._pwaBound = true;
      btn.addEventListener('click', function () {
        if (!deferredPrompt_) return;
        deferredPrompt_.prompt();
        deferredPrompt_.userChoice.finally(function () {
          deferredPrompt_ = null;
          updateInstallUi_();
        });
      });
    }
    updateInstallUi_();
  }

  function init() {
    register_();
    bindInstall_();
  }

  return { init: init };
})();
