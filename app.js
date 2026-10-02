const STORAGE_KEY = 'shiguang-todos-v1';
const TIMER_KEY = 'shiguang-timer-v1';
const SETTINGS_KEY = 'shiguang-settings-v1';
const DEFAULT_SETTINGS = { focusMinutes: 25, restMinutes: 5 };
const DURATION_LIMITS = { focusMinutes: [1, 180], restMinutes: [1, 60] };
const isDesktopWidget = new URLSearchParams(window.location.search).has('desktop');
document.body.classList.toggle('desktop-widget', isDesktopWidget);

const seedTasks = [
  { id: crypto.randomUUID(), title: '整理今天最重要的三件事', completed: false, deleted: false, priority: true, createdAt: Date.now() - 3600000 },
  { id: crypto.randomUUID(), title: '给自己留一段不被打扰的时间', completed: false, deleted: false, priority: false, createdAt: Date.now() - 1800000 },
  { id: crypto.randomUUID(), title: '收拾桌面，让空间呼吸一下', completed: false, deleted: false, priority: false, createdAt: Date.now() - 900000 },
];

let tasks = loadTasks();
let currentView = 'all';
let currentFilter = 'all';
let sortAsc = false;
let selectedRandomTask = null;
let settings = loadSettings();
let timer = loadTimer();
let timerInterval = null;

const $ = (id) => document.getElementById(id);

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : seedTasks;
  } catch { return seedTasks; }
}
function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
function clampMinutes(key, value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const number = Math.round(Number(raw));
  if (!Number.isFinite(number)) return null;
  const [min, max] = DURATION_LIMITS[key];
  return Math.max(min, Math.min(max, number));
}
function loadSettings() {
  const fallback = { ...DEFAULT_SETTINGS };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!saved) return fallback;
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const value = clampMinutes(key, saved[key]);
      if (value !== null) fallback[key] = value;
    }
  } catch {}
  return fallback;
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function minutesFor(mode) { return mode === 'rest' ? settings.restMinutes : settings.focusMinutes; }
function durationFor(key) { return key === 'restMinutes' ? settings.restMinutes : settings.focusMinutes; }
function loadTimer() {
  try {
    const saved = JSON.parse(localStorage.getItem(TIMER_KEY));
    if (saved && typeof saved.remaining === 'number') {
      const mode = saved.mode === 'rest' ? 'rest' : 'focus';
      const duration = typeof saved.duration === 'number' && saved.duration > 0 ? saved.duration : minutesFor(mode) * 60;
      return {
        mode,
        duration,
        remaining: saved.remaining > 0 ? Math.min(saved.remaining, duration) : duration,
        running: false,
        activeTaskId: saved.activeTaskId ?? null,
      };
    }
  } catch {}
  return { mode: 'focus', duration: minutesFor('focus') * 60, remaining: minutesFor('focus') * 60, running: false, activeTaskId: null };
}
function saveTimer() { localStorage.setItem(TIMER_KEY, JSON.stringify({ ...timer, running: false })); }
function formatDate() {
  const date = new Date();
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date);
  const text = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date);
  $('todayLabel').textContent = `${text} · ${weekday}`;
  const hour = date.getHours();
  $('greeting').textContent = hour < 12 ? '早上好，准备开始吧' : hour < 18 ? '下午好，继续保持节奏' : '晚上好，收个舒服的尾';
}
function escapeHtml(text) {
  return text.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}
