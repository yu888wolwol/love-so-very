import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  RotateCcw,
  Download,
  Target,
} from 'lucide-react';
import { ExperimentConfig, Sample, OverpotentialPoint } from '../types';
import { calculateAllInterpolatedEtas } from '../utils/electrochem';

interface LSVChartProps {
  samples: Sample[];
  config: ExperimentConfig;
  selectedSampleId?: string;
  onSelectSample?: (id: string) => void;
  syncHoverX?: number | null;
  onSyncHoverX?: (x: number | null) => void;
  height?: number;
  className?: string;
}

function getColorLabel(color: string): string {
  const c = color.toLowerCase();
  if (c.includes('16a34a') || c.includes('059669') || c.includes('green') || c.includes('emerald')) return 'Green';
  if (c.includes('2563eb') || c.includes('3b82f6') || c.includes('blue')) return 'Blue';
  if (c.includes('dc2626') || c.includes('ef4444') || c.includes('red')) return 'Red';
  if (c.includes('7c3aed') || c.includes('8b5cf6') || c.includes('purple')) return 'Purple';
  if (c.includes('d97706') || c.includes('amber')) return 'Amber';
  return '';
}

export const LSVChart: React.FC<LSVChartProps> = ({
  samples,
  config,
  selectedSampleId,
  onSelectSample,
  syncHoverX,
  onSyncHoverX,
  height = 380,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [axisMode, setAxisMode] = useState<'ERHE' | 'RawE' | 'Overpotential'>('ERHE');
  const [autoFocusActive, setAutoFocusActive] = useState<boolean>(true);
  const [dimensions, setDimensions] = useState({ width: 700, height });

  // Active target current density for focused analysis
  const defaultFocusTarget = config.targetCurrentDensities.includes(43.2)
    ? 43.2
    : config.targetCurrentDensities[1] || config.targetCurrentDensities[0] || 10;
  const [activeBenchmarkJ, setActiveBenchmarkJ] = useState<number>(defaultFocusTarget);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);

  // Zoom / View bounds
  const [zoomBounds, setZoomBounds] = useState<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);

  // Box Zoom Selection state
  const [isSelectingBox, setIsSelectingBox] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionCurrent, setSelectionCurrent] = useState<{ x: number; y: number } | null>(null);

  // Hover Crosshair state
  const [mousePos, setMousePos] = useState<{ x: number; y: number; dataX: number; dataY: number } | null>(null);

  const visibleSamples = useMemo(() => samples.filter(s => s.visible), [samples]);

  // Keep activeBenchmarkJ in sync if targets change
  useEffect(() => {
    if (!config.targetCurrentDensities.includes(activeBenchmarkJ)) {
      if (config.targetCurrentDensities.includes(43.2)) {
        setActiveBenchmarkJ(43.2);
      } else if (config.targetCurrentDensities.length > 0) {
        setActiveBenchmarkJ(config.targetCurrentDensities[0]);
      }
    }
  }, [config.targetCurrentDensities, activeBenchmarkJ]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: Math.max(300, entry.contentRect.width),
          height: height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [height]);

  // Margin
  const margin = { top: 35, right: 35, bottom: 45, left: 65 };
  const plotWidth = Math.max(50, dimensions.width - margin.left - margin.right);
  const plotHeight = Math.max(50, dimensions.height - margin.top - margin.bottom);

  // Extract all points for auto-scaling with smart active range focusing
  const dataRange = useMemo(() => {
    let globalMinX = Infinity;
    let globalMaxX = -Infinity;
    let globalMinY = 0;
    let globalMaxY = -Infinity;

    let activeMinX = Infinity;
    let activeMaxX = -Infinity;
    let activeMinY = 0;
    let activeMaxY = -Infinity;

    for (const sample of visibleSamples) {
      for (const pt of sample.data) {
        let xVal = pt.potentialRHE;
        if (axisMode === 'RawE') xVal = pt.rawE;
        else if (axisMode === 'Overpotential') xVal = pt.overpotential;

        const yVal = pt.currentDensity;
        if (xVal < globalMinX) globalMinX = xVal;
        if (xVal > globalMaxX) globalMaxX = xVal;
        if (yVal < globalMinY) globalMinY = yVal;
        if (yVal > globalMaxY) globalMaxY = yVal;

        if (Math.abs(yVal) >= 0.2) {
          if (xVal < activeMinX) activeMinX = xVal;
          if (xVal > activeMaxX) activeMaxX = xVal;
          if (yVal < activeMinY) activeMinY = yVal;
          if (yVal > activeMaxY) activeMaxY = yVal;
        }
      }
    }

    if (!isFinite(globalMinX) || !isFinite(globalMaxX)) {
      return { minX: 1.15, maxX: 1.70, minY: 0, maxY: 120 };
    }

    if (!autoFocusActive || !isFinite(activeMinX) || !isFinite(activeMaxX)) {
      const xSpan = globalMaxX - globalMinX || 0.5;
      return {
        minX: globalMinX - xSpan * 0.02,
        maxX: globalMaxX + xSpan * 0.03,
        minY: Math.min(0, globalMinY),
        maxY: Math.max(20, globalMaxY * 1.06),
      };
    }

    // Smart Focus Active Region (tight bounding around the reaction onset & curve like in subplots)
    let minX = globalMinX;
    let maxX = globalMaxX;
    let minY = Math.min(0, Math.max(-2, globalMinY));
    let maxY = Math.max(25, Math.min(globalMaxY * 1.05, 140));

    if (axisMode === 'ERHE') {
      const isAnodic = config.reactionType === 'OER' || config.reactionType === 'CUSTOM';
      if (isAnodic) {
        minX = Math.max(globalMinX, activeMinX - 0.12);
        maxX = Math.min(globalMaxX, activeMaxX + 0.04);
      } else {
        minX = Math.max(globalMinX, activeMinX - 0.04);
        maxX = Math.min(globalMaxX, activeMaxX + 0.12);
      }
    } else if (axisMode === 'Overpotential') {
      minX = Math.max(globalMinX, Math.min(0, activeMinX - 30));
      maxX = Math.min(globalMaxX, activeMaxX + 40);
    } else {
      const activeSpan = activeMaxX - activeMinX;
      minX = Math.max(globalMinX, activeMinX - activeSpan * 0.15);
      maxX = Math.min(globalMaxX, activeMaxX + activeSpan * 0.1);
    }

    return { minX, maxX, minY, maxY };
  }, [visibleSamples, axisMode, autoFocusActive, config.reactionType]);

  const currentBounds = zoomBounds || dataRange;

  // Scale functions
  const scaleX = useCallback(
    (xVal: number) => {
      const { minX, maxX } = currentBounds;
      if (maxX === minX) return margin.left;
      return margin.left + ((xVal - minX) / (maxX - minX)) * plotWidth;
    },
    [currentBounds, margin.left, plotWidth]
  );

  const scaleY = useCallback(
    (yVal: number) => {
      const { minY, maxY } = currentBounds;
      if (maxY === minY) return margin.top + plotHeight;
      return margin.top + plotHeight - ((yVal - minY) / (maxY - minY)) * plotHeight;
    },
    [currentBounds, margin.top, plotHeight]
  );

  const invertX = useCallback(
    (pixelX: number) => {
      const { minX, maxX } = currentBounds;
      const fraction = (pixelX - margin.left) / plotWidth;
      return minX + fraction * (maxX - minX);
    },
    [currentBounds, margin.left, plotWidth]
  );

  const invertY = useCallback(
    (pixelY: number) => {
      const { minY, maxY } = currentBounds;
      const fraction = (margin.top + plotHeight - pixelY) / plotHeight;
      return minY + fraction * (maxY - minY);
    },
    [currentBounds, margin.top, plotHeight]
  );

  // Generate SVG path string for a sample
  const getSamplePath = useCallback(
    (sample: Sample) => {
      if (!sample.data || sample.data.length === 0) return '';
      const points = sample.data
        .map(pt => {
          let xVal = pt.potentialRHE;
          if (axisMode === 'RawE') xVal = pt.rawE;
          else if (axisMode === 'Overpotential') xVal = pt.overpotential;
          const yVal = pt.currentDensity;
          return `${scaleX(xVal).toFixed(1)},${scaleY(yVal).toFixed(1)}`;
        })
        .join(' L ');
      return `M ${points}`;
    },
    [axisMode, scaleX, scaleY]
  );

  // Stroke Dasharray for sample lines
  const getLineDashArray = (sample: Sample) => {
    if (sample.lineStyle === 'dashdot') return '6,3,2,3';
    if (sample.lineStyle === 'dashed') return '6,4';
    return undefined; // solid
  };

  // X Axis Ticks
  const xTicks = useMemo(() => {
    const { minX, maxX } = currentBounds;
    const count = dimensions.width < 500 ? 5 : 8;
    const ticks: number[] = [];
    const step = (maxX - minX) / count;
    for (let i = 0; i <= count; i++) {
      ticks.push(minX + i * step);
    }
    return ticks;
  }, [currentBounds, dimensions.width]);

  // Y Axis Ticks
  const yTicks = useMemo(() => {
    const { minY, maxY } = currentBounds;
    const count = 6;
    const ticks: number[] = [];
    const step = (maxY - minY) / count;
    for (let i = 0; i <= count; i++) {
      ticks.push(minY + i * step);
    }
    return ticks;
  }, [currentBounds]);

  // All intersection points across all visible samples for active current densities
  const sampleOverpotentialPoints = useMemo(() => {
    const list: {
      sample: Sample;
      point: OverpotentialPoint;
      targetJ: number;
      xPx: number;
      yPx: number;
      uniqueKey: string;
      colorLabel: string;
    }[] = [];

    for (const sample of visibleSamples) {
      const colorLabel = getColorLabel(sample.color);
      for (const targetJ of config.targetCurrentDensities) {
        const pts =
          sample.metrics.customTargetPoints?.[targetJ] ||
          calculateAllInterpolatedEtas(sample.data, targetJ, config.reactionType);

        for (const pt of pts) {
          let xVal = pt.potentialRHE;
          if (axisMode === 'RawE') xVal = pt.potentialRaw;
          else if (axisMode === 'Overpotential') xVal = pt.eta;

          const xPx = scaleX(xVal);
          const yPx = scaleY(targetJ);

          // Check if point is inside visible plot bounds
          if (
            xPx >= margin.left - 5 &&
            xPx <= margin.left + plotWidth + 5 &&
            yPx >= margin.top - 5 &&
            yPx <= margin.top + plotHeight + 5
          ) {
            list.push({
              sample,
              point: pt,
              targetJ,
              xPx,
              yPx,
              uniqueKey: `${sample.id}-${targetJ}-${pt.index}`,
              colorLabel,
            });
          }
        }
      }
    }

    return list;
  }, [visibleSamples, config.targetCurrentDensities, config.reactionType, axisMode, scaleX, scaleY, margin, plotWidth, plotHeight]);

  // Mouse handlers for box zoom
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x >= margin.left && x <= margin.left + plotWidth && y >= margin.top && y <= margin.top + plotHeight) {
      setIsSelectingBox(true);
      setSelectionStart({ x, y });
      setSelectionCurrent({ x, y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isSelectingBox && selectionStart) {
      setSelectionCurrent({
        x: Math.max(margin.left, Math.min(margin.left + plotWidth, x)),
        y: Math.max(margin.top, Math.min(margin.top + plotHeight, y)),
      });
    }

    // Update hover crosshair
    if (x >= margin.left && x <= margin.left + plotWidth && y >= margin.top && y <= margin.top + plotHeight) {
      const dataX = invertX(x);
      const dataY = invertY(y);
      setMousePos({ x, y, dataX, dataY });
      onSyncHoverX?.(dataX);
    } else {
      setMousePos(null);
      onSyncHoverX?.(null);
    }
  };

  const handleMouseUp = () => {
    if (isSelectingBox && selectionStart && selectionCurrent) {
      const dx = Math.abs(selectionCurrent.x - selectionStart.x);
      const dy = Math.abs(selectionCurrent.y - selectionStart.y);

      if (dx > 10 && dy > 10) {
        const x1 = Math.min(selectionStart.x, selectionCurrent.x);
        const x2 = Math.max(selectionStart.x, selectionCurrent.x);
        const y1 = Math.min(selectionStart.y, selectionCurrent.y);
        const y2 = Math.max(selectionStart.y, selectionCurrent.y);

        const newMinX = invertX(x1);
        const newMaxX = invertX(x2);
        const newMaxY = invertY(y1);
        const newMinY = invertY(y2);

        setZoomBounds({
          minX: Math.min(newMinX, newMaxX),
          maxX: Math.max(newMinX, newMaxX),
          minY: Math.max(0, Math.min(newMinY, newMaxY)),
          maxY: Math.max(newMinY, newMaxY),
        });
      }
    }
    setIsSelectingBox(false);
    setSelectionStart(null);
    setSelectionCurrent(null);
  };

  // Wheel Zoom handler
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.85 : 1.15;
    const { minX, maxX, minY, maxY } = currentBounds;
    const xSpan = maxX - minX;
    const ySpan = maxY - minY;

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const newXSpan = xSpan * factor;
    const newYSpan = ySpan * factor;

    setZoomBounds({
      minX: midX - newXSpan / 2,
      maxX: midX + newXSpan / 2,
      minY: Math.max(0, midY - newYSpan / 2),
      maxY: midY + newYSpan / 2,
    });
  };

  // Export Chart Image (PNG)
  const handleExportPNG = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = dimensions.width * 2;
    canvas.height = dimensions.height * 2;

    img.onload = () => {
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const link = document.createElement('a');
        link.download = `LSV_MultiSample_Curves_${config.reactionType}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const getAxisLabel = () => {
    if (axisMode === 'RawE') return 'Measured Potential E_meas (V)';
    if (axisMode === 'Overpotential') return 'Overpotential η (mV)';
    return 'Potential (V vs. RHE)';
  };

  return (
    <div
      ref={containerRef}
      id="chart-lsv-container"
      className={`relative bg-white border border-slate-200 rounded-xl flex flex-col shadow-2xs w-full ${className}`}
    >
      {/* Chart Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-slate-800 text-xs flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block shadow-xs" />
            LSV Multi-Sample Curves
          </span>
        </div>

        {/* Quick Target Density Buttons & Controls */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {/* Target density pills */}
          <div className="flex items-center bg-white border border-slate-200 rounded-md p-0.5 text-[11px] shadow-2xs">
            <span className="px-1.5 text-[10px] font-bold text-slate-400 font-mono flex items-center gap-0.5">
              <Target className="w-3 h-3 text-blue-600" />
              기준 j:
            </span>
            {config.targetCurrentDensities.map(tJ => (
              <button
                key={`btn-target-${tJ}`}
                onClick={() => setActiveBenchmarkJ(tJ)}
                className={`px-2 py-0.5 rounded font-mono font-semibold transition-all ${
                  activeBenchmarkJ === tJ
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title={`기준 전류밀도 ${tJ} mA/cm² 포커스`}
              >
                {tJ}
              </button>
            ))}
          </div>

          {/* Axis Selector */}
          <div className="flex items-center bg-white border border-slate-200 rounded-md p-0.5 text-[11px]">
            <button
              onClick={() => setAxisMode('ERHE')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                axisMode === 'ERHE' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="RHE 기준 전위"
            >
              E_RHE
            </button>
            <button
              onClick={() => setAxisMode('Overpotential')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                axisMode === 'Overpotential' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="과전압 η (mV)"
            >
              η (mV)
            </button>
            <button
              onClick={() => setAxisMode('RawE')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                axisMode === 'RawE' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="측정 전위"
            >
              E_meas
            </button>
          </div>

          {/* Auto-Focus Active Region Toggle */}
          <button
            id="btn-toggle-autofocus-lsv"
            onClick={() => {
              setAutoFocusActive(!autoFocusActive);
              setZoomBounds(null);
            }}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-all ${
              autoFocusActive
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="촉매 반응 활성 구간 자동 포커스 / 전체 스캔 토글"
          >
            {autoFocusActive ? 'Active Focus' : 'Full Scan'}
          </button>

          {/* Reset Zoom */}
          {zoomBounds && (
            <button
              id="btn-reset-zoom-lsv"
              onClick={() => setZoomBounds(null)}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 transition-colors shadow-2xs"
              title="전체 영역으로 줌 리셋"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          {/* Export PNG */}
          <button
            onClick={handleExportPNG}
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="고해상도 PNG 이미지 저장"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="flex-1 w-full relative overflow-hidden select-none bg-white">
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full cursor-crosshair"
        >
          <defs>
            <clipPath id="lsv-clip">
              <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
            </clipPath>
            {/* Filter for glowing point shadow */}
            <filter id="point-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Background Grid */}
          <g className="grid-lines" stroke="#f1f5f9" strokeWidth="1">
            {yTicks.map((tick, i) => {
              const y = scaleY(tick);
              return <line key={`gy-${i}`} x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} />;
            })}
            {xTicks.map((tick, i) => {
              const x = scaleX(tick);
              return <line key={`gx-${i}`} x1={x} y1={margin.top} x2={x} y2={margin.top + plotHeight} />;
            })}
          </g>

          {/* Target Current Density Reference Lines */}
          <g className="target-lines" clipPath="url(#lsv-clip)">
            {config.targetCurrentDensities.map(targetJ => {
              const y = scaleY(targetJ);
              if (y < margin.top || y > margin.top + plotHeight) return null;
              const isActive = targetJ === activeBenchmarkJ;

              return (
                <g key={`target-line-${targetJ}`}>
                  <line
                    x1={margin.left}
                    y1={y}
                    x2={margin.left + plotWidth}
                    y2={y}
                    stroke={isActive ? '#3b82f6' : '#94a3b8'}
                    strokeWidth={isActive ? '1.5' : '1'}
                    strokeDasharray={isActive ? '5,3' : '4,4'}
                  />
                  <rect
                    x={margin.left + plotWidth - 110}
                    y={y - 14}
                    width={105}
                    height={12}
                    fill={isActive ? '#eff6ff' : '#f8fafc'}
                    rx="2"
                    opacity="0.9"
                  />
                  <text
                    x={margin.left + plotWidth - 8}
                    y={y - 4}
                    textAnchor="end"
                    fontSize="9"
                    fontFamily="monospace"
                    fill={isActive ? '#1d4ed8' : '#64748b'}
                    fontWeight={isActive ? '700' : '600'}
                  >
                    j = {targetJ} mA/cm²
                  </text>
                </g>
              );
            })}

            {/* OER Thermodynamic Reversible Potential (1.23V vs RHE) */}
            {axisMode === 'ERHE' && config.reactionType === 'OER' && (
              <g>
                <line
                  x1={scaleX(1.23)}
                  y1={margin.top}
                  x2={scaleX(1.23)}
                  y2={margin.top + plotHeight}
                  stroke="#ef4444"
                  strokeWidth="1.2"
                  strokeDasharray="5,3"
                />
                <text
                  x={scaleX(1.23) + 4}
                  y={margin.top + 12}
                  fontSize="9"
                  fontFamily="monospace"
                  fill="#ef4444"
                  fontWeight="bold"
                >
                  E° = 1.23 V
                </text>
              </g>
            )}
          </g>

          {/* Axis Borders */}
          <line
            x1={margin.left}
            y1={margin.top + plotHeight}
            x2={margin.left + plotWidth}
            y2={margin.top + plotHeight}
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />
          <line
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={margin.top + plotHeight}
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />

          {/* Sample Curves (Distinct colors & line styles) */}
          <g className="sample-curves" clipPath="url(#lsv-clip)">
            {visibleSamples.map(sample => {
              const isSelected = sample.id === selectedSampleId;
              const pathStr = getSamplePath(sample);
              const dashArray = getLineDashArray(sample);

              return (
                <g key={sample.id}>
                  {/* Subtle Glow under selected */}
                  {isSelected && (
                    <path
                      d={pathStr}
                      fill="none"
                      stroke={sample.color}
                      strokeWidth="7"
                      strokeOpacity="0.25"
                      strokeLinecap="round"
                    />
                  )}
                  <path
                    d={pathStr}
                    fill="none"
                    stroke={sample.color}
                    strokeWidth={isSelected ? '3.2' : '2.2'}
                    strokeDasharray={dashArray}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-all hover:stroke-[3.5] cursor-pointer"
                    onClick={() => onSelectSample?.(sample.id)}
                  />
                </g>
              );
            })}
          </g>

          {/* Overpotential Intersection Points (Matching Image 1 & Image 2) */}
          <g className="intersection-points" clipPath="url(#lsv-clip)">
            {sampleOverpotentialPoints.map(item => {
              const isBenchmark = item.targetJ === activeBenchmarkJ;
              const isHovered = hoveredPointId === item.uniqueKey;
              const isSelectedSample = item.sample.id === selectedSampleId;

              // Radius
              const r = isBenchmark ? 5.5 : 4.5;

              return (
                <g
                  key={item.uniqueKey}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredPointId(item.uniqueKey)}
                  onMouseLeave={() => setHoveredPointId(null)}
                  onClick={() => onSelectSample?.(item.sample.id)}
                >
                  {/* Halo ring */}
                  <circle
                    cx={item.xPx}
                    cy={item.yPx}
                    r={r + 3.5}
                    fill={item.sample.color}
                    opacity={isHovered || isSelectedSample ? 0.45 : 0.2}
                  />

                  {/* Center Dot */}
                  <circle
                    cx={item.xPx}
                    cy={item.yPx}
                    r={r}
                    fill={item.sample.color}
                    stroke="#ffffff"
                    strokeWidth="2"
                    filter="url(#point-glow)"
                  />

                  {/* Marker Tag Badge (e.g. Pt 1, Pt A, Pt B) matching Image 1 */}
                  <g transform={`translate(${item.xPx}, ${item.yPx - 9})`}>
                    <rect
                      x="-14"
                      y="-13"
                      width="28"
                      height="12"
                      rx="3"
                      fill="#0f172a"
                      stroke="#334155"
                      strokeWidth="0.8"
                    />
                    <text
                      x="0"
                      y="-4"
                      textAnchor="middle"
                      fontSize="8"
                      fontWeight="bold"
                      fontFamily="monospace"
                      fill="#ffffff"
                    >
                      {item.point.tag || 'Pt'}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {/* X Axis Tick Labels */}
          <g className="x-axis-labels">
            {xTicks.map((tick, i) => {
              const x = scaleX(tick);
              return (
                <g key={`xtick-${i}`}>
                  <line x1={x} y1={margin.top + plotHeight} x2={x} y2={margin.top + plotHeight + 4} stroke="#94a3b8" />
                  <text
                    x={x}
                    y={margin.top + plotHeight + 16}
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="monospace"
                    fill="#475569"
                  >
                    {axisMode === 'Overpotential' ? Math.round(tick) : tick.toFixed(2)}
                  </text>
                </g>
              );
            })}
            <text
              x={margin.left + plotWidth / 2}
              y={dimensions.height - 8}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#1e293b"
            >
              {getAxisLabel()}
            </text>
          </g>

          {/* Y Axis Tick Labels */}
          <g className="y-axis-labels">
            {yTicks.map((tick, i) => {
              const y = scaleY(tick);
              return (
                <g key={`ytick-${i}`}>
                  <line x1={margin.left - 4} y1={y} x2={margin.left} y2={y} stroke="#94a3b8" />
                  <text
                    x={margin.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fontFamily="monospace"
                    fill="#475569"
                  >
                    {Math.round(tick)}
                  </text>
                </g>
              );
            })}
            <text
              transform={`rotate(-90)`}
              x={-(margin.top + plotHeight / 2)}
              y={18}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#1e293b"
            >
              Current Density j (mA/cm²)
            </text>
          </g>

          {/* Box Zoom Selection Rectangle */}
          {isSelectingBox && selectionStart && selectionCurrent && (
            <rect
              x={Math.min(selectionStart.x, selectionCurrent.x)}
              y={Math.min(selectionStart.y, selectionCurrent.y)}
              width={Math.abs(selectionCurrent.x - selectionStart.x)}
              height={Math.abs(selectionCurrent.y - selectionStart.y)}
              fill="#3b82f6"
              fillOpacity="0.15"
              stroke="#2563eb"
              strokeWidth="1.5"
              strokeDasharray="3,3"
            />
          )}

          {/* Hover Crosshair */}
          {mousePos && (
            <g className="crosshair">
              <line
                x1={mousePos.x}
                y1={margin.top}
                x2={mousePos.x}
                y2={margin.top + plotHeight}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
              <line
                x1={margin.left}
                y1={mousePos.y}
                x2={margin.left + plotWidth}
                y2={mousePos.y}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
            </g>
          )}
        </svg>

        {/* Hover Floating Tooltip */}
        {mousePos && (
          <div
            className="absolute pointer-events-none bg-slate-900/90 text-white rounded-lg px-2.5 py-2 text-[11px] shadow-lg backdrop-blur-xs space-y-1 z-30"
            style={{
              left: Math.min(mousePos.x + 15, dimensions.width - 190),
              top: Math.max(margin.top + 10, Math.min(mousePos.y - 30, dimensions.height - 140)),
            }}
          >
            <div className="font-mono text-slate-300 border-b border-slate-700 pb-0.5 flex items-center justify-between gap-2">
              <span>
                {axisMode === 'Overpotential'
                  ? `η: ${Math.round(mousePos.dataX)} mV`
                  : `E: ${mousePos.dataX.toFixed(3)} V`}
              </span>
              <span className="text-blue-300">j: {mousePos.dataY.toFixed(2)} mA/cm²</span>
            </div>
            {visibleSamples.map(s => {
              let nearestPt = s.data[0];
              let minDist = Infinity;
              for (const pt of s.data) {
                let xVal = pt.potentialRHE;
                if (axisMode === 'RawE') xVal = pt.rawE;
                else if (axisMode === 'Overpotential') xVal = pt.overpotential;
                const d = Math.abs(xVal - mousePos.dataX);
                if (d < minDist) {
                  minDist = d;
                  nearestPt = pt;
                }
              }
              if (!nearestPt) return null;
              const colorLabel = getColorLabel(s.color);

              return (
                <div key={s.id} className="flex items-center justify-between gap-3 text-[10px]">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-200 font-semibold truncate">
                      {s.name} {colorLabel ? `(${colorLabel})` : ''}
                    </span>
                  </div>
                  <span className="font-mono text-blue-300 font-bold">
                    {nearestPt.currentDensity.toFixed(2)} mA/cm²
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend at bottom with Line Styles */}
      <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 text-[11px]">
        <div className="flex flex-wrap items-center gap-2.5">
          {visibleSamples.map(sample => {
            const colorLabel = getColorLabel(sample.color);
            const lineDesc = sample.lineStyle === 'dashdot' ? 'dashed-dot line' : sample.lineStyle === 'dashed' ? 'dashed line' : 'solid line';

            return (
              <button
                key={sample.id}
                onClick={() => onSelectSample?.(sample.id)}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full transition-all border ${
                  sample.id === selectedSampleId
                    ? 'bg-blue-100 border-blue-400 font-bold text-slate-900 shadow-2xs'
                    : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sample.color }} />
                <span>{sample.name}</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  ({colorLabel || sample.catalystName}, {lineDesc})
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-[10px] text-slate-500 font-mono hidden sm:block">
          포인트 클릭 시 해당 샘플 포커스 · 기준 j 변경 가능
        </div>
      </div>
    </div>
  );
};
