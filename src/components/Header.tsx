import React from 'react';
import {
  FileText,
  LayoutGrid,
  TrendingUp,
  Activity,
  SlidersHorizontal,
} from 'lucide-react';
import { LayoutMode, ReactionType } from '../types';

interface HeaderProps {
  layoutMode: LayoutMode;
  onChangeLayout: (mode: LayoutMode) => void;
  reactionType: ReactionType;
  onLoadPreset: (reaction: 'OER' | 'ORR') => void;
  onOpenReportModal: () => void;
  onToggleSidebarMobile: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  layoutMode,
  onChangeLayout,
  reactionType,
  onLoadPreset,
  onOpenReportModal,
  onToggleSidebarMobile,
}) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 z-30 sticky top-0">
      {/* Left: Mobile Toggle & Project Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          id="btn-toggle-sidebar-mobile"
          onClick={onToggleSidebarMobile}
          className="lg:hidden p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          title="Toggle Sidebar"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Project Path / Breadcrumb */}
        <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-500">
          <span className="hidden md:inline font-mono font-semibold text-slate-700">Project:</span>
          <span className="font-semibold text-slate-800">E-Chem_{reactionType}_Study</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-bold hidden sm:inline">LSV_Tafel_Analysis</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-blue-50 text-blue-700 border border-blue-100 uppercase">
            {reactionType}
          </span>
        </div>
      </div>

      {/* Center: Presets & Layout Modes */}
      <div className="flex items-center gap-3">
        {/* Preset Selector */}
        <div className="hidden lg:flex items-center bg-slate-50 border border-slate-200 rounded-md p-0.5 text-xs">
          <span className="text-[10px] text-slate-400 font-semibold px-2 uppercase tracking-wider">Preset:</span>
          <button
            id="btn-preset-oer"
            onClick={() => onLoadPreset('OER')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
              reactionType === 'OER'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            OER (1M KOH)
          </button>
          <button
            id="btn-preset-orr"
            onClick={() => onLoadPreset('ORR')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
              reactionType === 'ORR'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ORR
          </button>
        </div>

        {/* Primary View Modes (Single LSV, Dedicated Tafel Window, Subplots Grid) */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
          <button
            id="btn-layout-lsv"
            onClick={() => onChangeLayout('lsv')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
              layoutMode === 'lsv'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="LSV 분극 곡선 분석 창"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>LSV Curve</span>
          </button>
          <button
            id="btn-layout-tafel"
            onClick={() => onChangeLayout('tafel')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
              layoutMode === 'tafel'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="타펠 플롯 & 피팅 전용 분석 창"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            <span>Tafel Plot</span>
          </button>
          <button
            id="btn-layout-subplots"
            onClick={() => onChangeLayout('subplots')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
              layoutMode === 'subplots'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="샘플별 개별 카드 서브플롯"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Subplots</span>
          </button>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2.5">
        <button
          id="btn-generate-report"
          onClick={onOpenReportModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg tracking-wider flex items-center gap-1.5 transition-colors uppercase shadow-2xs"
          title="Generate Full Analytical Report"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>GENERATE REPORT</span>
        </button>
      </div>
    </header>
  );
};

