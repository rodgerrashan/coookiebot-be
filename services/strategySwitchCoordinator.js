function resolveActiveStrategy(bot, runtimeState = {}, regime = 'UNKNOWN') {
  const marketDetection = bot?.smartFeatures?.marketDetection || {};
  const autoSwitchEnabled = marketDetection.enabled && marketDetection.autoSwitch;

  if (!autoSwitchEnabled) {
    return {
      strategy: bot.strategy,
      switched: false,
      switchReason: '',
      updatedState: runtimeState,
    };
  }

  const trendStrategy = marketDetection.trendStrategy || 'TREND_FOLLOWING';
  const sidewaysStrategy = marketDetection.sidewaysStrategy || 'GRID_RANGE';
  const desiredStrategy = regime === 'TRENDING' ? trendStrategy : sidewaysStrategy;
  const currentStrategy = runtimeState.currentStrategy || bot.strategy;

  const cooldownCandles = Math.max(1, Number(marketDetection.switchCooldownCandles) || 5);
  const candlesSinceSwitch = Number(runtimeState.candlesSinceSwitch || cooldownCandles);

  if (desiredStrategy !== currentStrategy && candlesSinceSwitch < cooldownCandles) {
    return {
      strategy: currentStrategy,
      switched: false,
      switchReason: `Cooldown active (${candlesSinceSwitch}/${cooldownCandles}).`,
      updatedState: {
        ...runtimeState,
        candlesSinceSwitch: candlesSinceSwitch + 1,
      },
    };
  }

  if (desiredStrategy !== currentStrategy) {
    return {
      strategy: desiredStrategy,
      switched: true,
      switchReason: `Regime ${regime} switched strategy to ${desiredStrategy}.`,
      updatedState: {
        ...runtimeState,
        currentStrategy: desiredStrategy,
        lastSwitchAt: new Date(),
        candlesSinceSwitch: 0,
      },
    };
  }

  return {
    strategy: currentStrategy,
    switched: false,
    switchReason: '',
    updatedState: {
      ...runtimeState,
      candlesSinceSwitch: candlesSinceSwitch + 1,
    },
  };
}

module.exports = { resolveActiveStrategy };
