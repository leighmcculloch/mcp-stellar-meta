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
       "stellar-meta": {
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
     stellar-meta \
     -- \
     npx deno run --allow-read https://github.com/leighmcculloch/mcp-stellar-meta/raw/refs/heads/main/mcp-stellar-meta.js
   ```

2. Reopen Claude Code.

## Example

### Finding out what happened in a ledger

https://github.com/user-attachments/assets/10e349d6-b976-42cd-892c-74614b860911

### Finding out about a transaction

https://github.com/user-attachments/assets/43336a26-aea1-4f00-8143-22eaf3148999

