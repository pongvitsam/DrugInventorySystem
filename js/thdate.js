var ThDate = (function () {
  var MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var MONTHS_SHORT = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var openPop = null;

  function pad2(n) { return ('0' + n).slice(-2); }
  function be(y) { return y + 543; }

  function parseIsoDate(iso) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
  }

  function toIsoDate(y, m, d) {
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function formatDateLong(iso) {
    var p = parseIsoDate(iso);
    if (!p) return 'เลือกวันที่';
    return p.d + ' ' + MONTHS[p.m] + ' ' + be(p.y);
  }

  function formatMonthLong(isoMonth) {
    if (!isoMonth) return 'เลือกเดือน';
    var p = String(isoMonth).split('-');
    if (p.length !== 2) return 'เลือกเดือน';
    return MONTHS[Number(p[1])] + ' ' + be(Number(p[0]));
  }

  function closePop() {
    if (openPop) {
      openPop.classList.remove('open');
      openPop = null;
    }
  }

  function setHiddenValue(id, val) {
    var hidden = document.getElementById(id);
    if (hidden) hidden.value = val || '';
    var btn = document.querySelector('.th-date-btn[data-for="' + id + '"]');
    if (btn) {
      if (hidden && hidden.dataset.kind === 'month') btn.textContent = formatMonthLong(val);
      else btn.textContent = formatDateLong(val);
    }
  }

  function getValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function buildDatePop(id, btn) {
    var pop = document.createElement('div');
    pop.className = 'th-date-pop';
    pop.innerHTML =
      '<div class="th-date-head">' +
      '<button type="button" class="th-nav" data-dir="-1">‹</button>' +
      '<select class="th-month"></select>' +
      '<select class="th-year"></select>' +
      '<button type="button" class="th-nav" data-dir="1">›</button>' +
      '</div>' +
      '<div class="th-weekdays">' +
      ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(function (w) { return '<span>' + w + '</span>'; }).join('') +
      '</div>' +
      '<div class="th-days"></div>' +
      '<div class="th-date-foot"><button type="button" class="btn ghost th-today">วันนี้</button></div>';
    btn.parentElement.appendChild(pop);

    var viewY, viewM, selected;
    var monthSel = pop.querySelector('.th-month');
    var yearSel = pop.querySelector('.th-year');
    var daysEl = pop.querySelector('.th-days');

    MONTHS.slice(1).forEach(function (name, i) {
      var o = document.createElement('option');
      o.value = String(i + 1);
      o.textContent = name;
      monthSel.appendChild(o);
    });

    var now = new Date();
    for (var y = now.getFullYear() - 5; y <= now.getFullYear() + 8; y++) {
      var o = document.createElement('option');
      o.value = String(y);
      o.textContent = 'พ.ศ. ' + be(y);
      yearSel.appendChild(o);
    }

    function syncViewFromHidden() {
      var cur = parseIsoDate(getValue(id)) || { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
      viewY = cur.y;
      viewM = cur.m;
      selected = getValue(id);
      monthSel.value = String(viewM);
      yearSel.value = String(viewY);
      renderDays();
    }

    function renderDays() {
      daysEl.innerHTML = '';
      var first = new Date(viewY, viewM - 1, 1).getDay();
      var total = daysInMonth(viewY, viewM);
      for (var i = 0; i < first; i++) {
        var blank = document.createElement('span');
        blank.className = 'th-day blank';
        daysEl.appendChild(blank);
      }
      for (var d = 1; d <= total; d++) {
        var iso = toIsoDate(viewY, viewM, d);
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'th-day';
        cell.textContent = String(d);
        if (iso === selected) cell.classList.add('selected');
        if (iso === toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())) cell.classList.add('today');
        cell.onclick = function (isoVal) {
          return function () {
            setHiddenValue(id, isoVal);
            closePop();
          };
        }(iso);
        daysEl.appendChild(cell);
      }
    }

    pop.querySelectorAll('.th-nav').forEach(function (b) {
      b.onclick = function () {
        viewM += Number(b.dataset.dir);
        if (viewM < 1) { viewM = 12; viewY--; }
        if (viewM > 12) { viewM = 1; viewY++; }
        monthSel.value = String(viewM);
        yearSel.value = String(viewY);
        renderDays();
      };
    });
    monthSel.onchange = function () { viewM = Number(monthSel.value); renderDays(); };
    yearSel.onchange = function () { viewY = Number(yearSel.value); renderDays(); };
    pop.querySelector('.th-today').onclick = function () {
      setHiddenValue(id, toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate()));
      closePop();
    };

    pop.onclick = function (e) { e.stopPropagation(); };
    btn.onclick = function (e) {
      e.stopPropagation();
      if (openPop && openPop !== pop) closePop();
      syncViewFromHidden();
      pop.classList.toggle('open');
      openPop = pop.classList.contains('open') ? pop : null;
    };

    return pop;
  }

  function buildMonthPop(id, btn) {
    var pop = document.createElement('div');
    pop.className = 'th-date-pop th-month-pop';
    pop.innerHTML =
      '<div class="th-date-head th-month-head">' +
      '<select class="th-month"></select>' +
      '<select class="th-year"></select>' +
      '</div>' +
      '<div class="th-date-foot"><button type="button" class="btn th-apply">ตกลง</button></div>';
    btn.parentElement.appendChild(pop);

    var monthSel = pop.querySelector('.th-month');
    var yearSel = pop.querySelector('.th-year');
    var now = new Date();

    MONTHS.slice(1).forEach(function (name, i) {
      var o = document.createElement('option');
      o.value = String(i + 1);
      o.textContent = name;
      monthSel.appendChild(o);
    });
    for (var y = now.getFullYear() - 5; y <= now.getFullYear() + 3; y++) {
      var o = document.createElement('option');
      o.value = String(y);
      o.textContent = 'พ.ศ. ' + be(y);
      yearSel.appendChild(o);
    }

    function syncFromHidden() {
      var val = getValue(id);
      var p = val ? val.split('-') : [String(now.getFullYear()), pad2(now.getMonth() + 1)];
      yearSel.value = p[0];
      monthSel.value = String(Number(p[1]));
    }

    pop.onclick = function (e) { e.stopPropagation(); };
    btn.onclick = function (e) {
      e.stopPropagation();
      if (openPop && openPop !== pop) closePop();
      syncFromHidden();
      pop.classList.toggle('open');
      openPop = pop.classList.contains('open') ? pop : null;
    };

    pop.querySelector('.th-apply').onclick = function () {
      setHiddenValue(id, yearSel.value + '-' + pad2(Number(monthSel.value)));
      closePop();
    };

    return pop;
  }

  function initDateField(id) {
    var hidden = document.getElementById(id);
    if (!hidden || hidden.dataset.thInit) return;
    hidden.type = 'hidden';
    hidden.dataset.kind = 'date';
    hidden.dataset.thInit = '1';

    var wrap = hidden.closest('.th-date-field') || hidden.parentElement;
    var btn = wrap.querySelector('.th-date-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'th-date-btn';
      btn.dataset.for = id;
      hidden.parentElement.insertBefore(btn, hidden.nextSibling);
    }
    btn.dataset.for = id;
    btn.textContent = formatDateLong(hidden.value);
    buildDatePop(id, btn);
  }

  function initMonthField(id) {
    var hidden = document.getElementById(id);
    if (!hidden || hidden.dataset.thInit) return;
    hidden.type = 'hidden';
    hidden.dataset.kind = 'month';
    hidden.dataset.thInit = '1';

    var wrap = hidden.closest('.th-date-field') || hidden.parentElement;
    var btn = wrap.querySelector('.th-date-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'th-date-btn';
      btn.dataset.for = id;
      hidden.parentElement.insertBefore(btn, hidden.nextSibling);
    }
    btn.dataset.for = id;
    btn.textContent = formatMonthLong(hidden.value);
    buildMonthPop(id, btn);
  }

  function initAll() {
    ['rcDate', 'rcExpiry', 'trDate', 'adjDate'].forEach(initDateField);
    initMonthField('rpMonth');
  }

  document.addEventListener('click', function () { closePop(); });
  document.addEventListener('DOMContentLoaded', initAll);

  return {
    initAll: initAll,
    set: setHiddenValue,
    get: getValue,
    formatDateLong: formatDateLong,
    formatMonthLong: formatMonthLong
  };
})();
