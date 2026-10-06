export type ReactionType = 'OER' | 'HER' | 'ORR' | 'CUSTOM';

export type ReferenceElectrodeType = 'Ag/AgCl' | 'SCE' | 'Hg/HgO' | 'Hg/Hg2SO4' | 'RHE' | 'CUSTOM';

export interface DataPoint {
  rawE: number;          // measured potential (V)
  rawI: number;          // measured current (mA)
  potentialRHE: number;  // potential vs RHE with iR compensation (V)
  potentialRHE_noIR: number; // potential vs RHE without iR compensation (V)
  currentDensity: number; // current density j (mA/cm2)
  overpotential: number;  // overpotential eta (mV)
  logJ: number;          // log10(|j|)
}

export interface OverpotentialPoint {
  eta: number;            // overpotential (mV)
  potentialRHE: number;   // potential vs RHE (V)
  potentialRaw: number;   // measured potential (V)
  currentDensity: number; // target current density (mA/cm2)
  label: string;          // e.g. "Point A (산화 피크: 162.3 mV)"
  tag: string;            // "A", "B", "C" or "1", "2"
  pointType: 'redox_rise' | 'redox_fall' | 'catalytic' | 'general';
  index: number;          // sequence index
  sampleId?: string;
  sampleName?: string;
}

export interface SampleMetrics {
  eta10: number | null;     // primary overpotential at 10 mA/cm2 (mV)
  eta50: number | null;     // primary overpotential at 50 mA/cm2 (mV)
  eta100: number | null;    // primary overpotential at 100 mA/cm2 (mV)
  allEta10?: number[];      // all calculated overpotential points at 10 mA/cm2 (mV)
  allEta50?: number[];      // all calculated overpotential points at 50 mA/cm2 (mV)
  allEta100?: number[];     // all calculated overpotential points at 100 mA/cm2 (mV)
  customTargetEtas: { [targetJ: number]: number | null };
  customTargetAllEtas?: { [targetJ: number]: number[] };
  customTargetPoints?: { [targetJ: number]: OverpotentialPoint[] };
  tafelSlope: number;       // Tafel slope b (mV/dec)
  rSquared: number;         // R^2 coefficient of determination
  intercept: number;        // Tafel intercept
  j0: number;               // Exchange current density (mA/cm2)
  massActivity10?: number | null;     // A / g_catalyst
  specificActivity10?: number | null; // mA / cm2_ECSA
}

export interface Sample {
  id: string;
  name: string;
  catalystName: string;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dashdot';
  visible: boolean;
  fileName: string;
  fileType: 'csv' | 'xlsx' | 'mpr' | 'txt' | 'preset';
  data: DataPoint[];
  ruResistance: number;          // Ru solution resistance (Ohms)
  irCompensationPercent: number;  // Compensation % (e.g. 85 or 100)
  isAlreadyDensity?: boolean;    // True if raw data was already current density (mA/cm2)
  loadingMgCm2?: number;         // catalyst mass loading (mg/cm2)
  ecsaCm2?: number;              // ECSA (cm2)
  tafelRoi: {
    minLogJ: number;
    maxLogJ: number;
  };
  metrics: SampleMetrics;
}

export interface ExperimentConfig {
  reactionType: ReactionType;
  customErev: number;            // V vs RHE
  referenceElectrode: ReferenceElectrodeType;
  customEref: number;            // V vs SHE
  pH: number;
  defaultRu: number;             // Ohms
  defaultCompensation: number;   // %
  geometricArea: number;         // cm2
  targetCurrentDensities: number[]; // [10, 50, 100]
  showIRCompensated: boolean;
}

export type LayoutMode = 'lsv' | 'tafel' | 'subplots';
export type ActiveTab = 'lsv' | 'tafel' | 'subplots' | 'report';

export interface ColumnMapping {
  potentialIndex: number;
  currentIndex: number;
  potentialUnit: 'V' | 'mV';
  currentUnit: 'mA' | 'A' | 'uA';
  headers: string[];
}
