const vscode = require('vscode');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const net = require('net');
const childProcess = require('child_process');

// Global variables
let stataOutputChannel;
let stataAgentChannel;
let statusBarItem;
let mcpServerProcess;
let mcpServerRunning = false;
let agentWebviewPanel = null;
let stataOutputWebviewPanel = null;
let globalContext;
let detectedStataPath = null;
let debugMode = false;

// Configuration cache
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 5000; // 5 seconds

// Platform detection (cache once)
const IS_WINDOWS = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = !IS_WINDOWS && !IS_MAC;

// File path constants
const FILE_PATHS = {
    PYTHON_PATH: '.python-path',
    PYTHON_PATH_BACKUP: '.python-path.backup',
    SETUP_IN_PROGRESS: '.setup-in-progress',
    SETUP_ERROR: '.setup-error',
    SETUP_COMPLETE: '.setup-complete',
    UV_PATH: '.uv-path',
    LOG_FILE: 'stata_mcp_server.log'
};

// Configuration getter with caching
function getConfig() {
    const now = Date.now();
    if (!configCache || (now - configCacheTime) > CONFIG_CACHE_TTL) {
        configCache = vscode.workspace.getConfiguration('stata-vscode');
        configCacheTime = now;
    }
    return configCache;
}

// Centralized logging utilities
const Logger = {
    info: (message) => {
        stataOutputChannel.appendLine(message);
        if (debugMode) console.log(`[DEBUG] ${message}`);
    },
    error: (message) => {
        stataOutputChannel.appendLine(message);
        console.error(`[ERROR] ${message}`);
    },
    debug: (message) => {
        if (debugMode) {
            stataOutputChannel.appendLine(`[DEBUG] ${message}`);
            console.log(`[DEBUG] ${message}`);
        }
    },
    mcpServer: (message) => {
        const output = message.toString().trim();
        stataOutputChannel.appendLine(`[MCP Server] ${output}`);
        console.log(`[MCP Server] ${output}`);
    },
    mcpServerError: (message) => {
        const output = message.toString().trim();
        stataOutputChannel.appendLine(`[MCP Server Error] ${output}`);
        console.error(`[MCP Server Error] ${output}`);
    }
};

// File path utilities
const FileUtils = {
    getExtensionFilePath: (filename) => {
        const extensionPath = globalContext.extensionPath || __dirname;
        return path.join(extensionPath, filename);
    },
    
    checkFileExists: (filePath) => {
        try {
            return fs.existsSync(filePath);
        } catch (error) {
            Logger.error(`Error checking file ${filePath}: ${error.message}`);
            return false;
        }
    },
    
    readFileContent: (filePath) => {
        try {
            return fs.readFileSync(filePath, 'utf8').trim();
        } catch (error) {
            Logger.error(`Error reading file ${filePath}: ${error.message}`);
            return null;
        }
    },
    
    writeFileContent: (filePath, content) => {
        try {
            fs.writeFileSync(filePath, content);
            return true;
        } catch (error) {
            Logger.error(`Error writing file ${filePath}: ${error.message}`);
            return false;
        }
    }
};

// Error handling utilities
const ErrorHandler = {
    pythonNotFound: () => {
        const pyMsg = IS_WINDOWS 
            ? "Python not found. Please install Python 3.11 from python.org and add it to your PATH."
            : "Python not found. Please install Python 3.11.";
        Logger.error(pyMsg);
        vscode.window.showErrorMessage(pyMsg);
    },
    
    serverStartFailed: (error) => {
        Logger.error(`Failed to start MCP server: ${error.message}`);
        if (error.code === 'ENOENT') {
            ErrorHandler.pythonNotFound();
        } else {
            vscode.window.showErrorMessage(`Failed to start MCP server: ${error.message}`);
        }
    },
    
    serverExited: (code, signal) => {
        Logger.info(`MCP server process exited with code ${code} and signal ${signal}`);
        if (code !== 0 && code !== null) {
            vscode.window.showErrorMessage(`MCP server exited with code ${code}`);
        }
        mcpServerRunning = false;
        updateStatusBar();
    }
};

// Python environment utilities
const PythonUtils = {
    getSystemPythonCommand: () => IS_WINDOWS ? 'py' : 'python3',
    
    getVenvPythonPath: () => {
        const extensionPath = globalContext.extensionPath || __dirname;
        return IS_WINDOWS 
            ? path.join(extensionPath, '.venv', 'Scripts', 'python.exe')
            : path.join(extensionPath, '.venv', 'bin', 'python');
    },
    
    getPythonCommand: () => {
        const pythonPathFile = FileUtils.getExtensionFilePath(FILE_PATHS.PYTHON_PATH);
        const backupPythonPathFile = FileUtils.getExtensionFilePath(FILE_PATHS.PYTHON_PATH_BACKUP);
        
        // Check primary Python path file
        if (FileUtils.checkFileExists(pythonPathFile)) {
            const pythonCommand = FileUtils.readFileContent(pythonPathFile);
            if (pythonCommand && FileUtils.checkFileExists(pythonCommand)) {
                Logger.debug(`Using virtual environment Python: ${pythonCommand}`);
                return pythonCommand;
            }
            Logger.debug(`Python path ${pythonCommand} does not exist`);
            
            // Try backup path
            if (FileUtils.checkFileExists(backupPythonPathFile)) {
                const backupCommand = FileUtils.readFileContent(backupPythonPathFile);
                if (backupCommand && FileUtils.checkFileExists(backupCommand)) {
                    Logger.debug(`Using backup Python path: ${backupCommand}`);
                    return backupCommand;
                }
            }
        }
        
        // Fall back to system Python
        return PythonUtils.getSystemPythonCommand();
    }
};

