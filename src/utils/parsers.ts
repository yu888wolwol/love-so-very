import * as XLSX from 'xlsx';

export interface ParsedRawData {
  fileName: string;
  sampleName: string;
  fileType: 'csv' | 'xlsx' | 'txt';
  points: { rawE: number; rawI: number; alreadyRHE?: boolean; isCurrentDensity?: boolean }[];
  detectedColumns: {
    potentialColName: string;
    currentColName: string;
    potentialUnit: string;
    currentUnit: string;
    alreadyRHE?: boolean;
    isCurrentDensity?: boolean;
  };
  metadata?: Record<string, string>;
}

export function isIgnoreColumn(name: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return (
    n.startsWith('time') ||
    n.includes('time/s') ||
    n.includes('time (s)') ||
    n.includes('t/s') ||
    n.includes('t (s)') ||
    n === 't' ||
    n === 'time' ||
    n.includes('시간') ||
    n.includes('cycle') ||
    n.includes('사이클') ||
    n.includes('index') ||
    n.includes('point') ||
    n.includes('step') ||
    n.includes('freq') ||
    n.includes('phase') ||
    n.includes("z'") ||
    n.includes("z''") ||
    n.includes('re(z)') ||
    n.includes('im(z)') ||
    n.includes('control') ||
    n.includes('mode') ||
    n.includes('q-q0') ||
    n.includes('charge') ||
    n.includes('temp') ||
    n.includes('ox/red')
  );
}

export function isPotentialColumn(name: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (isIgnoreColumn(n)) return false;
  return (
    n.includes('ewe') ||
    n.includes('potential') ||
    n.includes('volt') ||
    n.includes('v vs') ||
    n.includes('vs.') ||
    n.includes('vs ') ||
    n.includes('e vs') ||
    n.includes('e (v') ||
    n.includes('e(v') ||
    n.includes('e [v') ||
    n.includes('e[v') ||
    n.includes('e/v') ||
    n.includes('e / v') ||
    n.includes('e_we') ||
    n.includes('v_meas') ||
    n.includes('vf') ||
    n.includes('e_rhe') ||
    n.includes('erhe') ||
    n.includes('v_rhe') ||
    n.includes('vrhe') ||
    n.includes('we(1).potential') ||
    n.includes('전위') ||
    n.includes('전압') ||
    n === 'v' ||
    n === 'e' ||
    n === 'u' ||
    n === 'u/v' ||
    n === 'u (v)' ||
    n === 'u [v]' ||
    n.startsWith('e_') ||
    n.startsWith('v_') ||
    n.endsWith('(v)') ||
    n.endsWith('[v]') ||
    n.endsWith('/v')
  );
}

export function isCurrentDensityColumn(name: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return (
    n.includes('cm2') ||
    n.includes('cm-2') ||
    n.includes('cm^-2') ||
    n.includes('cm²') ||
    n.includes('cm⁻²') ||
    n.includes('density') ||
    n.includes('전류밀도') ||
    n.includes('전류 밀도') ||
    n.startsWith('j') ||
    n.includes('(j)') ||
    n.includes('[j]') ||
    n.includes('/j') ||
    n.includes('j(') ||
    n.includes('j[') ||
    n.includes('j/') ||
    n.includes('j ') ||
    n.includes('j_') ||
    n.includes('area')
  );
}

export function isCurrentColumn(name: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (isIgnoreColumn(n)) return false;
  return (
    n.includes('<i') ||
    n.includes('i/ma') ||
    n.includes('i / ma') ||
    n.includes('i(ma') ||
    n.includes('i (ma') ||
    n.includes('i[ma') ||
    n.includes('i [ma') ||
    n.includes('i/a') ||
    n.includes('i / a') ||
    n.includes('i(a') ||
    n.includes('i (a') ||
    n.includes('i[a') ||
    n.includes('i [a') ||
    n.includes('current') ||
    n.includes('i_meas') ||
    n.includes('j (ma') ||
    n.includes('j(ma') ||
    n.includes('j [ma') ||
    n.includes('j[ma') ||
    n.includes('j / ma') ||
    n.includes('j/ma') ||
    n.includes('density') ||
    n.includes('i (µa)') ||
    n.includes('i(µa)') ||
    n.includes('i (ua)') ||
    n.includes('i(ua)') ||
    n.includes('i [ua]') ||
    n.includes('i[ua]') ||
    n.includes('we(1).current') ||
    n.includes('im') ||
    n.includes('전류') ||
    n.includes('전류밀도') ||
    n === 'i' ||
    n === 'j' ||
    n === '<i/ma>' ||
    n === '<i/a>' ||
    n === 'ma' ||
    n === 'a' ||
    n.endsWith('(a)') ||
    n.endsWith('[a]') ||
    n.endsWith('/a') ||
    n.endsWith(' a') ||
    n.endsWith('(ma)') ||
    n.endsWith('[ma]') ||
    n.endsWith('/ma') ||
    n.endsWith(' ma') ||
    n.endsWith('(ua)') ||
    n.endsWith('[ua]') ||
    n.endsWith('/ua') ||
    n.endsWith(' ua') ||
    n.includes('cm2') ||
    n.includes('cm-2') ||
    n.includes('cm^-2') ||
    n.includes('cm²')
  );
}

