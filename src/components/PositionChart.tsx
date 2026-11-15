import { useMemo, useRef, useState } from 'react';
import type { ChartData, ChartSeries } from '../../shared/types';

type PositionChartProps = {
  chart: ChartData;
  onCitation: (factId: string) => void;
};

const WIDTH = 1100;
const HEIGHT = 500;
const PAD = { top: 28, right: 26, bottom: 44, left: 56 };
const INNER_W = WIDTH - PAD.left - PAD.right;
const INNER_H = HEIGHT - PAD.top - PAD.bottom;

function markerClass(kind: string): string {
  if (kind === 'safety_car') return 'marker marker-sc';
  if (kind === 'red_flag') return 'marker marker-red';
  if (kind === 'lead_change') return 'marker marker-lead';
  return 'marker';
}

function tickStep(maxLap: number): number {
  if (maxLap <= 30) return 5;
  if (maxLap <= 60) return 10;
  return 10;
}

export function PositionChart({ chart, onCitation }: PositionChartProps) {
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [emphasis, setEmphasis] = useState<number | null>(null);
  const [hoverLap, setHoverLap] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const visibleSeries = useMemo(
    () => chart.series.filter((series) => !hidden.has(series.driverNumber)),
    [chart.series, hidden],
  );

  const x = (lap: number): number => {
    if (chart.maxLap <= 1) return PAD.left + INNER_W / 2;
    return PAD.left + ((lap - 1) / (chart.maxLap - 1)) * INNER_W;
  };

  const y = (position: number): number => {
    if (chart.driverCount <= 1) return PAD.top + INNER_H / 2;
    return PAD.top + ((position - 1) / (chart.driverCount - 1)) * INNER_H;
  };

  const xTicks = useMemo(() => {
    const step = tickStep(chart.maxLap);
    const ticks: number[] = [1];
    for (let lap = step; lap <= chart.maxLap; lap += step) {
      if (lap !== 1) ticks.push(lap);
    }
    return ticks;
  }, [chart.maxLap]);

  const yTicks = useMemo(() => {
    const step = chart.driverCount <= 12 ? 2 : 5;
    const ticks: number[] = [];
    for (let position = 1; position <= chart.driverCount; position += step) ticks.push(position);
    if (ticks[ticks.length - 1] !== chart.driverCount) ticks.push(chart.driverCount);
    return ticks;
  }, [chart.driverCount]);

  const standings = useMemo(() => {
    if (hoverLap == null) return [];
    return visibleSeries
      .map((series) => {
        const point = series.points.find((candidate) => candidate.lap === hoverLap);
        return point?.position == null ? null : { series, position: point.position };
      })
      .filter((entry): entry is { series: ChartSeries; position: number } => entry != null)
      .sort((a, b) => a.position - b.position);
  }, [hoverLap, visibleSeries]);

  const toggleDriver = (driverNumber: number) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(driverNumber)) next.delete(driverNumber);
      else next.add(driverNumber);
      return next;
    });
  };

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (viewX - PAD.left) / INNER_W;
    const lap = Math.round(ratio * (chart.maxLap - 1) + 1);
    setHoverLap(Math.max(1, Math.min(chart.maxLap, lap)));
  };

  const tooltipLeft = hoverLap == null ? 50 : Math.min(86, Math.max(14, (x(hoverLap) / WIDTH) * 100));

  return (
    <div className="chart-card card">
      <div className="chart-heading">
        <div>
          <p className="eyebrow">Race position by lap</p>
          <h2>Position chart</h2>
          <p className="muted chart-subtitle">
            P1 at the top. Hover to inspect a lap; click a driver in the legend to hide or reveal their line.
          </p>
        </div>
        <div className="chart-facts">
          <span className="chip">{chart.driverCount} drivers</span>
          <span className="chip">{chart.maxLap} laps</span>
          <span className="chip">{chart.markers.length} markers</span>
        </div>
      </div>

      <div className="chart-frame">
        <div className="chart-canvas">
          <svg
            ref={svgRef}
            className="position-chart"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`Race position by lap for ${chart.driverCount} drivers over ${chart.maxLap} laps`}
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverLap(null)}
          >
            <defs>
              <linearGradient id="chart-bg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#111827" />
                <stop offset="100%" stopColor="#0b101a" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="url(#chart-bg)" rx="16" />

            {yTicks.map((position) => (
              <g key={`y-${position}`}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={y(position)}
                  y2={y(position)}
                  className={position === 1 ? 'chart-grid chart-grid-lead' : 'chart-grid'}
                />
                <text x={PAD.left - 14} y={y(position) + 4} className="chart-axis-label" textAnchor="end">
                  P{position}
                </text>
              </g>
            ))}
            {xTicks.map((lap) => (
              <g key={`x-${lap}`}>
                <line
                  x1={x(lap)}
                  x2={x(lap)}
                  y1={PAD.top}
                  y2={HEIGHT - PAD.bottom}
                  className="chart-grid chart-grid-vertical"
                />
                <text x={x(lap)} y={HEIGHT - PAD.bottom + 22} className="chart-axis-label" textAnchor="middle">
                  {lap}
                </text>
              </g>
            ))}
            <text x={(PAD.left + WIDTH - PAD.right) / 2} y={HEIGHT - 6} className="chart-axis-title" textAnchor="middle">
              Lap
            </text>

            {chart.markers.map((marker, index) => (
              <g key={`${marker.kind}-${marker.lap}-${index}`}>
                <line
                  x1={x(marker.lap)}
                  x2={x(marker.lap)}
                  y1={PAD.top}
                  y2={HEIGHT - PAD.bottom}
                  className={markerClass(marker.kind)}
                />
                <circle cx={x(marker.lap)} cy={PAD.top - 8} r="3.5" className={markerClass(marker.kind)}>
                  <title>{`${marker.label} · lap ${marker.lap}`}</title>
                </circle>
              </g>
            ))}

            {visibleSeries.map((series) => {
              const dimmed = emphasis != null && emphasis !== series.driverNumber;
              let path = '';
              let open = false;
              for (const point of series.points) {
                if (point.position == null) {
                  open = false;
                  continue;
                }
                path += `${open ? 'L' : 'M'}${x(point.lap).toFixed(2)},${y(point.position).toFixed(2)} `;
                open = true;
              }
              return (
                <path
                  key={series.driverNumber}
                  d={path.trim()}
                  fill="none"
                  stroke={series.colour}
                  strokeWidth={emphasis === series.driverNumber ? 3 : 1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={dimmed ? 0.1 : emphasis === series.driverNumber ? 1 : 0.72}
                  vectorEffect="non-scaling-stroke"
                  className="chart-line"
                >
                  <title>{`${series.name} (${series.acronym}) · ${series.status === 'classified' ? `P${series.finishPosition}` : series.status}`}</title>
                </path>
              );
            })}

            {hoverLap != null ? (
              <line
                x1={x(hoverLap)}
                x2={x(hoverLap)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                className="chart-hover-line"
              />
            ) : null}
          </svg>

          {hoverLap != null ? (
            <div className="chart-tooltip" style={{ left: `${tooltipLeft}%` }}>
              <div className="chart-tooltip-head">
                <span>Lap {hoverLap}</span>
                <span className="muted">{standings.length} cars</span>
              </div>
              {standings.slice(0, 8).map((entry) => (
                <div className="chart-tooltip-row" key={entry.series.driverNumber}>
                  <span className="chart-dot" style={{ background: entry.series.colour }} />
                  <span className="chart-tooltip-pos">P{entry.position}</span>
                  <span className="chart-tooltip-name">{entry.series.acronym}</span>
                  <span className="chart-tooltip-full">{entry.series.name}</span>
                </div>
              ))}
              {standings.length > 8 ? <div className="chart-tooltip-more">+{standings.length - 8} more</div> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="chart-legend">
        {chart.series.map((series) => {
          const isHidden = hidden.has(series.driverNumber);
          return (
            <button
              type="button"
              key={series.driverNumber}
              className={`legend-item${isHidden ? ' legend-hidden' : ''}${emphasis === series.driverNumber ? ' legend-emphasis' : ''}`}
              onClick={() => toggleDriver(series.driverNumber)}
              onMouseEnter={() => setEmphasis(series.driverNumber)}
              onMouseLeave={() => setEmphasis(null)}
              title={`${series.name} · ${series.team} · ${
                series.status === 'classified' ? `finished P${series.finishPosition}` : series.status
              }`}
            >
              <span className="legend-swatch" style={{ background: series.colour }} />
              <span className="legend-acronym">{series.acronym}</span>
              <span className="legend-place">{series.status === 'classified' ? `P${series.finishPosition}` : series.status}</span>
            </button>
          );
        })}
        {hidden.size > 0 ? (
          <button type="button" className="legend-reset" onClick={() => setHidden(new Set())}>
            Show all
          </button>
        ) : null}
      </div>

      <div className="chart-footer">
        <div className="chart-markers">
          {chart.markers.length === 0 ? (
            <span className="muted">No safety-car, red-flag or lead-change markers.</span>
          ) : (
            chart.markers.map((marker, index) => (
              <button
                type="button"
                key={`${marker.kind}-${marker.lap}-${index}`}
                className="marker-pill"
                onClick={() => (marker.factId ? onCitation(marker.factId) : undefined)}
                title={marker.factId ? `Open ${marker.factId}` : marker.label}
              >
                <span className={`marker-swatch marker-swatch-${marker.kind}`} />
                Lap {marker.lap} · {marker.label}
                {marker.factId ? <span className="marker-fact">{marker.factId}</span> : null}
              </button>
            ))
          )}
        </div>
        <ul className="chart-notes">
          {chart.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