// Server utilities
const ServerUtils = {
    async isPortInUse(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.listen(port, () => {
                server.once('close', () => resolve(false));
                server.close();
            });
            server.on('error', () => resolve(true));
        });
    },
    
    async killProcessOnPort(port) {
        try {
            if (IS_WINDOWS) {
                try {
                    await exec(`FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') DO taskkill /F /PID %P`);
                    Logger.info(`Killed existing server process. Waiting for port to be released...`);
                } catch (error) {
                    if (error.code === 1 && error.cmd && error.cmd.includes('findstr')) {
                        Logger.info(`No existing process found on port ${port}`);
                    } else {
                        Logger.error(`Error killing existing server: ${error.message}`);
                    }
                }
            } else {
                try {
                    await exec(`lsof -t -i:${port} | xargs -r kill -9`);
                    Logger.info(`Killed existing server process. Waiting for port to be released...`);
                } catch (error) {
                    Logger.info(`No existing process found on port ${port}`);
                }
            }
            // Wait for port to be released
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            Logger.error(`Error in port cleanup: ${error.message}`);
        }
    }
};

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Stata extension activated');
    globalContext = context;
    
    // Get debug mode from settings
    const config = getConfig();
    debugMode = config.get('debugMode') || false;

    // Create output channels
    stataOutputChannel = vscode.window.createOutputChannel('Stata');
    stataOutputChannel.show(true);
    Logger.info('Stata extension activated.');
    
    stataAgentChannel = vscode.window.createOutputChannel('Stata Agent');
    
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(beaker) Stata";
    statusBarItem.tooltip = "Stata Integration";
    statusBarItem.command = 'stata-vscode.showOutput';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    Logger.info(`Extension path: ${context.extensionPath || __dirname}`);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('stata-vscode.runSelection', runSelection),
        vscode.commands.registerCommand('stata-vscode.runSelection2', runSelection2),  // 新增注册runselection2
        vscode.commands.registerCommand('stata-vscode.runFile', runFile),
        vscode.commands.registerCommand('stata-vscode.showOutput', showOutput),
        vscode.commands.registerCommand('stata-vscode.showOutputWebview', showStataOutputWebview),
        vscode.commands.registerCommand('stata-vscode.testMcpServer', testMcpServer),
        vscode.commands.registerCommand('stata-vscode.detectStataPath', detectAndUpdateStataPath),
        vscode.commands.registerCommand('stata-vscode.askAgent', askAgent)
    );

    // Register language configuration
    vscode.languages.setLanguageConfiguration('stata', {
        comments: { lineComment: '*', blockComment: ['/*', '*/'] },
        brackets: [['{', '}'], ['[', ']'], ['(', ')']],
        autoClosingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"', notIn: ['string'] },
            { open: "'", close: "'", notIn: ['string'] }
        ]
    });

    // Auto-detect Stata path
    detectStataPath().then(path => {
        if (path) {
            const userPath = config.get('stataPath');
            if (!userPath) {
                config.update('stataPath', path, vscode.ConfigurationTarget.Global)
                    .then(() => {
                        Logger.debug(`Automatically set Stata path to: ${path}`);
                        Logger.info(`Detected Stata installation: ${path}`);
                    });
            }
        }
    });

    // Register event handlers
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(handleConfigurationChange),
        vscode.window.onDidChangeActiveTextEditor(checkActiveEditorIsStata)
    );

    checkActiveEditorIsStata(vscode.window.activeTextEditor);
    
    // Check Python dependencies
    const pythonPathFile = FileUtils.getExtensionFilePath(FILE_PATHS.PYTHON_PATH);
    if (!FileUtils.checkFileExists(pythonPathFile)) {
        Logger.info('Setting up Python dependencies during extension activation...');
        installDependencies();
    } else {
        startMcpServer();
    }
}

function deactivate() {
    if (mcpServerProcess) {
        mcpServerProcess.kill();
        mcpServerRunning = false;
    }
}

