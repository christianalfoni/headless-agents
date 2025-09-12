# Together AI SDK + OpenAI Harmony Integration

## Overview

This document outlines our new strategy for integrating with Together AI's OpenAI-compatible models (specifically `openai/gpt-oss-120b`) using the official Together AI SDK with raw responses and OpenAI Harmony parsing.

## Architecture

### Previous Implementation

- Direct HTTP requests to Together API
- Custom JSON tool call parsing
- Manual tool definition injection via system prompts
- Complex reasoning-only response handling

### New Implementation

- **Together AI SDK**: Official SDK with raw response access
- **OpenAI Harmony**: Native parsing for reasoning, text, and tool calls
- **Cleaner Abstractions**: Proper channel separation and token handling

## Message Parsing Flow

### Input: Messages → Harmony Format

Before sending to the model, regular messages must be converted to harmony format:

```typescript
// Input messages (standard format)
const inputMessages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is 2+2?' },
  { role: 'assistant', content: 'Let me calculate that for you.' }
];

// OpenAI Harmony encoding converts these to harmony tokens
import { load_harmony_encoding, HarmonyEncodingName } from "openai-harmony";

const encoding = await load_harmony_encoding(HarmonyEncodingName.HARMONY_GPT_OSS);

// Convert messages to harmony tokens for model input
const harmonyTokens = encoding.encode_messages_to_completion_tokens(inputMessages);
```

**Harmony Token Format (Model Input):**
```
<|start|>system<|message|>You are a helpful assistant.<|end|>
<|start|>user<|message|>What is 2+2?<|end|>
<|start|>assistant<|message|>Let me calculate that for you.<|end|>
```

### Output: Harmony Response → Messages

After inference, the model returns harmony-formatted tokens that must be parsed back:

```typescript
// Raw harmony response from model (token format)
const harmonyResponse = `
<|start|>assistant<|channel|>analysis<|message|>I need to perform a simple arithmetic calculation.<|end|>
<|start|>assistant<|channel|>final<|message|>2 + 2 = 4<|end|>
<|start|>assistant<|channel|>commentary to=functions.calculator<|constrain|>json<|message|>{"operation": "add", "a": 2, "b": 2}<|call|>
`;

// Parse harmony tokens back to structured messages
const parsedMessages = encoding.parse_messages_from_completion_tokens(harmonyTokens);
```

**Parsed Output Structure:**
```typescript
const result: OpenAIHarmonyMessage = {
  role: 'assistant',
  content: [
    { type: 'reasoning', text: 'I need to perform a simple arithmetic calculation.' },
    { type: 'text', text: '2 + 2 = 4' },
    { type: 'tool_call', id: 'call_123', function: { name: 'calculator', arguments: '{"operation":"add","a":2,"b":2}' } }
  ]
};
```

### Channel Mapping (Harmony → Content Types)

| Harmony Channel | Content Type | Description |
|----------------|--------------|-------------|
| `<|channel|>analysis` | `reasoning` | Internal model reasoning |
| `<|channel|>final` | `text` | User-facing response |
| `<|channel|>commentary` | `tool_call` | Function calls |
| Pre-channel content | `preamble` | Content before structured channels |
| `<|start|>system` | `system_content` | System instructions |
| `<|start|>developer` | `developer_content` | Developer configurations |

### Complete Inference Integration Flow

```typescript
async function processWithHarmony(messages: Message[]): Promise<OpenAIHarmonyMessage> {
  // 1. Load harmony encoding
  const encoding = await load_harmony_encoding(HarmonyEncodingName.HARMONY_GPT_OSS);
  
  // 2. Convert input messages to harmony tokens
  const inputTokens = encoding.encode_messages_to_completion_tokens(messages);
  
  // 3. Send to Together AI via SDK
  const { data: completion, response: rawResponse } = await client.chat.completions
    .create({
      messages: [], // Empty - we use raw tokens
      model: 'openai/gpt-oss-120b',
      // Include input tokens directly in the request
      prompt_tokens: inputTokens,
      tools: toolDefinitions
    })
    .withResponse();
  
  // 4. Extract completion tokens from response
  const completionTokens = completion.choices[0].message.content;
  
  // 5. Parse harmony response back to structured format
  const parsedMessages = encoding.parse_messages_from_completion_tokens(completionTokens);
  
  // 6. Convert to our OpenAIHarmonyMessage format
  return convertToHarmonyMessage(parsedMessages[0]);
}
```

### Tool Call Results Integration

When tool calls are executed, results can be added back to the conversation:

```typescript
// After executing tool calls, add results to conversation
const toolResults: OpenAIHarmonyMessage = {
  role: 'assistant', 
  content: [
    { type: 'tool_result', tool_call_id: 'call_123', content: '4' }
  ]
};

// Continue conversation with tool results included
const updatedMessages = [...previousMessages, toolResults];
const nextResponse = await processWithHarmony(updatedMessages);
```

## Key Components

### 1. Together AI SDK Integration

```typescript
import Together from 'together-ai';

const client = new Together({
  apiKey: process.env.TOGETHER_API_KEY
});

// Get both parsed data and raw response
const { data: chatCompletion, response: rawResponse } = await client.chat.completions
  .create({
    messages: [...],
    model: 'openai/gpt-oss-120b',
    // ... other params
  })
  .withResponse();
```

### 2. Harmony Response Format

