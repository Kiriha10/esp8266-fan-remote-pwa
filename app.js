(function () {
  'use strict';

  const IP_KEY = 'esp_ip';
  const MAX_TASK_STEPS = 8;
  const MAX_LEVEL = 12;
  const ACTION_COUNT = 5;
  let currentTab = 'remote';
  let statusTimer;
  let statusData = null;

  const ACTIONS = [
    { id: 'power', label: '开关' },
    { id: 'speedUp', label: '升一档' },
    { id: 'speedDown', label: '降一档' },
    { id: 'oscillate', label: '摇头' },
    { id: 'mode', label: '模式' }
  ];

  const TASK_ACTION_OPTS = [
    { id: 'up', label: '升一档' },
    { id: 'down', label: '降一档' },
    { id: 'set', label: '设为目标挡位' },
    { id: 'powerOn', label: '开机' },
    { id: 'powerOff', label: '关机' },
    { id: 'power', label: '开关' },
    { id: 'oscillate', label: '摇头' },
    { id: 'mode', label: '模式' }
  ];

  function levelOptionsHtml(selected) {
    let html = '';
    for (let i = 1; i <= MAX_LEVEL; i++) {
      html += `<option value="${i}"${i === selected ? ' selected' : ''}>${i}挡</option>`;
    }
    return html;
  }

  function taskActionOptionsHtml(selected) {
    return TASK_ACTION_OPTS.map(o =>
      `<option value="${o.id}"${o.id === selected ? ' selected' : ''}>${o.label}</option>`
    ).join('');
  }

  function taskActionLabel(action) {
    const found = TASK_ACTION_OPTS.find(o => o.id === action);
    return found ? found.label : '未知';
  }

  function getBaseUrl() {
    let ip = localStorage.getItem(IP_KEY);
    if (ip) return ip;
    ip = prompt('请输入 ESP8266 IP 地址 (例如 192.168.4.1)', '192.168.4.1');
    if (ip) {
      localStorage.setItem(IP_KEY, ip);
      return ip;
    }
    return '192.168.4.1';
  }

  async function api(method, path, body) {
    const url = `http://${getBaseUrl()}${path}`;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
  }

  function showMessage(msg, type) {
    const el = document.getElementById('messageToast');
    if (!el) {
      const t = document.createElement('div');
      t.id = 'messageToast';
      t.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100;padding:10px 20px;border-radius:10px;color:#fff;font-size:15px;max-width:90%;text-align:center;transition:opacity 0.3s';
      document.body.appendChild(t);
    }
    const toast = document.getElementById('messageToast');
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.background = type === 'error' ? '#d92d20' : '#097b3c';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  function showError(msg) { showMessage(msg, 'error'); }

  function updateStatusBar(data) {
    statusData = data;
    let html = '网络：' + escHtml(data.networkMode) + ' / ' + escHtml(data.ip);
    html += '\n时间：' + escHtml(data.timeText);
    html += '\n当前挡位：<span class="ok">' + data.currentLevel + '</span> / ' + MAX_LEVEL;
    html += '\n开关状态：' + escHtml(data.powerStateLabel);
    html += '\n任务链：';
    if (data.taskRunning && data.taskCurrent) {
      html += '<span class="ok">运行中</span>，第 ' + data.taskStepIndex + '/' + data.taskStepCount + ' 步，';
      html += escHtml(data.taskCurrent.label) + '，剩余 ' + data.taskRemainingSeconds + ' 秒';
      if (data.taskNext) {
        html += '\n下一步：' + escHtml(data.taskNext.label);
      }
    } else {
      html += '未运行';
    }
    html += '\n学习：';
    if (data.learnActive) {
      html += '<span class="warn">' + escHtml(data.learnAction) + ' 剩余 ' + data.learnRemaining + ' 秒</span>';
    } else {
      html += '未进行';
    }
    html += '\n上次解码：<code>' + escHtml(data.lastDecoded) + '</code>';
    html += '\n消息：' + escHtml(data.lastMessage);
    document.getElementById('statusBar').innerHTML = html;
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  async function refreshStatus() {
    try {
      const data = await api('GET', '/api/status');
      updateStatusBar(data);
      renderCurrentPage(data);
    } catch (e) {
      showError('连接失败，请检查 IP 地址');
    }
  }

  function startPolling() {
    clearInterval(statusTimer);
    statusTimer = setInterval(refreshStatus, 5000);
    refreshStatus();
  }

  function renderCurrentPage(data) {
    switch (currentTab) {
      case 'remote': renderRemote(data); break;
      case 'settings': renderSettings(data); break;
      case 'tasks': renderTasks(data); break;
      case 'logs': renderLogs(); break;
    }
  }

  function renderRemote(data) {
    let html = '<section class="card center"><h2>遥控器</h2>';
    html += `<div class="small">当前记录挡位</div><div class="gear">${data.currentLevel}<span class="small"> / ${MAX_LEVEL}</span></div>`;
    html += `<div class="small">开关状态：${escHtml(data.powerStateLabel)}</div>`;
    html += '<div class="remoteGrid" style="margin-top:14px">';
    html += '<button onclick="window._sendAction(\'power\')">开关</button>';
    html += '<button onclick="window._sendAction(\'mode\')">模式</button>';
    html += '<button onclick="window._sendAction(\'speedDown\')">降一档</button>';
    html += '<button onclick="window._sendAction(\'speedUp\')">升一档</button>';
    html += '<button onclick="window._sendAction(\'oscillate\')">摇头</button>';
    html += '</div></section>';

    html += '<section class="card"><h2>状态校准</h2>';
    html += '<div class="small">风扇没有反馈，任务链里的开机/关机依赖这里的开关状态记录。</div>';
    html += `<form class="inline" onsubmit="event.preventDefault();window._calibrateLevel()"><label>当前真实挡位 <select id="levelSelect">${levelOptionsHtml(data.currentLevel)}</select></label><button type="submit">校准挡位</button></form>`;
    html += `<form class="inline" onsubmit="event.preventDefault();window._calibrateState()"><label>开关状态 <select id="powerSelect"><option value="unknown"${data.powerState === 'unknown' ? ' selected' : ''}>未知</option><option value="on"${data.powerState === 'on' ? ' selected' : ''}>开</option><option value="off"${data.powerState === 'off' ? ' selected' : ''}>关</option></select></label><button type="submit">校准开关</button></form></section>`;

    document.getElementById('tabPage').innerHTML = html;
  }

  function renderSettings(data) {
    let html = '<section class="card"><h2>红外按键</h2>';
    for (let i = 0; i < ACTION_COUNT; i++) {
      const code = data.codes[i];
      html += '<div class="row"><div><b>' + escHtml(ACTIONS[i].label) + '</b> <span class="small">' + escHtml(ACTIONS[i].id) + '</span><br>';
      if (code.learned) {
        html += '<code>' + escHtml(code.code) + '</code>';
      } else {
        html += '<span class="warn">未学习</span>';
      }
      html += '</div><div class="buttons">';
      html += `<button onclick="window._sendAction('${ACTIONS[i].id}')"${!code.learned ? ' disabled' : ''}>发送</button>`;
      html += `<button class="secondary" onclick="window._learnAction('${ACTIONS[i].id}')">学习</button>`;
      html += '</div></div>';
    }
    html += '</section>';

    html += '<section class="card"><h2>联网设置</h2>';
    html += '<form class="inline" onsubmit="event.preventDefault();window._saveNetwork()">';
    html += `<label>模式 <select id="netMode"><option value="staFallback"${data.networkConfigMode === 'staFallback' ? ' selected' : ''}>STA 失败回 AP</option><option value="ap"${data.networkConfigMode === 'ap' ? ' selected' : ''}>仅 AP</option></select></label>`;
    html += `<label>家里 WiFi 名称 <input class="wide" id="staSsid" maxlength="32" value="${escHtml(data.staSsid)}"></label>`;
    html += '<label>家里 WiFi 密码 <input class="wide" id="staPassword" type="password" maxlength="64" placeholder="留空保留旧密码"></label>';
    html += `<label>AP 热点名称 <input class="wide" id="apSsid" maxlength="32" value="${escHtml(data.apSsid)}"></label>`;
    html += '<label>AP 热点密码 <input class="wide" id="apPassword" type="password" maxlength="64" placeholder="留空保留旧密码，非空至少8位"></label>';
    html += '<button type="submit">保存并重新应用网络</button></form></section>';

    html += '<section class="card"><h2>IP 地址设置</h2>';
    html += `<div class="inline"><label>ESP8266 地址 <input id="ipInput" class="wide" value="${escHtml(getBaseUrl())}"></label><button onclick="window._saveIp()">保存</button></div></section>`;

    html += '<section class="card"><button class="danger" onclick="if(confirm(\'确认清空所有学习码和设置？\'))window._resetAll()">清空学习码和设置</button></section>';
    document.getElementById('tabPage').innerHTML = html;
  }

  function renderTasks(data) {
    let html = '<section class="card"><h2>一次性定时</h2>';
    html += '<form class="inline" onsubmit="event.preventDefault();window._startTimer()">';
    html += '<label>等待 <input id="timerWait" type="number" min="0" max="1440" value="30"> 分钟</label>';
    html += `<label>动作 <select id="timerAction">${taskActionOptionsHtml('up')}</select></label>`;
    html += `<label>目标挡位 <select id="timerTarget">${levelOptionsHtml(3)}</select></label>`;
    html += '<button type="submit">启动一次性定时</button></form></section>';

    html += '<section class="card"><h2>任务链</h2><div class="small">最多 8 步；空白等待会忽略。</div>';
    html += '<form onsubmit="event.preventDefault();window._startTaskChain()"><input type="hidden" id="taskCount" value="8">';
    for (let i = 0; i < MAX_TASK_STEPS; i++) {
      const defVal = i === 0 ? '10' : i === 1 ? '20' : i === 2 ? '30' : '';
      const defAction = i === 1 ? 'down' : i === 2 ? 'set' : 'up';
      html += `<div class="row"><div class="inline"><b>步骤 ${i + 1}</b><label>等待 <input id="wait${i}" type="number" min="0" max="1440" value="${defVal}"> 分钟</label><label>动作 <select id="action${i}">${taskActionOptionsHtml(defAction)}</select></label><label>目标 <select id="target${i}">${levelOptionsHtml(3)}</select></label></div></div>`;
    }
    html += '<div class="buttons"><button type="submit">启动任务链</button><button class="danger" type="button" onclick="window._cancelTask()">取消任务链</button></div></form></section>';

    html += '<section class="card"><h2>NTP 定时启动任务链</h2>';
    html += `<div class="small">当前：${data.clockTask.enabled ? '已启用' : '未启用'}；每一步按自己的北京时间执行，同一分钟只触发一次。</div>`;
    html += '<form onsubmit="event.preventDefault();window._saveClockTask()">';
    html += `<label><input type="checkbox" id="clkEnabled" value="1"${data.clockTask.enabled ? ' checked' : ''}> 启用</label>`;
    html += `<label><input type="checkbox" id="clkOnce" value="1"${data.clockTask.once ? ' checked' : ''}> 全部步骤触发一次后停用</label>`;
    html += '<input type="hidden" id="clkCount" value="8">';
    for (let i = 0; i < MAX_TASK_STEPS; i++) {
      const step = data.clockTask.steps[i] || { hour: i === 0 ? 7 : 7, minute: 0, action: i === 0 ? 'powerOn' : 'set', targetLevel: 3 };
      html += `<div class="row"><div class="inline"><b>定时步骤 ${i + 1}</b><label>时 <input id="clkHour${i}" type="number" min="0" max="23" value="${step.hour}"></label><label>分 <input id="clkMin${i}" type="number" min="0" max="59" value="${step.minute}"></label><label>动作 <select id="clkAction${i}">${taskActionOptionsHtml(step.action)}</select></label><label>目标 <select id="clkTarget${i}">${levelOptionsHtml(step.targetLevel)}</select></label></div></div>`;
    }
    html += '<div class="buttons"><button type="submit">保存定时任务</button><button class="danger" type="button" onclick="window._disableClockTask()">停用定时任务</button></div></form></section>';

    document.getElementById('tabPage').innerHTML = html;
  }

  function renderLogs() {
    let html = '<section class="card"><h2>最近日志</h2>';
    html += '<div id="logsContent">加载中...</div></section>';
    document.getElementById('tabPage').innerHTML = html;
    loadLogs();
  }

  async function loadLogs() {
    try {
      const data = await api('GET', '/api/logs');
      const logs = data.logs || [];
      if (logs.length === 0) {
        document.getElementById('logsContent').innerHTML = '<div class="small">暂无日志</div>';
        return;
      }
      let html = '';
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        html += '<div class="row">';
        html += '<div><b>' + escHtml(log.time) + '</b> <span class="small">运行 ' + log.uptimeSeconds + ' 秒</span><br>';
        html += escHtml(log.message) + '</div></div>';
      }
      document.getElementById('logsContent').innerHTML = html;
    } catch (e) {
      document.getElementById('logsContent').innerHTML = '<div class="warn">加载日志失败</div>';
    }
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.bottomNav a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    if (statusData) renderCurrentPage(statusData); else refreshStatus();
  }

  document.querySelectorAll('.bottomNav a').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); switchTab(a.dataset.tab); });
  });

  window._sendAction = async function (action) {
    try {
      const result = await api('POST', '/api/send', { action });
      showMessage(result.message, result.ok ? undefined : 'error');
      refreshStatus();
    } catch (e) { showError('请求失败'); }
  };

  window._learnAction = async function (action) {
    try {
      const result = await api('POST', '/api/learn', { action });
      showMessage(result.message, result.ok ? undefined : 'error');
      refreshStatus();
    } catch (e) { showError('请求失败'); }
  };

  window._calibrateLevel = async function () {
    const level = document.getElementById('levelSelect').value;
    try {
      const result = await api('POST', '/api/level', { level });
      showMessage(result.message);
      refreshStatus();
    } catch (e) { showError('请求失败'); }
  };

  window._calibrateState = async function () {
    const power = document.getElementById('powerSelect').value;
    try {
      const result = await api('POST', '/api/state', { power });
      showMessage(result.message);
      refreshStatus();
    } catch (e) { showError('请求失败'); }
  };

  window._saveNetwork = async function () {
    const body = {
      mode: document.getElementById('netMode').value,
      staSsid: document.getElementById('staSsid').value,
      apSsid: document.getElementById('apSsid').value
    };
    const staPw = document.getElementById('staPassword').value;
    if (staPw) body.staPassword = staPw;
    const apPw = document.getElementById('apPassword').value;
    if (apPw) body.apPassword = apPw;
    try {
      const result = await api('POST', '/api/network', body);
      showMessage(result.message, result.ok ? undefined : 'error');
    } catch (e) { showError('请求失败'); }
  };

  window._saveIp = function () {
    const ip = document.getElementById('ipInput').value.trim();
    if (ip) {
      localStorage.setItem(IP_KEY, ip);
      showMessage('IP 地址已保存');
      refreshStatus();
    }
  };

  window._resetAll = async function () {
    try {
      const result = await api('POST', '/api/reset');
      showMessage(result.message);
      refreshStatus();
    } catch (e) { showError('请求失败'); }
  };

  window._startTimer = async function () {
    const body = {
      wait: document.getElementById('timerWait').value,
      action: document.getElementById('timerAction').value
    };
    const target = document.getElementById('timerTarget');
    if (target) body.target = target.value;
    try {
      const result = await api('POST', '/api/timer', body);
      showMessage(result.message, result.ok ? undefined : 'error');
      refreshStatus();
    } catch (e) { showError('请求失败'); }
  };

  window._startTaskChain = async function () {
    const count = parseInt(document.getElementById('taskCount').value) || MAX_TASK_STEPS;
    const body = { count };
    for (let i = 0; i < count; i++) {
      const wEl = document.getElementById('wait' + i);
      const aEl = document.getElementById('action' + i);
      const tEl = document.getElementById('target' + i);
      if (wEl && wEl.value !== '') body['wait' + i] = wEl.value;
      if (aEl) body['action' + i] = aEl.value;
      if (tEl) body['target' + i] = tEl.value;
    }
    try {
      const result = await api('POST', '/api/task/start', body);
      showMessage(result.message, result.ok ? undefined : 'error');
      refreshStatus();
    } catch (e) { showError('请求失败'); }
  };

  window._cancelTask = async function () {
    try {
      const result = await api('POST', '/api/task/cancel');
      showMessage(result.message);
      refreshStatus();
    } catch (e) { showError('请求失败'); }
  };

  window._saveClockTask = async function () {
    const body = {
      enabled: document.getElementById('clkEnabled').checked ? '1' : '0',
      once: document.getElementById('clkOnce').checked ? '1' : '0',
      count: parseInt(document.getElementById('clkCount').value) || 8
    };
    for (let i = 0; i < MAX_TASK_STEPS; i++) {
      const hEl = document.getElementById('clkHour' + i);
      const mEl = document.getElementById('clkMin' + i);
      const aEl = document.getElementById('clkAction' + i);
      const tEl = document.getElementById('clkTarget' + i);
      if (hEl && hEl.value !== '') body['hour' + i] = hEl.value;
      if (mEl && mEl.value !== '') body['minute' + i] = mEl.value;
      if (aEl) body['action' + i] = aEl.value;
      if (tEl) body['target' + i] = tEl.value;
    }
    try {
      const result = await api('POST', '/api/clock-task', body);
      showMessage(result.message, result.ok ? undefined : 'error');
      refreshStatus();
    } catch (e) { showError('请求失败'); }
  };

  window._disableClockTask = async function () {
    try {
      const result = await api('POST', '/api/clock-task', { enabled: '0' });
      showMessage(result.message);
      refreshStatus();
    } catch (e) { showError('请求失败'); }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }

  startPolling();
})();