// Clear configuration cache when settings change
function handleConfigurationChange(event) {
    if (event.affectsConfiguration('stata-vscode')) {
        configCache = null; // Clear cache
        
        // Update debug mode setting
        const config = getConfig();
        const newDebugMode = config.get('debugMode') || false;
        const debugModeChanged = newDebugMode !== debugMode;
        debugMode = newDebugMode;
        
        if (debugModeChanged) {
            Logger.info(`Debug mode ${debugMode ? 'enabled' : 'disabled'}`);
        }
        
        if (event.affectsConfiguration('stata-vscode.mcpServerPort') ||
            event.affectsConfiguration('stata-vscode.mcpServerHost') ||
            event.affectsConfiguration('stata-vscode.stataPath') ||
            event.affectsConfiguration('stata-vscode.debugMode')) {
            
            if (mcpServerRunning && mcpServerProcess) {
                mcpServerProcess.kill();
                mcpServerRunning = false;
                updateStatusBar();
                startMcpServer();
            }
        }
    }
}

// Update status bar
function updateStatusBar() {
    if (mcpServerRunning) {
        statusBarItem.text = "$(beaker) Stata: Connected";
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
        statusBarItem.text = "$(beaker) Stata: Disconnected";
        statusBarItem.backgroundColor = undefined;
    }
}

// Check if active editor is a Stata file
function checkActiveEditorIsStata(editor) {
    if (!editor) return;
    
    const doc = editor.document;
    const isStataFile = doc.fileName.toLowerCase().endsWith('.do') || 
                       doc.fileName.toLowerCase().endsWith('.ado') || 
                       doc.fileName.toLowerCase().endsWith('.mata') || 
                       doc.languageId === 'stata';
    
    if (isStataFile) {
        statusBarItem.show();
    } else {
        const config = getConfig();
        const alwaysShowStatusBar = config.get('alwaysShowStatusBar');
        if (!alwaysShowStatusBar) {
            statusBarItem.hide();
        }
    }
}

// Install Python dependencies
function installDependencies() {
    const checkPythonScriptPath = FileUtils.getExtensionFilePath('src/check-python.js');
    Logger.info('Setting up Python environment...');
    
    try {
        const installProcess = childProcess.fork(checkPythonScriptPath, [], {
            stdio: 'pipe',
            shell: true
        });
        
        installProcess.stdout?.on('data', (data) => {
            Logger.info(`[Python Setup] ${data.toString().trim()}`);
        });
        
        installProcess.stderr?.on('data', (data) => {
            Logger.error(`[Python Setup Error] ${data.toString().trim()}`);
        });
        
        installProcess.on('exit', (code) => {
            if (code === 0) {
                Logger.info('Python environment setup successfully');
                vscode.window.showInformationMessage('Stata MCP server Python environment setup successfully.');
                
                if (mcpServerProcess) {
                    mcpServerProcess.kill();
                    mcpServerProcess = null;
                    mcpServerRunning = false;
                    updateStatusBar();
                }
                
                setTimeout(() => {
                    Logger.info('Starting MCP server with configured Python environment...');
                    startMcpServer();
                }, 3000);
            } else {
                Logger.error(`Failed to set up Python environment. Exit code: ${code}`);
                vscode.window.showErrorMessage('Failed to set up Python environment for Stata MCP server. Please check the output panel for details.');
            }
        });
        
        installProcess.on('error', (error) => {
            Logger.error(`Error setting up Python environment: ${error.message}`);
            vscode.window.showErrorMessage(`Error setting up Python environment: ${error.message}`);
        });
    } catch (error) {
        Logger.error(`Error running Python setup script: ${error.message}`);
        vscode.window.showErrorMessage(`Error setting up Python environment: ${error.message}`);
    }
}

// Simplified stub functions for the remaining functionality
// (These would contain the remaining logic from the original file, 
// but using the new utilities and avoiding redundancy)

