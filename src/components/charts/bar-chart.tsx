"use client";

import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

interface BarChartProps {
  data: { name: string; value: number }[];
  color?: string;
  height?: number;
  className?: string;
}

export function BarChart({ data, color = "hsl(168 76% 42%)", height = 200, className }: BarChartProps) {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart data={data} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18%)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }}
            axisLine={{ stroke: "hsl(222 15% 18%)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "hsl(215 15% 55%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(222 20% 10%)",
              border: "1px solid hsl(222 15% 18%)",
              borderRadius: "8px",
              color: "hsl(210 20% 90%)",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
