import * as XLSX from 'xlsx';

export interface ParsedRawData {
  fileName: string;
  sampleName: string;
  fileType: 'csv' | 'xlsx' | 'mpr' | 'txt';
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
 * from CSV, XLSX, XLS, MPR, or TXT files.
 *
 * Each dataset (graph/curve) is formed by a (X = Potential, Y = Current) pair of columns.
 * For example, 10 columns with 5 pairs of (Ewe/V, <I>/mA) will generate exactly 5 distinct graphs.
 */
export async function parseElectrochemicalFile(file: File): Promise<ParsedRawData[]> {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();
  const baseSampleName = fileName.replace(/\.[^/.]+$/, '').replace(/[_-\s]+/g, '_');

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    return parseExcelFile(file, baseSampleName);
  } else if (lowerName.endsWith('.mpr')) {
    return parseMprFile(file, baseSampleName);
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

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('엑셀 파일에 데이터가 비어있습니다.');
  }

  // Find max columns across top rows
  let maxCols = 0;
  for (let r = 0; r < Math.min(30, rawRows.length); r++) {
    if (Array.isArray(rawRows[r])) {
      maxCols = Math.max(maxCols, rawRows[r].length);
    }
  }

  if (maxCols === 0) {
    throw new Error('엑셀 파일에서 유효한 열을 찾지 못했습니다.');
  }

  interface ColumnPairCandidate {
    potCol: number;
    curCol: number;
    headerRow: number;
    potName: string;
    curName: string;
    sampleLabel: string;
  }

  const columnPairs: ColumnPairCandidate[] = [];

  // Strategy 1: Header Keyword Matching across column pairs (X: Ewe/V vs Y: <I>/mA)
  for (let c = 0; c < maxCols; c++) {
    for (let r = 0; r < Math.min(25, rawRows.length); r++) {
      const cellText = String(rawRows[r]?.[c] || '').trim().toLowerCase();
      if (isPotentialColumn(cellText)) {
        // Look for companion Current column in adjacent column (c+1)
        let companionCol = -1;
        let companionRow = r;
        let curCellText = '';

        // Check c+1
        if (c + 1 < maxCols) {
          const rightCell = String(rawRows[r]?.[c + 1] || '').trim().toLowerCase();
          if (isCurrentColumn(rightCell)) {
            companionCol = c + 1;
            curCellText = String(rawRows[r]?.[c + 1] || '').trim();
          } else {
            // Check adjacent rows (+-2) in column c+1
            for (let ro = Math.max(0, r - 2); ro <= Math.min(rawRows.length - 1, r + 2); ro++) {
              const checkCell = String(rawRows[ro]?.[c + 1] || '').trim().toLowerCase();
              if (isCurrentColumn(checkCell)) {
                companionCol = c + 1;
                companionRow = ro;
                curCellText = String(rawRows[ro]?.[c + 1] || '').trim();
                break;
              }
            }
          }
        }

        if (companionCol !== -1) {
          // Extract sample title from row 0 or preceding row
          let label = '';
          for (let pr = Math.min(r, companionRow) - 1; pr >= 0; pr--) {
            const possibleLabel = String(rawRows[pr]?.[c] || rawRows[pr]?.[companionCol] || '').trim();
            if (possibleLabel && possibleLabel.length > 2 && !possibleLabel.toLowerCase().includes('ewe')) {
              label = cleanSampleNameFromPath(possibleLabel);
              break;
            }
          }

          if (!label) {
            label = `Sample ${columnPairs.length + 1}`;
          }

          columnPairs.push({
            potCol: c,
            curCol: companionCol,
            headerRow: Math.max(r, companionRow),
            potName: String(rawRows[r]?.[c] || 'Ewe/V'),
            curName: curCellText || '<I>/mA',
            sampleLabel: label,
          });

          // Skip companion column
          c = companionCol;
          break;
        }
      }
    }
  }

