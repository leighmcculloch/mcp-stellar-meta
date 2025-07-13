# Stellar MCP Server for Historical Ledger Meta

A [Claude Model Context Protocol (MCP)] server that exposes Stellar historical
ledger meta, XDR-JSON encoded, that Claude can use to understand what happened
in a ledger.

[Claude Model Context Protocol (MCP)]: https://www.claudemcp.com/

## Usage (Claude Desktop)

To use with Claude Desktop:

1. Add the server config:

   On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

   On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "mcp-stellar-xdr-json": {
         "command": "npx",
         "args": [
           "deno",
           "run",
           "--allow-read",
           "https://github.com/leighmcculloch/mcp-stellar-meta/raw/refs/heads/main/mcp-stellar-meta.js"
         ]
       }
     }
   }
   ```

2. Reopen Claude Desktop.

## Usage (Claude Code)

1. Add the server config:

   ```
   claude mcp add \
     --transport stdio \
     --scope user \
     mcp-stellar-xdr-json \
     -- \
     npx deno run --allow-read https://github.com/leighmcculloch/mcp-stellar-meta/raw/refs/heads/main/mcp-stellar-meta.js
   ```

2. Reopen Claude Code.

## Example

### Understanding a Transaction

https://github.com/user-attachments/assets/8c4eef81-9109-432d-8be6-8e24ead74eef

### Understanding a Contract Event

https://github.com/user-attachments/assets/91523c7e-652e-46f8-92af-2315f408e32d
