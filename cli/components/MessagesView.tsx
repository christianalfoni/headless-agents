import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import open from "open";

import { IPromptSession } from '../types.js';

interface MessagesViewProps {
  session: IPromptSession;
  onBack: () => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ session, onBack }) => {
  const [scrollOffset, setScrollOffset] = useState(0);
  const { exit } = useApp();
  
  // Reset scroll to top when component mounts
  useEffect(() => {
    setScrollOffset(0);
  }, [session.id]);
  
  useInput((inputText, key) => {
    if (key.escape) {
      onBack();
    } else if (inputText === 'o') {
      // VSCode functionality removed - feature not available
    } else if (key.shift && key.upArrow) {
      // Scroll up
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.shift && key.downArrow) {
      // Scroll down
      setScrollOffset(prev => Math.min(session.messages.length - 1, prev + 1));
    }
  });
  
  // Simply use the messages as they come from the sandbox endpoint
  const messages = session.messages.filter(message => message && message.trim());
  
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        {session.sandboxId && (
          <Text color="cyan">📦 Sandbox: https://codesandbox.io/s/{session.sandboxId}</Text>
        )}
        <Text bold>Prompt: {session.prompt}</Text>
        <Text>Status: {session.getStateIcon()} {session.getStateText()}</Text>
        <Text color="gray">Press ESC to go back | Shift+↑↓ to scroll</Text>
      </Box>
      
      {/* Messages */}
      <Box flexDirection="column">
        {messages.length === 0 ? (
          <Text color="gray">No messages yet...</Text>
        ) : (
          messages
            .slice(scrollOffset)
            .map((message, index) => (
              <Box key={scrollOffset + index} marginBottom={1}>
                <Text wrap="wrap">{message}</Text>
              </Box>
            ))
        )}
      </Box>
    </Box>
  );
};