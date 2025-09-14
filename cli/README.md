# Headless Agent with CodeSandbox

This example demonstrates how to use the headless coding agent via CodeSandbox, providing a scalable and isolated environment for each coding session.

## Setup

### 1. Get a Together API Key

1. Sign up at [Together.ai](https://together.ai)
2. Generate an API key at [https://api.together.xyz/settings/api-keys](https://api.together.xyz/settings/api-keys)
3. The CLI will prompt you to enter this key on first run (it will be stored securely)

### 2. Install Dependencies

```bash
npm install
```

## Usage

Run the interactive chat interface:

```bash
node index.js
```

You can also specify a different directory to search for git repositories:

```bash
node index.js /path/to/your/projects
```

## How it Works

1. **Sandbox Creation**: Creates a CodeSandbox from the agent template (`pt_FH2YvB6gZc3xC1QnjgnP9i`)
2. **Server Connection**: Waits for the Express server to start on port 3000 inside the sandbox
3. **Query Execution**: Sends prompts to the sandbox server via HTTP requests
4. **Message Polling**: Continuously polls for messages and displays them in real-time
5. **Session Management**: Each sandbox runs a single coding session

## Architecture

```
Local CLI ←→ CodeSandbox (Express Server ←→ Headless Agent)
```

- **Local CLI**: Interactive interface for user prompts and displaying results
- **CodeSandbox**: Provides isolated VM environment with the agent template
- **Express Server**: REST API running inside sandbox for agent communication
- **Headless Agent**: The actual coding agent with tool access

## Benefits

- **Isolation**: Each session runs in a clean, isolated environment
- **Scalability**: CodeSandbox handles VM provisioning and management  
- **Consistency**: Same environment every time
- **Tool Access**: Full file system and command execution capabilities
- **Real-time**: Live polling of agent messages and progress

## Message Types

The interface formats different types of agent messages:

- 💬 **Text Messages**: Regular agent responses
- 🔧 **Tool Usage**: When the agent uses tools (shows tool name and parameters)
- ✅/❌ **Tool Results**: Success or error results from tool execution
- 📋 **Todos**: Todo list updates with status indicators
- ✨ **Session Complete**: When the agent finishes its task

## API Endpoints

The sandbox server exposes these endpoints:

- `POST /query` - Start a new coding query
- `GET /messages` - Poll for messages (supports `?since=timestamp`)
- `GET /session` - Get current session status
- `DELETE /session` - Clear current session
- `GET /health` - Health check

## Template Structure

The CodeSandbox template (`agent-template/`) contains:

- **Express server** (`server.js`) - HTTP API for agent communication
- **Agent code** (`.codesandbox/agent/`) - Compiled headless agent
- **Auto-start configuration** (`tasks.json`) - Automatically starts server on port 3000