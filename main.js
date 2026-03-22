const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const pty = require('node-pty');

// Required for transparency on Windows
app.disableHardwareAcceleration();

let mainWindow;
let ptyProcess;

function findClaude() {
  // WinGet install path (preferred over broken WindowsApps shim)
  if (process.platform === 'win32') {
    const wingetPath = path.join(os.homedir(),
      'AppData/Local/Microsoft/WinGet/Packages/Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe/claude.exe');
    try {
      fs.accessSync(wingetPath);
      return wingetPath;
    } catch {}
  }
  return 'claude';
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1400, width),
    height: Math.min(900, height),
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Spawn claude CLI in a real PTY
  const claudePath = findClaude();
  const shell = process.platform === 'win32' ? claudePath : (process.env.SHELL || '/bin/bash');
  const shellArgs = process.platform === 'win32' ? [] : ['-c', 'claude'];

  try {
    ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    ptyProcess.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', exitCode);
      }
    });
  } catch (err) {
    // If PTY fails, show error in terminal
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('terminal:data',
        `\r\n\x1b[31m[AEGIS] Failed to launch claude: ${err.message}\x1b[0m\r\n` +
        `\x1b[33mMake sure Claude Code CLI is installed: npm install -g @anthropic-ai/claude-code\x1b[0m\r\n`
      );
    });
  }

  // Receive input from renderer
  ipcMain.on('terminal:input', (_event, data) => {
    if (ptyProcess) ptyProcess.write(data);
  });

  ipcMain.on('terminal:resize', (_event, { cols, rows }) => {
    if (ptyProcess) {
      try { ptyProcess.resize(cols, rows); } catch {}
    }
  });

  // Window controls
  ipcMain.on('window:minimize', () => mainWindow.minimize());
  ipcMain.on('window:maximize', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('window:close', () => mainWindow.close());

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (ptyProcess) ptyProcess.kill();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
