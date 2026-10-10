export interface ModelPricing {
    model: string;
    input: number;
    output: number;
    cached: number;
    is_custom?: boolean;
}

// Match the native menu estimator:
// 1. Exact match (case/punctuation normalized) takes highest precedence (supports custom per-variant pricing).
// 2. Canonical route fallback strips routing / tiering suffixes (-n, -tiered, -high, -medium, -low, -extra-low)
//    and maps Claude thinking and exp-a variants, so that variants inherit their base model's pricing.
// 3. Independent architectures (e.g. flash-lite vs flash) do not conflate.
const exactNormalize = (model: string) => {
    const name = model.toLowerCase();
    const mapped = name === 'gemini-3.8-flash-exp-a' ? 'gemini-3.8-flash' : name;
    return mapped.replace(/[^a-z0-9]/g, '');
};

const normalize = (model: string) => {
    let name = model.toLowerCase().trim().replace(/-(n|tiered|high|medium|low|extra-low|thinking)$/i, '');
    if (name === 'gemini-3.8-flash-exp-a') name = 'gemini-3.8-flash';
    const cleaned = name.replace(/[^a-z0-9]/g, '');
    return cleaned.replace(/^(claude(?:opus|sonnet|haiku)\d+)thinking$/, '$1');
};

export function findModelPricing(model: string, snapshot: { prices: ModelPricing[] } | null): ModelPricing | undefined {
    if (!snapshot || !model) return undefined;

    const exactTarget = exactNormalize(model);
    const customMatches = snapshot.prices.filter(entry => entry.is_custom && exactNormalize(entry.model) === exactTarget);
    if (customMatches.length === 1) {
        const price = customMatches[0];
        return [price.input, price.output, price.cached].every(value => Number.isFinite(value) && value >= 0) ? price : undefined;
    }
    if (customMatches.length > 1) return undefined;

    const target = normalize(model);
    const matches = snapshot.prices.filter(entry => normalize(entry.model) === target);
    if (matches.length === 1) {
        const price = matches[0];
        return [price.input, price.output, price.cached].every(value => Number.isFinite(value) && value >= 0) ? price : undefined;
    }
    if (matches.some(entry => entry.is_custom)) {
        const exactMatches = matches.filter(entry => exactNormalize(entry.model) === exactTarget);
        if (exactMatches.length === 1) {
            const price = exactMatches[0];
            return [price.input, price.output, price.cached].every(value => Number.isFinite(value) && value >= 0) ? price : undefined;
        }
    }
    return undefined;
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
