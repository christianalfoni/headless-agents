# Harmony SDK Improvement Recommendations

## Overview

This document outlines missing features and recommendations for improving the Together Harmony SDK implementation in `src/together-harmony-sdk.ts`. The current implementation is functional but lacks some advanced harmony features that could enhance functionality and compliance with the OpenAI harmony specification.

## Current Status

**File:** `src/together-harmony-sdk.ts`  
**OpenAI Harmony Version:** 0.4.0 (current)  
**Overall Completeness Score:** 85/100

### ✅ What's Working Well

- Core harmony integration with proper encoding/decoding
- Message role handling (system, user, assistant, developer)
- Tool integration with JSON Schema to TypeScript conversion
- Response parsing including preemptive channel handling
- Together AI API integration with reasoning effort support

## Missing Features

### 1. Explicit Channel Support ⚠️ **HIGH PRIORITY**

**Problem:** Messages don't specify channels, which is required for proper harmony compliance.

**Current Implementation:**
```typescript
const harmonyMessages: HarmonyMessage[] = config.messages.map((msg) => ({
  role: msg.role,
  content: [{ type: "text" as const, text: msg.content }],
}));
// ❌ No channel specification
```

**Recommended Fix:**

1. **Update the SimpleMessage interface:**
```typescript
interface SimpleMessage {
  role: "system" | "user" | "assistant" | "developer";
  content: string;
  channel?: "analysis" | "commentary" | "final"; // ✅ Add channel support
}
```

2. **Update message conversion:**
```typescript
const harmonyMessages: HarmonyMessage[] = config.messages.map((msg) => ({
  role: msg.role,
  content: [{ 
    type: "text" as const, 
    text: msg.content,
    channel: msg.channel || "final" // ✅ Specify channel with default
  }],
}));
```

**Channel Usage Guide:**
- **`final`**: User-facing responses, final answers
- **`analysis`**: Chain of thought reasoning (⚠️ different safety standards)
- **`commentary`**: Tool calls, function preambles

**Example Usage:**
```typescript
const messages = [
  { role: "system", content: "You are a helpful assistant", channel: "final" },
  { role: "user", content: "What's the weather like?", channel: "final" },
  { role: "assistant", content: "Let me check the weather for you", channel: "commentary" },
  { role: "assistant", content: "I need to determine the user's location first...", channel: "analysis" },
  { role: "assistant", content: "The weather is sunny, 75°F", channel: "final" }
];
```

### 2. Tool Constraints ⚠️ **MEDIUM PRIORITY**

**Problem:** No support for `<|constrain|>` tokens or tool usage guidance.

**Current Implementation:**
```typescript
const toolsMessage: HarmonyMessage = {
  role: "developer",
  content: [{ type: "text" as const, text: `# Tools\n${convertJsonSchemaToHarmonyTypeScript(config.tools)}` }],
};
// ❌ No constraints or usage guidance
```

**Recommended Fix:**

1. **Enhanced Tool Interface:**
```typescript
interface ToolConstraints {
  // When to use this tool
  useWhen?: string[];
  
  // When to avoid this tool  
  avoidWhen?: string[];
  
  // Required sequence (call after these tools)
  requiresSequence?: string[];
  
  // Data type constraints
  dataType?: "json" | "string" | "number";
  
  // Confirmation required before calling
  requiresConfirmation?: boolean;
  
  // Preamble phrases to use
  preambleExamples?: string[];
}

