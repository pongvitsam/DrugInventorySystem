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

  function initPage() {
    if (typeof ThDate !== 'undefined') {
      if (ThDate.initDateField) {
        ThDate.initDateField('clEntryDate');
        ThDate.initDateField('clDayDate');
      }
      if (ThDate.initMonthField) ThDate.initMonthField('clMonth');
      if (!ThDate.get('clEntryDate')) ThDate.set('clEntryDate', todayIso());
      if (!ThDate.get('clDayDate')) ThDate.set('clDayDate', todayIso());
      var now = new Date();
      var mk = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      if (!ThDate.get('clMonth')) ThDate.set('clMonth', mk);
      var yEl = document.getElementById('clYear');
      if (yEl && !yEl.value) yEl.value = String(now.getFullYear() + 543);
    }
    ['clEntryDate', 'clDayDate', 'clMonth'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el._clBound) return;
      el._clBound = true;
      el.addEventListener('change', function () {
        if (id === 'clEntryDate') loadTodaySlots();
        else loadReport();
      });
    });
    var yEl2 = document.getElementById('clYear');
    if (yEl2 && !yEl2._clBound) {
      yEl2._clBound = true;
      yEl2.addEventListener('change', loadReport);
    }
    loadTodaySlots();
    setMode(MODE_ || 'day');
  }

  function loadTodaySlots() {
    var date = (typeof ThDate !== 'undefined' && ThDate.get('clEntryDate')) || todayIso();
    api('listClimateLogs', { from: date, to: date }).then(function (r) {
      var am = null;
      var pm = null;
      (r.logs || []).forEach(function (row) {
        if (row.slot === 'pm') pm = row;
        else am = row;
      });
      fillSlotForm_('am', am);
      fillSlotForm_('pm', pm);
      renderRecentTable_();
    }).catch(function (e) {
      if (typeof toast === 'function') toast(e.message || String(e));
    });
  }

  function fillSlotForm_(slot, row) {
    var t = document.getElementById(slot === 'pm' ? 'clTempPm' : 'clTempAm');
    var h = document.getElementById(slot === 'pm' ? 'clHumPm' : 'clHumAm');
    var st = document.getElementById(slot === 'pm' ? 'clStatusPm' : 'clStatusAm');
    if (t) t.value = row ? row.temperature : '';
    if (h) h.value = row ? row.humidity : '';
    if (st) {
      if (row) {
        st.textContent = 'บันทึกแล้ว' + (row.recordedBy ? ' · ' + row.recordedBy : '');
        st.className = 'cl-slot-status ok';
      } else {
        st.textContent = 'ยังไม่บันทึก';
        st.className = 'cl-slot-status pending';
      }
    }
  }

  function saveSlot(slot) {
    slot = slot === 'pm' ? 'pm' : 'am';
    var date = (typeof ThDate !== 'undefined' && ThDate.get('clEntryDate')) || todayIso();
    var tempEl = document.getElementById(slot === 'pm' ? 'clTempPm' : 'clTempAm');
    var humEl = document.getElementById(slot === 'pm' ? 'clHumPm' : 'clHumAm');
    var temperature = tempEl ? tempEl.value : '';
    var humidity = humEl ? humEl.value : '';
    var recordedBy = (typeof Auth !== 'undefined' && Auth.getUsername) ? Auth.getUsername() : '';
    api('saveClimateLog', {
      date: date,
      slot: slot,
      temperature: temperature,
      humidity: humidity,
      recordedBy: recordedBy
    }).then(function () {
      if (typeof toast === 'function') toast('บันทึก ' + (slot === 'pm' ? '16:00' : '08:30') + ' แล้ว');
      if (typeof refreshAfterMutation === 'function') refreshAfterMutation();
      loadTodaySlots();
      loadReport();
    }).catch(function (e) {
      if (typeof toast === 'function') toast(e.message || String(e));
    });
  }

  function renderRecentTable_() {
    var el = document.getElementById('clRecentTable');
    if (!el) return;
    var to = todayIso();
    var fromDt = new Date(to + 'T12:00:00+07:00');
    fromDt.setDate(fromDt.getDate() - 30);
    var from = fromDt.getFullYear() + '-' + String(fromDt.getMonth() + 1).padStart(2, '0') + '-' + String(fromDt.getDate()).padStart(2, '0');
    api('listClimateLogs', { from: from, to: to }).then(function (r) {
      var rows = r.logs || [];
      if (!rows.length) {
        el.innerHTML = '<tr><td class="muted">ยังไม่มีข้อมูล 30 วันล่าสุด</td></tr>';
        return;
      }
      var html = '<tr><th>วันที่</th><th>รอบ</th><th class="right">°C</th><th class="right">%RH</th><th>ผู้บันทึก</th><th></th></tr>';
      html += rows.map(function (row) {
        var label = (typeof ThDate !== 'undefined' && ThDate.formatDateLong)
          ? ThDate.formatDateLong(row.date)
          : row.date;
        return '<tr>' +
          '<td>' + esc(label) + '</td>' +
          '<td>' + (row.slot === 'pm' ? '16:00' : '08:30') + '</td>' +
          '<td class="right">' + esc(row.temperature) + '</td>' +
          '<td class="right">' + esc(row.humidity) + '</td>' +
          '<td>' + esc(row.recordedBy || '—') + '</td>' +
          '<td><button type="button" class="btn ghost danger" style="padding:4px 8px;font-size:12px" onclick="ClimateUI.removeLog(\'' + esc(row.id) + '\')">ลบ</button></td>' +
          '</tr>';
      }).join('');
      el.innerHTML = html;
    }).catch(function () {});
  }

  function removeLog(id) {
    if (!confirm('ลบรายการบันทึกนี้หรือไม่?')) return;
    api('deleteClimateLog', { id: id }).then(function () {
      if (typeof toast === 'function') toast('ลบแล้ว');
      if (typeof refreshAfterMutation === 'function') refreshAfterMutation();
      loadTodaySlots();
      loadReport();
    }).catch(function (e) {
      if (typeof toast === 'function') toast(e.message || String(e));
    });
  }

  function loadReport() {
    var payload = { mode: MODE_ };
    if (MODE_ === 'month') {
      payload.month = (typeof ThDate !== 'undefined' && ThDate.get('clMonth')) || '';
    } else if (MODE_ === 'year') {
      var be = Number((document.getElementById('clYear') || {}).value || 0);
      payload.year = be > 2400 ? String(be - 543) : String(be || new Date().getFullYear());
    } else {
      payload.date = (typeof ThDate !== 'undefined' && ThDate.get('clDayDate')) || todayIso();
    }
    api('climateReport', payload).then(function (rep) {
      LAST_REPORT_ = rep;
      renderStats_(rep.stats);
      renderPrint_(rep);
      ensureChartJs_().then(function () {
        paintChart_(rep);
      }).catch(function () {});
    }).catch(function (e) {
      if (typeof toast === 'function') toast(e.message || String(e));
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

  function renderPrint_(rep) {
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

    // Clone chart into print canvas after a tick
    setTimeout(function () {
      var src = document.getElementById('clChart');
      var dest = document.getElementById('clPrintChart');
      if (!src || !dest || !CHART_) return;
      try {
        dest.width = src.width;
        dest.height = src.height;
        var ctx = dest.getContext('2d');
        ctx.drawImage(src, 0, 0);
      } catch (e) { /* ignore */ }
    }, 200);
  }

  function exportPdf() {
    if (!LAST_REPORT_) {
      loadReport();
      setTimeout(exportPdf, 600);
      return;
    }
    document.documentElement.classList.add('print-climate');
    window.print();
    setTimeout(function () {
      document.documentElement.classList.remove('print-climate');
    }, 500);
  }

  return {
    initPage: initPage,
    setMode: setMode,
    saveSlot: saveSlot,
    loadTodaySlots: loadTodaySlots,
    loadReport: loadReport,
    removeLog: removeLog,
    exportPdf: exportPdf
  };
})();
