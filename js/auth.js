var Auth = (function () {
  var SESSION_KEY = 'pharma:Session';

  function readStored(key) {
    try {
      var raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getUsername() {
    var s = readStored(SESSION_KEY);
    return s && s.username ? s.username : '';
  }

  function isLoggedIn() {
    if (localStorage.getItem(SESSION_KEY)) {
      var s = readStored(SESSION_KEY);
      return !!(s && s.username && s.remember);
    }
    if (sessionStorage.getItem(SESSION_KEY)) {
      var s2 = readStored(SESSION_KEY);
      return !!(s2 && s2.username);
    }
    return false;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }

  function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appRoot').style.display = 'none';
  }

  function showApp(username) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appRoot').style.display = 'flex';
    var el = document.getElementById('currentUser');
    if (el) el.textContent = username;
    if (typeof startApp === 'function') startApp();
  }

  function login(username, remember) {
    return DrugAPI.api('login', { username: username }).then(function (r) {
      clearSession();
      var data = { username: r.username, remember: !!remember };
      if (remember) localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      else sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
      return r.username;
    });
  }

  function logout() {
    clearSession();
    showLoginScreen();
    var inp = document.getElementById('loginUser');
    if (inp) inp.value = '';
    var err = document.getElementById('loginErr');
    if (err) err.textContent = '';
  }

  function init() {
    if (isLoggedIn()) showApp(getUsername());
    else showLoginScreen();
  }

  return { init: init, login: login, logout: logout, getUsername: getUsername, isLoggedIn: isLoggedIn };
})();

function doLogin() {
  var user = (document.getElementById('loginUser').value || '').trim();
  var remember = document.getElementById('loginRemember').checked;
  var err = document.getElementById('loginErr');
  err.textContent = '';
  if (!user) {
    err.textContent = 'กรุณาใส่ Username';
    return;
  }
  Auth.login(user, remember).then(function (name) {
    Auth.showApp(name);
  }).catch(function (e) {
    err.textContent = (e && e.message) ? e.message : String(e);
  });
}

function doLogout() {
  if (confirm('ออกจากระบบหรือไม่?')) Auth.logout();
}

document.addEventListener('DOMContentLoaded', function () {
  var inp = document.getElementById('loginUser');
  if (inp) {
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doLogin();
    });
  }
  Auth.init();
});
