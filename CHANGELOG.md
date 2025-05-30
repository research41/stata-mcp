# Changelog

## Version 0.2.4 (2024-12-18)
- Implemented more robust MCP server setups and connection handling
- Enhanced Stata path detection with improved support for Stata 19
- Improved server stability and error recovery mechanisms
- Better handling of Stata installation discovery across different versions

## Version 0.2.3 (2024-07-02)
- Added ability for users to select their Stata edition (MP, SE, or IC)
- Enhanced user control with new `stata-vscode.stataEdition` setting
- Improved documentation for edition-specific configurations
- Updated troubleshooting guidance for Stata edition selection

## Version 0.2.2 (2024-07-01)
- Updated README with higher resolution demonstration GIF at 2x speed
- Improved visual documentation for better user understanding
- Enhanced installation instructions for clarity

## Version 0.2.1 (2024-06-31)
- Added official extension logo
- Significantly reduced package size (from 170MB to 4.7MB)
- Improved extension visibility in marketplace with new branding
- Excluded large media files from the extension package
- Maintained full demo experience in GitHub repository

## Version 0.2.0 (2024-06-30)
- Enhanced README with improved installation instructions
- Added separate Cursor and VS Code installation sections
- Improved MCP configuration documentation for all supported platforms
- Added detailed troubleshooting steps for Cursor, Cline, and Claude Desktop
- Updated configuration file path information for better user experience
- General improvements to documentation clarity and organization

## Version 0.1.9 (2024-06-30)
- Added Claude Desktop MCP configuration instructions
- Improved setup documentation for using with Claude Desktop via mcp-proxy
- Enhanced integration with VS Code, Cursor, and Claude Desktop
- Updated README with comprehensive tool configuration guidance

## Version 0.1.8 (2024-06-30)
- Updated extension description to better reflect its purpose
- Added Cline support mention in the README
- Enhanced documentation for MCP configuration with Cline
- General improvements to installation instructions
- Improved compatibility with VS Code and Cursor IDE

## 0.1.6 (2024-05-19)
- Improved Python environment detection and setup in `check-python.js`
- Enhanced error handling when checking Python installations

## [0.1.5] - 2024-03-31

### Added
- Added examples directory with Jupyter notebook integration example
- Enhanced troubleshooting guide with UV-specific installation help
- Added links to other Stata integrations

### Improved
- Better error handling for UV installation issues
- Updated documentation for improved clarity

## [0.1.4] - 2024-03-30

### Improved
- Enhanced error handling and stability improvements
- Updated documentation for better clarity

## [0.1.3] - 2024-03-30

### Fixed
- Forced UTF-8 encoding in the MCP server to resolve character decoding issues in Chinese operating systems
- Improved cross-platform compatibility for non-English language environments

## [0.1.2] - 2024-03-30

### Improved
- Enhanced error handling for Python environment setup
- Better compatibility with older VS Code versions
- Updated documentation for clear installation instructions

## [0.1.1] - 2024-03-30

### Improved
- Enhanced Python environment management with uv integration
- Smoother installation process across different platforms
- Documentation clarity for the uv integration feature

## [0.1.0] - 2024-03-29

### Added
- Support for uv, a fast Python package installer built in Rust
- New configuration option `stata-vscode.useUvForPython` to enable/disable uv
- New configuration option `stata-vscode.forcePort` to force using the specified port

### Improved
- Better port management for the MCP server
- Updated Python environment management for faster installation
- Documentation for all available configuration options

## [0.0.9] - 2024-03-28

### Fixed
- Completely removed tar dependency to prevent installation errors
- Fixed missing pythonPath configuration property
- Improved package.json dependencies for better cross-platform compatibility
- Fixed packaging issues with Python environment detection

## [0.0.8] - 2024-03-27

### Fixed
- Removed dependency on Node.js tar package to prevent installation issues
- Improved platform compatibility using native system tar commands

## [0.0.7] - 2024-03-26

### Added
- Support for user-chosen Python path through `stata-vscode.pythonPath` setting
- Added extension settings documentation in README
- Improved Python environment handling

## [0.0.6] - 2024-03-25

### Added
- Support for user-chosen Python path through `stata-vscode.pythonPath` setting
- Added extension settings documentation in README
- Improved Python environment handling

## [0.0.1] - 2024-03-22

### Added
- Initial release of the Stata MCP extension
- Run Stata commands, selections, and files directly from VS Code
- Syntax highlighting for Stata code files (.do, .ado, .mata, .doh)
- Integration with AI assistants through Model Context Protocol (MCP)
- Automatic Stata path detection
- Cross-platform support (Windows, macOS, Linux)
- Server-Sent Events (SSE) transport for MCP
- Customizable server configuration

### Fixed
- Server connection issues with Stata library path
- Improved error handling and logging
- Fixed syntax highlighting for macros and comments

## [0.1.7] - 2024-03-30
- Added support for Cline IDE
- Improved installation instructions for both Cursor and Cline
- Updated documentation to reflect multi-IDE support

## [1.1.0] - 2025-03-17

### Added
- Added `