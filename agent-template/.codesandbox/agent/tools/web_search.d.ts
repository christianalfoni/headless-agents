export declare const web_search: () => {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            topK: {
                type: string;
                description: string;
            };
            language: {
                type: string;
                description: string;
            };
            safesearch: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
    execute: (params: {
        query: string;
        topK?: number;
        language?: string;
        safesearch?: number;
    }) => Promise<any>;
};
//# sourceMappingURL=web_search.d.ts.map