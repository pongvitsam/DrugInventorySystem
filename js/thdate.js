var ThDate = (function () {
  var MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var MONTHS_SHORT = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
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

  function formatDateBtn(iso) {
    var p = parseIsoDate(iso);
    if (!p) return 'เลือกวันที่';
    return p.d + ' ' + MONTHS_SHORT[p.m] + ' ' + be(p.y);
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
      var text = btn.querySelector('.th-date-text');
      var label = hidden && hidden.dataset.kind === 'month' ? formatMonthLong(val) : formatDateBtn(val);
      if (text) text.textContent = label;
      else btn.textContent = label;
    }
  }

  function getValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function updateHeaderTitle(pop, viewY, viewM) {
    var monthEl = pop.querySelector('.th-cal-month');
    var yearEl = pop.querySelector('.th-cal-year');
    if (monthEl) monthEl.textContent = MONTHS[viewM];
    if (yearEl) yearEl.textContent = 'พ.ศ. ' + be(viewY);
  }

  function buildDatePop(id, btn) {
    var pop = document.createElement('div');
    pop.className = 'th-date-pop';
    pop.innerHTML =
      '<div class="th-cal-header">' +
      '<button type="button" class="th-nav" data-dir="-1" aria-label="เดือนก่อนหน้า">‹</button>' +
      '<div class="th-cal-title">' +
      '<span class="th-cal-month"></span>' +
      '<span class="th-cal-year"></span>' +
      '</div>' +
      '<button type="button" class="th-nav" data-dir="1" aria-label="เดือนถัดไป">›</button>' +
      '</div>' +
      '<div class="th-cal-picks">' +
      '<select class="th-month" aria-label="เดือน"></select>' +
      '<select class="th-year" aria-label="ปี พ.ศ."></select>' +
      '</div>' +
      '<div class="th-weekdays">' +
      WEEKDAYS.map(function (w, i) {
        var cls = i === 0 ? ' sun' : (i === 6 ? ' sat' : '');
        return '<span class="' + cls.trim() + '">' + w + '</span>';
      }).join('') +
      '</div>' +
      '<div class="th-days"></div>' +
      '<div class="th-date-foot">' +
      '<button type="button" class="btn ghost th-clear">ล้าง</button>' +
      '<button type="button" class="btn th-today">วันนี้</button>' +
      '</div>';
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
    for (var y = now.getFullYear() - 10; y <= now.getFullYear() + 15; y++) {
      var opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = 'พ.ศ. ' + be(y);
      yearSel.appendChild(opt);
    }

    function syncViewFromHidden() {
      var cur = parseIsoDate(getValue(id)) || { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
      viewY = cur.y;
      viewM = cur.m;
      selected = getValue(id);
      monthSel.value = String(viewM);
      yearSel.value = String(viewY);
      updateHeaderTitle(pop, viewY, viewM);
      renderDays();
    }

    function renderDays() {
      daysEl.innerHTML = '';
      var first = new Date(viewY, viewM - 1, 1).getDay();
      var total = daysInMonth(viewY, viewM);
      var todayIso = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());

      for (var i = 0; i < first; i++) {
        var blank = document.createElement('span');
        blank.className = 'th-day blank';
        daysEl.appendChild(blank);
      }
      for (var d = 1; d <= total; d++) {
        var iso = toIsoDate(viewY, viewM, d);
        var dow = new Date(viewY, viewM - 1, d).getDay();
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'th-day';
        if (dow === 0) cell.classList.add('sun');
        if (dow === 6) cell.classList.add('sat');
        cell.textContent = String(d);
        if (iso === selected) cell.classList.add('selected');
        if (iso === todayIso) cell.classList.add('today');
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
        updateHeaderTitle(pop, viewY, viewM);
        renderDays();
      };
    });
    monthSel.onchange = function () {
      viewM = Number(monthSel.value);
      updateHeaderTitle(pop, viewY, viewM);
      renderDays();
    };
    yearSel.onchange = function () {
      viewY = Number(yearSel.value);
      updateHeaderTitle(pop, viewY, viewM);
      renderDays();
    };
    pop.querySelector('.th-today').onclick = function () {
      setHiddenValue(id, toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate()));
      closePop();
    };
    pop.querySelector('.th-clear').onclick = function () {
      setHiddenValue(id, '');
      closePop();
    };

    pop.onclick = function (e) { e.stopPropagation(); };
    btn.onclick = function (e) {
      e.preventDefault();
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
      '<div class="th-cal-header th-month-header">' +
      '<div class="th-cal-title">' +
      '<span class="th-cal-month">เลือกเดือน</span>' +
      '<span class="th-cal-year">พ.ศ.</span>' +
      '</div>' +
      '</div>' +
      '<div class="th-month-grid"></div>' +
      '<div class="th-cal-picks th-month-picks">' +
      '<select class="th-year" aria-label="ปี พ.ศ."></select>' +
      '</div>' +
      '<div class="th-date-foot"><button type="button" class="btn th-apply">ตกลง</button></div>';
    btn.parentElement.appendChild(pop);

    var monthGrid = pop.querySelector('.th-month-grid');
    var yearSel = pop.querySelector('.th-year');
    var now = new Date();
    var pickM = now.getMonth() + 1;

    MONTHS_SHORT.slice(1).forEach(function (name, i) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'th-month-cell';
      cell.textContent = name;
      cell.dataset.m = String(i + 1);
      cell.onclick = function () {
        pickM = i + 1;
        monthGrid.querySelectorAll('.th-month-cell').forEach(function (c) { c.classList.remove('selected'); });
        cell.classList.add('selected');
        updateMonthHeader();
      };
      monthGrid.appendChild(cell);
    });

    for (var y = now.getFullYear() - 5; y <= now.getFullYear() + 3; y++) {
      var o = document.createElement('option');
      o.value = String(y);
      o.textContent = 'พ.ศ. ' + be(y);
      yearSel.appendChild(o);
    }

    function updateMonthHeader() {
      pop.querySelector('.th-cal-month').textContent = MONTHS[pickM];
      pop.querySelector('.th-cal-year').textContent = 'พ.ศ. ' + be(Number(yearSel.value));
    }

    function syncFromHidden() {
      var val = getValue(id);
      var p = val ? val.split('-') : [String(now.getFullYear()), pad2(now.getMonth() + 1)];
      yearSel.value = p[0];
      pickM = Number(p[1]);
      monthGrid.querySelectorAll('.th-month-cell').forEach(function (c) {
        c.classList.toggle('selected', Number(c.dataset.m) === pickM);
      });
      updateMonthHeader();
    }

    yearSel.onchange = updateMonthHeader;

    pop.onclick = function (e) { e.stopPropagation(); };
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (openPop && openPop !== pop) closePop();
      syncFromHidden();
      pop.classList.toggle('open');
      openPop = pop.classList.contains('open') ? pop : null;
    };

    pop.querySelector('.th-apply').onclick = function () {
      setHiddenValue(id, yearSel.value + '-' + pad2(pickM));
      closePop();
    };

    return pop;
  }

  function initDateField(id) {
    var hidden = document.getElementById(id);
    if (!hidden) return;
    hidden.removeAttribute('type');
    hidden.type = 'hidden';
    hidden.setAttribute('autocomplete', 'off');
    hidden.dataset.kind = 'date';
    if (hidden.dataset.thInit === '1') {
      setHiddenValue(id, hidden.value);
      return;
    }
    hidden.dataset.thInit = '1';

    var wrap = hidden.closest('.th-date-field') || hidden.parentElement;
    wrap.classList.add('th-date-field');
    var btn = wrap.querySelector('.th-date-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'th-date-btn';
      hidden.parentElement.insertBefore(btn, hidden.nextSibling);
    }
    btn.dataset.for = id;
    btn.innerHTML = '<span class="th-date-icon" aria-hidden="true"></span><span class="th-date-text">' + formatDateBtn(hidden.value) + '</span>';
    buildDatePop(id, btn);
  }

  function initMonthField(id) {
    var hidden = document.getElementById(id);
    if (!hidden) return;
    hidden.removeAttribute('type');
    hidden.type = 'hidden';
    hidden.setAttribute('autocomplete', 'off');
    hidden.dataset.kind = 'month';
    if (hidden.dataset.thInit === '1') {
      setHiddenValue(id, hidden.value);
      return;
    }
    hidden.dataset.thInit = '1';

    var wrap = hidden.closest('.th-date-field') || hidden.parentElement;
    wrap.classList.add('th-date-field');
    var btn = wrap.querySelector('.th-date-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'th-date-btn';
      hidden.parentElement.insertBefore(btn, hidden.nextSibling);
    }
    btn.dataset.for = id;
    btn.innerHTML = '<span class="th-date-icon" aria-hidden="true"></span><span class="th-date-text">' + formatMonthLong(hidden.value) + '</span>';
    buildMonthPop(id, btn);
  }

  function initAll() {
    ['rcDate', 'rcExpiry', 'wdDate'].forEach(initDateField);
    initMonthField('rpMonth');
  }

  document.addEventListener('click', function () { closePop(); });

  return {
    initAll: initAll,
    set: setHiddenValue,
    get: getValue,
    formatDateLong: formatDateLong,
    formatMonthLong: formatMonthLong
  };
})();
