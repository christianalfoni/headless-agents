#!/usr/bin/env node

import { CodeSandbox } from "@codesandbox/sdk";
import chalk from "chalk";
import React, { useState, useEffect } from "react";
import { render } from "ink";
import { App } from "./components/App.js";
import inquirer from "inquirer";
import {
  TaskState,
  GitRepoInfo,
  ConversationEntry,
  TaskData,
  IPromptTask,
  RepoWithBranch,
} from "./types.js";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { v4 as uuidv4 } from "uuid";
import process from "process";
import crypto from "crypto";

class PromptTask implements IPromptTask {
  public id: string;
  public prompt: string;
  public sandboxId: string | null;
  public state: TaskState;
  public messages: string[];
  public createdAt: Date;
  public completedAt: Date | null;
  public stepCount: number;
  public tokenCount: number;
  public cost: number | null;
  public repos: RepoWithBranch[];

  constructor(
    id: string,
    prompt: string,
    repos: RepoWithBranch[] = [],
    sandboxId: string | null = null
  ) {
    this.id = id;
    this.prompt = prompt;
    this.sandboxId = sandboxId;
    this.state = "initialize";
    this.messages = [];
    this.createdAt = new Date();
    this.completedAt = null;
    this.stepCount = 0;
    this.tokenCount = 0;
    this.cost = null;
    this.repos = repos;
  }

  updateState(state: TaskState): void {
    this.state = state;
  }

  addMessage(message: string): void {
    this.messages.push(message);
  }

  setCompleted(
    stepCount: number,
    tokenCount: number,
    cost: number | null = null
  ): void {
    this.state = "completed";
    this.completedAt = new Date();
    this.stepCount = stepCount;
    this.tokenCount = tokenCount;
    this.cost = cost;
  }

  setError(): void {
    this.state = "error";
    this.completedAt = new Date();
  }

  getStateIcon(): string {
    switch (this.state) {
      case "initialize":
        return "🔄";
      case "waiting":
        return "⏳";
      case "thinking":
        return "🧠";
      case "tool_call":
        return "🔧";
      case "completed":
        return "✅";
      case "error":
        return "❌";
      default:
        return "❓";
    }
  }

  getStateText(): string {
    switch (this.state) {
      case "initialize":
        return "Initializing";
      case "waiting":
        return "Waiting";
      case "thinking":
        return "Thinking";
      case "tool_call":
        return "Tool Call";
      case "completed":
        return "Completed";
      case "error":
        return "Error";
      default:
        return "Unknown";
    }
  }

  serialize(): TaskData {
    return {
      id: this.id,
      prompt: this.prompt,
      sandboxId: this.sandboxId,
      state: this.state,
      messages: this.messages,
      createdAt: this.createdAt.toISOString(),
      completedAt: this.completedAt?.toISOString() || null,
      stepCount: this.stepCount,
      tokenCount: this.tokenCount,
      cost: this.cost,
      repos: this.repos,
    };
  }

  static deserialize(data: TaskData): PromptTask {
    const task = new PromptTask(
      data.id,
      data.prompt,
      data.repos || [],
      data.sandboxId || null
    );
    task.state = data.state;
    task.messages = data.messages || [];
    task.createdAt = new Date(data.createdAt);
    task.completedAt = data.completedAt ? new Date(data.completedAt) : null;
    task.stepCount = data.stepCount || 0;
    task.tokenCount = data.tokenCount || 0;
    task.cost = data.cost || null;
    return task;
  }
}

class AgentChat {
  private isAgentRunning: boolean;
  private lastTodos: any;
  private provider: string;
  private logFileName: string;
  private conversation: ConversationEntry[];
  private conversationFileName: string;
  private activeSandboxes: Map<
    string,
    { sandbox: any; client: any; serverUrl: string }
  >;
  private searchPath: string;
  private gitRepos: GitRepoInfo[];

  // Task management properties
  private tasks: Map<string, PromptTask>;
  private currentTask: PromptTask | null;
  private tasksFile: string;
  private tasksArray: PromptTask[] = [];
  private inkApp: any = null;
  private setTasksState: ((tasks: PromptTask[]) => void) | null = null;

  // Git token management
  private gitTokenFile: string;
  private gitToken: string | null = null;

  // Together API key management
  private togetherApiKeyFile: string;
  private togetherApiKey: string | null = null;

