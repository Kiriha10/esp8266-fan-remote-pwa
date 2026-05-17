(function () {
  'use strict';

  var IP_KEY = 'esp_ip';
  var POLL_INTERVAL = 5000;
  var statusTimer = null;
  var statusData = null;

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
    var opts = { method: method, mode: 'cors' };
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
    api('GET', '/api/status').then(function (data) {
      statusData = data;
      updateStatusBar(data);
      updateRemoteTab(data);
      updateSetupTab(data);
      updateTasksTab(data);
    }).catch(function () {
      showToast('连接失败，请检查IP地址', true);
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
    dom.calLevel.value = d.currentLevel;
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

    dom.netMode.value = d.networkConfigMode;
    dom.netStaSsid.value = d.staSsid || '';
    dom.netApSsid.value = d.apSsid || '';
  }

  function updateTasksTab(d) {
    if (d.taskRunning && d.taskCurrent) {
      dom.btnTaskCancel.style.display = '';
    } else {
      dom.btnTaskCancel.style.display = 'none';
    }
  }

  function updateLogsTab() {
    api('GET', '/api/logs').then(function (d) {
      var html = '';
      for (var i = d.logs.length - 1; i >= 0; i--) {
        var log = d.logs[i];
        html += '<li><span class="log-time">' + log.time + '</span> ' + he(log.message) + '</li>';
      }
      dom.logList.innerHTML = html;
    }).catch(function () {});
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
    dom.btnTaskCancel = $('#btnTaskCancel');

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
        showToast(r.message, !r.ok); refreshStatus();
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
        showToast(r.message, !r.ok); refreshStatus();
      }).catch(function () { showToast('请求失败', true); });
    });

    // Factory reset
    $('#btnReset').addEventListener('click', function () {
      if (!confirm('确定要恢复出厂设置？这将清空所有学习码、挡位和任务链。')) return;
      api('POST', '/api/reset').then(function (r) {
        showToast(r.message, !r.ok); refreshStatus();
      }).catch(function () { showToast('请求失败', true); });
    });

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
        showToast(r.message, !r.ok); refreshStatus();
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
