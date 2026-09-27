"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from "react-leaflet";

/**
 * Where a project's assets actually are.
 *
 * Pick a project and its assets light up; everything else stays on the map,
 * greyed, so the pins read against the rest of the estate rather than in
 * isolation. Rows come from /assets/devices/map_data/, which resolves the
 * project whether the asset links to it directly or through a scope line.
 */
export interface ProjectMapDevice {
  id: string;
  asset_code: string;
  status: string;
  open_tickets?: number;
  project_id: string | null;
  project__name: string | null;
  current_site__id: string;
  current_site__name: string;
  current_site__city: string;
  current_site__state_province: string;
  current_site__country: string;
  current_site__latitude: string | number;
  current_site__longitude: string | number;
}

const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e",
  installed: "#06b6d4",
  in_stock: "#6366f1",
  under_maintenance: "#f59e0b",
  client_property: "#14b8a6",
  procured: "#8b5cf6",
  assigned: "#3b82f6",
  decommissioned: "#ef4444",
  lost_stolen: "#ef4444",
  rma: "#f97316",
  in_transit: "#ec4899",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  installed: "Installed",
  in_stock: "In Stock",
  under_maintenance: "Under Maintenance",
  client_property: "Client Property",
  procured: "In Procurement",
  assigned: "Assigned",
  decommissioned: "Decommissioned",
  lost_stolen: "Lost / Stolen",
  rma: "RMA",
  in_transit: "In Transit",
};

const PAKISTAN: [number, number] = [30.3753, 69.3451];
const iconCache = new Map<string, L.DivIcon>();

function pinFor(status: string, lit: boolean): L.DivIcon {
  const key = `${status}-${lit}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const color = lit ? STATUS_COLOR[status] ?? "#94a3b8" : "#94a3b8";
  const size = lit ? 22 : 12;
  const icon = L.divIcon({
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);opacity:${lit ? 1 : 0.45}"></span>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

const num = (v: string | number) => (typeof v === "number" ? v : parseFloat(v));

/** Co-located assets share a site, so fan them out to stay clickable. */
function spread(devices: ProjectMapDevice[]): Map<string, [number, number]> {
  const bySpot = new Map<string, ProjectMapDevice[]>();
  devices.forEach((d) => {
    const lat = num(d.current_site__latitude);
    const lng = num(d.current_site__longitude);
    if (isNaN(lat) || isNaN(lng)) return;
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    bySpot.set(key, [...(bySpot.get(key) ?? []), d]);
  });
  const out = new Map<string, [number, number]>();
  bySpot.forEach((group) => {
    const lat = num(group[0].current_site__latitude);
    const lng = num(group[0].current_site__longitude);
    group.forEach((d, i) => {
      if (i === 0) {
        out.set(d.id, [lat, lng]);
        return;
      }
      const ring = Math.ceil(i / 8);
      const angle = ((i - 1) % 8) / 8 * 2 * Math.PI + ring * 0.4;
      const r = 0.0014 * ring;
      out.set(d.id, [lat + r * Math.sin(angle), lng + r * Math.cos(angle)]);
    });
  });
  return out;
}

/** Frame the chosen project; show the whole country when none is chosen. */
function FrameOn({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) {
      map.flyTo(PAKISTAN, 5, { duration: 0.6 });
      return;
    }
    if (points.length === 1) {
      map.flyTo(points[0], 13, { duration: 0.8 });
      return;
    }
    map.flyToBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 13, duration: 0.8 });
  }, [map, points]);
  return null;
}

interface Props {
  devices: ProjectMapDevice[];
  height?: string;
}

export default function ProjectsMap({ devices, height = "420px" }: Props) {
  const [project, setProject] = useState("");

  const plottable = useMemo(
    () => devices.filter((d) => !isNaN(num(d.current_site__latitude)) && !isNaN(num(d.current_site__longitude))),
    [devices],
  );

  // Only projects with something to show on the map are worth offering.
  const projects = useMemo(() => {
    const byId = new Map<string, string>();
    plottable.forEach((d) => {
      if (d.project_id) byId.set(d.project_id, d.project__name || "Unnamed project");
    });
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [plottable]);

  const positions = useMemo(() => spread(plottable), [plottable]);
  const lit = useMemo(
    () => (project ? plottable.filter((d) => d.project_id === project) : plottable),
    [plottable, project],
  );
  const frame = useMemo(
    () => (project ? lit.map((d) => positions.get(d.id)).filter((p): p is [number, number] => !!p) : []),
    [project, lit, positions],
  );

  const sites = new Set(lit.map((d) => d.current_site__id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label="Highlight a project"
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
        >
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">
          {lit.length} asset{lit.length === 1 ? "" : "s"} · {sites.size} site{sites.size === 1 ? "" : "s"}
          {project && plottable.length > lit.length ? ` · ${plottable.length - lit.length} greyed` : ""}
        </span>
        {projects.length === 0 && (
          <span className="text-xs text-muted-foreground">No project has an asset on site yet.</span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border" style={{ height }}>
        <MapContainer
          center={PAKISTAN}
          zoom={5}
          zoomControl={false}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution='&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
          />
          {/* Place names, in English, over the canvas. */}
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          />
          <ZoomControl position="topright" />
          <FrameOn points={frame} />
          {plottable.map((d) => {
            const pos = positions.get(d.id);
            if (!pos) return null;
            const on = !project || d.project_id === project;
            return (
              <Marker
                key={d.id}
                position={pos}
                icon={pinFor(d.status, on)}
                zIndexOffset={on ? 500 : 0}
                opacity={on ? 1 : 0.55}
              >
                <Popup closeButton={false} maxWidth={260}>
                  <div className="space-y-1 text-xs">
                    <div className="font-mono font-semibold">{d.asset_code}</div>
                    <div>{STATUS_LABEL[d.status] ?? d.status}</div>
                    <div className="text-muted-foreground">
                      {d.current_site__name}
                      {d.current_site__city ? ` · ${d.current_site__city}` : ""}
                    </div>
                    <div className="text-muted-foreground">{d.project__name ?? "Not on a project"}</div>
                    {(d.open_tickets ?? 0) > 0 && (
                      <div className="font-semibold text-red-600">
                        {d.open_tickets} open ticket{d.open_tickets === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
