export declare function bash(workingDirectory: string): {
    id: string;
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            command: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
    execute: ({ command }: {
        command: string;
    }) => Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
    }>;
    dispose: () => void;
};
//# sourceMappingURL=bash.d.ts.map