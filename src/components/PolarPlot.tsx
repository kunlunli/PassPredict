'use client';

import { useRef, useState } from 'react';
import { SatelliteTrack, PassPoint } from '@/lib/types';

interface Props {
  tracks: SatelliteTrack[];
  selectedSatelliteId?: string;
  onSelectPass?: (id: string) => void;
  observerLat: number;
  observerLon: number;
}

const SIZE = 500;
const CENTER = SIZE / 2;
const RADIUS = 220;


function azElToXY(azDeg: number, elDeg: number): [number, number] {
  const r = RADIUS * (1 - elDeg / 90);
  const azRad = (azDeg * Math.PI) / 180;
  return [CENTER + r * Math.sin(azRad), CENTER - r * Math.cos(azRad)];
}

const ELEVATION_RINGS = [0, 30, 60];
const CARDINALS = [
  { label: 'N',  az: 0,   size: 16, weight: 'bold',   color: '#94a3b8' },
  { label: 'NE', az: 45,  size: 11, weight: 'normal', color: '#475569' },
  { label: 'E',  az: 90,  size: 16, weight: 'bold',   color: '#94a3b8' },
  { label: 'SE', az: 135, size: 11, weight: 'normal', color: '#475569' },
  { label: 'S',  az: 180, size: 16, weight: 'bold',   color: '#94a3b8' },
  { label: 'SW', az: 225, size: 11, weight: 'normal', color: '#475569' },
  { label: 'W',  az: 270, size: 16, weight: 'bold',   color: '#94a3b8' },
  { label: 'NW', az: 315, size: 11, weight: 'normal', color: '#475569' },
];
const LABEL_R = RADIUS + 22;

interface Tooltip {
  x: number;
  y: number;
  point: PassPoint;
  passName: string;
  color: string;
}

