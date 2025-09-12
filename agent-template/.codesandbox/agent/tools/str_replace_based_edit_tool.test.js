import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { str_replace_based_edit_tool } from './str_replace_based_edit_tool.js';
describe('str_replace_based_edit_tool', () => {
    const testDir = path.join(process.cwd(), 'test-temp');
    const tool = str_replace_based_edit_tool(testDir);
    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
    });
    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        }
        catch (error) {
            // Ignore cleanup errors
        }
    });
    describe('tool metadata', () => {
        it('should have correct id and name', () => {
            expect(tool.id).toBe('anthropic.textEditor_20250429');
            expect(tool.name).toBe('str_replace_based_edit_tool');
        });
        it('should include working directory in description', () => {
            expect(tool.description).toContain(testDir);
        });
        it('should have correct input schema', () => {
            expect(tool.input_schema.type).toBe('object');
            expect(tool.input_schema.required).toEqual(['command', 'path']);
            expect(tool.input_schema.properties.command.enum).toEqual(['view', 'create', 'str_replace', 'insert']);
        });
    });
    describe('create command', () => {
        it('should create a new file successfully', async () => {
            const filePath = 'test.txt';
            const content = 'Hello, World!';
            const result = await tool.execute({
                command: 'create',
                path: filePath,
                file_text: content,
            });
            expect(result).toBe("File 'test.txt' created successfully with 1 lines.");
            const createdContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(createdContent).toBe(content);
        });
        it('should create file with multiple lines', async () => {
            const filePath = 'multiline.txt';
            const content = 'Line 1\nLine 2\nLine 3';
            const result = await tool.execute({
                command: 'create',
                path: filePath,
                file_text: content,
            });
            expect(result).toBe("File 'multiline.txt' created successfully with 3 lines.");
        });
        it('should create directories recursively', async () => {
            const filePath = 'nested/dir/file.txt';
            const content = 'nested content';
            await tool.execute({
                command: 'create',
                path: filePath,
                file_text: content,
            });
            const createdContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(createdContent).toBe(content);
        });
        it('should return error if file already exists', async () => {
            const filePath = 'existing.txt';
            await fs.writeFile(path.join(testDir, filePath), 'existing content');
            const result = await tool.execute({
                command: 'create',
                path: filePath,
                file_text: 'new content',
            });
            expect(result).toBe("Error: File 'existing.txt' already exists. Use str_replace or view command instead.");
        });
        it('should return error if file_text is missing', async () => {
            const result = await tool.execute({
                command: 'create',
                path: 'test.txt',
            });
            expect(result).toBe('Error: file_text is required for create command');
        });
        it('should work with absolute paths', async () => {
            const absolutePath = path.join(testDir, 'absolute.txt');
            const content = 'absolute content';
            const result = await tool.execute({
                command: 'create',
                path: absolutePath,
                file_text: content,
            });
            expect(result).toContain('created successfully');
            const createdContent = await fs.readFile(absolutePath, 'utf8');
            expect(createdContent).toBe(content);
        });
    });
    describe('view command', () => {
        it('should view entire file content', async () => {
            const filePath = 'view.txt';
            const content = 'Line 1\nLine 2\nLine 3';
            await fs.writeFile(path.join(testDir, filePath), content);
            const result = await tool.execute({
                command: 'view',
                path: filePath,
            });
            expect(result).toBe(content);
        });
        it('should view specific line range', async () => {
            const filePath = 'range.txt';
            const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
            await fs.writeFile(path.join(testDir, filePath), content);
            const result = await tool.execute({
                command: 'view',
                path: filePath,
                view_range: [2, 5],
            });
            expect(result).toBe('Line 2\nLine 3\nLine 4');
        });
        it('should use exclusive end in view_range', async () => {
            const filePath = 'exclusive.txt';
            const content = 'Line 1\nLine 2\nLine 3';
            await fs.writeFile(path.join(testDir, filePath), content);
            // [1, 3] should show lines 1 and 2 (end 3 is exclusive)
            const result = await tool.execute({
                command: 'view',
                path: filePath,
                view_range: [1, 3],
            });
            expect(result).toBe('Line 1\nLine 2');
        });
        it('should handle empty files', async () => {
            const filePath = 'empty.txt';
            await fs.writeFile(path.join(testDir, filePath), '');
            const result = await tool.execute({
                command: 'view',
                path: filePath,
            });
            expect(result).toBe('');
        });
        it('should return error for non-existent file', async () => {
            const result = await tool.execute({
                command: 'view',
                path: 'nonexistent.txt',
            });
            expect(result).toContain('Error:');
        });
        it('should return error when trying to view directory', async () => {
            const dirPath = 'testdir';
            await fs.mkdir(path.join(testDir, dirPath));
            const result = await tool.execute({
                command: 'view',
                path: dirPath,
            });
            expect(result).toBe("Error: Cannot view directories. Use bash commands like 'ls' to list directory contents.");
        });
        it('should work with absolute paths', async () => {
            const absolutePath = path.join(testDir, 'absolute.txt');
            const content = 'absolute content';
            await fs.writeFile(absolutePath, content);
            const result = await tool.execute({
                command: 'view',
                path: absolutePath,
            });
            expect(result).toBe(content);
        });
    });
    describe('str_replace command', () => {
        it('should replace string successfully', async () => {
            const filePath = 'replace.txt';
            const originalContent = 'Hello World';
            const expectedContent = 'Hello Universe';
            await fs.writeFile(path.join(testDir, filePath), originalContent);
            const result = await tool.execute({
                command: 'str_replace',
                path: filePath,
                old_str: 'World',
                new_str: 'Universe',
            });
            expect(result).toBe("String replacement completed successfully in 'replace.txt'.");
            const updatedContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(updatedContent).toBe(expectedContent);
        });
        it('should replace multiline strings', async () => {
            const filePath = 'multiline_replace.txt';
            const originalContent = 'Line 1\nOld Block\nLine 2\nLine 3';
            const expectedContent = 'Line 1\nNew Block\nExtra Line\nLine 2\nLine 3';
            await fs.writeFile(path.join(testDir, filePath), originalContent);
            const result = await tool.execute({
                command: 'str_replace',
                path: filePath,
                old_str: 'Old Block',
                new_str: 'New Block\nExtra Line',
            });
            expect(result).toContain('completed successfully');
            const updatedContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(updatedContent).toBe(expectedContent);
        });
        it('should replace with empty string (deletion)', async () => {
            const filePath = 'delete.txt';
            const originalContent = 'Keep this DELETE_ME and keep this';
            const expectedContent = 'Keep this  and keep this';
            await fs.writeFile(path.join(testDir, filePath), originalContent);
            const result = await tool.execute({
                command: 'str_replace',
                path: filePath,
                old_str: 'DELETE_ME',
                new_str: '',
            });
            expect(result).toContain('completed successfully');
            const updatedContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(updatedContent).toBe(expectedContent);
        });
        it('should return error if old_str not found', async () => {
            const filePath = 'not_found.txt';
            await fs.writeFile(path.join(testDir, filePath), 'Some content');
            const result = await tool.execute({
                command: 'str_replace',
                path: filePath,
                old_str: 'Not here',
                new_str: 'replacement',
            });
            expect(result).toBe('Error: old_str not found in file');
        });
        it('should return error if old_str is missing', async () => {
            const result = await tool.execute({
                command: 'str_replace',
                path: 'test.txt',
                new_str: 'replacement',
            });
            expect(result).toBe('Error: old_str and new_str are required for str_replace command');
        });
        it('should return error if new_str is missing', async () => {
            const result = await tool.execute({
                command: 'str_replace',
                path: 'test.txt',
                old_str: 'old',
            });
            expect(result).toBe('Error: old_str and new_str are required for str_replace command');
        });
        it('should only replace first occurrence', async () => {
            const filePath = 'first_only.txt';
            const originalContent = 'foo bar foo baz';
            const expectedContent = 'FOO bar foo baz';
            await fs.writeFile(path.join(testDir, filePath), originalContent);
            await tool.execute({
                command: 'str_replace',
                path: filePath,
                old_str: 'foo',
                new_str: 'FOO',
            });
            const updatedContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(updatedContent).toBe(expectedContent);
        });
    });
    describe('insert command', () => {
        it('should insert at beginning of file', async () => {
            const filePath = 'insert_begin.txt';
            const originalContent = 'Line 1\nLine 2';
            const expectedContent = 'Inserted Line\nLine 1\nLine 2';
            await fs.writeFile(path.join(testDir, filePath), originalContent);
            const result = await tool.execute({
                command: 'insert',
                path: filePath,
                insert_line: 1,
                new_str: 'Inserted Line',
            });
            expect(result).toBe("Line inserted successfully at line 1 in 'insert_begin.txt'.");
            const updatedContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(updatedContent).toBe(expectedContent);
        });
        it('should insert in middle of file', async () => {
            const filePath = 'insert_middle.txt';
            const originalContent = 'Line 1\nLine 2\nLine 3';
            const expectedContent = 'Line 1\nLine 2\nInserted Line\nLine 3';
            await fs.writeFile(path.join(testDir, filePath), originalContent);
            const result = await tool.execute({
                command: 'insert',
                path: filePath,
                insert_line: 3,
                new_str: 'Inserted Line',
            });
            expect(result).toContain('inserted successfully at line 3');
            const updatedContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(updatedContent).toBe(expectedContent);
        });
        it('should insert at end of file', async () => {
            const filePath = 'insert_end.txt';
            const originalContent = 'Line 1\nLine 2';
            const expectedContent = 'Line 1\nLine 2\nInserted Line';
            await fs.writeFile(path.join(testDir, filePath), originalContent);
            const result = await tool.execute({
                command: 'insert',
                path: filePath,
                insert_line: 3,
                new_str: 'Inserted Line',
            });
            expect(result).toContain('inserted successfully');
            const updatedContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(updatedContent).toBe(expectedContent);
        });
        it('should return error if insert_line is missing', async () => {
            const result = await tool.execute({
                command: 'insert',
                path: 'test.txt',
                new_str: 'line',
            });
            expect(result).toBe('Error: insert_line and new_str are required for insert command');
        });
        it('should return error if new_str is missing', async () => {
            const result = await tool.execute({
                command: 'insert',
                path: 'test.txt',
                insert_line: 1,
            });
            expect(result).toBe('Error: insert_line and new_str are required for insert command');
        });
        it('should return error if insert_line is negative', async () => {
            const filePath = 'test.txt';
            await fs.writeFile(path.join(testDir, filePath), 'content');
            const result = await tool.execute({
                command: 'insert',
                path: filePath,
                insert_line: -1,
                new_str: 'line',
            });
            expect(result).toContain('Error: insert_line must be between 1 and');
        });
        it('should return error if insert_line is too large', async () => {
            const filePath = 'test.txt';
            await fs.writeFile(path.join(testDir, filePath), 'Line 1');
            const result = await tool.execute({
                command: 'insert',
                path: filePath,
                insert_line: 5,
                new_str: 'line',
            });
            expect(result).toContain('Error: insert_line must be between 1 and');
        });
        it('should return helpful error for 0-based indexing attempt', async () => {
            const filePath = 'test.txt';
            await fs.writeFile(path.join(testDir, filePath), 'Line 1');
            const result = await tool.execute({
                command: 'insert',
                path: filePath,
                insert_line: 0,
                new_str: 'line',
            });
            expect(result).toBe('Error: insert_line uses 1-based indexing (like view command). Use 1 to insert at beginning, 2 to insert after line 1, etc.');
        });
    });
    describe('error handling', () => {
        it('should handle unknown commands', async () => {
            const result = await tool.execute({
                command: 'unknown',
                path: 'test.txt',
            });
            expect(result).toBe("Error: Unknown command 'unknown'");
        });
        it('should handle file system errors gracefully', async () => {
            // Try to read from a path that doesn't have permission
            const result = await tool.execute({
                command: 'view',
                path: '/root/restricted-file.txt',
            });
            expect(result).toContain('Error:');
        });
    });
    describe('path handling', () => {
        it('should handle relative paths', async () => {
            const filePath = 'relative.txt';
            const content = 'relative content';
            await tool.execute({
                command: 'create',
                path: filePath,
                file_text: content,
            });
            const result = await tool.execute({
                command: 'view',
                path: filePath,
            });
            expect(result).toBe(content);
        });
        it('should handle nested relative paths', async () => {
            const filePath = 'nested/relative.txt';
            const content = 'nested relative content';
            await tool.execute({
                command: 'create',
                path: filePath,
                file_text: content,
            });
            const result = await tool.execute({
                command: 'view',
                path: filePath,
            });
            expect(result).toBe(content);
        });
    });
    describe('edge cases', () => {
        it('should handle empty file for str_replace', async () => {
            const filePath = 'empty.txt';
            await fs.writeFile(path.join(testDir, filePath), '');
            const result = await tool.execute({
                command: 'str_replace',
                path: filePath,
                old_str: 'anything',
                new_str: 'replacement',
            });
            expect(result).toBe('Error: old_str not found in file');
        });
        it('should handle special characters in strings', async () => {
            const filePath = 'special.txt';
            const content = 'Line with [brackets] and {braces} and (parens)';
            await fs.writeFile(path.join(testDir, filePath), content);
            const result = await tool.execute({
                command: 'str_replace',
                path: filePath,
                old_str: '[brackets]',
                new_str: '<angles>',
            });
            expect(result).toContain('completed successfully');
            const updatedContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(updatedContent).toBe('Line with <angles> and {braces} and (parens)');
        });
        it('should handle unicode characters', async () => {
            const filePath = 'unicode.txt';
            const content = 'Hello 世界! 🌍 emoji test';
            await tool.execute({
                command: 'create',
                path: filePath,
                file_text: content,
            });
            const result = await tool.execute({
                command: 'view',
                path: filePath,
            });
            expect(result).toBe(content);
        });
        it('should handle very long lines', async () => {
            const filePath = 'long.txt';
            const longLine = 'x'.repeat(10000);
            await tool.execute({
                command: 'create',
                path: filePath,
                file_text: longLine,
            });
            const result = await tool.execute({
                command: 'view',
                path: filePath,
            });
            expect(result).toBe(longLine);
        });
        it('should handle files with only newlines', async () => {
            const filePath = 'newlines.txt';
            const content = '\n\n\n';
            await tool.execute({
                command: 'create',
                path: filePath,
                file_text: content,
            });
            const result = await tool.execute({
                command: 'view',
                path: filePath,
            });
            expect(result).toBe(content);
        });
        it('should handle view_range at file boundaries', async () => {
            const filePath = 'boundary.txt';
            const content = 'Line 1\nLine 2\nLine 3';
            await fs.writeFile(path.join(testDir, filePath), content);
            const result = await tool.execute({
                command: 'view',
                path: filePath,
                view_range: [1, 10], // End beyond file length
            });
            expect(result).toBe('Line 1\nLine 2\nLine 3');
        });
        it('should handle insert at exact file length', async () => {
            const filePath = 'exact.txt';
            const content = 'Line 1\nLine 2';
            await fs.writeFile(path.join(testDir, filePath), content);
            const lines = content.split('\n');
            const result = await tool.execute({
                command: 'insert',
                path: filePath,
                insert_line: lines.length + 1,
                new_str: 'Line 3',
            });
            expect(result).toContain('inserted successfully');
            const updatedContent = await fs.readFile(path.join(testDir, filePath), 'utf8');
            expect(updatedContent).toBe('Line 1\nLine 2\nLine 3');
        });
    });
});
