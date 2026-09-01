var ThDate = (function () {
  var MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  var openPop = null;

  function pad2(n) { return ('0' + n).slice(-2); }
  function be(y) { return y + 543; }
  function formatYearDual(ceYear) {
    return 'พ.ศ. ' + be(ceYear) + ' (ค.ศ. ' + ceYear + ')';
  }

  function parseIsoDate(iso) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
  }

  function weekdayIndex(iso) {
    var p = parseIsoDate(iso);
    if (!p) return 0;
    return new Date(p.y, p.m - 1, p.d).getDay();
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
    var dow = WEEKDAYS[new Date(p.y, p.m - 1, p.d).getDay()];
    return 'วัน' + dow + 'ที่ ' + p.d + ' ' + MONTHS[p.m] + ' ' + formatYearDual(p.y);
  }

  function formatDateBtn(iso) {
    var p = parseIsoDate(iso);
    if (!p) return 'เลือกวันที่';
    return p.d + ' ' + MONTHS[p.m] + ' ' + formatYearDual(p.y);
  }

  function formatMonthLong(isoMonth) {
    if (!isoMonth) return 'เลือกเดือน';
    var p = String(isoMonth).split('-');
    if (p.length !== 2) return 'เลือกเดือน';
    return MONTHS[Number(p[1])] + ' ' + formatYearDual(Number(p[0]));
  }

  function closePop() {
    if (openPop) {
      openPop.classList.remove('open');
      openPop = null;
    }
  }

  function positionPop(btn, pop) {
    pop.style.position = 'fixed';
    pop.style.zIndex = '100';
    pop.style.right = 'auto';
    pop.style.bottom = 'auto';
    var r = btn.getBoundingClientRect();
    var width = pop.offsetWidth || 320;
    var height = pop.offsetHeight || 360;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    var top = Math.min(r.bottom + 8, window.innerHeight - height - 8);
    if (top < 8) top = Math.max(8, r.top - height - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function togglePop(btn, pop, syncFn) {
    if (openPop && openPop !== pop) closePop();
    syncFn();
    pop.classList.toggle('open');
    if (pop.classList.contains('open')) {
      positionPop(btn, pop);
      openPop = pop;
    } else {
      openPop = null;
    }
  }

  function fireChange(hidden) {
    if (!hidden) return;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setHiddenValue(id, val, silent) {
    var hidden = document.getElementById(id);
    var newVal = val || '';
    var changed = hidden && hidden.value !== newVal;
    if (hidden) hidden.value = newVal;
    var btn = document.querySelector('.th-date-btn[data-for="' + id + '"]');
    if (btn) {
      var text = btn.querySelector('.th-date-text');
      var label = hidden && hidden.dataset.kind === 'month' ? formatMonthLong(newVal) : formatDateBtn(newVal);
      if (text) text.textContent = label;
      else btn.textContent = label;
    }
    var pop = hidden && hidden.parentElement ? hidden.parentElement.querySelector('.th-date-pop') : null;
    if (pop && pop._updateSelectedPreview) pop._updateSelectedPreview(newVal);
    if (!silent && changed) fireChange(hidden);
  }

  function getValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function updateHeaderTitle(pop, viewY, viewM) {
    var monthEl = pop.querySelector('.th-cal-month');
    var yearEl = pop.querySelector('.th-cal-year');
    if (monthEl) monthEl.textContent = MONTHS[viewM];
    if (yearEl) yearEl.textContent = formatYearDual(viewY);
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
      WEEKDAYS_SHORT.map(function (w, i) {
        var cls = i === 0 ? ' sun' : (i === 6 ? ' sat' : '');
        return '<span class="' + cls.trim() + '" title="' + WEEKDAYS[i] + '">' + w + '</span>';
      }).join('') +
      '</div>' +
      '<div class="th-days"></div>' +
      '<div class="th-cal-selected muted">ยังไม่ได้เลือกวันที่</div>' +
      '<div class="th-date-foot">' +
      '<button type="button" class="btn ghost th-clear">ล้าง</button>' +
      '<button type="button" class="btn th-today">วันนี้</button>' +
      '</div>';
    btn.parentElement.appendChild(pop);

    var viewY, viewM, selected;
    var monthSel = pop.querySelector('.th-month');
    var yearSel = pop.querySelector('.th-year');
    var daysEl = pop.querySelector('.th-days');
    var selectedEl = pop.querySelector('.th-cal-selected');

    pop._updateSelectedPreview = function (iso) {
      selectedEl.textContent = iso ? formatDateLong(iso) : 'ยังไม่ได้เลือกวันที่';
      selectedEl.classList.toggle('has-value', !!iso);
    };

    MONTHS.slice(1).forEach(function (name, i) {
      var o = document.createElement('option');
      o.value = String(i + 1);
      o.textContent = name;
      monthSel.appendChild(o);
    });

    var now = new Date();
    for (var y = now.getFullYear() - 15; y <= now.getFullYear() + 20; y++) {
      var opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = formatYearDual(y);
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
      pop._updateSelectedPreview(selected);
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
        cell.title = formatDateLong(iso);
        if (dow === 0) cell.classList.add('sun');
        if (dow === 6) cell.classList.add('sat');
        cell.innerHTML = '<span class="th-day-num">' + d + '</span>';
        if (iso === selected) cell.classList.add('selected');
        if (iso === todayIso) cell.classList.add('today');
        cell.onclick = function (isoVal) {
          return function () {
            selected = isoVal;
            pop._updateSelectedPreview(isoVal);
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
      var iso = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
      selected = iso;
      pop._updateSelectedPreview(iso);
      setHiddenValue(id, iso);
      closePop();
    };
    pop.querySelector('.th-clear').onclick = function () {
      selected = '';
      pop._updateSelectedPreview('');
      setHiddenValue(id, '');
      closePop();
    };

    pop.onclick = function (e) { e.stopPropagation(); };
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      togglePop(btn, pop, syncViewFromHidden);
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
      '<div class="th-cal-selected muted">ยังไม่ได้เลือกเดือน</div>' +
      '<div class="th-date-foot"><button type="button" class="btn th-apply">ตกลง</button></div>';
    btn.parentElement.appendChild(pop);

    var monthGrid = pop.querySelector('.th-month-grid');
    var yearSel = pop.querySelector('.th-year');
    var selectedEl = pop.querySelector('.th-cal-selected');
    var now = new Date();
    var pickM = now.getMonth() + 1;

    pop._updateSelectedPreview = function (isoMonth) {
      selectedEl.textContent = isoMonth ? formatMonthLong(isoMonth) : 'ยังไม่ได้เลือกเดือน';
      selectedEl.classList.toggle('has-value', !!isoMonth);
    };

    MONTHS.slice(1).forEach(function (name, i) {
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
        pop._updateSelectedPreview(yearSel.value + '-' + pad2(pickM));
      };
      monthGrid.appendChild(cell);
    });

    for (var y = now.getFullYear() - 8; y <= now.getFullYear() + 5; y++) {
      var o = document.createElement('option');
      o.value = String(y);
      o.textContent = formatYearDual(y);
      yearSel.appendChild(o);
    }

    function updateMonthHeader() {
      pop.querySelector('.th-cal-month').textContent = MONTHS[pickM];
      pop.querySelector('.th-cal-year').textContent = formatYearDual(Number(yearSel.value));
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
      pop._updateSelectedPreview(val);
    }

    yearSel.onchange = function () {
      updateMonthHeader();
      pop._updateSelectedPreview(yearSel.value + '-' + pad2(pickM));
    };

    pop.onclick = function (e) { e.stopPropagation(); };
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      togglePop(btn, pop, syncFromHidden);
    };

    pop.querySelector('.th-apply').onclick = function () {
      var val = yearSel.value + '-' + pad2(pickM);
      pop._updateSelectedPreview(val);
      setHiddenValue(id, val);
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
      setHiddenValue(id, hidden.value, true);
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
      setHiddenValue(id, hidden.value, true);
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

  function initFieldsIn(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('input[data-kind="date"][id]').forEach(function (input) {
      initDateField(input.id);
    });
  }

  function fieldHtml(id, value, onchangeAttr, compact) {
    var cls = 'th-date-field' + (compact ? ' th-date-field-inline' : '');
    var btnCls = 'th-date-btn' + (compact ? ' th-date-btn-compact' : '');
    return '<div class="' + cls + '">' +
      '<input id="' + id + '" type="hidden" value="' + (value || '') + '" data-kind="date"' +
      (onchangeAttr ? ' onchange="' + onchangeAttr + '"' : '') + '>' +
      '<button type="button" class="' + btnCls + '" data-for="' + id + '">' +
      '<span class="th-date-icon" aria-hidden="true"></span>' +
      '<span class="th-date-text">' + formatDateBtn(value) + '</span></button></div>';
  }

  function parseDateTime(iso) {
    if (!iso) return null;
    var s = String(iso).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return {
      y: Number(m[1]), m: Number(m[2]), d: Number(m[3]),
      hh: Number(m[4] || 0), mm: Number(m[5] || 0), ss: Number(m[6] || 0)
    };
  }

  function formatTimeShort(iso) {
    var p = parseDateTime(iso);
    if (!p) return '';
    if (!/\d{2}:\d{2}/.test(String(iso))) return '';
    return pad2(p.hh) + ':' + pad2(p.mm) + ' น.';
  }

  function formatDateTimeLong(iso) {
    var p = parseDateTime(iso);
    if (!p) return formatDateLong(iso);
    var dateIso = toIsoDate(p.y, p.m, p.d);
    var time = formatTimeShort(iso);
    return formatDateLong(dateIso) + (time ? ' · ' + time : '');
  }

  function initAll() {
    ['rcDate', 'rcExpiry', 'wdDate', 'rpFrom', 'rpTo'].forEach(initDateField);
    initMonthField('rpMonth');
  }

  document.addEventListener('click', function () { closePop(); });

  return {
    initAll: initAll,
    initDateField: initDateField,
    initMonthField: initMonthField,
    initFieldsIn: initFieldsIn,
    fieldHtml: fieldHtml,
    set: setHiddenValue,
    get: getValue,
    formatDateLong: formatDateLong,
    formatDateBtn: formatDateBtn,
    formatMonthLong: formatMonthLong,
    formatTimeShort: formatTimeShort,
    formatDateTimeLong: formatDateTimeLong
  };
})();