async function startMcpServer() {
    const config = getConfig();
    const host = config.get('mcpServerHost') || 'localhost';
    const port = config.get('mcpServerPort') || 4000;
    const forcePort = config.get('forcePort') || false;
    
    // Get Stata path and edition
    let stataPath = config.get('stataPath');
    const stataEdition = config.get('stataEdition') || 'mp';
    const logFileLocation = config.get('logFileLocation') || 'extension';
    const customLogDirectory = config.get('customLogDirectory') || '';
    
    Logger.info(`Using Stata edition: ${stataEdition}`);
    Logger.info(`Log file location: ${logFileLocation}`);
    
    if (!stataPath) {
        stataPath = await detectStataPath();
        if (stataPath) {
            await config.update('stataPath', stataPath, vscode.ConfigurationTarget.Global);
        } else {
            const result = await vscode.window.showErrorMessage(
                'Stata path not set. The extension needs to know where Stata is installed.',
                'Detect Automatically', 'Set Manually'
            );
            
            if (result === 'Detect Automatically') {
                await detectAndUpdateStataPath();
                stataPath = config.get('stataPath');
            } else if (result === 'Set Manually') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'stata-vscode.stataPath');
            }
            
            if (!stataPath) {
                vscode.window.showErrorMessage('Stata path is required for the extension to work.');
                return;
            }
        }
    }
    
    Logger.info(`Using Stata path: ${stataPath}`);

    // Check server health
    let serverHealthy = false;
    let stataInitialized = false;
    
    try {
        const healthResponse = await axios.get(`http://${host}:${port}/health`, { timeout: 1000 });
        if (healthResponse.status === 200) {
            serverHealthy = true;
            if (healthResponse.data && healthResponse.data.stata_available === true) {
                stataInitialized = true;
                Logger.debug(`Server reports Stata as available, initialization confirmed`);
            } else {
                Logger.info(`Server reports Stata as unavailable`);
                Logger.debug(`Server reports Stata as unavailable`);
            }
        }
    } catch (error) {
        serverHealthy = false;
        // Debug only - this is called repeatedly during startup polling
        Logger.debug(`Server health check failed: ${error.message}`);
    }
    
    if (serverHealthy && stataInitialized) {
        Logger.info(`MCP server already running on ${host}:${port} with Stata initialized`);
        mcpServerRunning = true;
        updateStatusBar();
        return;
    }
    
    if (serverHealthy && !stataInitialized) {
        Logger.info(`Server is running but Stata is not properly initialized. Forcing restart...`);
        await ServerUtils.killProcessOnPort(port);
    }

    try {
        const extensionPath = globalContext.extensionPath || __dirname;
        Logger.info(`Extension path: ${extensionPath}`);
        
        // Find server script
        const possibleServerPaths = [
            FileUtils.getExtensionFilePath('src/stata_mcp_server.py'),
            FileUtils.getExtensionFilePath('stata_mcp_server.py')
        ];
        
        let mcpServerPath = null;
        for (const p of possibleServerPaths) {
            if (FileUtils.checkFileExists(p)) {
                mcpServerPath = p;
                break;
            }
        }

        if (!mcpServerPath) {
            const error = 'MCP server script not found. Please check your installation.';
            Logger.error(`Error: ${error}`);
            vscode.window.showErrorMessage(error);
            return;
        }

        Logger.info(`Server script found at: ${mcpServerPath}`);
            
        // Check setup status
        const setupInProgressFile = FileUtils.getExtensionFilePath(FILE_PATHS.SETUP_IN_PROGRESS);
        const setupErrorFile = FileUtils.getExtensionFilePath(FILE_PATHS.SETUP_ERROR);
        
        if (FileUtils.checkFileExists(setupInProgressFile)) {
            const setupStartTime = FileUtils.readFileContent(setupInProgressFile);
            const setupStartDate = new Date(setupStartTime);
            const currentTime = new Date();
            const minutesSinceStart = (currentTime - setupStartDate) / (1000 * 60);
            
            if (minutesSinceStart < 10) {
                Logger.info(`Python dependency setup is in progress (started ${Math.round(minutesSinceStart)} minutes ago)`);
                vscode.window.showInformationMessage('Stata MCP extension is still setting up Python dependencies. Please wait a moment and try again.');
                return;
            } else {
                Logger.info('Python dependency setup seems to be stuck. Attempting to restart setup.');
                fs.unlinkSync(setupInProgressFile);
            }
        }

        if (FileUtils.checkFileExists(setupErrorFile)) {
            const errorDetails = FileUtils.readFileContent(setupErrorFile);
            if (errorDetails) {
                Logger.info(`Previous Python dependency setup failed: ${errorDetails}`);
            } else {
                Logger.info('Previous Python dependency setup failed. Details not available.');
            }
        }

        const pythonCommand = PythonUtils.getPythonCommand();
        
        // Determine log file path based on user preference
        let logFile;
        if (logFileLocation === 'extension') {
            // Create logs directory if it doesn't exist
            const logsDir = FileUtils.getExtensionFilePath('logs');
            if (!FileUtils.checkFileExists(logsDir)) {
                try {
                    require('fs').mkdirSync(logsDir, { recursive: true });
                    Logger.info(`Created logs directory: ${logsDir}`);
                } catch (error) {
                    Logger.error(`Failed to create logs directory: ${error.message}`);
                }
            }
            logFile = path.join(logsDir, FILE_PATHS.LOG_FILE);
        } else {
            // For workspace and custom, we'll use the default for server log, 
            // but the do file logs will be handled by the server based on settings
            logFile = FileUtils.getExtensionFilePath(FILE_PATHS.LOG_FILE);
        }
        
        // Get log level based on debug mode setting
        const logLevel = debugMode ? 'DEBUG' : 'INFO';
        
        // Prepare command
        let args = [];
        let cmdString;
        
        if (IS_WINDOWS) {
            const scriptDir = path.dirname(mcpServerPath);
            cmdString = `"${pythonCommand}" -m stata_mcp_server --port ${port}`;
            
            if (forcePort) cmdString += ' --force-port';
            if (stataPath) cmdString += ` --stata-path "${stataPath}"`;
            cmdString += ` --log-file "${logFile}" --stata-edition ${stataEdition} --log-level ${logLevel}`;
            cmdString += ` --log-file-location ${logFileLocation}`;
            if (customLogDirectory) cmdString += ` --custom-log-directory "${customLogDirectory}"`;
            
            Logger.info(`Starting server with command: ${cmdString}`);
            
            const options = { cwd: scriptDir, windowsHide: true };
            mcpServerProcess = childProcess.exec(cmdString, options);
        } else {
            args.push(mcpServerPath, '--port', port.toString());
            if (forcePort) args.push('--force-port');
            if (stataPath) args.push('--stata-path', stataPath);
            args.push('--log-file', logFile, '--stata-edition', stataEdition, '--log-level', logLevel);
            args.push('--log-file-location', logFileLocation);
            if (customLogDirectory) args.push('--custom-log-directory', customLogDirectory);
            
            cmdString = `${pythonCommand} ${args.join(' ')}`;
            Logger.info(`Starting server with command: ${cmdString}`);
            
            const options = {
                cwd: path.dirname(mcpServerPath),
                detached: true,
                shell: false,
                stdio: 'pipe',
                windowsHide: true
            };
            
            mcpServerProcess = spawn(pythonCommand, args, options);
        }

        // Set up process handlers
        if (mcpServerProcess.stdout) {
            mcpServerProcess.stdout.on('data', Logger.mcpServer);
        }
        
        if (mcpServerProcess.stderr) {
            mcpServerProcess.stderr.on('data', Logger.mcpServerError);
        }

        mcpServerProcess.on('error', ErrorHandler.serverStartFailed);
        mcpServerProcess.on('exit', ErrorHandler.serverExited);

        // Wait for server to start
        let serverRunning = false;
        const maxAttempts = 30;
        const checkInterval = 500;
        
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            
            if (await isServerRunning(host, port)) {
                serverRunning = true;
                break;
            }
        }
        
        if (serverRunning) {
            mcpServerRunning = true;
            Logger.info(`MCP server started successfully on ${host}:${port}`);
            autoUpdateGlobalMcpConfig();
        } else {
            Logger.info(`MCP server failed to start within 15 seconds`);
            vscode.window.showErrorMessage('Failed to start MCP server. Check the Stata output panel for details.');
        }
        
        updateStatusBar();
    } catch (error) {
        Logger.error(`Error starting MCP server: ${error.message}`);
        vscode.window.showErrorMessage(`Error starting MCP server: ${error.message}`);
    }
}

