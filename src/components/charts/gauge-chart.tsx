"use client";

import { cn } from "@/lib/utils";

interface GaugeChartProps {
  value: number;
  label?: string;
  size?: number;
  className?: string;
}

function getHealthColor(value: number) {
  if (value >= 80) return "hsl(152 70% 40%)";
  if (value >= 60) return "hsl(168 76% 42%)";
  if (value >= 40) return "hsl(38 92% 50%)";
  return "hsl(0 72% 51%)";
}

function getHealthLabel(value: number) {
  if (value >= 80) return "Good";
  if (value >= 60) return "Fair";
  if (value >= 40) return "Needs Attention";
  return "Critical";
}

export function GaugeChart({ value, label, size = 140, className }: GaugeChartProps) {
  const color = getHealthColor(value);
  const healthLabel = label || getHealthLabel(value);
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (value / 100) * circumference * 0.75;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-[135deg]">
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="hsl(222 15% 16%)"
            strokeWidth="8"
            strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
            strokeLinecap="round"
          />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground">{value}%</span>
          <span className="text-xs font-medium" style={{ color }}>
            {healthLabel}
          </span>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Overall Asset Health</p>
    </div>
  );
}
