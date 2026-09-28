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
  targetCurrentDensities: [5, 10, 50, 100],
  showIRCompensated: true,
};

export const DEFAULT_EXPERIMENT_CONFIG = DEFAULT_CONFIG;

export const SAMPLE_COLORS = [
  '#2563EB', // Blue
  '#DC2626', // Red
  '#059669', // Emerald
  '#7C3AED', // Purple
  '#D97706', // Amber
  '#0891B2', // Cyan
  '#DB2777', // Pink
  '#4F46E5', // Indigo
];

/**
 * Generates synthetic but realistic LSV curves using the Butler-Volmer / Tafel model
 */
function generateSyntheticLSVCurve(
  onsetV: number, // Onset potential vs RHE (V)
  tafelSlope_Vdec: number, // Tafel slope in V/dec (e.g. 0.042 V/dec = 42 mV/dec)
  j0_mA: number, // Exchange current density (mA/cm2)
  massTransferLimit_mA: number = 180,
  noiseAmp: number = 0.02,
  redoxPeak?: { peakV: number; height_mA: number; widthV: number }
): { rawE: number; rawI: number }[] {
  const points: { rawE: number; rawI: number }[] = [];
  const area = 0.071; // cm2

  // In Ag/AgCl (0.210V) at pH 14:
  // E_RHE = E_meas + 0.210 + 0.05916*14 = E_meas + 1.03824
  // So E_meas = E_RHE - 1.03824
  const offset = 0.210 + 0.05916 * 14.0;

  // Sweep from E_RHE = 1.15V to 1.78V
  for (let eRHE = 1.15; eRHE <= 1.78; eRHE += 0.005) {
    const overpotential = eRHE - 1.230; // V

    let j = 0.04;
    // OER catalytic reaction turns on around onsetV
    if (eRHE >= onsetV - 0.04) {
      // Kinetic current via Tafel relation: j_kin = j0 * 10^(overpotential / tafelSlope)
      const expTerm = overpotential / tafelSlope_Vdec;
      const j_kin = j0_mA * Math.pow(10, Math.min(6, expTerm));
      // Combined kinetic + mass transfer limit: 1/j = 1/j_kin + 1/j_L
      j = (j_kin * massTransferLimit_mA) / (j_kin + massTransferLimit_mA);
    } else {
      // Capacitive background near onset
      j = 0.05 + 0.02 * Math.sin(eRHE * 20);
    }

    // Add pre-catalytic redox oxidation peak (e.g. Ni2+/Ni3+ redox couple in NiFe catalysts)
    if (redoxPeak) {
      const peakVal = redoxPeak.height_mA * Math.exp(-Math.pow((eRHE - redoxPeak.peakV) / redoxPeak.widthV, 2));
      j += peakVal;
    }

    // Add subtle experimental noise
    const noise = (Math.random() - 0.5) * noiseAmp * (1 + j * 0.01);
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
  // Sample A (NiFe-LDH) has a classic pre-catalytic Ni oxidation peak at 1.365V (peaking ~11.8 mA/cm2) with catalytic onset at 1.45V
  const rawSampleA = generateSyntheticLSVCurve(1.48, 0.0423, 1e-4, 210, 0.015);
  const rawSampleB = generateSyntheticLSVCurve(1.50, 0.0551, 8e-5, 190, 0.02);
  const rawSampleC = generateSyntheticLSVCurve(1.46, 0.0385, 1.5e-4, 230, 0.018);
  const rawSampleD_NiFe = generateSyntheticLSVCurve(
    1.45,
    0.0390,
    2.4e-4,
    260,
    0.012,
    { peakV: 1.365, height_mA: 11.6, widthV: 0.026 }
  );

  const makeSample = (
    id: string,
    name: string,
    catalystName: string,
    color: string,
    rawPoints: { rawE: number; rawI: number }[],
    ru: number,
    loadingMg: number = 0.25,
    ecsa: number = 1.45
  ): Sample => {
    const data = calculateDataPoints(rawPoints, config, ru, config.defaultCompensation);
    const tafelRoi = autoDetectTafelRoi(data);
    const metrics = calculateMetrics(data, tafelRoi, config, loadingMg, ecsa);

    return {
      id,
      name,
      catalystName,
      color,
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
    makeSample('sample-1', 'Sample_A', 'NiFe-LDH Nanosheets', '#2563EB', rawSampleD_NiFe, 2.35, 0.25, 2.40),
    makeSample('sample-2', 'Sample_B', 'Co3O4 Nanowires', '#DC2626', rawSampleC, 2.60, 0.28, 1.65),
    makeSample('sample-3', 'Sample_C', 'Fe-N-C SAC', '#059669', rawSampleB, 2.45, 0.35, 2.10),
    makeSample('sample-4', 'Sample_D', 'RuO2 Benchmark', '#7C3AED', rawSampleA, 2.50, 0.20, 1.80),
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

