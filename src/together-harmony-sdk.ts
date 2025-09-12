import fs from "fs";
import { load_harmony_encoding, Message, Role } from "openai-harmony";

// Delete agent.log file when module loads
const logPath = "agent.log";
try {
  fs.unlinkSync(logPath);
} catch (error) {
  // File doesn't exist or can't be deleted, that's okay
}

// Remove SimpleMessage interface - using Message from openai-harmony instead

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

export function convertJsonSchemaToHarmonyTypeScript(tools: Tool[]): string {
  if (tools.length === 0) {
    return "";
  }

  const convertProperty = (prop: JsonSchemaProperty): string => {
    let type = "";

    switch (prop.type) {
      case "string":
        if (prop.enum) {
          type = prop.enum.map((val) => `"${val}"`).join(" | ");
        } else {
          type = "string";
        }
        break;
      case "number":
      case "integer":
        type = "number";
        break;
      case "boolean":
        type = "boolean";
        break;
      case "array":
        if (prop.items) {
          const itemType = convertProperty(prop.items);
          type = `${itemType}[]`;
        } else {
          type = "any[]";
        }
        break;
      case "object":
        if (prop.properties) {
          const objectProps = Object.entries(prop.properties)
            .map(([key, value]) => {
              const required = prop.required?.includes(key) ?? false;
              const optional = required ? "" : "?";
              const comment = value.description
                ? `    // ${value.description}\n`
                : "";
              return `${comment}    ${key}${optional}: ${convertProperty(
                value
              )}`;
            })
            .join(",\n");
          type = `{\n${objectProps}\n  }`;
        } else {
          type = "object";
        }
        break;
      default:
        type = "any";
    }

    return type;
  };

  const functions = tools
    .map((tool) => {
      const { name, description, input_schema } = tool;
      const comment = description ? `  // ${description}\n` : "";

      if (
        !input_schema.properties ||
        Object.keys(input_schema.properties).length === 0
      ) {
        return `${comment}  type ${name} = () => any;`;
      }

      const properties = Object.entries(input_schema.properties)
        .map(([key, prop]) => {
          const isRequired = input_schema.required?.includes(key) ?? false;
          const optional = isRequired ? "" : "?";
          const propComment = prop.description
            ? `    // ${prop.description}\n`
            : "";
          return `${propComment}    ${key}${optional}: ${convertProperty(
            prop
          )}`;
        })
        .join(",\n");

      return `${comment}  type ${name} = (_: {\n${properties}\n  }) => any;`;
    })
    .join("\n\n");

  return `namespace functions {\n${functions}\n}`;
}

// Raw message format from parseMessagesFromCompletionTokens
interface RawParsedMessage {
  role: string;
  content: string;
  channel?: string;
  recipient?: string;
  name?: string;
}

// Convert raw parsed messages to proper Message format
// Ensures all harmony channels (analysis, commentary, final) and tags are properly handled
function convertRawMessagesToMessages(
  rawMessages: RawParsedMessage[]
): Message[] {
  return rawMessages.map((raw) => {
    const message: Message = {
      role: raw.role as Role,
      content: [{ type: "text" as const, text: raw.content }],
    };

    // Preserve all harmony metadata
    if (raw.channel) message.channel = raw.channel;
    if (raw.recipient) message.recipient = raw.recipient;
    if (raw.name) message.name = raw.name;

    return message;
  });
}

