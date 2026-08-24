import React, { useState } from 'react';
import {
  X,
  FileText,
  Sparkles,
  Download,
  Copy,
  Printer,
  Check,
  Award,
  TrendingDown,
  Activity,
  Layers,
} from 'lucide-react';
import { ExperimentConfig, Sample } from '../types';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  samples: Sample[];
  config: ExperimentConfig;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  samples,
  config,
}) => {
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const visibleSamples = samples.filter(s => s.visible);

  // Sort by eta10 ascending to find rank
  const rankedSamples = [...visibleSamples].sort((a, b) => {
    const etaA = a.metrics.eta10 ?? 9999;
    const etaB = b.metrics.eta10 ?? 9999;
    return etaA - etaB;
  });

  const bestSample = rankedSamples[0] || null;

  // Rule-based mechanism interpretation
  const getMechanismInterpretation = (slope: number) => {
    if (slope <= 35) {
      return '매우 빠른 전하 이동 속도론 (Tafel/Recombination step RDS). 고성능 2D 나노시트/다원소 촉매 특성.';
    } else if (slope <= 50) {
      return '우수한 산소/수소 발생 반응 속도 (Chemical rate-determining step). 고활성 나노구조 촉매.';
    } else if (slope <= 75) {
      return '중간 수준의 반응 속도론 (First electron transfer fast, subsequent intermediate conversion RDS).';
    } else {
      return '초기 전자 전달 단계(Volmer step)가 속도 결정 단계로 작용. 전도성 보강 또는 계면 활성화 필요.';
    }
  };

  // Request AI Analysis from backend /api/analyze-report
  const handleGenerateAiReport = async () => {
    setIsLoadingAi(true);
    try {
      const payload = {
        reactionType: config.reactionType,
        referenceElectrode: config.referenceElectrode,
        pH: config.pH,
        samples: visibleSamples.map(s => ({
          name: s.name,
          catalystName: s.catalystName,
          ru: s.ruResistance,
          eta10_mV: s.metrics.eta10,
          eta50_mV: s.metrics.eta50,
          eta100_mV: s.metrics.eta100,
          tafelSlope_mV_dec: s.metrics.tafelSlope,
          rSquared: s.metrics.rSquared,
          j0_mA_cm2: s.metrics.j0,
        })),
        metrics: {
          bestCatalyst: bestSample?.name,
          minEta10: bestSample?.metrics.eta10,
        },
      };

      const res = await fetch('/api/analyze-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.report) {
        setAiReport(data.report);
      } else {
        // Fallback analytical report
        setAiReport(generateLocalAnalyticalReport(rankedSamples, config));
      }
    } catch (err) {
      console.warn('Backend AI report fallback to local analytical report:', err);
      setAiReport(generateLocalAnalyticalReport(rankedSamples, config));
    } finally {
      setIsLoadingAi(false);
    }
  };

  const generateLocalAnalyticalReport = (sList: Sample[], cfg: ExperimentConfig) => {
    return `### 🧪 종합 성능 평가 요약 (Executive Performance Summary)
- 본 실험에서는 **${cfg.reactionType}** 반응 조건 (전해질 pH ${cfg.pH}, ${cfg.referenceElectrode} 기준전극)에서 총 ${sList.length}종의 촉매 샘플에 대해 선형 주사 전압전류법(LSV) 및 타펠(Tafel) 분석을 수행하였습니다.
- 최우수 촉매는 **${sList[0]?.name} (${sList[0]?.catalystName})**로, **η₁₀ = ${sList[0]?.metrics.eta10} mV**, **Tafel slope = ${sList[0]?.metrics.tafelSlope} mV/dec (R² = ${sList[0]?.metrics.rSquared})**의 탁월한 전기화학적 활성을 나타냈습니다.

### ⚡ 반응 속도론 및 타펠 메커니즘 해석 (Reaction Kinetics)
${sList
  .map(
    s =>
      `- **${s.name}**: Tafel Slope = ${s.metrics.tafelSlope} mV/dec (${getMechanismInterpretation(
        s.metrics.tafelSlope
      )})`
  )
  .join('\n')}

### 🎯 과전압(Overpotential) 벤치마크 및 비교
- **η₁₀ 순위**: ${sList.map((s, i) => `${i + 1}위 ${s.name} (${s.metrics.eta10} mV)`).join(' < ')}
- 고전류밀도(100 mA/cm²)에서의 과전압 거동 역시 ${sList[0]?.name} 촉매가 가장 안정적인 질량전달 및 전하전달 특성을 보였습니다.`;
  };

  const handleCopyReport = () => {
    const text = document.getElementById('report-printable-area')?.innerText || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-mono font-bold text-slate-900 text-base">
                Electrochemical Performance & Tafel Report
              </h2>
              <p className="text-xs text-slate-500">
                자동 생성 전기화학 촉매 활성 분석 및 논문용 데이터 요약 보고서
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar inside Modal */}
        <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              id="btn-trigger-ai-report"
              onClick={handleGenerateAiReport}
              disabled={isLoadingAi}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs disabled:opacity-50 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{isLoadingAi ? 'AI 리포트 심층 분석 중...' : 'AI 연구 심층 분석 리포트 생성'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition-all shadow-2xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '복사됨' : '클립보드 복사'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition-all shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>인쇄 / PDF 저장</span>
            </button>
          </div>
        </div>

        {/* Scrollable Report Content */}
        <div id="report-printable-area" className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-800 text-sm">
          {/* Executive Highlight Banner */}
          {bestSample && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50/40 to-slate-50 border border-blue-200/80 flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0 mt-0.5">
                <Award className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-base">
                    최고 성능 촉매 (Top Catalyst): {bestSample.name} ({bestSample.catalystName})
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                    Rank #1
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  기준 전류밀도(10 mA/cm²)에서 가장 낮은 과전압 <strong>η₁₀ = {bestSample.metrics.eta10} mV</strong>를
                  기록하였으며, 우수한 선형성(R² = {bestSample.metrics.rSquared})을 가진 Tafel Slope{' '}
                  <strong>{bestSample.metrics.tafelSlope} mV/dec</strong>의 빠른 전하 전달 속도론을 나타냅니다.
                </p>
              </div>
            </div>
          )}

          {/* Section 1: Experimental Context */}
          <div className="space-y-2">
            <h3 className="font-mono font-bold text-slate-900 text-sm border-b border-slate-200 pb-1">
              1. 실험 환경 및 측정 조건 (Experimental Parameters)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block text-[11px]">반응 유형 (Reaction)</span>
                <span className="font-bold text-slate-900">{config.reactionType} (E° = 1.23 V)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block text-[11px]">기준 전극 (Reference)</span>
                <span className="font-bold text-slate-900">{config.referenceElectrode}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block text-[11px]">전해질 pH</span>
                <span className="font-mono font-bold text-slate-900">{config.pH}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block text-[11px]">iR 보정률</span>
                <span className="font-mono font-bold text-slate-900">{config.defaultCompensation}%</span>
              </div>
            </div>
          </div>

          {/* Section 2: Performance Comparison Matrix */}
          <div className="space-y-2">
            <h3 className="font-mono font-bold text-slate-900 text-sm border-b border-slate-200 pb-1">
              2. 촉매별 종합 성능 비교 매트릭스 (Performance Matrix)
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-mono text-[11px]">
                    <th className="py-2 px-3">순위 (Rank)</th>
                    <th className="py-2 px-3">샘플명</th>
                    <th className="py-2 px-3">촉매 물질</th>
                    <th className="py-2 px-3">η_10 (mV)</th>
                    <th className="py-2 px-3">η_50 (mV)</th>
                    <th className="py-2 px-3">Tafel (mV/dec)</th>
                    <th className="py-2 px-3">R²</th>
                    <th className="py-2 px-3">j₀ (mA/cm²)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rankedSamples.map((s, idx) => (
                    <tr key={s.id} className={idx === 0 ? 'bg-blue-50/40 font-semibold' : ''}>
                      <td className="py-2 px-3 font-bold text-blue-700">#{idx + 1}</td>
                      <td className="py-2 px-3 font-mono">{s.name}</td>
                      <td className="py-2 px-3">{s.catalystName}</td>
                      <td className="py-2 px-3 font-mono text-blue-700">{s.metrics.eta10 ?? '-'}</td>
                      <td className="py-2 px-3 font-mono">{s.metrics.eta50 ?? '-'}</td>
                      <td className="py-2 px-3 font-mono text-emerald-700">{s.metrics.tafelSlope}</td>
                      <td className="py-2 px-3 font-mono">{s.metrics.rSquared}</td>
                      <td className="py-2 px-3 font-mono">{s.metrics.j0.toExponential(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Reaction Kinetics & Mechanism */}
          <div className="space-y-3">
            <h3 className="font-mono font-bold text-slate-900 text-sm border-b border-slate-200 pb-1">
              3. 반응 속도론 및 타펠 메커니즘 해석 (Reaction Kinetics)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleSamples.map(s => (
                <div key={s.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 font-mono">{s.name}</span>
                    <span className="font-mono font-bold text-emerald-700">{s.metrics.tafelSlope} mV/dec</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {getMechanismInterpretation(s.metrics.tafelSlope)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: AI Insights Report (if generated) */}
          {aiReport && (
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <h3 className="font-mono font-bold text-slate-900 text-sm">
                  4. AI 전기화학 연구 심층 분석 및 최적화 제안 (AI Research Insights)
                </h3>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                {aiReport}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Generated by ElectroData Lab Analyzer</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-900 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
