// Integration test for the focus / rest duration settings, driven through the real UI.
// Run with: npx electron test/timer-settings.test.js
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 用临时 userData，避免读写真实应用的 localStorage。
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'shiguang-test-')));

const main = require('../main.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  await wait(700);
  const win = main.getMainWindow();
  if (!win) throw new Error('窗口未创建');
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const snapshot = `({
    stored: JSON.parse(localStorage.getItem('shiguang-settings-v1') || 'null'),
    focusLabel: document.getElementById('focusPreset').textContent,
    restLabel: document.getElementById('restPreset').textContent,
    display: document.getElementById('timerDisplay').textContent,
    mode: document.querySelector('.mode-button.active').dataset.mode,
    status: document.getElementById('timerStatus').textContent,
    focusActive: document.getElementById('focusPreset').classList.contains('active'),
    restActive: document.getElementById('restPreset').classList.contains('active'),
    modalOpen: !document.getElementById('timerSettingsModal').classList.contains('hidden'),
  })`;

  // 1. 首次启动：默认 25 / 5，且预设按钮反映默认值。
  let state = await js(snapshot);
  check('默认专注 25 / 休息 5', state.focusLabel === '专注 25 分' && state.restLabel === '休息 5 分' && state.display === '25:00', JSON.stringify(state));
  check('默认专注预设高亮', state.focusActive && !state.restActive);

  // 2. 通过设置弹窗保存 45 / 12。
  await js(`document.getElementById('openTimerSettings').click()`);
  state = await js(`({ ...${snapshot}, input: document.getElementById('focusMinutesInput').value })`);
  check('弹窗打开并回填当前时长', state.modalOpen && state.input === '25', `input=${state.input}`);

  await js(`(() => {
    const focus = document.getElementById('focusMinutesInput');
    const rest = document.getElementById('restMinutesInput');
    focus.value = '45'; focus.dispatchEvent(new Event('input', { bubbles: true }));
    rest.value = '12'; rest.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('saveTimerSettings').click();
  })()`);
  state = await js(snapshot);
  check('保存后写入本地存储', state.stored?.focusMinutes === 45 && state.stored?.restMinutes === 12, JSON.stringify(state.stored));
  check('保存后预设与倒计时同步', state.focusLabel === '专注 45 分' && state.restLabel === '休息 12 分' && state.display === '45:00', `${state.focusLabel} / ${state.restLabel} / ${state.display}`);
  check('保存后弹窗关闭', !state.modalOpen);

  // 3. 快捷档位与步进按钮。
  await js(`
    document.getElementById('openTimerSettings').click();
    document.querySelector('.chip[data-target="focusMinutes"][data-value="60"]').click();
    document.querySelector('.chip[data-target="restMinutes"][data-value="15"]').click();
    document.querySelector('.step-button[data-target="focusMinutes"][data-step="-5"]').click();
    document.querySelector('.step-button[data-target="restMinutes"][data-step="1"]').click();
  `);
  state = await js(`({ focus: document.getElementById('focusMinutesInput').value, rest: document.getElementById('restMinutesInput').value })`);
  check('档位 / 步进按钮生效', state.focus === '55' && state.rest === '16', JSON.stringify(state));

  // 4. 越界与非法输入被夹紧，空值保留原设置。
  await js(`(() => {
    const focus = document.getElementById('focusMinutesInput');
    focus.value = '999'; focus.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('saveTimerSettings').click();
  })()`);
  state = await js(snapshot);
  check('超上限被夹紧到 180', state.stored?.focusMinutes === 180, `stored=${state.stored?.focusMinutes}`);

  await js(`(() => {
    document.getElementById('openTimerSettings').click();
    const focus = document.getElementById('focusMinutesInput');
    focus.value = ''; focus.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('saveTimerSettings').click();
  })()`);
  state = await js(snapshot);
  check('空输入保留原设置', state.stored?.focusMinutes === 180, `stored=${state.stored?.focusMinutes}`);

  // 恢复成 45 / 12 继续后面的用例。
  await js(`(() => {
    document.getElementById('openTimerSettings').click();
    const focus = document.getElementById('focusMinutesInput');
    const rest = document.getElementById('restMinutesInput');
    focus.value = '45'; focus.dispatchEvent(new Event('input', { bubbles: true }));
    rest.value = '12'; rest.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('saveTimerSettings').click();
  })()`);

  // 5. 跳过当前阶段使用另一档自定义时长。
  await js(`document.getElementById('skipTimer').click()`);
  state = await js(snapshot);
  check('跳转到休息使用自定义时长', state.mode === 'rest' && state.display === '12:00' && state.restActive && !state.focusActive, `${state.mode} ${state.display}`);

  await js(`document.querySelector('.mode-button[data-mode="focus"]').click()`);
  state = await js(snapshot);
  check('切回专注使用自定义时长', state.mode === 'focus' && state.display === '45:00', `${state.mode} ${state.display}`);

  // 6. 随机挑选一件 → 用它开始专注，也应使用自定义时长。
  await js(`document.getElementById('randomButton').click(); document.getElementById('rollButton').click();`);
  await wait(800);
  await js(`document.getElementById('focusRandomButton').click()`);
  state = await js(snapshot);
  check('随机任务带入自定义专注时长', state.display === '45:00', state.display);

  // 7. 一个阶段结束后自动切到另一个阶段，并载入它的自定义时长。
  await js(`timer.remaining = 2; document.getElementById('timerToggle').click();`);
  await wait(2600);
  state = await js(snapshot);
  check('专注结束后切到休息时长', state.mode === 'rest' && state.display === '12:00' && state.status === '准备中', `${state.mode} ${state.display} ${state.status}`);

  // 8. 收纳 / 展开：走真实点击路径，验证界面与窗口一起恢复。
  await js(`document.getElementById('windowCollapse').click()`);
  await wait(800);
  const collapsed = win.getBounds();
  const collapsedUi = await js(`document.body.classList.contains('is-collapsed')`);
  check('收纳为右侧窄条', collapsed.width === 54 && collapsedUi, `${collapsed.width}x${collapsed.height}`);

  await js(`document.getElementById('railExpand').click()`);
  await wait(900);
  const expanded = win.getBounds();
  const expandedUi = await js(`!document.body.classList.contains('is-collapsed')`);
  check('展开恢复 430 x 920 与完整界面', expanded.width === 430 && expanded.height === 920 && expandedUi, `${expanded.width}x${expanded.height}`);

  // 9. 重新加载后设置仍然有效。
  win.webContents.reload();
  await wait(1200);
  state = await js(snapshot);
  check('重载后自定义时长仍在', state.stored?.focusMinutes === 45 && state.stored?.restMinutes === 12 && state.focusLabel === '专注 45 分', JSON.stringify(state.stored));

  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(() => {
  run().catch((error) => { console.error(error); app.exit(2); });
});