  // Strategy 2: If no explicit headers, group adjacent numeric columns in pairs (c, c+1)
  if (columnPairs.length === 0) {
    let startRow = 0;
    for (let r = 0; r < Math.min(20, rawRows.length); r++) {
      const row = rawRows[r];
      if (Array.isArray(row) && row.some(val => !isNaN(parseFloat(val)))) {
        startRow = r;
        break;
      }
    }

    for (let c = 0; c < maxCols - 1; c += 2) {
      let validCount = 0;
      for (let r = startRow; r < Math.min(startRow + 10, rawRows.length); r++) {
        const v1 = parseFloat(rawRows[r]?.[c]);
        const v2 = parseFloat(rawRows[r]?.[c + 1]);
        if (!isNaN(v1) && !isNaN(v2)) validCount++;
      }

      if (validCount >= 3) {
        let label = '';
        if (startRow > 0) {
          const possibleLabel = String(rawRows[startRow - 1]?.[c] || '').trim();
          if (possibleLabel) label = cleanSampleNameFromPath(possibleLabel);
        }
        if (!label) label = `Sample ${columnPairs.length + 1}`;

        columnPairs.push({
          potCol: c,
          curCol: c + 1,
          headerRow: Math.max(0, startRow - 1),
          potName: 'E (V)',
          curName: 'I (mA)',
          sampleLabel: label,
        });
      }
    }
  }

  if (columnPairs.length === 0) {
    throw new Error('유효한 전위(X축) / 전류(Y축) 수치 데이터 열 쌍을 찾지 못했습니다.');
  }

  // Extract data points for each detected (X, Y) column pair
  const results: ParsedRawData[] = [];

  for (let idx = 0; idx < columnPairs.length; idx++) {
    const pair = columnPairs[idx];
    const points: { rawE: number; rawI: number }[] = [];

    const potUnit = pair.potName.toLowerCase().includes('mv') ? 'mV' : 'V';
    let curUnit = 'mA';
    const curLower = pair.curName.toLowerCase();
    if (curLower.includes('ua') || curLower.includes('µa')) curUnit = 'uA';
    else if (curLower.includes('(a)') || curLower.endsWith('/a') || curLower === 'i (a)') curUnit = 'A';

    for (let r = pair.headerRow + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;

      const rawPot = parseFloat(row[pair.potCol]);
      const rawCur = parseFloat(row[pair.curCol]);

      if (!isNaN(rawPot) && !isNaN(rawCur)) {
        const normE = potUnit === 'mV' ? rawPot / 1000 : rawPot;
        let normI = rawCur;
        if (curUnit === 'A') normI = rawCur * 1000;
        else if (curUnit === 'uA') normI = rawCur / 1000;

        points.push({ rawE: normE, rawI: normI });
      }
    }

    if (points.length >= 3) {
      // Clean CV loops to standard monotonic LSV forward sweep
      const cleanedPoints = cleanLsvBranch(points);

      let sName = pair.sampleLabel;
      if (!sName || sName === 'Sample') {
        sName = columnPairs.length > 1 ? `Sample ${idx + 1}` : defaultSampleName;
      }

      results.push({
        fileName: file.name,
        sampleName: sName,
        fileType: 'xlsx',
        points: cleanedPoints,
        detectedColumns: {
          potentialColName: pair.potName,
          currentColName: pair.curName,
          potentialUnit: potUnit,
          currentUnit: curUnit,
        },
      });
    }
  }

  if (results.length === 0) {
    throw new Error('유효한 측정 데이터가 비어있거나 읽을 수 없습니다.');
  }

  return results;
}

/**
 * Parses Bio-Logic .mpr files (binary EC-Lab format & ASCII exports)
 */