async function isServerRunning(host, port) {
    return new Promise(async (resolve) => {
        const maxAttempts = 30;
        let attempts = 0;
        
        async function checkServer() {
            try {
                const healthResponse = await axios.get(`http://${host}:${port}/health`, { timeout: 1000 });
                
                if (healthResponse.status === 200) {
                    if (healthResponse.data && healthResponse.data.stata_available === true) {
                        Logger.debug(`Stata is properly initialized`);
                        resolve(true);
                        return;
                    } else {
                        Logger.debug(`Server responded but Stata is not available`);
                    }
                }
            } catch (error) {
                // Debug only - this is called repeatedly during startup polling
                Logger.debug(`Server health check failed: ${error.message}`);
            }
            
            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(checkServer, 500);
            } else {
                resolve(false);
            }
        }
        
        checkServer();
    });
}

async function runSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }
    
    const selection = editor.selection;
    let text;
    
    if (selection.isEmpty) {
        const line = editor.document.lineAt(selection.active.line);
        text = line.text;
    } else {
        text = editor.document.getText(selection);
    }
    
    if (!text.trim()) {
        vscode.window.showErrorMessage('No text selected or current line is empty');
        return;
    }
    
    await executeStataCode(text, 'run_selection');
}

// 新增的runSelection2函数 - 在执行selection后自动添加进一个vsbrowse命令
// 目的是每次执行stata:run selection后都可以自动用pandasgui来browse工作数据集
async function runSelection2() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }
    
    const selection = editor.selection;
    let text;
    
    if (selection.isEmpty) {
        const line = editor.document.lineAt(selection.active.line);
        text = line.text;
    } else {
        text = editor.document.getText(selection);
    }
    
    if (!text.trim()) {
        vscode.window.showErrorMessage('No text selected or current line is empty');
        return;
    }
    
    // 在原始selection内容后添加vsbrowse命令
    const enhancedText = text.trim() + '\nvsbrowse';
    
    Logger.info(`Enhanced selection with vsbrowse command: ${enhancedText}`);
    
    await executeStataCode(enhancedText, 'run_selection');
}

async function runFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const filePath = editor.document.uri.fsPath;
    
    if (!filePath.toLowerCase().endsWith('.do')) {
        vscode.window.showErrorMessage('Not a Stata .do file');
        return;
    }

    await executeStataFile(filePath);
}

