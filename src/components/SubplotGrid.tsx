import React from 'react';
import { Sparkles, SlidersHorizontal, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { ExperimentConfig, Sample } from '../types';

interface SubplotGridProps {
  samples: Sample[];
  config: ExperimentConfig;
  selectedSampleId: string;
  onSelectSample: (id: string) => void;
  onAutoDetectRoi: (sampleId: string) => void;
}

export const SubplotGrid: React.FC<SubplotGridProps> = ({
  samples,
  config,
  selectedSampleId,
  onSelectSample,
  onAutoDetectRoi,
}) => {
  const visibleSamples = samples.filter(s => s.visible);

  if (visibleSamples.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
        표시할 샘플이 없습니다. 사이드바에서 샘플을 활성화하세요.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {visibleSamples.map(sample => {
        const isSelected = sample.id === selectedSampleId;
        const { metrics, tafelRoi } = sample;

        // Mini sparkline coordinates
        const lsvPoints = sample.data.slice(0, 100);
        const minE = Math.min(...lsvPoints.map(p => p.potentialRHE));
        const maxE = Math.max(...lsvPoints.map(p => p.potentialRHE));
        const minJ = Math.min(...lsvPoints.map(p => p.currentDensity));
        const maxJ = Math.max(...lsvPoints.map(p => p.currentDensity));

        const width = 260;
        const height = 90;

        const pathStr = lsvPoints
          .map((pt, i) => {
            const x = ((pt.potentialRHE - minE) / (maxE - minE || 1)) * (width - 10) + 5;
            const y = height - 5 - ((pt.currentDensity - minJ) / (maxJ - minJ || 1)) * (height - 10);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' L ');

        return (
          <div
            key={sample.id}
            onClick={() => onSelectSample(sample.id)}
            className={`bg-white rounded-xl border p-4 transition-all cursor-pointer flex flex-col justify-between shadow-2xs ${
              isSelected
                ? 'border-blue-500 ring-2 ring-blue-100 shadow-md'
                : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
            }`}
          >
            {/* Top Card Header */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: sample.color }} />
                <div className="truncate">
                  <h3 className="font-bold text-slate-900 text-sm truncate">{sample.name}</h3>
                  <p className="text-[11px] text-slate-500 truncate">{sample.catalystName}</p>
                </div>
              </div>

              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                Ru: {sample.ruResistance} Ω
              </span>
            </div>

            {/* Mini SVG Sparkline */}
            <div className="w-full bg-slate-50/70 border border-slate-100 rounded-lg p-1.5 my-2 flex items-center justify-center">
              <svg width={width} height={height} className="overflow-visible">
                {/* 10 mA/cm2 line */}
                {maxJ >= 10 && (
                  <line
                    x1="5"
                    y1={height - 5 - ((10 - minJ) / (maxJ - minJ || 1)) * (height - 10)}
                    x2={width - 5}
                    y2={height - 5 - ((10 - minJ) / (maxJ - minJ || 1)) * (height - 10)}
                    stroke="#cbd5e1"
                    strokeDasharray="3,3"
                  />
                )}
                <path d={`M ${pathStr}`} fill="none" stroke={sample.color} strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>

            {/* Performance Metrics Pills */}
            <div className="grid grid-cols-3 gap-1.5 text-center mt-1">
              <div className="bg-blue-50/60 border border-blue-100 rounded p-1.5">
                <span className="text-[9px] text-slate-500 block">η @ 10 mA</span>
                <span className="font-mono font-bold text-blue-700 text-xs">
                  {metrics.eta10 ? `${metrics.eta10} mV` : '-'}
                </span>
              </div>
              <div className="bg-emerald-50/60 border border-emerald-100 rounded p-1.5">
                <span className="text-[9px] text-slate-500 block">Tafel Slope</span>
                <span className="font-mono font-bold text-emerald-700 text-xs">
                  {metrics.tafelSlope}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
                <span className="text-[9px] text-slate-500 block">R² Linearity</span>
                <span className="font-mono font-bold text-slate-800 text-xs">
                  {metrics.rSquared}
                </span>
              </div>
            </div>

            {/* Card Footer */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-xs">
              <span className="text-[11px] text-slate-500 font-mono">
                ROI: {tafelRoi.minLogJ} ~ {tafelRoi.maxLogJ}
              </span>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onAutoDetectRoi(sample.id);
                }}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold text-[11px]"
              >
                <Sparkles className="w-3 h-3" />
                <span>Auto-Fit</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
