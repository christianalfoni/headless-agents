import { prompt as harmonyPrompt } from "./together-harmony-sdk.js";
/**
 * Together AI with Harmony integration
 *
 * This version uses the together-harmony-sdk for conversation
 * with full tool calling support via Harmony's functions.* recipient format.
 */
export async function* streamPrompt(config) {
    try {
        // Create harmony-compliant messages
        let messages = [
            {
                role: "system",
                content: [
                    {
                        type: "text",
                        text: config.system,
                    },
                ],
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: config.prompt,
                    },
                ],
            },
        ];
        // Add preamble with commentary channel if in planning mode
        if (config.planningMode) {
            messages.push({
                role: "assistant",
                content: [
                    {
                        type: "text",
                        text: "<|channel|>commentary<|message|>I'll help you plan this task step by step.<|end|>",
                    },
                ],
            });
        }
        const sessionInfo = {
            sessionId: config.session.sessionId,
        };
        // Convert tools to harmony SDK format
        const harmonyTools = config.tools
            ? Object.entries(config.tools).map(([name, toolDef]) => ({
                name,
                description: toolDef.description,
                input_schema: toolDef.input_schema,
            }))
            : undefined;
        let stepCount = 0;
        let finalTextOutput = "";
        // Main conversation loop - continues when there are tool calls to process
        while (true) {
            // Call the harmony SDK
            const response = await harmonyPrompt({
                messages,
                tools: harmonyTools,
                reasoningEffort: config.reasoningEffort,
                apiKey: config.apiKey,
            });
            // Update session with actual usage from API response
            const inputTokens = response.inputTokens;
            const outputTokens = response.outputTokens;
            // Calculate cost based on Together AI pricing for gpt-oss-120b
            // $0.15 input / $0.60 output per million tokens, converted to cents
            const cost = (inputTokens * 0.15) / 10000 + (outputTokens * 0.6) / 10000;
            config.session.step(inputTokens, outputTokens, cost);
            if (!response.messages || response.messages.length === 0) {
                break;
            }
            let hasToolCalls = false;
            const toolCallResults = [];
            // Process the parsed assistant messages from the response
            for (const message of response.messages) {
                // Check if this is a tool call
                // Harmony uses two formats for tool calls:
                // - "functions.toolName" for regular tool calls
                // - "<|constrain|>toolName" for structured/constrained tool calls (tools with strict JSON schemas)
                // Note: There's a bug in openai-harmony where recipients sometimes include channel markers
                // like "functions.toolName<|channel|>commentary" instead of just "functions.toolName"
                if (message.recipient && (message.recipient.startsWith("functions.") || message.recipient.startsWith("<|constrain|>"))) {
                    hasToolCalls = true;
                    // Extract tool name from recipient based on the format used
                    let toolName;
                    if (message.recipient.startsWith("functions.")) {
                        // Regular tool calls: "functions.bash" -> "bash"
                        // Handle cases like "functions.write_todos<|channel|>commentary" -> "write_todos"
                        const afterFunctions = message.recipient.substring("functions.".length);
                        const channelIndex = afterFunctions.indexOf("<|channel|>");
                        toolName = channelIndex !== -1 ? afterFunctions.substring(0, channelIndex) : afterFunctions;
                    }
                    else if (message.recipient.startsWith("<|constrain|>")) {
                        // Constrained tool calls: "<|constrain|>write_todos" -> "write_todos"
                        // Used for tools that require strict JSON schema adherence
                        const afterConstrain = message.recipient.substring("<|constrain|>".length);
                        const channelIndex = afterConstrain.indexOf("<|channel|>");
                        toolName = channelIndex !== -1 ? afterConstrain.substring(0, channelIndex) : afterConstrain;
                    }
                    else {
                        toolName = message.recipient;
                    }
                    // Parse the JSON content as tool call arguments
                    let parsedArgs;
                    let toolCallContent = "";
                    for (const content of message.content) {
                        if (content.type === "text") {
                            toolCallContent = content.text;
                            break;
                        }
                    }
                    try {
                        parsedArgs = JSON.parse(toolCallContent);
                    }
                    catch (error) {
                        throw new Error(`Failed to parse tool call JSON: ${error}`);
                    }
                    // Generate a unique tool call ID
                    const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
                    // Yield tool call message
                    const toolCallMessage = {
                        type: "tool-call",
                        toolCallId,
                        toolName: toolName,
                        args: parsedArgs,
                        ...sessionInfo,
                    };
                    yield toolCallMessage;
                    try {
                        // Find and execute the tool
                        const tool = Object.values(config.tools).find((t) => t.name === toolName);
                        if (!tool) {
                            const availableTools = Object.values(config.tools).map(t => t.name).join(', ');
                            throw new Error(`Tool "${toolName}" not found. Available tools: [${availableTools}]`);
                        }
                        const result = await tool.execute(parsedArgs);
                        // Track file paths for str_replace_based_edit_tool calls
                        if (toolName === "str_replace_based_edit_tool" && config.pathsSet) {
                            const args = parsedArgs;
                            if (args.path) {
                                config.pathsSet.add(args.path);
                            }
                        }
                        // Yield tool result message
                        const toolResultMessage = {
                            type: "tool-result",
                            toolCallId,
                            toolName: toolName,
                            result,
                            ...sessionInfo,
                        };
                        yield toolResultMessage;
                        // Return early if configured to do so
                        if (config.returnOnToolResult &&
                            toolName === config.returnOnToolResult) {
                            return finalTextOutput;
                        }
                        // Add tool result to messages for next iteration
                        toolCallResults.push({
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: `Tool result for ${toolName}: ${typeof result === "string" ? result : JSON.stringify(result)}`,
                                },
                            ],
                            channel: "tool-result",
                        });
                    }
                    catch (error) {
                        // Yield tool error message
                        const toolErrorMessage = {
                            type: "tool-error",
                            toolCallId,
                            toolName: toolName,
                            error: error instanceof Error ? error.message : String(error),
                            ...sessionInfo,
                        };
                        yield toolErrorMessage;
                        // Add error to messages for next iteration
                        toolCallResults.push({
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: `Tool error for ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
                                },
                            ],
                            channel: "tool-result",
                        });
                    }
                }
                else {
                    // Regular assistant message
                    for (const content of message.content) {
                        if (content.type === "text") {
                            // Determine message type based on channel
                            let messageType = "text";
                            if (message.channel === "analysis") {
                                messageType = "reasoning";
                            }
                            const textMessage = {
                                type: messageType,
                                text: content.text,
                                ...sessionInfo,
                            };
                            yield textMessage;
                            finalTextOutput = content.text;
                        }
                        // Note: Other content types are ignored for now
                    }
                }
            }
            // If no tool calls were made, we're done
            if (!hasToolCalls) {
                break;
            }
            // Check step limits when we continue the loop
            if (config.maxSteps && stepCount >= config.maxSteps) {
                break;
            }
            stepCount++;
            // Add the original assistant messages and tool results to the conversation
            messages = [...messages, ...response.messages, ...toolCallResults];
        }
        return finalTextOutput;
    }
    catch (error) {
        const errorMessage = {
            type: "error",
            error: error instanceof Error ? error.message : String(error),
            sessionId: config.session.sessionId,
        };
        yield errorMessage;
        throw new Error(`Failed to stream prompt: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}
