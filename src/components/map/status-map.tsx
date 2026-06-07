"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { pakistanBorder, worldMaskExceptPakistan } from "@/data/pakistan-geo";

const STATUS_META: Record<string, { color: string; label: string; pulse?: boolean }> = {
  active:             { color: "#22c55e", label: "Active",             pulse: true },
  installed:          { color: "#06b6d4", label: "Installed",          pulse: true },
  in_stock:           { color: "#6366f1", label: "In Stock" },
  under_maintenance:  { color: "#f59e0b", label: "Under Maintenance",  pulse: true },
  procured:           { color: "#8b5cf6", label: "Procured" },
  assigned:           { color: "#3b82f6", label: "Assigned" },
  decommissioned:     { color: "#ef4444", label: "Decommissioned" },
  lost_stolen:        { color: "#ef4444", label: "Lost / Stolen" },
  rma:                { color: "#f97316", label: "RMA" },
  in_transit:         { color: "#ec4899", label: "In Transit",         pulse: true },
};

const MAINT_TYPE_META: Record<string, { color: string; label: string }> = {
  preventive: { color: "#f59e0b", label: "Preventive" },
  corrective: { color: "#ef4444", label: "Corrective" },
  predictive: { color: "#a855f7", label: "Predictive" },
};

const iconCache = new Map<string, L.DivIcon>();

function getDeviceIcon(status: string): L.DivIcon {
  const key = `device-${status}`;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const { color, pulse } = STATUS_META[status] ?? { color: "#94a3b8" };
  const html = `<span class="map-dot${pulse ? " map-dot--pulse" : ""}" style="--dot-color:${color}"></span>`;
  const icon = L.divIcon({ html, className: "map-dot-wrap", iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12] });
  iconCache.set(key, icon);
  return icon;
}

function getMaintenanceIcon(maintType: string): L.DivIcon {
  const key = `maint-${maintType}`;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const { color } = MAINT_TYPE_META[maintType] ?? { color: "#f59e0b" };
  const html = `<span class="map-dot map-dot--pulse map-dot--maint" style="--dot-color:${color}">
  <svg class="map-dot-icon" viewBox="0 0 16 16" fill="white"><path d="M14.25 11.75l-5.5-5.5a3.48 3.48 0 00-.88-3.55 3.5 3.5 0 00-4.65-.27L5.75 5l-1.5 1.5-2.53-2.53a3.5 3.5 0 004.63 4.9l5.5 5.5a.5.5 0 00.7 0l1.7-1.72a.5.5 0 000-.7z"/></svg>
</span>`;
  const icon = L.divIcon({ html, className: "map-dot-wrap", iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16] });
  iconCache.set(key, icon);
  return icon;
}

interface CountryConfig {
  center: [number, number];
  zoom: number;
  bounds: L.LatLngBoundsExpression;
  minZoom: number;
}

const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  Pakistan: {
    center: [30.3753, 69.3451],
    zoom: 6,
    bounds: [[23.5, 60.8], [37.5, 77.8]],
    minZoom: 5,
  },
  India: {
    center: [20.5937, 78.9629],
    zoom: 5,
    bounds: [[6.5, 68.0], [35.5, 97.5]],
    minZoom: 4,
  },
  "United Arab Emirates": {
    center: [23.4241, 53.8478],
    zoom: 7,
    bounds: [[22.5, 51.0], [26.5, 56.5]],
    minZoom: 6,
  },
  "Saudi Arabia": {
    center: [23.8859, 45.0792],
    zoom: 5,
    bounds: [[15.5, 34.5], [32.5, 56.0]],
    minZoom: 4,
  },
  Qatar: {
    center: [25.3548, 51.1839],
    zoom: 9,
    bounds: [[24.4, 50.7], [26.2, 51.7]],
    minZoom: 8,
  },
  Bangladesh: {
    center: [23.685, 90.3563],
    zoom: 7,
    bounds: [[20.5, 88.0], [26.7, 92.7]],
    minZoom: 6,
  },
};

const DEFAULT_COUNTRY = "Pakistan";
const DEFAULT_CENTER: [number, number] = [30.3753, 69.3451];
const DEFAULT_ZOOM = 5;

export interface MapDevice {
  id: string;
  asset_code: string;
  status: string;
  current_site__id: string;
  current_site__name: string;
  current_site__city: string;
  current_site__state_province: string;
  current_site__country: string;
  current_site__latitude: string;
  current_site__longitude: string;
}

export interface MaintenanceSite {
  id: string;
  title: string;
  maintenance_type: string;
  frequency: string;
  next_due: string | null;
  site__id: string;
  site__name: string;
  site__city: string;
  site__state_province: string;
  site__country: string;
  site__latitude: string;
  site__longitude: string;
}

interface StatusMapProps {
  devices: MapDevice[];
  maintenanceSites?: MaintenanceSite[];
  height?: string;
  className?: string;
}

