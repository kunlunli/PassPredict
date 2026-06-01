import * as satellite from 'satellite.js';
import type { TLEEntry, ObserverLocation, SatellitePass, SatelliteTrack, PassPoint } from './types';

export const PASS_COLORS = [
  '#60a5fa', // blue
  '#f87171', // red
  '#4ade80', // green
  '#fbbf24', // yellow
  '#a78bfa', // purple
  '#fb923c', // orange
  '#34d399', // emerald
  '#f472b6', // pink
];

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

interface ParsedTLE {
  name: string;
  line1: string;
  line2: string;
}

function parseTLEText(text: string): ParsedTLE | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length < 2) return null;

  if (lines.length >= 3 && lines[1].startsWith('1 ') && lines[2].startsWith('2 ')) {
    return { name: lines[0], line1: lines[1], line2: lines[2] };
  }

  if (lines[0].startsWith('1 ') && lines[1].startsWith('2 ')) {
    const catNum = lines[0].substring(2, 7).trim();
    return { name: `SAT ${catNum}`, line1: lines[0], line2: lines[1] };
  }

  return null;
}

function buildPass(
  passId: string,
  entry: TLEEntry,
  satName: string,
  color: string,
  points: PassPoint[]
): SatellitePass {
  const maxEl = Math.max(...points.map(p => p.elevation));
  const maxElPoint = points.find(p => p.elevation === maxEl) ?? points[0];
  return {
    id: passId,
    satelliteId: entry.id,
    satelliteName: satName,
    color,
    points,
    startTime: points[0].time,
    endTime: points[points.length - 1].time,
    maxElevation: maxEl,
    maxElevationTime: maxElPoint.time,
    maxElevationAzimuth: maxElPoint.azimuth,
    duration:
      (points[points.length - 1].time.getTime() - points[0].time.getTime()) / 1000,
  };
}

type ObserverGd = { longitude: number; latitude: number; height: number };

// Propagate one point. Returns null if propagation fails.
function computePoint(
  satrec: satellite.SatRec,
  date: Date,
  observerGd: ObserverGd,
  minElevationDeg: number
): PassPoint | null {
  let posVel: ReturnType<typeof satellite.propagate>;
  try {
    posVel = satellite.propagate(satrec, date);
  } catch {
    return null;
  }
  const pos = posVel.position;
  if (!pos || typeof pos === 'boolean') return null;

  const gmst = satellite.gstime(date);
  const posEcf = satellite.eciToEcf(pos as { x: number; y: number; z: number }, gmst);
  const look = satellite.ecfToLookAngles(
    observerGd,
    posEcf as { x: number; y: number; z: number }
  );

  const elDeg = look.elevation * RAD2DEG;
  const azDeg = ((look.azimuth * RAD2DEG % 360) + 360) % 360;
  const ecf = posEcf as { x: number; y: number; z: number };
  const rKm = Math.sqrt(ecf.x ** 2 + ecf.y ** 2 + ecf.z ** 2);

  return {
    time: date,
    azimuth: azDeg,
    elevation: elDeg,
    range: look.rangeSat,
    satLat: Math.asin(ecf.z / rKm) * RAD2DEG,
    satLon: Math.atan2(ecf.y, ecf.x) * RAD2DEG,
    satAlt: rKm - 6371,
    visible: elDeg >= minElevationDeg,
  };
}

// Binary search for the precise moment elevation crosses minElevationDeg.
// t0Ms: the 30s step on the "below threshold" side.
// t1Ms: the 30s step on the "above threshold" side.
// ascending: true = AOS (below→above), false = LOS (above→below).
// After 10 iterations the window is 30000ms / 2^10 ≈ 0.03 s wide.
function refineCrossing(
  satrec: satellite.SatRec,
  observerGd: ObserverGd,
  t0Ms: number,
  t1Ms: number,
  minElevationDeg: number,
  ascending: boolean,
  iterations = 10
): PassPoint | null {
  let loMs = Math.min(t0Ms, t1Ms); // side below threshold
  let hiMs = Math.max(t0Ms, t1Ms); // side above threshold

  for (let i = 0; i < iterations; i++) {
    const midMs = (loMs + hiMs) / 2;
    const pt = computePoint(satrec, new Date(midMs), observerGd, minElevationDeg);
    if (!pt) break;

    if (ascending) {
      // AOS: lo stays below, hi stays above — converge hi downward
      if (pt.elevation < minElevationDeg) loMs = midMs;
      else hiMs = midMs;
    } else {
      // LOS: lo stays above, hi stays below — converge lo upward
      if (pt.elevation >= minElevationDeg) loMs = midMs;
      else hiMs = midMs;
    }
  }

  // AOS → first moment above threshold (hiMs); LOS → last moment above (loMs)
  const refinedMs = ascending ? hiMs : loMs;
  const pt = computePoint(satrec, new Date(refinedMs), observerGd, minElevationDeg);
  if (pt) pt.visible = true; // crossing point always belongs to the visible window
  return pt;
}

