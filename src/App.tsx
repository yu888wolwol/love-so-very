import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LSVChart } from './components/LSVChart';
import { TafelChart } from './components/TafelChart';
import { TafelFittingControl } from './components/TafelFittingControl';
import { SubplotGrid } from './components/SubplotGrid';
import { SummaryTable } from './components/SummaryTable';
import { ReportModal } from './components/ReportModal';
import { ExperimentConfig, LayoutMode, Sample } from './types';
import { DEFAULT_EXPERIMENT_CONFIG, SAMPLE_PRESETS, SAMPLE_COLORS, getPresetsForReaction } from './utils/presets';
import {
  calculateDataPoints,
  calculateMetrics,
  recalculateSampleMetrics,
  autoDetectTafelRoi,
} from './utils/electrochem';
import { parseElectrochemicalFile } from './utils/parsers';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export function App() {
  const [config, setConfig] = useState<ExperimentConfig>(DEFAULT_EXPERIMENT_CONFIG);
  const [samples, setSamples] = useState<Sample[]>(SAMPLE_PRESETS);
  const [selectedSampleId, setSelectedSampleId] = useState<string>(SAMPLE_PRESETS[0]?.id || '');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('lsv');

  // Modals & Mobile sidebar states
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Re-calculate sample metrics when experiment configuration changes
  useEffect(() => {
    setSamples(prevSamples =>
      prevSamples.map(sample => recalculateSampleMetrics(sample, config))
    );
  }, [
    config.reactionType,
    config.referenceElectrode,
    config.pH,
    config.defaultRu,
    config.defaultCompensation,
    config.geometricArea,
    config.showIRCompensated,
    config.targetCurrentDensities,
  ]);

  // Selected sample instance
  const selectedSample = samples.find(s => s.id === selectedSampleId) || samples[0] || null;

  // Handle Preset load
  const handleLoadPreset = (reactionType: 'OER' | 'ORR') => {
    const newPresets = getPresetsForReaction(reactionType);
    setConfig(prev => ({
      ...prev,
      reactionType,
      pH: 14.0,
    }));
    setSamples(newPresets);
    setSelectedSampleId(newPresets[0]?.id || '');
    showToast(`${reactionType} 반응 연구 프리셋 데이터셋이 로드되었습니다.`);
  };

  // Handle Files Upload (.csv, .xlsx, .mpr, .txt)
  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    let addedCount = 0;
    const newSamples: Sample[] = [];

    for (const file of files) {
      try {
        const parsed = await parseElectrochemicalFile(file);
        const data = calculateDataPoints(parsed.points, config, config.defaultRu, config.defaultCompensation);
        const tafelRoi = autoDetectTafelRoi(data);
        const metrics = calculateMetrics(data, tafelRoi, config);
        const newColor = SAMPLE_COLORS[(samples.length + newSamples.length) % SAMPLE_COLORS.length];

        const newSample: Sample = {
          id: `sample-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: parsed.sampleName,
          catalystName: `${parsed.sampleName} Catalyst`,
          color: newColor,
          visible: true,
          fileName: parsed.fileName,
          fileType: parsed.fileType,
          ruResistance: config.defaultRu,
          irCompensationPercent: config.defaultCompensation,
          tafelRoi,
          metrics,
          data,
        };

        newSamples.push(newSample);
        addedCount++;
      } catch (err: any) {
        console.error('File parse error:', err);
        showToast(`파일 분석 실패 (${file.name}): ${err.message || '지원되지 않는 형식'}`, 'error');
      }
    }

    if (newSamples.length > 0) {
      setSamples(prev => [...prev, ...newSamples]);
      setSelectedSampleId(newSamples[0].id);
      showToast(`${addedCount}개의 실험 데이터 파일이 성공적으로 로드 및 분석되었습니다.`);
    }
  };

  // Add blank synthetic sample
  const handleAddBlankSample = () => {
    const newSample: Sample = {
      id: `sample-${Date.now()}`,
      name: `Sample_${samples.length + 1}`,
      catalystName: 'Custom Catalyst',
      color: '#ec4899',
      visible: true,
      fileName: 'Sample_Custom.csv',
      fileType: 'csv',
      ruResistance: config.defaultRu,
      irCompensationPercent: config.defaultCompensation,
      tafelRoi: { minLogJ: 0.5, maxLogJ: 1.5 },
      metrics: {
        eta10: 290,
        eta50: 360,
        eta100: 420,
        customTargetEtas: {},
        tafelSlope: 45.0,
        rSquared: 0.997,
        j0: 1.5e-4,
        intercept: 250,
      },
      data: SAMPLE_PRESETS[0].data.map(d => {
        const j = d.currentDensity * 1.1;
        return {
          ...d,
          currentDensity: j,
          logJ: Math.log10(Math.max(1e-6, Math.abs(j))),
        };
      }),
    };
    const calculated = recalculateSampleMetrics(newSample, config);
    setSamples(prev => [...prev, calculated]);
    setSelectedSampleId(calculated.id);
    showToast('새 샘플이 추가되었습니다.');
  };

  // Update sample properties
  const handleUpdateSample = (id: string, updates: Partial<Sample>) => {
    setSamples(prev =>
      prev.map(s => {
        if (s.id === id) {
          const updated = { ...s, ...updates };
          return recalculateSampleMetrics(updated, config);
        }
        return s;
      })
    );
  };

  // Toggle sample visibility
  const handleToggleSampleVisibility = (id: string) => {
    setSamples(prev =>
      prev.map(s => (s.id === id ? { ...s, visible: !s.visible } : s))
    );
  };

  // Delete sample
  const handleDeleteSample = (id: string) => {
    setSamples(prev => prev.filter(s => s.id !== id));
    if (selectedSampleId === id) {
      const remaining = samples.filter(s => s.id !== id);
      if (remaining.length > 0) setSelectedSampleId(remaining[0].id);
    }
  };

  // Tafel ROI update for selected sample
  const handleUpdateTafelRoi = (minLogJ: number, maxLogJ: number) => {
    if (!selectedSampleId) return;
    setSamples(prev =>
      prev.map(s => {
        if (s.id === selectedSampleId) {
          const updated = {
            ...s,
            tafelRoi: { minLogJ, maxLogJ },
          };
          return recalculateSampleMetrics(updated, config);
        }
        return s;
      })
    );
  };

  // Auto-detect Tafel ROI for selected sample
  const handleAutoDetectTafelRoi = (targetId?: string) => {
    const idToFit = targetId || selectedSampleId;
    const target = samples.find(s => s.id === idToFit);
    if (!target) return;

    const bestRoi = autoDetectTafelRoi(target.data);
    setSamples(prev =>
      prev.map(s => {
        if (s.id === idToFit) {
          const updated = {
            ...s,
            tafelRoi: bestRoi,
          };
          return recalculateSampleMetrics(updated, config);
        }
        return s;
      })
    );
    showToast(`'${target.name}'의 최적 선형 구간이 R² 기반으로 자동 산출되었습니다.`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold animate-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-slate-900 text-white border-slate-800'
              : 'bg-red-600 text-white border-red-700'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-white" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        layoutMode={layoutMode}
        onChangeLayout={setLayoutMode}
        reactionType={config.reactionType}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onLoadPreset={handleLoadPreset}
        onToggleSidebarMobile={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          config={config}
          onChangeConfig={setConfig}
          samples={samples}
          selectedSampleId={selectedSampleId}
          onSelectSample={setSelectedSampleId}
          onToggleSampleVisibility={handleToggleSampleVisibility}
          onUpdateSample={handleUpdateSample}
          onDeleteSample={handleDeleteSample}
          onFilesUpload={handleFilesUpload}
          onAddBlankSample={handleAddBlankSample}
          isOpenMobile={isSidebarOpenMobile}
          onCloseMobile={() => setIsSidebarOpenMobile(false)}
        />

        {/* Center Main Dashboard Area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          {/* 1. LSV POLARIZATION CURVE VIEW (Full-width Overlay Curve) */}
          {layoutMode === 'lsv' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <LSVChart
                samples={samples}
                config={config}
                selectedSampleId={selectedSampleId}
                onSelectSample={setSelectedSampleId}
                height={360}
              />
            </div>
          )}

          {/* 2. DEDICATED TAFEL PLOT & FITTING WINDOW (Full-width Tafel Chart + Fitting Controls) */}
          {layoutMode === 'tafel' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <TafelChart
                samples={samples}
                config={config}
                selectedSampleId={selectedSampleId}
                onSelectSample={setSelectedSampleId}
                height={360}
              />
              <TafelFittingControl
                sample={selectedSample}
                samples={samples}
                onSelectSample={setSelectedSampleId}
                onUpdateRoi={handleUpdateTafelRoi}
                onAutoDetectRoi={() => handleAutoDetectTafelRoi()}
              />
            </div>
          )}

          {/* 3. SUBPLOTS GRID VIEW */}
          {layoutMode === 'subplots' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <SubplotGrid
                samples={samples}
                config={config}
                selectedSampleId={selectedSampleId}
                onSelectSample={setSelectedSampleId}
                onAutoDetectRoi={handleAutoDetectTafelRoi}
              />
            </div>
          )}

          {/* Full Performance Summary Table */}
          <SummaryTable
            samples={samples}
            config={config}
            selectedSampleId={selectedSampleId}
            onSelectSample={setSelectedSampleId}
          />
        </main>
      </div>

      {/* Automated Research Report Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        samples={samples}
        config={config}
      />
    </div>
  );
}
export default App;
