"use client";

import { Monitor } from "lucide-react";

import { cn } from "@/lib/utils";

interface DeviceImageProps {
  src?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "h-10 w-10",
  md: "h-16 w-16",
  lg: "h-24 w-24",
  xl: "h-40 w-40",
};

const iconSizes = {
  sm: "h-5 w-5",
  md: "h-8 w-8",
  lg: "h-10 w-10",
  xl: "h-16 w-16",
};

export function DeviceImage({ src, alt = "Device", size = "md", className }: DeviceImageProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn("rounded-xl object-cover", sizeClasses[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-secondary",
        sizeClasses[size],
        className
      )}
    >
      <Monitor className={cn("text-muted-foreground", iconSizes[size])} />
    </div>
  );
}
