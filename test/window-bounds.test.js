// Regression test: collapse the widget to the screen edge, then expand it again.
// Run with: npx electron test/window-bounds.test.js
const { app } = require('electron');
const main = require('../main.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const same = (a, b) => a && b && a.width === b.width && a.height === b.height;

async function run() {
  await wait(600);
  const win = main.getMainWindow();
  if (!win) throw new Error('窗口未创建');

  const before = win.getBounds();
  const cycles = [];
  let ok = true;

  // 连续两轮收纳 / 展开，确认不会随次数累积偏移。
  for (let round = 1; round <= 2; round += 1) {
    await main.collapseWindow();
    await wait(700);
    const collapsed = win.getBounds();
    await main.expandWindow();
    await wait(900);
    const after = win.getBounds();
    cycles.push({ round, collapsed, after });
    const collapsedOk = collapsed.width === 54;
    const expandedOk = same(before, after);
    ok = ok && collapsedOk && expandedOk;
    console.log(`第 ${round} 轮：收纳 ${collapsed.width}x${collapsed.height} → 展开 ${after.width}x${after.height}`);
    if (!collapsedOk) console.log(`  FAIL 收纳宽度应为 54，实际 ${collapsed.width}`);
    if (!expandedOk) console.log(`  FAIL 展开后应为 ${before.width}x${before.height}，实际 ${after.width}x${after.height}`);
  }

  console.log(JSON.stringify({ before, cycles }, null, 2));
  console.log(ok ? 'PASS 收纳 / 展开恢复正常' : 'FAIL 收纳 / 展开存在尺寸异常');
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(() => {
  run().catch((error) => { console.error(error); app.exit(2); });
});
