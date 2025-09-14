import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { InputField } from './InputField.js';
import { SessionsList } from './SessionsList.js';
import { MessagesView } from './MessagesView.js';

import { GitRepoInfo, IPromptTask } from '../types.js';

interface AppProps {
  tasks: IPromptTask[];
  gitRepos: GitRepoInfo[];
  searchPath: string;
  onPromptSubmit: (prompt: string) => void;
  onTaskDelete: (taskId: string) => void;
}

export const App: React.FC<AppProps> = ({
  tasks,
  gitRepos,
  searchPath,
  onPromptSubmit,
  onTaskDelete
}) => {
  const [currentFocus, setCurrentFocus] = useState<'input' | 'list'>('input');
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [viewingTask, setViewingTask] = useState<IPromptTask | null>(null);
  const { exit } = useApp();
  
  useInput((inputText, key) => {
    if (key.escape && !viewingTask) {
      exit();
    }
  });
  
  const handleFocusNext = useCallback(() => {
    if (tasks.length > 0) {
      setCurrentFocus('list');
      setSelectedTaskIndex(0);
    }
  }, [tasks.length]);
  
  const handlePromptSubmit = useCallback((prompt: string) => {
    onPromptSubmit(prompt);
  }, [onPromptSubmit]);
  
  const handleFocusPrevious = useCallback(() => {
    setCurrentFocus('input');
  }, []);
  
  const handleNavigate = useCallback((direction: 'up' | 'down') => {
    if (direction === 'up' && selectedTaskIndex > 0) {
      setSelectedTaskIndex(selectedTaskIndex - 1);
    } else if (direction === 'down' && selectedTaskIndex < tasks.length - 1) {
      setSelectedTaskIndex(selectedTaskIndex + 1);
    }
  }, [selectedTaskIndex, tasks.length]);
  
  const handleTaskSelect = useCallback((index: number) => {
    if (index >= 0 && index < tasks.length) {
      setViewingTask(tasks[index]);
    }
  }, [tasks]);
  
  const handleBackToMain = useCallback(() => {
    setViewingTask(null);
  }, []);
  
  const handleTaskDelete = useCallback((index: number) => {
    if (index >= 0 && index < tasks.length) {
      const taskToDelete = tasks[index];
      onTaskDelete(taskToDelete.id);

      // If this was the last task, go back to input
      if (tasks.length === 1) {
        setCurrentFocus('input');
        setSelectedTaskIndex(0);
      } else {
        // Adjust selected index if needed
        if (selectedTaskIndex >= tasks.length - 1) {
          setSelectedTaskIndex(Math.max(0, tasks.length - 2));
        }
      }
    }
  }, [tasks, selectedTaskIndex, onTaskDelete]);
  
  // Show messages view if a task is selected
  if (viewingTask) {
    return <MessagesView task={viewingTask} onBack={handleBackToMain} />;
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
      
      {/* Tasks List */}
      <Box paddingX={1} marginTop={1}>
        <Text bold color="cyan">Recent Tasks:</Text>
      </Box>
      <SessionsList
        tasks={tasks}
        selectedIndex={selectedTaskIndex}
        searchPath={searchPath}
        onSelect={handleTaskSelect}
        onNavigate={handleNavigate}
        onDelete={handleTaskDelete}
        focusPrevious={handleFocusPrevious}
        isFocused={currentFocus === 'list'}
      />
    </Box>
  );
};