async function parseMprFile(file: File, sampleName: string): Promise<ParsedRawData[]> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Check if it's an ASCII text export with .mpr extension
  let isAscii = true;
  for (let i = 0; i < Math.min(1024, bytes.length); i++) {
    if (bytes[i] === 0) {
      isAscii = false;
      break;
    }
  }

  if (isAscii) {
    const text = new TextDecoder('utf-8').decode(buffer);
    return parseTextDataMulti(text, file.name, sampleName, 'mpr');
  }

  // Binary MPR parsing
  try {
    const dataView = new DataView(buffer);
    const textDecoder = new TextDecoder('latin1');
    const fullText = textDecoder.decode(buffer);

    let extractedPoints: { rawE: number; rawI: number }[] = [];

    // Search for "VMP Data" or similar marker
    const dataMarker = 'VMP Data';
    const markerIndex = fullText.indexOf(dataMarker);

    if (markerIndex !== -1 && markerIndex + 100 < buffer.byteLength) {
      let offset = markerIndex + 24;
      if (offset + 8 < buffer.byteLength) {
        const numRows = dataView.getInt32(offset, true);
        const numCols = dataView.getInt16(offset + 4, true);

        if (numRows > 5 && numRows < 500000 && numCols > 1 && numCols < 50) {
          let dataOffset = offset + 8;
          for (let r = 0; r < numRows; r++) {
            const rowOffset = dataOffset + r * (numCols * 4);
            if (rowOffset + 8 <= buffer.byteLength) {
              const val1 = dataView.getFloat32(rowOffset, true);
              const val2 = dataView.getFloat32(rowOffset + 4, true);
              if (!isNaN(val1) && !isNaN(val2) && Math.abs(val1) < 100 && Math.abs(val2) < 10000) {
                extractedPoints.push({ rawE: val1, rawI: val2 });
              }
            }
          }
        }
      }
    }

    if (extractedPoints.length < 5) {
      extractedPoints = scanBinaryFloatPairs(dataView);
    }

    if (extractedPoints.length > 5) {
      const cleaned = cleanLsvBranch(extractedPoints);
      return [
        {
          fileName: file.name,
          sampleName: cleanSampleNameFromPath(sampleName),
          fileType: 'mpr',
          points: cleaned,
          detectedColumns: {
            potentialColName: 'Ewe (V)',
            currentColName: '<I> (mA)',
            potentialUnit: 'V',
            currentUnit: 'mA',
          },
        },
      ];
    }
  } catch (err) {
    console.warn('Binary MPR parsing fallback:', err);
  }

  // Fallback to text parsing
  const fallbackText = new TextDecoder('latin1').decode(buffer);
  return parseTextDataMulti(fallbackText, file.name, sampleName, 'mpr');
}

/**
 * Helper to scan float32 / float64 pairs in binary buffers
 */
function scanBinaryFloatPairs(dataView: DataView): { rawE: number; rawI: number }[] {
  const points: { rawE: number; rawI: number }[] = [];
  const len = dataView.byteLength;

  for (let i = 0; i < len - 8; i += 4) {
    const e = dataView.getFloat32(i, true);
    const cur = dataView.getFloat32(i + 4, true);

    if (
      !isNaN(e) &&
      !isNaN(cur) &&
      e >= -3.0 &&
      e <= 4.0 &&
      Math.abs(cur) <= 5000 &&
      (Math.abs(e) > 0.001 || Math.abs(cur) > 0.001)
    ) {
      points.push({ rawE: e, rawI: cur });
      if (points.length >= 20000) break;
    }
  }

  return points.length >= 10 ? points : [];
}

/**
 * Parses Delimited Text Files (.csv, .tsv, .txt, .dat)
 */
async function parseDelimitedTextFile(file: File, sampleName: string): Promise<ParsedRawData[]> {
  const text = await file.text();
  return parseTextDataMulti(text, file.name, sampleName, 'csv');
}

/**
 * Core text parser for CSV, TSV, WonATech, Gamry DTA, Ivium, Bio-Logic ASCII supporting pairwise multi-columns
 */
