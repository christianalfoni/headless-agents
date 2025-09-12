import { PromptMessage, WriteTodosCallMessage, WriteTodosResultMessage } from "./types.js";
import { Session } from "./Session.js";
export declare function streamPrompt(config: {
    session: Session;
    system: string;
    prompt: string;
    tools: Record<string, any>;
    maxSteps?: number;
    planningMode?: boolean;
    reasoningEffort?: "low" | "medium" | "high";
    verbosity?: "low" | "medium" | "high";
    returnOnToolResult?: string;
    pathsSet?: Set<string>;
    apiKey: string;
}): AsyncGenerator<PromptMessage | WriteTodosCallMessage | WriteTodosResultMessage>;
//# sourceMappingURL=prompt-anthropic.d.ts.map