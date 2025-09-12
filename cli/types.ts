// Shared type definitions
export type SessionState = "initialize" | "waiting" | "thinking" | "tool_call" | "completed" | "error";

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

export interface SessionData {
  id: string;
  prompt: string;
  sandboxId?: string | null;
  state: SessionState;
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
  sessionId?: string;
}

export interface UIChoice {
  type: "prompt" | "session" | "action";
  value: string;
  sessionId?: string;
}

// Class interface for PromptSession
export interface IPromptSession {
  id: string;
  prompt: string;
  sandboxId: string | null;
  state: SessionState;
  messages: string[];
  createdAt: Date;
  completedAt: Date | null;
  stepCount: number;
  tokenCount: number;
  cost: number | null;
  repos: RepoWithBranch[];
  
  updateState(state: SessionState): void;
  addMessage(message: string): void;
  setCompleted(stepCount: number, tokenCount: number, cost: number | null): void;
  setError(): void;
  getStateIcon(): string;
  getStateText(): string;
  serialize(): SessionData;
}