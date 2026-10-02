const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('node:path');

const WIDGET_WIDTH = 430;
const RAIL_WIDTH = 54;
const RAIL_HEIGHT_MAX = 210;
const RAIL_HEIGHT_MIN = 150;

let mainWindow;
let expandedBounds;
let collapsed = false;
let dragState = null;

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } = display.workArea;
  const widgetWidth = WIDGET_WIDTH;
  const widgetHeight = Math.min(920, Math.max(620, workAreaHeight - 32));

  mainWindow = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x: workAreaX + Math.max(16, workAreaWidth - widgetWidth - 24),
    y: workAreaY + 16,
    minWidth: widgetWidth,
    maxWidth: widgetWidth,
    minHeight: Math.min(640, widgetHeight),
    maxHeight: Math.max(widgetHeight, workAreaHeight - 16),
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  expandedBounds = mainWindow.getBounds();

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.loadFile(path.join(__dirname, 'index.html'), { search: 'desktop=1' });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function collapseWindow() {
  if (!mainWindow || collapsed) return false;
  expandedBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(expandedBounds);
  const area = display.workArea;
  const railWidth = RAIL_WIDTH;
  const railHeight = Math.min(RAIL_HEIGHT_MAX, Math.max(RAIL_HEIGHT_MIN, expandedBounds.height));
  const railY = Math.max(area.y + 12, Math.min(expandedBounds.y, area.y + area.height - railHeight - 12));
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(railWidth, railHeight);
  mainWindow.setBounds({ x: area.x + area.width - railWidth, y: railY, width: railWidth, height: railHeight }, false);
  mainWindow.setMaximumSize(railWidth, railHeight);
  mainWindow.setResizable(false);
  collapsed = true;
  return true;
}

function expandWindow() {
  if (!mainWindow || !collapsed) return false;
  const maxHeight = Math.max(expandedBounds.height, screen.getDisplayMatching(expandedBounds).workArea.height - 16);
  // Linux 下窗口处于 resizable = false 时，setMinimumSize / setMaximumSize 会被忽略。
  // 必须先恢复 resizable，再"先放宽上限、后抬高下限"，否则 setBounds 仍会被收纳时的
  // 54px 上限截断，窗口就会卡成一条窄边。
  mainWindow.setResizable(true);
  mainWindow.setMaximumSize(WIDGET_WIDTH, maxHeight);
  mainWindow.setMinimumSize(WIDGET_WIDTH, Math.min(640, expandedBounds.height));
  mainWindow.setBounds(expandedBounds, false);
  collapsed = false;
  return true;
}

app.whenReady().then(() => {
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-close', () => mainWindow?.close());
  ipcMain.on('window-drag-start', () => {
    if (!mainWindow || collapsed) return;
    dragState = { cursor: screen.getCursorScreenPoint(), bounds: mainWindow.getBounds() };
  });
  ipcMain.on('window-drag-move', () => {
    if (!mainWindow || !dragState || collapsed) return;
    const cursor = screen.getCursorScreenPoint();
    mainWindow.setPosition(
      dragState.bounds.x + cursor.x - dragState.cursor.x,
      dragState.bounds.y + cursor.y - dragState.cursor.y,
    );
  });
  ipcMain.on('window-drag-stop', () => { dragState = null; });
  ipcMain.handle('window-collapse', () => collapseWindow());
  ipcMain.handle('window-expand', () => expandWindow());
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Exported for the regression test in test/window-bounds.test.js.
module.exports = { collapseWindow, expandWindow, getMainWindow: () => mainWindow };
