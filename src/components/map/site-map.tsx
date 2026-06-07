"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

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

const activeIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#0d9373"/><circle cx="14" cy="14" r="6" fill="white"/></svg>`),
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -40],
});

const inactiveIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#94a3b8"/><circle cx="14" cy="14" r="6" fill="white"/></svg>`),
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -40],
});

function FitBounds({ sites }: { sites: SitePin[] }) {
  const map = useMap();
  useEffect(() => {
    if (sites.length === 0) return;
    const bounds = L.latLngBounds(sites.map((s) => [s.latitude, s.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [map, sites]);
  return null;
}

export default function SiteMap({ sites }: SiteMapProps) {
  const validSites = sites.filter((s) => s.latitude && s.longitude);
  const center: [number, number] = validSites.length > 0
    ? [validSites[0].latitude, validSites[0].longitude]
    : [25.2, 55.27];

  return (
    <div className="h-[500px] w-full overflow-hidden rounded-xl border border-gray-200">
      <MapContainer center={center} zoom={6} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds sites={validSites} />
        {validSites.map((site) => (
          <Marker key={site.id} position={[site.latitude, site.longitude]} icon={site.is_active ? activeIcon : inactiveIcon}>
            <Popup>
              <div className="min-w-[180px]">
                <p className="text-sm font-semibold">{site.name}</p>
                <p className="text-xs text-gray-500">{site.city}, {site.country}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-600">{site.device_count} device(s)</span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${site.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {site.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
