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
 * Intelligent file parser that automatically routes to CSV, XLSX, MPR, or TXT
 */
export async function parseElectrochemicalFile(file: File): Promise<ParsedRawData> {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();
  const sampleName = fileName.replace(/\.[^/.]+$/, '').replace(/[_-\s]+/g, '_');

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    return parseExcelFile(file, sampleName);
  } else if (lowerName.endsWith('.mpr')) {
    return parseMprFile(file, sampleName);
  } else {
    // csv, txt, dat, dta, etc.
    return parseDelimitedTextFile(file, sampleName);
  }
}

/**
 * Parses Bio-Logic .mpr files (both binary EC-Lab formats and ASCII text dumps)
 */
async function parseMprFile(file: File, sampleName: string): Promise<ParsedRawData> {
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
    return parseTextData(text, file.name, sampleName, 'mpr');
  }

  // Binary MPR parsing (Bio-Logic EC-Lab / VMP format)
  try {
    const dataView = new DataView(buffer);
    const textDecoder = new TextDecoder('latin1');
    const fullText = textDecoder.decode(buffer);

    // Look for standard Bio-Logic column signatures in header: Ewe/V, <I>/mA, I/mA, etc.
    const hasEwe = fullText.includes('Ewe') || fullText.includes('Ece') || fullText.includes('control/V');
    const hasCurrent = fullText.includes('I/mA') || fullText.includes('<I>/mA') || fullText.includes('I (A)');

    // Attempt to extract data block if structure follows standard VMP3 format
    // Bio-Logic MPR header contains modules: 'VMP data' or similar offset headers
    let extractedPoints: { rawE: number; rawI: number }[] = [];

    // Search for "VMP Data" or similar marker
    const dataMarker = 'VMP Data';
    const markerIndex = fullText.indexOf(dataMarker);

    if (markerIndex !== -1 && markerIndex + 100 < buffer.byteLength) {
      // Find number of points (usually 4 bytes int32 after marker header)
      let offset = markerIndex + 24;
      if (offset + 8 < buffer.byteLength) {
        const numRows = dataView.getInt32(offset, true);
        const numCols = dataView.getInt16(offset + 4, true);

        if (numRows > 5 && numRows < 500000 && numCols > 1 && numCols < 50) {
          let dataOffset = offset + 8;
          // Loop through rows
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

    // Fallback: Scan float32 / float64 sequence patterns in binary buffer if standard VMP header offset varied
    if (extractedPoints.length < 5) {
      extractedPoints = scanBinaryFloatPairs(dataView);
    }

    if (extractedPoints.length > 5) {
      return {
        fileName: file.name,
        sampleName,
        fileType: 'mpr',
        points: extractedPoints,
        detectedColumns: {
          potentialColName: 'Ewe (V) [Bio-Logic Binary]',
          currentColName: '<I> (mA) [Bio-Logic Binary]',
          potentialUnit: 'V',
          currentUnit: 'mA',
        },
      };
    }
  } catch (err) {
    console.warn('Binary MPR parsing fallback to text scan:', err);
  }

  // Fallback to text parsing
  const fallbackText = new TextDecoder('latin1').decode(buffer);
  return parseTextData(fallbackText, file.name, sampleName, 'mpr');
}

/**
 * Helper to scan float32 / float64 pairs in binary buffers for potentiometer data
 */
function scanBinaryFloatPairs(dataView: DataView): { rawE: number; rawI: number }[] {
  const points: { rawE: number; rawI: number }[] = [];
  const len = dataView.byteLength;

  // Search for typical potential range (-2.5V to +3.5V) and current range (-1000 to +1000 mA)
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
      if (points.length >= 10000) break;
    }
  }

  // Sort by potential ascending if needed or keep chronological sweep
  return points.length >= 10 ? points : [];
}

/**
 * Parses Excel files (.xlsx, .xls)
 */
async function parseExcelFile(file: File, sampleName: string): Promise<ParsedRawData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('엑셀 파일에 데이터가 없습니다.');
  }

  // Find header row
  let headerRowIndex = -1;
  let potColIndex = -1;
  let curColIndex = -1;
  let potUnit = 'V';
  let curUnit = 'mA';
  let potColName = 'Potential';
  let curColName = 'Current';

  for (let r = 0; r < Math.min(25, rawRows.length); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim().toLowerCase();
      if (isPotentialColumn(cell)) {
        potColIndex = c;
        potColName = String(row[c]);
        potUnit = cell.includes('mv') ? 'mV' : 'V';
      }
      if (isCurrentColumn(cell)) {
        curColIndex = c;
        curColName = String(row[c]);
        if (cell.includes('ua') || cell.includes('µa')) curUnit = 'uA';
        else if (cell.includes('a') && !cell.includes('ma')) curUnit = 'A';
        else curUnit = 'mA';
      }
    }

    if (potColIndex !== -1 && curColIndex !== -1) {
      headerRowIndex = r;
      break;
    }
  }

  // If no explicit header names found, default to col 0 and 1 if numbers
  if (headerRowIndex === -1) {
    headerRowIndex = 0;
    potColIndex = 0;
    curColIndex = 1;
  }

  const points: { rawE: number; rawI: number }[] = [];
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;
    const rawPot = parseFloat(row[potColIndex]);
    const rawCur = parseFloat(row[curColIndex]);

    if (!isNaN(rawPot) && !isNaN(rawCur)) {
      const normE = potUnit === 'mV' ? rawPot / 1000 : rawPot;
      let normI = rawCur;
      if (curUnit === 'A') normI = rawCur * 1000;
      else if (curUnit === 'uA') normI = rawCur / 1000;

      points.push({ rawE: normE, rawI: normI });
    }
  }

  if (points.length === 0) {
    throw new Error('유효한 전위/전류 수치 데이터를 찾지 못했습니다.');
  }

  return {
    fileName: file.name,
    sampleName,
    fileType: 'xlsx',
    points,
    detectedColumns: {
      potentialColName: potColName,
      currentColName: curColName,
      potentialUnit: potUnit,
      currentUnit: curUnit,
    },
  };
}