async function executeStataCode(code, toolName = 'run_command') {
    const config = getConfig();
    const host = config.get('mcpServerHost') || 'localhost';
    const port = config.get('mcpServerPort') || 4000;
    
    if (!await isServerRunning(host, port)) {
        await startMcpServer();
        if (!await isServerRunning(host, port)) {
            vscode.window.showErrorMessage('Failed to connect to MCP server');
            return;
        }
    }
    
    stataOutputChannel.show(true);
    Logger.debug(`Executing Stata code: ${code}`);
    
    const paramName = toolName === 'run_selection' ? 'selection' : 'command';

    try {
        const requestBody = {
            tool: toolName,
            parameters: { [paramName]: code }
        };
        
        const response = await axios.post(
            `http://${host}:${port}/v1/tools`,
            requestBody,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            }
        );
        
        if (response.status === 200) {
            const result = response.data;
            
            if (result.status === 'success') {
                const outputContent = result.result || 'Command executed successfully (no output)';
                stataOutputChannel.clear();
                stataOutputChannel.appendLine(outputContent);
                stataOutputChannel.show(true);
                return outputContent;
            } else {
                const errorMessage = result.message || 'Unknown error';
                stataOutputChannel.appendLine(`Error: ${errorMessage}`);
                stataOutputChannel.show(true);
                vscode.window.showErrorMessage(`Stata error: ${errorMessage}`);
                return null;
            }
        } else {
            const errorMessage = `HTTP error: ${response.status}`;
            stataOutputChannel.appendLine(errorMessage);
            stataOutputChannel.show(true);
            vscode.window.showErrorMessage(errorMessage);
            return null;
        }
    } catch (error) {
        Logger.debug(`Error executing Stata code: ${error.message}`);
        const errorMessage = `Error executing Stata code: ${error.message}`;
        stataOutputChannel.appendLine(errorMessage);
        stataOutputChannel.show(true);
        vscode.window.showErrorMessage(errorMessage);
        return null;
    }
}

async function executeStataFile(filePath) {
    const config = getConfig();
    const host = config.get('mcpServerHost') || 'localhost';
    const port = config.get('mcpServerPort') || 4000;
    const runFileTimeout = config.get('runFileTimeout') || 600;
    
    stataOutputChannel.show(true);
    Logger.debug(`Executing Stata file: ${filePath}`);
    Logger.debug(`Using timeout: ${runFileTimeout} seconds`);
    
    if (!await isServerRunning(host, port)) {
        await startMcpServer();
        if (!await isServerRunning(host, port)) {
            const errorMessage = 'Failed to connect to MCP server';
            stataOutputChannel.appendLine(errorMessage);
            stataOutputChannel.show(true);
            vscode.window.showErrorMessage(errorMessage);
            return;
        }
    }
    
    try {
        const requestBody = {
            tool: 'run_file',
            parameters: {
                file_path: filePath,
                timeout: runFileTimeout
            }
        };
        
        const response = await axios.post(
            `http://${host}:${port}/v1/tools`,
            requestBody,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: (runFileTimeout * 1000) + 10000
            }
        );
        
        if (response.status === 200) {
            const result = response.data;
            
            if (result.status === 'success') {
                const outputContent = result.result || 'File executed successfully (no output)';
                stataOutputChannel.clear();
                stataOutputChannel.appendLine(outputContent);
                stataOutputChannel.show(true);
                return outputContent;
            } else {
                const errorMessage = result.message || 'Unknown error';
                stataOutputChannel.appendLine(`Error: ${errorMessage}`);
                stataOutputChannel.show(true);
                vscode.window.showErrorMessage(`Error executing Stata file: ${errorMessage}`);
                return null;
            }
        } else {
            const errorMessage = `HTTP error: ${response.status}`;
            stataOutputChannel.appendLine(errorMessage);
            stataOutputChannel.show(true);
            vscode.window.showErrorMessage(errorMessage);
            return null;
        }
    } catch (error) {
        Logger.debug(`Error executing Stata file: ${error.message}`);
        const errorMessage = `Error executing Stata file: ${error.message}`;
        stataOutputChannel.appendLine(errorMessage);
        stataOutputChannel.show(true);
        vscode.window.showErrorMessage(errorMessage);
        return null;
    }
}