export async function prompt(config: {
  messages: Message[];
  tools?: Tool[];
  reasoningEffort?: "low" | "medium" | "high";
  apiKey: string;
}): Promise<{
  messages: Message[];
  inputTokens: number;
  outputTokens: number;
}> {
  try {
    // 1. Load harmony encoding
    const encoding = await load_harmony_encoding("HarmonyGptOss");

    // 2. Use input messages directly since they're already in harmony format
    const harmonyMessages: Message[] = config.messages;

    // 3. Add reasoning effort to system message if provided (only if not already added)
    if (config.reasoningEffort) {
      const systemMessage = harmonyMessages.find((m) => m.role === "system");
      if (systemMessage && systemMessage.content[0]?.type === "text") {
        const systemText = systemMessage.content[0].text;
        // Only add reasoning effort if it hasn't been added already
        if (!systemText.includes('<|reasoning|>')) {
          systemMessage.content[0].text += `\n<|reasoning|>${config.reasoningEffort.toUpperCase()}`;
        }
      }
    }

    // 4. Add tools if provided (only if not already added)
    if (config.tools && config.tools.length > 0) {
      // Check if tools have already been injected by looking for a developer role message with "# Tools"
      const hasToolsMessage = harmonyMessages.some(
        (msg) => 
          msg.role === "developer" && 
          msg.content[0]?.type === "text" && 
          msg.content[0].text.startsWith("# Tools\n")
      );
      
      if (!hasToolsMessage) {
        const toolsMessage: Message = {
          role: "developer",
          content: [
            {
              type: "text" as const,
              text: `# Tools\n${convertJsonSchemaToHarmonyTypeScript(
                config.tools
              )}`,
            },
          ],
        };
        harmonyMessages.unshift(toolsMessage);
      }
    }

    // 5. Render conversation to tokens
    const inputTokensArray = encoding.renderConversationForCompletion(
      { messages: harmonyMessages },
      "assistant",
      { auto_drop_analysis: false }
    );

    // 6. Convert tokens to string for the API
    const promptText = encoding.decodeUtf8(inputTokensArray);

    // Log the prompt being sent
    fs.appendFileSync(
      logPath,
      `=== PROMPT SENT ===\n${promptText}\n=================\n\n`
    );

    const response = await fetch(
      // "https://api.together.xyz/v1/completions",
      "https://api.fireworks.ai/inference/v1/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // model: "openai/gpt-oss-120b",
          model: "accounts/fireworks/models/gpt-oss-120b",
          prompt: promptText,
          max_tokens: 2048,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Together API request failed: ${response.status} ${response.statusText}. Response: ${errorText}`
      );
    }

    const completion = await response.json();

    // Log the API response for debugging
    fs.appendFileSync(
      logPath,
      `=== API RESPONSE ===\n${JSON.stringify(
        completion,
        null,
        2
      )}\n==================\n\n`
    );

    // 8. Extract completion content and usage from response
    const completionContent = completion.choices[0].text;
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;

    // Log the raw completion content
    fs.appendFileSync(
      logPath,
      `=== RAW COMPLETION ===\n${completionContent}\n====================\n\n`
    );

    if (!completionContent) {
      throw new Error("No completion content received from Together AI");
    }

    // 9. Parse harmony response using openai-harmony
    let parsedMessages: Message[];

    // Fix incomplete harmony responses by ensuring they end with <|end|>
    let fixedCompletionContent = completionContent;
    if (!completionContent.trim().endsWith("<|end|>")) {
      fixedCompletionContent = completionContent + "<|end|>";
    }

    try {
      // Use the original input tokens + encode just the completion
      const completionTokens = encoding.encode(
        fixedCompletionContent,
        new Set(["<|start|>", "<|end|>", "<|message|>", "<|channel|>"])
      );

      // Combine original input tokens with completion tokens
      const fullTokens = new Uint32Array(
        inputTokensArray.length + completionTokens.length
      );
      fullTokens.set(inputTokensArray, 0);
      fullTokens.set(completionTokens, inputTokensArray.length);

      // Parse the complete conversation tokens as messages
      const parsedResult =
        encoding.parseMessagesFromCompletionTokens(fullTokens);

      const rawParsedMessages = JSON.parse(parsedResult) as RawParsedMessage[];
      parsedMessages = convertRawMessagesToMessages(rawParsedMessages);
    } catch (error) {
      throw error;
    }

    // 11. Return the NEW assistant messages (response only)
    if (parsedMessages.length === 0) {
      return { messages: [], inputTokens, outputTokens };
    }

    // Get the actual count of input messages that went into rendering
    // This should match the length of harmonyMessages after all modifications
    const originalMessageCount = harmonyMessages.length;

    // Process only the NEW assistant messages from the response
    const newMessages = parsedMessages.slice(originalMessageCount);

    // Log comprehensive harmony response analysis
    const responseAnalysis = {
      timestamp: new Date().toISOString(),
      totalNewMessages: newMessages.length,
      messagesByChannel: newMessages.reduce((acc, msg) => {
        const channel = msg.channel || "no-channel";
        acc[channel] = (acc[channel] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      messagesByRole: newMessages.reduce((acc, msg) => {
        acc[msg.role] = (acc[msg.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      allMessages: newMessages.map((msg) => {
        const firstContent = msg.content[0];
        const text =
          firstContent && "text" in firstContent
            ? firstContent.text
            : JSON.stringify(firstContent);
        return {
          role: msg.role,
          channel: msg.channel,
          recipient: msg.recipient,
          name: msg.name,
          contentPreview:
            text?.substring(0, 100) + (text && text.length > 100 ? "..." : ""),
          fullContent: text,
        };
      }),
    };

    fs.appendFileSync(
      logPath,
      `=== HARMONY RESPONSE ===\n${JSON.stringify(
        responseAnalysis,
        null,
        2
      )}\n========================\n\n`
    );

    // Return all new messages (no role filtering needed)
    return { messages: newMessages, inputTokens, outputTokens };
  } catch (error) {
    throw error;
  }
}
