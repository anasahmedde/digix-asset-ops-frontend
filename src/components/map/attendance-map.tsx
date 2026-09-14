"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from "react-leaflet";

export interface AttendancePoint {
  id: string;
  user_name: string;
  check_type: string;
  check_type_display: string;
  latitude: string | null;
  longitude: string | null;
  site_name: string | null;
  created_at: string;
}

const iconCache = new Map<string, L.DivIcon>();
function dot(checkType: string): L.DivIcon {
  const key = checkType;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const color = checkType === "check_in" ? "#10b981" : "#64748b";
  const icon = L.divIcon({
    html: `<span class="map-dot" style="--dot-color:${color}"></span>`,
    className: "map-dot-wrap",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
  iconCache.set(key, icon);
  return icon;
}

function FitBounds({ points }: { points: AttendancePoint[] }) {
  const map = useMap();
  const coords = points
    .map((p) => [parseFloat(p.latitude ?? ""), parseFloat(p.longitude ?? "")] as [number, number])
    .filter(([a, b]) => !isNaN(a) && !isNaN(b));
  if (coords.length > 0) {
    try {
      map.fitBounds(L.latLngBounds(coords).pad(0.3), { maxZoom: 14 });
    } catch { /* noop */ }
  }
  return null;
}

export default function AttendanceMap({ points, height = "420px" }: { points: AttendancePoint[]; height?: string }) {
  const valid = points.filter((p) => p.latitude && p.longitude && !isNaN(parseFloat(p.latitude)) && !isNaN(parseFloat(p.longitude)));
  return (
    <div style={{ height, width: "100%", borderRadius: 12, overflow: "hidden" }}>
      <MapContainer
        center={[30.3753, 69.3451]}
        zoom={5}
        zoomControl={false}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%", background: "#f0f0f0" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
        />
        <ZoomControl position="topleft" />
        <FitBounds points={valid} />
        {valid.map((p) => (
          <Marker key={p.id} position={[parseFloat(p.latitude!), parseFloat(p.longitude!)]} icon={dot(p.check_type)}>
            <Popup closeButton={false}>
              <div style={{ minWidth: 160 }}>
                <strong>{p.user_name}</strong>
                <div style={{ fontSize: 12, color: "#64748b" }}>{p.check_type_display}{p.site_name ? ` · ${p.site_name}` : ""}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{new Date(p.created_at).toLocaleString()}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
