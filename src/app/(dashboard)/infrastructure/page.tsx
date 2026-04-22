import { Zap } from "lucide-react";

export default function InfrastructurePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Infrastructure</h1>
            <p className="text-gray-500">Power, network, and environmental monitoring</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50">
          <Zap className="h-8 w-8 text-gray-300" />
        </div>
        <h3 className="mt-6 text-lg font-semibold text-gray-900">Coming in Wave 2</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          Infrastructure monitoring including power systems, network connectivity, 
          environmental sensors, and UPS status will be available in the next release.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {["Power Monitoring", "Network Status", "Environmental Sensors", "UPS Tracking", "Alerts"].map((feature) => (
            <span key={feature} className="inline-flex rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
              {feature}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