/**
 * Parses Delimited Text Files (.csv, .tsv, .txt, .dat)
 */
async function parseDelimitedTextFile(file: File, sampleName: string): Promise<ParsedRawData> {
  const text = await file.text();
  return parseTextData(text, file.name, sampleName, 'csv');
}

/**
 * Core text parser for CSV, TSV, WonATech, Gamry DTA, Ivium, Bio-Logic ASCII
 */
export function parseTextData(
  text: string,
  fileName: string,
  sampleName: string,
  fileType: 'csv' | 'txt' | 'mpr' = 'csv'
): ParsedRawData {
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

  let headerRowIndex = -1;
  let potColIndex = -1;
  let curColIndex = -1;
  let potUnit = 'V';
  let curUnit = 'mA';
  let potColName = 'Potential (V)';
  let curColName = 'Current (mA)';

  // Find header row by scanning first 50 lines
  for (let i = 0; i < Math.min(60, lines.length); i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith(';')) continue;

    // Split line
    let cols = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length === 1 && line.includes(',')) {
      cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    } else if (cols.length === 1 && line.includes('\t')) {
      cols = line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
    } else if (cols.length === 1) {
      cols = line.split(/\s+/).map(c => c.trim());
    }

    for (let c = 0; c < cols.length; c++) {
      const colText = cols[c].toLowerCase();
      if (isPotentialColumn(colText)) {
        potColIndex = c;
        potColName = cols[c];
        potUnit = colText.includes('mv') ? 'mV' : 'V';
      }
      if (isCurrentColumn(colText)) {
        curColIndex = c;
        curColName = cols[c];
        if (colText.includes('ua') || colText.includes('µa')) curUnit = 'uA';
        else if (colText.includes('(a)') || colText.endsWith('/a') || colText === 'current a') curUnit = 'A';
        else curUnit = 'mA';
      }
    }

    if (potColIndex !== -1 && curColIndex !== -1) {
      headerRowIndex = i;
      break;
    }
  }

  // Fallback: If no header keywords matched, check if line 0 is numeric or scan first 2 numeric columns
  if (headerRowIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/[\t,;\s]+/).map(p => parseFloat(p));
      const validNumCount = parts.filter(n => !isNaN(n)).length;
      if (validNumCount >= 2) {
        headerRowIndex = i - 1;
        potColIndex = 0;
        curColIndex = 1;
        break;
      }
    }
  }

  const points: { rawE: number; rawI: number }[] = [];
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    let parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length <= 1) {
      parts = line.split(/[\t,;\s]+/).map(p => p.trim());
    }

    if (parts.length > Math.max(potColIndex, curColIndex)) {
      const rawE = parseFloat(parts[potColIndex]);
      const rawI = parseFloat(parts[curColIndex]);

      if (!isNaN(rawE) && !isNaN(rawI)) {
        const normE = potUnit === 'mV' ? rawE / 1000 : rawE;
        let normI = rawI;
        if (curUnit === 'A') normI = rawI * 1000;
        else if (curUnit === 'uA') normI = rawI / 1000;

        points.push({ rawE: normE, rawI: normI });
      }
    }
  }

  if (points.length === 0) {
    throw new Error(`[${fileName}] 파일에서 유효한 전위/전류 데이터를 파싱할 수 없습니다.`);
  }

  return {
    fileName,
    sampleName,
    fileType,
    points,
    detectedColumns: {
      potentialColName: potColName,
      currentColName: curColName,
      potentialUnit: potUnit,
      currentUnit: curUnit,
    },
  };
}

function isPotentialColumn(name: string): boolean {
  return (
    name.includes('ewe') ||
    name.includes('potential') ||
    name.includes('volt') ||
    name.includes('e (v)') ||
    name.includes('e/v') ||
    name.includes('v vs') ||
    name.includes('e_we') ||
    name.includes('v_meas') ||
    name.startsWith('e') ||
    name === 'v' ||
    name === 'u'
  );
}

function isCurrentColumn(name: string): boolean {
  return (
    name.includes('<i') ||
    name.includes('i/ma') ||
    name.includes('i (ma)') ||
    name.includes('i (a)') ||
    name.includes('current') ||
    name.includes('i_meas') ||
    name.includes('cur') ||
    name.includes('j (ma') ||
    name.includes('density') ||
    name.includes('i (µa)') ||
    name.includes('i (ua)') ||
    name === 'i' ||
    name === 'j'
  );
}
