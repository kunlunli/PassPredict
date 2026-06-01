'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SatelliteTrack, PassPoint } from '@/lib/types';

const R_EARTH = 6371; // km, reference radius

// Fixed visual altitude for all satellite arcs so GEO/LEO both render within the viewport
const ORBIT_DISPLAY_KM = 800;

// Geographic lat/lon/alt → Three.js Vector3 (Y = north pole)
function geo2vec(lat: number, lon: number, altKm = 0): THREE.Vector3 {
  const r = (R_EARTH + altKm) / R_EARTH; // normalized
  const φ = (lat * Math.PI) / 180;
  const λ = (lon * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(φ) * Math.cos(λ),
    r * Math.sin(φ),
    r * Math.cos(φ) * Math.sin(λ)
  );
}

function latCircle(lat: number, step = 2): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let lon = 0; lon <= 360; lon += step) pts.push(geo2vec(lat, lon));
  return pts;
}
function lonMeridian(lon: number, step = 2): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let lat = -90; lat <= 90; lat += step) pts.push(geo2vec(lat, lon));
  return pts;
}

function makeLine(
  pts: THREE.Vector3[],
  color: THREE.ColorRepresentation,
  opacity = 1
): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.Line(geo, mat);
}

function makeDot(
  pos: THREE.Vector3,
  color: THREE.ColorRepresentation,
  radius = 0.015
): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 10, 10);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  return mesh;
}

// Split a point array into contiguous runs of the same visibility
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

interface Props {
  tracks: SatelliteTrack[];
  selectedSatelliteId?: string;
  observerLat: number;
  observerLon: number;
}

export default function GlobeView({
  tracks,
  selectedSatelliteId,
  observerLat,
  observerLon,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 600;
    const h = container.clientHeight || 500;

    // ── Renderer ────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x040810);
    container.appendChild(renderer.domElement);

    // ── Scene / Camera ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.001, 500);
    camera.position.set(0, 0, 3.2);

    // ── Orbit controls ───────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 1.25;
    controls.maxDistance = 10;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;

    // ── Lighting ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x334466, 4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(6, 3, 5);
    scene.add(sun);

    // ── Earth sphere ─────────────────────────────────────────────────────────
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshPhongMaterial({
        color: 0x0d2d52,
        emissive: 0x061220,
        specular: 0x1a4a8a,
        shininess: 15,
      })
    );
    scene.add(earthMesh);

    // Atmosphere shell
    const atmMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.028, 48, 48),
      new THREE.MeshPhongMaterial({
        color: 0x1a6fd4,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
      })
    );
    scene.add(atmMesh);

    // ── Graticule ────────────────────────────────────────────────────────────
    const gridColor = 0x1a3a60;
    const gridOpacity = 0.45;

    for (const lat of [-60, -30, 30, 60]) {
      scene.add(makeLine(latCircle(lat), gridColor, gridOpacity));
    }
    scene.add(makeLine(latCircle(0), 0x2255aa, 0.65));

    for (let lon = 0; lon < 360; lon += 30) {
      scene.add(makeLine(lonMeridian(lon), gridColor, gridOpacity));
    }

    scene.add(makeDot(geo2vec(90, 0), 0x6699cc, 0.012));
    scene.add(makeDot(geo2vec(-90, 0), 0x6699cc, 0.012));

    // ── Observer marker ──────────────────────────────────────────────────────
    const obsPos = geo2vec(observerLat, observerLon, 0);
    scene.add(makeDot(obsPos, 0xfbbf24, 0.022));
    scene.add(makeLine(
      [obsPos, geo2vec(observerLat, observerLon, 250)],
      0xfbbf24,
      0.55
    ));

    // ── Satellite tracks ─────────────────────────────────────────────────────
    tracks.forEach(track => {
      const isSelected = track.satelliteId === selectedSatelliteId;
      const color = new THREE.Color(track.color);
      const segs = groupByVisibility(track.points);

      segs.forEach(seg => {
        if (seg.pts.length < 2) return;
        const pts = seg.pts.map(p => geo2vec(p.satLat, p.satLon, ORBIT_DISPLAY_KM));

        if (seg.visible) {
          // ── Solid line for the visible pass window ──
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: isSelected ? 1.0 : 0.6,
          });
          scene.add(new THREE.Line(geo, mat));

          // AOS dot
          scene.add(makeDot(pts[0], color, isSelected ? 0.022 : 0.016));

          // LOS dot (transparent fill to distinguish from AOS)
          const losDot = makeDot(pts[pts.length - 1], color, isSelected ? 0.018 : 0.013);
          (losDot.material as THREE.MeshBasicMaterial).opacity = isSelected ? 1 : 0.6;
          (losDot.material as THREE.MeshBasicMaterial).transparent = true;
          scene.add(losDot);

          // Max-elevation dot (white)
          const maxIdx = seg.pts.reduce(
            (best, p, i) => (p.elevation > seg.pts[best].elevation ? i : best),
            0
          );
          scene.add(makeDot(pts[maxIdx], 0xffffff, 0.014));

          // Vertical drop lines for selected pass
          if (isSelected) {
            seg.pts.forEach((p, i) => {
              if (i % 4 !== 0) return;
              const surface = geo2vec(p.satLat, p.satLon, 0);
              const space = geo2vec(p.satLat, p.satLon, ORBIT_DISPLAY_KM);
              const dropGeo = new THREE.BufferGeometry().setFromPoints([surface, space]);
              const dropMat = new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity: 0.18,
              });
              scene.add(new THREE.Line(dropGeo, dropMat));
            });
          }
        } else {
          // ── Dashed line for non-visible portions ──
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = new THREE.LineDashedMaterial({
            color,
            dashSize: 0.04,
            gapSize: 0.025,
            transparent: true,
            opacity: isSelected ? 0.45 : 0.2,
          });
          const line = new THREE.Line(geo, mat);
          line.computeLineDistances();
          scene.add(line);
        }
      });
    });

    // ── Star field ──────────────────────────────────────────────────────────
    const STAR_COUNT = 3500;
    const starPos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const θ = Math.random() * Math.PI * 2;
      const φ = Math.acos(2 * Math.random() - 1);
      const r = 120;
      starPos[i * 3]     = r * Math.sin(φ) * Math.cos(θ);
      starPos[i * 3 + 1] = r * Math.cos(φ);
      starPos[i * 3 + 2] = r * Math.sin(φ) * Math.sin(θ);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.75 })
      )
    );

    // ── Resize handling ───────────────────────────────────────────────────────
    const resizeObs = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObs.observe(container);

    // ── Render loop ────────────────────────────────────────────────────────────
    let rafId: number;
    function animate() {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [tracks, selectedSatelliteId, observerLat, observerLon]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-xl overflow-hidden"
      style={{ background: '#040810', cursor: 'grab' }}
    />
  );
}