The harmony format uses special tokens to structure responses:

- `<|start|>assistant<|channel|>analysis<|message|>` - Reasoning content
- `<|start|>assistant<|channel|>final<|message|>` - User-facing text
- `<|start|>assistant<|channel|>commentary<|message|>` - Tool calls

### 3. Response Parsing with OpenAI Harmony

```typescript
import {
  load_harmony_encoding,
  StreamableParser,
  HarmonyEncodingName,
  Role,
} from "openai-harmony";

const encoding = await load_harmony_encoding(
  HarmonyEncodingName.HARMONY_GPT_OSS
);
const parser = new StreamableParser(encoding, Role.ASSISTANT);

// Parse tokens from raw response
const messages = encoding.parse_messages_from_completion_tokens(tokens);
```

### 4. Channel Mapping

- **analysis** channel → `reasoning` field in TogetherResponse
- **final** channel → `text` field in TogetherResponse
- **commentary** channel with `<|call|>` tokens → `toolCalls` array

### 5. Tool Call Format

Harmony represents tool calls as:

```
<|start|>assistant<|channel|>commentary to=functions.tool_name <|constrain|>json<|message|>{"param": "value"}<|call|>
```

This gets parsed into:

```typescript
{
  id: "call_generated_id",
  type: "function",
  function: {
    name: "tool_name",
    arguments: JSON.stringify({"param": "value"})
  }
}
```

## Benefits

### 1. **Official SDK Support**

- Better error handling and rate limiting
- Automatic retries and connection management
- Future-proof against API changes

### 2. **Native Harmony Parsing**

- Proper reasoning extraction from analysis channel
- Clean separation of internal reasoning vs user-facing text
- Native tool call parsing without custom JSON extraction

### 3. **Reduced Complexity**

- Eliminate custom HTTP request logic
- Remove manual tool call parsing
- Simplified response handling

### 4. **Better Debugging**

- Cleaner channel separation in logs
- More structured error handling
- Preserved debug logging functionality

## Complete Type Definitions

After fetch + parsing, the output should be a HarmonyMessage with role and an array of harmony message content:

```typescript
// OpenAI Harmony Message Content Types (from openai-harmony package)
type OpenAIHarmonyMessageContent = 
  // User-facing response text from the harmony 'final' channel
  | { type: 'text'; text: string }
  
  // Internal model reasoning from the harmony 'analysis' channel
  | { type: 'reasoning'; text: string }
  
  // Function/tool calls initiated by the model (from harmony 'commentary' channel with <|call|> tokens)
  | { type: 'tool_call'; id: string; function: { name: string; arguments: string } }
  
  // Results from executed tool calls (OpenAI harmony format)
  | { type: 'tool_result'; tool_call_id: string; content: string }
  
  // Content that appears before harmony structured channels begin
  | { type: 'preamble'; text: string }
  
  // System-level content parsed from harmony channels
  | { type: 'system_content'; text: string }
  
  // Developer instructions content with optional tool definitions (harmony developer role)
  | { type: 'developer_content'; instructions: string; tools?: object };

// OpenAI Harmony Message Type (from openai-harmony package)
type OpenAIHarmonyMessage = {
  // Harmony message roles as defined in openai-harmony:
  // - 'system': System instructions/context 
  // - 'user': End user input/queries
  // - 'assistant': AI model responses with harmony channels
  // - 'developer': Developer instructions for model configuration
  role: 'system' | 'user' | 'assistant' | 'developer';
  content: OpenAIHarmonyMessageContent[];
};

// Expected output example from openai-harmony parsing
const message: OpenAIHarmonyMessage = {
  role: 'assistant',
  content: [
    { type: 'preamble', text: 'Preamble content before structured channels...' },
    { type: 'reasoning', text: 'Internal reasoning from analysis channel...' },
    { type: 'text', text: 'User-facing response from final channel...' },
    { type: 'tool_call', id: 'call_123', function: { name: 'tool_name', arguments: '{"param":"value"}' } },
    { type: 'tool_result', tool_call_id: 'call_123', content: 'Tool execution result...' }
  ]
};
```

### OpenAI Harmony Content Types

- **text**: Content from the harmony `final` channel - the user-facing response text (uses `text` field)
- **reasoning**: Content from the harmony `analysis` channel - internal model reasoning (uses `text` field)
- **tool_call**: Parsed tool calls from harmony `commentary` channel with `<|call|>` tokens
- **tool_result**: Results from executed tool calls as parsed by openai-harmony (linked by `tool_call_id`, uses `content` field)
- **preamble**: Content that appears before structured harmony channels begin (uses `text` field)
- **system_content**: System-level content parsed from harmony channels (uses `text` field)
- **developer_content**: Developer instructions with optional tool definitions from harmony developer role

### Parsing Order

Content is returned in the order it appears in the harmony-formatted response, preserving the natural flow of reasoning → text → tool calls when present.

## Implementation Notes

### Error Handling

- SDK errors are wrapped to match existing error format
- Harmony parsing failures fall back gracefully
- Tool validation preserved for available tools

### Backward Compatibility

- Maintain exact `TogetherResponse` interface
- Preserve existing method signatures
- Keep debug logging to `agent.log`

### Performance Considerations

- Harmony parsing is more efficient than custom JSON parsing
- SDK handles connection pooling and retries
- Reduced network overhead with proper raw response handling
