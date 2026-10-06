import React, { useRef, useState, useEffect } from 'react';
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
  CheckSquare,
  Square,
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
  onDeleteMultipleSamples?: (ids: string[]) => void;
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
  onDeleteMultipleSamples,
  onFilesUpload,
  onAddBlankSample,
  isOpenMobile,
  onCloseMobile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [targetJInput, setTargetJInput] = useState(config.targetCurrentDensities.join(', '));
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());

  // Clean up selectedForBatch when samples list changes
  useEffect(() => {
    setSelectedForBatch(prev => {
      const sampleIdSet = new Set(samples.map(s => s.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (sampleIdSet.has(id)) next.add(id);
      }
      return next;
    });
  }, [samples]);

  useEffect(() => {
    setTargetJInput(config.targetCurrentDensities.join(', '));
  }, [config.targetCurrentDensities]);

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
    const parsed = targetJInput
      .split(',')
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n) && n > 0);
    if (parsed.length > 0) {
      onChangeConfig({ ...config, targetCurrentDensities: parsed });
    } else {
      setTargetJInput(config.targetCurrentDensities.join(', '));
    }
  };

  const handleTargetJKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTargetJBlur();
    }
  };

  // Batch selection handlers
  const isAllSelected = samples.length > 0 && selectedForBatch.size === samples.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedForBatch(new Set());
    } else {
      setSelectedForBatch(new Set(samples.map(s => s.id)));
    }
  };

  const handleToggleBatchItem = (id: string) => {
    setSelectedForBatch(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = () => {
    if (selectedForBatch.size === 0) return;
    const idsToDelete = Array.from(selectedForBatch);
    if (onDeleteMultipleSamples) {
      onDeleteMultipleSamples(idsToDelete);
    } else {
      idsToDelete.forEach(id => onDeleteSample(id));
    }
    setSelectedForBatch(new Set());
  };

  const handleDeleteAll = () => {
    if (samples.length === 0) return;
    const allIds = samples.map(s => s.id);
    if (onDeleteMultipleSamples) {
      onDeleteMultipleSamples(allIds);
    } else {
      allIds.forEach(id => onDeleteSample(id));
    }
    setSelectedForBatch(new Set());
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="sidebar-main"
        className={`fixed lg:static top-0 left-0 h-full w-80 bg-white border-r border-slate-200 z-50 lg:z-10 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Mobile Header Close */}
        <div className="lg:hidden p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="font-bold text-slate-800">Experiment Controls</span>
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Configuration Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* SECTION 1: DATA INGESTION */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-slate-900 tracking-wider uppercase text-[11px] flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                Data Files
              </span>
              <span className="text-[10px] text-slate-400 font-mono">.xlsx, .csv, .txt</span>
            </div>

            {/* Drag & Drop File Upload Box */}
            <div
              id="file-dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-3.5 rounded-xl border-2 border-dashed text-center transition-all cursor-pointer select-none bg-blue-50/40 ${
                isDragging
                  ? 'border-blue-500 bg-blue-100/80'
                  : 'border-blue-200 hover:border-blue-400 hover:bg-blue-100/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.txt,.dat"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <div className="w-8 h-8 mx-auto mb-1.5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Upload className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-blue-700">
                엑셀 (.xlsx, .xls) 또는 CSV 파일 업로드
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                다중 곡선 및 다중 열(X-Y1, Y2, ...) 자동 분리 인식 지원
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
                className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
              >
                {Object.entries(REFERENCE_ELECTRODES).map(([type, item]) => (
                  <option key={type} value={type}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            {/* pH Value */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Electrolyte pH
                </label>
                <span className="text-[10px] text-slate-500 font-mono">
                  +{(0.05916 * config.pH).toFixed(3)} V Nernst
                </span>
              </div>
              <input
                id="input-ph-value"
                type="number"
                step="0.1"
                min="0"
                max="14"
                value={config.pH}
                onChange={e => onChangeConfig({ ...config, pH: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono font-medium"
                placeholder="14.0"
              />
            </div>

            {/* Ru Resistance (Ohms) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Ru Resistance (Ω)
                </label>
                <span className="text-[10px] text-slate-400 font-mono">Ohmic drop</span>
              </div>
              <input
                id="input-ru-resistance"
                type="number"
                step="0.1"
                min="0"
                value={config.defaultRu}
                onChange={e => onChangeConfig({ ...config, defaultRu: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono font-medium"
                placeholder="2.5"
              />
            </div>

            {/* Default Compensation % & Electrode Area */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Compensation (%)
                </label>
                <input
                  id="input-compensation-percent"
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
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Target j (mA/cm²)
                </label>
                <span className="text-[10px] text-slate-400 font-mono">쉼표 구분</span>
              </div>
              <input
                id="input-target-j"
                type="text"
                value={targetJInput}
                onChange={e => setTargetJInput(e.target.value)}
                onBlur={handleTargetJBlur}
                onKeyDown={handleTargetJKeyDown}
                className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono font-medium"
                placeholder="10, 43.2, 50, 100"
                title="과전압 계산 목표 전류밀도 목록 (예: 10, 43.2, 50, 100)"
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

          {/* SECTION 3: SAMPLES LIST & BATCH OPERATIONS */}
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900 tracking-wider uppercase text-[11px] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-600" />
                  Active Samples ({samples.length})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  id="btn-add-sample"
                  onClick={onAddBlankSample}
                  className="p-1 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Add Blank Sample"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Batch Selection Toolbar */}
            {samples.length > 0 && (
              <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-slate-100 text-[11px] border border-slate-200">
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <span>전체 선택 ({selectedForBatch.size}/{samples.length})</span>
                </label>

                {selectedForBatch.size > 0 ? (
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] shadow-2xs transition-colors"
                    title="선택한 샘플 일괄 삭제"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>선택 삭제 ({selectedForBatch.size})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    className="text-[10px] text-slate-400 hover:text-red-600 transition-colors"
                    title="모든 샘플 삭제"
                  >
                    전체 삭제
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
              {samples.length === 0 ? (
                <div className="p-4 text-center rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs">
                  등록된 그래프 데이터가 없습니다.<br />위 업로드 영역에 엑셀/CSV 파일을 넣어주세요.
                </div>
              ) : (
                samples.map(sample => {
                  const isSelected = sample.id === selectedSampleId;
                  const isCheckedForBatch = selectedForBatch.has(sample.id);

                  return (
                    <div
                      key={sample.id}
                      onClick={() => onSelectSample(sample.id)}
                      className={`group relative flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                          : isCheckedForBatch
                          ? 'border-red-300 bg-red-50/30'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {/* Left: Multi-select Checkbox + Visibility Eye + Color Dot + Name */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {/* Batch Selection Checkbox */}
                        <input
                          type="checkbox"
                          checked={isCheckedForBatch}
                          onChange={e => {
                            e.stopPropagation();
                            handleToggleBatchItem(sample.id);
                          }}
                          className="w-3.5 h-3.5 rounded text-red-600 focus:ring-red-500 border-slate-300 cursor-pointer shrink-0"
                          title="일괄 삭제용 선택"
                        />

                        {/* Chart Visibility Toggle Button */}
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onToggleSampleVisibility(sample.id);
                          }}
                          className="p-0.5 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                          title={sample.visible ? '그래프 숨기기' : '그래프 보이기'}
                        >
                          {sample.visible ? (
                            <Eye className="w-3.5 h-3.5 text-blue-600" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                          )}
                        </button>

                        {/* Color Dot */}
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: sample.color }}
                        />

                        {/* Name & Catalyst */}
                        <div className="truncate flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate text-[11px]">
                            {sample.name}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {sample.catalystName}
                          </p>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        {/* Line Style Toggle Button */}
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            const nextStyle =
                              sample.lineStyle === 'dashdot'
                                ? 'dashed'
                                : sample.lineStyle === 'dashed'
                                ? 'solid'
                                : 'dashdot';
                            onUpdateSample(sample.id, { lineStyle: nextStyle });
                          }}
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors"
                          title="선 스타일 변경 (solid / dashed / dash-dot)"
                        >
                          {sample.lineStyle === 'dashdot' ? '―·―' : sample.lineStyle === 'dashed' ? '---' : '───'}
                        </button>

                        {sample.metrics.eta10 !== null && (
                          <span
                            className="font-mono text-[10px] font-bold text-blue-700 bg-blue-100/60 px-1.5 py-0.5 rounded"
                            title={`η₁₀ = ${sample.metrics.eta10} mV`}
                          >
                            {sample.metrics.eta10} mV
                          </span>
                        )}

                        {/* Individual Delete Button */}
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onDeleteSample(sample.id);
                          }}
                          className="p-1 text-slate-300 hover:text-red-600 transition-colors"
                          title="이 샘플 삭제"
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

        {/* Footer info */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-500 flex items-center justify-between font-mono">
          <span>E_RHE = E + E°_ref + 0.0591·pH</span>
          <span className="text-slate-400">READY</span>
        </div>
      </aside>
    </>
  );
};