/**
 * Intelligent file parser that automatically extracts ONE or MULTIPLE electrochemical datasets
 * from CSV, XLSX, XLS, TXT, TSV, or DAT files.
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

interface ColumnPairDef {
  potCol: number;
  curCol: number;
  startRow: number;
  potHeader: string;
  curHeader: string;
  sampleName: string;
}

/**
 * Unified detector that inspects a 2D grid of rows and columns to find valid (Potential, Current) pairs.
 */
function detectDatasetPairs(rawRows: any[][], defaultSampleName: string): ColumnPairDef[] {
  let maxCols = 0;
  for (let r = 0; r < Math.min(150, rawRows.length); r++) {
    if (Array.isArray(rawRows[r])) {
      maxCols = Math.max(maxCols, rawRows[r].length);
    }
  }

  if (maxCols < 2) {
    throw new Error('파일에 최소 2개 이상의 열이 필요합니다.');
  }

  // 1. Scan first 100 rows for explicit header row containing potential & current columns
  let headerRow = -1;
  let potColIndices: number[] = [];
  let curColIndices: number[] = [];

  for (let r = 0; r < Math.min(100, rawRows.length); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    const rowPots: number[] = [];
    const rowCurs: number[] = [];

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim();
      if (!cell) continue;
      if (isPotentialColumn(cell)) rowPots.push(c);
      else if (isCurrentColumn(cell)) rowCurs.push(c);
    }

    if (rowPots.length > 0 && rowCurs.length > 0) {
      headerRow = r;
      potColIndices = rowPots;
      curColIndices = rowCurs;
      break;
    }
  }

  const pairs: ColumnPairDef[] = [];

  if (headerRow !== -1 && potColIndices.length > 0 && curColIndices.length > 0) {
    const headerCells = rawRows[headerRow];

    // Case A: Exactly 1 potential and 1 current (e.g. [time, Ewe, <I>])
    if (potColIndices.length === 1 && curColIndices.length === 1) {
      const pCol = potColIndices[0];
      const cCol = curColIndices[0];
      let sampleTitle = '';

      // Check rows before header for sample title
      for (let pr = 0; pr < headerRow; pr++) {
        const titleCandidate = String(rawRows[pr]?.[pCol] || rawRows[pr]?.[cCol] || rawRows[pr]?.[0] || '').trim();
        if (titleCandidate && titleCandidate.length > 1 && !isPotentialColumn(titleCandidate) && !isIgnoreColumn(titleCandidate)) {
          sampleTitle = cleanSampleNameFromPath(titleCandidate);
          break;
        }
      }

      pairs.push({
        potCol: pCol,
        curCol: cCol,
        startRow: headerRow + 1,
        potHeader: String(headerCells[pCol] || 'Potential (V)'),
        curHeader: String(headerCells[cCol] || 'Current (mA)'),
        sampleName: sampleTitle || defaultSampleName,
      });
    }
    // Case B: 1 potential column and multiple current columns (e.g. [E, Cycle1_I, Cycle2_I, Cycle3_I])
    else if (potColIndices.length === 1 && curColIndices.length > 1) {
      const pCol = potColIndices[0];
      for (let i = 0; i < curColIndices.length; i++) {
        const cCol = curColIndices[i];
        const cHeader = String(headerCells[cCol] || `Cycle ${i + 1}`);
        let name = `${defaultSampleName}_${cleanSampleNameFromPath(cHeader)}`;
        if (name === defaultSampleName) name = `${defaultSampleName} (${i + 1})`;

        pairs.push({
          potCol: pCol,
          curCol: cCol,
          startRow: headerRow + 1,
          potHeader: String(headerCells[pCol] || 'Potential (V)'),
          curHeader: cHeader,
          sampleName: name,
        });
      }
    }
    // Case C: Multiple potential and multiple current columns (e.g. [E1, I1, E2, I2] or [time1, E1, I1, time2, E2, I2])
    else {
      // Pair each potential column with the closest current column
      const usedCurCols = new Set<number>();
      for (let i = 0; i < potColIndices.length; i++) {
        const pCol = potColIndices[i];
        // find best matching current column (prefer immediately following pCol)
        let bestCurCol = -1;
        let minDiff = 9999;
        for (const cCol of curColIndices) {
          if (usedCurCols.has(cCol)) continue;
          const diff = cCol - pCol;
          if (diff > 0 && diff < minDiff) {
            minDiff = diff;
            bestCurCol = cCol;
          }
        }
        if (bestCurCol === -1) {
          // fallback to any unused current col
          for (const cCol of curColIndices) {
            if (!usedCurCols.has(cCol)) {
              bestCurCol = cCol;
              break;
            }
          }
        }

        if (bestCurCol !== -1) {
          usedCurCols.add(bestCurCol);
          let title = '';
          for (let pr = 0; pr < headerRow; pr++) {
            const cand = String(rawRows[pr]?.[pCol] || rawRows[pr]?.[bestCurCol] || '').trim();
            if (cand && cand.length > 1 && !isPotentialColumn(cand)) {
              title = cleanSampleNameFromPath(cand);
              break;
            }
          }
          if (!title) title = `Sample ${pairs.length + 1}`;

          pairs.push({
            potCol: pCol,
            curCol: bestCurCol,
            startRow: headerRow + 1,
            potHeader: String(headerCells[pCol] || 'Potential (V)'),
            curHeader: String(headerCells[bestCurCol] || 'Current (mA)'),
            sampleName: title,
          });
        }
      }
    }
  }

  // Fallback: If no explicit header matched
  if (pairs.length === 0) {
    // Check first 30 rows for numeric columns
    const numericCols: { col: number; sampleVals: number[]; isTimeLike: boolean }[] = [];
    let firstNumRow = -1;

    for (let c = 0; c < maxCols; c++) {
      const vals: number[] = [];
      for (let r = 0; r < Math.min(30, rawRows.length); r++) {
        const v = parseFloat(String(rawRows[r]?.[c] || '').replace(/,/g, ''));
        if (!isNaN(v) && isFinite(v)) {
          vals.push(v);
          if (firstNumRow === -1) firstNumRow = r;
        }
      }
      if (vals.length >= 3) {
        // check if strictly increasing like time or index
        let isIncreasing = true;
        for (let k = 1; k < vals.length; k++) {
          if (vals[k] <= vals[k - 1]) {
            isIncreasing = false;
            break;
          }
        }
        const isTimeLike = isIncreasing && vals[0] >= 0 && (vals[vals.length - 1] - vals[0] > 0.5);
        numericCols.push({ col: c, sampleVals: vals, isTimeLike });
      }
    }

    // Filter out time-like columns if there are at least 2 non-time columns
    let candidateCols = numericCols.filter(nc => !nc.isTimeLike);
    if (candidateCols.length < 2) {
      candidateCols = numericCols;
    }

    if (candidateCols.length >= 2) {
      let pCol = candidateCols[0].col;
      let cCol = candidateCols[1].col;

      // Check values to determine which is potential (typically 0.5 - 2.5 V)
      const avg0 = Math.abs(candidateCols[0].sampleVals.reduce((a, b) => a + b, 0) / candidateCols[0].sampleVals.length);
      const avg1 = Math.abs(candidateCols[1].sampleVals.reduce((a, b) => a + b, 0) / candidateCols[1].sampleVals.length);

      if (avg0 < 0.2 && avg1 >= 0.5 && avg1 <= 3.0) {
        // Col 0 is small current (A), Col 1 is potential (V) -> swap
        pCol = candidateCols[1].col;
        cCol = candidateCols[0].col;
      }

      pairs.push({
        potCol: pCol,
        curCol: cCol,
        startRow: firstNumRow > 0 ? firstNumRow : 0,
        potHeader: 'Potential (V)',
        curHeader: 'Current (mA)',
        sampleName: defaultSampleName,
      });
    }
  }

  if (pairs.length === 0) {
    throw new Error('유효한 전위/전류 수치 데이터 열을 파일에서 찾을 수 없습니다.');
  }

  return pairs;
}

