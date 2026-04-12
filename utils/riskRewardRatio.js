const MIN_MULTIPLIER = 1.1;
const MAX_MULTIPLIER = 2.0;

function parseRiskRewardRatio(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(1));
  }

  if (typeof value === 'string') {
    const match = value.match(/^\s*1\s*:\s*(\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;

    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) return null;
    return Number(parsed.toFixed(1));
  }

  return null;
}

function isWithinSliderRange(multiplier) {
  if (!Number.isFinite(multiplier)) return false;
  if (multiplier < MIN_MULTIPLIER || multiplier > MAX_MULTIPLIER) return false;

  // Enforce 0.1 increments from 1.1 to 2.0.
  return Math.abs(multiplier * 10 - Math.round(multiplier * 10)) < 1e-9;
}

function validateRiskRewardRatioInput(value) {
  const parsed = parseRiskRewardRatio(value);
  if (parsed === null) {
    return { valid: false, message: 'riskRewardRatio must be in format 1:X (for example, 1:1.6).' };
  }

  if (!isWithinSliderRange(parsed)) {
    return { valid: false, message: 'riskRewardRatio must be between 1:1.1 and 1:2.0 in 0.1 increments.' };
  }

  const normalized = parsed % 1 === 0 ? `1:${parsed.toFixed(0)}` : `1:${parsed.toFixed(1)}`;
  return { valid: true, normalized, multiplier: parsed };
}

module.exports = {
  MIN_MULTIPLIER,
  MAX_MULTIPLIER,
  parseRiskRewardRatio,
  validateRiskRewardRatioInput,
};