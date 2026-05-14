const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

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
  
  if (!isPackaged) {
    // DEV MODE: Spawn raw python from backend directory
    console.log('App is in Dev Mode. Spawning raw Python script...');
    pythonProcess = spawn('python', ['main.py', '--port', '8844'], {
      cwd: path.join(__dirname, '../../backend'),
      env: { ...process.env, PYTHONPATH: path.join(__dirname, '../../') }
    });
    
    // Wait for Vite
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // PROD MODE: Spawn compiled PyInstaller executable
    console.log('App is Packaged. Spawning compiled binary...');
    const backendPath = path.join(process.resourcesPath, 'sanjaya_api', 'sanjaya_api');
    
    pythonProcess = spawn(backendPath, ['--port', '8844'], {
      cwd: path.join(process.resourcesPath, 'sanjaya_api'),
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
