"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatDateTime } from "@/lib/format";

export default function ProMetricsPage() {
  const [range, setRange] = useState("1h");

  const { data, isLoading } = useQuery({
    queryKey: ["proMetrics", range],
    queryFn: async () => (await api.get(`/pro/metrics?range=${range}`)).data,
    refetchInterval: 10000,
  });

  if (isLoading && !data) return <Spinner />;

  // Process data for charts
  // Data comes as array of { serverId, cpuUsage, ramUsage, recordedAt }
  // For a global view, we can average them per minute, or just show the raw points
  
  const chartData = data?.map((d: any) => ({
    time: formatDateTime(d.recordedAt).split(' ')[1], // Just HH:mm
    cpu: d.cpuUsage,
    ram: d.ramUsage,
    disk: d.diskUsage
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
        <h3 className="font-bold">System Metrics</h3>
        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          {['1m', '5m', '15m', '1h'].map(r => (
            <button 
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${range === r ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4 h-[350px] flex flex-col">
          <h4 className="font-semibold text-sm mb-4">CPU Usage (%)</h4>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#52525b33" />
                <XAxis dataKey="time" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#fff' }} 
                  itemStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 h-[350px] flex flex-col">
          <h4 className="font-semibold text-sm mb-4">RAM Usage (%)</h4>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#52525b33" />
                <XAxis dataKey="time" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#fff' }} 
                  itemStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="ram" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
