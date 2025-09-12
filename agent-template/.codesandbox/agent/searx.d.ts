export type SearxInstance = {
    base: string;
    healthy?: boolean;
    lastChecked?: number;
};
export declare function pickSearxBase(opt?: {
    timeoutMs?: number;
}): Promise<string>;
export declare function searxSearch(params: {
    query: string;
    topK?: number;
    language?: string;
    safesearch?: 0 | 1 | 2;
    timeoutMs?: number;
}): Promise<any>;
//# sourceMappingURL=searx.d.ts.map