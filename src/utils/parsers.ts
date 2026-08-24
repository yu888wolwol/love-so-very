import * as XLSX from 'xlsx';

export interface ParsedRawData {
  fileName: string;
  sampleName: string;
  fileType: 'csv' | 'xlsx' | 'txt';
  points: { rawE: number; rawI: number }[];
  detectedColumns: {
    potentialColName: string;
    currentColName: string;
    potentialUnit: string;
    currentUnit: string;
  };
  metadata?: Record<string, string>;
}

/**
 * Intelligent file parser that automatically extracts ONE or MULTIPLE electrochemical datasets
 * from CSV, XLSX, XLS, or TXT files.
 *
 * Each dataset (graph/curve) is formed by a (X = Potential, Y = Current) pair of columns.
 * For example, 10 columns containing 5 pairs of (Ewe/V, <I>/mA) will generate exactly 5 distinct graphs.
 */
export async function parseElectrochemicalFile(file: File): Promise<ParsedRawData[]> {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();
  const baseSampleName = fileName.replace(/\.[^/.]+$/, '').replace(/[_-\s]+/g, '_');

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    return parseExcelFile(file, baseSampleName);
  } else {
    // csv, txt, dat, dta, tsv
    return parseDelimitedTextFile(file, baseSampleName);
  }
}

/**
 * Parses Excel files (.xlsx, .xls) that contain single or MULTIPLE LSV/CV dataset column pairs.
 * (e.g. Col 1: X1 (Ewe/V), Col 2: Y1 (<I>/mA), Col 3: X2 (Ewe/V), Col 4: Y2 (<I>/mA), ... -> 5 graphs)
 */
