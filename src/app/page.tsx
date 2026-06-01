'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useMemo } from 'react';
import { TLEInput } from '@/components/TLEInput';
import { LocationInput } from '@/components/LocationInput';
import { PolarPlot } from '@/components/PolarPlot';
import { PassSchedule } from '@/components/PassSchedule';
import { predictPasses } from '@/lib/passPredict';
import type { TLEEntry, ObserverLocation, SatellitePass, SatelliteTrack } from '@/lib/types';

const GlobeView = dynamic(() => import('@/components/GlobeView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-xl bg-[#040810] flex items-center justify-center">
      <span className="text-gray-600 text-sm animate-pulse">Loading 3D engine…</span>
    </div>
  ),
});

const DEFAULT_LOCATION: ObserverLocation = {
  latitude: 36.9799,
  longitude: 127.1045,
  altitude: 30,
};

function makeEntry(): TLEEntry {
  return { id: crypto.randomUUID(), name: '', text: '' };
}

type ViewMode = 'sky' | 'globe';

export default function Home() {
  const [entries, setEntries] = useState<TLEEntry[]>([makeEntry()]);
  const [location, setLocation] = useState<ObserverLocation>(DEFAULT_LOCATION);
  const [durationDays, setDurationDays] = useState(3);
  const [minEl, setMinEl] = useState(5);
  const [passes, setPasses] = useState<SatellitePass[]>([]);
  const [tracks, setTracks] = useState<SatelliteTrack[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [useUTC, setUseUTC] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string>();
  const [ran, setRan] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('sky');

  const hasValidTLE = entries.some(e => e.text.trim().length > 10);

  // Which satellite is currently selected (derived from selected pass ID)
  const selectedSatelliteId = useMemo(
    () => passes.find(p => p.id === selectedId)?.satelliteId,
    [passes, selectedId]
  );

  const handlePredict = useCallback(() => {
    setComputing(true);
    setError(undefined);
    setTimeout(() => {
      try {
        const valid = entries.filter(e => e.text.trim().length > 0);
        const { passes: result, tracks: trackResult } = predictPasses(valid, location, durationDays, minEl);
        setPasses(result);
        setTracks(trackResult);
        setSelectedId(result[0]?.id);
        setRan(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Prediction failed');
      } finally {
        setComputing(false);
      }
    }, 10);
  }, [entries, location, durationDays, minEl]);

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-gray-950 text-white">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-gray-800 px-5 py-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">

          {/* Title */}
          <div className="flex-shrink-0">
            <h1 className="text-base font-bold tracking-tight leading-tight">
              🛰 Satellite Pass Predictor
            </h1>
            <p className="text-xs text-gray-500 leading-tight">SGP4 propagation</p>
          </div>

          {/* ── View toggle ── */}
          <div className="flex items-center gap-1.5 bg-gray-800/70 rounded-lg p-1 flex-shrink-0">
            <button
              onClick={() => setViewMode('sky')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'sky'
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🔭 Sky View
            </button>
            <button
              onClick={() => setViewMode('globe')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'globe'
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🌏 Globe View
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap ml-auto">
            <span className="text-xs text-gray-600 hidden sm:block">
              {viewMode === 'sky'
                ? 'Hover path for details · click to select'
                : 'Solid = visible pass · dashed = full orbit · drag to rotate'}
            </span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Days</label>
              <select
                value={durationDays}
                onChange={e => setDurationDays(Number(e.target.value))}
                className="bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-700 focus:outline-none"
              >
                {[1, 2, 3, 4, 5, 7].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Min El</label>
              <select
                value={minEl}
                onChange={e => setMinEl(Number(e.target.value))}
                className="bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-700 focus:outline-none"
              >
                {[0, 5, 10, 15, 20, 30].map(el => (
                  <option key={el} value={el}>{el}°</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 px-4 pt-3 pb-3">
        <div className="grid grid-cols-12 gap-4 h-full">

          {/* ── Left: TLE + Location ──────────────────────────────────────── */}
          <aside className="col-span-3 flex flex-col gap-4 overflow-y-auto min-h-0 pr-1">
            <TLEInput entries={entries} onChange={setEntries} />
            <div className="border-t border-gray-800" />
            <LocationInput location={location} onChange={setLocation} />
            <div className="border-t border-gray-800" />
            <button
              onClick={handlePredict}
              disabled={computing || !hasValidTLE}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {computing ? 'Computing…' : 'Update View'}
            </button>
          </aside>

          {/* ── Center: view ─────────────────────────────────────────────── */}
          <section className="col-span-6 relative min-h-0">

            {/* Sky view */}
            <div
              className="absolute inset-0 transition-opacity duration-150"
              style={{
                opacity: viewMode === 'sky' ? 1 : 0,
                pointerEvents: viewMode === 'sky' ? 'auto' : 'none',
              }}
            >
              <PolarPlot
                tracks={tracks}
                selectedSatelliteId={selectedSatelliteId}
                onSelectPass={setSelectedId}
                observerLat={location.latitude}
                observerLon={location.longitude}
              />
            </div>

            {/* Globe view */}
            <div
              className="absolute inset-0 transition-opacity duration-150"
              style={{
                opacity: viewMode === 'globe' ? 1 : 0,
                pointerEvents: viewMode === 'globe' ? 'auto' : 'none',
              }}
            >
              <GlobeView
                tracks={tracks}
                selectedSatelliteId={selectedSatelliteId}
                observerLat={location.latitude}
                observerLon={location.longitude}
              />
            </div>

            {/* Legend */}
            {tracks.length > 0 && (
              <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-x-3 gap-y-1 pointer-events-none">
                {tracks.map(track => (
                  <div key={track.satelliteId} className="flex items-center gap-1.5 bg-gray-950/75 rounded px-2 py-0.5">
                    <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: track.color }} />
                    <span className="text-xs text-gray-300">{track.satelliteName}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Empty-state / error overlays */}
            {!ran && !computing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <p className="text-xs text-gray-600 bg-gray-950/70 px-3 py-1.5 rounded-full">
                  Load TLEs → set location → click{' '}
                  <strong className="text-gray-400">Update View</strong>
                </p>
              </div>
            )}
            {ran && passes.length === 0 && !computing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <p className="text-xs text-yellow-700 bg-gray-950/70 px-3 py-1.5 rounded-full">
                  No passes above {minEl}° in {durationDays} day{durationDays > 1 ? 's' : ''}.
                  Try lowering Min El or adding more days.
                </p>
              </div>
            )}
            {error && (
              <div className="absolute bottom-8 inset-x-0 flex justify-center pointer-events-none z-10">
                <p className="text-xs text-red-400 bg-gray-950/80 px-3 py-1 rounded">{error}</p>
              </div>
            )}
          </section>

          {/* ── Right: pass schedule ───────────────────────────────────────── */}
          <section className="col-span-3 flex flex-col min-h-0 overflow-hidden">
            <PassSchedule
              passes={passes}
              useUTC={useUTC}
              onToggleUTC={setUseUTC}
              selectedPassId={selectedId}
              onSelectPass={setSelectedId}
            />
          </section>

        </div>
      </main>
    </div>
  );
}
