import { PromptMessage, WriteTodosCallMessage, WriteTodosResultMessage } from "./types.js";
import { Session } from "./Session.js";
/**
 * Together AI with Harmony integration
 *
 * This version uses the together-harmony-sdk for conversation
 * with full tool calling support via Harmony's functions.* recipient format.
 */
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
//# sourceMappingURL=prompt-together.d.ts.map