import { Todo, PromptMessage, TodosMessage, Message, TextMessage, ReasoningMessage } from "./types.js";
import { SessionEnvironment } from "./Environment.js";
import { ModelPromptFunction } from "./index.js";
export declare class Session {
    static create(userPrompt: string, env: SessionEnvironment, models: ModelPromptFunction, initialTodos?: Todo[], repos?: Array<{
        isGitRepo: boolean;
        folderName: string;
        remoteUrl: string;
        org?: string;
        repo?: string;
        fullName?: string;
        branchName?: string;
    }>): AsyncGenerator<Message, any, any>;
    readonly sessionId: string;
    todos: Todo[];
    env: SessionEnvironment;
    inputTokens: number;
    outputTokens: number;
    totalCostCents: number;
    stepCount: number;
    userPrompt: string;
    readonly startTime: Date;
    models: ModelPromptFunction;
    reasoningEffort: "high" | "medium" | "low";
    lastEvaluateMessage: string | null;
    projectAnalysis: string | null;
    repos: Array<{
        isGitRepo: boolean;
        folderName: string;
        remoteUrl: string;
        org?: string;
        repo?: string;
        fullName?: string;
        branchName?: string;
    }>;
    constructor(userPrompt: string, env: SessionEnvironment, models: ModelPromptFunction, initialTodos?: Todo[], repos?: Array<{
        isGitRepo: boolean;
        folderName: string;
        remoteUrl: string;
        org?: string;
        repo?: string;
        fullName?: string;
        branchName?: string;
    }>);
    step(inputTokens: number, outputTokens: number, costCents: number): void;
    getMaxSteps(): number | undefined;
    private generateTodoContext;
    private getStreamPromptForProvider;
    exec(): AsyncGenerator<Message>;
    evaluateTodos(): AsyncGenerator<PromptMessage | TodosMessage>;
    executeTodo(todo: Todo): AsyncGenerator<PromptMessage, string, any>;
    summarizeTodos(): AsyncGenerator<TextMessage | ReasoningMessage, string, any>;
    evaluatePrompt(prompt: string): Promise<"low" | "medium" | "high">;
    evaluateProject(prompt: string): AsyncGenerator<PromptMessage, string>;
}
//# sourceMappingURL=Session.d.ts.map