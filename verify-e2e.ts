import { parseElectrochemicalFile } from './src/utils/parsers';
import { calculateDataPoints, calculateMetrics } from './src/utils/electrochem';
import { DEFAULT_CONFIG } from './src/utils/presets';

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' });
}

async function verifyAll() {
  console.log("=== End-to-End Validation ===");

  // 1. CHI file (Potential/V, Current/A with metadata headers)
  const chi = `Linear Sweep Voltammetry
Init E (V) = 0.2
Final E (V) = 0.8
Scan Rate (V/s) = 0.005

Potential/V, Current/A
0.200, 1.0e-5
0.300, 5.0e-5
0.400, 2.0e-4
0.500, 5.0e-4
0.600, 1.2e-3
`;
  const resCHI = await parseElectrochemicalFile(makeFile('chi_sample.csv', chi));
  const dataCHI = calculateDataPoints(resCHI[0].points, DEFAULT_CONFIG, 2.5, 85);
  const metricsCHI = calculateMetrics(dataCHI, { minLogJ: 0.5, maxLogJ: 1.5 }, DEFAULT_CONFIG);
  console.log("CHI Target 10 mA/cm2 points count:", metricsCHI.customTargetPoints?.[10]?.length);
  console.log("CHI Target 10 points:", metricsCHI.customTargetPoints?.[10]);

  // 2. User upload with Oxidation Peak (Point A, Point B, Point C)
  const peakData = `E (V),I (mA)
0.10,0.01
0.20,0.05
0.28,0.25
0.32,0.50
0.35,0.85
0.38,0.50
0.40,0.28
0.44,0.40
0.48,0.80
0.52,2.00
0.58,5.00
`;
  // Area = 0.071, 0.355 mA = 5 mA/cm2
  const resPeak = await parseElectrochemicalFile(makeFile('nife_upload.csv', peakData));
  const dataPeak = calculateDataPoints(resPeak[0].points, DEFAULT_CONFIG, 2.5, 85);
  const metricsPeak = calculateMetrics(dataPeak, { minLogJ: 0.5, maxLogJ: 1.5 }, DEFAULT_CONFIG);
  console.log("\nNiFe Upload Target 5 mA/cm2 points count:", metricsPeak.customTargetPoints?.[5]?.length);
  metricsPeak.customTargetPoints?.[5]?.forEach(p => {
    console.log(`  ${p.label} -> eta=${p.eta} mV, RHE=${p.potentialRHE} V`);
  });

  // 3. User upload where columns use brackets e.g. E [V], I [mA]
  const bracketData = `E [V],I [mA]
0.2,0.1
0.3,0.5
0.4,1.5
0.5,3.0
0.6,8.0
`;
  const resBracket = await parseElectrochemicalFile(makeFile('bracket_sample.csv', bracketData));
  console.log("\nBracket headers detected:", resBracket[0]?.detectedColumns);
  const dataBracket = calculateDataPoints(resBracket[0].points, DEFAULT_CONFIG, 2.5, 85);
  const metricsBracket = calculateMetrics(dataBracket, { minLogJ: 0.5, maxLogJ: 1.5 }, DEFAULT_CONFIG);
  console.log("Bracket target 50 mA/cm2 points count:", metricsBracket.customTargetPoints?.[50]?.length);
}

verifyAll().catch(console.error);
