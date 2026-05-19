(function () {
  'use strict';

  var IP_KEY = 'esp_ip';
  var POLL_INTERVAL = 5000;
  var statusTimer = null;
  var statusData = null;
  var firstLoad = true;

  var dom = {};

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function getBaseUrl() {
    var ip = localStorage.getItem(IP_KEY);
    if (!ip) { showIpModal(); return ''; }
    return ip;
  }

  function api(method, path, bodyObj) {
    var ip = getBaseUrl();
    if (!ip) return Promise.reject(new Error('no ip'));
    var url = 'http://' + ip + path;
    var opts = { method: method };
    if (method === 'POST' && bodyObj) {
      opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      opts.body = new URLSearchParams(bodyObj).toString();
    }
    return fetch(url, opts).then(function (r) { return r.json(); });
  }

  function showToast(msg, isErr) {
    var t = dom.toast;
    t.textContent = msg;
    t.className = 'toast ' + (isErr ? 'error' : '');
    clearTimeout(t._t); t._t = setTimeout(function () { t.className = 'toast hidden'; }, 3000);
  }

  function showIpModal() {
    dom.ipModal.classList.remove('hidden');
    dom.ipInput.value = localStorage.getItem(IP_KEY) || '192.168.4.1';
    dom.ipInput.focus();
  }

  function refreshStatus() {
    return api('GET', '/api/status').then(function (data) {
      statusData = data;
      updateStatusBar(data);
      updateRemoteTab(data);
      updateSetupTab(data);
      updateTasksTab(data);
      if (firstLoad) {
        firstLoad = false;
        populateFormFields(data);
      }
      return data;
    }).catch(function (err) {
      var msg = err && err.message ? err.message : String(err);
      if (msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('NetworkError') !== -1) {
        showToast('无法连接 ' + (getBaseUrl() || '未知IP') + '，请确认手机连接了ESP热点且固件已更新', true);
      } else {
        showToast('请求失败: ' + msg, true);
      }
    });
  }

  function startPolling() {
    clearInterval(statusTimer);
    statusTimer = setInterval(refreshStatus, POLL_INTERVAL);
    refreshStatus();
  }

  function updateStatusBar(d) {
    dom.sbNetwork.textContent = d.networkMode;
    dom.sbIp.textContent = d.ip;
    dom.sbTime.textContent = d.timeText;
    dom.sbLevel.textContent = '挡位: ' + d.currentLevel;
    dom.sbPower.textContent = d.powerStateLabel;
    if (d.powerState === 'on') dom.sbPower.style.color = '#34c759';
    else if (d.powerState === 'off') dom.sbPower.style.color = '#ff3b30';
    else dom.sbPower.style.color = '#8e8e93';

    var taskInfo = '任务: ';
    if (d.taskRunning) {
      taskInfo += '运行中 第' + d.taskStepIndex + '/' + d.taskStepCount + '步';
      if (d.taskRemainingSeconds > 0) taskInfo += ' (' + formatSeconds(d.taskRemainingSeconds) + ')';
    } else {
      taskInfo += '空闲';
    }
    dom.sbTask.textContent = taskInfo;
    dom.sbMessage.textContent = d.lastMessage;
  }

  function formatSeconds(s) {
    if (s < 60) return s + '秒';
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m + '分' + (sec > 0 ? sec + '秒' : '');
  }

  function updateRemoteTab(d) {
    dom.remoteLevel.textContent = d.currentLevel;
    var pct = Math.round((d.currentLevel - 1) / (d.maxLevel - 1) * 100);
    dom.levelBar.style.width = pct + '%';
  }

  function updateSetupTab(d) {
    var html = '';
    for (var i = 0; i < d.codes.length; i++) {
      var c = d.codes[i];
      html += '<tr>';
      html += '<td>' + c.label + '</td>';
      html += '<td>' + (c.learned ? '&#10003;' : '&#10007;') + '</td>';
      html += '<td class="code-cell">' + c.code + '</td>';
      html += '<td><button class="btn btn-sm" data-learn="' + c.id + '">学习</button>&nbsp;';
      html += '<button class="btn btn-sm" data-send="' + c.id + '">发送</button></td>';
      html += '</tr>';
    }
    dom.codeTableBody.innerHTML = html;
  }

  function populateFormFields(d) {
    dom.calLevel.value = d.currentLevel;
    dom.netMode.value = d.networkConfigMode;
    dom.netStaSsid.value = d.staSsid || '';
    dom.netApSsid.value = d.apSsid || '';
    if (d.clockTask) {
      dom.ctEnabled.checked = d.clockTask.enabled;
      dom.ctOnce.checked = d.clockTask.once;
    }
  }

  function updateTasksTab(d) {
    if (d.taskRunning && d.taskCurrent) {
      dom.btnTaskCancel.style.display = '';
      dom.taskStatusCard.style.display = '';

      var tc = d.taskCurrent;
      var tn = d.taskNext;
      var html = '';

      html += '<div class="task-now-step">';
      html += '<div class="task-now-head">当前步骤 ' + tc.index + '/' + d.taskStepCount + '</div>';
      html += '<div class="task-now-action">动作: <strong>' + tc.label + '</strong>';
      if (tc.needsTarget) html += ' &rarr; 目标挡位 <strong>' + tc.targetLevel + ' 挡</strong>';
      html += '</div>';
      if (tc.waitMinutes > 0) {
        html += '<div class="task-now-wait">等待 ' + tc.waitMinutes + ' 分钟';
        if (tc.remainingSeconds > 0) html += ' (剩余约 ' + formatSeconds(tc.remainingSeconds) + ')';
        html += '</div>';
      } else {
        html += '<div class="task-now-wait">无需等待，立即执行</div>';
      }
      html += '</div>';

      if (tn) {
        html += '<div class="task-next-step">';
        html += '<span class="task-next-head">下一步 ' + tn.index + ':</span> ';
        html += '<strong>' + tn.label + '</strong>';
        if (tn.needsTarget) html += ' &rarr; ' + tn.targetLevel + ' 挡';
        if (tn.waitMinutes > 0) html += ' (等待 ' + tn.waitMinutes + ' 分钟)';
        html += '</div>';
      } else {
        html += '<div class="task-last-step">&#10003; 这是最后一步</div>';
      }

      dom.taskStatusContent.innerHTML = html;
    } else {
      dom.btnTaskCancel.style.display = 'none';
      dom.taskStatusCard.style.display = 'none';
      dom.taskStatusContent.innerHTML = '';
    }

    // Clock task schedule display
    renderClockTaskInfo(d);
  }

  function renderClockTaskInfo(d) {
    var html = '';
    if (!d.clockTask) {
      html = '<div class="clock-task-row" style="color:var(--text-secondary)">暂无配置</div>';
    } else {
      var ct = d.clockTask;
      if (!d.timeSynced) {
        html += '<div class="clock-task-row" style="color:#ff9f0a">未同步时间 — 连接 WiFi 后可同步</div>';
      }
      if (!ct.enabled) {
        html += '<div class="clock-task-row" style="color:var(--text-secondary)">已停用</div>';
      } else if (ct.count === 0) {
        html += '<div class="clock-task-row" style="color:var(--text-secondary)">已启用，但未添加步骤</div>';
      }
      if (ct.steps && ct.steps.length > 0) {
        html += '<div class="clock-task-row" style="margin-top:2px;color:var(--text-secondary);font-size:0.75rem">' +
          (ct.enabled && d.timeSynced ? '已启用' : '') +
          (ct.once ? ' · 仅执行一次' : ' · 每日重复') +
          ' · ' + ct.steps.length + ' 个步骤</div>';
        for (var i = 0; i < ct.steps.length; i++) {
          var s = ct.steps[i];
          var hh = ('0' + s.hour).slice(-2);
          var mm = ('0' + s.minute).slice(-2);
          html += '<div class="clock-task-row">';
          html += '<span class="clock-task-time">' + hh + ':' + mm + '</span>';
          html += '<span class="clock-task-label">' + s.label;
          if (s.needsTarget) html += ' &rarr; ' + s.targetLevel + ' 挡';
          html += '</span>';
          html += '</div>';
        }
      }
    }
    dom.clockTaskInfo.innerHTML = html;
  }

  function updateLogsTab() {
    api('GET', '/api/logs').then(function (d) {
      var html = '';
      for (var i = d.logs.length - 1; i >= 0; i--) {
        var log = d.logs[i];
        html += '<li><span class="log-time">' + log.time + '</span> ' + he(log.message) + '</li>';
      }
      dom.logList.innerHTML = html;
    }).catch(function (err) {
      dom.logList.innerHTML = '<li style="color:var(--danger)">加载失败: ' + ((err && err.message) || '无法连接') + '</li>';
    });
  }

  function he(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function sendAction(action) {
    api('POST', '/api/send', { action: action }).then(function (r) {
      showToast(r.message, !r.ok);
      refreshStatus();
    }).catch(function () { showToast('请求失败', true); });
  }

  function makeTaskStepRow(index, stepData, prefix) {
    var actions = [
      ['up', '升一挡'], ['down', '降一挡'], ['set', '设为目标挡位'],
      ['power', '开关'], ['powerOn', '开机'], ['powerOff', '关机'],
      ['oscillate', '摇头'], ['mode', '模式']
    ];
    var actionOpts = actions.map(function (a) {
      return '<option value="' + a[0] + '"' + (stepData && stepData.action === a[0] ? ' selected' : '') + '>' + a[1] + '</option>';
    }).join('');

    var waitName = prefix === 'h' ? '分钟' : '分钟';
    var timeLabel = prefix === 'h' ? '时:分' : '等待分钟';

    return '<div class="task-step" data-index="' + index + '">' +
      '<span class="step-num">' + (index + 1) + '</span>' +
      (prefix === 'h'
        ? '<input class="input" name="' + prefix + 'hour' + index + '" type="number" min="0" max="23" value="' + (stepData ? stepData.hour : 0) + '" style="width:45px">:<input class="input" name="' + prefix + 'minute' + index + '" type="number" min="0" max="59" value="' + (stepData ? stepData.minute : 0) + '" style="width:45px">'
        : '<input class="input" name="' + prefix + 'wait' + index + '" type="number" min="0" max="1440" value="' + (stepData ? stepData.waitMinutes : 0) + '" style="width:55px">&nbsp;' + waitName) +
      ' <select class="input task-action-sel" name="' + prefix + 'action' + index + '">' + actionOpts + '</select>' +
      ' <input class="input task-target" name="' + prefix + 'target' + index + '" type="number" min="1" max="12" value="' + (stepData ? stepData.targetLevel : 1) + '" style="width:45px;' + (stepData && stepData.needsTarget ? '' : 'display:none') + '">' +
      ' <button class="btn btn-sm btn-remove-step">&times;</button>' +
      '</div>';
  }

  function init() {
    dom.statusBar = $('#statusBar');
    dom.sbNetwork = $('#sbNetwork');
    dom.sbIp = $('#sbIp');
    dom.sbTime = $('#sbTime');
    dom.sbLevel = $('#sbLevel');
    dom.sbPower = $('#sbPower');
    dom.sbTask = $('#sbTask');
    dom.sbMessage = $('#sbMessage');
    dom.toast = $('#toast');
    dom.ipModal = $('#ipModal');
    dom.ipInput = $('#ipInput');

    dom.remoteLevel = $('#remoteLevel');
    dom.levelBar = $('#levelBar');
    dom.calLevel = $('#calLevel');
    dom.codeTableBody = $('#codeTableBody');
    dom.netMode = $('#netMode');
    dom.netStaSsid = $('#netStaSsid');
    dom.netStaPassword = $('#netStaPassword');
    dom.netApSsid = $('#netApSsid');
    dom.netApPassword = $('#netApPassword');
    dom.logList = $('#logList');

    dom.taskChainSteps = $('#taskChainSteps');
    dom.clockTaskSteps = $('#clockTaskSteps');
    dom.ctEnabled = $('#ctEnabled');
    dom.ctOnce = $('#ctOnce');
    dom.clockTaskInfo = $('#clockTaskInfo');
    dom.btnTaskCancel = $('#btnTaskCancel');
    dom.taskStatusCard = $('#taskStatusCard');
    dom.taskStatusContent = $('#taskStatusContent');
    dom.btnExportCodes = $('#btnExportCodes');
    dom.btnImportCodes = $('#btnImportCodes');
    dom.importFileInput = $('#importFileInput');

    dom.timerWait = $('#timerWait');
    dom.timerAction = $('#timerAction');
    dom.timerTarget = $('#timerTarget');

    // Tab switching
    $$('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tabId = btn.dataset.tab;
        $$('.tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        $$('.tab-content').forEach(function (s) { s.classList.remove('active'); });
        $('#tab-' + tabId).classList.add('active');
        if (tabId === 'logs') updateLogsTab();
      });
    });

    // Settings gear → IP modal
    $('#btnSettings').addEventListener('click', showIpModal);
    $('#btnIpSave').addEventListener('click', function () {
      var ip = dom.ipInput.value.trim();
      if (!ip) return;
      localStorage.setItem(IP_KEY, ip);
      dom.ipModal.classList.add('hidden');
      startPolling();
    });
    $('#btnIpClose').addEventListener('click', function () { dom.ipModal.classList.add('hidden'); });

    // Remote tab buttons
    $$('#tab-remote [data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () { sendAction(btn.dataset.action); });
    });

    $('#btnCalLevel').addEventListener('click', function () {
      api('POST', '/api/level', { level: dom.calLevel.value }).then(function (r) {
        showToast(r.message, !r.ok); refreshStatus().then(populateFormFields);
      }).catch(function () { showToast('请求失败', true); });
    });

    $('#btnCalPowerOn').addEventListener('click', function () {
      api('POST', '/api/state', { power: 'on' }).then(function (r) {
        showToast(r.message, !r.ok); refreshStatus();
      }).catch(function () { showToast('请求失败', true); });
    });

    $('#btnCalPowerOff').addEventListener('click', function () {
      api('POST', '/api/state', { power: 'off' }).then(function (r) {
        showToast(r.message, !r.ok); refreshStatus();
      }).catch(function () { showToast('请求失败', true); });
    });

    // Setup tab - code table learn/send (delegated)
    $('#tab-setup').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-learn]');
      if (btn) {
        api('POST', '/api/learn', { action: btn.dataset.learn }).then(function (r) {
          showToast(r.message, !r.ok); refreshStatus();
        }).catch(function () { showToast('请求失败', true); });
        return;
      }
      btn = e.target.closest('[data-send]');
      if (btn) {
        api('POST', '/api/send', { action: btn.dataset.send }).then(function (r) {
          showToast(r.message, !r.ok); refreshStatus();
        }).catch(function () { showToast('请求失败', true); });
        return;
      }
    });

    // Network save
    $('#btnNetworkSave').addEventListener('click', function () {
      var body = {
        mode: dom.netMode.value,
        staSsid: dom.netStaSsid.value,
        apSsid: dom.netApSsid.value
      };
      if (dom.netStaPassword.value) body.staPassword = dom.netStaPassword.value;
      if (dom.netApPassword.value) body.apPassword = dom.netApPassword.value;
      api('POST', '/api/network', body).then(function (r) {
        showToast(r.message, !r.ok); refreshStatus().then(populateFormFields);
      }).catch(function () { showToast('请求失败', true); });
    });

    // Factory reset
    $('#btnReset').addEventListener('click', function () {
      if (!confirm('确定要恢复出厂设置？这将清空所有学习码、挡位和任务链。')) return;
      api('POST', '/api/reset').then(function (r) {
        showToast(r.message, !r.ok); refreshStatus().then(populateFormFields);
      }).catch(function () { showToast('请求失败', true); });
    });

    // Export IR codes
    dom.btnExportCodes.addEventListener('click', function () {
      if (!statusData || !statusData.codes) {
        showToast('暂无数据，请先连接设备', true);
        return;
      }
      var exportData = { version: 1, exportedAt: new Date().toISOString(), codes: statusData.codes };
      var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'irfan-codes-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('已导出 ' + statusData.codes.length + ' 组红外码');
    });

    // Import IR codes
    dom.btnImportCodes.addEventListener('click', function () {
      dom.importFileInput.click();
    });
    dom.importFileInput.addEventListener('change', function () {
      var file = dom.importFileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        dom.importFileInput.value = '';
        var text = e.target.result;
        if (!text || text.trim().length === 0) {
          showToast('文件为空，请选择有效的导出文件', true);
          return;
        }
        try {
          var data = JSON.parse(text);
          if (!data || typeof data !== 'object') {
            showToast('导入失败：JSON 内容不是对象', true);
            return;
          }
          if (!data.codes || !Array.isArray(data.codes)) {
            showToast('导入失败：文件中缺少 codes 数组（请选择"导出"生成的 JSON 文件）', true);
            return;
          }
          var learned = data.codes.filter(function (c) { return c.learned; });
          if (learned.length === 0) {
            showToast('文件中没有已学习的红外码', true);
            return;
          }
          importNextCode(learned, 0);
        } catch (err) {
          showToast('解析文件失败: ' + err.message, true);
        }
      };
      reader.onerror = function () {
        dom.importFileInput.value = '';
        showToast('读取文件失败，请重试', true);
      };
      reader.readAsText(file);
    });

    function importNextCode(codes, index) {
      if (index >= codes.length) {
        showToast('已导入 ' + codes.length + ' 组红外码');
        refreshStatus();
        return;
      }
      var c = codes[index];
      var body = {
        action: c.id,
        protocol: c.protocol != null ? c.protocol : 0,
        bits: c.bits != null ? c.bits : 0,
        rawValue: c.rawValue || '0',
        rawLength: c.rawLength != null ? c.rawLength : 0,
        rawData: Array.isArray(c.rawData) ? c.rawData.join(',') : ''
      };
      api('POST', '/api/import', body).then(function (r) {
        showToast(r.message, !r.ok);
        if (r.ok) {
          importNextCode(codes, index + 1);
        }
      }).catch(function () { showToast('导入请求失败', true); });
    }

    // Timer: show/hide target field
    dom.timerAction.addEventListener('change', function () {
      dom.timerTarget.style.display = dom.timerAction.value === 'set' ? '' : 'none';
    });
    // Delegate for dynamically added step selects
    document.addEventListener('change', function (e) {
      if (e.target.classList.contains('task-action-sel')) {
        var row = e.target.closest('.task-step');
        var targetInput = row.querySelector('.task-target');
        if (targetInput) {
          targetInput.style.display = e.target.value === 'set' ? '' : 'none';
        }
      }
    });

    $('#btnTimerStart').addEventListener('click', function () {
      var body = { wait: dom.timerWait.value || 0, action: dom.timerAction.value };
      if (dom.timerAction.value === 'set') body.target = dom.timerTarget.value || 1;
      api('POST', '/api/timer', body).then(function (r) {
        showToast(r.message, !r.ok); refreshStatus();
      }).catch(function () { showToast('请求失败', true); });
    });

    // Task chain
    $('#btnAddStep').addEventListener('click', function () {
      var idx = dom.taskChainSteps.querySelectorAll('.task-step').length;
      if (idx >= 8) { showToast('最多8步', true); return; }
      dom.taskChainSteps.insertAdjacentHTML('beforeend', makeTaskStepRow(idx, null, ''));
    });
    $('#btnTaskChainStart').addEventListener('click', function () {
      var rows = dom.taskChainSteps.querySelectorAll('.task-step');
      if (rows.length === 0) { showToast('请先添加步骤', true); return; }
      var body = { count: rows.length };
      rows.forEach(function (row) {
        var idx = row.dataset.index;
        body['wait' + idx] = row.querySelector('[name="wait' + idx + '"]').value || 0;
        body['action' + idx] = row.querySelector('[name="action' + idx + '"]').value;
        if (row.querySelector('[name="action' + idx + '"]').value === 'set') {
          body['target' + idx] = row.querySelector('[name="target' + idx + '"]').value || 1;
        }
      });
      api('POST', '/api/task/start', body).then(function (r) {
        showToast(r.message, !r.ok); refreshStatus();
      }).catch(function () { showToast('请求失败', true); });
    });
    $('#btnTaskCancel').addEventListener('click', function () {
      api('POST', '/api/task/cancel').then(function (r) {
        showToast(r.message, !r.ok); refreshStatus();
      }).catch(function () { showToast('请求失败', true); });
    });
    // Remove step button (delegated) + reindex
    document.addEventListener('click', function (e) {
      if (e.target.classList.contains('btn-remove-step')) {
        var row = e.target.closest('.task-step');
        if (!row) return;
        var container = row.parentElement;
        if (container === dom.taskChainSteps) {
          row.remove();
          reindexTaskSteps();
        } else if (container === dom.clockTaskSteps) {
          row.remove();
          reindexClockSteps();
        }
      }
    });

    function reindexTaskSteps() {
      var rows = dom.taskChainSteps.querySelectorAll('.task-step');
      var steps = [];
      rows.forEach(function (row) {
        var idx = row.dataset.index;
        steps.push({
          wait: row.querySelector('[name="wait' + idx + '"]').value || 0,
          action: row.querySelector('[name="action' + idx + '"]').value,
          target: row.querySelector('[name="target' + idx + '"]').value || 1
        });
      });
      dom.taskChainSteps.innerHTML = '';
      steps.forEach(function (s, i) {
        dom.taskChainSteps.insertAdjacentHTML('beforeend',
          makeTaskStepRow(i, { waitMinutes: s.wait, action: s.action, targetLevel: s.target, needsTarget: s.action === 'set' }, ''));
      });
    }

    function reindexClockSteps() {
      var rows = dom.clockTaskSteps.querySelectorAll('.task-step');
      var steps = [];
      rows.forEach(function (row) {
        var idx = row.dataset.index;
        steps.push({
          hour: row.querySelector('[name="hhour' + idx + '"]').value || 0,
          minute: row.querySelector('[name="hminute' + idx + '"]').value || 0,
          action: row.querySelector('[name="haction' + idx + '"]').value,
          target: row.querySelector('[name="htarget' + idx + '"]').value || 1
        });
      });
      dom.clockTaskSteps.innerHTML = '';
      steps.forEach(function (s, i) {
        dom.clockTaskSteps.insertAdjacentHTML('beforeend',
          makeTaskStepRow(i, { hour: s.hour, minute: s.minute, action: s.action, targetLevel: s.target, needsTarget: s.action === 'set' }, 'h'));
      });
    }

    // Clock task
    $('#btnAddClockStep').addEventListener('click', function () {
      var idx = dom.clockTaskSteps.querySelectorAll('.task-step').length;
      if (idx >= 8) { showToast('最多8步', true); return; }
      dom.clockTaskSteps.insertAdjacentHTML('beforeend', makeTaskStepRow(idx, null, 'h'));
    });
    $('#btnClockTaskSave').addEventListener('click', function () {
      var rows = dom.clockTaskSteps.querySelectorAll('.task-step');
      var body = {
        enabled: dom.ctEnabled.checked ? '1' : '0',
        once: dom.ctOnce.checked ? '1' : '0',
        count: rows.length
      };
      rows.forEach(function (row) {
        var idx = row.dataset.index;
        body['hour' + idx] = row.querySelector('[name="hhour' + idx + '"]').value || 0;
        body['minute' + idx] = row.querySelector('[name="hminute' + idx + '"]').value || 0;
        body['action' + idx] = row.querySelector('[name="haction' + idx + '"]').value;
        if (row.querySelector('[name="haction' + idx + '"]').value === 'set') {
          body['target' + idx] = row.querySelector('[name="htarget' + idx + '"]').value || 1;
        }
      });
      api('POST', '/api/clock-task', body).then(function (r) {
        showToast(r.message, !r.ok); refreshStatus().then(populateFormFields);
      }).catch(function () { showToast('请求失败', true); });
    });

    // Start
    if (localStorage.getItem(IP_KEY)) {
      startPolling();
    } else {
      showIpModal();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