function buildPath(points: PassPoint[]): string {
  return points
    .map((p, i) => {
      const [x, y] = azElToXY(p.azimuth, p.elevation);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// Split a point array into contiguous runs of same visibility
function groupByVisibility(points: PassPoint[]): { visible: boolean; pts: PassPoint[] }[] {
  if (!points.length) return [];
  const segs: { visible: boolean; pts: PassPoint[] }[] = [];
  let cur = { visible: points[0].visible, pts: [points[0]] };
  for (let i = 1; i < points.length; i++) {
    if (points[i].visible === cur.visible) {
      cur.pts.push(points[i]);
    } else {
      segs.push(cur);
      cur = { visible: points[i].visible, pts: [points[i]] };
    }
  }
  segs.push(cur);
  return segs;
}

export function PolarPlot({ tracks, selectedSatelliteId, onSelectPass, observerLat, observerLon }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  function formatUTC(d: Date) {
    return d.toUTCString().slice(17, 25);
  }

  function handleMouseMove(e: React.MouseEvent, track: SatelliteTrack) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * SIZE;
    const svgY = ((e.clientY - rect.top) / rect.height) * SIZE;
    const visiblePts = track.points.filter(p => p.visible);
    let nearest = visiblePts[0] ?? track.points[0];
    let bestDist = Infinity;
    for (const pt of visiblePts) {
      const [px, py] = azElToXY(pt.azimuth, pt.elevation);
      const d2 = (px - svgX) ** 2 + (py - svgY) ** 2;
      if (d2 < bestDist) { bestDist = d2; nearest = pt; }
    }
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      point: nearest,
      passName: track.satelliteName,
      color: track.color,
    });
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="relative flex-1 min-h-0">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ background: '#080e1a', display: 'block' }}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Horizon fill */}
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#0d1829" />

          {/* Elevation rings */}
          {ELEVATION_RINGS.map(el => {
            const r = RADIUS * (1 - el / 90);
            return (
              <g key={el}>
                <circle
                  cx={CENTER} cy={CENTER} r={r}
                  fill="none"
                  stroke="#1e3a5f"
                  strokeWidth={el === 0 ? 1.2 : 0.7}
                  strokeDasharray={el > 0 ? '5 5' : undefined}
                />
                {el > 0 && (
                  <text
                    x={CENTER + 6} y={CENTER - r + 14}
                    fill="#2a4a70" fontSize="11" fontFamily="monospace"
                  >
                    {el}°
                  </text>
                )}
              </g>
            );
          })}

          {/* Cross hairs */}
          <line x1={CENTER} y1={CENTER - RADIUS} x2={CENTER} y2={CENTER + RADIUS}
            stroke="#132238" strokeWidth="0.6" />
          <line x1={CENTER - RADIUS} y1={CENTER} x2={CENTER + RADIUS} y2={CENTER}
            stroke="#132238" strokeWidth="0.6" />

          {/* Cardinal labels */}
          {CARDINALS.map(({ label, az, size, weight, color }) => {
            const azRad = (az * Math.PI) / 180;
            const x = CENTER + LABEL_R * Math.sin(azRad);
            const y = CENTER - LABEL_R * Math.cos(azRad);
            return (
              <text
                key={label}
                x={x} y={y}
                fill={color}
                fontSize={size}
                fontFamily="sans-serif"
                fontWeight={weight}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {label}
              </text>
            );
          })}

          {/* Satellite tracks */}
          {tracks.map(track => {
            const isSelected = track.satelliteId === selectedSatelliteId;

                        // Group the full track so non-visible gaps separate distinct pass arcs,
            // then render only the visible segments.
            const segs = groupByVisibility(track.points);
            const visSegs = segs.filter(s => s.visible && s.pts.length >= 2);
            if (visSegs.length === 0) return null;

            return (
              <g key={track.satelliteId}>

                {/* ── Visible solid segments (drawn on top) ── */}
                {visSegs.map((seg, si) => {
                  const d = buildPath(seg.pts);
                  const first = seg.pts[0];
                  const last = seg.pts[seg.pts.length - 1];
                  const maxPt = seg.pts.reduce((a, b) => b.elevation > a.elevation ? b : a);
                  const [sx, sy] = azElToXY(first.azimuth, first.elevation);
                  const [ex, ey] = azElToXY(last.azimuth, last.elevation);
                  const [mx, my] = azElToXY(maxPt.azimuth, maxPt.elevation);

                  return (
                    <g key={`v-${si}`} style={{ cursor: 'pointer' }}>
                      {/* Selection glow */}
                      {isSelected && (
                        <path d={d} fill="none" stroke={track.color}
                          strokeWidth="6" strokeOpacity="0.15"
                          strokeLinecap="round" strokeLinejoin="round"
                          pointerEvents="none" />
                      )}

                      {/* Fat transparent hit area */}
                      <path
                        d={d} fill="none" stroke="transparent" strokeWidth={14}
                        onClick={() => { if (first.passId) onSelectPass?.(first.passId); }}
                        onMouseMove={e => handleMouseMove(e, track)}
                        onMouseLeave={() => setTooltip(null)}
                      />

                      {/* Trajectory */}
                      <path
                        d={d} fill="none"
                        stroke={track.color}
                        strokeWidth={isSelected ? 1.5 : 1}
                        strokeOpacity={isSelected ? 1 : 0.65}
                        strokeLinecap="round" strokeLinejoin="round"
                        pointerEvents="none"
                      />

                      {/* AOS — label above dot */}
                      <circle cx={sx} cy={sy} r={5} fill={track.color} opacity={0.9} pointerEvents="none" />
                      <text x={sx + 8} y={sy - 5} fill={track.color} fontSize="10"
                        fontFamily="monospace" opacity={isSelected ? 1 : 0.6} pointerEvents="none">
                        AOS
                      </text>

                      {/* LOS — label below dot so it stays readable when AOS/LOS are coincident */}
                      <circle cx={ex} cy={ey} r={5} fill="none"
                        stroke={track.color} strokeWidth="1.5" opacity={0.8} pointerEvents="none" />
                      <text x={ex + 8} y={ey + 13} fill={track.color} fontSize="10"
                        fontFamily="monospace" opacity={isSelected ? 0.9 : 0.5} pointerEvents="none">
                        LOS
                      </text>

                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Observer marker (zenith = directly overhead) */}
          <circle cx={CENTER} cy={CENTER} r={7} fill="#fbbf24" opacity={0.9} />
          <circle cx={CENTER} cy={CENTER} r={3} fill="#ffffff" opacity={0.95} />
          <text
            x={CENTER + 11} y={CENTER - 8}
            fill="#fbbf24" fontSize="10" fontFamily="monospace"
            opacity={0.9}
          >
            {Math.abs(observerLat).toFixed(2)}°{observerLat >= 0 ? 'N' : 'S'}
          </text>
          <text
            x={CENTER + 11} y={CENTER + 4}
            fill="#fbbf24" fontSize="10" fontFamily="monospace"
            opacity={0.9}
          >
            {Math.abs(observerLon).toFixed(2)}°{observerLon >= 0 ? 'E' : 'W'}
          </text>
        </svg>

        {/* Hover tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 text-xs rounded px-2 py-1.5 shadow-xl"
            style={{
              left: tooltip.x + 14,
              top: tooltip.y - 12,
              background: '#0f172a',
              border: `1px solid ${tooltip.color}`,
              color: '#e2e8f0',
            }}
          >
            <div style={{ color: tooltip.color }} className="font-semibold mb-0.5">
              {tooltip.passName}
            </div>
            <div className="font-mono space-y-0.5">
              <div>Az: {tooltip.point.azimuth.toFixed(1)}°</div>
              <div>El: {tooltip.point.elevation.toFixed(1)}°</div>
              <div>Rng: {tooltip.point.range.toFixed(0)} km</div>
              <div>{formatUTC(tooltip.point.time)} UTC</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
