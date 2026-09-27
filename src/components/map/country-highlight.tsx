"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import { pakistanBorder, worldMaskExceptPakistan } from "@/data/pakistan-geo";

/**
 * Lift the country the estate is in out of its neighbours.
 *
 * Everything outside is washed back just enough to recede, and the border is
 * drawn in the app's own colour with a soft outer glow. Light-handed on
 * purpose: the map underneath still has to be readable, because the sites
 * near a border are read against what is on the other side of it.
 */
export function CountryHighlight({ country = "Pakistan" }: { country?: string }) {
  const map = useMap();
  const layers = useRef<L.Layer[]>([]);

  useEffect(() => {
    layers.current.forEach((l) => { try { map.removeLayer(l); } catch { /* noop */ } });
    layers.current = [];

    if (country !== "Pakistan") return;

    try {
      const mask = L.geoJSON(worldMaskExceptPakistan as never, {
        style: () => ({ color: "transparent", weight: 0, fillColor: "#0f172a", fillOpacity: 0.12, interactive: false }),
      }).addTo(map);

      const glow = L.geoJSON(pakistanBorder as never, {
        style: () => ({ color: "#0d9488", weight: 7, opacity: 0.1, fillColor: "transparent", fillOpacity: 0, interactive: false }),
      }).addTo(map);

      const border = L.geoJSON(pakistanBorder as never, {
        style: () => ({ color: "#0d9488", weight: 2, opacity: 0.75, fillColor: "transparent", fillOpacity: 0, interactive: false }),
      }).addTo(map);

      layers.current = [mask, glow, border];
    } catch { /* map not ready */ }

    return () => {
      layers.current.forEach((l) => { try { map.removeLayer(l); } catch { /* noop */ } });
      layers.current = [];
    };
  }, [map, country]);

  return null;
}
