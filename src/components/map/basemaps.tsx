"use client";

import { TileLayer } from "react-leaflet";

/**
 * The ground every map is drawn on.
 *
 * Three grounds, one place to change them. Esri serves all of them without
 * a key and labels them in English, which is why they are here: the tiles
 * this app used before began demanding a key and rendered "API KEY
 * REQUIRED" across every map, and OpenStreetMap's own tiles name places in
 * the local script.
 */
export type BasemapStyle = "map" | "satellite" | "minimal";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ATTRIBUTION = "&copy; Esri, HERE, Garmin &middot; &copy; OpenStreetMap";

export const BASEMAPS: Record<BasemapStyle, { label: string; hint: string }> = {
  map: { label: "Map", hint: "Roads, water and terrain" },
  satellite: { label: "Satellite", hint: "Aerial imagery" },
  minimal: { label: "Minimal", hint: "Plain ground, so the pins lead" },
};

export const DEFAULT_BASEMAP: BasemapStyle = "map";

/**
 * The tiles for one style. Satellite and Minimal carry no names of their
 * own, so a label layer goes over the top; the road map already has them.
 */
export function Basemap({ style = DEFAULT_BASEMAP }: { style?: BasemapStyle }) {
  if (style === "satellite") {
    return (
      <>
        <TileLayer url={`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`} attribution={ATTRIBUTION} maxZoom={19} />
        <TileLayer url={`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`} maxZoom={19} />
      </>
    );
  }
  if (style === "minimal") {
    return (
      <>
        <TileLayer url={`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`} attribution={ATTRIBUTION} maxZoom={16} />
        <TileLayer url={`${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`} maxZoom={16} />
      </>
    );
  }
  return <TileLayer url={`${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`} attribution={ATTRIBUTION} maxZoom={19} />;
}

/** Pick the ground. Sits with the map's other controls. */
export function BasemapSwitcher({
  style, onChange, className = "",
}: {
  style: BasemapStyle;
  onChange: (s: BasemapStyle) => void;
  className?: string;
}) {
  return (
    <div className={`map-basemap-switch ${className}`} role="group" aria-label="Map style">
      {(Object.keys(BASEMAPS) as BasemapStyle[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          title={BASEMAPS[key].hint}
          aria-pressed={style === key}
          className={`map-basemap-option ${style === key ? "map-basemap-option--on" : ""}`}
        >
          {BASEMAPS[key].label}
        </button>
      ))}
    </div>
  );
}
