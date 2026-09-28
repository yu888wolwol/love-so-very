import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Download,
  Crosshair,
  Layers,
} from 'lucide-react';
import { ExperimentConfig, Sample } from '../types';

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

export const LSVChart: React.FC<LSVChartProps> = ({
  samples,
  config,
  selectedSampleId,
  onSelectSample,
  syncHoverX,
  onSyncHoverX,
  height = 360,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [axisMode, setAxisMode] = useState<'ERHE' | 'RawE' | 'Overpotential'>('ERHE');
  const [autoFocusActive, setAutoFocusActive] = useState<boolean>(true);
  const [dimensions, setDimensions] = useState({ width: 600, height });

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
  const margin = { top: 25, right: 30, bottom: 45, left: 60 };
  const plotWidth = Math.max(50, dimensions.width - margin.left - margin.right);
  const plotHeight = Math.max(50, dimensions.height - margin.top - margin.bottom);

  // Extract all points for auto-scaling with smart active range focusing
  const dataRange = useMemo(() => {
    let globalMinX = Infinity;
    let globalMaxX = -Infinity;
    let globalMinY = 0;
    let globalMaxY = -Infinity;

    // Active reaction points where significant catalytic current occurs (|j| >= 0.2 mA/cm2)
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
      return { minX: 1.0, maxX: 1.8, minY: 0, maxY: 100 };
    }

    if (!autoFocusActive || !isFinite(activeMinX) || !isFinite(activeMaxX)) {
      // Full Instrument Scan Range
      const xSpan = globalMaxX - globalMinX || 0.5;
      return {
        minX: globalMinX - xSpan * 0.02,
        maxX: globalMaxX + xSpan * 0.03,
        minY: Math.min(0, globalMinY),
        maxY: Math.max(15, globalMaxY * 1.06),
      };
    }

    // Smart Focus Active Region (tight bounding around the reaction onset & curve like in subplots)
    let minX = globalMinX;
    let maxX = globalMaxX;
    let minY = Math.min(0, Math.max(-2, globalMinY));
    let maxY = Math.max(15, Math.min(globalMaxY * 1.05, 120));

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

  // Current effective bounds
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

  // X Axis Ticks
  const xTicks = useMemo(() => {
    const { minX, maxX } = currentBounds;
    const count = dimensions.width < 450 ? 5 : 8;
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

  // Box Zoom Mouse Handlers
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
    const factor = e.deltaY < 0 ? 0.85 : 1.15; // zoom in / zoom out
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
        link.download = `LSV_Curves_${config.reactionType}.png`;
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
      <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-slate-800 text-xs flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
            LSV Curves (Overlay)
          </span>
          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
            [드래그로 박스 줌인 / 휠 확대]
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 text-xs">
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
                ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
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
              className="flex items-center gap-1 px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 transition-colors shadow-2xs"
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
            {/* Clip path for plot area */}
            <clipPath id="lsv-clip">
              <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>

          {/* Background Grid */}
          <g className="grid-lines" stroke="#f1f5f9" strokeWidth="1">
            {/* Horizontal Grid */}
            {yTicks.map((tick, i) => {
              const y = scaleY(tick);
              return <line key={`gy-${i}`} x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} />;
            })}
            {/* Vertical Grid */}
            {xTicks.map((tick, i) => {
              const x = scaleX(tick);
              return <line key={`gx-${i}`} x1={x} y1={margin.top} x2={x} y2={margin.top + plotHeight} />;
            })}
          </g>

          {/* Target Current Density Reference Lines (j = 10, 50, 100) */}
          <g className="target-lines" clipPath="url(#lsv-clip)">
            {config.targetCurrentDensities.map(targetJ => {
              const y = scaleY(targetJ);
              if (y < margin.top || y > margin.top + plotHeight) return null;
              return (
                <g key={`target-line-${targetJ}`}>
                  <line
                    x1={margin.left}
                    y1={y}
                    x2={margin.left + plotWidth}
                    y2={y}
                    stroke="#94a3b8"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                  />
                  <text
                    x={margin.left + plotWidth - 6}
                    y={y - 3}
                    textAnchor="end"
                    fontSize="9"
                    fontFamily="monospace"
                    fill="#64748b"
                    fontWeight="600"
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

          {/* Sample Curves */}
          <g className="sample-curves" clipPath="url(#lsv-clip)">
            {visibleSamples.map(sample => {
              const isSelected = sample.id === selectedSampleId;
              const pathStr = getSamplePath(sample);
              return (
                <g key={sample.id}>
                  {/* Subtle Glow under selected */}
                  {isSelected && (
                    <path
                      d={pathStr}
                      fill="none"
                      stroke={sample.color}
                      strokeWidth="6"
                      strokeOpacity="0.25"
                      strokeLinecap="round"
                    />
                  )}
                  <path
                    d={pathStr}
                    fill="none"
                    stroke={sample.color}
                    strokeWidth={isSelected ? '3' : '2'}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-all hover:stroke-[3.5]"
                  />
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

          {/* Hover Crosshair & Indicators */}
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
            className="absolute pointer-events-none bg-slate-900/90 text-white rounded-lg px-2.5 py-2 text-[11px] shadow-lg backdrop-blur-xs space-y-1 z-20"
            style={{
              left: Math.min(mousePos.x + 15, dimensions.width - 170),
              top: Math.max(margin.top + 10, Math.min(mousePos.y - 30, dimensions.height - 120)),
            }}
          >
            <div className="font-mono text-slate-300 border-b border-slate-700 pb-0.5">
              {axisMode === 'Overpotential'
                ? `η: ${Math.round(mousePos.dataX)} mV`
                : `E: ${mousePos.dataX.toFixed(3)} V`}
              {' | '}
              <span>j: {mousePos.dataY.toFixed(2)} mA/cm²</span>
            </div>
            {visibleSamples.map(s => {
              // Find nearest point
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
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 text-[10px]">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-200 font-semibold truncate">{s.name}</span>
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

      {/* Legend at bottom */}
      <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50/40 text-[11px]">
        {visibleSamples.map(sample => (
          <button
            key={sample.id}
            onClick={() => onSelectSample?.(sample.id)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all ${
              sample.id === selectedSampleId
                ? 'bg-blue-100/80 ring-1 ring-blue-400 font-bold text-slate-900'
                : 'hover:bg-slate-200/60 text-slate-700'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sample.color }} />
            <span>{sample.name}</span>
            <span className="text-[10px] text-slate-500 font-normal">({sample.catalystName})</span>
          </button>
        ))}
      </div>
    </div>
  );
};
