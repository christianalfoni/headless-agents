import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import open from "open";
import path from "path";
import { execSync } from "child_process";

import { IPromptTask } from '../types.js';

interface TasksListProps {
  tasks: IPromptTask[];
  selectedIndex: number;
  searchPath: string;
  onSelect: (index: number) => void;
  onNavigate: (direction: 'up' | 'down') => void;
  onDelete: (index: number) => void;
  focusPrevious: () => void;
  isFocused: boolean;
}

type GitStatus = 'clean' | 'dirty' | 'unknown';

interface RepoGitStatus {
  [repoPath: string]: GitStatus;
}

const getGitStatus = (repoPath: string): GitStatus => {
  try {
    const status = execSync('git status --porcelain', {
      cwd: repoPath,
      stdio: 'pipe',
      encoding: 'utf8'
    });
    return status.trim() === '' ? 'clean' : 'dirty';
  } catch (error) {
    return 'unknown';
  }
};

export const SessionsList: React.FC<TasksListProps> = ({
  tasks,
  selectedIndex,
  searchPath,
  onSelect,
  onNavigate,
  onDelete,
  focusPrevious,
  isFocused
}) => {
  const [gitStatuses, setGitStatuses] = useState<RepoGitStatus>({});

  // Poll git status for all repos in tasks
  useEffect(() => {
    const updateGitStatuses = () => {
      const newStatuses: RepoGitStatus = {};

      tasks.forEach(task => {
        task.repos.forEach(repo => {
          const repoPath = path.join(searchPath, repo.repoInfo.folderName);
          newStatuses[repoPath] = getGitStatus(repoPath);
        });
      });

      setGitStatuses(newStatuses);
    };

    // Initial check
    updateGitStatuses();

    // Poll every 5 seconds
    const interval = setInterval(updateGitStatuses, 5000);

    return () => clearInterval(interval);
  }, [tasks, searchPath]);
  useInput((inputText, key) => {
    // Only handle input when focused
    if (!isFocused) return;
    
    if (key.upArrow) {
      if (selectedIndex === 0) {
        focusPrevious();
      } else {
        onNavigate('up');
      }
    } else if (key.downArrow) {
      onNavigate('down');
    } else if (key.return) {
      if (selectedIndex >= 0 && selectedIndex < tasks.length) {
        onSelect(selectedIndex);
      }
    } else if (key.backspace || key.delete) {
      if (selectedIndex >= 0 && selectedIndex < tasks.length) {
        onDelete(selectedIndex);
      }
    } else if ((key.shift && key.return) || inputText === 'o') {
      if (selectedIndex >= 0 && selectedIndex < tasks.length) {
        const task = tasks[selectedIndex];
        if (task.repos && task.repos.length > 0) {
          // Process each repository: checkout branch and open in VSCode
          for (const repo of task.repos) {
            const repoPath = path.join(searchPath, repo.repoInfo.folderName);
            
            try {
              // Fetch latest changes from remote
              execSync('git fetch', {
                cwd: repoPath,
                stdio: 'pipe' // Suppress output
              });
              
              // Try to checkout the branch for this repo
              execSync(`git checkout ${repo.branchName}`, {
                cwd: repoPath,
                stdio: 'pipe' // Suppress output
              });
              
              // Open the repository folder in VSCode
              const vscodeUrl = `vscode://file${repoPath}`;
              open(vscodeUrl).catch((error) => {
                console.error(`Failed to open VSCode for ${repo.repoInfo.folderName}:`, error);
              });
              
            } catch (error: any) {
              // Show error message for git checkout failure
              console.error(`Failed to checkout branch '${repo.branchName}' in ${repo.repoInfo.folderName}: ${error.message}`);
              console.error('This is typically due to existing uncommitted changes. Please commit or stash your changes first.');
            }
          }
        }
      }
    }
  });
  
  if (tasks.length === 0) {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="gray">No recent tasks</Text>
      </Box>
    );
  }
  
  // Show limited tasks when not focused
  const tasksToShow = isFocused ? tasks : tasks.slice(0, 5);
  
  return (
    <Box paddingX={1} paddingY={1} flexDirection="column">
      {tasksToShow.map((task, index) => {
        const statusIcon = task.getStateIcon();
        const createdAt = task.createdAt.toLocaleString();
        const isSelected = isFocused && index === selectedIndex;

        const hasRepos = task.repos.length > 0;
        
        return (
          <Box key={task.id} marginBottom={1} flexDirection="column">
            <Box paddingLeft={2} flexDirection="row" alignItems="flex-start">
              <Text color={isSelected ? "cyan" : "gray"}>● </Text>
              <Text color={isFocused ? "white" : "gray"}>
                {statusIcon} {task.prompt}
              </Text>
            </Box>
            <Box paddingLeft={2}>
              <Text color="gray" dimColor={!isFocused}>
                {createdAt}
              </Text>
            </Box>
            {hasRepos && (
              <Box paddingLeft={2} flexDirection="row" flexWrap="wrap">
                {task.repos.map((repo, idx) => {
                  const repoPath = path.join(searchPath, repo.repoInfo.folderName);
                  const status = gitStatuses[repoPath] || 'unknown';
                  const statusColor = status === 'clean' ? 'green' : status === 'dirty' ? 'red' : 'gray';
                  const statusSymbol = status === 'clean' ? '✓' : status === 'dirty' ? '⚠' : '?';
                  
                  return (
                    <React.Fragment key={idx}>
                      <Text color="yellow" dimColor={!isFocused}>
                        {repo.repoInfo.folderName}[{repo.branchName}] (
                      </Text>
                      <Text color={statusColor} dimColor={!isFocused}>
                        {statusSymbol}
                      </Text>
                      <Text color="yellow" dimColor={!isFocused}>
                        ){idx < task.repos.length - 1 ? ', ' : ''}
                      </Text>
                    </React.Fragment>
                  );
                })}
              </Box>
            )}
            {!hasRepos && task.state === "error" && (
              <Box paddingLeft={2}>
                <Text color="red" dimColor={!isFocused}>
                  ❌ No repositories available
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};