export function predictPasses(
  tleEntries: TLEEntry[],
  observer: ObserverLocation,
  durationDays = 3,
  minElevationDeg = 0,
  stepSeconds = 30
): { passes: SatellitePass[]; tracks: SatelliteTrack[] } {
  const observerGd: ObserverGd = {
    longitude: observer.longitude * DEG2RAD,
    latitude: observer.latitude * DEG2RAD,
    height: observer.altitude / 1000,
  };

  const now = new Date();
  const endMs = now.getTime() + durationDays * 24 * 3600 * 1000;
  const stepMs = stepSeconds * 1000;

  const allPasses: SatellitePass[] = [];
  const allTracks: SatelliteTrack[] = [];
  let passCounter = 0;

  for (let ei = 0; ei < tleEntries.length; ei++) {
    const entry = tleEntries[ei];
    const parsed = parseTLEText(entry.text);
    if (!parsed) continue;

    let satrec: satellite.SatRec;
    try {
      satrec = satellite.twoline2satrec(parsed.line1, parsed.line2);
    } catch {
      continue;
    }

    const color = PASS_COLORS[ei % PASS_COLORS.length];
    const satName = entry.name.trim() || parsed.name;
    let currentPoints: PassPoint[] = [];
    const trackPoints: PassPoint[] = [];
    let prevPoint: PassPoint | null = null;

    for (let t = now.getTime(); t <= endMs; t += stepMs) {
      const point = computePoint(satrec, new Date(t), observerGd, minElevationDeg);

      if (!point) {
        // Propagation failed — seal any in-progress pass and reset
        if (currentPoints.length >= 2) {
          const passId = `p${passCounter++}`;
          currentPoints.forEach(pt => { pt.passId = passId; });
          allPasses.push(buildPass(passId, entry, satName, color, currentPoints));
        }
        currentPoints = [];
        prevPoint = null;
        continue;
      }

      if (prevPoint !== null) {
        if (!prevPoint.visible && point.visible) {
          // ── AOS crossing detected ──────────────────────────────────────────
          // Binary-search for the exact moment elevation reaches minElevationDeg
          const aosPoint = refineCrossing(
            satrec, observerGd,
            prevPoint.time.getTime(), t,
            minElevationDeg, true
          );
          if (aosPoint) {
            trackPoints.push(aosPoint);   // insert refined AOS into the track
            currentPoints = [aosPoint];   // start new pass at exact threshold
          }
        } else if (prevPoint.visible && !point.visible) {
          // ── LOS crossing detected ──────────────────────────────────────────
          // Binary-search for the exact moment elevation drops to minElevationDeg
          const losPoint = refineCrossing(
            satrec, observerGd,
            prevPoint.time.getTime(), t,
            minElevationDeg, false
          );
          if (losPoint) {
            currentPoints.push(losPoint); // close pass at exact threshold
            trackPoints.push(losPoint);   // insert refined LOS into the track
          }
          if (currentPoints.length >= 2) {
            const passId = `p${passCounter++}`;
            currentPoints.forEach(pt => { pt.passId = passId; });
            allPasses.push(buildPass(passId, entry, satName, color, currentPoints));
          }
          currentPoints = [];
        }
      }

      trackPoints.push(point);
      if (point.visible) currentPoints.push(point);
      prevPoint = point;
    }

    // Seal a pass that extends to the end of the prediction window
    if (currentPoints.length >= 2) {
      const passId = `p${passCounter++}`;
      currentPoints.forEach(pt => { pt.passId = passId; });
      allPasses.push(buildPass(passId, entry, satName, color, currentPoints));
    }

    if (trackPoints.length >= 2) {
      allTracks.push({ satelliteId: entry.id, satelliteName: satName, color, points: trackPoints });
    }
  }

  const passes = allPasses.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return { passes, tracks: allTracks };
}
