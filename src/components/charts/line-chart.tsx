"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

interface LineChartProps {
  data: { name: string; value: number }[];
  color?: string;
  height?: number;
  className?: string;
  showDots?: boolean;
}

export function LineChart({
  data,
  color = "hsl(168 76% 42%)",
  height = 200,
  className,
  showDots = true,
}: LineChartProps) {
  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
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
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill="url(#lineGradient)"
            dot={showDots ? { r: 3, fill: color, strokeWidth: 0 } : false}
            activeDot={{ r: 5, fill: color, strokeWidth: 2, stroke: "hsl(222 20% 10%)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