async function parseExcelFile(file: File, defaultSampleName: string): Promise<ParsedRawData[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Read all cells with empty string defaults
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('엑셀 파일에 데이터가 비어있습니다.');
  }

  // Calculate maximum column index
  let maxCols = 0;
  for (let r = 0; r < rawRows.length; r++) {
    if (Array.isArray(rawRows[r])) {
      maxCols = Math.max(maxCols, rawRows[r].length);
    }
  }

  if (maxCols < 2) {
    throw new Error('엑셀 파일에 최소 2개 이상의 유효한 열(전위 X축, 전류 Y축)이 필요합니다.');
  }

  interface DetectedPair {
    potCol: number;
    curCol: number;
    startRow: number;
    potHeader: string;
    curHeader: string;
    sampleName: string;
  }

  const detectedPairs: DetectedPair[] = [];

  // Step 1: Scan for column pairs (X: Potential, Y: Current)
  let c = 0;
  while (c < maxCols) {
    // Check if column `c` and `c + 1` form a valid (X, Y) pair
    let potCol = -1;
    let curCol = -1;
    let headerRow = -1;
    let potHeader = 'Ewe/V';
    let curHeader = '<I>/mA';
    let label = '';

    // Check rows 0 to 15 for header keywords
    for (let r = 0; r < Math.min(15, rawRows.length); r++) {
      const cellTextA = String(rawRows[r]?.[c] || '').trim();
      const cellTextB = String(rawRows[r]?.[c + 1] || '').trim();

      if (isPotentialColumn(cellTextA) && isCurrentColumn(cellTextB)) {
        potCol = c;
        curCol = c + 1;
        headerRow = r;
        potHeader = cellTextA;
        curHeader = cellTextB;
        break;
      }
    }

    // If explicit header matched:
    if (potCol !== -1 && curCol !== -1) {
      // Find sample title in row 0 or row before header
      for (let pr = 0; pr <= headerRow - 1; pr++) {
        const titleCandidate = String(rawRows[pr]?.[potCol] || rawRows[pr]?.[curCol] || '').trim();
        if (titleCandidate && !isPotentialColumn(titleCandidate) && titleCandidate.length > 1) {
          label = cleanSampleNameFromPath(titleCandidate);
          break;
        }
      }

      if (!label) {
        label = `Sample ${detectedPairs.length + 1}`;
      }

      detectedPairs.push({
        potCol,
        curCol,
        startRow: headerRow + 1,
        potHeader,
        curHeader,
        sampleName: label,
      });

      // Move to next pair (advance by 2 columns)
      c += 2;
      continue;
    }

    // If no explicit header, check if columns c and c+1 contain numeric data
    let numericRowCount = 0;
    let firstNumericRow = -1;
    for (let r = 0; r < Math.min(25, rawRows.length); r++) {
      const valA = parseFloat(String(rawRows[r]?.[c] || '').replace(/,/g, ''));
      const valB = parseFloat(String(rawRows[r]?.[c + 1] || '').replace(/,/g, ''));

      if (!isNaN(valA) && !isNaN(valB) && isFinite(valA) && isFinite(valB)) {
        if (firstNumericRow === -1) firstNumericRow = r;
        numericRowCount++;
      }
    }

    if (numericRowCount >= 3 && firstNumericRow !== -1) {
      // Extract label from row before numeric data
      if (firstNumericRow > 0) {
        for (let pr = 0; pr < firstNumericRow; pr++) {
          const titleCandidate = String(rawRows[pr]?.[c] || rawRows[pr]?.[c + 1] || '').trim();
          if (titleCandidate && titleCandidate.length > 1 && !isPotentialColumn(titleCandidate)) {
            label = cleanSampleNameFromPath(titleCandidate);
            break;
          }
        }
      }

      if (!label) {
        label = `Sample ${detectedPairs.length + 1}`;
      }

      detectedPairs.push({
        potCol: c,
        curCol: c + 1,
        startRow: firstNumericRow,
        potHeader: 'Potential (V)',
        curHeader: 'Current (mA)',
        sampleName: label,
      });

      c += 2;
      continue;
    }

    // If this column is not a pair, advance by 1
    c += 1;
  }

  if (detectedPairs.length === 0) {
    throw new Error('유효한 전위(X축) / 전류(Y축) 수치 데이터 열 쌍을 찾지 못했습니다.');
  }

  // Step 2: Extract data points for each detected pair (each pair = 1 graph)
  const results: ParsedRawData[] = [];

  for (let i = 0; i < detectedPairs.length; i++) {
    const pair = detectedPairs[i];
    const points: { rawE: number; rawI: number }[] = [];

    const potUnit = pair.potHeader.toLowerCase().includes('mv') ? 'mV' : 'V';
    let curUnit = 'mA';
    const curLower = pair.curHeader.toLowerCase();
    if (curLower.includes('ua') || curLower.includes('µa')) curUnit = 'uA';
    else if (curLower.includes('(a)') || curLower.endsWith('/a') || curLower === 'i (a)' || curLower === 'a') curUnit = 'A';

    for (let r = pair.startRow; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;

      const cellA = row[pair.potCol];
      const cellB = row[pair.curCol];
      if (cellA === undefined || cellA === '' || cellB === undefined || cellB === '') continue;

      const rawValE = typeof cellA === 'number' ? cellA : parseFloat(String(cellA).replace(/,/g, ''));
      const rawValI = typeof cellB === 'number' ? cellB : parseFloat(String(cellB).replace(/,/g, ''));

      if (!isNaN(rawValE) && !isNaN(rawValI) && isFinite(rawValE) && isFinite(rawValI)) {
        let normE = potUnit === 'mV' ? rawValE / 1000 : rawValE;
        let normI = rawValI;
        if (curUnit === 'A') normI = rawValI * 1000;
        else if (curUnit === 'uA') normI = rawValI / 1000;

        points.push({ rawE: normE, rawI: normI });
      }
    }

    if (points.length >= 3) {
      const cleaned = despikeAndCleanPoints(points);
      let finalName = pair.sampleName;
      if (!finalName || finalName === 'Sample') {
        finalName = detectedPairs.length > 1 ? `Sample ${i + 1}` : defaultSampleName;
      }

      results.push({
        fileName: file.name,
        sampleName: finalName,
        fileType: 'xlsx',
        points: cleaned,
        detectedColumns: {
          potentialColName: pair.potHeader,
          currentColName: pair.curHeader,
          potentialUnit: potUnit,
          currentUnit: curUnit,
        },
      });
    }
  }

  if (results.length === 0) {
    throw new Error('유효한 측정 데이터 행을 읽지 못했습니다.');
  }

  return results;
}

/**
 * Parses Delimited Text Files (.csv, .tsv, .txt, .dat) with support for multi-column pairwise datasets
 */