/**
 * Extracts and unit-normalizes datasets from pairs
 */
function extractDatasetsFromPairs(
  rawRows: any[][],
  pairs: ColumnPairDef[],
  fileName: string,
  fileType: 'csv' | 'xlsx' | 'txt'
): ParsedRawData[] {
  const results: ParsedRawData[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const rawPointsList: { rawE: number; rawI: number }[] = [];

    for (let r = pair.startRow; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;

      const cellA = row[pair.potCol];
      const cellB = row[pair.curCol];
      if (cellA === undefined || cellA === '' || cellB === undefined || cellB === '') continue;

      const rawValE = typeof cellA === 'number' ? cellA : parseFloat(String(cellA).replace(/,/g, ''));
      const rawValI = typeof cellB === 'number' ? cellB : parseFloat(String(cellB).replace(/,/g, ''));

      if (!isNaN(rawValE) && !isNaN(rawValI) && isFinite(rawValE) && isFinite(rawValI)) {
        rawPointsList.push({ rawE: rawValE, rawI: rawValI });
      }
    }

    if (rawPointsList.length >= 3) {
      const pLower = pair.potHeader.toLowerCase();
      const cLower = pair.curHeader.toLowerCase();

      // Potential unit detection
      const isAlreadyRHE = pLower.includes('rhe');
      let potUnit = pLower.includes('mv') || (!pLower.includes('v') && rawPointsList.some(p => Math.abs(p.rawE) > 60)) ? 'mV' : 'V';

      // Current unit detection
      let curUnit = 'mA';
      let isCurrentDensity = isCurrentDensityColumn(cLower);

      if (cLower.includes('ua') || cLower.includes('µa') || cLower.includes('microamp')) {
        curUnit = 'uA';
      } else if (
        cLower.includes('(a)') ||
        cLower.includes('[a]') ||
        cLower.includes('/a') ||
        cLower.includes('current/a') ||
        cLower.includes('current (a') ||
        cLower.includes('current [a') ||
        cLower.includes('i (a') ||
        cLower.includes('i [a') ||
        cLower.includes('amp') ||
        cLower === 'a' ||
        cLower.endsWith(' a') ||
        cLower.endsWith('(a)') ||
        cLower.endsWith('[a]') ||
        cLower === 'im'
      ) {
        curUnit = 'A';
      } else {
        // Value-based check: working electrode currents in Amperes are usually small (< 0.05) and not explicitly marked mA
        const maxAbsI = Math.max(...rawPointsList.map(p => Math.abs(p.rawI)));
        if (maxAbsI > 0 && maxAbsI < 0.05 && !cLower.includes('ma')) {
          curUnit = 'A';
        }
      }

      // Normalize points: E to V, I to mA (or maintain mA/cm2 directly)
      const points = rawPointsList.map(p => {
        let normE = potUnit === 'mV' ? p.rawE / 1000 : p.rawE;
        let normI = p.rawI;

        if (curUnit === 'A') {
          normI = p.rawI * 1000;
        } else if (curUnit === 'uA') {
          normI = p.rawI / 1000;
        } else {
          normI = p.rawI;
        }

        return {
          rawE: normE,
          rawI: normI,
          alreadyRHE: isAlreadyRHE,
          isCurrentDensity,
        };
      });

      // Apply despike filter
      const cleaned = despikeAndCleanPoints(points);

      results.push({
        fileName,
        sampleName: pair.sampleName,
        fileType,
        points: cleaned,
        detectedColumns: {
          potentialColName: pair.potHeader,
          currentColName: pair.curHeader,
          potentialUnit: isAlreadyRHE ? 'V vs RHE' : potUnit,
          currentUnit: isCurrentDensity ? 'mA/cm2' : curUnit,
          alreadyRHE: isAlreadyRHE,
          isCurrentDensity,
        },
      });
    }
  }

  return results;
}

