"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface MetricsRow {
  followers: number | null;
  views: number | null;
  posts: number | null;
  likes: number | null;
  engagementRate: number | null;
  fetchedAt: string;
}

interface HistoryRow {
  date: string;
  followers: number | null;
  views: number | null;
  posts: number | null;
}

const METRIC_DEFS = [
  { key: "followers", label: "Followers", color: "#3b82f6" },
  { key: "views", label: "Views", color: "#22c55e" },
  { key: "likes", label: "Likes", color: "#f97316" },
  { key: "posts", label: "Posts", color: "#a855f7" },
  { key: "engagementRate", label: "Engagement %", color: "#ec4899" },
] as const;

type MetricKey = (typeof METRIC_DEFS)[number]["key"];

const TIME_RANGES = [
  { key: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "All", ms: 0 },
] as const;

type TimeRange = (typeof TIME_RANGES)[number]["key"];

function formatTooltipValue(v: number, key: MetricKey): string {
  if (key === "engagementRate") return `${v.toFixed(2)}%`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("en-US");
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
}

export function MetricsChart({
  artistId,
  accountId,
}: {
  artistId: string;
  accountId: string;
}) {
  const [allData, setAllData] = useState<MetricsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiddenMetrics, setHiddenMetrics] = useState<Set<MetricKey>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try Social Blade history first
      try {
        const histRes = await apiFetch<{ data: HistoryRow[] }>(
          `/artists/${artistId}/social-accounts/${accountId}/history`
        );
        if (!cancelled && histRes.data.length >= 2) {
          const mapped: MetricsRow[] = histRes.data.map((row) => ({
            followers: row.followers,
            views: row.views,
            posts: row.posts,
            likes: null,
            engagementRate: null,
            fetchedAt: row.date,
          }));
          setAllData(mapped);
          setLoading(false);
          return;
        }
      } catch {
        // fallback below
      }

      // Fallback: our own sync metrics
      try {
        const res = await apiFetch<{ data: MetricsRow[] }>(
          `/artists/${artistId}/social-accounts/${accountId}/metrics?limit=1000`
        );
        if (!cancelled) setAllData([...res.data].reverse());
      } catch {
        if (!cancelled) setAllData([]);
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [artistId, accountId]);

  // Filter data by time range
  const filteredData = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.key === timeRange);
    if (!range || range.ms === 0) return allData;
    const cutoff = Date.now() - range.ms;
    return allData.filter((row) => new Date(row.fetchedAt).getTime() >= cutoff);
  }, [allData, timeRange]);

  // Determine which metrics have actual data in filtered set
  const availableMetrics = useMemo(
    () =>
      METRIC_DEFS.filter((m) =>
        filteredData.some((row) => row[m.key] != null)
      ),
    [filteredData]
  );

  // Visible metrics (available and not hidden)
  const visibleMetrics = useMemo(
    () => availableMetrics.filter((m) => !hiddenMetrics.has(m.key)),
    [availableMetrics, hiddenMetrics]
  );

  // Normalize data: each metric scaled to 0-100% of its own min-max range
  // Store real values alongside for tooltip display
  const normalizedData = useMemo(() => {
    if (visibleMetrics.length === 0) return [];

    // Compute min/max for each visible metric
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const m of visibleMetrics) {
      let min = Infinity;
      let max = -Infinity;
      for (const row of filteredData) {
        const v = row[m.key];
        if (v != null) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      ranges[m.key] = { min, max };
    }

    return filteredData.map((row) => {
      const normalized: Record<string, number | null> = {
        fetchedAt: null, // placeholder, set below
      };
      const real: Record<string, number | null> = {};

      for (const m of visibleMetrics) {
        const v = row[m.key];
        real[m.key] = v;
        if (v == null) {
          normalized[m.key] = null;
        } else {
          const { min, max } = ranges[m.key];
          normalized[m.key] = max === min ? 50 : ((v - min) / (max - min)) * 100;
        }
      }

      return {
        ...normalized,
        fetchedAt: row.fetchedAt,
        _real: real,
      };
    });
  }, [filteredData, visibleMetrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-xs text-muted-foreground">Loading chart...</p>
      </div>
    );
  }

  if (allData.length < 2) return null;
  if (availableMetrics.length === 0) return null;

  function toggleMetric(key: MetricKey) {
    setHiddenMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      {/* Header: legend + time range */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3">
          {availableMetrics.map((m) => {
            const active = !hiddenMetrics.has(m.key);
            return (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                className="flex items-center gap-1.5 text-xs transition-opacity"
                style={{ opacity: active ? 1 : 0.35 }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                {m.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setTimeRange(r.key)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                timeRange === r.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {filteredData.length < 2 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          Not enough data for this period
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={normalizedData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="fetchedAt"
              tickFormatter={formatDate}
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              stroke="#27272a"
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0a0a0f",
                border: "1px solid #27272a",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(label) =>
                new Date(label).toLocaleString("en-US", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }
              formatter={(
                _value: number | undefined,
                name: string | undefined,
                props: { payload?: Record<string, unknown> },
              ) => {
                const real = props.payload?._real as
                  | Record<string, number | null>
                  | undefined;
                const metricDef = visibleMetrics.find((m) => m.label === name);
                if (!real || !metricDef) return [_value ?? "—", name ?? ""];
                const realVal = real[metricDef.key];
                return [
                  realVal != null
                    ? formatTooltipValue(realVal, metricDef.key)
                    : "—",
                  name ?? "",
                ];
              }}
            />
            {visibleMetrics.map((m) => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={m.color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
