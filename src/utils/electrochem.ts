import { DataPoint, ExperimentConfig, ReactionType, ReferenceElectrodeType, Sample, SampleMetrics } from '../types';

export const REFERENCE_ELECTRODES: Record<ReferenceElectrodeType, { name: string; standardPotential: number; description: string }> = {
  'Ag/AgCl': { name: 'Ag/AgCl (3M KCl)', standardPotential: 0.210, description: '+0.210 V vs. SHE (3M KCl) / +0.197 V (Sat. KCl)' },
  'SCE': { name: 'SCE (Saturated Calomel)', standardPotential: 0.241, description: '+0.241 V vs. SHE' },
  'Hg/HgO': { name: 'Hg/HgO (1M KOH)', standardPotential: 0.098, description: '+0.098 V vs. SHE in 1M KOH' },
  'Hg/Hg2SO4': { name: 'Hg/Hg2SO4 (Sat. K2SO4)', standardPotential: 0.640, description: '+0.640 V vs. SHE' },
  'RHE': { name: 'RHE (Reversible Hydrogen Electrode)', standardPotential: 0.000, description: '+0.000 V vs. RHE directly' },
  'CUSTOM': { name: 'Custom Reference Electrode', standardPotential: 0.210, description: 'User-specified potential' },
};

export const REACTION_PRESETS: Record<ReactionType, { name: string; eRev: number; defaultTargets: number[]; description: string }> = {
  'OER': { name: 'OER (Oxygen Evolution, 1.23 V)', eRev: 1.230, defaultTargets: [10, 50, 100], description: '2H2O -> O2 + 4H+ + 4e- (E° = 1.23 V vs. RHE)' },
  'HER': { name: 'HER (Hydrogen Evolution, 0.00 V)', eRev: 0.000, defaultTargets: [10, 50, 100], description: '2H+ + 2e- -> H2 (E° = 0.00 V vs. RHE)' },
  'ORR': { name: 'ORR (Oxygen Reduction, 1.23 V)', eRev: 1.230, defaultTargets: [2, 3, 5], description: 'O2 + 4H+ + 4e- -> 2H2O (E° = 1.23 V vs. RHE)' },
  'CUSTOM': { name: 'Custom Reaction', eRev: 1.230, defaultTargets: [10, 50, 100], description: 'User-specified thermodynamic potential' },
};

export function getRefPotential(type: ReferenceElectrodeType, customVal: number = 0.210): number {
  if (type === 'CUSTOM') return customVal;
  return REFERENCE_ELECTRODES[type]?.standardPotential ?? 0.210;
}

export function getRevPotential(type: ReactionType, customVal: number = 1.230): number {
  if (type === 'CUSTOM') return customVal;
  return REACTION_PRESETS[type]?.eRev ?? 1.230;
}

/**
 * Calculates converted electrochemical data points for a sample
 */
export function calculateDataPoints(
  rawPoints: { rawE: number; rawI: number }[],
  config: ExperimentConfig,
  ruResistance: number,
  irCompensationPercent: number
): DataPoint[] {
  const eRef = getRefPotential(config.referenceElectrode, config.customEref);
  const eRev = getRevPotential(config.reactionType, config.customErev);
  const nernstOffset = 0.05916 * config.pH;
  const area = Math.max(0.0001, config.geometricArea);
  const compFraction = Math.max(0, Math.min(1, irCompensationPercent / 100));

  return rawPoints.map(pt => {
    // Current in mA
    const i_mA = pt.rawI;
    const currentDensity = i_mA / area; // mA/cm2

    // iR drop: (i in A) * Ru = (i_mA * 1e-3) * Ru
    const iR_drop_total = (i_mA * 1e-3) * ruResistance; // Volts
    const iR_drop_comp = iR_drop_total * compFraction;

    // E_RHE = E_meas + E_ref + 0.05916*pH - iR_comp
    let potentialRHE = pt.rawE + eRef + nernstOffset - iR_drop_comp;
    let potentialRHE_noIR = pt.rawE + eRef + nernstOffset;

    if (config.referenceElectrode === 'RHE') {
      // If reference is already RHE, skip E_ref + nernstOffset
      potentialRHE = pt.rawE - iR_drop_comp;
      potentialRHE_noIR = pt.rawE;
    }

    // Overpotential eta in mV
    let overpotential = 0;
    if (config.reactionType === 'HER') {
      // For HER: eta = (E_rev - E_RHE) * 1000 or (0 - E_RHE) * 1000
      overpotential = (eRev - potentialRHE) * 1000;
    } else {
      // For OER & others: eta = (E_RHE - E_rev) * 1000
      overpotential = (potentialRHE - eRev) * 1000;
    }

    // Log10(|j|)
    const absJ = Math.abs(currentDensity);
    const logJ = absJ > 1e-7 ? Math.log10(absJ) : -7;

    return {
      rawE: pt.rawE,
      rawI: pt.rawI,
      potentialRHE,
      potentialRHE_noIR,
      currentDensity,
      overpotential,
      logJ,
    };
  });
}

