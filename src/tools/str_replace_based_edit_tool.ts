import * as fs from "fs/promises";
import * as path from "path";

// Function version that includes working directory context
export function str_replace_based_edit_tool(workingDirectory: string) {
  return {
    id: "anthropic.textEditor_20250429",
    name: "str_replace_based_edit_tool",
    description: `File editing tool for viewing and editing individual files through string replacement, creation, viewing, and insertion. Working directory: ${workingDirectory}. Use relative paths from this directory or absolute paths.`,
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          enum: ["view", "create", "str_replace", "insert"],
          description: "The file operation to perform",
        },
        path: {
          type: "string",
          description: "The file path to operate on",
        },
        file_text: {
          type: "string",
          description: "The content for create command",
        },
        insert_line: {
          type: "number",
          description: "Line number to insert at (1-based indexing, like view command). Use 1 to insert at beginning, 2 to insert after line 1, etc.",
        },
        new_str: {
          type: "string",
          description: "New string to replace with (for str_replace command)",
        },
        old_str: {
          type: "string",
          description: "Old string to replace (for str_replace command)",
        },
        view_range: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
          description:
            "Start and end line numbers for view command [start, end] (1-based indexing, end exclusive). Use [1, 3] to show lines 1 and 2, [2, 5] to show lines 2, 3, and 4.",
        },
      },
      required: ["command", "path"],
    },
    execute: async ({
      command,
      path: filePath,
      file_text,
      insert_line,
      new_str,
      old_str,
      view_range,
    }: {
      command: "view" | "create" | "str_replace" | "insert";
      path: string;
      file_text?: string;
      insert_line?: number;
      new_str?: string;
      old_str?: string;
      view_range?: [number, number];
    }) => {
      try {
        // Resolve the file path relative to the working directory if it's not absolute
        const resolvedFilePath = path.isAbsolute(filePath)
          ? filePath
          : path.join(workingDirectory, filePath);
        switch (command) {
          case "view":
            // Check if path is a directory
            const stats = await fs.stat(resolvedFilePath);
            if (stats.isDirectory()) {
              return "Error: Cannot view directories. Use bash commands like 'ls' to list directory contents.";
            }

            const content = await fs.readFile(resolvedFilePath, "utf8");
            const lines = content.split("\n");

            if (view_range && view_range.length === 2) {
              const [start, end] = view_range;
              // Convert to 0-based indexing, end is exclusive
              const viewLines = lines.slice(start - 1, end);
              return viewLines.join("\n");
            }

            return content;

          case "create":
            if (!file_text) {
              return "Error: file_text is required for create command";
            }

            // Check if file already exists
            try {
              await fs.access(resolvedFilePath);
              return `Error: File '${filePath}' already exists. Use str_replace or view command instead.`;
            } catch {
              // File doesn't exist, proceed with creation
            }

            // Ensure directory exists
            const dir = path.dirname(resolvedFilePath);
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(resolvedFilePath, file_text, "utf8");
            return `File '${filePath}' created successfully with ${
              file_text.split("\n").length
            } lines.`;

          case "str_replace":
            if (!old_str || new_str === undefined) {
              return "Error: old_str and new_str are required for str_replace command";
            }

            const existingContent = await fs.readFile(resolvedFilePath, "utf8");

            if (!existingContent.includes(old_str)) {
              return "Error: old_str not found in file";
            }

            const replacedContent = existingContent.replace(old_str, new_str);
            await fs.writeFile(resolvedFilePath, replacedContent, "utf8");
            return `String replacement completed successfully in '${filePath}'.`;

          case "insert":
            if (insert_line === undefined || new_str === undefined) {
              return "Error: insert_line and new_str are required for insert command";
            }

            if (insert_line === 0) {
              return "Error: insert_line uses 1-based indexing (like view command). Use 1 to insert at beginning, 2 to insert after line 1, etc.";
            }

            const fileContent = await fs.readFile(resolvedFilePath, "utf8");
            const fileLines = fileContent.split("\n");

            if (insert_line < 1 || insert_line > fileLines.length + 1) {
              return `Error: insert_line must be between 1 and ${fileLines.length + 1} (1-based indexing)`;
            }

            // Convert from 1-based to 0-based for array operations
            const insertIndex = insert_line - 1;
            fileLines.splice(insertIndex, 0, new_str);
            await fs.writeFile(resolvedFilePath, fileLines.join("\n"), "utf8");
            return `Line inserted successfully at line ${insert_line} in '${filePath}'.`;

          default:
            return `Error: Unknown command '${command}'`;
        }
      } catch (error) {
        if (error instanceof Error) {
          return `Error: ${error.message}`;
        }
        return "Error: Unknown error occurred";
      }
    },
  };
}
