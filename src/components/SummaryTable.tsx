import React from 'react';
import { Download, FileSpreadsheet, Eye, EyeOff } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ExperimentConfig, Sample } from '../types';
import { calculateInterpolatedEta } from '../utils/electrochem';

interface SummaryTableProps {
  samples: Sample[];
  config: ExperimentConfig;
  selectedSampleId: string;
  onSelectSample: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

export const SummaryTable: React.FC<SummaryTableProps> = ({
  samples,
  config,
  selectedSampleId,
  onSelectSample,
  onToggleVisibility,
}) => {
  const targetCurrents =
    config.targetCurrentDensities && config.targetCurrentDensities.length > 0
      ? config.targetCurrentDensities
      : [10, 50, 100];

  // Export Table to CSV
  const handleExportCSV = () => {
    const dynamicEtaHeaders = targetCurrents.map(j => `eta_${j} (mV)`);
    const headers = [
      'Sample Name',
      'Catalyst Material',
      'Ru (Ohm)',
      'iR Comp (%)',
      ...dynamicEtaHeaders,
      'Tafel Slope (mV/dec)',
      'R^2',
      'j0 (mA/cm2)',
      'Tafel ROI Min log(j)',
      'Tafel ROI Max log(j)',
    ];

    const rows = samples.map(s => {
      const dynamicEtas = targetCurrents.map(j => {
        const val =
          s.metrics.customTargetEtas?.[j] ??
          calculateInterpolatedEta(s.data, j, config.reactionType);
        return val !== null ? val : '';
      });

      return [
        s.name,
        s.catalystName,
        s.ruResistance,
        s.irCompensationPercent,
        ...dynamicEtas,
        s.metrics.tafelSlope,
        s.metrics.rSquared,
        s.metrics.j0.toExponential(4),
        s.tafelRoi.minLogJ,
        s.tafelRoi.maxLogJ,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ElectroData_Summary_${config.reactionType}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Table to Excel (.xlsx)
  const handleExportExcel = () => {
    const summaryData = samples.map(s => {
      const rowObj: Record<string, any> = {
        '샘플명 (Sample)': s.name,
        '촉매명 (Catalyst)': s.catalystName,
        '용액 저항 Ru (Ω)': s.ruResistance,
        'iR 보정률 (%)': s.irCompensationPercent,
      };

      targetCurrents.forEach(j => {
        const val =
          s.metrics.customTargetEtas?.[j] ??
          calculateInterpolatedEta(s.data, j, config.reactionType);
        rowObj[`과전압 η_${j} (mV)`] = val !== null ? val : 'N/A';
      });

      rowObj['타펠 슬롭 (mV/dec)'] = s.metrics.tafelSlope;
      rowObj['선형성 R²'] = s.metrics.rSquared;
      rowObj['교환전류밀도 j0 (mA/cm²)'] = s.metrics.j0;
      rowObj['피팅 구간 (min log j)'] = s.tafelRoi.minLogJ;
      rowObj['피팅 구간 (max log j)'] = s.tafelRoi.maxLogJ;
      rowObj['촉매 로딩량 (mg/cm²)'] = s.loadingMgCm2 ?? '';
      rowObj['ECSA (cm²)'] = s.ecsaCm2 ?? '';

      return rowObj;
    });

    const worksheet = XLSX.utils.json_to_sheet(summaryData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Summary Metrics');
    XLSX.writeFile(workbook, `ElectroData_Summary_${config.reactionType}.xlsx`);
  };

  return (
    <div
      id="summary-metrics-table-container"
      className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden"
    >
      {/* Table Header / Action bar */}
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
        <div>
          <h2 className="font-mono font-bold text-slate-900 text-sm tracking-tight">
            Summary Metrics (전기화학 종합 성능 요약표)
          </h2>
          <p className="text-xs text-slate-500">
            과전압(η), 타펠 기울기(Tafel Slope), 용액저항(Ru) 및 결정계수(R²) 일괄 비교
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-download-csv-summary"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
            title="CSV 형식으로 다운로드"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>CSV 저장</span>
          </button>
          <button
            id="btn-download-excel-summary"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
            title="엑셀 (.xlsx) 형식으로 다운로드"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel 저장</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-mono text-slate-600 uppercase tracking-wider">
              <th className="py-2.5 px-4 font-semibold">Sample Name</th>
              <th className="py-2.5 px-3 font-semibold">Catalyst</th>
              <th className="py-2.5 px-3 font-semibold">Ru (Ω)</th>
              
              {/* Dynamic Target j Overpotential Columns */}
              {targetCurrents.map((targetJ, idx) => (
                <th
                  key={`th-target-eta-${targetJ}`}
                  className={`py-2.5 px-3 font-semibold ${
                    idx === 0 ? 'text-blue-700 font-bold' : ''
                  }`}
                  title={`${targetJ} mA/cm²에서의 과전압 (η_${targetJ})`}
                >
                  η_{targetJ} (mV)
                </th>
              ))}

              <th className="py-2.5 px-3 font-semibold text-emerald-700">Tafel Slope (mV/dec)</th>
              <th className="py-2.5 px-3 font-semibold">R²</th>
              <th className="py-2.5 px-3 font-semibold">j₀ (mA/cm²)</th>
              <th
                className="py-2.5 px-4 font-semibold text-center cursor-pointer select-none hover:text-blue-700 transition-colors"
                title="전체 샘플 표시/숨김 일괄 전환 (Click to toggle all)"
                onClick={() => {
                  const anyVisible = samples.some(s => s.visible);
                  samples.forEach(s => {
                    if (s.visible === anyVisible) {
                      onToggleVisibility(s.id);
                    }
                  });
                }}
              >
                <div className="inline-flex items-center justify-center gap-1">
                  <span>STATUS</span>
                  <span className="text-[10px] text-slate-400 hover:text-blue-600">⇄</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {samples.length === 0 ? (
              <tr>
                <td colSpan={7 + targetCurrents.length} className="py-8 text-center text-slate-400">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              samples.map(sample => {
                const isSelected = sample.id === selectedSampleId;
                const { metrics } = sample;

                return (
                  <tr
                    key={sample.id}
                    onClick={() => onSelectSample(sample.id)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 font-medium'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Sample Name */}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: sample.color }}
                        />
                        <span className="font-bold text-slate-900 font-mono">
                          {sample.name}
                        </span>
                      </div>
                    </td>

                    {/* Catalyst Material */}
                    <td className="py-2.5 px-3 text-slate-600 font-medium">
                      {sample.catalystName}
                    </td>

                    {/* Ru */}
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      {sample.ruResistance.toFixed(2)}
                    </td>

                    {/* Dynamic Target j Overpotentials */}
                    {targetCurrents.map((targetJ, idx) => {
                      const etaVal =
                        metrics.customTargetEtas?.[targetJ] ??
                        calculateInterpolatedEta(sample.data, targetJ, config.reactionType);

                      return (
                        <td
                          key={`td-target-eta-${sample.id}-${targetJ}`}
                          className={`py-2.5 px-3 font-mono ${
                            idx === 0
                              ? 'font-bold text-blue-700 text-sm'
                              : 'text-slate-800'
                          }`}
                        >
                          {etaVal !== null ? `${etaVal}` : '-'}
                        </td>
                      );
                    })}

                    {/* Tafel slope */}
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-700 text-sm">
                      {metrics.tafelSlope}
                    </td>

                    {/* R^2 */}
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                          metrics.rSquared >= 0.995
                            ? 'bg-emerald-100 text-emerald-800'
                            : metrics.rSquared >= 0.98
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {metrics.rSquared.toFixed(3)}
                      </span>
                    </td>

                    {/* j0 */}
                    <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                      {metrics.j0 < 0.001 ? metrics.j0.toExponential(2) : metrics.j0.toFixed(4)}
                    </td>

                    {/* Status Toggle Cell */}
                    <td
                      className="py-2.5 px-4 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleVisibility(sample.id);
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleVisibility(sample.id);
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 select-none ${
                          sample.visible
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                        title={sample.visible ? '클릭하여 숨김 (Click to Hide)' : '클릭하여 표시 (Click to Show Active)'}
                      >
                        {sample.visible ? (
                          <>
                            <Eye className="w-3 h-3 text-emerald-600" />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3 text-slate-400" />
                            <span>Hidden</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
