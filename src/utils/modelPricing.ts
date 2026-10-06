export interface ModelPricing {
    model: string;
    input: number;
    output: number;
    cached: number;
    is_custom?: boolean;
}

// Match the native menu estimator:
// 1. Exact match (case/punctuation normalized) takes highest precedence (supports custom per-variant pricing).
// 2. Canonical route fallback strips routing / tiering suffixes (-n, -tiered, -high, -medium, -low, -extra-low, -thinking)
//    so that variants like gemini-3.8-flash-tiered and gemini-3.8-flash-n inherit their base model's pricing.
// 3. Independent architectures (e.g. flash-lite vs flash) do not conflate.
const ROUTE_SUFFIX_REGEX = /-(n|tiered|high|medium|low|extra-low|thinking)$/i;

const exactNormalize = (model: string) => model.toLowerCase().replace(/[^a-z0-9]/g, '');
const canonicalNormalize = (model: string) => model.toLowerCase().replace(ROUTE_SUFFIX_REGEX, '').replace(/[^a-z0-9]/g, '');

export function findModelPricing(model: string, snapshot: { prices: ModelPricing[] } | null): ModelPricing | undefined {
    if (!snapshot || !model) return undefined;

    // 1. Exact match first
    const exactTarget = exactNormalize(model);
    const exactMatches = snapshot.prices.filter(entry => exactNormalize(entry.model) === exactTarget);
    if (exactMatches.length === 1) {
        const price = exactMatches[0];
        return [price.input, price.output, price.cached].every(value => Number.isFinite(value) && value >= 0) ? price : undefined;
    }
    if (exactMatches.length > 1) return undefined;

    // 2. Canonical routing suffix fallback (-tiered, -n, -high, etc.)
    const canonTarget = canonicalNormalize(model);
    const canonMatches = snapshot.prices.filter(entry => canonicalNormalize(entry.model) === canonTarget);
    if (canonMatches.length !== 1) return undefined;
    const price = canonMatches[0];
    return [price.input, price.output, price.cached].every(value => Number.isFinite(value) && value >= 0) ? price : undefined;
}

export function estimateApiCost(models: Array<{ model: string; input_tokens: number; output_tokens: number; cached_tokens: number }>, snapshot: { prices: ModelPricing[] } | null) {
    return models.reduce((result, model) => {
        if (model.input_tokens === 0 && model.output_tokens === 0 && model.cached_tokens === 0) return result;
        const price = findModelPricing(model.model, snapshot);
        if (!price) result.unpricedModels += 1;
        else {
            result.pricedModels += 1;
            result.usd += (model.input_tokens * price.input + model.output_tokens * price.output + model.cached_tokens * price.cached) / 1_000_000;
        }
        return result;
    }, { usd: 0, pricedModels: 0, unpricedModels: 0 });
}