function visibleTasks() {
  let list;
  if (currentView === 'trash') list = tasks.filter(task => task.deleted);
  else if (currentView === 'completed') list = tasks.filter(task => task.completed && !task.deleted);
  else list = tasks.filter(task => !task.deleted && !task.completed);
  if (currentView === 'all') {
    if (currentFilter === 'priority') list = list.filter(task => task.priority);
    if (currentFilter === 'today') list = list.filter(task => new Date(task.createdAt).toDateString() === new Date().toDateString());
  }
  return list.sort((a, b) => sortAsc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
}
function render() {
  const list = visibleTasks();
  $('taskList').innerHTML = list.map(taskTemplate).join('');
  $('emptyState').classList.toggle('hidden', list.length > 0);
  if (!list.length) {
    const empty = currentView === 'trash' ? ['回收站很干净', '被删除的事情会暂时出现在这里。'] : currentView === 'completed' ? ['还没有完成的事', '完成一件，来这里给自己一个小小的确认。'] : ['清单很轻', '把想做的事写下来，先从一件开始。'];
    $('emptyTitle').textContent = empty[0]; $('emptyDescription').textContent = empty[1];
  }
  $('allCount').textContent = tasks.filter(task => !task.deleted && !task.completed).length;
  $('completedCount').textContent = tasks.filter(task => task.completed && !task.deleted).length;
  $('trashCount').textContent = tasks.filter(task => task.deleted).length;
  const remaining = tasks.filter(task => !task.deleted && !task.completed).length;
  $('taskSummary').textContent = currentView === 'trash' ? `${list.length} 项已删除` : `${remaining} 项待完成`;
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === currentView));
  const titles = { all: ['TODAY\'S LIST', '今天要做的事'], completed: ['ARCHIVE OF WINS', '已经完成的事'], trash: ['TRASH', '回收站'] };
  $('viewKicker').textContent = titles[currentView][0]; $('viewTitle').textContent = titles[currentView][1];
  document.querySelectorAll('.filter-chip').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === currentFilter));
}
function taskTemplate(task) {
  const isTrash = currentView === 'trash';
  return `<article class="task-item ${task.completed ? 'is-completed' : ''}" data-id="${task.id}">
    ${isTrash ? '<span class="task-check" aria-hidden="true">×</span>' : `<button class="task-check" data-action="toggle" aria-label="${task.completed ? '标记未完成' : '标记完成'}">✓</button>`}
    <div class="task-content"><div class="task-title">${escapeHtml(task.title)}</div><div class="task-meta"><span>${task.completed ? '已完成' : '待处理'}</span>${task.priority ? '<span class="task-priority">★ 优先</span>' : ''}<span>${formatTime(task.createdAt)}</span></div></div>
    <div class="task-actions">${isTrash ? `<button class="icon-button" data-action="restore" title="恢复">↺</button><button class="icon-button danger" data-action="permanent" title="永久删除">⌫</button>` : `<button class="icon-button" data-action="priority" title="${task.priority ? '取消优先' : '设为优先'}">${task.priority ? '★' : '☆'}</button><button class="icon-button" data-action="delete" title="移入回收站">⌫</button>`}</div>
  </article>`;
}
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return '今天';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
function showToast(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function addTask(title) {
  const clean = title.trim(); if (!clean) return;
  tasks.unshift({ id: crypto.randomUUID(), title: clean, completed: false, deleted: false, priority: false, createdAt: Date.now() });
  saveTasks(); render(); $('taskInput').value = ''; showToast('已加入今天的清单');
}
function mutateTask(id, action) {
  const task = tasks.find(item => item.id === id); if (!task) return;
  if (action === 'toggle') task.completed = !task.completed;
  if (action === 'priority') task.priority = !task.priority;
  if (action === 'delete') { task.deleted = true; task.completed = false; }
  if (action === 'restore') { task.deleted = false; task.completed = false; }
  if (action === 'permanent') { tasks = tasks.filter(item => item.id !== id); }
  saveTasks(); render();
  if (action === 'toggle') showToast(task.completed ? '完成得漂亮' : '已放回待办');
  if (action === 'delete') showToast('已移入回收站，可随时恢复');
  if (action === 'restore') showToast('已恢复到待办');
}

function renderPresets() {
  $('focusPreset').textContent = `专注 ${settings.focusMinutes} 分`;
  $('restPreset').textContent = `休息 ${settings.restMinutes} 分`;
  $('focusPreset').classList.toggle('active', timer.mode === 'focus' && timer.duration === settings.focusMinutes * 60);
  $('restPreset').classList.toggle('active', timer.mode === 'rest' && timer.duration === settings.restMinutes * 60);
}
function renderTimer() {
  const minutes = Math.floor(timer.remaining / 60).toString().padStart(2, '0');
  const seconds = (timer.remaining % 60).toString().padStart(2, '0');
  $('timerDisplay').textContent = `${minutes}:${seconds}`;
  const progress = Math.max(0, Math.min(360, (1 - timer.remaining / timer.duration) * 360));
  $('timerRing').style.setProperty('--progress', `${progress}deg`);
  $('timerCaption').textContent = timer.mode === 'focus' ? 'FOCUS SESSION' : 'REST SESSION';
  $('timerStatus').textContent = timer.running ? (timer.mode === 'focus' ? '专注进行中' : '休息进行中') : '准备中';
  $('timerToggleIcon').textContent = timer.running ? 'Ⅱ' : '▶'; $('timerToggleText').textContent = timer.running ? '暂停' : '开始';
  const active = tasks.find(task => task.id === timer.activeTaskId);
  $('timerTask').textContent = active ? active.title : (timer.mode === 'focus' ? '选择一件事开始' : '让大脑松一口气');
  document.querySelectorAll('.mode-button').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === timer.mode));
  renderPresets();
}
function startTimer() {
  if (!timer.running && timer.remaining <= 0) setTimerMode(timer.mode, minutesFor(timer.mode));
  timer.running = !timer.running;
  clearInterval(timerInterval);
  if (timer.running) {
    timerInterval = setInterval(() => {
      timer.remaining = Math.max(0, timer.remaining - 1);
      if (timer.remaining === 0) {
        const finished = timer.mode;
        const next = finished === 'focus' ? 'rest' : 'focus';
        clearInterval(timerInterval);
        timer.running = false;
        showToast(finished === 'focus' ? '专注完成，休息一下吧' : '休息结束，准备回来吧');
        setTimerMode(next, minutesFor(next));
        return;
      }
      renderTimer();
    }, 1000);
  }
  renderTimer(); saveTimer();
}
function setTimerMode(mode, minutes) {
  clearInterval(timerInterval); timer = { ...timer, mode, duration: minutes * 60, remaining: minutes * 60, running: false }; renderTimer(); saveTimer();
}