/**
 * Calculates overpotential at a target current density (e.g. 10, 50, 100 mA/cm2) via linear interpolation.
 * Ignores pre-catalytic oxidation peaks (촉매 사전 산화 피크/볼록한 부분) and transient spikes by identifying
 * the sustained catalytic reaction branch.
 */
export function calculateInterpolatedEta(
  data: DataPoint[],
  targetJ: number,
  reactionType: ReactionType
): number | null {
  if (!data || data.length < 2) return null;

  const absTarget = Math.abs(targetJ);

  // 1. Sort points by overpotential ascending
  const sortedData = [...data].sort((a, b) => a.overpotential - b.overpotential);

  // 2. Identify all upward crossing candidates where current rises through absTarget
  interface CrossingCandidate {
    index: number;
    eta: number;
    subsequentMinJ: number;
    isSustained: boolean;
  }

  const upwardCrossings: CrossingCandidate[] = [];

  for (let i = 0; i < sortedData.length - 1; i++) {
    const p1 = sortedData[i];
    const p2 = sortedData[i + 1];
    const j1 = Math.abs(p1.currentDensity);
    const j2 = Math.abs(p2.currentDensity);

    // Upward crossing: current increases across targetJ
    if (j1 <= absTarget && j2 >= absTarget && j2 > j1) {
      let interpolatedEta = p1.overpotential;
      if (Math.abs(j2 - j1) > 1e-9) {
        const t = (absTarget - j1) / (j2 - j1);
        interpolatedEta = p1.overpotential + t * (p2.overpotential - p1.overpotential);
      }

      // Check subsequent points to see if current dips back down (oxidation peak hump) or stays sustained
      let subsequentMin = j2;
      let dipsBackDown = false;

      // Look ahead up to 30 points or until the end of scan
      const lookAheadEnd = Math.min(sortedData.length, i + 35);
      for (let k = i + 1; k < lookAheadEnd; k++) {
        const nextJ = Math.abs(sortedData[k].currentDensity);
        if (nextJ < subsequentMin) {
          subsequentMin = nextJ;
        }
        // If current drops below 80% of targetJ or drops by more than 2 mA/cm2, it's a pre-catalytic redox peak/spike
        if (nextJ < absTarget * 0.82 || (nextJ < absTarget - 2.0 && absTarget >= 5)) {
          dipsBackDown = true;
        }
      }

      upwardCrossings.push({
        index: i,
        eta: interpolatedEta,
        subsequentMinJ: subsequentMin,
        isSustained: !dipsBackDown,
      });
    }
  }

  // 3. Choose the true catalytic crossing:
  // Prefer the sustained upward crossing (the actual catalytic onset/branch)
  if (upwardCrossings.length > 0) {
    // Find the last crossing that is sustained, or simply the last upward crossing (since catalytic OER is at the high-potential end)
    const sustained = upwardCrossings.filter(c => c.isSustained);
    if (sustained.length > 0) {
      const best = sustained[sustained.length - 1];
      return Math.round(best.eta * 10) / 10;
    }
    // If none were strictly sustained, pick the latest crossing (which represents the real catalytic reaction curve rather than early peaks)
    const lastCrossing = upwardCrossings[upwardCrossings.length - 1];
    return Math.round(lastCrossing.eta * 10) / 10;
  }

  // 4. Fallback: Any crossing (downward/upward)
  for (let i = sortedData.length - 2; i >= 0; i--) {
    const p1 = sortedData[i];
    const p2 = sortedData[i + 1];
    const j1 = Math.abs(p1.currentDensity);
    const j2 = Math.abs(p2.currentDensity);

    if ((j1 <= absTarget && j2 >= absTarget) || (j1 >= absTarget && j2 <= absTarget)) {
      if (Math.abs(j2 - j1) < 1e-9) {
        return Math.round(p1.overpotential * 10) / 10;
      }
      const t = (absTarget - j1) / (j2 - j1);
      const interpolatedEta = p1.overpotential + t * (p2.overpotential - p1.overpotential);
      return Math.round(interpolatedEta * 10) / 10;
    }
  }

  // 5. If target current density was not reached
  const maxJ = Math.max(...sortedData.map(p => Math.abs(p.currentDensity)));
  if (maxJ < absTarget * 0.8) {
    return null;
  }

  // Closest point near the top of the curve
  let closest = sortedData[sortedData.length - 1];
  let minDiff = Infinity;
  for (let i = sortedData.length - 1; i >= Math.max(0, sortedData.length - 20); i--) {
    const p = sortedData[i];
    const diff = Math.abs(Math.abs(p.currentDensity) - absTarget);
    if (diff < minDiff) {
      minDiff = diff;
      closest = p;
    }
  }
  return Math.round(closest.overpotential * 10) / 10;
}

