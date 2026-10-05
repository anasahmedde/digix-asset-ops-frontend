"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, Marker, useMapEvents, useMap } from "react-leaflet";

import { Basemap } from "./basemaps";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Search, X } from "lucide-react";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export interface PickedPlace {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  country?: string;
}

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (place: PickedPlace) => void;
}

interface NominatimAddress {
  road?: string;
  house_number?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state_district?: string;
  county?: string;
  country?: string;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

/** The place, as the three fields on the form want it.
 *
 * Nominatim names a settlement differently depending on what it is — city,
 * town, village, municipality — so the first one that answers is the city.
 * The street line drops the country and the city, which have their own
 * fields; repeating them in the address is how an address ends up saying
 * "Karachi, Karachi, Pakistan".
 */
function placeFrom(result: NominatimResult, lat: number, lng: number): PickedPlace {
  const a = result.address ?? {};
  const city = a.city || a.town || a.village || a.municipality || a.county || a.state_district || "";
  const country = a.country || "";
  const street = result.display_name
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p !== city && p !== country)
    .join(", ");
  return { lat, lng, address: street || result.display_name, city, country };
}

function DraggableMarker({
  position,
  onChange,
}: {
  position: L.LatLng | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);

  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={position}
      icon={markerIcon}
      draggable
      ref={markerRef}
      eventHandlers={{
        dragend: () => {
          const m = markerRef.current;
          if (m) {
            const pos = m.getLatLng();
            onChange(pos.lat, pos.lng);
          }
        },
      }}
    />
  );
}

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 14, { duration: 0.8 });
  }, [lat, lng, map]);
  return null;
}

export default function LocationPicker({ lat, lng, onChange }: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [looking, setLooking] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const position = lat != null && lng != null ? L.latLng(lat, lng) : null;
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : [30.3753, 69.3451];
  const zoom = lat != null && lng != null ? 14 : 5;

  const searchAddress = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,
        { headers: { "User-Agent": "DigixAssetManagement/1.0" } }
      );
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setShowResults(true);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleSearchInput(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddress(value), 400);
  }

  function selectResult(result: NominatimResult) {
    const newLat = parseFloat(result.lat);
    const newLng = parseFloat(result.lon);
    onChange(placeFrom(result, newLat, newLng));
    setQuery(result.display_name);
    setShowResults(false);
  }

  // Dropping a pin says where the site is, so it can say what the address
  // is too. The coordinates land straight away — the lookup is somebody
  // else's server and may be slow or down — and the three text fields fill
  // in when the answer arrives. They stay editable: this is a starting
  // point, not a ruling.
  async function handleMarkerMove(newLat: number, newLng: number) {
    onChange({ lat: newLat, lng: newLng });
    setLooking(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&zoom=18&addressdetails=1`,
        { headers: { "User-Agent": "DigixAssetManagement/1.0" } }
      );
      if (!res.ok) return;
      const data: NominatimResult = await res.json();
      if (!data || !data.display_name) return;
      const place = placeFrom(data, newLat, newLng);
      onChange(place);
      setQuery(place.address ?? "");
    } catch {
      // No address this time; the pin is still exactly where it was put.
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative" ref={searchContainerRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearchInput(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder="Search for a location..."
            className="flex h-10 w-full rounded-lg border border-border bg-card pl-10 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setResults([]); setShowResults(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {showResults && results.length > 0 && (
          <div className="absolute z-[1000] mt-1 w-full rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectResult(r)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-secondary/50"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="line-clamp-2">{r.display_name}</span>
              </button>
            ))}
          </div>
        )}
        {searching && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        )}
      </div>

      <div className="relative rounded-lg border border-border overflow-hidden" style={{ height: "280px" }}>
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: "100%", width: "100%" }}
          className="dark-map"
        >
          <Basemap />
          <DraggableMarker position={position} onChange={handleMarkerMove} />
          {position && <FlyTo lat={position.lat} lng={position.lng} />}
        </MapContainer>
      </div>

      <p className="text-2xs text-muted-foreground">
        {looking
          ? "Reading the address from the pin…"
          : position
            ? `Selected: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`
            : "Click on the map or search to set location"}
      </p>
    </div>
  );
}
