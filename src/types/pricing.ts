export interface CustomPricingEntry {
    model: string;
    input: number;      // $/1M tokens
    output: number;     // $/1M tokens
    cached: number;     // $/1M tokens
    enabled: boolean;
}

export interface ApiPricingEntry {
    model: string;
    input: number;
    output: number;
    cached: number;
    is_custom?: boolean;
}

export interface ApiPricingSnapshot {
    prices: ApiPricingEntry[];
    fetched_at: number;
    stale: boolean;
    source: string;
    warning?: string;
}
