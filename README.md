# Stata MCP Extension for VS Code and Cursor

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=DeepEcon.stata-mcp)
[![GitHub license](https://img.shields.io/github/license/hanlulong/stata-mcp)](https://github.com/hanlulong/stata-mcp/blob/main/LICENSE)

This extension provides Stata integration for Visual Studio Code and Cursor IDE using the Model Context Protocol (MCP). The extension allows you to:

- Run Stata commands directly from VS Code or Cursor
- Execute selections or entire .do files
- View Stata output in the editor in real-time
- Get AI assistant integration through the MCP protocol
- Experience enhanced AI coding with Cursor or Cline

## Features

- **Run Stata Commands**: Execute selections or entire .do files directly from your editor
- **Syntax Highlighting**: Full syntax support for Stata .do, .ado, .mata, and .doh files
- **AI Assistant Integration**: Contextual help and code suggestions via MCP
- **Cross-platform**: Works on Windows, macOS, and Linux
- **Automatic Stata Detection**: Automatically finds your Stata installation
- **Real-time Output**: See Stata results instantly in your editor

> **Looking for other Stata integrations?**
> - Use Stata with Notepad++ and Sublime Text 3? See [here](https://github.com/sook-tusk/Tech_Integrate_Stata_R_with_Editors)
> - Use Stata MCP in Claude Desktop? See [here](https://github.com/SepineTam/stata-mcp)
> - Use Stata via Jupyter? See [here](https://github.com/hanlulong/stata-mcp/blob/main/jupyter-stata.md)

## Requirements

- Stata 17 or higher installed on your machine
- [UV](https://github.com/astral-sh/uv) package manager (automatically installed or can be installed manually if needed)

## Installation

### Option 1: From VS Code Marketplace

Install this extension directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=DeepEcon.stata-mcp).

```bash
code --install-extension DeepEcon.stata-mcp
```

Or:
1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X)
3. Search for "Stata MCP"
4. Click "Install"

### Option 2: From .vsix file

1. Download the extension package `stata-mcp-0.1.7.vsix` from the [releases page](https://github.com/hanlulong/stata-mcp/releases).
2. Install using one of these methods:

For VS Code:
```bash
code --install-extension path/to/stata-mcp-0.1.7.vsix
```

For Cursor:
```bash
cursor --install-extension path/to/stata-mcp-0.1.7.vsix
```

Or in VS Code:
1. Go to Extensions view
2. Click on "..." menu in the top-right
3. Select "Install from VSIX..."
4. Navigate to and select the downloaded .vsix file

Starting with version 0.1.7, the extension integrates a fast Python package installer called `uv` to set up the environment. If uv is not found on your system, the extension will attempt to install it automatically.

## Cursor MCP Configuration

To enable AI integration with Stata in Cursor, you need to configure the MCP connection:

1. Create or edit the MCP configuration file:
   - On macOS/Linux: `~/.cursor/mcp.json`
   - On Windows: `%USERPROFILE%\.cursor\mcp.json`

2. Add the following configuration to your `mcp.json` file:

```json
{
  "mcpServers": {
    "stata-mcp": {
      "url": "http://localhost:4000/mcp",
      "transport": "sse"
    }
  }
}
```

3. If you already have other MCP configurations in the file, just add the "stata-mcp" section to your existing "mcpServers" object.

4. Save the file and restart Cursor

This configuration allows Cursor's AI to communicate with the Stata MCP server that starts automatically when you use the extension. When properly configured, the AI assistant can:
- Interact with your Stata sessions
- Execute Stata commands
- Understand your datasets and variables
- Provide more context-aware coding assistance
- Help with data analysis and visualizations

## Cline MCP Configuration

To use Stata MCP with Cline in VS Code:

1. First, ensure you have the [Cline extension](https://marketplace.visualstudio.com/items?itemName=Cline.cline) installed in VS Code.

2. The Stata MCP extension will automatically detect Cline and configure it when installed. The configuration is added to:
   - On macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
   - On Windows: `%APPDATA%/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
   - On Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

3. The automatic configuration adds:

```json
{
  "mcpServers": {
    "stata-mcp": {
      "url": "http://localhost:4000/mcp",
      "transport": "sse"
    }
  }
}
```

4. If you need to manually configure Cline:
   - Open the configuration file mentioned above
   - Add the "stata-mcp" section to your existing "mcpServers" object
   - Save the file and restart VS Code

5. Configuration options:
   - `stata-vscode.autoConfigureCline`: Enable/disable automatic Cline configuration (default: true)
   - `stata-vscode.clineConfigPath`: Specify a custom path for the Cline configuration file
   - These can be set in VS Code settings (File > Preferences > Settings)

When properly configured, Cline's AI assistant can:
- Execute and analyze Stata commands
- Access your Stata session context
- Provide data analysis suggestions
- Help with statistical modeling
- Debug Stata code issues

Common troubleshooting steps:
1. Ensure both Cline and Stata MCP extensions are installed
2. Check that the MCP server is running (Status bar should show "Stata")
3. Verify the configuration file exists and contains correct settings
4. Try restarting VS Code after configuration changes
5. Check the Output panel (View > Output > Stata MCP) for any error messages

## Extension Settings

You can customize the extension behavior through VS Code settings:

- `stata-vscode.stataPath`: Path to Stata installation directory
- `stata-vscode.pythonPath`: Path to Python interpreter. If not set, the extension will try to use the system Python or Anaconda base environment
- `stata-vscode.mcpServerHost`: Host for MCP server (default: localhost)
- `stata-vscode.mcpServerPort`: Port for the MCP server (default: 4000)
- `stata-vscode.autoStartServer`: Automatically start MCP server when extension activates (default: true)
- `stata-vscode.debugMode`: Show detailed debug information in output panel (default: false)
- `stata-vscode.forcePort`: Force the MCP server to use the specified port even if it's already in use (default: false)
- `stata-vscode.useUvForPython`: Use uv for Python environment management which is faster and more reliable (default: true)
- `stata-vscode.autoConfigureCline`: Automatically configure Cline MCP settings when Cline is installed (default: true)
- `stata-vscode.clineConfigPath`: Custom path to Cline configuration file (optional, defaults to standard locations)

## Usage

1. Open a Stata .do file
2. Run commands using:
   - **Run Selection**: Select Stata code and press `Ctrl+Shift+Enter` (or `Cmd+Shift+Enter` on Mac)
   - **Run File**: Press `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac) to run the entire .do file
3. View output in the editor panel

## How It Works

The extension creates a local MCP server that connects your editor to Stata, enabling:

1. **Command Execution**: Run Stata commands and see results instantly
2. **Context Awareness**: AI assistants understand your Stata data and commands
3. **Enhanced Productivity**: Get intelligent code suggestions and documentation

## Python Environment Management

This extension uses [uv](https://github.com/astral-sh/uv), a fast Python package installer built in Rust, to manage Python dependencies. Key features:

- Automatic Python setup and dependency management
- Creates isolated environments that won't conflict with your system
- Works across Windows, macOS, and Linux
- 10-100x faster than traditional pip installations

**If you encounter any UV-related errors during installation:**
1. Install UV manually:
   ```bash
   # Windows (PowerShell as Administrator)
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   
   # macOS/Linux
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```
2. Follow the [Troubleshooting](#common-installation-issues) steps to reinstall the extension

You can control UV usage with the `stata-vscode.useUvForPython` setting (default: true).

Starting with version 0.1.7, this extension integrates the fast Python package installer [uv](https://github.com/astral-sh/uv) to set up the environment. If uv is not found on your system, the extension will attempt to install it automatically.

## Troubleshooting

If you encounter issues with the extension, follow these steps to perform a clean reinstallation:

### Windows

1. Close all VS Code/Cursor windows
2. Open Task Manager (Ctrl+Shift+Esc):
   - Go to the "Processes" tab
   - Look for any running Python or `uvicorn` processes
   - Select each one and click "End Task"

3. Remove the extension folder:
   - Press Win+R, type `%USERPROFILE%\.vscode\extensions` and press Enter
   - Delete the folder `deepecon.stata-mcp-0.x.x` (where x.x is the version number)
   - For Cursor: The path is `%USERPROFILE%\.cursor\extensions`

4. Install UV manually (if needed):
   ```powershell
   # Open PowerShell as Administrator and run:
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```

5. Restart your computer (recommended but optional)

6. Install the latest version of the extension from the marketplace

### macOS/Linux

1. Close all VS Code/Cursor windows

2. Kill any running Python processes:
   ```bash
   # Find Python processes
   ps aux | grep python
   # Kill them (replace <PID> with the process numbers you found)
   kill -9 <PID>
   ```

3. Remove the extension folder:
   ```bash
   # For VS Code:
   rm -rf ~/.vscode/extensions/deepecon.stata-mcp-0.x.x
   # For Cursor:
   rm -rf ~/.cursor/extensions/deepecon.stata-mcp-0.x.x
   ```

4. Install UV manually (if needed):
   ```bash
   # Using curl:
   curl -LsSf https://astral.sh/uv/install.sh | sh

   # Or using wget:
   wget -qO- https://astral.sh/uv/install.sh | sh
   ```

5. Restart your terminal or computer (recommended but optional)

6. Install the latest version of the extension from the marketplace

### Additional Troubleshooting Tips

- If you see errors about Python or UV not being found, make sure they are in your system's PATH:
  - Windows: Type "Environment Variables" in the Start menu and add the installation paths
  - macOS/Linux: Add the paths to your `~/.bashrc`, `~/.zshrc`, or equivalent

- If you get permission errors:
  - Windows: Run VS Code/Cursor as Administrator
  - macOS/Linux: Check folder permissions with `ls -la` and fix with `chmod` if needed

- If the extension still fails to initialize:
  1. Open the Output panel (View -> Output)
  2. Select "Stata-MCP" from the dropdown
  3. Check the logs for specific error messages
  4. If you see Python-related errors, try manually creating a Python 3.11 virtual environment:
     ```bash
     # Windows
     py -3.11 -m venv .venv

     # macOS/Linux
     python3.11 -m venv .venv
     ```

- For persistent issues:
  1. Check your system's Python installation: `python --version` or `python3 --version`
  2. Verify UV installation: `uv --version`
  3. Make sure you have Python 3.11 or later installed
  4. Check if your antivirus software is blocking Python or UV executables

When opening an issue on GitHub, please provide:
- The complete error message from the Output panel (View -> Output -> Stata-MCP)
- Your operating system and version
- VS Code/Cursor version
- Python version (`python --version`)
- UV version (`uv --version`)
- Steps to reproduce the issue
- Any relevant log files or screenshots
- The content of your MCP configuration file if applicable

This detailed information will help us identify and fix the issue more quickly. You can open issues at: [GitHub Issues](https://github.com/hanlulong/stata-mcp/issues)

## License

MIT

## Credits

Created by Lu Han
Published by DeepEcon
