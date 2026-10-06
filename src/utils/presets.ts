import { ExperimentConfig, Sample } from '../types';
import { autoDetectTafelRoi, calculateDataPoints, calculateMetrics } from './electrochem';

export const DEFAULT_CONFIG: ExperimentConfig = {
  reactionType: 'OER',
  customErev: 1.230,
  referenceElectrode: 'Ag/AgCl',
  customEref: 0.210,
  pH: 14.0,
  defaultRu: 2.5,
  defaultCompensation: 85,
  geometricArea: 0.071, // 3mm glassy carbon disk (0.0707 cm2)
  targetCurrentDensities: [10, 43.2, 50, 100],
  showIRCompensated: true,
};

export const DEFAULT_EXPERIMENT_CONFIG = DEFAULT_CONFIG;

export const SAMPLE_COLORS = [
  '#16A34A', // Green (Sample_12)
  '#2563EB', // Blue (Sample_13)
  '#DC2626', // Red (Sample_14)
  '#7C3AED', // Purple
  '#D97706', // Amber
  '#0891B2', // Cyan
  '#DB2777', // Pink
  '#4F46E5', // Indigo
];

/**
 * Generates synthetic but realistic LSV curves calibrated so that at targetE_at43_2,
 * current density j reaches exactly 43.2 mA/cm², matching experimental benchmarks.
 */
function generateSyntheticLSVCurve(
  targetE_at43_2: number, // Potential vs RHE where j reaches 43.2 mA/cm2
  tafelSlope_Vdec: number, // Tafel slope in V/dec (e.g. 0.040 V/dec)
  options?: {
    redoxPeak?: { peakV: number; height_mA: number; widthV: number };
    maxJ?: number;
    noiseAmp?: number;
  }
): { rawE: number; rawI: number }[] {
  const points: { rawE: number; rawI: number }[] = [];
  const area = 0.071; // cm2
  // In Ag/AgCl (0.210V) at pH 14:
  // E_RHE = E_meas + 0.210 + 0.05916*14 = E_meas + 1.03824
  // So E_meas = E_RHE - 1.03824
  const offset = 0.210 + 0.05916 * 14.0;
  const maxJ = options?.maxJ ?? 220;
  const noiseAmp = options?.noiseAmp ?? 0.008;

  // Sweep from E_RHE = 1.15V to 1.75V
  for (let eRHE = 1.15; eRHE <= 1.75; eRHE += 0.005) {
    const deltaV = eRHE - targetE_at43_2;
    // Kinetic Tafel growth centered exactly at targetE_at43_2 with j = 43.2
    const j_kin = 43.2 * Math.pow(10, Math.min(4.5, deltaV / tafelSlope_Vdec));

    // Mass-transfer combined limit
    let j_cat = (j_kin * maxJ) / (j_kin + maxJ);
    // Exact scaling normalization so at eRHE = targetE_at43_2, j_cat = 43.2 mA/cm2
    const targetScale = 43.2 / ((43.2 * maxJ) / (43.2 + maxJ));
    j_cat = j_cat * targetScale;

    // Small baseline capacitive current at low potentials
    const baseline = 0.06 + 0.02 * Math.sin(eRHE * 12);
    let j = Math.max(baseline, j_cat);

    // Pre-catalytic redox oxidation peak (e.g. Ni2+/Ni3+ redox wave in NiFe catalyst Sample_12)
    if (options?.redoxPeak) {
      const peakTerm = options.redoxPeak.height_mA * Math.exp(
        -Math.pow((eRHE - options.redoxPeak.peakV) / options.redoxPeak.widthV, 2)
      );
      j += peakTerm;
    }

    // Subtle experimental noise
    const noise = (Math.random() - 0.5) * noiseAmp;
    const finalJ = Math.max(0.01, j + noise);
    const rawI = finalJ * area; // mA
    const rawE = eRHE - offset;

    points.push({
      rawE: Math.round(rawE * 10000) / 10000,
      rawI: Math.round(rawI * 10000) / 10000,
    });
  }

  return points;
}

export function getPresetSamples(config: ExperimentConfig = DEFAULT_CONFIG): Sample[] {
  // Sample_12 (Green, dash-dot line): NiFe-LDH with pre-oxidation peak (~11.6 mA/cm2 at 1.365V) and reaching 43.2 mA/cm2 at 1.470V
  const rawSample12 = generateSyntheticLSVCurve(
    1.470,
    0.0410,
    {
      redoxPeak: { peakV: 1.365, height_mA: 11.5, widthV: 0.026 },
      maxJ: 240,
    }
  );

  // Sample_13 (Blue, solid line): Co3O4 catalyst reaching 43.2 mA/cm2 at 1.510V
  const rawSample13 = generateSyntheticLSVCurve(
    1.510,
    0.0520,
    { maxJ: 210 }
  );

  // Sample_14 (Red, dashed line): Fe-N-C catalyst reaching 43.2 mA/cm2 at 1.550V
  const rawSample14 = generateSyntheticLSVCurve(
    1.550,
    0.0580,
    { maxJ: 190 }
  );

  const makeSample = (
    id: string,
    name: string,
    catalystName: string,
    color: string,
    lineStyle: 'solid' | 'dashed' | 'dashdot',
    rawPoints: { rawE: number; rawI: number }[],
    ru: number,
    loadingMg: number = 0.25,
    ecsa: number = 1.45
  ): Sample => {
    const data = calculateDataPoints(rawPoints, config, ru, config.defaultCompensation);
    const tafelRoi = autoDetectTafelRoi(data);
    const metrics = calculateMetrics(data, tafelRoi, config, loadingMg, ecsa);

    // Attach sample information to points
    if (metrics.customTargetPoints) {
      for (const j in metrics.customTargetPoints) {
        metrics.customTargetPoints[j] = metrics.customTargetPoints[j].map(pt => ({
          ...pt,
          sampleId: id,
          sampleName: name,
        }));
      }
    }

    return {
      id,
      name,
      catalystName,
      color,
      lineStyle,
      visible: true,
      fileName: `${name}.csv`,
      fileType: 'preset',
      data,
      ruResistance: ru,
      irCompensationPercent: config.defaultCompensation,
      loadingMgCm2: loadingMg,
      ecsaCm2: ecsa,
      tafelRoi,
      metrics,
    };
  };

  return [
    makeSample('sample-12', 'Sample_12', 'NiFe Catalyst (Green)', '#16A34A', 'dashdot', rawSample12, 2.35, 0.25, 2.40),
    makeSample('sample-13', 'Sample_13', 'Co-based Catalyst (Blue)', '#2563EB', 'solid', rawSample13, 2.60, 0.28, 1.65),
    makeSample('sample-14', 'Sample_14', 'Fe-based Benchmark (Red)', '#DC2626', 'dashed', rawSample14, 2.45, 0.35, 2.10),
  ];
}

export const SAMPLE_PRESETS = getPresetSamples(DEFAULT_CONFIG);

export function getPresetsForReaction(reactionType: 'OER' | 'ORR'): Sample[] {
  const customConfig: ExperimentConfig = {
    ...DEFAULT_CONFIG,
    reactionType,
    pH: 14.0,
  };
  return getPresetSamples(customConfig);
}