function showStataOutputWebview(content = null) {
    if (!stataOutputWebviewPanel) {
        stataOutputWebviewPanel = vscode.window.createWebviewPanel(
            'stataOutput',
            'Stata Output',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );
        
        stataOutputWebviewPanel.onDidDispose(
            () => { stataOutputWebviewPanel = null; },
            null,
            globalContext.subscriptions
        );
    }
    
    if (content) {
        const htmlContent = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/\n/g, '<br>');
        
        stataOutputWebviewPanel.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Stata Output</title>
                <style>
                    body {
                        font-family: 'Courier New', monospace;
                        white-space: pre-wrap;
                        padding: 10px;
                    }
                </style>
            </head>
            <body>${htmlContent}</body>
            </html>
        `;
    }
    
    stataOutputWebviewPanel.reveal(vscode.ViewColumn.Two);
}

async function testMcpServer() {
    const config = getConfig();
    const host = config.get('mcpServerHost') || 'localhost';
    const port = config.get('mcpServerPort') || 4000;
    
    try {
        const testCommand = "di \"Hello from Stata MCP Server!\"";
        const testResponse = await axios.post(
            `http://${host}:${port}/v1/tools`,
            {
                tool: "stata_run_selection",
                parameters: { selection: testCommand }
            },
            { headers: { 'Content-Type': 'application/json' } }
        );
        
        if (testResponse.status === 200) {
            vscode.window.showInformationMessage(`MCP server is running properly`);
            
            let result = "No result returned";
            if (testResponse.data && typeof testResponse.data === 'object') {
                result = testResponse.data.result || "No result in response data";
            } else if (testResponse.data) {
                result = String(testResponse.data);
            }
            
            stataOutputChannel.appendLine('Test Command Result:');
            stataOutputChannel.appendLine(result);
            stataOutputChannel.show();
            return true;
        } else {
            vscode.window.showErrorMessage(`MCP server returned status: ${testResponse.status}`);
            return false;
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to connect to MCP server: ${error.message}`);
        
        const startServer = await vscode.window.showErrorMessage(
            'MCP server is not running. Do you want to start it?',
            'Yes', 'No'
        );
        
        if (startServer === 'Yes') {
            await startMcpServer();
        }
        
        return false;
    }
}

async function askAgent() {
    if (!agentWebviewPanel) {
        agentWebviewPanel = vscode.window.createWebviewPanel(
            'stataAgent',
            'Stata Agent',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        agentWebviewPanel.webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'askAgent') {
                    const response = await getAgentResponse(message.text);
                    agentWebviewPanel.webview.postMessage({ command: 'agentResponse', text: response });
                } else if (message.command === 'runCode') {
                    await executeStataCode(message.code, 'run_selection');
                    agentWebviewPanel.webview.postMessage({ command: 'codeRun' });
                }
            },
            undefined,
            globalContext.subscriptions
        );

        agentWebviewPanel.onDidDispose(
            () => { agentWebviewPanel = null; },
            null,
            globalContext.subscriptions
        );

        agentWebviewPanel.webview.html = getAgentWebviewContent();
    } else {
        agentWebviewPanel.reveal();
    }
}

async function getAgentResponse(query) {
    stataAgentChannel.appendLine(`User: ${query}`);
    
    let response = '';
    if (query.toLowerCase().includes('help')) {
        response = 'I can help you with Stata commands and syntax. What would you like to know?';
    } else if (query.toLowerCase().includes('regression')) {
        response = 'To run a regression in Stata, you can use the `regress` command. For example:\n\n```\nregress y x1 x2 x3\n```';
    } else if (query.toLowerCase().includes('summarize') || query.toLowerCase().includes('summary')) {
        response = 'To get summary statistics in Stata, you can use the `summarize` command. For example:\n\n```\nsummarize x y z\n```';
    } else if (query.toLowerCase().includes('graph') || query.toLowerCase().includes('plot')) {
        response = 'To create graphs in Stata, you can use various graph commands. For example:\n\n```\ngraph twoway scatter y x\n```';
    } else {
        response = 'I\'m a simple Stata assistant. You can ask me about basic Stata commands, regression, summary statistics, or graphs.';
    }
    return response;
}

function getAgentWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stata Agent</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; display: flex; flex-direction: column; height: 100vh; }
        #conversation { flex-grow: 1; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; }
        .user-message { background-color: #e6f7ff; padding: 8px 12px; border-radius: 12px; margin: 5px 0; max-width: 80%; align-self: flex-end; }
        .agent-message { background-color: #f0f0f0; padding: 8px 12px; border-radius: 12px; margin: 5px 0; max-width: 80%; }
        #input-area { display: flex; }
        #user-input { flex-grow: 1; padding: 10px; margin-right: 5px; }
        button { padding: 10px 15px; background-color: #0078d4; color: white; border: none; cursor: pointer; }
        button:hover { background-color: #005a9e; }
        pre { background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }
        code { font-family: 'Courier New', monospace; }
    </style>
</head>
<body>
    <div id="conversation"></div>
    <div id="input-area">
        <input type="text" id="user-input" placeholder="Ask me about Stata...">
        <button id="send-button">Send</button>
    </div>
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const conversation = document.getElementById('conversation');
            const userInput = document.getElementById('user-input');
            const sendButton = document.getElementById('send-button');
            
            addAgentMessage('Hello! I am your Stata assistant. How can I help you today?');
            
            sendButton.addEventListener('click', sendMessage);
            userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
            
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'agentResponse': addAgentMessage(message.text); break;
                    case 'codeRun': addAgentMessage('Code executed in Stata.'); break;
                }
            });
            
            function sendMessage() {
                const text = userInput.value.trim();
                if (text) {
                    addUserMessage(text);
                    vscode.postMessage({ command: 'askAgent', text: text });
                    if (text.toLowerCase().startsWith('run:')) {
                        const code = text.substring(4).trim();
                        vscode.postMessage({ command: 'runCode', code: code });
                    }
                    userInput.value = '';
                }
            }
            
            function addUserMessage(text) {
                const div = document.createElement('div');
                div.className = 'user-message';
                div.textContent = text;
                conversation.appendChild(div);
                conversation.scrollTop = conversation.scrollHeight;
            }
            
            function addAgentMessage(text) {
                const div = document.createElement('div');
                div.className = 'agent-message';
                
                if (text.includes('\`\`\`')) {
                    const parts = text.split('\`\`\`');
                    for (let i = 0; i < parts.length; i++) {
                        if (i % 2 === 0) {
                            const textNode = document.createTextNode(parts[i]);
                            div.appendChild(textNode);
                        } else {
                            const pre = document.createElement('pre');
                            const code = document.createElement('code');
                            code.textContent = parts[i];
                            pre.appendChild(code);
                            div.appendChild(pre);
                        }
                    }
                } else {
                    div.textContent = text;
                }
                
                conversation.appendChild(div);
                conversation.scrollTop = conversation.scrollHeight;
            }
        })();
    </script>
</body>
</html>`;
}

