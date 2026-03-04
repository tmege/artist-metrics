import { Music, Users, TrendingUp, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const kpiCards = [
  {
    title: "Total Streams",
    value: "1,234,567",
    change: "+12.5%",
    icon: Music,
  },
  {
    title: "Monthly Listeners",
    value: "45,678",
    change: "+8.2%",
    icon: Users,
  },
  {
    title: "Engagement Rate",
    value: "3.4%",
    change: "+0.5%",
    icon: TrendingUp,
  },
  {
    title: "Revenue",
    value: "$12,345",
    change: "+15.3%",
    icon: DollarSign,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold">Welcome back</h3>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your music analytics.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <div
            key={card.title}
            className={cn(
              "rounded-lg border border-border bg-card p-6",
              "hover:border-primary/50 transition-colors"
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{card.title}</p>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-xs text-emerald-500 mt-1">{card.change} from last month</p>
            </div>
          </div>
        ))}
      </div>

      {/* Placeholder */}
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">
          Charts and detailed analytics coming soon.
        </p>
      </div>
    </div>
  );
}
