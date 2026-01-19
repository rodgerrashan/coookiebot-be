const bullishEngulfing = require('./bullishEngulfing');
const bearishEngulfing = require('./bearishEngulfing');
const hammer = require('./hammer');
const morningEveningStar = require('./morningEveningStar');
const shootingStar = require('./shootingStar');
const threeCandleReversal = require('./threeCandleReversal');
const wickBodyPattern = require('./wickBodyPattern');
const institutionalReversalTrap = require('./institutionalReversalTrap');
const logger = require('../../utils/logger');


const path = require('path');
const patternsConfig = require('./patternsConfig.json');


function loadPatterns() {
  return patternsConfig.map(cfg => ({
    name: cfg.name,
    fn: require(path.join(__dirname, cfg.file)),
    value: cfg.value,

  }));
}

const allPatterns = loadPatterns();

function checkPatterns(candles) {
  for (const { name, fn } of allPatterns) {
    const result = fn(candles);
    if (result) {
      return { pattern: name, ...result };
    }
  }
  return null;
}


// need to switch based on pattern name with pattern return
function runPattern(patternName, candles) {
  if (!patternName || !candles) {
    return null;
  };

  switch (patternName) {
    case 'BLLENG':
      return bullishEngulfing(candles);
    case 'HMMR':
      return hammer(candles);
    case 'BRSHENG':
      return bearishEngulfing(candles);
    case 'SHTNGSTR':
      return shootingStar(candles);
    case 'MESTR':
      return morningEveningStar(candles);
    case '3VRVRSL':
      return threeCandleReversal(candles);
    case 'INSRVVL':
      return institutionalReversalTrap(candles);
    case 'WICKBODY':
      return wickBodyPattern(candles);
    default:
      return shootingStar(candles);

  }

}


function availablePatterns() {
  return allPatterns;
}

module.exports = { checkPatterns, runPattern, availablePatterns };
