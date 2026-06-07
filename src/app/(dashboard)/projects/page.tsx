"use client";

import dynamic from "next/dynamic";
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  Filter,
  Truck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import api from "@/lib/api";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";

interface ProjectStats {
  total: number;
  on_track: number;
  at_risk: number;
  delayed: number;
  completed: number;
  flagged_projects: {
    id: string;
    name: string;
    progress: number;
    status: string;
    bottleneck_count: number;
  }[];
  top_bottlenecks: { title: string; project_count: number }[];
}

interface Project {
  id: string;
  name: string;
  location: string;
  image: string | null;
  status: string;
  status_display: string;
  progress: number;
  start_date: string | null;
  target_date: string | null;
  bottleneck_count: number;
}

export default function ProjectsPage() {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, projectsRes] = await Promise.allSettled([
          api.get("/teams/projects/dashboard_stats/"),
          api.get("/teams/projects/", { params: { page_size: 50, ordering: "-created_at" } }),
        ]);
        if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
        if (projectsRes.status === "fulfilled") setProjects(projectsRes.value.data.results ?? []);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const total = stats?.total ?? 0;
  const onTrack = stats?.on_track ?? 0;
  const atRisk = stats?.at_risk ?? 0;
  const delayed = stats?.delayed ?? 0;
  const completed = stats?.completed ?? 0;

  const progressData = [
    { name: `On Track (${onTrack})`, value: onTrack, color: "#10b981" },
    { name: `At Risk (${atRisk})`, value: atRisk, color: "#f59e0b" },
    { name: `Delayed (${delayed})`, value: delayed, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const healthData = [
    { name: "On Track", value: onTrack },
    { name: "At Risk", value: atRisk },
    { name: "Delayed", value: delayed },
  ];

  const ongoing = projects.filter((p) => !["completed", "on_hold"].includes(p.status));

  function daysLeft(targetDate: string | null): string {
    if (!targetDate) return "—";
    const diff = Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} days overdue`;
    return `${diff} days left`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of all ongoing projects and their progress</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary">
            <Filter className="h-4 w-4" /> Filter
          </button>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Projects" value={total} subtitle="Ongoing Projects" icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="On Track" value={onTrack} subtitle={total > 0 ? `${((onTrack / total) * 100).toFixed(1)}%` : "0%"} icon={<CheckCircle className="h-5 w-5" />} />
        <StatCard label="At Risk" value={atRisk} subtitle={total > 0 ? `${((atRisk / total) * 100).toFixed(1)}%` : "0%"} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Delayed" value={delayed} subtitle={total > 0 ? `${((delayed / total) * 100).toFixed(1)}%` : "0%"} icon={<XCircle className="h-5 w-5" />} />
        <StatCard label="Completed" value={completed} subtitle="This Month" icon={<Truck className="h-5 w-5" />} />
      </div>

      {/* Ongoing Projects Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-base font-semibold text-foreground">Ongoing Projects</h2>
          <Link href="/projects" className="text-xs font-medium text-primary hover:underline">
            View All Projects
          </Link>
        </div>
        {ongoing.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Project / Location</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Progress</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Health</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Start Date</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Target Date</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Bottlenecks</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {ongoing.map((project) => (
                  <tr key={project.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="font-medium text-foreground">{project.name}</p>
                        <p className="text-xs text-muted-foreground">{project.location}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{project.progress}%</span>
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={project.status} label={project.status_display} />
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{project.start_date || "—"}</td>
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="text-foreground">{project.target_date || "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{daysLeft(project.target_date)}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {project.bottleneck_count > 0 ? (
                        <span className="text-xs text-destructive font-medium">
                          {project.bottleneck_count} issue{project.bottleneck_count > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-500">None</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <button className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                        <Eye className="h-3 w-3" /> View Details <ChevronRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">No ongoing projects</p>
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Projects by Progress</h3>
          <DonutChart
            data={progressData.length > 0 ? progressData : [{ name: "No Data", value: 1, color: "#94a3b8" }]}
            centerValue={total}
            centerLabel="Total"
            size={140}
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Projects by Health</h3>
          <BarChart data={healthData} height={180} />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Top Bottlenecks</h3>
          <div className="space-y-3">
            {(stats?.top_bottlenecks ?? []).map((b, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{b.title}</span>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                  {b.project_count} Project{b.project_count !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
            {(stats?.top_bottlenecks ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No bottlenecks</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Projects on Map</h3>
          <p className="text-xs text-muted-foreground">Map view coming soon</p>
        </div>
      </div>

      {/* Flagged Projects */}
      {(stats?.flagged_projects ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Flagged Projects — <span className="text-destructive">{stats!.flagged_projects.length} Projects</span> require immediate attention
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {stats!.flagged_projects.map((fp) => (
              <div key={fp.id} className="flex-shrink-0 rounded-lg border border-border bg-secondary/30 p-4 w-56">
                <p className="text-sm font-medium text-foreground truncate">{fp.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-destructive font-semibold">{fp.progress}%</span>
                  {fp.bottleneck_count > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      ▸ {fp.bottleneck_count} Critical Flag{fp.bottleneck_count > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
