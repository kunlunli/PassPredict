'use client';

import { ObserverLocation } from '@/lib/types';

interface Props {
  location: ObserverLocation;
  onChange: (loc: ObserverLocation) => void;
}

function Field({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={e => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        className="w-full bg-gray-900 text-white text-sm rounded px-2 py-1.5 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

export function LocationInput({ location, onChange }: Props) {
  const set = (key: keyof ObserverLocation) => (v: number) =>
    onChange({ ...location, [key]: v });

  const latStr =
    location.latitude >= 0
      ? `${location.latitude.toFixed(4)}°N`
      : `${Math.abs(location.latitude).toFixed(4)}°S`;
  const lonStr =
    location.longitude >= 0
      ? `${location.longitude.toFixed(4)}°E`
      : `${Math.abs(location.longitude).toFixed(4)}°W`;

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Observer Location
      </h2>

      <div className="grid grid-cols-3 gap-2">
        <Field
          label="Latitude (°)"
          value={location.latitude}
          min={-90}
          max={90}
          step={0.0001}
          onChange={set('latitude')}
        />
        <Field
          label="Longitude (°)"
          value={location.longitude}
          min={-180}
          max={180}
          step={0.0001}
          onChange={set('longitude')}
        />
        <Field
          label="Altitude (m)"
          value={location.altitude}
          min={0}
          max={9000}
          step={1}
          onChange={set('altitude')}
        />
      </div>

      <p className="text-xs text-gray-600 font-mono">
        {latStr}, {lonStr}, {location.altitude} m ASL
      </p>
    </div>
  );
}
