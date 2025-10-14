const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Keep a global reference of the window object
let mainWindow;
let settingsWindow;

// Configuration file path
const CONFIG_FILE = path.join(os.homedir(), '.desktop-crud-app', 'config.json');
const DEFAULT_DATA_DIR = path.join(os.homedir(), 'Desktop CRUD App Data');

// Configuration management functions
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(configData);
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return { dataDirectory: DEFAULT_DATA_DIR };
}

function saveConfig(config) {
  try {
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

function ensureDataDirectory(dataDir) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error('Error creating data directory:', error);
    return false;
  }
}

async function selectDataDirectory() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Data Directory',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: DEFAULT_DATA_DIR
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    const config = loadConfig();
    config.dataDirectory = selectedPath;
    if (saveConfig(config)) {
      ensureDataDirectory(selectedPath);
      return selectedPath;
    }
  }
  return null;
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'icon.ico'), // Optional icon
    show: false, // Don't show until ready
    titleBarStyle: 'default'
  });

  // Load the app
  mainWindow.loadFile('index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Check if data directory is configured
    const config = loadConfig();
    if (!config.dataDirectory || !fs.existsSync(config.dataDirectory)) {
      // Show directory selection dialog
      selectDataDirectory().then(selectedPath => {
        if (selectedPath) {
          mainWindow.webContents.send('data-directory-selected', selectedPath);
        } else {
          // Use default if user cancels
          ensureDataDirectory(DEFAULT_DATA_DIR);
          mainWindow.webContents.send('data-directory-selected', DEFAULT_DATA_DIR);
        }
      });
    } else {
      mainWindow.webContents.send('data-directory-selected', config.dataDirectory);
    }
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 400,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  settingsWindow.loadFile('settings.html');

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// IPC handlers for CRUD operations
ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, config) => {
  return saveConfig(config);
});

ipcMain.handle('select-directory', async () => {
  return await selectDataDirectory();
});

ipcMain.handle('read-data', (event, filename) => {
  try {
    const config = loadConfig();
    const filePath = path.join(config.dataDirectory, filename);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error reading data:', error);
    return [];
  }
});

ipcMain.handle('write-data', (event, filename, data) => {
  try {
    const config = loadConfig();
    const filePath = path.join(config.dataDirectory, filename);
    ensureDataDirectory(config.dataDirectory);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing data:', error);
    return false;
  }
});

ipcMain.handle('open-settings', () => {
  createSettingsWindow();
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});
