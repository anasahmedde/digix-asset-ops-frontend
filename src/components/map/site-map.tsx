"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, ZoomControl } from "react-leaflet";
import { pakistanBorder, worldMaskExceptPakistan } from "@/data/pakistan-geo";

interface SitePin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  device_count: number;
  is_active: boolean;
}

interface SiteMapProps {
  sites: SitePin[];
}

const PAKISTAN_CENTER: [number, number] = [30.3753, 69.3451];
const PAKISTAN_ZOOM = 5;

const iconCache = new Map<string, L.DivIcon>();

function getSiteIcon(isActive: boolean): L.DivIcon {
  const key = isActive ? "site-active" : "site-inactive";
  if (iconCache.has(key)) return iconCache.get(key)!;

  const color = isActive ? "#0d9488" : "#94a3b8";

  const html = `<span class="map-dot map-dot--pulse" style="--dot-color:${color}">
  <svg class="map-dot-icon" viewBox="0 0 16 16" fill="white"><path fill-rule="evenodd" d="M8 1a5 5 0 00-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 00-5-5zm0 7a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
</span>`;

  const icon = L.divIcon({
    html,
    className: "map-dot-wrap",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
  });

  iconCache.set(key, icon);
  return icon;
}

function PakistanOverlay() {
  const map = useMap();
  const layersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    if (!map) return;
    try {
      const mask = L.geoJSON(worldMaskExceptPakistan as never, {
        style: () => ({
          color: "transparent",
          weight: 0,
          fillColor: "#080d18",
          fillOpacity: 0.35,
          interactive: false,
        }),
      }).addTo(map);

      const glow = L.geoJSON(pakistanBorder as never, {
        style: () => ({
          color: "#00ffd0",
          weight: 6,
          opacity: 0.12,
          fillColor: "transparent",
          fillOpacity: 0,
          interactive: false,
        }),
      }).addTo(map);

      const border = L.geoJSON(pakistanBorder as never, {
        style: () => ({
          color: "#00ffcc",
          weight: 1.5,
          opacity: 0.6,
          fillColor: "#00ffcc",
          fillOpacity: 0.02,
          interactive: false,
        }),
      }).addTo(map);

      layersRef.current = [mask, glow, border];
    } catch { /* map not ready */ }

    return () => {
      layersRef.current.forEach((l) => { try { map.removeLayer(l); } catch { /* noop */ } });
      layersRef.current = [];
    };
  }, [map]);

  return null;
}

function MapSetup({ sites }: { sites: SitePin[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (!map || fitted.current) return;
    const t = setTimeout(() => {
      try {
        map.invalidateSize();
        if (sites.length > 0) {
          map.fitBounds(
            L.latLngBounds(sites.map((s) => [s.latitude, s.longitude])).pad(0.3),
            { maxZoom: 8 },
          );
        } else {
          map.setView(PAKISTAN_CENTER, PAKISTAN_ZOOM);
        }
      } catch { map.setView(PAKISTAN_CENTER, PAKISTAN_ZOOM); }
      fitted.current = true;
    }, 120);
    return () => clearTimeout(t);
  }, [map, sites]);

  return null;
}

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      try { map.flyTo([lat, lng], 13, { duration: 0.8 }); } catch { /* noop */ }
    }
  }, [map, lat, lng]);
  return null;
}

function HomeButton() {
  const map = useMap();
  const handleHome = useCallback(() => {
    try { map.flyTo(PAKISTAN_CENTER, PAKISTAN_ZOOM, { duration: 0.6 }); } catch { /* noop */ }
  }, [map]);

  return (
    <div className="leaflet-top leaflet-left" style={{ top: 80, left: 10 }}>
      <div className="leaflet-control">
        <button
          onClick={handleHome}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-700 shadow-md hover:bg-gray-50 transition-colors"
          title="Reset to Pakistan"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function SiteMarker({ site }: { site: SitePin }) {
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <>
      {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}
      <Marker
        position={[site.latitude, site.longitude]}
        icon={getSiteIcon(site.is_active)}
        eventHandlers={{
          click: () => setFlyTarget({ lat: site.latitude, lng: site.longitude }),
        }}
      >
        <Popup className="device-popup" closeButton={false} autoPan maxWidth={280} minWidth={220}>
          <div className="dp-card">
            <div className="dp-header">
              <span className="dp-badge" style={{ background: site.is_active ? "#0d9488" : "#94a3b8" }}>
                {site.is_active ? "Active" : "Inactive"}
              </span>
              <span className="dp-code">{site.device_count} device{site.device_count !== 1 ? "s" : ""}</span>
            </div>
            <div className="dp-title">{site.name}</div>
            <div className="dp-city">{site.city}, {site.country}</div>
            <div className="dp-actions">
              <a href={`/sites?site=${site.id}`} className="dp-link dp-link--primary">
                <svg viewBox="0 0 20 20" fill="currentColor" className="dp-link-icon"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
                View Site Details
              </a>
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}

export default function SiteMap({ sites }: SiteMapProps) {
  const validSites = sites.filter((s) => s.latitude && s.longitude);

  return (
    <div className="h-[500px] w-full overflow-hidden rounded-xl border border-border">
      <MapContainer
        center={PAKISTAN_CENTER}
        zoom={PAKISTAN_ZOOM}
        zoomControl={false}
        style={{ height: "100%", width: "100%", background: "#f0f0f0" }}
        className="dark-map"
        whenReady={() => {}}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
        />
        <PakistanOverlay />
        <ZoomControl position="topleft" />
        <MapSetup sites={validSites} />
        <HomeButton />
        {validSites.map((site) => (
          <SiteMarker key={site.id} site={site} />
        ))}
      </MapContainer>
    </div>
  );
}
