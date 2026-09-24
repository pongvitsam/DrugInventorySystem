/**
 * ความชื้น / อุณหภูมิห้อง — บันทึกวันละ 2 รอบ (08:30, 16:00) + กราฟ + PDF
 */
var ClimateUI = (function () {
  var CHART_ = null;
  var MODE_ = 'day';
  var LAST_REPORT_ = null;

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function isoAddDays_(iso, days) {
    var dt = new Date((iso || todayIso()) + 'T12:00:00+07:00');
    dt.setDate(dt.getDate() + days);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }

  function selectedEntryDate_() {
    return (typeof ThDate !== 'undefined' && ThDate.get('clEntryDate')) || todayIso();
  }

  function formatShortDate_(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso || '';
    return Number(p[2]) + '/' + Number(p[1]) + '/' + (Number(p[0]) + 543);
  }

  function formatLongDate_(iso) {
    if (typeof ThDate !== 'undefined' && ThDate.formatDateBtn) {
      var label = ThDate.formatDateBtn(iso);
      if (label && label !== 'เลือกวันที่') return label;
    }
    return formatShortDate_(iso);
  }

  function setEntryDate_(iso) {
    if (typeof ThDate !== 'undefined' && ThDate.set) ThDate.set('clEntryDate', iso, true);
    loadTodaySlots();
  }

  function shiftDate(delta) {
    var next = isoAddDays_(selectedEntryDate_(), delta);
    if (next > todayIso()) next = todayIso();
    setEntryDate_(next);
  }

  function jumpToday() {
    setEntryDate_(todayIso());
  }

  function updateBackdateUi_(date) {
    date = date || selectedEntryDate_();
    var today = todayIso();
    var hint = document.getElementById('clBackdateHint');
    var nextBtn = document.getElementById('clDateNext');
    if (nextBtn) nextBtn.disabled = date >= today;
    if (!hint) return;
    if (date && date > today) {
      hint.className = 'cl-backdate-banner';
      hint.removeAttribute('style');
      hint.textContent = 'บันทึกวันล่วงหน้าไม่ได้ — เลือกวันนี้หรือวันที่ย้อนหลัง';
    } else if (date && date < today) {
      hint.className = 'cl-backdate-banner';
      hint.removeAttribute('style');
      hint.innerHTML = '<b>กำลังบันทึกย้อนหลัง</b> · ' + esc(formatLongDate_(date)) +
        ' — กรอกอุณหภูมิ/ความชื้น แล้วกดบันทึกได้ตามปกติ';
    } else {
      hint.className = 'muted';
      hint.removeAttribute('style');
      hint.textContent = 'ลืมลงวันก่อนหน้า — กด «วันก่อน» หรือเลือกวันที่จากปฏิทิน แล้วบันทึกได้เลย';
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function moneyNum(n) {
    if (n == null || isNaN(n)) return '—';
    return String(Math.round(Number(n) * 10) / 10);
  }

  function setMode(mode) {
    MODE_ = mode === 'month' || mode === 'year' ? mode : 'day';
    document.querySelectorAll('#clModeChips .chip').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-cl') === MODE_);
    });
    var dayW = document.getElementById('clDayWrap');
    var monW = document.getElementById('clMonthWrap');
    var yearW = document.getElementById('clYearWrap');
    if (dayW) dayW.style.display = MODE_ === 'day' ? '' : 'none';
    if (monW) monW.style.display = MODE_ === 'month' ? '' : 'none';
    if (yearW) yearW.style.display = MODE_ === 'year' ? '' : 'none';
    loadReport();
  }

  function currentMonthIso_() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  function selectedExportMonth_() {
    return (typeof ThDate !== 'undefined' && ThDate.get('clExportMonth')) ||
      (typeof ThDate !== 'undefined' && ThDate.get('clMonth')) ||
      currentMonthIso_();
  }

  function syncExportMonth_(iso) {
    iso = iso || selectedExportMonth_();
    if (typeof ThDate === 'undefined' || !ThDate.set) return iso;
    if (ThDate.get('clExportMonth') !== iso) ThDate.set('clExportMonth', iso, true);
    if (ThDate.get('clMonth') !== iso) ThDate.set('clMonth', iso, true);
    return iso;
  }

  function initPage() {
    if (typeof ThDate !== 'undefined') {
      if (ThDate.initDateField) {
        ThDate.initDateField('clEntryDate');
        ThDate.initDateField('clDayDate');
      }
      if (ThDate.initMonthField) {
        ThDate.initMonthField('clMonth');
        ThDate.initMonthField('clExportMonth');
      }
      if (!ThDate.get('clEntryDate')) ThDate.set('clEntryDate', todayIso());
      if (!ThDate.get('clDayDate')) ThDate.set('clDayDate', todayIso());
      var mk = currentMonthIso_();
      if (!ThDate.get('clMonth')) ThDate.set('clMonth', mk);
      if (!ThDate.get('clExportMonth')) ThDate.set('clExportMonth', ThDate.get('clMonth') || mk);
      var yEl = document.getElementById('clYear');
      if (yEl && !yEl.value) yEl.value = String(new Date().getFullYear() + 543);
    }
    ['clEntryDate', 'clDayDate', 'clMonth', 'clExportMonth'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el._clBound) return;
      el._clBound = true;
      el.addEventListener('change', function () {
        if (id === 'clEntryDate') {
          loadTodaySlots();
          return;
        }
        if (id === 'clExportMonth') {
          syncExportMonth_(ThDate.get('clExportMonth'));
          loadMonthPreview_();
          return;
        }
        if (id === 'clMonth') {
          syncExportMonth_(ThDate.get('clMonth'));
        }
        loadReport();
      });
    });
    var yEl2 = document.getElementById('clYear');
    if (yEl2 && !yEl2._clBound) {
      yEl2._clBound = true;
      yEl2.addEventListener('change', loadReport);
    }
    loadTodaySlots();
    setMode(MODE_ || 'day');
    // ตัวอย่าง PDF โหลดเมื่อเลือกเดือนส่งออกหรือกดพิมพ์ — ไม่ยิง climateReport ซ้ำตอนเปิดหน้า
  }

  function refreshPage() {
    loadTodaySlots();
    loadReport();
    if (MODE_ === 'month') loadMonthPreview_();
  }

  function loadTodaySlots() {
    var date = selectedEntryDate_();
    updateBackdateUi_(date);
    var to = todayIso();
    var from = isoAddDays_(to, -45);
    if (date && date < from) from = date;
    // ดึงช่วงเดียวทั้งช่องบันทึก + ตารางล่าสุด (เดิมยิง 2 ครั้ง)
    api('listClimateLogs', { from: from, to: to }).then(function (r) {
      var logs = r.logs || [];
      var am = null;
      var pm = null;
      logs.forEach(function (row) {
        if (toIsoEqual_(row.date, date)) {
          if (row.slot === 'pm') pm = row;
          else am = row;
        }
      });
      fillSlotForm_('am', am);
      fillSlotForm_('pm', pm);
      paintRecentFromLogs_(logs, to);
    }).catch(function (e) {
      if (typeof toast === 'function') toast(e.message || String(e));
    });
  }

  function toIsoEqual_(a, b) {
    return String(a || '').slice(0, 10) === String(b || '').slice(0, 10);
  }

  function fillSlotForm_(slot, row) {
    var t = document.getElementById(slot === 'pm' ? 'clTempPm' : 'clTempAm');
    var h = document.getElementById(slot === 'pm' ? 'clHumPm' : 'clHumAm');
    var st = document.getElementById(slot === 'pm' ? 'clStatusPm' : 'clStatusAm');
    var saveBtn = document.getElementById(slot === 'pm' ? 'clSavePm' : 'clSaveAm');
    var delBtn = document.getElementById(slot === 'pm' ? 'clDelPm' : 'clDelAm');
    if (t) t.value = row ? row.temperature : '';
    if (h) h.value = row ? row.humidity : '';
    if (st) {
      if (row) {
        st.textContent = 'บันทึกแล้ว' + (row.recordedBy ? ' · ' + row.recordedBy : '') + ' · แก้ได้';
        st.className = 'cl-slot-status ok';
      } else {
        st.textContent = (selectedEntryDate_() < todayIso()) ? 'ยังไม่บันทึก · ลงย้อนหลังได้' : 'ยังไม่บันทึก';
        st.className = 'cl-slot-status pending';
      }
    }
    if (saveBtn) saveBtn.textContent = row ? ('แก้ไข ' + (slot === 'pm' ? '16:00' : '08:30')) : ('บันทึก ' + (slot === 'pm' ? '16:00' : '08:30'));
    if (delBtn) delBtn.style.display = row ? '' : 'none';
  }

  function saveSlot(slot) {
    slot = slot === 'pm' ? 'pm' : 'am';
    var date = selectedEntryDate_();
    var today = todayIso();
    if (!date) {
      if (typeof toast === 'function') toast('กรุณาเลือกวันที่');
      return;
    }
    if (date > today) {
      if (typeof toast === 'function') toast('บันทึกวันล่วงหน้าไม่ได้ — เลือกวันนี้หรือวันที่ย้อนหลัง');
      return;
    }
    var tempEl = document.getElementById(slot === 'pm' ? 'clTempPm' : 'clTempAm');
    var humEl = document.getElementById(slot === 'pm' ? 'clHumPm' : 'clHumAm');
    var temperature = tempEl ? tempEl.value : '';
    var humidity = humEl ? humEl.value : '';
    var recordedBy = (typeof Auth !== 'undefined' && Auth.getUsername) ? Auth.getUsername() : '';
    var statusEl = document.getElementById(slot === 'pm' ? 'clStatusPm' : 'clStatusAm');
    var wasEdit = !!(statusEl && statusEl.classList.contains('ok'));
    var saveBtn = document.getElementById(slot === 'pm' ? 'clSavePm' : 'clSaveAm');
    var isBackdate = date < today;
    var preview = {
      temperature: temperature,
      humidity: humidity,
      recordedBy: recordedBy,
      slot: slot
    };
    // แสดงสถานะทันทีตอนกด — ไม่รอ Google
    fillSlotForm_(slot, preview);
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'กำลังบันทึก...';
    }
    api('saveClimateLog', {
      date: date,
      slot: slot,
      temperature: temperature,
      humidity: humidity,
      recordedBy: recordedBy,
      notes: isBackdate ? 'บันทึกย้อนหลัง' : ''
    }).then(function (r) {
      fillSlotForm_(slot, (r && r.log) || preview);
      if (typeof toast === 'function') {
        var slotLabel = slot === 'pm' ? '16:00' : '08:30';
        toast((isBackdate ? 'บันทึกย้อนหลัง ' : (wasEdit ? 'แก้ไข ' : 'บันทึก ')) +
          slotLabel + (isBackdate ? ' · ' + formatShortDate_(date) : '') + ' แล้ว');
      }
      if (typeof refreshAfterMutation === 'function') refreshAfterMutation();
      // กราฟ/ตารางอัปเดตทีหลังครั้งเดียว — ไม่บล็อกปุ่ม
      scheduleClimateRefresh_();
    }).catch(function (e) {
      // ถ้าบันทึกไม่สำเร็จ โหลดสถานะจริงกลับ
      loadTodaySlots();
      if (typeof toast === 'function') toast(e.message || String(e));
    }).then(function () {
      if (saveBtn) saveBtn.disabled = false;
    });
  }

  function scheduleClimateRefresh_() {
    clearTimeout(scheduleClimateRefresh_._t);
    scheduleClimateRefresh_._t = setTimeout(function () {
      loadTodaySlots();
      loadReport();
      if (MODE_ === 'month') loadMonthPreview_();
    }, 350);
  }

  var RECENT_ROWS_ = [];

  function paintRecentFromLogs_(rows, today) {
    var el = document.getElementById('clRecentTable');
    if (!el) return;
    RECENT_ROWS_ = rows || [];
    renderMissingDays_(RECENT_ROWS_, today || todayIso());
    if (!RECENT_ROWS_.length) {
      el.innerHTML = '<tr><td class="muted">ยังไม่มีข้อมูลในช่วงนี้ — เลือกวันที่ย้อนหลังแล้วบันทึกได้เลย</td></tr>';
      return;
    }
    var html = '<tr><th>วันที่</th><th>รอบ</th><th class="right">°C</th><th class="right">%RH</th><th>ผู้บันทึก</th><th></th></tr>';
    html += RECENT_ROWS_.map(function (row, idx) {
      var label = (typeof ThDate !== 'undefined' && ThDate.formatDateLong)
        ? ThDate.formatDateLong(row.date)
        : row.date;
      var back = row.notes && String(row.notes).indexOf('ย้อนหลัง') >= 0;
      return '<tr>' +
        '<td>' + esc(label) + (back ? ' <span class="cl-back-tag">ย้อนหลัง</span>' : '') + '</td>' +
        '<td>' + (row.slot === 'pm' ? '16:00' : '08:30') + '</td>' +
        '<td class="right">' + esc(row.temperature) + '</td>' +
        '<td class="right">' + esc(row.humidity) + '</td>' +
        '<td>' + esc(row.recordedBy || '—') + '</td>' +
        '<td class="cl-row-actions">' +
        '<button type="button" class="btn ghost" style="padding:4px 8px;font-size:12px" data-cl-edit="' + idx + '">แก้ไข</button> ' +
        '<button type="button" class="btn ghost danger" style="padding:4px 8px;font-size:12px" data-cl-del="' + idx + '">ลบ</button>' +
        '</td>' +
        '</tr>';
    }).join('');
    el.innerHTML = html;
    el.querySelectorAll('[data-cl-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(btn.getAttribute('data-cl-edit'));
        if (!isNaN(i) && RECENT_ROWS_[i]) editLog(RECENT_ROWS_[i]);
      });
    });
    el.querySelectorAll('[data-cl-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(btn.getAttribute('data-cl-del'));
        if (!isNaN(i) && RECENT_ROWS_[i]) removeLog(RECENT_ROWS_[i].id);
      });
    });
  }

  function renderRecentTable_() {
    var to = todayIso();
    var selected = selectedEntryDate_();
    var from = isoAddDays_(to, -45);
    if (selected && selected < from) from = selected;
    api('listClimateLogs', { from: from, to: to }).then(function (r) {
      paintRecentFromLogs_(r.logs || [], to);
    }).catch(function () {});
  }

  function renderMissingDays_(rows, today) {
    var wrap = document.getElementById('clMissingWrap');
    var box = document.getElementById('clMissingDays');
    if (!wrap || !box) return;
    var byDay = {};
    (rows || []).forEach(function (row) {
      var d = String(row.date || '').slice(0, 10);
      if (!d) return;
      if (!byDay[d]) byDay[d] = { am: false, pm: false };
      if (row.slot === 'pm') byDay[d].pm = true;
      else byDay[d].am = true;
    });
    var chips = [];
    for (var i = 0; i < 14; i++) {
      var iso = isoAddDays_(today, -i);
      var pair = byDay[iso] || { am: false, pm: false };
      if (pair.am && pair.pm) continue;
      var miss = [];
      if (!pair.am) miss.push('08:30');
      if (!pair.pm) miss.push('16:00');
      chips.push({ date: iso, miss: miss, isToday: iso === today });
    }
    if (!chips.length) {
      wrap.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    wrap.style.display = '';
    box.innerHTML = chips.map(function (c) {
      var when = c.isToday ? 'วันนี้' : formatShortDate_(c.date);
      var gap = c.miss.length === 2 ? 'ขาดทั้งวัน' : ('ขาด ' + c.miss.join(' / '));
      return '<button type="button" class="cl-missing-chip" data-cl-miss="' + esc(c.date) + '">' +
        esc(when) + ' · ' + esc(gap) + '</button>';
    }).join('');
    box.querySelectorAll('[data-cl-miss]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setEntryDate_(btn.getAttribute('data-cl-miss'));
        var card = document.querySelector('#page-climate .cl-slot-grid');
        if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function editLog(row) {
    if (!row) return;
    if (typeof ThDate !== 'undefined' && ThDate.set) {
      ThDate.set('clEntryDate', row.date);
    }
    loadTodaySlots();
    var card = document.querySelector('#page-climate .cl-slot-grid');
    if (card && card.scrollIntoView) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (typeof toast === 'function') {
      toast('โหลดเพื่อแก้ไข ' + (row.slot === 'pm' ? '16:00' : '08:30') + ' แล้ว — แก้ตัวเลขแล้วกดแก้ไข');
    }
  }

  function clearSlot(slot) {
    slot = slot === 'pm' ? 'pm' : 'am';
    var date = selectedEntryDate_();
    api('listClimateLogs', { from: date, to: date }).then(function (r) {
      var found = (r.logs || []).filter(function (row) {
        return row.slot === slot;
      })[0];
      if (!found) {
        fillSlotForm_(slot, null);
        if (typeof toast === 'function') toast('ยังไม่มีข้อมูลรอบนี้');
        return;
      }
      removeLog(found.id);
    }).catch(function (e) {
      if (typeof toast === 'function') toast(e.message || String(e));
    });
  }

  function removeLog(id) {
    if (!id) return;
    if (!confirm('ลบรายการบันทึกนี้หรือไม่?')) return;
    api('deleteClimateLog', { id: id }).then(function () {
      if (typeof toast === 'function') toast('ลบแล้ว');
      if (typeof refreshAfterMutation === 'function') refreshAfterMutation();
      loadTodaySlots();
      scheduleClimateRefresh_();
    }).catch(function (e) {
      if (typeof toast === 'function') toast(e.message || String(e));
    });
  }

  function loadReport() {
    var payload = { mode: MODE_ };
    if (MODE_ === 'month') {
      payload.month = syncExportMonth_() || '';
    } else if (MODE_ === 'year') {
      var be = Number((document.getElementById('clYear') || {}).value || 0);
      payload.year = be > 2400 ? String(be - 543) : String(be || new Date().getFullYear());
    } else {
      payload.date = (typeof ThDate !== 'undefined' && ThDate.get('clDayDate')) || todayIso();
    }
    api('climateReport', payload).then(function (rep) {
      renderStats_(rep.stats);
      ensureChartJs_().then(function () {
        paintChart_(rep);
      }).catch(function () {});
      // กราฟโหมดรายเดือน — sync ตัวอย่างรายงานตารางด้วย (ยังไม่วาดกราฟพิมพ์)
      if (MODE_ === 'month') {
        LAST_REPORT_ = rep;
        renderPrint_(rep, false);
      }
    }).catch(function (e) {
      if (typeof toast === 'function') toast(e.message || String(e));
    });
  }

  function loadMonthPreview_() {
    var month = syncExportMonth_();
    return api('climateReport', { mode: 'month', month: month }).then(function (rep) {
      LAST_REPORT_ = rep;
      renderPrint_(rep, false);
      return rep;
    }).catch(function (e) {
      if (typeof toast === 'function') toast(e.message || String(e));
      return null;
    });
  }

  function renderStats_(st) {
    var el = document.getElementById('clStats');
    if (!el || !st) return;
    el.innerHTML =
      kpiCard_('อุณหภูมิเฉลี่ย', moneyNum(st.avgTemp) + ' °C', 'teal') +
      kpiCard_('อุณหภูมิต่ำ–สูง', moneyNum(st.minTemp) + ' – ' + moneyNum(st.maxTemp) + ' °C', 'sky') +
      kpiCard_('ความชื้นเฉลี่ย', moneyNum(st.avgHum) + ' %RH', 'sand') +
      kpiCard_('จำนวนครั้งที่บันทึก', String(st.count || 0), 'leaf');
  }

  function kpiCard_(label, value, tone) {
    return '<div class="card kpi kpi-' + tone + '"><div class="label">' + esc(label) + '</div><div class="value" style="font-size:20px">' + esc(value) + '</div></div>';
  }

  function paintChart_(rep) {
    var canvas = document.getElementById('clChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (CHART_) {
      try { CHART_.destroy(); } catch (e) { /* ignore */ }
      CHART_ = null;
    }
    var points = rep.points || [];
    var labels = points.map(function (p) { return p.label; });
    var fontFamily = "'Prompt', 'Sarabun', sans-serif";
    var datasets = [];
    var hasAmPm = points.some(function (p) { return p.tempAm != null || p.tempPm != null; });
    if (hasAmPm && MODE_ !== 'year') {
      datasets.push({
        label: 'อุณหภูมิ 08:30 (°C)',
        data: points.map(function (p) { return p.tempAm; }),
        borderColor: '#0a7a66',
        backgroundColor: 'rgba(10,122,102,.12)',
        tension: 0.25,
        yAxisID: 'y',
        spanGaps: true
      });
      datasets.push({
        label: 'อุณหภูมิ 16:00 (°C)',
        data: points.map(function (p) { return p.tempPm; }),
        borderColor: '#1d7a9c',
        backgroundColor: 'rgba(29,122,156,.12)',
        tension: 0.25,
        yAxisID: 'y',
        spanGaps: true
      });
      datasets.push({
        label: 'ความชื้น 08:30 (%RH)',
        data: points.map(function (p) { return p.humAm; }),
        borderColor: '#c47a1a',
        borderDash: [5, 4],
        tension: 0.25,
        yAxisID: 'y1',
        spanGaps: true
      });
      datasets.push({
        label: 'ความชื้น 16:00 (%RH)',
        data: points.map(function (p) { return p.humPm; }),
        borderColor: '#b54708',
        borderDash: [5, 4],
        tension: 0.25,
        yAxisID: 'y1',
        spanGaps: true
      });
    } else {
      datasets.push({
        label: 'อุณหภูมิเฉลี่ย (°C)',
        data: points.map(function (p) { return p.temperature; }),
        borderColor: '#0a7a66',
        backgroundColor: 'rgba(10,122,102,.15)',
        tension: 0.3,
        fill: true,
        yAxisID: 'y',
        spanGaps: true
      });
      datasets.push({
        label: 'ความชื้นเฉลี่ย (%RH)',
        data: points.map(function (p) { return p.humidity; }),
        borderColor: '#c47a1a',
        backgroundColor: 'rgba(196,122,26,.12)',
        tension: 0.3,
        yAxisID: 'y1',
        spanGaps: true
      });
    }
    CHART_ = new Chart(canvas, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { font: { family: fontFamily, size: 12 }, color: '#5a736b' } },
          title: {
            display: true,
            text: rep.title || '',
            font: { family: fontFamily, size: 15, weight: '600' },
            color: '#065649'
          }
        },
        scales: {
          x: { ticks: { font: { family: fontFamily, size: 11 }, color: '#5a736b' }, grid: { display: false } },
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: '°C', font: { family: fontFamily } },
            ticks: { font: { family: fontFamily, size: 11 }, color: '#0a7a66' },
            grid: { color: 'rgba(10,122,102,0.08)' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: '%RH', font: { family: fontFamily } },
            ticks: { font: { family: fontFamily, size: 11 }, color: '#c47a1a' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  function renderPrint_(rep, withChart) {
    var out = document.getElementById('clPrintOut');
    if (!out) return;
    var st = rep.stats || {};
    var logo = rep.logoDataUrl
      ? '<img class="cl-print-logo" src="' + esc(rep.logoDataUrl) + '" alt="">'
      : '<div class="cl-print-logo-ph"></div>';
    var rows = (rep.tableRows || []).map(function (r) {
      if (rep.mode === 'year') {
        return '<tr><td>' + esc(r.label) + '</td><td class="right">' + moneyNum(r.avgTemp) + '</td><td class="right">' + moneyNum(r.avgHum) + '</td><td class="right">' + (r.count || 0) + '</td></tr>';
      }
      return '<tr><td>' + esc(r.label) + '</td>' +
        '<td class="right">' + esc(r.amTemp) + '</td><td class="right">' + esc(r.amHum) + '</td>' +
        '<td class="right">' + esc(r.pmTemp) + '</td><td class="right">' + esc(r.pmHum) + '</td>' +
        '<td class="right">' + moneyNum(r.avgTemp) + '</td><td class="right">' + moneyNum(r.avgHum) + '</td></tr>';
    }).join('');
    var thead = rep.mode === 'year'
      ? '<tr><th>เดือน</th><th class="right">°C เฉลี่ย</th><th class="right">%RH เฉลี่ย</th><th class="right">ครั้ง</th></tr>'
      : '<tr><th>วันที่</th><th class="right">08:30 °C</th><th class="right">08:30 %RH</th><th class="right">16:00 °C</th><th class="right">16:00 %RH</th><th class="right">°C เฉลี่ย</th><th class="right">%RH เฉลี่ย</th></tr>';
    out.innerHTML =
      '<div class="cl-print-head">' + logo +
      '<div><h2>รายงานความชื้น / อุณหภูมิห้อง</h2>' +
      '<p class="cl-print-unit">' + esc(rep.unitName || '') + '</p>' +
      '<p class="cl-print-sub">' + esc(rep.unitSub || '') + '</p>' +
      '<p class="cl-print-period">' + esc(rep.title || '') + '</p></div></div>' +
      '<div class="cl-print-kpis">' +
      '<div><b>' + moneyNum(st.avgTemp) + ' °C</b><span>อุณหภูมิเฉลี่ย</span></div>' +
      '<div><b>' + moneyNum(st.minTemp) + ' – ' + moneyNum(st.maxTemp) + '</b><span>อุณหภูมิต่ำ–สูง</span></div>' +
      '<div><b>' + moneyNum(st.avgHum) + ' %RH</b><span>ความชื้นเฉลี่ย</span></div>' +
      '<div><b>' + (st.count || 0) + '</b><span>จำนวนครั้งที่บันทึก</span></div>' +
      '</div>' +
      '<div class="cl-print-chart-wrap"><canvas id="clPrintChart"></canvas></div>' +
      '<table class="cl-print-table"><thead>' + thead + '</thead><tbody>' +
      (rows || '<tr><td colspan="7" class="muted">ไม่มีข้อมูล</td></tr>') +
      '</tbody></table>' +
      '<p class="cl-print-foot">พิมพ์จากระบบคลังยา · ' + esc(new Date().toLocaleString('th-TH')) + '</p>';

    if (withChart) {
      return ensureChartJs_().then(function () {
        paintPrintChart_(rep);
      }).catch(function () {});
    }
    if (PRINT_CHART_) {
      try { PRINT_CHART_.destroy(); } catch (e) { /* ignore */ }
      PRINT_CHART_ = null;
    }
    return Promise.resolve();
  }

  var PRINT_CHART_ = null;

  function paintPrintChart_(rep) {
    var canvas = document.getElementById('clPrintChart');
    if (!canvas || typeof Chart === 'undefined' || !rep) return;
    if (PRINT_CHART_) {
      try { PRINT_CHART_.destroy(); } catch (e) { /* ignore */ }
      PRINT_CHART_ = null;
    }
    var points = rep.points || [];
    var labels = points.map(function (p) { return p.label; });
    var fontFamily = "'Prompt', 'Sarabun', sans-serif";
    var hasAmPm = points.some(function (p) { return p.tempAm != null || p.tempPm != null; });
    var datasets;
    if (hasAmPm && rep.mode !== 'year') {
      datasets = [
        { label: 'อุณหภูมิ 08:30 (°C)', data: points.map(function (p) { return p.tempAm; }), borderColor: '#0a7a66', backgroundColor: 'rgba(10,122,102,.12)', tension: 0.25, yAxisID: 'y', spanGaps: true },
        { label: 'อุณหภูมิ 16:00 (°C)', data: points.map(function (p) { return p.tempPm; }), borderColor: '#1d7a9c', backgroundColor: 'rgba(29,122,156,.12)', tension: 0.25, yAxisID: 'y', spanGaps: true },
        { label: 'ความชื้น 08:30 (%RH)', data: points.map(function (p) { return p.humAm; }), borderColor: '#c47a1a', borderDash: [5, 4], tension: 0.25, yAxisID: 'y1', spanGaps: true },
        { label: 'ความชื้น 16:00 (%RH)', data: points.map(function (p) { return p.humPm; }), borderColor: '#b54708', borderDash: [5, 4], tension: 0.25, yAxisID: 'y1', spanGaps: true }
      ];
    } else {
      datasets = [
        { label: 'อุณหภูมิเฉลี่ย (°C)', data: points.map(function (p) { return p.temperature; }), borderColor: '#0a7a66', backgroundColor: 'rgba(10,122,102,.15)', tension: 0.3, fill: true, yAxisID: 'y', spanGaps: true },
        { label: 'ความชื้นเฉลี่ย (%RH)', data: points.map(function (p) { return p.humidity; }), borderColor: '#c47a1a', backgroundColor: 'rgba(196,122,26,.12)', tension: 0.3, yAxisID: 'y1', spanGaps: true }
      ];
    }
    PRINT_CHART_ = new Chart(canvas, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { font: { family: fontFamily, size: 11 }, color: '#5a736b' } },
          title: {
            display: true,
            text: rep.title || '',
            font: { family: fontFamily, size: 14, weight: '600' },
            color: '#065649'
          }
        },
        scales: {
          x: { ticks: { font: { family: fontFamily, size: 10 }, color: '#5a736b' }, grid: { display: false } },
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: '°C', font: { family: fontFamily } },
            ticks: { font: { family: fontFamily, size: 10 }, color: '#0a7a66' },
            grid: { color: 'rgba(10,122,102,0.08)' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: '%RH', font: { family: fontFamily } },
            ticks: { font: { family: fontFamily, size: 10 }, color: '#c47a1a' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  function printClimateSheet_() {
    document.documentElement.classList.add('print-climate');
    window.print();
    setTimeout(function () {
      document.documentElement.classList.remove('print-climate');
    }, 500);
  }

  function exportMonthPdf() {
    loadMonthPreview_().then(function (rep) {
      if (!rep) return;
      return renderPrint_(rep, true).then(function () {
        setTimeout(printClimateSheet_, 200);
      });
    });
  }

  /** @deprecated ใช้ exportMonthPdf — คงชื่อเดิมไว้ให้ปุ่มเก่า/แคช */
  function exportPdf() {
    exportMonthPdf();
  }

  return {
    initPage: initPage,
    refreshPage: refreshPage,
    setMode: setMode,
    saveSlot: saveSlot,
    clearSlot: clearSlot,
    loadTodaySlots: loadTodaySlots,
    loadReport: loadReport,
    removeLog: removeLog,
    editLog: editLog,
    shiftDate: shiftDate,
    jumpToday: jumpToday,
    exportPdf: exportPdf,
    exportMonthPdf: exportMonthPdf
  };
})();
