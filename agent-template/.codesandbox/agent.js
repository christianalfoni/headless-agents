import express from "express";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";

const app = express();
const PORT = 4999;

// Store single session state for this sandbox VM
let currentSession = null;

app.use(express.json());

// CORS headers for browser requests
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

function getModelForProvider(provider) {
  switch (provider) {
    case "anthropic":
      return "claude-3-5-sonnet-20241022";
    case "openai":
      return "gpt-5";
    case "together":
      return "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo";
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function setupGitCredentials(githubToken) {
  const username = "x-access-token";
  const name = "Awesome Agent";
  const email = "agent@example.com";
  const homeDir = os.homedir();
  const privDir = path.join(homeDir, ".private");
  const credsFile = path.join(privDir, ".gitcredentials");
  const gitConfig = path.join(homeDir, ".gitconfig");

  console.log("Setting up git credentials", {
    homeDir,
    privDir,
    credsFile,
    gitConfig,
    username,
    name,
    email,
    hasGithubToken: !!githubToken,
  });

  // Ensure .private directory exists
  await fs.mkdir(privDir, { recursive: true });

  const credUrl = `https://${username}:${githubToken}@github.com`;
  await fs.writeFile(credsFile, credUrl + "\n", { mode: 0o600 });

  const gitcfg =
    `
[user]
    name  = ${name}
    email = ${email}
[init]
    defaultBranch = main
[credential]
    helper = store --file ${credsFile}
`.trim() + "\n";

  await fs.writeFile(gitConfig, gitcfg, { mode: 0o600 });

  console.log("Git credentials setup completed");
}

async function cloneRepositories(reposWithBranches, workingDirectory) {
  if (!reposWithBranches || reposWithBranches.length === 0) {
    console.log("No repositories to clone");
    return [];
  }

  console.log(`Cloning ${reposWithBranches.length} repositories to ${workingDirectory}`);
  
  const clonedRepos = [];
  
  for (const repoWithBranch of reposWithBranches) {
    const { repoInfo, branchName } = repoWithBranch;
    
    try {
      const targetDir = path.join(workingDirectory, repoInfo.folderName);
      
      console.log(`Cloning ${repoInfo.remoteUrl} into ${repoInfo.folderName} with branch ${branchName}`);
      
      // Clone the repository (since we're in a clean workspace, no need to check if directory exists)
      execSync(`git clone ${repoInfo.remoteUrl} ${repoInfo.folderName}`, {
        cwd: workingDirectory,
        stdio: "pipe"
      });
      
      // Create and checkout the pre-generated branch
      execSync(`git checkout -b ${branchName}`, {
        cwd: targetDir,
        stdio: "pipe"
      });
      
      // Push the new branch to remote to establish upstream tracking
      execSync(`git push -u origin ${branchName}`, {
        cwd: targetDir,
        stdio: "pipe"
      });
      
      console.log(`Successfully cloned ${repoInfo.folderName}, created branch ${branchName}, and pushed to remote`);
      
      clonedRepos.push({
        ...repoInfo,
        branchName: branchName,
        cloned: true
      });
      
    } catch (error) {
      console.error(`Failed to process ${repoInfo.folderName}: ${error.message}`);
      // Add repo to list even if failed, but mark as failed
      clonedRepos.push({
        ...repoInfo,
        branchName: branchName,
        cloned: false,
        error: error.message
      });
    }
  }
  
  return clonedRepos;
}

// Endpoint to start a new query
app.post("/query", async (req, res) => {
  try {
    console.log("Received request body:", JSON.stringify(req.body, null, 2));
    const {
      prompt,
      apiKey,
      provider = "anthropic",
      maxSteps = 50,
      workingDirectory = process.cwd(),
      githubToken,
      reposWithBranches,
    } = req.body;
    console.log("Extracted provider:", typeof provider, provider);
    console.log("Repos with branches:", JSON.stringify(reposWithBranches, null, 2));

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    if (!apiKey) {
      return res.status(400).json({ error: "API key is required" });
    }

    // Check if there's already an active session
    if (currentSession && currentSession.status === "running") {
      return res.status(409).json({
        error:
          "A session is already running. Only one session allowed per sandbox VM.",
      });
    }

    const messages = [];

    // Setup git credentials if githubToken is provided
    if (githubToken) {
      await setupGitCredentials(githubToken);
    }

    // Clone repositories if provided
    let clonedRepos = [];
    if (reposWithBranches && reposWithBranches.length > 0) {
      clonedRepos = await cloneRepositories(reposWithBranches, workingDirectory);
    }

    // Create new session
    currentSession = {
      messages,
      status: "running",
      startTime: new Date(),
      prompt,
      provider,
      clonedRepos,
    };

    // Start the query in background
    (async () => {
      try {
        // Dynamic imports to avoid initialization issues
        const { query } = await import("./agent/index.js");
        const { createModels } = await import("./agent/prompts.js");

        // Set up models with API key
        console.log("Provider type and value:", typeof provider, provider);
        const model = getModelForProvider(provider);
        console.log("Model for provider:", model);
        const models = createModels(provider, model, apiKey);
        console.log("Created models:", typeof models, models);

        // Pass all cloned repos to the core agent for project analysis
        const repos = clonedRepos.filter(repo => repo.cloned).map(repo => ({
          isGitRepo: true,
          folderName: repo.folderName,
          remoteUrl: repo.remoteUrl,
          org: repo.org,
          repo: repo.repo,
          fullName: repo.fullName,
          branchName: repo.branchName
        }));

        const queryOptions = {
          prompt,
          workingDirectory,
          maxSteps,
          models,
          repos: repos
        };

        const queryGenerator = query(queryOptions);

        for await (const message of queryGenerator) {
          messages.push({
            timestamp: new Date(),
            message,
          });
        }

        // Mark session as completed
        if (currentSession) {
          currentSession.status = "completed";
          currentSession.endTime = new Date();
        }
      } catch (error) {
        console.error("Query error:", error);
        if (currentSession) {
          currentSession.status = "error";
          currentSession.error = error.message;
          currentSession.endTime = new Date();
          messages.push({
            timestamp: new Date(),
            type: "error",
            content: error.message,
          });
        }
      }
    })();

    res.json({
      status: "started",
      message: "Query started successfully",
    });
  } catch (error) {
    console.error("Failed to start query:", error);
    res.status(500).json({ error: "Failed to start query: " + error.message });
  }
});

// Endpoint to poll messages for the current session
app.get("/messages", (req, res) => {
  const { since } = req.query; // Optional timestamp to get messages since a specific time

  if (!currentSession) {
    return res.status(404).json({ error: "No active session found" });
  }

  let messages = currentSession.messages;

  // Filter messages if 'since' parameter is provided
  if (since) {
    const sinceTime = new Date(since);
    messages = messages.filter((msg) => msg.timestamp > sinceTime);
  }

  res.json({
    status: currentSession.status,
    startTime: currentSession.startTime,
    endTime: currentSession.endTime,
    error: currentSession.error,
    messages,
    totalMessages: currentSession.messages.length,
    clonedRepositories: currentSession.clonedRepos || [],
  });
});

// Endpoint to get current session status
app.get("/session", (_, res) => {
  if (!currentSession) {
    return res.json({ session: null });
  }

  res.json({
    session: {
      status: currentSession.status,
      startTime: currentSession.startTime,
      endTime: currentSession.endTime,
      prompt:
        currentSession.prompt.substring(0, 100) +
        (currentSession.prompt.length > 100 ? "..." : ""),
      provider: currentSession.provider,
      messageCount: currentSession.messages.length,
    },
  });
});

// Endpoint to clear the current session
app.delete("/session", (_, res) => {
  if (currentSession) {
    currentSession = null;
    res.json({ message: "Session cleared successfully" });
  } else {
    res.status(404).json({ error: "No active session found" });
  }
});

// Health check endpoint
app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
    hasActiveSession: currentSession !== null,
    sessionStatus: currentSession?.status || null,
  });
});

app.listen(PORT, () => {
  console.log(`Headless agent server running on port ${PORT}`);
  console.log(`Endpoints available:`);
  console.log(`  POST /query - Start a new query`);
  console.log(`  GET /messages - Poll messages for current session`);
  console.log(`  GET /session - Get current session status`);
  console.log(`  DELETE /session - Clear current session`);
  console.log(`  GET /health - Health check`);
});