function CountryOverlay({ country }: { country: string }) {
  const map = useMap();
  const layersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    layersRef.current.forEach((l) => { try { map.removeLayer(l); } catch { /* noop */ } });
    layersRef.current = [];

    if (country !== "Pakistan") return;

    try {
      const mask = L.geoJSON(worldMaskExceptPakistan as never, {
        style: () => ({ color: "transparent", weight: 0, fillColor: "#080d18", fillOpacity: 0.35, interactive: false }),
      }).addTo(map);

      const glow = L.geoJSON(pakistanBorder as never, {
        style: () => ({ color: "#00ffd0", weight: 6, opacity: 0.12, fillColor: "transparent", fillOpacity: 0, interactive: false }),
      }).addTo(map);

      const border = L.geoJSON(pakistanBorder as never, {
        style: () => ({ color: "#00ffcc", weight: 1.5, opacity: 0.6, fillColor: "#00ffcc", fillOpacity: 0.02, interactive: false }),
      }).addTo(map);

      layersRef.current = [mask, glow, border];
    } catch { /* map not ready */ }

    return () => {
      layersRef.current.forEach((l) => { try { map.removeLayer(l); } catch { /* noop */ } });
      layersRef.current = [];
    };
  }, [map, country]);

  return null;
}

function CountryLock({ country }: { country: string }) {
  const map = useMap();
  const prevCountryRef = useRef(country);

  useEffect(() => {
    const cfg = COUNTRY_CONFIGS[country];
    if (!cfg) return;

    try {
      map.setMaxBounds(cfg.bounds);
      map.setMinZoom(cfg.minZoom);
      map.flyTo(cfg.center, cfg.zoom, { duration: 0.6 });
    } catch { /* noop */ }

    prevCountryRef.current = country;
  }, [map, country]);

  return null;
}

function MapInit({ country }: { country: string }) {
  const map = useMap();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const t = setTimeout(() => {
      try {
        map.invalidateSize();
        const cfg = COUNTRY_CONFIGS[country];
        if (cfg) {
          map.setMaxBounds(cfg.bounds);
          map.setMinZoom(cfg.minZoom);
          map.setView(cfg.center, cfg.zoom);
        }
      } catch { /* noop */ }
      done.current = true;
    }, 120);
    return () => clearTimeout(t);
  }, [map, country]);

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

