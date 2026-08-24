import React, { useRef, useState } from 'react';
import {
  Upload,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Settings2,
  FileSpreadsheet,
  Layers,
  ChevronDown,
  Info,
  CheckCircle2,
  X,
} from 'lucide-react';
import { ExperimentConfig, ReactionType, ReferenceElectrodeType, Sample } from '../types';
import { REFERENCE_ELECTRODES, REACTION_PRESETS } from '../utils/electrochem';

interface SidebarProps {
  config: ExperimentConfig;
  onChangeConfig: (newConfig: ExperimentConfig) => void;
  samples: Sample[];
  selectedSampleId: string;
  onSelectSample: (id: string) => void;
  onToggleSampleVisibility: (id: string) => void;
  onUpdateSample: (id: string, updates: Partial<Sample>) => void;
  onDeleteSample: (id: string) => void;
  onFilesUpload: (files: FileList | File[]) => void;
  onAddBlankSample: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  config,
  onChangeConfig,
  samples,
  selectedSampleId,
  onSelectSample,
  onToggleSampleVisibility,
  onUpdateSample,
  onDeleteSample,
  onFilesUpload,
  onAddBlankSample,
  isOpenMobile,
  onCloseMobile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [targetJInput, setTargetJInput] = useState(config.targetCurrentDensities.join(', '));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesUpload(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesUpload(e.target.files);
      e.target.value = '';
    }
  };

  const handleTargetJBlur = () => {
    const parts = targetJInput
      .split(',')
      .map(p => parseFloat(p.trim()))
      .filter(n => !isNaN(n) && n > 0);
    if (parts.length > 0) {
      onChangeConfig({ ...config, targetCurrentDensities: parts });
    } else {
      setTargetJInput(config.targetCurrentDensities.join(', '));
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-80 sm:w-88 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Brand Header (Desktop) */}
        <div className="hidden lg:flex items-center gap-3 p-5 border-b border-slate-100">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-base shadow-2xs">
            E
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 font-mono">
              ElectroData Lab
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
              RESEARCH PLATFORM
            </p>
          </div>
        </div>

        {/* Mobile Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between lg:hidden bg-white">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-xs">
              E
            </div>
            <span>Parameters & Data</span>
          </div>
          <button
            onClick={onCloseMobile}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs text-slate-700">
          {/* SECTION 1: DATA INGESTION */}
          <div className="bg-blue-50/80 border border-blue-100 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-900 uppercase text-[10px] tracking-wider flex items-center gap-1.5 font-mono">
                <Upload className="w-3.5 h-3.5 text-blue-600" />
                Data Ingestion
              </span>
              <span className="text-[10px] text-blue-500 font-mono">CSV · MPR</span>
            </div>

            {/* Drag & Drop Area */}
            <div
              id="drop-zone-lsv"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-md p-3.5 text-center cursor-pointer transition-all bg-white/80 ${
                isDragging
                  ? 'border-blue-500 bg-blue-100/80'
                  : 'border-blue-200 hover:border-blue-400 hover:bg-blue-100/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.mpr,.txt,.dat"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <div className="w-8 h-8 mx-auto mb-1.5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Upload className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-blue-700">
                Excel, MPR, CSV 데이터 업로드
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                단일/다중 곡선 엑셀 자동 분리 · Bio-Logic .mpr 지원
              </p>
            </div>
          </div>

          {/* SECTION 2: EXPERIMENTAL PARAMETERS */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-slate-900 tracking-wider uppercase text-[11px] flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-slate-600" />
                Parameters
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Nernst & RHE</span>
            </div>

            {/* Reaction Type */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700">
                Reaction Target
              </label>
              <select
                id="select-reaction-type"
                value={config.reactionType}
                onChange={e => onChangeConfig({ ...config, reactionType: e.target.value as ReactionType })}
                className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium"
              >
                <option value="OER">OER (Oxygen Evolution, E°=1.23 V)</option>
                <option value="ORR">ORR (Oxygen Reduction, E°=1.23 V)</option>
                <option value="CUSTOM">Custom Reaction</option>
              </select>
            </div>

            {/* Reference Electrode */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700">
                Reference Electrode
              </label>
              <select
                id="select-reference-electrode"
                value={config.referenceElectrode}
                onChange={e =>
                  onChangeConfig({ ...config, referenceElectrode: e.target.value as ReferenceElectrodeType })
                }
                className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium"
              >
                {Object.entries(REFERENCE_ELECTRODES).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Grid 2-col: pH & Ru */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700">
                  pH
                </label>
                <input
                  id="input-ph"
                  type="number"
                  step="0.1"
                  value={config.pH}
                  onChange={e => onChangeConfig({ ...config, pH: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono font-medium"
                  placeholder="14.0"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Ru (Ω)
                </label>
                <input
                  id="input-ru-resistance"
                  type="number"
                  step="0.05"
                  value={config.defaultRu}
                  onChange={e => {
                    const newRu = parseFloat(e.target.value) || 0;
                    onChangeConfig({ ...config, defaultRu: newRu });
                  }}
                  className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono font-medium"
                  placeholder="2.5"
                />
              </div>
            </div>

            {/* iR-Drop Compensation % & Area */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700">
                  iR-Comp (%)
                </label>
                <input
                  id="input-ir-comp-percent"
                  type="number"
                  step="5"
                  min="0"
                  max="100"
                  value={config.defaultCompensation}
                  onChange={e =>
                    onChangeConfig({ ...config, defaultCompensation: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono font-medium"
                  placeholder="85"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Area (cm²)
                </label>
                <input
                  id="input-geometric-area"
                  type="number"
                  step="0.01"
                  min="0.001"
                  value={config.geometricArea}
                  onChange={e =>
                    onChangeConfig({ ...config, geometricArea: parseFloat(e.target.value) || 0.071 })
                  }
                  className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono font-medium"
                  placeholder="0.071"
                />
              </div>
            </div>

            {/* Target j (mA/cm2) */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700">
                Target j (mA/cm²)
              </label>
              <input
                id="input-target-j"
                type="text"
                value={targetJInput}
                onChange={e => setTargetJInput(e.target.value)}
                onBlur={handleTargetJBlur}
                className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono"
                placeholder="10, 50, 100"
              />
            </div>

            {/* iR compensation toggle switch */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-700">
                Apply iR-Drop Correction
              </span>
              <button
                type="button"
                onClick={() => onChangeConfig({ ...config, showIRCompensated: !config.showIRCompensated })}
                className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                  config.showIRCompensated ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform ${
                    config.showIRCompensated ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* SECTION 3: SAMPLES LIST */}
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-slate-900 tracking-wider uppercase text-[11px] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-600" />
                Active Samples ({samples.length})
              </span>
              <button
                id="btn-add-sample"
                onClick={onAddBlankSample}
                className="p-1 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                title="Add Blank Sample"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
              {samples.length === 0 ? (
                <div className="p-3 text-center rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs">
                  No samples uploaded yet.
                </div>
              ) : (
                samples.map(sample => {
                  const isSelected = sample.id === selectedSampleId;
                  return (
                    <div
                      key={sample.id}
                      onClick={() => onSelectSample(sample.id)}
                      className={`group relative flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {/* Left: Checkbox + Color Dot + Name */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={sample.visible}
                          onChange={e => {
                            e.stopPropagation();
                            onToggleSampleVisibility(sample.id);
                          }}
                          className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                        />
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: sample.color }}
                        />
                        <div className="truncate flex-1">
                          <p className="font-semibold text-slate-800 truncate text-[11px]">
                            {sample.name}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {sample.catalystName}
                          </p>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {sample.metrics.eta10 !== null && (
                          <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-100/60 px-1.5 py-0.5 rounded">
                            {sample.metrics.eta10} mV
                          </span>
                        )}
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onDeleteSample(sample.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 transition-opacity"
                          title="Delete Sample"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer info (Clean Minimalism) */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-500 flex items-center justify-between font-mono">
          <span>E_RHE = E + E°_ref + 0.0591·pH</span>
          <span className="text-slate-400">READY</span>
        </div>
      </aside>
    </>
  );
};