async function parseDelimitedTextFile(file: File, defaultSampleName: string): Promise<ParsedRawData[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  let delimiter = ',';

  // Sample delimiter detection
  for (const line of lines.slice(0, 30)) {
    if (line.includes('\t')) {
      delimiter = '\t';
      break;
    } else if (line.includes(';') && (line.match(/;/g)?.length || 0) > (line.match(/,/g)?.length || 0)) {
      delimiter = ';';
      break;
    } else if (line.includes(',')) {
      delimiter = ',';
      break;
    }
  }

  // Parse lines into 2D grid
  const parsedRows: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    let parts = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (parts.length === 1 && line.includes(',')) {
      parts = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    } else if (parts.length === 1 && line.includes('\t')) {
      parts = line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
    } else if (parts.length === 1) {
      parts = line.split(/\s+/).map(c => c.trim());
    }
    parsedRows.push(parts);
  }

  if (parsedRows.length === 0) {
    throw new Error(`[${file.name}] 파일에 데이터가 없습니다.`);
  }

  const maxCols = Math.max(...parsedRows.slice(0, 20).map(r => r.length));

  interface DetectedTextPair {
    potCol: number;
    curCol: number;
    startRow: number;
    label: string;
  }

  const pairs: DetectedTextPair[] = [];
  let c = 0;

  while (c < maxCols) {
    let potCol = -1;
    let curCol = -1;
    let headerRow = -1;
    let label = '';

    for (let r = 0; r < Math.min(15, parsedRows.length); r++) {
      const cellA = String(parsedRows[r]?.[c] || '').trim();
      const cellB = String(parsedRows[r]?.[c + 1] || '').trim();

      if (isPotentialColumn(cellA) && isCurrentColumn(cellB)) {
        potCol = c;
        curCol = c + 1;
        headerRow = r;
        break;
      }
    }

    if (potCol !== -1 && curCol !== -1) {
      for (let pr = 0; pr < headerRow; pr++) {
        const titleCand = String(parsedRows[pr]?.[potCol] || parsedRows[pr]?.[curCol] || '').trim();
        if (titleCand && !isPotentialColumn(titleCand)) {
          label = cleanSampleNameFromPath(titleCand);
          break;
        }
      }
      if (!label) label = `Sample ${pairs.length + 1}`;

      pairs.push({
        potCol,
        curCol,
        startRow: headerRow + 1,
        label,
      });

      c += 2;
      continue;
    }

    // Numeric check fallback
    let numCount = 0;
    let firstNumRow = -1;
    for (let r = 0; r < Math.min(25, parsedRows.length); r++) {
      const vA = parseFloat(parsedRows[r]?.[c]);
      const vB = parseFloat(parsedRows[r]?.[c + 1]);
      if (!isNaN(vA) && !isNaN(vB)) {
        if (firstNumRow === -1) firstNumRow = r;
        numCount++;
      }
    }

    if (numCount >= 3 && firstNumRow !== -1) {
      if (firstNumRow > 0) {
        label = cleanSampleNameFromPath(String(parsedRows[firstNumRow - 1]?.[c] || ''));
      }
      if (!label) label = `Sample ${pairs.length + 1}`;

      pairs.push({
        potCol: c,
        curCol: c + 1,
        startRow: firstNumRow,
        label,
      });

      c += 2;
      continue;
    }

    c += 1;
  }

  if (pairs.length === 0) {
    // Single fallback
    pairs.push({
      potCol: 0,
      curCol: 1,
      startRow: 0,
      label: defaultSampleName,
    });
  }

  const results: ParsedRawData[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const points: { rawE: number; rawI: number }[] = [];

    for (let r = pair.startRow; r < parsedRows.length; r++) {
      const rawE = parseFloat(parsedRows[r]?.[pair.potCol]);
      const rawI = parseFloat(parsedRows[r]?.[pair.curCol]);
      if (!isNaN(rawE) && !isNaN(rawI) && isFinite(rawE) && isFinite(rawI)) {
        points.push({ rawE, rawI });
      }
    }

    if (points.length >= 3) {
      const cleaned = despikeAndCleanPoints(points);
      results.push({
        fileName: file.name,
        sampleName: pair.label || `Sample ${i + 1}`,
        fileType: 'csv',
        points: cleaned,
        detectedColumns: {
          potentialColName: 'Potential (V)',
          currentColName: 'Current (mA)',
          potentialUnit: 'V',
          currentUnit: 'mA',
        },
      });
    }
  }

  return results;
}

