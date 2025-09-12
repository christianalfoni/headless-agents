import Anthropic from "@anthropic-ai/sdk";
import {
  PromptMessage,
  WriteTodosCallMessage,
  WriteTodosResultMessage,
} from "./types.js";
import { Session } from "./Session.js";

export async function* streamPrompt(config: {
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
}): AsyncGenerator<
  PromptMessage | WriteTodosCallMessage | WriteTodosResultMessage
> {
  try {
    const anthropic = new Anthropic({
      apiKey: config.apiKey,
    });

    // Use tools directly in Anthropic format
    const anthropicTools = Object.values(config.tools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));

    let messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: config.prompt,
      },
    ];

    let stepCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalTextOutput = "";

    const sessionInfo = {
      sessionId: config.session.sessionId,
    };

    // Set thinking option once based on reasoningEffort
    const shouldUseThinking =
      config.reasoningEffort && config.reasoningEffort !== "low";
    const temperature = config.reasoningEffort === "low" ? 0.2 : undefined;

    // Main conversation loop - continues only when there are tool calls to process
    while (true) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: config.system,
        messages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        thinking: shouldUseThinking
          ? {
              type: "enabled",
              budget_tokens: config.reasoningEffort === "medium" ? 1024 : 2000,
            }
          : undefined,
        temperature,
        tool_choice: anthropicTools.length
          ? {
              type: "auto",
            }
          : undefined,
      });

      const responseInputTokens = response.usage.input_tokens;
      const responseOutputTokens = response.usage.output_tokens;
      totalInputTokens += responseInputTokens;
      totalOutputTokens += responseOutputTokens;

      // Calculate cost for this response and call step
      const responseCost =
        responseInputTokens * 0.0003 + responseOutputTokens * 0.0015;
      config.session.step(
        responseInputTokens,
        responseOutputTokens,
        responseCost
      );

      // Handle thinking content blocks
      const thinkingBlocks = response.content.filter(
        (content): content is any => content.type === "thinking"
      );

      for (const thinkingBlock of thinkingBlocks) {
        const thinkingMessage: PromptMessage = {
          type: "reasoning",
          text: thinkingBlock.thinking || thinkingBlock.content,
          ...sessionInfo,
        };
        yield thinkingMessage;
      }

      // Handle text content
      const textContent = response.content
        .filter(
          (content): content is Anthropic.TextBlock => content.type === "text"
        )
        .map((content) => content.text)
        .join("");

      if (textContent) {
        const textMessage: PromptMessage = {
          type: "text",
          text: textContent,
          ...sessionInfo,
        };
        yield textMessage;
        finalTextOutput = textContent;
      }

      // Handle tool calls
      const toolUses = response.content.filter(
        (content): content is Anthropic.ToolUseBlock =>
          content.type === "tool_use"
      );

      // Continue loop if there are tool calls OR thinking blocks (both are "thinking results")
      const hasToolCalls = toolUses.length > 0;
      const hasThinking = thinkingBlocks.length > 0;

      if (!hasToolCalls && !hasThinking) {
        // No tool calls or thinking, conversation is complete
        break;
      }

      // Check step limits when we continue the loop
      if (config.maxSteps && stepCount >= config.maxSteps) {
        break;
      }

      stepCount++;

      // Add the assistant's response as is
      messages.push({
        role: "assistant",
        content: response.content,
      });

      // Only process tool calls if there are any
      if (hasToolCalls) {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUses) {
          // Yield tool call message
          const toolCallMessage: PromptMessage = {
            type: "tool-call",
            toolCallId: toolUse.id,
            toolName: toolUse.name as any,
            args: toolUse.input,
            ...sessionInfo,
          } as any;
          yield toolCallMessage;

          try {
            // Execute the tool
            const tool = Object.values(config.tools).find(
              (t) => t.name === toolUse.name
            );
            if (!tool) {
              throw new Error(`Tool ${toolUse.name} not found`);
            }

            const result = await tool.execute(toolUse.input);

            // Track file paths for str_replace_based_edit_tool calls
            if (toolUse.name === "str_replace_based_edit_tool" && config.pathsSet) {
              const args = toolUse.input as any;
              if (args.path) {
                config.pathsSet.add(args.path);
              }
            }

            // Yield tool result message
            const toolResultMessage: PromptMessage = {
              type: "tool-result",
              toolCallId: toolUse.id,
              toolName: toolUse.name as any,
              result,
              ...sessionInfo,
            } as any;
            yield toolResultMessage;

            // Return early if configured to do so
            if (
              config.returnOnToolResult &&
              toolUse.name === config.returnOnToolResult
            ) {
              return finalTextOutput;
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content:
                typeof result === "string" ? result : JSON.stringify(result),
            });
          } catch (error) {
            // Yield tool error message
            const toolErrorMessage: PromptMessage = {
              type: "tool-error",
              toolCallId: toolUse.id,
              toolName: toolUse.name as any,
              error: error instanceof Error ? error.message : String(error),
              ...sessionInfo,
            } as any;
            yield toolErrorMessage;

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
              is_error: true,
            });
          }
        }

        // Add tool results to messages only if we processed tools
        if (toolResults.length > 0) {
          messages.push({
            role: "user",
            content: toolResults,
          });
        }
      } else if (hasThinking) {
        // If we have thinking but no tool calls, we might need to continue
        // the conversation to see if the thinking leads to tool calls
        // Don't add anything to messages yet, let the loop continue
      }
    }

    return finalTextOutput;
  } catch (error) {
    const errorMessage: PromptMessage = {
      type: "error",
      error: error instanceof Error ? error.message : String(error),
      sessionId: config.session.sessionId,
    };
    yield errorMessage;

    throw new Error(
      `Failed to stream prompt: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
