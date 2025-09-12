const DESCRIPTION = "List the todos that need to be completed for the current request. Prefer creating broader, consolidated todos rather than breaking tasks into narrow steps. For each todo, evaluate the reasoning effort needed: 'high' for complex problem-solving/analysis, 'medium' for moderate implementation tasks, 'low' for simple/straightforward tasks.";
export const write_todos = () => ({
    name: "write_todos",
    id: "write_todos_1",
    description: DESCRIPTION,
    input_schema: {
        type: "object",
        properties: {
            todos: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        description: { type: "string" },
                        reasoningEffort: {
                            type: "string",
                            enum: ["high", "medium", "low"],
                            description: "Required reasoning effort: 'high' for complex problem-solving/analysis, 'medium' for moderate implementation tasks, 'low' for simple/straightforward tasks",
                        },
                    },
                    required: ["description", "reasoningEffort"],
                    additionalProperties: false,
                },
            },
        },
        required: ["todos"],
        additionalProperties: false,
    },
    execute: async (input) => {
        return "success";
    },
});
