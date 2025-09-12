export class SessionEnvironment {
    workingDirectory;
    gitStatus;
    maxSteps;
    constructor(workingDirectory, gitStatus, maxSteps) {
        this.workingDirectory = workingDirectory;
        this.gitStatus = gitStatus;
        this.maxSteps = maxSteps;
    }
    refresh() {
        // Method to refresh context
    }
}