  constructor(
    searchPath: string = process.cwd()
  ) {
    this.isAgentRunning = false;
    this.lastTodos = null;
    this.provider = "together";
    this.logFileName = `../agent-chat-${
      new Date().toISOString().split("T")[0]
    }.log`;
    this.conversation = [];
    this.conversationFileName = `${process.cwd()}/CONVERSATION.md`;
    this.activeSandboxes = new Map();
    this.searchPath = searchPath;
    this.gitRepos = this.detectGitRepos();

    // Task management properties
    this.tasks = new Map();
    this.currentTask = null;

    // Create .together-tasks directory if it doesn't exist
    const togetherTasksDir = path.join(os.homedir(), ".together-tasks");
    if (!fs.existsSync(togetherTasksDir)) {
      fs.mkdirSync(togetherTasksDir, { recursive: true });
    }

    this.tasksFile = path.join(togetherTasksDir, "tasks.json");
    this.gitTokenFile = path.join(togetherTasksDir, "git-token");
    this.togetherApiKeyFile = path.join(togetherTasksDir, "together-key");

    this.loadTasks();
    this.loadGitToken();
    this.loadTogetherApiKey();
    this.checkOnboarding();
  }

  private generateBranchName(prompt: string, repoInfo?: GitRepoInfo): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const hour = now.getHours().toString().padStart(2, "0");
    const minute = now.getMinutes().toString().padStart(2, "0");