/**
 * Parses Excel files (.xlsx, .xls) across all sheets
 */
async function parseExcelFile(file: File, defaultSampleName: string): Promise<ParsedRawData[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const allResults: ParsedRawData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rawRows || rawRows.length < 2) continue;

    try {
      const sheetSampleName =
        workbook.SheetNames.length > 1
          ? `${defaultSampleName}_${sheetName.replace(/\s+/g, '_')}`
          : defaultSampleName;
      const pairs = detectDatasetPairs(rawRows, sheetSampleName);
      const results = extractDatasetsFromPairs(rawRows, pairs, file.name, 'xlsx');
      allResults.push(...results);
    } catch {
      // Ignore sheets without valid electrochemical data pairs
    }
  }

  if (allResults.length === 0) {
    throw new Error('유효한 전위/전류 측정 데이터를 엑셀 파일의 시트에서 찾지 못했습니다.');
  }

  return allResults;
}

/**
 * Parses Delimited Text Files (.csv, .tsv, .txt, .dat)
 */
async function parseDelimitedTextFile(file: File, defaultSampleName: string): Promise<ParsedRawData[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  let delimiter = ',';

  // Sample delimiter detection across non-comment lines
  for (const line of lines.slice(0, 50)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    if (trimmed.includes('\t')) {
      delimiter = '\t';
      break;
    } else if (trimmed.includes(';') && (trimmed.match(/;/g)?.length || 0) > (trimmed.match(/,/g)?.length || 0)) {
      delimiter = ';';
      break;
    } else if (trimmed.includes(',')) {
      delimiter = ',';
      break;
    }
  }

  const parsedRows: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    let parts = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (parts.length === 1 && line.includes(',')) {
      parts = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    } else if (parts.length === 1 && line.includes('\t')) {
      parts = line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
    } else if (parts.length === 1 && line.includes(';')) {
      parts = line.split(';').map(c => c.trim().replace(/^["']|["']$/g, ''));
    } else if (parts.length === 1 && /\s{2,}/.test(line)) {
      parts = line.split(/\s{2,}/).map(c => c.trim());
    } else if (parts.length === 1) {
      parts = line.split(/\s+/).map(c => c.trim());
    }
    parsedRows.push(parts);
  }

  if (parsedRows.length === 0) {
    throw new Error(`[${file.name}] 파일에 데이터가 없습니다.`);
  }

  const pairs = detectDatasetPairs(parsedRows, defaultSampleName);
  const results = extractDatasetsFromPairs(parsedRows, pairs, file.name, 'csv');

  if (results.length === 0) {
    throw new Error(`[${file.name}] 파일에서 유효한 전위/전류 데이터를 읽지 못했습니다.`);
  }

  return results;
}

/**
 * Intelligent filter to remove abnormal electrical spike glitches
 */
export function despikeAndCleanPoints(
  rawPoints: { rawE: number; rawI: number; alreadyRHE?: boolean; isCurrentDensity?: boolean }[]
): { rawE: number; rawI: number; alreadyRHE?: boolean; isCurrentDensity?: boolean }[] {
  if (!rawPoints || rawPoints.length < 5) return rawPoints;

  const despiked: typeof rawPoints = [];
  for (let i = 0; i < rawPoints.length; i++) {
    const cur = rawPoints[i];

    if (i > 0 && i < rawPoints.length - 1) {
      const prev = rawPoints[i - 1];
      const next = rawPoints[i + 1];

      const expectedNeighborAvg = (prev.rawI + next.rawI) / 2;
      const baselineDiff = Math.abs(prev.rawI - next.rawI);
      const spikeDev = Math.abs(cur.rawI - expectedNeighborAvg);

      const isExtremeSpike =
        spikeDev > 5.0 &&
        spikeDev > Math.max(0.5, baselineDiff * 4.0) &&
        Math.sign(cur.rawI - prev.rawI) === Math.sign(cur.rawI - next.rawI);

      if (isExtremeSpike) {
        despiked.push({
          ...cur,
          rawI: expectedNeighborAvg,
        });
        continue;
      }
    }

    despiked.push(cur);
  }

  return despiked;
}

export function cleanSampleNameFromPath(pathStr: string): string {
  if (!pathStr) return 'Sample';
  let clean = pathStr.split(/[\/\\]/).pop() || pathStr;
  clean = clean.replace(/\.(mpr|xlsx|xls|csv|txt|dat|dta)$/i, '');
  clean = clean.replace(/_\d{2}_(CV|LSV|CA|CP)(_C\d{2})?$/i, '');
  clean = clean.replace(/_C\d{2}$/i, '');
  clean = clean.trim();
  return clean || 'Sample';
}