function autoUpdateGlobalMcpConfig() {
    const config = getConfig();
    const host = config.get('mcpServerHost') || 'localhost';
    const port = config.get('mcpServerPort') || 4000;
    
    try {
        const homeDir = os.homedir();
        const mcpConfigDir = path.join(homeDir, '.cursor');
        const mcpConfigPath = path.join(mcpConfigDir, 'mcp.json');
        
        Logger.info(`Checking MCP configuration at ${mcpConfigPath}`);
        
        if (!FileUtils.checkFileExists(mcpConfigDir)) {
            fs.mkdirSync(mcpConfigDir, { recursive: true });
            Logger.info(`Created directory: ${mcpConfigDir}`);
        }
        
        let mcpConfig = { mcpServers: {} };
        let configChanged = false;
        
        if (FileUtils.checkFileExists(mcpConfigPath)) {
            try {
                const configContent = FileUtils.readFileContent(mcpConfigPath);
                mcpConfig = JSON.parse(configContent);
                mcpConfig.mcpServers = mcpConfig.mcpServers || {};
                
                const currentConfig = mcpConfig.mcpServers["stata-mcp"];
                const correctUrl = `http://${host}:${port}/mcp`;
                
                if (!currentConfig || currentConfig.url !== correctUrl || currentConfig.transport !== "sse") {
                    Logger.info(`Updating stata-mcp configuration to ${correctUrl}`);
                    mcpConfig.mcpServers["stata-mcp"] = {
                        url: correctUrl,
                        transport: "sse"
                    };
                    configChanged = true;
                } else {
                    Logger.info(`stata-mcp configuration is already correct`);
                }
            } catch (error) {
                Logger.info(`Error reading MCP config: ${error.message}`);
                mcpConfig = { mcpServers: {} };
                mcpConfig.mcpServers["stata-mcp"] = {
                    url: `http://${host}:${port}/mcp`,
                    transport: "sse"
                };
                configChanged = true;
            }
        } else {
            Logger.info(`Creating new MCP configuration`);
            mcpConfig.mcpServers["stata-mcp"] = {
                url: `http://${host}:${port}/mcp`,
                transport: "sse"
            };
            configChanged = true;
        }
        
        if (configChanged) {
            FileUtils.writeFileContent(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
            Logger.info(`Updated MCP configuration at ${mcpConfigPath}`);
        }
        
        return true;
    } catch (error) {
        Logger.info(`Error updating MCP config: ${error.message}`);
        Logger.debug(`Error updating MCP config: ${error.message}`);
        return false;
    }
}

async function detectStataPath() {
    if (detectedStataPath) return detectedStataPath;
    
    let possiblePaths = [];
    
    if (IS_WINDOWS) {
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        possiblePaths = [
            path.join(programFiles, 'Stata19'),
            path.join(programFiles, 'Stata18'),
            path.join(programFiles, 'Stata17'),
            path.join(programFilesX86, 'Stata19'),
            path.join(programFilesX86, 'Stata18'),
            path.join(programFilesX86, 'Stata17')
        ];
    } else if (IS_MAC) {
        possiblePaths = [
            '/Applications/Stata19',
            '/Applications/Stata18',
            '/Applications/Stata17',
            '/Applications/StataNow',
            '/Applications/Stata'
        ];
    } else if (IS_LINUX) {
        possiblePaths = [
            '/usr/local/stata19',
            '/usr/local/stata18',
            '/usr/local/stata17',
            '/usr/local/stata'
        ];
    }
    
    for (const p of possiblePaths) {
        if (FileUtils.checkFileExists(p)) {
            Logger.debug(`Found Stata at: ${p}`);
            detectedStataPath = p;
            return p;
        }
    }
    
    return null;
}

async function detectAndUpdateStataPath() {
    const path = await detectStataPath();
    
    if (path) {
        const config = getConfig();
        await config.update('stataPath', path, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Stata path detected and set to: ${path}`);
        return path;
    } else {
        vscode.window.showErrorMessage('Could not detect Stata installation path. Please set it manually in settings.');
        vscode.commands.executeCommand('workbench.action.openSettings', 'stata-vscode.stataPath');
        return null;
    }
}

function showOutput(content) {
    if (content) stataOutputChannel.append(content);
    stataOutputChannel.show(true);
}

module.exports = {
    activate,
    deactivate
}; 
