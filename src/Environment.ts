export class SessionEnvironment {
  public workingDirectory: string;
  public gitStatus?: unknown;
  public maxSteps?: number;

  constructor(
    workingDirectory: string,
    gitStatus?: unknown,
    maxSteps?: number
  ) {
    this.workingDirectory = workingDirectory;
    this.gitStatus = gitStatus;
    this.maxSteps = maxSteps;
  }

  refresh(): void {
    // Method to refresh context
  }
}
