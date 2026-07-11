function toUnixSeconds(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num > 10000000000 ? Math.floor(num / 1000) : Math.floor(num);
}

function sanitizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.round(parsed));
}

function sanitizePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeCandle(candle) {
  if (!candle || typeof candle !== "object") return null;

  const time = toUnixSeconds(candle.epoch ?? candle.open_time ?? candle.time);
  const open = Number(candle.open ?? candle.o);
  const high = Number(candle.high ?? candle.h);
  const low = Number(candle.low ?? candle.l);
  const close = Number(candle.close ?? candle.c);
  const volume = Number(candle.volume ?? candle.v ?? 0);

  if (
    time === null ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null;
  }

  return { time, open, high, low, close, volume };
}

function normalizeCandles(candles) {
  return candles
    .map(normalizeCandle)
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

function normalizeIndicator(indicator, index = 0) {
  if (!indicator || typeof indicator !== "object") return null;

  const type = String(indicator.type || "").toUpperCase();
  const id = String(indicator.id || `${type.toLowerCase()}-${index}`);
  const config = indicator.config && typeof indicator.config === "object" ? indicator.config : {};

  if (!type) return null;

  switch (type) {
    case "EMA":
    case "SMA":
      return {
        id,
        type,
        panel: "overlay",
        config: {
          period: sanitizePositiveInteger(config.period ?? indicator.period, 20),
        },
      };
    case "BOLLINGER_BANDS":
      return {
        id,
        type,
        panel: "overlay",
        config: {
          period: sanitizePositiveInteger(config.period ?? indicator.period, 20),
          stdDev: sanitizePositiveNumber(config.stdDev, 2),
        },
      };
    case "RSI":
      return {
        id,
        type,
        panel: "oscillator",
        config: {
          period: sanitizePositiveInteger(config.period ?? indicator.period, 14),
        },
      };
    case "MACD": {
      const fastPeriod = sanitizePositiveInteger(config.fastPeriod, 12);
      const slowPeriod = sanitizePositiveInteger(config.slowPeriod, 26);
      return {
        id,
        type,
        panel: "oscillator",
        config: {
          fastPeriod: Math.max(1, Math.min(fastPeriod, slowPeriod - 1 || fastPeriod)),
          slowPeriod: Math.max(slowPeriod, fastPeriod + 1),
          signalPeriod: sanitizePositiveInteger(config.signalPeriod, 9),
        },
      };
    }
    default:
      return null;
  }
}

function normalizeIndicators(indicators) {
  if (!Array.isArray(indicators)) return [];
  return indicators.map((indicator, index) => normalizeIndicator(indicator, index)).filter(Boolean);
}

function calculateSMA(points, period) {
  const normalizedPeriod = sanitizePositiveInteger(period, 20);
  if (points.length < normalizedPeriod) return [];

  const series = [];
  let rollingSum = 0;

  for (let index = 0; index < points.length; index += 1) {
    rollingSum += points[index].close;

    if (index >= normalizedPeriod) {
      rollingSum -= points[index - normalizedPeriod].close;
    }

    if (index >= normalizedPeriod - 1) {
      series.push({
        time: points[index].time,
        value: Number((rollingSum / normalizedPeriod).toFixed(8)),
      });
    }
  }

  return series;
}

function calculateEMA(points, period) {
  const normalizedPeriod = sanitizePositiveInteger(period, 20);
  if (points.length < normalizedPeriod) return [];

  const multiplier = 2 / (normalizedPeriod + 1);
  const series = [];
  let runningSum = 0;
  let prevEma = null;

  for (let index = 0; index < points.length; index += 1) {
    const price = points[index].close;
    runningSum += price;

    if (index < normalizedPeriod - 1) {
      continue;
    }

    if (index === normalizedPeriod - 1) {
      prevEma = runningSum / normalizedPeriod;
    } else {
      prevEma = ((price - prevEma) * multiplier) + prevEma;
    }

    series.push({
      time: points[index].time,
      value: Number(prevEma.toFixed(8)),
    });
  }

  return series;
}

function calculateBollingerBands(points, period, stdDev = 2) {
  const normalizedPeriod = sanitizePositiveInteger(period, 20);
  const normalizedStdDev = sanitizePositiveNumber(stdDev, 2);
  if (points.length < normalizedPeriod) return { upper: [], middle: [], lower: [] };

  const upper = [];
  const middle = [];
  const lower = [];

  for (let index = normalizedPeriod - 1; index < points.length; index += 1) {
    const window = points.slice(index - normalizedPeriod + 1, index + 1);
    const closes = window.map((point) => point.close);
    const mean = closes.reduce((sum, value) => sum + value, 0) / normalizedPeriod;
    const variance =
      closes.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / normalizedPeriod;
    const deviation = Math.sqrt(variance);
    const time = points[index].time;

    middle.push({ time, value: Number(mean.toFixed(8)) });
    upper.push({ time, value: Number((mean + normalizedStdDev * deviation).toFixed(8)) });
    lower.push({ time, value: Number((mean - normalizedStdDev * deviation).toFixed(8)) });
  }

  return { upper, middle, lower };
}

function calculateRSI(points, period) {
  const normalizedPeriod = sanitizePositiveInteger(period, 14);
  if (points.length <= normalizedPeriod) return [];

  const gains = [];
  const losses = [];

  for (let index = 1; index < points.length; index += 1) {
    const change = points[index].close - points[index - 1].close;
    gains.push(Math.max(0, change));
    losses.push(Math.max(0, -change));
  }

  if (gains.length < normalizedPeriod) return [];

  let avgGain = gains.slice(0, normalizedPeriod).reduce((sum, value) => sum + value, 0) / normalizedPeriod;
  let avgLoss = losses.slice(0, normalizedPeriod).reduce((sum, value) => sum + value, 0) / normalizedPeriod;
  const series = [];

  const firstTimeIndex = normalizedPeriod;
  const firstValue = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  series.push({
    time: points[firstTimeIndex].time,
    value: Number(firstValue.toFixed(8)),
  });

  for (let index = normalizedPeriod + 1; index < points.length; index += 1) {
    const gain = gains[index - 1];
    const loss = losses[index - 1];
    avgGain = ((avgGain * (normalizedPeriod - 1)) + gain) / normalizedPeriod;
    avgLoss = ((avgLoss * (normalizedPeriod - 1)) + loss) / normalizedPeriod;
    const rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

    series.push({
      time: points[index].time,
      value: Number(rsi.toFixed(8)),
    });
  }

  return series;
}

function calculateEMAOnPriceMap(pricePoints, period) {
  return calculateEMA(pricePoints, period);
}

function calculateMACD(points, fastPeriod, slowPeriod, signalPeriod) {
  const fast = calculateEMA(points, fastPeriod);
  const slow = calculateEMA(points, slowPeriod);

  const fastMap = new Map(fast.map((point) => [point.time, point.value]));
  const slowMap = new Map(slow.map((point) => [point.time, point.value]));

  const macdLine = [];
  for (const point of points) {
    if (!fastMap.has(point.time) || !slowMap.has(point.time)) continue;
    const value = fastMap.get(point.time) - slowMap.get(point.time);
    macdLine.push({
      time: point.time,
      value: Number(value.toFixed(8)),
    });
  }

  const signalLine = calculateEMAOnPriceMap(
    macdLine.map((point) => ({ ...point, close: point.value })),
    signalPeriod
  );
  const signalMap = new Map(signalLine.map((point) => [point.time, point.value]));

  const histogram = macdLine
    .filter((point) => signalMap.has(point.time))
    .map((point) => ({
      time: point.time,
      value: Number((point.value - signalMap.get(point.time)).toFixed(8)),
    }));

  return {
    macd: macdLine,
    signal: signalLine,
    histogram,
  };
}

function createIndicatorPacket(indicator, series) {
  return {
    id: indicator.id,
    type: indicator.type,
    panel: indicator.panel,
    config: indicator.config,
    label: indicator.type,
    series,
  };
}

function buildIndicatorSeries(candles, indicators) {
  const normalizedCandles = normalizeCandles(candles);
  const normalizedIndicators = normalizeIndicators(indicators);

  return normalizedIndicators.map((indicator) => {
    switch (indicator.type) {
      case "EMA":
        return createIndicatorPacket(indicator, [
          {
            key: "ema",
            role: "line",
            label: `EMA (${indicator.config.period})`,
            data: calculateEMA(normalizedCandles, indicator.config.period),
          },
        ]);
      case "SMA":
        return createIndicatorPacket(indicator, [
          {
            key: "sma",
            role: "line",
            label: `SMA (${indicator.config.period})`,
            data: calculateSMA(normalizedCandles, indicator.config.period),
          },
        ]);
      case "BOLLINGER_BANDS": {
        const { upper, middle, lower } = calculateBollingerBands(
          normalizedCandles,
          indicator.config.period,
          indicator.config.stdDev
        );

        return createIndicatorPacket(indicator, [
          {
            key: "upper",
            role: "line",
            label: `Upper (${indicator.config.period}, ${indicator.config.stdDev})`,
            data: upper,
          },
          {
            key: "middle",
            role: "line",
            label: `Middle (${indicator.config.period})`,
            data: middle,
          },
          {
            key: "lower",
            role: "line",
            label: `Lower (${indicator.config.period}, ${indicator.config.stdDev})`,
            data: lower,
          },
        ]);
      }
      case "RSI":
        return createIndicatorPacket(indicator, [
          {
            key: "rsi",
            role: "line",
            label: `RSI (${indicator.config.period})`,
            data: calculateRSI(normalizedCandles, indicator.config.period),
          },
        ]);
      case "MACD": {
        const macd = calculateMACD(
          normalizedCandles,
          indicator.config.fastPeriod,
          indicator.config.slowPeriod,
          indicator.config.signalPeriod
        );

        return createIndicatorPacket(indicator, [
          {
            key: "macd",
            role: "line",
            label: `MACD (${indicator.config.fastPeriod}, ${indicator.config.slowPeriod})`,
            data: macd.macd,
          },
          {
            key: "signal",
            role: "line",
            label: `Signal (${indicator.config.signalPeriod})`,
            data: macd.signal,
          },
          {
            key: "histogram",
            role: "histogram",
            label: "Histogram",
            data: macd.histogram,
          },
        ]);
      }
      default:
        throw new Error(`Unsupported indicator type: ${indicator.type}`);
    }
  });
}

module.exports = {
  buildIndicatorSeries,
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  normalizeIndicators,
};
