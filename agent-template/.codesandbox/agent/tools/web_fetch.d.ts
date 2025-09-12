export declare const web_fetch: () => {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            url: {
                type: string;
                description: string;
            };
            maxBytes: {
                type: string;
                description: string;
            };
            timeoutMs: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
    execute: (params: {
        url: string;
        maxBytes?: number;
        timeoutMs?: number;
    }) => Promise<{
        url: string;
        status: number;
        mime: string;
        title: string;
        text: string;
        bytes: number;
        wasTruncated: boolean;
    }>;
};
//# sourceMappingURL=web_fetch.d.ts.map