function setDurationInput(key, value) {
  $(`${key}Input`).value = clampMinutes(key, value) ?? durationFor(key);
  syncDurationChips();
}
function syncDurationChips() {
  document.querySelectorAll('.chip[data-target]').forEach(chip => {
    const input = $(`${chip.dataset.target}Input`);
    chip.classList.toggle('active', Number(chip.dataset.value) === clampMinutes(chip.dataset.target, input.value));
  });
}
function openTimerSettings() {
  $('focusMinutesInput').value = settings.focusMinutes;
  $('restMinutesInput').value = settings.restMinutes;
  syncDurationChips();
  $('timerSettingsModal').classList.remove('hidden');
  $('focusMinutesInput').focus();
  $('focusMinutesInput').select();
}
function closeTimerSettings() { $('timerSettingsModal').classList.add('hidden'); }
function saveTimerSettings() {
  const focusMinutes = clampMinutes('focusMinutes', $('focusMinutesInput').value) ?? settings.focusMinutes;
  const restMinutes = clampMinutes('restMinutes', $('restMinutesInput').value) ?? settings.restMinutes;
  const changed = focusMinutes !== settings.focusMinutes || restMinutes !== settings.restMinutes;
  settings = { focusMinutes, restMinutes };
  saveSettings();
  $('focusMinutesInput').value = focusMinutes;
  $('restMinutesInput').value = restMinutes;
  syncDurationChips();
  if (timer.running) renderTimer();
  else setTimerMode(timer.mode, minutesFor(timer.mode));
  closeTimerSettings();
  showToast(changed ? `已保存：专注 ${focusMinutes} 分钟 · 休息 ${restMinutes} 分钟` : `时长未变：专注 ${focusMinutes} 分钟 · 休息 ${restMinutes} 分钟`);
}

