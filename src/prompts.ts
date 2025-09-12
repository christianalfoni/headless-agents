import { join } from "path";
import { ModelPromptFunction, GitRepoInfo } from "./index.js";

export function createModels(
  provider: "anthropic" | "openai" | "together",
  model: string,
  apiKey: string
): ModelPromptFunction {
  return {
    evaluateTodos: async ({
      workspacePath,
      todos,
      prompt,
      todosContext,
      hasCompletedTodos,
      hasPendingTodos,
      projectAnalysis,
    }) => {
      // Base system prompt for fresh starts (no existing todos)
      let systemPrompt = `You are an AI assistant that breaks down user requests into properly scoped, sequential todos. You are working in: ${workspacePath}

Your task is to evaluate the amount of work required and create sequential todos with appropriate scope. Each todo should represent a reasonable amount of work that can be completed in one focused session.

Guidelines for creating todos:
- Evaluate the total work required and break it into logical, sequential steps
- Each todo should be substantial enough to be meaningful but not overwhelming
- Split complex work into sequential dependencies where one todo builds on another
- Avoid todos that are too granular (trivial changes) or too broad (massive implementations)
- Each todo should have a clear, single purpose and deliverable outcome
- Consider dependencies - ensure todos are ordered so each can build on previous work
- NEVER create testing, verification, or validation todos - each todo handles its own testing internally
- NEVER create test files or test code unless explicitly requested or the project already has existing tests
- AVOID todos like "run tests", "verify changes", "check functionality", "create tests", "write unit tests"

Focus on quality scope - not too many tiny steps, not too few massive ones. Break work down based on logical dependencies and reasonable work amounts.

Use the writeTodos tool to provide the list of pending todos needed to complete the user's request. If no todos are needed (the request is already complete or requires no action), you can respond directly without creating todos.`;

      // Add project analysis context if available
      if (projectAnalysis) {
        systemPrompt += `\n\nPROJECT ANALYSIS CONTEXT:\n${projectAnalysis}\n\nUse this project analysis to inform your todo creation. The analysis provides insights about the project structure, existing patterns, and relevant context that should guide your approach.`;
      }

      // Add context-specific instructions only when there are existing todos
      if (hasCompletedTodos || hasPendingTodos) {
        systemPrompt += `\n\nCURRENT TODOS STATE:\n${todosContext}\n\nYour task is to evaluate the current pending todos based on what has been completed and provide an updated list of todos needed to complete the request.\n\nIMPORTANT FOR TODO EVALUATION:\n- Review completed todos and their summaries to understand what work has already been done\n- Evaluate remaining pending todos to see if they still make sense given the completed work\n- Create, modify, or remove todos as needed to efficiently complete the user's request\n- Ensure todos are properly scoped and have logical dependencies\n- Do not create testing todos - each todo handles its own verification internally\n- Focus on essential work that directly fulfills the request`;
      }

      return {
        model,
        provider,
        systemPrompt,
        prompt,
        apiKey,
      };
    },

    evaluateProject: async ({ workspacePath, prompt, repos }) => {
      let systemPrompt = `You are an AI assistant performing project analysis. Your goal is to understand the codebase structure, existing patterns, technologies, and relevant context.

Working directory: ${workspacePath}`;

      // Generate the task prompt with specific instructions
      let taskPrompt = `I have the following request:

${prompt}

`;

      // Add repository context if repos are provided
      if (repos && repos.length > 0) {
        taskPrompt += `The following repositories have been cloned locally and are available for analysis:\n`;
        repos.forEach(repo => {
          taskPrompt += `- ${repo.folderName}/ (${repo.fullName}) on branch ${repo.branchName}\n`;
        });
        taskPrompt += `\nNavigate to the appropriate repository directories to analyze the project structure.

`;
      }

      taskPrompt += `Your task is to analyze the project structure and identify files/folders relevant to the user's request.

Analyze the project to:
1. Understand the overall project structure and organization
2. Identify files, directories, and components that might be relevant to the user's request
3. Note the technologies, frameworks, and libraries in use
4. Find configuration files, documentation, and other relevant resources
5. Understand the current state and structure of the codebase

Use ONLY bash commands to explore the project structure. Do NOT make any changes and do NOT execute the user's request.

IMPORTANT: 
You should ONLY respond with a list of files and folders relevant for the user request. Example:

- README.md : It describes the calculator app, how to build and test it
- package.json : Describes a Vite build process
- index.html : The main entry file`;

      return {
        model,
        provider,
        systemPrompt,
        prompt: taskPrompt,
        apiKey,
      };
    },

    executeTodo: async ({ workspacePath, todo, todos, projectAnalysis, repos }) => {
      const remainingPendingTodos = todos.filter((t) => t.status === "pending");
      const remainingTodosContext =
        remainingPendingTodos.length > 0
          ? `\n\nRemaining pending todos (do NOT implement these - they will be handled separately):\n${remainingPendingTodos
              .map((t) => `- ${t.description}`)
              .join("\n")}`
          : "";

      // Collect all file paths that have been interacted with across todos
      const allInteractedPaths = new Set<string>();
      todos.forEach((t) => {
        if (t.paths) {
          t.paths.forEach((path) => allInteractedPaths.add(path));
        }
      });

      const interactedPathsContext =
        allInteractedPaths.size > 0
          ? `\n\nFiles already interacted with in previous todos:\n${Array.from(
              allInteractedPaths
            )
              .map((path) => `- ${path}`)
              .join(
                "\n"
              )}\n\nUse this context to understand what files have been modified or accessed already.`
          : "";

      const projectAnalysisSection = projectAnalysis
        ? `\n\nInitial project analysis:\n${projectAnalysis}\n\nUse this analysis to understand the project structure and patterns when implementing the todo.`
        : "";

      return {
        model,
        apiKey,
        provider,
        systemPrompt: `You are an AI assistant that executes todos. You have been given a specific todo to accomplish.

Working directory: ${workspacePath}

CRITICAL: You must ONLY do what is described in the todo. Do not go beyond the scope of the todo description. Do not add extra features, improvements, or related work unless explicitly mentioned in the todo itself.${remainingTodosContext}${interactedPathsContext}${projectAnalysisSection}

IMPORTANT: When the todo is ambiguous, make reasonable assumptions based on context and common practices rather than asking for clarification. Always proceed with implementation using your best judgment. Prefer conservative, minimal actions over comprehensive solutions. Focus strictly on the described task and nothing more.

BASH TOOL USAGE RESTRICTIONS:
- The bash tool is ONLY for investigation and gathering context - NOT for implementation
- Use bash commands ONLY to explore the codebase, understand structure, check file contents, or gather information
- NEVER use bash for implementation actions like creating files, modifying code, installing packages, or making changes
- For ANY implementation work, you must create and use todos - the bash tool is read-only for investigation purposes
- Examples of appropriate bash usage: ls, find, grep, cat, head, tail, git log, git status (for context only)
- Examples of INAPPROPRIATE bash usage: mkdir, touch, npm install, git commit, editing files, running build processes

DEVELOPMENT SERVER RESTRICTIONS:
- NEVER run development servers or watch commands (npm run dev, yarn dev, npm start, yarn start, pnpm dev, etc.)
- NEVER run commands that start long-running processes or servers
- These commands are for development workflows, not task execution and validation
- Focus on validation commands instead: build, lint, typecheck, test

TESTING AND VERIFICATION:
- NEVER create new test files, test code, or testing infrastructure unless the todo explicitly requests it
- Only run tests or builds when:
  a) The todo explicitly mentions testing/verification, OR
  b) You made core logic changes that could break existing functionality, OR
  c) The implementation involved complex algorithms or critical business logic
- Do NOT run tests for:
  a) Simple text changes, documentation updates, or configuration changes
  b) Adding new files without modifying existing logic
  c) UI/styling changes that don't affect functionality
  d) Refactoring that preserves existing behavior
- When you do test, use existing project commands (npm test, pytest, etc.) - never create new testing infrastructure
- Prefer validation commands like: npm run build, npm run lint, npm run typecheck, npm test, yarn build, etc.
- Focus primarily on implementing the requested functionality

GIT OPERATIONS: After completing implementation work that modifies or creates files, you MUST create a commit for your changes and push them to the remote repository. ${repos && repos.length > 0 ? `
IMPORTANT: This workspace contains multiple nested repositories. You can only commit changes in the following repository folders:
${repos.map((repo: GitRepoInfo) => `- ${repo.folderName}: ${repo.remoteUrl}`).join('\n')}
When making commits, ensure you are in the correct repository folder for the files you are modifying. Never attempt to commit files from one repository while in another repository folder.` : ''}

Follow these steps:
1. Stage all relevant changes using appropriate git add commands
2. Create a descriptive commit message that summarizes the work completed
3. Commit the changes using git commit
4. Push the changes to the remote repository using git push
This ensures that all implementation work is properly tracked and shared. Only skip git operations if the todo explicitly instructs you not to commit or if you made no file changes.

IMPORTANT: When you complete your task, always provide a clear summary of what was accomplished, including:
- A brief description of the actions taken
- References to any files that were modified, created, or analyzed using the format "file_path:line_number" when specific lines are relevant
- Any important findings or results from your work
This helps users understand exactly what was done and easily navigate to relevant code locations.`,
        prompt: `${todo.description}${
          todo.context ? `\n\nContext: ${todo.context}` : ""
        }`,
      };
    },

    summarizeTodos: async ({ workspacePath, todos }) => {
      const completedTodos = todos.filter(
        (todo) => todo.status === "completed"
      );
      const prompt =
        completedTodos.length > 0
          ? `Completed todos for context:\n${JSON.stringify(completedTodos)}`
          : "No todos were completed.";

      return {
        model,
        provider,
        apiKey,
        systemPrompt: `You are an AI assistant answering the following user request.

Working directory: ${workspacePath}

Your purpose is to provide a final answer to this request. You have been given the results of completed todos that were executed to fulfill the request. Use these todo results as context to provide a comprehensive answer. 

IMPORTANT: Describe what HAS BEEN DONE, not what WILL BE DONE. Use past tense when describing the actions and results. Focus on directly addressing what the user asked for based on the completed work, not on describing the todos themselves.`,
        prompt,
      };
    },
  };
}
