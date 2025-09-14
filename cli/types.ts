// Shared type definitions
export type TaskState = "initialize" | "waiting" | "thinking" | "tool_call" | "completed" | "error";

export interface GitRepoInfo {
  isGitRepo: boolean;
  folderName: string;
  remoteUrl: string;
  org?: string;
  repo?: string;
  fullName?: string;
}

export interface ConversationEntry {
  type: string;
  content: any;
  timestamp: string;
}

export interface RepoWithBranch {
  repoInfo: GitRepoInfo;
  branchName: string;
}

export interface TaskData {
  id: string;
  prompt: string;
  sandboxId?: string | null;
  state: TaskState;
  messages: string[];
  createdAt: string;
  completedAt?: string | null;
  stepCount: number;
  tokenCount: number;
  cost?: number | null;
  repos: RepoWithBranch[];
}

export interface TableChoice {
  action: "view" | "new" | "delete" | "quit";
  taskId?: string;
}

export interface UIChoice {
  type: "prompt" | "task" | "action";
  value: string;
  taskId?: string;
}

// Class interface for PromptTask
export interface IPromptTask {
  id: string;
  prompt: string;
  sandboxId: string | null;
  state: TaskState;
  messages: string[];
  createdAt: Date;
  completedAt: Date | null;
  stepCount: number;
  tokenCount: number;
  cost: number | null;
  repos: RepoWithBranch[];

  updateState(state: TaskState): void;
  addMessage(message: string): void;
  setCompleted(stepCount: number, tokenCount: number, cost: number | null): void;
  setError(): void;
  getStateIcon(): string;
  getStateText(): string;
  serialize(): TaskData;
}