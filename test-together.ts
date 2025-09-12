import { TogetherSDK } from "./src/together-sdk.js";
import os from "os";

const apiKey = process.env.TOGETHER_AI_API_KEY;

if (!apiKey) {
  console.error("TOGETHER_AI_API_KEY environment variable is required");
  process.exit(1);
}

const together = new TogetherSDK(apiKey);

async function testTogether() {
  try {
    const response = await together.createChatCompletion({
      temperature: 0.2,
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content: `You are a coding agent. Your primary mission is to help the user achieve their goal. Do this by evaluating if you have enough context about the current project. Then describe the next step and what action you want to take. In addition to the description of the next action, include an inline unformatted JSON object in the format of {name: string,parameters: object} describing the tool call.
          
  Tools:
${JSON.stringify({
  id: "anthropic.bash_20250124",
  name: "bash",
  description: `Execute bash commands in a non-interactive shell session on ${
    process.platform
  } (${os.release()}). Working directory: ${process.cwd()}. Each command runs in a fresh shell starting from this directory. Use non-interactive flags for commands that normally prompt for input (e.g., --yes, --force, --no-input).`,
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute",
      },
    },
    required: ["command"],
  },
})}
          `,
        },
        {
          role: "user",
          content: "Can you set up a React project using Vite?",
        },
      ],
      stream: true,
    });

    console.log("Response:", {
      reasoning: response.reasoning,
      text: response.text,
      toolCalls: response.toolCalls,
      usage: response.usage
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

testTogether();