/**
 * Performs linear regression on the Tafel plot: y = overpotential (mV), x = log10(j)
 * Returns Tafel slope b (mV/dec), R^2, intercept, and j0
 */
export function calculateTafelFit(
  data: DataPoint[],
  minLogJ: number,
  maxLogJ: number
): { tafelSlope: number; rSquared: number; intercept: number; j0: number } {
  const filtered = data.filter(
    pt => pt.logJ >= minLogJ && pt.logJ <= maxLogJ && Math.abs(pt.currentDensity) > 0.01 && !isNaN(pt.overpotential)
  );

  if (filtered.length < 3) {
    return { tafelSlope: 0, rSquared: 0, intercept: 0, j0: 0 };
  }

  const n = filtered.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const pt of filtered) {
    const x = pt.logJ;
    const y = pt.overpotential;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) {
    return { tafelSlope: 0, rSquared: 0, intercept: 0, j0: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R^2
  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const pt of filtered) {
    const y = pt.overpotential;
    const yPred = slope * pt.logJ + intercept;
    ssTot += (y - yMean) * (y - yMean);
    ssRes += (y - yPred) * (y - yPred);
  }

  const rSquared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;

  // Exchange current density j0 (when eta = 0 mV): 0 = slope * log10(j0) + intercept => log10(j0) = -intercept / slope
  let j0 = 0;
  if (Math.abs(slope) > 1e-4) {
    const logJ0 = -intercept / slope;
    j0 = Math.pow(10, logJ0);
  }

  return {
    tafelSlope: Math.round(Math.abs(slope) * 10) / 10,
    rSquared: Math.round(rSquared * 1000) / 1000,
    intercept: Math.round(intercept * 10) / 10,
    j0: Math.max(1e-12, j0),
  };
}

/**
 * AI/Smart Auto-detects optimal Tafel ROI with highest R^2 in kinetic control region
 */