/**
 * Intelligent filter to remove abnormal electrical spike glitches (단발성 튀는 노이즈 아티팩트 제거)
 * and sort points monotonically.
 */
export function despikeAndCleanPoints(
  rawPoints: { rawE: number; rawI: number }[]
): { rawE: number; rawI: number }[] {
  if (!rawPoints || rawPoints.length < 5) return rawPoints;

  // 1. Sort ascending by potential
  const sorted = [...rawPoints].sort((a, b) => a.rawE - b.rawE);

  // 2. Remove isolated sharp spikes (points that suddenly jump far beyond neighbors and return)
  const despiked: { rawE: number; rawI: number }[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];

    if (i > 0 && i < sorted.length - 1) {
      const prev = sorted[i - 1];
      const next = sorted[i + 1];
      
      const expectedNeighborAvg = (prev.rawI + next.rawI) / 2;
      const baselineDiff = Math.abs(prev.rawI - next.rawI);
      const spikeDev = Math.abs(cur.rawI - expectedNeighborAvg);

      // Condition for sudden sharp isolated spike (e.g. 3.9 -> 161 -> 3.9)
      const isExtremeSpike =
        spikeDev > 3.0 && // Jump greater than 3 mA
        spikeDev > Math.max(0.2, baselineDiff * 3.5) &&
        Math.sign(cur.rawI - prev.rawI) === Math.sign(cur.rawI - next.rawI);

      if (isExtremeSpike) {
        // Replace spike with interpolated average of neighbors
        despiked.push({
          rawE: cur.rawE,
          rawI: expectedNeighborAvg,
        });
        continue;
      }
    }

    despiked.push(cur);
  }

  // 3. Deduplicate points with identical potentials (< 0.0001 V)
  const result: { rawE: number; rawI: number }[] = [];
  for (let i = 0; i < despiked.length; i++) {
    if (
      result.length === 0 ||
      Math.abs(despiked[i].rawE - result[result.length - 1].rawE) > 1e-4
    ) {
      result.push(despiked[i]);
    }
  }

  return result.length >= 3 ? result : despiked;
}

/**
 * Cleans sample name from full file path or messy string
 * e.g. "F:\활성\250211\whw새 폴더 (3)\250211_OER_S_500_3HR_2번팁 1M_02_CV_C01.mpr"
 * -> "250211_OER_S_500_3HR_2번팁 1M"
 */
export function cleanSampleNameFromPath(pathStr: string): string {
  if (!pathStr) return 'Sample';

  // If path contains backslash or slash, get last portion
  let clean = pathStr.split(/[\/\\]/).pop() || pathStr;

  // Remove common extensions
  clean = clean.replace(/\.(mpr|xlsx|xls|csv|txt|dat|dta)$/i, '');

  // Remove EC-Lab / BioLogic trailing channel & cycle tags like "_01_LSV_C01", "_02_CV_C01", "_C01"
  clean = clean.replace(/_\d{2}_(CV|LSV|CA|CP)(_C\d{2})?$/i, '');
  clean = clean.replace(/_C\d{2}$/i, '');

  // If still contains messy path fragments, extract meaningful part
  clean = clean.trim();
  return clean || 'Sample';
}

function isPotentialColumn(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.includes('ewe') ||
    n.includes('potential') ||
    n.includes('volt') ||
    n.includes('e (v') ||
    n.includes('e/v') ||
    n.includes('v vs') ||
    n.includes('e_we') ||
    n.includes('v_meas') ||
    n === 'v' ||
    n === 'e' ||
    n === 'u'
  );
}

function isCurrentColumn(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.includes('<i') ||
    n.includes('i/ma') ||
    n.includes('i (ma') ||
    n.includes('i (a') ||
    n.includes('current') ||
    n.includes('i_meas') ||
    n.includes('j (ma') ||
    n.includes('density') ||
    n.includes('i (µa)') ||
    n.includes('i (ua)') ||
    n === 'i' ||
    n === 'j' ||
    n === '<i/ma>' ||
    n === '<i/a>' ||
    n === 'ma' ||
    n === 'a'
  );
}
