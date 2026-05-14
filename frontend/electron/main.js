const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let pythonProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hiddenInset',
  });

  // [ENGINEER CRITICAL] Smart Subprocess Management
  const isPackaged = app.isPackaged;
  let backendPath;
  let cwd;

  if (!isPackaged) {
    // DEV MODE: Spawn raw python from backend directory
    console.log('App is in Dev Mode. Spawning raw Python script...');
    backendPath = 'python';
    cwd = path.join(__dirname, '../../backend');
    
    pythonProcess = spawn(backendPath, ['main.py', '--port', '8844'], {
      cwd: cwd,
      env: { ...process.env, PYTHONPATH: path.join(__dirname, '../../') }
    });
    
    // Wait for Vite
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // PROD MODE: Spawn compiled PyInstaller executable
    console.log('App is Packaged. Spawning compiled binary...');
    
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'sanjaya_api.exe' : 'sanjaya_api';

    // Check common production paths
    const possiblePaths = [
      path.join(process.resourcesPath, 'sanjaya_api', binName), // Default electron-builder (dir mode)
      path.join(process.resourcesPath, binName), // One-file mode
      path.join(__dirname, '..', '..', 'backend', 'dist', 'sanjaya_api', binName), // Local simulation
    ];

    backendPath = possiblePaths.find(p => fs.existsSync(p));
    
    if (!backendPath) {
      console.error('CRITICAL: Backend binary not found in any expected location.');
      console.error('Searched paths:', possiblePaths);
      backendPath = possiblePaths[0]; // Fallback to first guess
    }

    cwd = path.dirname(backendPath);

    console.log(`Final Executable Path: ${backendPath}`);
    console.log(`CWD: ${cwd}`);

    pythonProcess = spawn(backendPath, ['--port', '8844'], { 
      cwd: cwd,
      shell: isWin
    });

    pythonProcess.on('error', (err) => {
      console.error('ERROR: Failed to launch backend process:', err);
    });

    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python STDOUT: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python STDERR: ${data}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Ensure Python dies with the App
function killPython() {
  if (pythonProcess) {
    console.log('Killing Python Subprocess...');
    pythonProcess.kill();
    pythonProcess = null;
  }
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  killPython();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  killPython();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