    return `together-${date}-${hour}-${minute}`;
  }

  private parseRepoMentions(prompt: string): string[] {
    // Extract @repo mentions from the prompt
    const mentions = prompt.match(/@([a-zA-Z0-9_-]+)/g);
    return mentions ? mentions.map((mention) => mention.substring(1)) : [];
  }

  private matchMentionsToRepos(mentions: string[]): GitRepoInfo[] {
    const matchedRepos: GitRepoInfo[] = [];

    for (const mention of mentions) {
      // Try to match by folder name first
      let matchedRepo = this.gitRepos.find(
        (repo) => repo.folderName === mention
      );

      // If not found by folder name, try to match by repo name from the remote URL
      if (!matchedRepo) {
        matchedRepo = this.gitRepos.find((repo) => repo.repo === mention);
      }

      if (matchedRepo) {
        matchedRepos.push(matchedRepo);
      }
    }

    return matchedRepos;
  }

  private replaceRepoMentionsInPrompt(
    prompt: string,
    matchedRepos: GitRepoInfo[]
  ): string {
    let updatedPrompt = prompt;

    for (const repo of matchedRepos) {
      // Replace @folderName or @repoName with org/repo format + (repo) postfix
      const folderNamePattern = new RegExp(`@${repo.folderName}\\b`, "g");
      const repoNamePattern = new RegExp(`@${repo.repo}\\b`, "g");

      const replacement = `${repo.fullName} (repo)`;
      updatedPrompt = updatedPrompt.replace(folderNamePattern, replacement);
      updatedPrompt = updatedPrompt.replace(repoNamePattern, replacement);
    }

    return updatedPrompt;
  }

  private createReposWithBranches(
    selectedRepos: GitRepoInfo[],
    prompt: string
  ): RepoWithBranch[] {
    return selectedRepos.map((repo) => ({
      repoInfo: repo,
      branchName: this.generateBranchName(prompt, repo),
    }));
  }

  private loadTasks(): void {
    try {
      if (fs.existsSync(this.tasksFile)) {
        const data = fs.readFileSync(this.tasksFile, "utf8");
        const tasksData: TaskData[] = JSON.parse(data);
        for (const taskData of tasksData) {
          const task = PromptTask.deserialize(taskData);
          this.tasks.set(task.id, task);
        }
      }
      this.updateTasksArray();
    } catch (error: any) {
      console.error("Failed to load tasks:", error.message);
    }
  }

  private saveTasks(): void {
    try {
      const tasksData = Array.from(this.tasks.values()).map((task) =>
        task.serialize()
      );
      fs.writeFileSync(
        this.tasksFile,
        JSON.stringify(tasksData, null, 2),
        "utf8"
      );
      this.updateTasksArray();
    } catch (error: any) {
      console.error("Failed to save tasks:", error.message);
    }
  }

  private updateTasksArray(): void {
    this.tasksArray = Array.from(this.tasks.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    // Update React state to trigger re-render
    if (this.setTasksState) {
      this.setTasksState([...this.tasksArray]);
    }
  }

  private addTask(prompt: string, repos: RepoWithBranch[]): PromptTask {
    const task = new PromptTask(uuidv4(), prompt, repos);
    this.tasks.set(task.id, task);
    this.saveTasks();
    return task;
  }

  private deleteTask(taskId: string): void {
    this.tasks.delete(taskId);
    this.saveTasks();
  }

  private encryptToken(token: string): string {
    const key = crypto.scryptSync("headless-agent-secret", "salt", 24);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes192", key, iv);
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  }

  private decryptToken(encryptedToken: string): string {
    const key = crypto.scryptSync("headless-agent-secret", "salt", 24);
    const [ivHex, encryptedHex] = encryptedToken.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes192", key, iv);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  private loadGitToken(): void {
    try {
      if (fs.existsSync(this.gitTokenFile)) {
        const encryptedToken = fs.readFileSync(this.gitTokenFile, "utf8");
        this.gitToken = this.decryptToken(encryptedToken);
      }
    } catch (error: any) {
      console.error("Failed to load git token:", error.message);
      this.gitToken = null;
    }
  }

  private saveGitToken(token: string): void {
    try {
      const encryptedToken = this.encryptToken(token);
      fs.writeFileSync(this.gitTokenFile, encryptedToken, { mode: 0o600 });
      this.gitToken = token;
    } catch (error: any) {
      console.error("Failed to save git token:", error.message);
    }
  }

  private loadTogetherApiKey(): void {
    try {
      if (fs.existsSync(this.togetherApiKeyFile)) {
        const encryptedKey = fs.readFileSync(this.togetherApiKeyFile, "utf8");
        this.togetherApiKey = this.decryptToken(encryptedKey);
      }
    } catch (error: any) {
      console.error("Failed to load Together API key:", error.message);
      this.togetherApiKey = null;
    }
  }

  private saveTogetherApiKey(apiKey: string): void {
    try {
      const encryptedKey = this.encryptToken(apiKey);
      fs.writeFileSync(this.togetherApiKeyFile, encryptedKey, { mode: 0o600 });
      this.togetherApiKey = apiKey;
    } catch (error: any) {
      console.error("Failed to save Together API key:", error.message);
    }
  }

  private async checkOnboarding(): Promise<void> {
    const hasGitToken = !!this.gitToken;
    const hasTogetherApiKey = !!this.togetherApiKey;

    if (hasGitToken && hasTogetherApiKey) {
      this.startInkApp();
      return;
    }

    // Show onboarding for missing credentials
    if (!hasGitToken && !hasTogetherApiKey) {
      await this.showCompleteOnboarding();
    } else if (!hasGitToken) {
      await this.showGitTokenOnboarding();
    } else if (!hasTogetherApiKey) {
      await this.showTogetherApiKeyOnboarding();
    }
  }

  private async showGitTokenOnboarding(): Promise<void> {
    console.clear();
    console.log(chalk.blue.bold("🔐 GitHub Token Setup"));
    console.log();
    console.log("This CLI needs a GitHub token to:");
    console.log("• Clone repositories");
    console.log("• Create commits");
    console.log("• Push branches");
    console.log();
    console.log(
      chalk.cyan("https://github.com/settings/personal-access-tokens")
    );
    console.log();

    // Import inquirer dynamically to handle input

    let answers;
    try {
      answers = await inquirer.prompt([
        {
          type: "password",
          name: "token",
          message: "Paste your GitHub token:",
          mask: "*",
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return "Token cannot be empty";
            }
            if (!input.match(/^(ghp_|gho_|ghu_|ghs_|ghr_)/)) {
              return "Invalid GitHub token format";
            }
            return true;
          },
        },
      ]);
    } catch (error: any) {
      if (error.name === "ExitPromptError") {
        console.log(chalk.yellow("\n\n👋 Goodbye!"));
        process.exit(0);
      }
      throw error;
    }

    this.saveGitToken(answers.token.trim());
    console.log();
    console.log(chalk.green("✅ GitHub token saved securely!"));
    console.log();

    // Short delay before checking if we need Together API key
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if we also need Together API key
    if (!this.togetherApiKey) {
      await this.showTogetherApiKeyOnboarding();
    } else {
      this.startInkApp();
    }
  }

  private async showTogetherApiKeyOnboarding(): Promise<void> {
    console.clear();
    console.log(chalk.blue.bold("🤖 Together API Key Setup"));
    console.log();
    console.log("This CLI needs a Together API key to:");
    console.log("• Access AI models via CodeSandbox SDK");
    console.log("• Execute agent tasks in sandboxes");
    console.log("• Generate intelligent responses");
    console.log();
    console.log(chalk.cyan("https://api.together.xyz/settings/api-keys"));
    console.log();

    let answers;
    try {
      answers = await inquirer.prompt([
        {
          type: "password",
          name: "apiKey",
          message: "Paste your Together API key:",
          mask: "*",
          validate: (input: string) => {
            if (!input || input.trim().length === 0) {
              return "API key cannot be empty";
            }
            if (input.trim().length < 20) {
              return "API key seems too short. Please check and try again.";
            }
            return true;
          },
        },
      ]);
    } catch (error: any) {
      if (error.name === "ExitPromptError") {
        console.log(chalk.yellow("\n\n👋 Goodbye!"));
        process.exit(0);
      }
      throw error;
    }

    this.saveTogetherApiKey(answers.apiKey.trim());
    console.log();
    console.log(chalk.green("✅ Together API key saved securely!"));
    console.log();

    // Short delay before starting the app
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.startInkApp();
  }

  private async showCompleteOnboarding(): Promise<void> {
    console.clear();
    console.log(chalk.blue.bold("🚀 Welcome to Together Tasks CLI"));
    console.log();
    console.log("To get started, we need to set up two credentials:");
    console.log();
    console.log(
      chalk.yellow("1. GitHub Token") + " - for repository operations"
    );
    console.log(chalk.yellow("2. Together API Key") + " - for AI model access");
    console.log();
    console.log("Press ENTER to continue...");

    // Wait for ENTER key
    await new Promise<void>((resolve) => {
      const onData = (key: Buffer) => {
        if (key.toString() === "\r" || key.toString() === "\n") {
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve();
        }
      };

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", onData);
    });

    await this.showGitTokenOnboarding();
  }

  private detectGitRepos(): GitRepoInfo[] {
    const repos: GitRepoInfo[] = [];

    try {
      // Get all directories in the search path
      const items = fs.readdirSync(this.searchPath, { withFileTypes: true });
      const directories = items.filter((item) => item.isDirectory());

      for (const dir of directories) {
        const dirPath = path.join(this.searchPath, dir.name);

        try {
          // Check if this directory is a git repository
          execSync("git rev-parse --is-inside-work-tree", {
            cwd: dirPath,
            stdio: "pipe",
          });

          // Get the remote origin URL
          const remoteUrl = execSync("git config --get remote.origin.url", {
            cwd: dirPath,
            encoding: "utf8",
          }).trim();

          // Parse GitHub org/repo from URL
          const match = remoteUrl.match(
            /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/
          );

          const repoInfo: GitRepoInfo = {
            isGitRepo: true,
            folderName: dir.name,
            remoteUrl: remoteUrl,
          };

          if (match) {
            repoInfo.org = match[1];
            repoInfo.repo = match[2];
            repoInfo.fullName = `${match[1]}/${match[2]}`;
          }

          repos.push(repoInfo);
        } catch (error) {
          // Not a git repo or no remote, skip this directory
          continue;
        }
      }

      return repos;
    } catch (error) {
      return [];
    }
  }

  private logMessage(message: string): void {
    try {
      fs.appendFileSync(this.logFileName, message + "\n\n", "utf8");
    } catch (error: any) {
      console.error("Failed to write to log file:", error.message);
    }
  }

  private addToConversation(type: string, content: any): void {
    this.conversation.push({
      type,
      content,
      timestamp: new Date().toISOString(),
    });
  }

  private formatConversationAsMarkdown(): string {
    let markdown = `# 🤖 Agent Conversation\n\n`;
    markdown += `**Provider:** ${this.provider}\n`;
    markdown += `**Started:** ${new Date().toLocaleString()}\n\n`;
    markdown += `---\n\n`;

    for (const entry of this.conversation) {
      switch (entry.type) {
        case "user_prompt":
          markdown += `## 🧑‍💻 User\n\n${entry.content}\n\n`;
          break;
        case "agent_text":
          markdown += `## 🤖 Agent\n\n${entry.content}\n\n`;
          break;
        case "agent_reasoning":
          markdown += `### 🧠 Reasoning\n\n${entry.content}\n\n`;
          break;
        case "tool_call":
          markdown += `### 🔧 Tool Call: ${entry.content.toolName}\n\n`;
          if (entry.content.description) {
            markdown += `**Description:** ${entry.content.description}\n\n`;
          }
          if (
            entry.content.args &&
            Object.keys(entry.content.args).length > 0
          ) {
            markdown += `**Arguments:**\n\`\`\`json\n${JSON.stringify(
              entry.content.args,
              null,
              2
            )}\n\`\`\`\n\n`;
          }
          break;
        case "tool_result":
          if (entry.content.error) {
            markdown += `### ❌ Tool Error\n\n\`\`\`\n${entry.content.error}\n\`\`\`\n\n`;
          } else if (entry.content.success) {
            markdown += `### ✅ Tool Success\n\n${entry.content.success}\n\n`;
          }
          break;
        case "todos":
          markdown += `### 📋 Todos Updated\n\n`;
          for (const todo of entry.content) {
            const statusIcon =
              todo.status === "completed"
                ? "✅"
                : todo.status === "in_progress"
                ? "🔄"
                : "⏳";
            markdown += `- ${statusIcon} ${todo.description}\n`;
          }
          markdown += `\n`;
          break;
        case "completion":
          markdown += `### 🏁 Completion Summary\n\n`;
          markdown += `- **Steps:** ${entry.content.stepCount}\n`;
          markdown += `- **Duration:** ${entry.content.duration}\n`;
          markdown += `- **Tokens:** ${entry.content.tokens}\n`;
          if (entry.content.cost) {
            markdown += `- **Cost:** ${entry.content.cost}\n`;
          }
          markdown += `\n`;
          break;
        case "error":
          markdown += `### 💥 Error\n\n\`\`\`\n${entry.content}\n\`\`\`\n\n`;
          break;
      }
    }

    return markdown;
  }

  private saveConversation(): void {
    try {
      const markdown = this.formatConversationAsMarkdown();
      fs.writeFileSync(this.conversationFileName, markdown, "utf8");
    } catch (error: any) {
      console.error("Failed to write conversation file:", error.message);
    }
  }

  private getToolDescription(part: any): string {
    if (part.toolName === "write_todos") {
      const todoCount = part.args.todos ? part.args.todos.length : 0;
      return `updating ${todoCount} todos`;
    } else if (part.toolName === "bash") {
      if (part.args.restart) {
        return `restart shell`;
      } else if (part.args.command) {
        return part.args.command;
      }
    } else if (part.toolName === "str_replace_based_edit_tool") {
      const command = part.args.command;
      const path = part.args.path;
      if (command === "view") {
        if (part.args.view_range) {
          return `${command} ${path}:${part.args.view_range[0]}-${part.args.view_range[1]}`;
        } else {
          return `${command} ${path}`;
        }
      } else if (command === "create") {
        return `${command} ${path}`;
      } else if (command === "str_replace") {
        return `${command} in ${path}`;
      } else if (command === "insert") {
        return `${command} in ${path}:${part.args.insert_line}`;
      } else {
        return `${command} ${path}`;
      }
    } else if (part.toolName === "web_fetch") {
      return `fetch ${part.args.url}`;
    } else if (part.toolName === "web_search") {
      return `search "${part.args.query}"`;
    }
    return "";
  }

  private async initializeSandboxForTask(
    taskId: string
  ): Promise<{ sandbox: any; client: any; serverUrl: string }> {
    try {
      const apiKey = this.togetherApiKey;
      if (!apiKey) {
        throw new Error("Together API key is required for CodeSandbox integration");
      }

      const sdk = new CodeSandbox(apiKey);
      console.log(`Creating sandbox for task ${taskId}...`);
      const sandbox = await sdk.sandboxes.create({
        id: "pt_UbT9ojZwY6ZG9UFt5kwkwp", // Template ID
      });
      console.log(`Sandbox created for task ${taskId}: ${sandbox.id}`);

      const client = await sandbox.connect();

      const port = await client.ports.waitForPort(4999, {
        timeoutMs: 60000,
      });
      const serverUrl = `https://${port.host}`;

      const sandboxInfo = { sandbox, client, serverUrl };
      this.activeSandboxes.set(taskId, sandboxInfo);

      return sandboxInfo;
    } catch (error) {
      throw error;
    }
  }

  private async makeRequest(
    taskId: string,
    endpoint: string,
    method: string = "GET",
    body: any = null
  ): Promise<any> {
    const sandboxInfo = this.activeSandboxes.get(taskId);
    if (!sandboxInfo) {
      throw new Error(`No sandbox found for task ${taskId}`);
    }

    const response = await fetch(`${sandboxInfo.serverUrl}${endpoint}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async startQuery(prompt, apiKey, task?: PromptTask) {
    const requestBody = {
      prompt,
      apiKey,
      provider: this.provider,
      maxSteps: 200,
      workingDirectory: "/project/workspace",
    };

    // Add GitHub token (using stored token only)
    if (this.gitToken) {
      (requestBody as any).githubToken = this.gitToken;
    }

    // Add repository and branch info from task if available
    if (task?.repos && task.repos.length > 0) {
      // Send only the mentioned repos with their associated branch names
      (requestBody as any).reposWithBranches = task.repos.map((repo) => ({
        repoInfo: repo.repoInfo,
        branchName: repo.branchName,
      }));
    }

    return this.makeRequest(task!.id, "/query", "POST", requestBody);
  }

  async pollMessages(taskId: string, since = null) {
    const endpoint = since ? `/messages?since=${since}` : "/messages";
    return this.makeRequest(taskId, endpoint);
  }

  private convertSandboxMessage(message: any): any {
    // The server stores messages in format: { timestamp, message }
    // Where message is the actual agent message object

    // Return the actual message object from the server
    return message.message;
  }

  private truncateInput(input: any, maxLines: number = 4): string {
    if (input == null) {
      return "";
    }
    if (typeof input !== "string") {
      input = JSON.stringify(input);
    }
    const lines = input.split("\n");
    if (lines.length > maxLines) {
      const truncated = lines.slice(0, maxLines).join("\n");
      const remainingLines = lines.length - maxLines;
      return `${truncated}\n...+ ${remainingLines} lines`;
    }
    return input;
  }

  private formatAgentOutput(part: any): string {
    switch (part.type) {
      case "text":
        this.addToConversation("agent_text", part.text);
        return chalk.white("💬 ") + part.text;

      case "reasoning":
        this.addToConversation("agent_reasoning", part.text);
        return chalk.gray("🧠 ") + chalk.gray(part.text);

      case "tool-call":
        this.addToConversation("tool_call", {
          toolName: part.toolName,
          args: part.args,
          description: this.getToolDescription(part),
        });

        let toolDescription = chalk.blue.bold(part.toolName);
        if (part.toolName === "write_todos") {
          const todoCount = part.args.todos ? part.args.todos.length : 0;
          toolDescription += chalk.gray(` (updating ${todoCount} todos)`);
        } else if (part.toolName === "bash") {
          if (part.args.restart) {
            toolDescription += chalk.gray(` (restart shell)`);
          } else if (part.args.command) {
            const command = this.truncateInput(part.args.command);
            toolDescription += chalk.gray(` (${command})`);
          }
        } else if (part.toolName === "str_replace_based_edit_tool") {
          const command = part.args.command;
          const path = part.args.path;
          if (command === "view") {
            if (part.args.view_range) {
              toolDescription += chalk.gray(
                ` (${command} ${path}:${part.args.view_range[0]}-${part.args.view_range[1]})`
              );
            } else {
              toolDescription += chalk.gray(` (${command} ${path})`);
            }
          } else if (command === "create") {
            toolDescription += chalk.gray(` (${command} ${path})`);
          } else if (command === "str_replace") {
            const oldText = this.truncateInput(part.args.old_str);
            const newText = this.truncateInput(part.args.new_str);
            toolDescription += chalk.gray(
              ` (${command} ${path}: "${oldText}" → "${newText}")`
            );
          } else if (command === "insert") {
            const newText = this.truncateInput(part.args.new_str);
            toolDescription += chalk.gray(
              ` (${command} ${path}:${part.args.insert_line}: "${newText}")`
            );
          } else {
            toolDescription += chalk.gray(` (${command} ${path})`);
          }
        } else if (part.toolName === "web_fetch") {
          toolDescription += chalk.gray(` (${part.args.url})`);
        } else if (part.toolName === "web_search") {
          toolDescription += chalk.gray(` ("${part.args.query}")`);
        }
        return chalk.blue("🔧 ") + toolDescription;

      case "tool-result":
        // Only show results for write_todos to track todo updates, and for errors
        if (part.toolName === "write_todos") {
          const todoCount = part.result.todos ? part.result.todos.length : 0;
          // Update the current todos
          if (part.result.todos) {
            this.lastTodos = part.result.todos;
          }
          this.addToConversation("tool_result", {
            success: `todos updated (${todoCount} todos)`,
          });
          return (
            chalk.green("✅ ") +
            chalk.gray(`todos updated (${todoCount} todos)`)
          );
        } else if (part.toolName === "bash") {
          const exitCode = part.result.exitCode;
          const stderr = part.result.stderr;
          const stdout = part.result.stdout;

          if (exitCode !== 0) {
            let errorMsg = `bash failed with exit code ${exitCode}`;
            if (stderr && stderr.trim()) {
              errorMsg += `\nstderr: ${stderr.trim()}`;
            }
            if (stdout && stdout.trim()) {
              errorMsg += `\nstdout: ${stdout.trim()}`;
            }
            this.addToConversation("tool_result", { error: errorMsg });

            let displayMsg = chalk.red(
              `bash failed with exit code ${exitCode}`
            );
            if (stderr && stderr.trim()) {
              displayMsg +=
                "\n" + chalk.red("   stderr: ") + chalk.gray(stderr.trim());
            }
            if (stdout && stdout.trim()) {
              displayMsg +=
                "\n" + chalk.red("   stdout: ") + chalk.gray(stdout.trim());
            }
            return chalk.red("❌ ") + displayMsg;
          }
        } else if (part.toolName === "str_replace_based_edit_tool") {
          if (part.result.includes("Error:")) {
            this.addToConversation("tool_result", {
              error: `edit failed: ${part.result}`,
            });
            return (
              chalk.red("❌ ") +
              chalk.red("edit failed: ") +
              chalk.gray(part.result)
            );
          }
        }
        // Return empty string for successful tool results (don't show anything)
        return "";

      case "tool-error":
        this.addToConversation("tool_result", {
          error: `Tool Error (${part.toolName}): ${part.error}`,
        });
        return (
          chalk.red("❌ Tool Error: ") +
          chalk.red.bold(part.toolName) +
          "\n" +
          chalk.red("   Error: ") +
          chalk.red(part.error)
        );

      case "todos":
        if (part.todos && part.todos.length > 0) {
          this.lastTodos = part.todos;
          this.addToConversation("todos", part.todos);

          return (
            chalk.magenta("📋 Todos Updated ") +
            chalk.yellow(`(${part.reasoningEffort})`) +
            "\n" +
            part.todos
              .map((todo) => {
                const statusIcon =
                  todo.status === "completed"
                    ? "✅"
                    : todo.status === "in_progress"
                    ? "🔄"
                    : "⏳";

                return (
                  `  ${statusIcon} ` +
                  chalk.yellow(`(${todo.reasoningEffort})`) +
                  ` ${todo.description}`
                );
              })
              .join("\n")
          );
        }
        return "";

      case "completed":
        this.lastTodos = part.todos; // Save completed todos
        const totalSeconds = Math.floor(part.durationMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const duration =
          minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        let costInfo = "";
        if (part.totalCostDollars !== undefined) {
          costInfo = `, $${part.totalCostDollars.toFixed(4)}`;
        }

        this.addToConversation("completion", {
          stepCount: part.stepCount,
          duration: duration,
          tokens: `${part.inputTokens + part.outputTokens} tokens (${
            part.inputTokens
          } in, ${part.outputTokens} out)`,
          cost:
            part.totalCostDollars !== undefined
              ? `$${part.totalCostDollars.toFixed(4)}`
              : undefined,
        });

        // Build the result string - include text content if present
        let result =
          chalk.green("🏁 ") +
          chalk.gray(
            `Completed in ${part.stepCount} steps, ${
              part.inputTokens + part.outputTokens
            } tokens (${part.inputTokens} in, ${
              part.outputTokens
            } out), ${duration}${costInfo}`
          );

        // If there's text content in the completion message, add it
        if (part.text && part.text.trim()) {
          result += "\n" + chalk.white("💬 ") + part.text;
          this.addToConversation("agent_text", part.text);
        }

        return result;

      case "error":
        this.addToConversation("error", part.error);
        return (
          chalk.red("💥 ") +
          chalk.red.bold("Session Error: ") +
          chalk.red(part.error)
        );

      default:
        return chalk.gray("📝 ") + JSON.stringify(part, null, 2);
    }
  }

  private async executeAgentForTask(task: PromptTask): Promise<void> {
    const prompt = task.prompt;

    try {
      this.isAgentRunning = true;
      this.currentTask = task;

      // Initialize a new sandbox for this task
      const sandboxInfo = await this.initializeSandboxForTask(task.id);

      // Store sandbox ID in task
      task.sandboxId = sandboxInfo.sandbox.id;

      // Add user prompt to conversation
      this.addToConversation("user_prompt", prompt);

      // Get Together API key
      const apiKey = this.togetherApiKey;
      if (!apiKey) {
        throw new Error(
          "Together API key not found. Please restart the CLI to set up credentials."
        );
      }

      // Start the query in the sandbox
      await this.startQuery(prompt, apiKey, task);

      // Query started successfully, update state from initialize to waiting
      task.updateState("waiting");
      this.saveTasks();

      // Poll for messages
      let lastTimestamp = null;
      let isCompleted = false;

      while (!isCompleted) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

        try {
          const response = await this.pollMessages(task.id, lastTimestamp);

          if (response.messages && response.messages.length > 0) {
            for (const message of response.messages) {
              // Convert sandbox message format to the format expected by formatAgentOutput
              const formattedMessage = this.convertSandboxMessage(message);
              const formatted = this.formatAgentOutput(formattedMessage);
              if (formatted && formatted.trim()) {
                task.addMessage(formatted);
              }

              // Update task state based on message type
              if (formattedMessage.type === "tool-call") {
                task.updateState("tool_call");
              } else if (
                formattedMessage.type === "text" ||
                formattedMessage.type === "reasoning"
              ) {
                task.updateState("thinking");
              }

              // Log the raw JSON message
              this.logMessage(JSON.stringify(message, null, 2));
              lastTimestamp = message.timestamp;
            }
            this.saveTasks();
          }

          // Check if the session is completed or errored
          if (response.status === "completed" || response.status === "error") {
            isCompleted = true;

            if (response.status === "error") {
              task.setError();
              task.addMessage(
                chalk.red("❌ Task completed with error: " + response.error)
              );
              this.addToConversation("error", response.error);
            } else {
              task.setCompleted(0, 0); // TODO: get actual counts from response
            }
            this.saveTasks();
          }
        } catch (pollError: any) {
          console.error("Error polling messages:", pollError.message);
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait longer on error
        }
      }

      this.isAgentRunning = false;
      this.currentTask = null;

      // Clean up sandbox resources
      this.activeSandboxes.delete(task.id);

      // Save conversation after each agent execution
      this.saveConversation();
    } catch (error: any) {
      this.isAgentRunning = false;
      this.currentTask = null;

      // Clean up sandbox resources on error
      this.activeSandboxes.delete(task.id);

      // Add error to conversation and save
      this.addToConversation("error", error.message);
      this.saveConversation();

      task.setError();
      task.addMessage(chalk.red("💥 Error: ") + error.message);
      this.saveTasks();

      throw error;
    }
  }

  private startInkApp(): void {
    // Clear the screen when starting
    console.clear();

    // Create a wrapper component that manages tasks state
    const AppWrapper: React.FC = () => {
      const [tasks, setTasks] = useState<PromptTask[]>(this.tasksArray);

      // Store the state setter for updates
      useEffect(() => {
        this.setTasksState = setTasks;
        return () => {
          this.setTasksState = null;
        };
      }, []);

      const appProps = {
        tasks,
        gitRepos: this.gitRepos,
        searchPath: this.searchPath,
        onPromptSubmit: (prompt: string) => this.handlePromptSubmit(prompt),
        onTaskDelete: this.handleTaskDelete.bind(this),
        setTasksState: setTasks,
      };

      return React.createElement(App, appProps);
    };

    this.inkApp = render(React.createElement(AppWrapper));
  }

  private handlePromptSubmit(prompt: string): void {
    // Parse @ repo mentions from the prompt
    const repoMentions = this.parseRepoMentions(prompt);

    // Match mentions to available repositories
    const mentionedRepos = this.matchMentionsToRepos(repoMentions);

    // If there are repo mentions but no matches, show error
    if (repoMentions.length > 0 && mentionedRepos.length === 0) {
      const task = new PromptTask(uuidv4(), prompt, []);
      task.setError();
      task.addMessage(
        `❌ Error: No matching repositories found for mentions: ${repoMentions
          .map((m) => "@" + m)
          .join(", ")}`
      );
      this.tasks.set(task.id, task);
      this.saveTasks();
      return;
    }

    // If repos are available but none are mentioned, require explicit mention (no fallback to all repos)
    if (repoMentions.length === 0 && this.gitRepos.length > 0) {
      const task = new PromptTask(uuidv4(), prompt, []);
      task.setError();
      const availableRepos = this.gitRepos
        .map((repo) => `@${repo.folderName}`)
        .join(", ");
      task.addMessage(
        `❌ Error: ${this.gitRepos.length} repositories detected but none mentioned in your request. Please specify which repository to work with by adding one of: ${availableRepos}`
      );
      this.tasks.set(task.id, task);
      this.saveTasks();
      return;
    }

    // If no repositories are available at all, show error
    if (this.gitRepos.length === 0) {
      const task = new PromptTask(uuidv4(), prompt, []);
      task.setError();
      task.addMessage(
        "❌ Error: No git repositories found. Please ensure repositories are available in the search directory."
      );
      this.tasks.set(task.id, task);
      this.saveTasks();
      return;
    }

    // At this point we know repoMentions.length > 0 and mentionedRepos.length > 0
    const selectedRepos = mentionedRepos;

    // Replace @ mentions in prompt with actual remote URLs
    const updatedPrompt = this.replaceRepoMentionsInPrompt(
      prompt,
      mentionedRepos
    );

    // Create repos with branches
    const reposWithBranches = this.createReposWithBranches(
      selectedRepos,
      updatedPrompt
    );

    // Create task and immediately add to list in initialize state
    const task = new PromptTask(uuidv4(), updatedPrompt, reposWithBranches);
    this.currentTask = task;

    // Immediately add to tasks and save
    this.tasks.set(task.id, task);
    this.saveTasks();

    // Execute the agent for this task in background
    this.executeAgentForTask(task).catch((error) => {
      console.error("Agent execution error:", error);
      task.setError();
      this.saveTasks();
    });
  }

  private handleTaskDelete(taskId: string): void {
    this.deleteTask(taskId);
    // Re-render will happen automatically due to state update
  }

  public async run(): Promise<void> {
    // Keep the app running
    return new Promise(() => {
      // The ink app will handle all interactions
    });
  }
}

// Clear all persistent data
function clearPersistence() {
  const togetherTasksDir = path.join(os.homedir(), ".together-tasks");

  try {
    if (fs.existsSync(togetherTasksDir)) {
      // Remove the entire directory and its contents
      fs.rmSync(togetherTasksDir, { recursive: true, force: true });
      console.log(
        chalk.green(`✓ Cleared .together-tasks directory and all its contents`)
      );
      console.log(chalk.green(`✓ All tasks, tokens, and cached data removed.`));
    } else {
      console.log(chalk.yellow("No .together-tasks directory found to clear."));
    }
  } catch (error: any) {
    console.log(
      chalk.red(`✗ Failed to clear .together-tasks directory: ${error.message}`)
    );
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let searchPath = process.cwd(); // default to current directory

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--clear") {
      clearPersistence();
      process.exit(0);
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(
        "Usage: node index.js [path] [--clear]"
      );
      console.log(
        "  path: Directory to search for git repositories (default: current directory)"
      );
      console.log("  --clear: Clear all tasks, tokens, and cached data");
      console.log("\nExamples:");
      console.log("  node index.js .");
      console.log("  node index.js ..");
      console.log("  node index.js ./foo");
      console.log("  node index.js /path/to/projects");
      console.log("  node index.js --clear");
      process.exit(0);
    } else if (!args[i].startsWith("--") && i === 0) {
      // First non-option argument is the path
      searchPath = path.resolve(args[i]);
    }
  }

  // Validate that the search path exists and is a directory
  try {
    const stat = fs.statSync(searchPath);
    if (!stat.isDirectory()) {
      console.error(`Error: ${searchPath} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${searchPath} does not exist or is not accessible`);
    process.exit(1);
  }

  return { searchPath };
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log(chalk.yellow("\n\n👋 Goodbye!"));
  process.exit(0);
});

// Start the chat
const { searchPath } = parseArgs();
const chat = new AgentChat(searchPath);
chat.run().catch(console.error);
