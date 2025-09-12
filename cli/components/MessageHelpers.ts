// Helper functions for message filtering and cleaning
export const shouldSkipMessageForDisplay = (message: string): boolean => {
  const skipPatterns = [
    /npm start/,
    /npm run dev/,
    /bash$/,
    /```bash/,
    /\*\*Message Types shown in the UI\*\*/,
    /\*\*Overall Takeaway\*\*/,
    /Type prompts, wait for the agent/,
    /Exit with.*quit.*Ctrl\+C/,
    /The repository implements a self-contained/,
    /^\s*```\s*$/,  // Empty code blocks
    /^---+$/,       // Horizontal lines
    /^\s*$/         // Empty lines
  ];
  
  return skipPatterns.some(pattern => pattern.test(message));
};

export const cleanMessageForDisplay = (message: string): string => {
  // Remove ANSI color codes
  let cleaned = message.replace(/\u001b\[[0-9;]*m/g, '');
  
  // Remove chalk color formatting
  cleaned = cleaned.replace(/\u001b\]8;;[^\u001b]*\u001b\\/g, '');
  cleaned = cleaned.replace(/\u001b\]8;;\u001b\\/g, '');
  
  // Remove excessive whitespace
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return cleaned.trim();
};

export const parseMessage = (message: string) => {
  // Check if it's a tool call message (starts with 🔧 and has tool name)
  const toolCallMatch = message.match(/^🔧\s+(.+?)\s+\((.+)\)$/);
  if (toolCallMatch) {
    return {
      type: 'tool',
      icon: '🔧',
      toolName: toolCallMatch[1],
      details: toolCallMatch[2]
    };
  }
  
  // Check for other message types with icons
  const iconMatch = message.match(/^([🔧💬🧠✅❌⏳📋🏁💥])\s+(.+)$/);
  if (iconMatch) {
    return {
      type: 'icon',
      icon: iconMatch[1],
      content: iconMatch[2]
    };
  }
  
  // Regular message
  return {
    type: 'text',
    icon: '',
    content: message
  };
};