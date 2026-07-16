# AG Project Monitor — MCP Server

Giorgos controls his entire office from Claude chat. 11 tools:

| Tool | Example |
|---|---|
| create_task | "Δώσε εργασία στη Βάσω: έλεγξε τον σωλήνα μέχρι Παρασκευή" |
| list_tasks | "Τι έχει η Κωνσταντίνα;" |
| update_task_status | "Βάλε σε αναμονή την εργασία σωλήνα" |
| approve_task | "Έγκρινε την εργασία της Βάσω" |
| reject_task | "Απόρριψε, χρειάζεται διόρθωση" |
| create_entry | "Σημείωσε ότι έφτασαν τα πλακάκια Τσαλδάρη" |
| search | "Βρες τι έγινε με το μπάνιο Μαραθιά" |
| create_announcement | "Πες σε όλους: αύριο κλειστά" |
| create_plan | "Υπενθύμισέ μου Δευτέρα να πάρω προμηθευτή" |
| get_project_summary | "Πώς πάει η Πεύκη;" |
| register_to_timeline | "Καταχώρησε αυτό στο ιστορικό" |

## Setup for Claude on Phone (Remote SSE)

Deploy the MCP server to any hosting platform:

### Railway (easiest)
1. Push the repo to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Set root directory to `mcp/`
4. Add environment variables:
   - `SUPABASE_URL` = your Supabase URL
   - `SUPABASE_SERVICE_KEY` = your service role key
   - `PORT` = 3001 (Railway sets this automatically)
5. Deploy — you get a URL like `https://ag-project-mcp.up.railway.app`
6. In Claude.ai → Settings → MCP Servers → Add:
   ```
   URL: https://ag-project-mcp.up.railway.app/sse
   ```
7. Now Giorgos opens Claude on his phone and the 11 tools are available.

### Test locally
```bash
cd mcp
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_KEY=your-key \
PORT=3001 \
node server.js
```
Then connect Claude Desktop to `http://localhost:3001/sse`

## Setup for Claude Desktop (Local stdio)

1. Install Node.js 18+
2. Clone the repo
3. Install dependencies:
   ```bash
   cd mcp
   npm install
   ```
4. Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

   ```json
   {
     "mcpServers": {
       "ag-project": {
         "command": "node",
         "args": ["/full/path/to/ag-project-monitor/mcp/server.js"],
         "env": {
           "SUPABASE_URL": "https://elanqwsguvlnstjzfpmv.supabase.co",
           "SUPABASE_SERVICE_KEY": "your-service-role-key-here"
         }
       }
     }
   }
   ```

5. Restart Claude Desktop. The 11 tools appear automatically.

## Setup for Claude.ai (remote)

Deploy the MCP server to a hosting platform (Railway, Fly.io) and connect via the Claude.ai MCP settings. See Anthropic docs for remote MCP setup.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| SUPABASE_URL | Yes | Your Supabase project URL |
| SUPABASE_SERVICE_KEY | Yes | Service role key (NOT the anon key) |

⚠️ The service role key bypasses RLS — keep it secret. Never commit it.

## How it works

The MCP server connects directly to Supabase and performs the same operations as the web app. When Giorgos talks to Claude:

1. Claude understands the Greek request
2. Claude calls the appropriate tool (e.g. `create_task`)
3. The tool writes to Supabase
4. The team sees the result in the web app instantly

All tool responses are in Greek.
