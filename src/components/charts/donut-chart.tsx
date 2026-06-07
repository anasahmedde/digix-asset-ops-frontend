"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { cn } from "@/lib/utils";

interface DonutChartProps {
  data: { name: string; value: number; color: string }[];
  centerLabel?: string;
  centerValue?: string | number;
  size?: number;
  className?: string;
  showLegend?: boolean;
}

export function DonutChart({
  data,
  centerLabel,
  centerValue,
  size = 200,
  className,
  showLegend = true,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className={cn("flex items-center gap-6", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={size * 0.32}
              outerRadius={size * 0.45}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(222 20% 10%)",
                border: "1px solid hsl(222 15% 18%)",
                borderRadius: "8px",
                color: "hsl(210 20% 90%)",
                fontSize: "12px",
              }}
              formatter={(value: number) => [value.toLocaleString(), ""]}
            />
          </PieChart>
        </ResponsiveContainer>
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerValue !== undefined && (
              <span className="text-xl font-bold text-foreground">
                {typeof centerValue === "number" ? centerValue.toLocaleString() : centerValue}
              </span>
            )}
            {centerLabel && (
              <span className="text-[10px] text-muted-foreground">{centerLabel}</span>
            )}
          </div>
        )}
      </div>
      {showLegend && (
        <div className="space-y-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.name}</span>
              <span className="ml-auto font-semibold text-foreground pl-3">
                {item.value.toLocaleString()}
              </span>
              <span className="text-muted-foreground w-12 text-right">
                {total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
