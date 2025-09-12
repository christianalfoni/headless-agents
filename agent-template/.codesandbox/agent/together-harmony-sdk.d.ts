import { Message } from "openai-harmony";
interface JsonSchemaProperty {
    type: string;
    description?: string;
    enum?: string[];
    items?: JsonSchemaProperty;
    minItems?: number;
    maxItems?: number;
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
}
interface JsonSchema {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
}
interface Tool {
    name: string;
    description?: string;
    input_schema: JsonSchema;
}
export declare function convertJsonSchemaToHarmonyTypeScript(tools: Tool[]): string;
export declare function prompt(config: {
    messages: Message[];
    tools?: Tool[];
    reasoningEffort?: "low" | "medium" | "high";
    apiKey: string;
}): Promise<{
    messages: Message[];
    inputTokens: number;
    outputTokens: number;
}>;
export {};
//# sourceMappingURL=together-harmony-sdk.d.ts.map