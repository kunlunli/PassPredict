export interface TLEEntry {
  id: string;
  name: string;
  text: string;
}

export interface ObserverLocation {
  latitude: number;   // degrees, positive = North
  longitude: number;  // degrees, positive = East
  altitude: number;   // meters above sea level
}

export interface PassPoint {
  time: Date;
  azimuth: number;    // degrees, 0=N, 90=E, 180=S, 270=W (clockwise)
  elevation: number;  // degrees above horizon (negative = below horizon)
  range: number;      // km from observer
  satLat: number;     // satellite geodetic latitude (degrees)
  satLon: number;     // satellite longitude (degrees, -180..180)
  satAlt: number;     // satellite altitude above Earth surface (km)
  visible: boolean;   // true when elevation >= min-elevation threshold
  passId?: string;    // ID of the containing SatellitePass (only set on visible points)
}

// Full ground track for one satellite across the entire prediction window.
// Contains both visible and non-visible points — use the `visible` flag to distinguish.
export interface SatelliteTrack {
  satelliteId: string;
  satelliteName: string;
  color: string;
  points: PassPoint[];
}

export interface SatellitePass {
  id: string;
  satelliteId: string;
  satelliteName: string;
  color: string;
  points: PassPoint[];      // only the visible (above-threshold) points
  startTime: Date;
  endTime: Date;
  maxElevation: number;
  maxElevationTime: Date;
  maxElevationAzimuth: number;
  duration: number;         // seconds
}
