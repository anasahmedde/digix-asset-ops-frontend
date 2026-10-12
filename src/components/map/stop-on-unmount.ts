import { useEffect } from "react";
import type { Map as LeafletMap } from "leaflet";

/**
 * Halt a map's pan/zoom animation when its component goes away.
 *
 * A flyTo keeps animating in frames after the map is removed - a dialog
 * closed, a page left - and each frame touches panes the map no longer has
 * ("Cannot read properties of undefined (reading 'classList')"). Stopping
 * the animation first leaves nothing to run.
 */
export function useStopOnUnmount(map: LeafletMap | null | undefined) {
  useEffect(() => () => {
    try { map?.stop(); } catch { /* already gone */ }
  }, [map]);
}