function openRandom() { selectedRandomTask = null; $('randomResult').className = 'random-result'; $('randomResult').innerHTML = '<span class="random-dice">⚄</span><span>准备掷骰子</span>'; $('focusRandomButton').classList.add('hidden'); $('randomModal').classList.remove('hidden'); }
function rollRandom() {
  const available = tasks.filter(task => !task.deleted && !task.completed);
  if (!available.length) { $('randomResult').innerHTML = '<span>先添加一件待办吧</span>'; return; }
  $('randomResult').className = 'random-result rolling'; $('randomResult').innerHTML = '<span class="random-dice">⚄</span><span>正在选择…</span>';
  setTimeout(() => { selectedRandomTask = available[Math.floor(Math.random() * available.length)]; $('randomResult').className = 'random-result chosen'; $('randomResult').innerHTML = `<span class="random-dice">✦</span><span>${escapeHtml(selectedRandomTask.title)}</span>`; $('focusRandomButton').classList.remove('hidden'); }, 600);
}

function closeContextMenu() {
  $('contextMenu').classList.add('hidden');
  $('contextMenu').replaceChildren();
}
function showContextMenu(event) {
  if (!isDesktopWidget || event.target.closest('#contextMenu')) return;
  event.preventDefault();

  const item = event.target.closest('.task-item');
  const task = item && tasks.find(candidate => candidate.id === item.dataset.id);
  const menu = $('contextMenu');
  const actions = task
    ? task.deleted
      ? [['restore', '恢复待办'], ['permanent', '永久删除']]
      : [[task.completed ? 'toggle' : 'toggle', task.completed ? '标记为未完成' : '标记为完成'], ['priority', task.priority ? '取消优先标记' : '设为优先'], ['delete', '移入回收站']]
    : [['add', '添加待办'], ['random', '随机挑选一件'], ['focus', '开始专注']];

  menu.innerHTML = actions.map(([action, label]) => `<button class="context-menu-item" role="menuitem" data-context-action="${action}">${label}</button>`).join('');
  menu.dataset.taskId = task?.id ?? '';
  menu.classList.remove('hidden');

  const bounds = menu.getBoundingClientRect();
  const anchor = item?.getBoundingClientRect();
  const preferredLeft = anchor ? anchor.right - bounds.width : event.clientX;
  const preferredTop = anchor ? anchor.bottom + 4 : event.clientY;
  const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - bounds.width - 8));
  const top = Math.max(8, Math.min(preferredTop, window.innerHeight - bounds.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

const topbar = document.querySelector('.topbar');
topbar.addEventListener('pointerdown', event => {
  if (!isDesktopWidget || event.button !== 0 || event.target.closest('button, input')) return;
  event.preventDefault();
  topbar.setPointerCapture(event.pointerId);
  window.desktopAPI?.startDrag();
});
topbar.addEventListener('pointermove', event => {
  if (topbar.hasPointerCapture(event.pointerId)) window.desktopAPI?.moveDrag();
});
topbar.addEventListener('pointerup', event => {
  if (!topbar.hasPointerCapture(event.pointerId)) return;
  topbar.releasePointerCapture(event.pointerId);
  window.desktopAPI?.stopDrag();
});
topbar.addEventListener('pointercancel', () => window.desktopAPI?.stopDrag());

$('taskForm').addEventListener('submit', e => { e.preventDefault(); addTask($('taskInput').value); });
$('windowCollapse').addEventListener('click', async () => {
  document.body.classList.add('is-collapsed');
  $('collapseRail').classList.remove('hidden');
  await window.desktopAPI?.collapse();
});
$('railExpand').addEventListener('click', async () => {
  // expand() 返回 false 表示主进程里窗口本来就是展开的，此时同样要把界面切回展开态，
  // 否则界面会停在窄条视图上无法恢复。
  await window.desktopAPI?.expand();
  document.body.classList.remove('is-collapsed');
  $('collapseRail').classList.add('hidden');
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
});
$('windowMinimize').addEventListener('click', () => window.desktopAPI?.minimize());
$('windowClose').addEventListener('click', () => window.desktopAPI?.close());
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => { currentView = btn.dataset.view; currentFilter = 'all'; render(); }));
document.querySelectorAll('.filter-chip').forEach(btn => btn.addEventListener('click', () => { currentFilter = btn.dataset.filter; render(); }));
$('sortButton').addEventListener('click', () => { sortAsc = !sortAsc; render(); showToast(sortAsc ? '已按最早添加排序' : '已按最新添加排序'); });
$('taskList').addEventListener('click', e => { const action = e.target.closest('[data-action]')?.dataset.action; const item = e.target.closest('.task-item'); if (action && item) mutateTask(item.dataset.id, action); });
window.addEventListener('contextmenu', showContextMenu, true);
document.addEventListener('pointerdown', e => { if (!e.target.closest('#contextMenu')) closeContextMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeContextMenu(); closeTimerSettings(); } });
$('contextMenu').addEventListener('click', e => {
  const action = e.target.closest('[data-context-action]')?.dataset.contextAction;
  if (!action) return;
  const taskId = $('contextMenu').dataset.taskId;
  closeContextMenu();
  if (taskId) mutateTask(taskId, action);
  else if (action === 'add') $('taskInput').focus();
  else if (action === 'random') openRandom();
  else if (action === 'focus') $('focusButton').click();
});
$('randomButton').addEventListener('click', openRandom); $('closeRandom').addEventListener('click', () => $('randomModal').classList.add('hidden')); $('rollButton').addEventListener('click', rollRandom);
$('randomModal').addEventListener('click', e => { if (e.target === $('randomModal')) $('randomModal').classList.add('hidden'); });
$('focusRandomButton').addEventListener('click', () => { if (selectedRandomTask) { timer.activeTaskId = selectedRandomTask.id; setTimerMode('focus', settings.focusMinutes); $('randomModal').classList.add('hidden'); renderTimer(); showToast('已将随机任务放入专注'); } });
$('focusButton').addEventListener('click', () => { const first = tasks.find(task => !task.deleted && !task.completed); if (first) timer.activeTaskId = first.id; renderTimer(); $('focusButton').blur(); document.querySelector('.focus-panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('timerToggle').addEventListener('click', startTimer); $('resetTimer').addEventListener('click', () => setTimerMode(timer.mode, minutesFor(timer.mode))); $('skipTimer').addEventListener('click', () => { const next = timer.mode === 'focus' ? 'rest' : 'focus'; setTimerMode(next, minutesFor(next)); });
document.querySelectorAll('.mode-button').forEach(btn => btn.addEventListener('click', () => setTimerMode(btn.dataset.mode, minutesFor(btn.dataset.mode))));
$('focusPreset').addEventListener('click', () => setTimerMode('focus', settings.focusMinutes));
$('restPreset').addEventListener('click', () => setTimerMode('rest', settings.restMinutes));
$('openTimerSettings').addEventListener('click', openTimerSettings);
$('closeTimerSettings').addEventListener('click', closeTimerSettings);
$('timerSettingsForm').addEventListener('submit', event => { event.preventDefault(); saveTimerSettings(); });
$('resetTimerSettings').addEventListener('click', () => { setDurationInput('focusMinutes', DEFAULT_SETTINGS.focusMinutes); setDurationInput('restMinutes', DEFAULT_SETTINGS.restMinutes); $('focusMinutesInput').focus(); showToast('已填回默认值，记得点保存'); });
$('timerSettingsModal').addEventListener('click', event => { if (event.target === $('timerSettingsModal')) closeTimerSettings(); });
$('timerSettingsModal').addEventListener('input', event => { if (event.target.matches('input')) syncDurationChips(); });
document.querySelectorAll('.step-button').forEach(button => button.addEventListener('click', () => {
  const key = button.dataset.target;
  const input = $(`${key}Input`);
  const [min, max] = DURATION_LIMITS[key];
  const base = clampMinutes(key, input.value) ?? durationFor(key);
  input.value = Math.max(min, Math.min(max, base + Number(button.dataset.step)));
  syncDurationChips();
}));
document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => setDurationInput(chip.dataset.target, chip.dataset.value)));

formatDate(); render(); renderTimer();