function HomeButton({ country }: { country: string }) {
  const map = useMap();
  const handleHome = useCallback(() => {
    const cfg = COUNTRY_CONFIGS[country];
    const center = cfg?.center ?? DEFAULT_CENTER;
    const zoom = cfg?.zoom ?? DEFAULT_ZOOM;
    try { map.flyTo(center, zoom, { duration: 0.6 }); } catch { /* noop */ }
  }, [map, country]);

  return (
    <div className="leaflet-top leaflet-left" style={{ top: 80, left: 10 }}>
      <div className="leaflet-control">
        <button
          onClick={handleHome}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-700 shadow-md hover:bg-gray-50 transition-colors"
          title={`Reset to ${country}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function DeviceMarker({ device }: { device: MapDevice }) {
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const lat = parseFloat(device.current_site__latitude);
  const lng = parseFloat(device.current_site__longitude);
  if (isNaN(lat) || isNaN(lng)) return null;
  const meta = STATUS_META[device.status] ?? { color: "#94a3b8", label: device.status };

  return (
    <>
      {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}
      <Marker position={[lat, lng]} icon={getDeviceIcon(device.status)} eventHandlers={{ click: () => setFlyTarget({ lat, lng }) }}>
        <Popup className="device-popup" closeButton={false} autoPan maxWidth={280} minWidth={220}>
          <div className="dp-card">
            <div className="dp-header">
              <span className="dp-badge" style={{ background: meta.color }}>{meta.label}</span>
              <span className="dp-code">{device.asset_code}</span>
            </div>
            <div className="dp-site">{device.current_site__name}</div>
            <div className="dp-city">{device.current_site__city}{device.current_site__state_province ? `, ${device.current_site__state_province}` : ""}</div>
            <div className="dp-actions">
              <a href={`/assets?device=${device.id}`} className="dp-link dp-link--primary">
                <svg viewBox="0 0 20 20" fill="currentColor" className="dp-link-icon"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                View Device
              </a>
              <a href={`/sites?site=${device.current_site__id}`} className="dp-link">
                <svg viewBox="0 0 20 20" fill="currentColor" className="dp-link-icon"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
                View Site
              </a>
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}

function MaintenanceMarker({ site }: { site: MaintenanceSite }) {
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const lat = parseFloat(site.site__latitude);
  const lng = parseFloat(site.site__longitude);
  if (isNaN(lat) || isNaN(lng)) return null;
  const meta = MAINT_TYPE_META[site.maintenance_type] ?? { color: "#f59e0b", label: site.maintenance_type };

  return (
    <>
      {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}
      <Marker position={[lat, lng]} icon={getMaintenanceIcon(site.maintenance_type)} eventHandlers={{ click: () => setFlyTarget({ lat, lng }) }}>
        <Popup className="device-popup" closeButton={false} autoPan maxWidth={280} minWidth={220}>
          <div className="dp-card">
            <div className="dp-header">
              <span className="dp-badge dp-badge--maint" style={{ background: meta.color }}>
                <svg viewBox="0 0 16 16" fill="currentColor" className="dp-badge-icon"><path d="M14.25 11.75l-5.5-5.5a3.48 3.48 0 00-.88-3.55 3.5 3.5 0 00-4.65-.27L5.75 5l-1.5 1.5-2.53-2.53a3.5 3.5 0 004.63 4.9l5.5 5.5a.5.5 0 00.7 0l1.7-1.72a.5.5 0 000-.7z"/></svg>
                {meta.label}
              </span>
            </div>
            <div className="dp-title">{site.title}</div>
            <div className="dp-site">{site.site__name}</div>
            <div className="dp-city">{site.site__city}{site.site__state_province ? `, ${site.site__state_province}` : ""}</div>
            <div className="dp-meta">
              <span>Frequency: {site.frequency}</span>
              {site.next_due && <span>Due: {new Date(site.next_due).toLocaleDateString()}</span>}
            </div>
            <div className="dp-actions">
              <a href={`/maintenance?schedule=${site.id}`} className="dp-link dp-link--warn">
                <svg viewBox="0 0 20 20" fill="currentColor" className="dp-link-icon"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
                View Maintenance
              </a>
              <a href={`/sites?site=${site.site__id}`} className="dp-link">
                <svg viewBox="0 0 20 20" fill="currentColor" className="dp-link-icon"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
                View Site
              </a>
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}

type ActiveLayer = "devices" | "maintenance";

export default function StatusMap({ devices, maintenanceSites = [], height = "500px", className }: StatusMapProps) {
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>("devices");
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);

  const countries = useMemo(() => {
    const set = new Set<string>();
    devices.forEach((d) => { if (d.current_site__country) set.add(d.current_site__country); });
    maintenanceSites.forEach((s) => { if (s.site__country) set.add(s.site__country); });
    if (set.size === 0) set.add(DEFAULT_COUNTRY);
    return Array.from(set).sort();
  }, [devices, maintenanceSites]);

  const filteredDevices = useMemo(
    () => devices.filter((d) => d.current_site__country === selectedCountry),
    [devices, selectedCountry],
  );

  const filteredMaint = useMemo(
    () => maintenanceSites.filter((s) => s.site__country === selectedCountry),
    [maintenanceSites, selectedCountry],
  );

  return (
    <div className={`map-wrapper ${className ?? ""}`} style={{ height, position: "relative" }}>
      <MapContainer
        center={COUNTRY_CONFIGS[DEFAULT_COUNTRY]?.center ?? DEFAULT_CENTER}
        zoom={COUNTRY_CONFIGS[DEFAULT_COUNTRY]?.zoom ?? DEFAULT_ZOOM}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        style={{ height: "100%", width: "100%", background: "#f0f0f0" }}
        className="dark-map"
        whenReady={() => {}}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
        />
        <CountryOverlay country={selectedCountry} />
        <ZoomControl position="topleft" />
        <MapInit country={selectedCountry} />
        <CountryLock country={selectedCountry} />
        <HomeButton country={selectedCountry} />
        {activeLayer === "devices" && filteredDevices.map((device) => (
          <DeviceMarker key={`device-${device.id}`} device={device} />
        ))}
        {activeLayer === "maintenance" && filteredMaint.map((site) => (
          <MaintenanceMarker key={`maint-${site.id}`} site={site} />
        ))}
      </MapContainer>

      {/* Country dropdown — top-left outside zoom controls */}
      <div className="map-country-select">
        <svg className="map-country-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd"/>
        </svg>
        <select
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          className="map-country-dropdown"
        >
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Layer toggle — top-right */}
      {(filteredMaint.length > 0 || maintenanceSites.length > 0) && (
        <div className="map-layer-toggle">
          <button
            onClick={() => setActiveLayer("devices")}
            className={`map-layer-chip ${activeLayer === "devices" ? "map-layer-chip--active" : ""}`}
          >
            <span className="map-layer-dot" style={{ background: "#22c55e" }} />
            Devices
            <span className="map-layer-count">{filteredDevices.length}</span>
          </button>
          <button
            onClick={() => setActiveLayer("maintenance")}
            className={`map-layer-chip ${activeLayer === "maintenance" ? "map-layer-chip--active-warn" : ""}`}
          >
            <span className="map-layer-dot" style={{ background: "#f59e0b" }} />
            Maintenance
            <span className="map-layer-count">{filteredMaint.length}</span>
          </button>
        </div>
      )}
    </div>
  );
}
