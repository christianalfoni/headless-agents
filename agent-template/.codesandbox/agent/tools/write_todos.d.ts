export declare const write_todos: () => {
    name: string;
    id: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            todos: {
                type: string;
                items: {
                    type: string;
                    properties: {
                        description: {
                            type: string;
                        };
                        reasoningEffort: {
                            type: string;
                            enum: string[];
                            description: string;
                        };
                    };
                    required: string[];
                    additionalProperties: boolean;
                };
            };
        };
        required: string[];
        additionalProperties: boolean;
    };
    execute: (input: {
        todos: {
            description: string;
            reasoningEffort: "high" | "medium" | "low";
        }[];
    }) => Promise<string>;
};
//# sourceMappingURL=write_todos.d.ts.map