export function parseTextDataMulti(
  text: string,
  fileName: string,
  defaultSampleName: string,
  fileType: 'csv' | 'txt' | 'mpr' = 'csv'
): ParsedRawData[] {
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

  // Parse lines into array of rows
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
    throw new Error(`[${fileName}] 파일에 데이터가 없습니다.`);
  }

  // Look for potential and current column pairs across rows
  const columnPairs: { potCol: number; curCol: number; headerRow: number; sampleLabel: string }[] = [];
  const maxCols = Math.max(...parsedRows.slice(0, 20).map(r => r.length));

  for (let c = 0; c < maxCols; c++) {
    for (let r = 0; r < Math.min(25, parsedRows.length); r++) {
      const cell = String(parsedRows[r]?.[c] || '').toLowerCase();
      if (isPotentialColumn(cell)) {
        if (c + 1 < maxCols && isCurrentColumn(String(parsedRows[r]?.[c + 1] || '').toLowerCase())) {
          let label = '';
          if (r > 0) {
            label = cleanSampleNameFromPath(String(parsedRows[r - 1]?.[c] || ''));
          }
          if (!label) label = `Sample ${columnPairs.length + 1}`;
          columnPairs.push({
            potCol: c,
            curCol: c + 1,
            headerRow: r,
            sampleLabel: label,
          });
          c++; // skip current column
          break;
        }
      }
    }
  }

  // Fallback single pair if no header matched
  if (columnPairs.length === 0) {
    let headerRow = 0;
    for (let r = 0; r < Math.min(20, parsedRows.length); r++) {
      const v1 = parseFloat(parsedRows[r]?.[0]);
      const v2 = parseFloat(parsedRows[r]?.[1]);
      if (!isNaN(v1) && !isNaN(v2)) {
        headerRow = Math.max(0, r - 1);
        break;
      }
    }
    columnPairs.push({
      potCol: 0,
      curCol: 1,
      headerRow,
      sampleLabel: defaultSampleName,
    });
  }

  const results: ParsedRawData[] = [];
  for (let idx = 0; idx < columnPairs.length; idx++) {
    const pair = columnPairs[idx];
    const points: { rawE: number; rawI: number }[] = [];
    for (let r = pair.headerRow + 1; r < parsedRows.length; r++) {
      const rawE = parseFloat(parsedRows[r]?.[pair.potCol]);
      const rawI = parseFloat(parsedRows[r]?.[pair.curCol]);
      if (!isNaN(rawE) && !isNaN(rawI)) {
        points.push({ rawE, rawI });
      }
    }

    if (points.length >= 3) {
      const cleaned = cleanLsvBranch(points);
      results.push({
        fileName,
        sampleName: cleanSampleNameFromPath(pair.sampleLabel) || `Sample ${idx + 1}`,
        fileType,
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
 * Intelligent filter to clean CV (Cyclic Voltammetry) hysteresis loops into standard,
 * monotonic LSV (Linear Sweep Voltammetry) forward polarization curves.
 */
export function cleanLsvBranch(rawPoints: { rawE: number; rawI: number }[]): { rawE: number; rawI: number }[] {
  if (!rawPoints || rawPoints.length < 5) return rawPoints;

  // Check if the data is a CV (potential goes up then down, or down then up)
  let directionChanges = 0;
  let prevDiff = 0;

  for (let i = 1; i < rawPoints.length; i++) {
    const diff = rawPoints[i].rawE - rawPoints[i - 1].rawE;
    if (Math.abs(diff) > 1e-4) {
      if (prevDiff !== 0 && (diff > 0 !== prevDiff > 0)) {
        directionChanges++;
      }
      prevDiff = diff;
    }
  }

  // If there are reversals (CV loop or multi-cycle scan), extract the longest monotonic anodic (forward) branch
  if (directionChanges >= 1) {
    // Segment data into monotonic sweeps
    const sweeps: { rawE: number; rawI: number }[][] = [];
    let currentSweep: { rawE: number; rawI: number }[] = [rawPoints[0]];
    let currentDir = 0; // +1 ascending, -1 descending

    for (let i = 1; i < rawPoints.length; i++) {
      const diff = rawPoints[i].rawE - rawPoints[i - 1].rawE;
      if (Math.abs(diff) > 1e-4) {
        const dir = diff > 0 ? 1 : -1;
        if (currentDir === 0) {
          currentDir = dir;
        } else if (dir !== currentDir) {
          if (currentSweep.length >= 5) {
            sweeps.push(currentSweep);
          }
          currentSweep = [rawPoints[i - 1]];
          currentDir = dir;
        }
      }
      currentSweep.push(rawPoints[i]);
    }
    if (currentSweep.length >= 5) {
      sweeps.push(currentSweep);
    }

    // Select the best anodic (ascending potential, low -> high) sweep, preferring later stabilized cycles
    const ascendingSweeps = sweeps.filter(s => s[s.length - 1].rawE > s[0].rawE);
    if (ascendingSweeps.length > 0) {
      // Pick the last ascending sweep (standard for CV: the stabilized last cycle)
      const chosenSweep = ascendingSweeps[ascendingSweeps.length - 1];
      return sortAndDeduplicatePoints(chosenSweep);
    }
  }

  // If already monotonic or single sweep, just ensure sorted ascending by potential
  return sortAndDeduplicatePoints(rawPoints);
}

/**
 * Sorts points monotonically by potential and removes duplicate or erratic jitter points
 */
function sortAndDeduplicatePoints(points: { rawE: number; rawI: number }[]): { rawE: number; rawI: number }[] {
  // Sort ascending by potential
  const sorted = [...points].sort((a, b) => a.rawE - b.rawE);

  // Deduplicate very close potentials (< 0.0001 V)
  const result: { rawE: number; rawI: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (
      result.length === 0 ||
      Math.abs(sorted[i].rawE - result[result.length - 1].rawE) > 1e-4
    ) {
      result.push(sorted[i]);
    }
  }

  return result.length >= 3 ? result : sorted;
}

/**
 * Cleans sample name from full file path or messy string
 * e.g. "F:\활성\250211\새 폴더 (3)\250211_OER_S_500_3HR_2번팁 1M_02_CV_C01.mpr"
 * -> "250211_OER_S_500_3HR_2번팁"
 */
export function cleanSampleNameFromPath(pathStr: string): string {
  if (!pathStr) return 'Sample';
  // Remove windows/unix path prefixes
  let clean = pathStr.split(/[\/\\]/).pop() || pathStr;
  // Remove extension
  clean = clean.replace(/\.[^/.]+$/, '');
  // Remove trailing EC-Lab suffixes like "_01_LSV_C01", "_02_CV_C01", "_C01"
  clean = clean.replace(/_\d{2}_(CV|LSV|CA|CP)(_C\d{2})?$/i, '');
  clean = clean.replace(/_C\d{2}$/i, '');
  clean = clean.trim();
  return clean || 'Sample';
}

function isPotentialColumn(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('ewe') ||
    n.includes('potential') ||
    n.includes('volt') ||
    n.includes('e (v)') ||
    n.includes('e/v') ||
    n.includes('v vs') ||
    n.includes('e_we') ||
    n.includes('v_meas') ||
    n.startsWith('e (v') ||
    n === 'v' ||
    n === 'e' ||
    n === 'u'
  );
}

function isCurrentColumn(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('<i') ||
    n.includes('i/ma') ||
    n.includes('i (ma)') ||
    n.includes('i (a)') ||
    n.includes('current') ||
    n.includes('i_meas') ||
    n.includes('cur') ||
    n.includes('j (ma') ||
    n.includes('density') ||
    n.includes('i (µa)') ||
    n.includes('i (ua)') ||
    n === 'i' ||
    n === 'j' ||
    n === '<i/ma>' ||
    n === '<i/a>'
  );
}
