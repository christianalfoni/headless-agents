import { OpenAI } from "openai";
export async function* streamPrompt(config) {
    try {
        const client = new OpenAI({
            apiKey: config.apiKey,
        });
        // Convert tools from Anthropic format to Responses API format
        const openaiTools = Object.values(config.tools).map((tool) => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
            strict: tool.name === "write_todos",
        }));
        let input = [
            {
                role: "developer",
                content: config.system,
            },
            {
                role: "user",
                content: config.prompt,
            },
        ];
        let stepCount = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let finalTextOutput = "";
        let previousResponseId;
        let nextInput = input;
        const sessionInfo = {
            sessionId: config.session.sessionId,
        };
        // Main conversation loop - continues only when there are tool calls to process
        while (true) {
            const response = await client.responses.create({
                model: "o4-mini",
                input: nextInput,
                previous_response_id: previousResponseId,
                reasoning: config.reasoningEffort
                    ? {
                        effort: config.reasoningEffort,
                        summary: "auto",
                    }
                    : undefined,
                text: {
                    verbosity: /*config.verbosity ||*/ "medium",
                },
                tools: openaiTools.length > 0 ? openaiTools : undefined,
                tool_choice: openaiTools.length > 0 ? "auto" : undefined,
                parallel_tool_calls: config.planningMode ? false : undefined,
            });
            const responseInputTokens = response.usage?.input_tokens || 0;
            const responseOutputTokens = response.usage?.output_tokens || 0;
            totalInputTokens += responseInputTokens;
            totalOutputTokens += responseOutputTokens;
            // Calculate cost for this response and call step
            const responseCost = responseInputTokens * 0.000125 + responseOutputTokens * 0.01;
            config.session.step(responseInputTokens, responseOutputTokens, responseCost);
            if (!response.output || response.output.length === 0)
                break;
            previousResponseId = response.id;
            // Process each item in the output array
            let textContent = "";
            const toolCalls = [];
            for (const outputItem of response.output || []) {
                if (outputItem.type === "reasoning" && outputItem.summary.length) {
                    const reasoningMessage = {
                        type: "reasoning",
                        text: outputItem.summary
                            .map((summary) => summary.text)
                            .join("\n\n"),
                        ...sessionInfo,
                    };
                    yield reasoningMessage;
                }
                else if (outputItem.type === "message") {
                    const content = outputItem.content?.[0];
                    textContent += content?.type === "output_text" ? content.text : "";
                }
                else if (outputItem.type === "function_call") {
                    toolCalls.push(outputItem);
                }
            }
            // Yield text content if we have any
            if (textContent) {
                const textMessage = {
                    type: "text",
                    text: textContent,
                    ...sessionInfo,
                };
                yield textMessage;
                finalTextOutput = textContent;
            }
            // Handle tool calls
            const hasToolCalls = toolCalls.length > 0;
            if (!hasToolCalls) {
                // No tool calls, conversation is complete
                break;
            }
            // Check step limits when we continue the loop
            if (config.maxSteps && stepCount >= config.maxSteps) {
                break;
            }
            stepCount++;
            // Process tool calls
            if (hasToolCalls) {
                const outputs = [];
                for (const toolCall of toolCalls) {
                    const { name, arguments: argsJSON, call_id } = toolCall;
                    // Yield tool call message
                    let parsedArgs;
                    try {
                        parsedArgs = argsJSON ? JSON.parse(argsJSON) : {};
                    }
                    catch {
                        parsedArgs = {};
                    }
                    const toolCallMessage = {
                        type: "tool-call",
                        toolCallId: call_id,
                        toolName: name,
                        args: parsedArgs,
                        ...sessionInfo,
                    };
                    yield toolCallMessage;
                    try {
                        // Execute the tool
                        const tool = Object.values(config.tools).find((t) => t.name === name);
                        if (!tool) {
                            throw new Error(`Tool ${name} not found`);
                        }
                        const result = await tool.execute(parsedArgs);
                        // Track file paths for str_replace_based_edit_tool calls
                        if (name === "str_replace_based_edit_tool" && config.pathsSet) {
                            const args = parsedArgs;
                            if (args.path) {
                                config.pathsSet.add(args.path);
                            }
                        }
                        // Yield tool result message
                        const toolResultMessage = {
                            type: "tool-result",
                            toolCallId: call_id,
                            toolName: name,
                            result,
                            ...sessionInfo,
                        };
                        yield toolResultMessage;
                        // Return early if configured to do so
                        if (config.returnOnToolResult &&
                            name === config.returnOnToolResult) {
                            return finalTextOutput;
                        }
                        // Prepare output for next API call
                        outputs.push({
                            type: "function_call_output",
                            call_id,
                            output: typeof result === "string" ? result : JSON.stringify(result),
                        });
                    }
                    catch (error) {
                        // Yield tool error message
                        const toolErrorMessage = {
                            type: "tool-error",
                            toolCallId: call_id,
                            toolName: name,
                            error: error instanceof Error ? error.message : String(error),
                            ...sessionInfo,
                        };
                        yield toolErrorMessage;
                        // Prepare error output for next API call
                        outputs.push({
                            type: "function_call_output",
                            call_id,
                            output: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        });
                    }
                }
                // Set up tool outputs as input for next iteration
                nextInput = outputs;
                // Continue to next iteration - the loop will make another API call
                // with the tool outputs via previous_response_id
                continue;
            }
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
