import React from 'react';
import { Sparkles, SlidersHorizontal, CheckCircle2, ChevronRight, Activity } from 'lucide-react';
import { Sample } from '../types';

interface TafelFittingControlProps {
  sample: Sample | null;
  samples: Sample[];
  onSelectSample: (id: string) => void;
  onUpdateRoi: (minLogJ: number, maxLogJ: number) => void;
  onAutoDetectRoi: () => void;
}

export const TafelFittingControl: React.FC<TafelFittingControlProps> = ({
  sample,
  samples,
  onSelectSample,
  onUpdateRoi,
  onAutoDetectRoi,
}) => {
  if (!sample) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 text-center text-slate-400 text-xs shadow-2xs">
        피팅을 조절할 샘플을 선택하세요.
      </div>
    );
  }

  const { minLogJ, maxLogJ } = sample.tafelRoi;
  const { tafelSlope, rSquared, j0, intercept } = sample.metrics;

  // Scientific notation format for j0
  const formatJ0 = (val: number) => {
    if (val < 0.001 || val > 1000) {
      return val.toExponential(2);
    }
    return val.toFixed(4);
  };

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (val < maxLogJ - 0.1) {
      onUpdateRoi(val, maxLogJ);
    }
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (val > minLogJ + 0.1) {
      onUpdateRoi(minLogJ, val);
    }
  };

  return (
    <div
      id="tafel-fitting-control"
      className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-blue-50 text-blue-600">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-slate-900 text-xs">Tafel Fitting:</span>
              <select
                id="select-tafel-fitting-sample"
                value={sample.id}
                onChange={e => onSelectSample(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-xs font-bold text-blue-700 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
              >
                {samples.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.catalystName})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Auto Detect Button */}
        <button
          id="btn-auto-detect-tafel"
          onClick={onAutoDetectRoi}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition-all shadow-2xs"
          title="R² > 0.995 최적 선형 구간 자동 탐색"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>R² Auto-Detect</span>
        </button>
      </div>

      {/* Interactive Range Slider */}
      <div className="space-y-2 bg-slate-50/70 p-3 rounded-lg border border-slate-200/80">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600 font-medium">
            Range: <span className="font-mono font-bold text-slate-900">log(j) {minLogJ.toFixed(2)} ~ {maxLogJ.toFixed(2)}</span>
            <span className="text-[11px] text-slate-400 ml-1.5">
              (j ≈ {Math.pow(10, minLogJ).toFixed(1)} ~ {Math.pow(10, maxLogJ).toFixed(1)} mA/cm²)
            </span>
          </span>
          <span
            className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
              rSquared >= 0.995
                ? 'bg-emerald-100 text-emerald-800'
                : rSquared >= 0.98
                ? 'bg-blue-100 text-blue-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            R²: {rSquared.toFixed(3)}
          </span>
        </div>

        {/* Dual Range Sliders */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>Start log(j)</span>
              <span className="font-mono">{minLogJ.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="-1.0"
              max="2.0"
              step="0.05"
              value={minLogJ}
              onChange={handleMinChange}
              className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
            />
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>End log(j)</span>
              <span className="font-mono">{maxLogJ.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="-0.5"
              max="2.5"
              step="0.05"
              value={maxLogJ}
              onChange={handleMaxChange}
              className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Live Calculated Metric Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100">
          <span className="text-[10px] font-semibold text-slate-500 block uppercase">Tafel Slope</span>
          <span className="font-mono font-extrabold text-blue-700 text-lg">
            {tafelSlope}
          </span>
          <span className="text-[10px] text-slate-500 ml-1">mV/dec</span>
        </div>

        <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100">
          <span className="text-[10px] font-semibold text-slate-500 block uppercase">Linearity (R²)</span>
          <span className="font-mono font-extrabold text-emerald-700 text-lg">
            {rSquared}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-purple-50/50 border border-purple-100">
          <span className="text-[10px] font-semibold text-slate-500 block uppercase">Exchange j₀</span>
          <span className="font-mono font-bold text-purple-700 text-sm block mt-0.5">
            {formatJ0(j0)}
          </span>
          <span className="text-[9px] text-slate-500">mA/cm²</span>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-[10px] font-semibold text-slate-500 block uppercase">η @ 10 mA/cm²</span>
          <span className="font-mono font-extrabold text-slate-800 text-lg">
            {sample.metrics.eta10 ?? '-'}
          </span>
          <span className="text-[10px] text-slate-500 ml-1">mV</span>
        </div>
      </div>
    </div>
  );
};
