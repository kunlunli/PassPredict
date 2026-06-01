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

  if (
    lines.length >= 3 &&
    lines[1].startsWith('1 ') &&
    lines[2].startsWith('2 ')
  ) {
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
      (points[points.length - 1].time.getTime() - points[0].time.getTime()) /
      1000,
  };
}

export function predictPasses(
  tleEntries: TLEEntry[],
  observer: ObserverLocation,
  durationDays = 3,
  minElevationDeg = 0,
  stepSeconds = 30
): { passes: SatellitePass[]; tracks: SatelliteTrack[] } {
  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  const observerGd = {
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
    let currentPoints: PassPoint[] = [];   // visible points in current pass window
    const trackPoints: PassPoint[] = [];   // ALL points across the prediction window

    for (let t = now.getTime(); t <= endMs; t += stepMs) {
      const date = new Date(t);
      let posVel: ReturnType<typeof satellite.propagate>;

      try {
        posVel = satellite.propagate(satrec, date);
      } catch {
        // Propagation failed — seal any in-progress visible pass and skip this step
        if (currentPoints.length >= 2) {
          const passId = `p${passCounter++}`;
          currentPoints.forEach(pt => { pt.passId = passId; });
          allPasses.push(buildPass(passId, entry, satName, color, currentPoints));
        }
        currentPoints = [];
        continue;
      }

      const pos = posVel.position;
      if (!pos || typeof pos === 'boolean') {
        if (currentPoints.length >= 2) {
          const passId = `p${passCounter++}`;
          currentPoints.forEach(pt => { pt.passId = passId; });
          allPasses.push(buildPass(passId, entry, satName, color, currentPoints));
        }
        currentPoints = [];
        continue;
      }

      const gmst = satellite.gstime(date);
      const posEcf = satellite.eciToEcf(
        pos as { x: number; y: number; z: number },
        gmst
      );
      const look = satellite.ecfToLookAngles(
        observerGd,
        posEcf as { x: number; y: number; z: number }
      );

      const elDeg = look.elevation * RAD2DEG;
      const azDeg = ((look.azimuth * RAD2DEG % 360) + 360) % 360;

      const ecf = posEcf as { x: number; y: number; z: number };
      const rKm = Math.sqrt(ecf.x ** 2 + ecf.y ** 2 + ecf.z ** 2);
      const satLat = Math.asin(ecf.z / rKm) * RAD2DEG;
      const satLon = Math.atan2(ecf.y, ecf.x) * RAD2DEG;
      const satAlt = rKm - 6371;

      const visible = elDeg >= minElevationDeg;
      const point: PassPoint = {
        time: date,
        azimuth: azDeg,
        elevation: elDeg,
        range: look.rangeSat,
        satLat,
        satLon,
        satAlt,
        visible,
      };

      // Full track always gets this point
      trackPoints.push(point);

      if (visible) {
        currentPoints.push(point);
      } else {
        if (currentPoints.length >= 2) {
          const passId = `p${passCounter++}`;
          // Mutate the shared point objects — trackPoints references the same instances
          currentPoints.forEach(pt => { pt.passId = passId; });
          allPasses.push(buildPass(passId, entry, satName, color, currentPoints));
        }
        currentPoints = [];
      }
    }

    if (currentPoints.length >= 2) {
      const passId = `p${passCounter++}`;
      currentPoints.forEach(pt => { pt.passId = passId; });
      allPasses.push(buildPass(passId, entry, satName, color, currentPoints));
    }

    if (trackPoints.length >= 2) {
      allTracks.push({
        satelliteId: entry.id,
        satelliteName: satName,
        color,
        points: trackPoints,
      });
    }
  }

  const passes = allPasses.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return { passes, tracks: allTracks };
}
