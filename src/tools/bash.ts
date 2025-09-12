import { spawn } from "child_process";
import * as os from "os";

// Function version that includes working directory context
export function bash(workingDirectory: string) {
  return {
    id: "anthropic.bash_20250124",
    name: "bash",
    description: `Execute bash commands in a non-interactive shell session on ${
      process.platform
    } (${os.release()}). Working directory: ${workingDirectory}. Each command runs in a fresh shell starting from this directory. Use non-interactive flags for commands that normally prompt for input (e.g., --yes, --force, --no-input).`,
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute",
        },
      },
      required: ["command"],
    },
    execute: async ({ command }: { command: string }) => {
      // Create a fresh shell instance for each command
      const shellInstance = spawn("bash", [], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: workingDirectory, // Set the working directory
        env: { ...process.env, PS1: "" }, // Remove prompt to avoid confusion
      });

      if (
        !shellInstance.stdin ||
        !shellInstance.stdout ||
        !shellInstance.stderr
      ) {
        throw new Error("Failed to access shell instance streams");
      }

      return new Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
      }>((resolve) => {
        let stdout = "";
        let stderr = "";
        let exitCode = 0;
        let hasExited = false;
        let lastOutputTime = Date.now();
        let lastOutputLength = 0;

        const TIMEOUT = 15000; // 15 seconds
        const STALL_TIMEOUT = 10000; // 10 seconds for stall detection

        // Set up stall detection - check every 2 seconds for output changes
        const stallCheckId = setInterval(() => {
          const currentOutputLength = stdout.length + stderr.length;

          // Check if output length hasn't changed since last check
          if (currentOutputLength === lastOutputLength && !hasExited) {
            const timeSinceLastChange = Date.now() - lastOutputTime;

            // If no change to output for 10 seconds and no completion, it's likely stalled
            if (timeSinceLastChange >= STALL_TIMEOUT) {
              hasExited = true;
              clearInterval(stallCheckId);
              clearTimeout(timeoutId);
              cleanup();

              // Kill the stalled process
              if (shellInstance && shellInstance.stdin) {
                shellInstance.stdin.write("\x03"); // Ctrl+C
                shellInstance.stdin.write("clear\n");
              }

              resolve({
                stdout,
                stderr:
                  stderr +
                  "\nError: Command appears to be a long-running process with no output changes. Long-running processes are not allowed. Try a different approach:\n" +
                  "- Use build/test commands that complete and exit\n" +
                  "- Check file status instead of watching\n" +
                  "- Run validation commands (lint, typecheck, test) rather than servers",
                exitCode: 1,
              });
            }
          } else {
            // Output length changed, update tracking variables
            lastOutputLength = currentOutputLength;
            lastOutputTime = Date.now();
          }
        }, 2000);

        // Set up timeout
        const timeoutId = setTimeout(() => {
          if (!hasExited) {
            hasExited = true;
            clearInterval(stallCheckId);
            cleanup();

            // Kill the shell instance on timeout
            if (shellInstance && !shellInstance.killed) {
              shellInstance.kill("SIGTERM");
            }

            resolve({
              stdout,
              stderr: stderr + "\nCommand timed out after 15 seconds",
              exitCode: 1,
            });
          }
        }, TIMEOUT);

        // Listen for data on stdout
        const onStdout = (data: Buffer) => {
          stdout += data.toString();
        };

        // Listen for data on stderr
        const onStderr = (data: Buffer) => {
          stderr += data.toString();
        };

        // Listen for shell exit (shouldn't happen in normal operation)
        const onExit = (code: number | null) => {
          if (!hasExited) {
            hasExited = true;
            clearTimeout(timeoutId);
            exitCode = code || 0;
            cleanup();

            // Note: Don't clear on exit since shell is already dead
            resolve({
              stdout,
              stderr,
              exitCode,
            });
          }
        };

        const cleanup = () => {
          clearInterval(stallCheckId);
          shellInstance.stdout?.off("data", onStdout);
          shellInstance.stdout?.off("data", checkCompletion);
          shellInstance.stderr?.off("data", onStderr);
          shellInstance.off("exit", onExit);
        };

        shellInstance.stdout.on("data", onStdout);
        shellInstance.stderr.on("data", onStderr);
        shellInstance.on("exit", onExit);

        // Execute the command with markers to detect completion
        const marker = `__CMD_COMPLETE_${Date.now()}__`;
        // Capture exit code after command execution
        const fullCommand = `${command}; EXIT_CODE=$?; echo "${marker}_$EXIT_CODE"`;

        // Listen for the completion marker
        const checkCompletion = (data: Buffer) => {
          const output = data.toString();
          const markerMatch = output.match(new RegExp(`${marker}_(\\d+)`));

          if (markerMatch) {
            exitCode = parseInt(markerMatch[1], 10);
            // Remove the marker from stdout
            stdout = stdout.replace(new RegExp(`${marker}_\\d+\\n?`), "");

            if (!hasExited) {
              hasExited = true;
              clearTimeout(timeoutId);
              cleanup();

              // Kill the shell instance since we're done with it
              if (shellInstance && !shellInstance.killed) {
                shellInstance.kill("SIGTERM");
              }

              const result = {
                stdout,
                stderr,
                exitCode,
              };
              resolve(result);
            }
          }
        };

        shellInstance.stdout.on("data", checkCompletion);

        // Send the command
        shellInstance.stdin.write(fullCommand + "\n");
      });
    },
    dispose: () => {
      // No-op since we create fresh shells for each command
    },
  };
}
