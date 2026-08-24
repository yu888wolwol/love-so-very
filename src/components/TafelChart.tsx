import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  RotateCcw,
  Download,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { ExperimentConfig, Sample } from '../types';

interface TafelChartProps {
  samples: Sample[];
  config: ExperimentConfig;
  selectedSampleId: string;
  onSelectSample: (id: string) => void;
  height?: number;
  className?: string;
}

export const TafelChart: React.FC<TafelChartProps> = ({
  samples,
  config,
  selectedSampleId,
  onSelectSample,
  height = 360,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [dimensions, setDimensions] = useState({ width: 600, height });
  const [yAxisMode, setYAxisMode] = useState<'overpotential' | 'erhe'>('overpotential');

  // Zoom bounds
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

  // Hover crosshair state
  const [mousePos, setMousePos] = useState<{ x: number; y: number; dataX: number; dataY: number } | null>(null);

  const visibleSamples = useMemo(() => samples.filter(s => s.visible), [samples]);
  const selectedSample = useMemo(
    () => samples.find(s => s.id === selectedSampleId) || visibleSamples[0] || null,
    [samples, selectedSampleId, visibleSamples]
  );

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

  const margin = { top: 25, right: 30, bottom: 45, left: 60 };
  const plotWidth = Math.max(50, dimensions.width - margin.left - margin.right);
  const plotHeight = Math.max(50, dimensions.height - margin.top - margin.bottom);

  // Auto scale calculation
  const dataRange = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const sample of visibleSamples) {
      for (const pt of sample.data) {
        if (pt.logJ > -2 && Math.abs(pt.currentDensity) > 0.01) {
          const xVal = pt.logJ;
          const yVal = yAxisMode === 'overpotential' ? pt.overpotential : pt.potentialRHE;

          if (xVal < minX) minX = xVal;
          if (xVal > maxX) maxX = xVal;
          if (yVal < minY) minY = yVal;
          if (yVal > maxY) maxY = yVal;
        }
      }
    }

    if (!isFinite(minX) || !isFinite(maxX)) {
      minX = -1;
      maxX = 2.5;
      minY = yAxisMode === 'overpotential' ? 150 : 1.35;
      maxY = yAxisMode === 'overpotential' ? 500 : 1.75;
    } else {
      const xSpan = maxX - minX || 2.0;
      const ySpan = maxY - minY || 200;
      minX = minX - xSpan * 0.05;
      maxX = maxX + xSpan * 0.05;
      minY = minY - ySpan * 0.05;
      maxY = maxY + ySpan * 0.08;
    }

    return { minX, maxX, minY, maxY };
  }, [visibleSamples, yAxisMode]);

  const currentBounds = zoomBounds || dataRange;

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
      return minX + ((pixelX - margin.left) / plotWidth) * (maxX - minX);
    },
    [currentBounds, margin.left, plotWidth]
  );

  const invertY = useCallback(
    (pixelY: number) => {
      const { minY, maxY } = currentBounds;
      return minY + ((margin.top + plotHeight - pixelY) / plotHeight) * (maxY - minY);
    },
    [currentBounds, margin.top, plotHeight]
  );

  // X ticks (log(j))
  const xTicks = useMemo(() => {
    const { minX, maxX } = currentBounds;
    const count = dimensions.width < 450 ? 5 : 7;
    const ticks: number[] = [];
    const step = (maxX - minX) / count;
    for (let i = 0; i <= count; i++) {
      ticks.push(minX + i * step);
    }
    return ticks;
  }, [currentBounds, dimensions.width]);

  // Y ticks
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

  // Generate Tafel line path
  const getTafelCurvePath = useCallback(
    (sample: Sample) => {
      const filtered = sample.data.filter(pt => pt.logJ >= currentBounds.minX && pt.logJ <= currentBounds.maxX);
      if (filtered.length === 0) return '';
      const points = filtered
        .map(pt => {
          const yVal = yAxisMode === 'overpotential' ? pt.overpotential : pt.potentialRHE;
          return `${scaleX(pt.logJ).toFixed(1)},${scaleY(yVal).toFixed(1)}`;
        })
        .join(' L ');
      return `M ${points}`;
    },
    [currentBounds, scaleX, scaleY, yAxisMode]
  );

  // Generate Fitted Regression Line for Sample
  const getFitLineCoordinates = useCallback(
    (sample: Sample) => {
      const { minLogJ, maxLogJ } = sample.tafelRoi;
      const { tafelSlope, intercept } = sample.metrics;
      if (!tafelSlope || tafelSlope === 0) return null;

      // In overpotential mode: y = slope * x + intercept
      // In erhe mode: y = (slope * x + intercept)/1000 + 1.23
      const x1 = minLogJ;
      const x2 = maxLogJ;

      let y1 = (sample.metrics.intercept + sample.metrics.tafelSlope * x1);
      let y2 = (sample.metrics.intercept + sample.metrics.tafelSlope * x2);

      if (yAxisMode === 'erhe') {
        y1 = y1 / 1000 + 1.23;
        y2 = y2 / 1000 + 1.23;
      }

      return {
        x1: scaleX(x1),
        y1: scaleY(y1),
        x2: scaleX(x2),
        y2: scaleY(y2),
      };
    },
    [scaleX, scaleY, yAxisMode]
  );

  // Mouse handlers for Box Zoom & Crosshair
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

    if (x >= margin.left && x <= margin.left + plotWidth && y >= margin.top && y <= margin.top + plotHeight) {
      const dataX = invertX(x);
      const dataY = invertY(y);
      setMousePos({ x, y, dataX, dataY });
    } else {
      setMousePos(null);
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
          minY: Math.min(newMinY, newMaxY),
          maxY: Math.max(newMinY, newMaxY),
        });
      }
    }
    setIsSelectingBox(false);
    setSelectionStart(null);
    setSelectionCurrent(null);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.85 : 1.15;
    const { minX, maxX, minY, maxY } = currentBounds;
    const xSpan = maxX - minX;
    const ySpan = maxY - minY;

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    setZoomBounds({
      minX: midX - (xSpan * factor) / 2,
      maxX: midX + (xSpan * factor) / 2,
      minY: midY - (ySpan * factor) / 2,
      maxY: midY + (ySpan * factor) / 2,
    });
  };

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
        link.download = `Tafel_Plots_${config.reactionType}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div
      ref={containerRef}
      id="chart-tafel-container"
      className={`relative bg-white border border-slate-200 rounded-xl flex flex-col shadow-2xs w-full ${className}`}
    >
      {/* Chart Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-slate-800 text-xs flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
            Tafel Plots (log j vs. η)
          </span>
          {selectedSample && (
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {selectedSample.name}: {selectedSample.metrics.tafelSlope} mV/dec (R²={selectedSample.metrics.rSquared})
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 text-xs">
          {/* Y Axis Mode */}
          <div className="flex items-center bg-white border border-slate-200 rounded-md p-0.5 text-[11px]">
            <button
              onClick={() => setYAxisMode('overpotential')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                yAxisMode === 'overpotential' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="과전압 η (mV)"
            >
              η (mV)
            </button>
            <button
              onClick={() => setYAxisMode('erhe')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                yAxisMode === 'erhe' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="전위 E_RHE (V)"
            >
              E_RHE (V)
            </button>
          </div>

          {zoomBounds && (
            <button
              id="btn-reset-zoom-tafel"
              onClick={() => setZoomBounds(null)}
              className="flex items-center gap-1 px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 transition-colors shadow-2xs"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          <button
            onClick={handleExportPNG}
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="고해상도 PNG 저장"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SVG Plot Canvas */}
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
            <clipPath id="tafel-clip">
              <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>

          {/* Background Grid */}
          <g className="grid-lines" stroke="#f1f5f9" strokeWidth="1">
            {yTicks.map((tick, i) => {
              const y = scaleY(tick);
              return <line key={`tgy-${i}`} x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} />;
            })}
            {xTicks.map((tick, i) => {
              const x = scaleX(tick);
              return <line key={`tgx-${i}`} x1={x} y1={margin.top} x2={x} y2={margin.top + plotHeight} />;
            })}
          </g>

          {/* Shaded ROI band for selected sample */}
          {selectedSample && (
            <g clipPath="url(#tafel-clip)">
              <rect
                x={scaleX(selectedSample.tafelRoi.minLogJ)}
                y={margin.top}
                width={Math.max(2, scaleX(selectedSample.tafelRoi.maxLogJ) - scaleX(selectedSample.tafelRoi.minLogJ))}
                height={plotHeight}
                fill="#3b82f6"
                fillOpacity="0.08"
                stroke="#3b82f6"
                strokeOpacity="0.3"
                strokeDasharray="4,4"
              />
            </g>
          )}

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

          {/* Sample Data Curves */}
          <g className="tafel-data-curves" clipPath="url(#tafel-clip)">
            {visibleSamples.map(sample => {
              const isSelected = sample.id === selectedSampleId;
              const pathStr = getTafelCurvePath(sample);
              return (
                <g key={`tafel-curve-${sample.id}`}>
                  <path
                    d={pathStr}
                    fill="none"
                    stroke={sample.color}
                    strokeWidth={isSelected ? '2.5' : '1.8'}
                    strokeOpacity={isSelected ? 1 : 0.75}
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </g>

          {/* Fitted Linear Regression Lines */}
          <g className="tafel-fit-lines" clipPath="url(#tafel-clip)">
            {visibleSamples.map(sample => {
              const coords = getFitLineCoordinates(sample);
              if (!coords) return null;
              const isSelected = sample.id === selectedSampleId;

              return (
                <g key={`fit-line-${sample.id}`}>
                  {/* Outer glow for selected */}
                  {isSelected && (
                    <line
                      x1={coords.x1}
                      y1={coords.y1}
                      x2={coords.x2}
                      y2={coords.y2}
                      stroke={sample.color}
                      strokeWidth="6"
                      strokeOpacity="0.25"
                      strokeLinecap="round"
                    />
                  )}
                  {/* Dashed regression line */}
                  <line
                    x1={coords.x1}
                    y1={coords.y1}
                    x2={coords.x2}
                    y2={coords.y2}
                    stroke={sample.color}
                    strokeWidth={isSelected ? '3' : '2'}
                    strokeDasharray="5,3"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </g>

          {/* X Axis Ticks & Labels */}
          <g className="x-axis-labels">
            {xTicks.map((tick, i) => {
              const x = scaleX(tick);
              return (
                <g key={`txtick-${i}`}>
                  <line x1={x} y1={margin.top + plotHeight} x2={x} y2={margin.top + plotHeight + 4} stroke="#94a3b8" />
                  <text
                    x={x}
                    y={margin.top + plotHeight + 16}
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="monospace"
                    fill="#475569"
                  >
                    {tick.toFixed(1)}
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
              log₁₀(j / mA cm⁻²)
            </text>
          </g>

          {/* Y Axis Ticks & Labels */}
          <g className="y-axis-labels">
            {yTicks.map((tick, i) => {
              const y = scaleY(tick);
              return (
                <g key={`tytick-${i}`}>
                  <line x1={margin.left - 4} y1={y} x2={margin.left} y2={y} stroke="#94a3b8" />
                  <text
                    x={margin.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fontFamily="monospace"
                    fill="#475569"
                  >
                    {yAxisMode === 'overpotential' ? Math.round(tick) : tick.toFixed(2)}
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
              {yAxisMode === 'overpotential' ? 'Overpotential η (mV)' : 'Potential (V vs. RHE)'}
            </text>
          </g>

          {/* Selection Box */}
          {isSelectingBox && selectionStart && selectionCurrent && (
            <rect
              x={Math.min(selectionStart.x, selectionCurrent.x)}
              y={Math.min(selectionStart.y, selectionCurrent.y)}
              width={Math.abs(selectionCurrent.x - selectionStart.x)}
              height={Math.abs(selectionCurrent.y - selectionStart.y)}
              fill="#10b981"
              fillOpacity="0.15"
              stroke="#059669"
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

        {/* Hover Tooltip */}
        {mousePos && (
          <div
            className="absolute pointer-events-none bg-slate-900/90 text-white rounded-lg px-2.5 py-2 text-[11px] shadow-lg backdrop-blur-xs space-y-1 z-20"
            style={{
              left: Math.min(mousePos.x + 15, dimensions.width - 180),
              top: Math.max(margin.top + 10, Math.min(mousePos.y - 30, dimensions.height - 120)),
            }}
          >
            <div className="font-mono text-slate-300 border-b border-slate-700 pb-0.5">
              <span>log(j): {mousePos.dataX.toFixed(2)}</span>
              {' | '}
              <span>η: {Math.round(mousePos.dataY)} mV</span>
            </div>
            {visibleSamples.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 text-[10px]">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-slate-200 font-semibold truncate">{s.name}</span>
                </div>
                <span className="font-mono text-emerald-300 font-bold">
                  {s.metrics.tafelSlope} mV/dec
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tafel Slope Pills at bottom */}
      <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50/40 text-[11px]">
        {visibleSamples.map(sample => (
          <button
            key={sample.id}
            onClick={() => onSelectSample(sample.id)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all ${
              sample.id === selectedSampleId
                ? 'bg-emerald-100/80 ring-1 ring-emerald-400 font-bold text-slate-900'
                : 'hover:bg-slate-200/60 text-slate-700'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sample.color }} />
            <span>{sample.name}:</span>
            <span className="font-mono font-bold text-emerald-700">{sample.metrics.tafelSlope} mV/dec</span>
          </button>
        ))}
      </div>
    </div>
  );
};
