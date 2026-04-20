function parseRewardMultiplier(riskRewardRatio) {
    if (typeof riskRewardRatio === 'number' && Number.isFinite(riskRewardRatio) && riskRewardRatio > 0) {
        return riskRewardRatio;
    }

    if (typeof riskRewardRatio === 'string') {
        const match = riskRewardRatio.match(/^\s*1\s*:\s*(\d+(?:\.\d+)?)\s*$/);
        if (match) {
            const parsed = Number(match[1]);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
    }

    return null;
}

function formatRiskReward(multiplier) {
    const numeric = Number(multiplier);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;

    const rounded = Number(numeric.toFixed(1));
    return Number.isInteger(rounded) ? `1:${rounded}` : `1:${rounded.toFixed(1)}`;
}

function resolveRewardMultiplier(riskRewardRatio, defaultMultiplier) {
    const parsed = parseRewardMultiplier(riskRewardRatio);
    return parsed || defaultMultiplier;
}

module.exports = {
    parseRewardMultiplier,
    formatRiskReward,
    resolveRewardMultiplier,
};