interface Tool {
  name: string;
  description?: string;
  input_schema: JsonSchema;
  constraints?: ToolConstraints; // ✅ Add constraints
}
```

2. **Enhanced Tool Message Generation:**
```typescript
const generateToolMessage = (tools: Tool[]) => {
  const toolsWithConstraints = tools.map(tool => {
    let toolDef = convertJsonSchemaToHarmonyTypeScript([tool]);
    
    if (tool.constraints) {
      // Add constraint tokens
      if (tool.constraints.dataType) {
        toolDef += `\n<|constrain|> ${tool.constraints.dataType}`;
      }
      
      // Add usage guidance
      if (tool.constraints.useWhen?.length) {
        toolDef += `\n// Use when: ${tool.constraints.useWhen.join(', ')}`;
      }
      if (tool.constraints.avoidWhen?.length) {
        toolDef += `\n// Do NOT use when: ${tool.constraints.avoidWhen.join(', ')}`;
      }
      
      // Add preamble examples
      if (tool.constraints.preambleExamples?.length) {
        toolDef += `\n// Preamble examples: ${tool.constraints.preambleExamples.map(p => `"${p}"`).join(', ')}`;
      }
    }
    
    return toolDef;
  }).join('\n\n');
  
  return `# Tools\n${toolsWithConstraints}`;
};
```

**Example Tool with Constraints:**
```typescript
const weatherTool: Tool = {
  name: "get_weather",
  description: "Get current weather information",
  input_schema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City name" }
    },
    required: ["location"]
  },
  constraints: {
    useWhen: [
      "user asks about current weather", 
      "needs weather for planning activities"
    ],
    avoidWhen: [
      "asking about historical weather", 
      "general climate questions"
    ],
    dataType: "json",
    preambleExamples: [
      "Let me check the current weather",
      "I'll get the latest weather information"
    ]
  }
};
```

### 3. Model Configuration ⚠️ **LOW PRIORITY**

**Problem:** Hard-coded to `openai/gpt-oss-120b` model.

**Recommended Fix:**
```typescript
interface PromptConfig {
  messages: SimpleMessage[];
  tools?: Tool[];
  reasoningEffort?: "low" | "medium" | "high";
  model?: "openai/gpt-oss-120b" | "openai/gpt-oss-20b"; // ✅ Add model option
}

// In the API call:
const completionParams: any = {
  messages: [{ role: "user", content: promptText }],
  model: config.model || "openai/gpt-oss-120b", // ✅ Use configured model
};
```

### 4. Enhanced Error Handling ⚠️ **LOW PRIORITY**

**Current:** Generic try/catch without harmony-specific error handling.

**Recommended Enhancement:**
```typescript
// Add harmony-specific error types
class HarmonyParsingError extends Error {
  constructor(message: string, public readonly tokens?: any) {
    super(`Harmony parsing error: ${message}`);
    this.name = 'HarmonyParsingError';
  }
}

class HarmonyEncodingError extends Error {
  constructor(message: string) {
    super(`Harmony encoding error: ${message}`);
    this.name = 'HarmonyEncodingError';
  }
}

// Enhanced error handling in main function
try {
  // ... existing code
} catch (error) {
  if (error.message?.includes('parsing') || error.message?.includes('token')) {
    throw new HarmonyParsingError(error.message, responseTokens);
  } else if (error.message?.includes('encoding')) {
    throw new HarmonyEncodingError(error.message);
  }
  // Re-throw original error if not harmony-related
  throw error;
}
```

## Implementation Priority

### Phase 1: Core Compliance (High Priority)
1. **Add explicit channel support** - Required for harmony specification compliance
2. **Update message interface** to include channel parameter
3. **Test channel functionality** with all three channel types

### Phase 2: Enhanced Tool Support (Medium Priority)
1. **Implement basic tool constraints** (`useWhen`, `avoidWhen`)
2. **Add `<|constrain|>` token support**
3. **Test tool constraint functionality**

### Phase 3: Polish & Configuration (Low Priority)
1. **Add model configuration options**
2. **Enhance error handling**
3. **Add comprehensive logging for constraints**

## Testing Recommendations

After implementing these features, test with:

1. **Channel Separation:**
   - Verify analysis channel contains reasoning
   - Verify final channel contains user-facing content
   - Verify commentary channel contains tool calls

2. **Tool Constraints:**
   - Test that tools are used appropriately based on `useWhen` conditions
   - Test that tools are avoided based on `avoidWhen` conditions
   - Verify constraint tokens are properly formatted

3. **Model Support:**
   - Test both gpt-oss-120b and gpt-oss-20b models
   - Verify reasoning effort works with both models

## References

- [OpenAI Harmony Response Format Guide](https://cookbook.openai.com/articles/openai-harmony)
- [OpenAI Harmony GitHub Repository](https://github.com/openai/harmony)
- [Verifying gpt-oss implementations](https://cookbook.openai.com/articles/gpt-oss/verifying-implementations)