export function autoDetectTafelRoi(data: DataPoint[]): { minLogJ: number; maxLogJ: number } {
  // Kinetic control region is typically where j is between 0.5 mA/cm2 and 20 mA/cm2 (logJ between -0.3 and 1.3)
  const validPoints = data.filter(pt => pt.logJ >= -0.5 && pt.logJ <= 2.2 && pt.overpotential > 0);
  if (validPoints.length < 10) {
    return { minLogJ: 0.5, maxLogJ: 1.5 };
  }

  let bestR2 = -1;
  let bestMin = 0.5;
  let bestMax = 1.5;

  // Scan windows of size 0.6 to 1.2 log units
  const step = 0.05;
  const windowSizes = [0.6, 0.8, 1.0];

  for (const wSize of windowSizes) {
    for (let min = 0.0; min <= 1.4; min += step) {
      const max = min + wSize;
      const fit = calculateTafelFit(data, min, max);
      // We want high R^2 and a reasonable slope (20 to 250 mV/dec)
      if (fit.rSquared > bestR2 && fit.tafelSlope >= 25 && fit.tafelSlope <= 250) {
        bestR2 = fit.rSquared;
        bestMin = min;
        bestMax = max;
      }
    }
  }

  return {
    minLogJ: Math.round(bestMin * 100) / 100,
    maxLogJ: Math.round(bestMax * 100) / 100,
  };
}

/**
 * Calculates all metrics for a sample
 */
export function calculateMetrics(
  data: DataPoint[],
  roi: { minLogJ: number; maxLogJ: number },
  config: ExperimentConfig,
  loadingMgCm2?: number,
  ecsaCm2?: number
): SampleMetrics {
  const eta10 = calculateInterpolatedEta(data, 10, config.reactionType);
  const eta50 = calculateInterpolatedEta(data, 50, config.reactionType);
  const eta100 = calculateInterpolatedEta(data, 100, config.reactionType);

  const customTargetEtas: { [targetJ: number]: number | null } = {};
  for (const target of config.targetCurrentDensities) {
    customTargetEtas[target] = calculateInterpolatedEta(data, target, config.reactionType);
  }

  const tafelFit = calculateTafelFit(data, roi.minLogJ, roi.maxLogJ);

  // Mass activity at eta10: A / g_catalyst
  // mass loading (mg/cm2) -> g/cm2 = loading * 1e-3
  // at eta10, j = 10 mA/cm2 = 0.010 A/cm2
  let massActivity10: number | null = null;
  if (loadingMgCm2 && loadingMgCm2 > 0) {
    const massLoadingGCm2 = loadingMgCm2 * 1e-3;
    massActivity10 = Math.round((0.010 / massLoadingGCm2) * 10) / 10; // A / g_cat
  }

  // Specific activity at eta10: mA / cm2_ECSA
  let specificActivity10: number | null = null;
  if (ecsaCm2 && ecsaCm2 > 0) {
    // ECSA roughness factor rf = ecsaCm2 / geometricArea
    const rf = ecsaCm2 / Math.max(0.001, config.geometricArea);
    specificActivity10 = Math.round((10 / rf) * 100) / 100; // mA / cm2_ECSA
  }

  return {
    eta10,
    eta50,
    eta100,
    customTargetEtas,
    tafelSlope: tafelFit.tafelSlope,
    rSquared: tafelFit.rSquared,
    intercept: tafelFit.intercept,
    j0: tafelFit.j0,
    massActivity10,
    specificActivity10,
  };
}

/**
 * Full recalculation of a sample given current configuration and user adjustments
 */
export function recalculateSample(
  sample: Sample,
  config: ExperimentConfig,
  rawPoints?: { rawE: number; rawI: number }[]
): Sample {
  const pointsToUse = rawPoints || sample.data.map(d => ({ rawE: d.rawE, rawI: d.rawI }));
  const data = calculateDataPoints(pointsToUse, config, sample.ruResistance, sample.irCompensationPercent);
  const metrics = calculateMetrics(data, sample.tafelRoi, config, sample.loadingMgCm2, sample.ecsaCm2);

  return {
    ...sample,
    data,
    metrics,
  };
}

export const recalculateSampleMetrics = recalculateSample;

