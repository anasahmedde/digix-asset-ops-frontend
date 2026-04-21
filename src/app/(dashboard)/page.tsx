import {
  HardDrive,
  MapPin,
  Ticket,
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  Wrench,
} from "lucide-react";

const stats = [
  { label: "Total Devices", value: "0", icon: HardDrive, color: "text-blue-600" },
  { label: "Active Sites", value: "0", icon: MapPin, color: "text-green-600" },
  { label: "Open Tickets", value: "0", icon: Ticket, color: "text-orange-600" },
  { label: "Field Team", value: "0", icon: Users, color: "text-purple-600" },
  { label: "Under Maintenance", value: "0", icon: Wrench, color: "text-yellow-600" },
  { label: "Resolved Today", value: "0", icon: CheckCircle, color: "text-emerald-600" },
  { label: "Overdue Tickets", value: "0", icon: AlertTriangle, color: "text-red-600" },
  { label: "Avg Resolution", value: "-", icon: Clock, color: "text-cyan-600" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your asset management operations
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border bg-card p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </p>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <p className="mt-2 text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Recent Tickets</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            No tickets yet. Create your first ticket to get started.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Device Status Overview</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            No devices registered yet. Add devices to see status distribution.
          </p>
        </div>
      </div>
    </div>
  );
}
