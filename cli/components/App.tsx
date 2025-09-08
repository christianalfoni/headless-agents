import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { InputField } from './InputField.js';
import { SessionsList } from './SessionsList.js';
import { MessagesView } from './MessagesView.js';

import { GitRepoInfo, IPromptSession } from '../types.js';

interface AppProps {
  sessions: IPromptSession[];
  gitRepos: GitRepoInfo[];
  searchPath: string;
  onPromptSubmit: (prompt: string) => void;
  onSessionDelete: (sessionId: string) => void;
}

export const App: React.FC<AppProps> = ({ 
  sessions, 
  gitRepos, 
  searchPath,
  onPromptSubmit, 
  onSessionDelete 
}) => {
  const [currentFocus, setCurrentFocus] = useState<'input' | 'list'>('input');
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const [viewingSession, setViewingSession] = useState<IPromptSession | null>(null);
  const { exit } = useApp();
  
  useInput((inputText, key) => {
    if (key.escape && !viewingSession) {
      exit();
    }
  });
  
  const handleFocusNext = useCallback(() => {
    if (sessions.length > 0) {
      setCurrentFocus('list');
      setSelectedSessionIndex(0);
    }
  }, [sessions.length]);
  
  const handlePromptSubmit = useCallback((prompt: string) => {
    onPromptSubmit(prompt);
  }, [onPromptSubmit]);
  
  const handleFocusPrevious = useCallback(() => {
    setCurrentFocus('input');
  }, []);
  
  const handleNavigate = useCallback((direction: 'up' | 'down') => {
    if (direction === 'up' && selectedSessionIndex > 0) {
      setSelectedSessionIndex(selectedSessionIndex - 1);
    } else if (direction === 'down' && selectedSessionIndex < sessions.length - 1) {
      setSelectedSessionIndex(selectedSessionIndex + 1);
    }
  }, [selectedSessionIndex, sessions.length]);
  
  const handleSessionSelect = useCallback((index: number) => {
    if (index >= 0 && index < sessions.length) {
      setViewingSession(sessions[index]);
    }
  }, [sessions]);
  
  const handleBackToMain = useCallback(() => {
    setViewingSession(null);
  }, []);
  
  const handleSessionDelete = useCallback((index: number) => {
    if (index >= 0 && index < sessions.length) {
      const sessionToDelete = sessions[index];
      onSessionDelete(sessionToDelete.id);
      
      // If this was the last session, go back to input
      if (sessions.length === 1) {
        setCurrentFocus('input');
        setSelectedSessionIndex(0);
      } else {
        // Adjust selected index if needed
        if (selectedSessionIndex >= sessions.length - 1) {
          setSelectedSessionIndex(Math.max(0, sessions.length - 2));
        }
      }
    }
  }, [sessions, selectedSessionIndex, onSessionDelete]);
  
  // Show messages view if a session is selected
  if (viewingSession) {
    return <MessagesView session={viewingSession} onBack={handleBackToMain} />;
  }
  
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header */}
      <Box paddingX={1}>
        <Box flexDirection="column">
          {gitRepos && gitRepos.length === 0 && (
            <Text color="red">⚠️  No git repositories found - at least one repo is required</Text>
          )}
        </Box>
      </Box>
      
      {/* Input Field */}
      <Box flexDirection="column">
        <InputField 
          onSubmit={handlePromptSubmit} 
          focusNext={handleFocusNext} 
          gitRepos={gitRepos}
          isFocused={currentFocus === 'input'}
        />
      </Box>
      
      {/* Sessions List */}
      <Box paddingX={1} marginTop={1}>
        <Text bold color="cyan">Recent Prompts:</Text>
      </Box>
      <SessionsList
        sessions={sessions}
        selectedIndex={selectedSessionIndex}
        searchPath={searchPath}
        onSelect={handleSessionSelect}
        onNavigate={handleNavigate}
        onDelete={handleSessionDelete}
        focusPrevious={handleFocusPrevious}
        isFocused={currentFocus === 'list'}
      />
    </Box>
  );
};