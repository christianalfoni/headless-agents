export declare function str_replace_based_edit_tool(workingDirectory: string): {
    id: string;
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            command: {
                type: string;
                enum: string[];
                description: string;
            };
            path: {
                type: string;
                description: string;
            };
            file_text: {
                type: string;
                description: string;
            };
            insert_line: {
                type: string;
                description: string;
            };
            new_str: {
                type: string;
                description: string;
            };
            old_str: {
                type: string;
                description: string;
            };
            view_range: {
                type: string;
                items: {
                    type: string;
                };
                minItems: number;
                maxItems: number;
                description: string;
            };
        };
        required: string[];
    };
    execute: ({ command, path: filePath, file_text, insert_line, new_str, old_str, view_range, }: {
        command: "view" | "create" | "str_replace" | "insert";
        path: string;
        file_text?: string;
        insert_line?: number;
        new_str?: string;
        old_str?: string;
        view_range?: [number, number];
    }) => Promise<string>;
};
//# sourceMappingURL=str_replace_based_edit_tool.d.ts.map