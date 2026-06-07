"use client";

import {
  ArrowLeft,
  FileText,
  Layers,
  Share2,
  Download,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import api from "@/lib/api";
import { DeviceImage } from "@/components/ui/device-image";
import { StatusBadge } from "@/components/ui/badge";
import { ProgressStepper } from "@/components/ui/progress-stepper";
import { formatDate } from "@/lib/utils";

interface Installation {
  id: string;
  device: string;
  device_code: string;
  device_name: string;
  device_image: string | null;
  device_status: string;
  site: string;
  site_name: string;
  site_city: string;
  position_label: string;
  notes: string;
  installed_at: string;
  progress: number;
  steps: {
    id: string;
    step_type: string;
    step_type_display: string;
    step_number: number;
    status: string;
    status_display: string;
    assigned_team: string;
    description: string;
    started_at: string | null;
    completed_at: string | null;
  }[];
  photos: {
    id: string;
    photo_type: string;
    image: string;
    caption: string;
  }[];
}

interface InstallationListItem {
  id: string;
  device_code: string;
  site_name: string;
  installed_at: string;
  progress: number;
}

export default function InstallationTrackerPage() {
  const [installations, setInstallations] = useState<InstallationListItem[]>([]);
  const [selected, setSelected] = useState<Installation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInstallations() {
      try {
        const { data } = await api.get("/sites/installations/", { params: { page_size: 50, ordering: "-installed_at" } });
        setInstallations(data.results ?? []);
      } finally {
        setLoading(false);
      }
    }
    fetchInstallations();
  }, []);

  async function loadDetail(id: string) {
    try {
      const { data } = await api.get(`/sites/installations/${id}/`);
      setSelected(data);
    } catch {
      // handled by error boundary
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (selected) {
    const stepperSteps = selected.steps.map((s) => ({
      key: s.id,
      label: s.step_type_display,
      status: s.status as "completed" | "in_progress" | "pending" | "skipped",
    }));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelected(null)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Asset Installation Tracker</h1>
              <p className="text-sm text-muted-foreground">Track installation progress in different stages</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary">
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary">
              <Download className="h-4 w-4" /> Export Report
            </button>
          </div>
        </div>

        {/* Asset Header Card */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-5">
            <DeviceImage src={selected.device_image} alt={selected.device_code} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <Link href={`/assets?device=${selected.device}`} className="text-sm font-medium text-primary hover:underline">
                  Asset ID: {selected.device_code}
                </Link>
                <StatusBadge status={selected.device_status} />
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Site Name</p>
                  <Link href="/sites" className="font-medium text-primary hover:underline">{selected.site_name}</Link>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Device</p>
                  <Link href={`/assets?device=${selected.device}`} className="font-medium text-primary hover:underline">{selected.device_name}</Link>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="font-medium text-foreground">{selected.position_label || selected.site_city || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Installed At</p>
                  <p className="font-medium text-foreground">{formatDate(selected.installed_at)}</p>
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">Overall Progress</p>
              <p className="text-3xl font-bold text-primary">{selected.progress}%</p>
              <div className="mt-2 h-2 w-32 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${selected.progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Installation Steps Pipeline */}
        {stepperSteps.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground mb-6">Installation Steps</h2>
            <ProgressStepper steps={stepperSteps} />
          </div>
        )}

        {/* Step Detail Cards + Timeline */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {selected.steps.map((step) => (
                <div key={step.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      {step.step_number}. {step.step_type_display}
                    </h4>
                    <StatusBadge status={step.status} label={step.status_display} />
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <span className="text-foreground">
                        {step.completed_at ? formatDate(step.completed_at) : step.started_at ? formatDate(step.started_at) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Team</span>
                      <span className="text-foreground">{step.assigned_team || "—"}</span>
                    </div>
                    {step.description && (
                      <p className="text-muted-foreground mt-2 pt-2 border-t border-border">{step.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Photos */}
            {selected.photos.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">Installation Photos</h3>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {selected.photos.map((photo) => (
                    <div key={photo.id} className="shrink-0">
                      <img
                        src={photo.image}
                        alt={photo.caption || "Installation photo"}
                        className="h-32 w-44 rounded-lg object-cover border border-border"
                      />
                      {photo.caption && (
                        <p className="mt-1 text-[10px] text-muted-foreground max-w-44 truncate">{photo.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Installation Timeline */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Installation Timeline</h3>
              <div className="space-y-4">
                {selected.steps
                  .filter((s) => s.status !== "not_started")
                  .map((step) => (
                    <div key={step.id} className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${
                          step.status === "completed" ? "bg-primary" : "bg-amber-500"
                        }`}
                      />
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {step.step_type_display} — {step.status_display}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {step.completed_at
                            ? formatDate(step.completed_at)
                            : step.started_at
                            ? formatDate(step.started_at)
                            : ""}
                        </p>
                        {step.assigned_team && (
                          <p className="text-[10px] text-muted-foreground">{step.assigned_team}</p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Related Documents</h3>
                <Link href="/documents" className="text-[10px] font-medium text-primary hover:underline">View All</Link>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <FileText className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-foreground">Survey Report.pdf</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-foreground">Structure Design.dwg</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Installation Tracker</h1>
          <p className="text-sm text-muted-foreground">Track installation progress in different stages</p>
        </div>
      </div>

      {installations.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No installations yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Installation records will appear here once devices are installed at sites.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Asset Code</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Site</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Installed At</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Progress</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {installations.map((inst) => (
                  <tr
                    key={inst.id}
                    onClick={() => loadDetail(inst.id)}
                    className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30"
                  >
                    <td className="px-5 py-3.5 font-mono font-medium text-primary">{inst.device_code}</td>
                    <td className="px-5 py-3.5 text-foreground">{inst.site_name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{formatDate(inst.installed_at)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{inst.progress}%</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${inst.progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); loadDetail(inst.id); }}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
