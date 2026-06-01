'use client';

import { SatellitePass } from '@/lib/types';

interface Props {
  passes: SatellitePass[];
  useUTC: boolean;
  onToggleUTC: (utc: boolean) => void;
  selectedPassId?: string;
  onSelectPass?: (id: string) => void;
}

function fmtTime(date: Date, utc: boolean): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: utc ? 'UTC' : undefined,
  });
}

function fmtDateKey(date: Date, utc: boolean): string {
  const y = utc ? date.getUTCFullYear() : date.getFullYear();
  const m = utc ? date.getUTCMonth() : date.getMonth();
  const d = utc ? date.getUTCDate() : date.getDate();
  return `${y}-${m}-${d}`;
}

function fmtDateLabel(date: Date, utc: boolean): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: utc ? 'UTC' : undefined,
  });
}

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function fmtAz(az: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(az / 45) % 8];
}

export function PassSchedule({
  passes,
  useUTC,
  onToggleUTC,
  selectedPassId,
  onSelectPass,
}: Props) {
  // Group passes by calendar date
  const groups = new Map<string, { label: string; passes: SatellitePass[] }>();
  for (const p of passes) {
    const key = fmtDateKey(p.startTime, useUTC);
    if (!groups.has(key)) {
      groups.set(key, { label: fmtDateLabel(p.startTime, useUTC), passes: [] });
    }
    groups.get(key)!.passes.push(p);
  }

  const sortedKeys = Array.from(groups.keys()).sort();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Pass Schedule
          {passes.length > 0 && (
            <span className="ml-2 text-blue-400 normal-case">
              {passes.length} pass{passes.length !== 1 ? 'es' : ''}
            </span>
          )}
        </h2>

        {/* UTC / Local toggle */}
        <div className="flex items-center bg-gray-800 rounded-full p-0.5 text-xs">
          <button
            onClick={() => onToggleUTC(true)}
            className={`px-3 py-1 rounded-full transition-colors ${
              useUTC
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            UTC
          </button>
          <button
            onClick={() => onToggleUTC(false)}
            className={`px-3 py-1 rounded-full transition-colors ${
              !useUTC
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Local
          </button>
        </div>
      </div>

      {/* Empty state */}
      {passes.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-600 py-8">
          <div className="text-3xl mb-3 opacity-30">📡</div>
          <p className="text-sm">No passes found.</p>
          <p className="text-xs mt-1">
            Add TLEs, set location, then click Predict.
          </p>
        </div>
      )}

      {/* Pass list */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {sortedKeys.map(key => {
          const group = groups.get(key)!;
          return (
            <div key={key}>
              <div className="sticky top-0 bg-gray-950 py-1 text-xs font-semibold text-blue-400 border-b border-gray-800 mb-2">
                {group.label}
                {useUTC && (
                  <span className="ml-1 text-gray-600 font-normal">UTC</span>
                )}
              </div>

              <div className="space-y-1.5">
                {group.passes.map(pass => {
                  const selected = pass.id === selectedPassId;
                  return (
                    <button
                      key={pass.id}
                      onClick={() => onSelectPass?.(pass.id)}
                      className={`w-full text-left flex items-start gap-2 p-2 rounded-lg transition-colors ${
                        selected
                          ? 'bg-blue-900/40 border border-blue-700/60'
                          : 'bg-gray-900/60 hover:bg-gray-800/80 border border-transparent'
                      }`}
                    >
                      {/* Color dot */}
                      <span
                        className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                        style={{ backgroundColor: pass.color }}
                      />

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">
                          {pass.satelliteName}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">
                          {fmtTime(pass.startTime, useUTC)}
                          <span className="text-gray-600 mx-1">→</span>
                          {fmtTime(pass.endTime, useUTC)}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {fmtDuration(pass.duration)}
                        </div>
                      </div>

                      {/* Max elevation + azimuth */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-mono text-yellow-400">
                          {pass.maxElevation.toFixed(1)}°
                        </div>
                        <div className="text-xs text-gray-600">
                          {fmtAz(pass.maxElevationAzimuth)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
