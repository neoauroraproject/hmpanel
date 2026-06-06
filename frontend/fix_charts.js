const fs = require('fs');

let c = fs.readFileSync('src/app/(app)/dashboard/page.tsx', 'utf8');

c = c.replace(/const seriesData = .*?;/, 'const seriesData = (series.data ?? []).map((p) => ({ label: p.label, bytes: p.bytes }));');
c = c.replace(/const adminData = .*?;/, 'const adminData = (trends.data?.byAdmin ?? []).map((d) => ({ name: d.name, bytes: d.bytes }));');
c = c.replace(/const inboundData = .*?;/, 'const inboundData = (trends.data?.byInbound ?? []).map((d) => ({ name: d.name.replace("inbound-", ""), bytes: d.bytes }));');

const areaChartRegex = /<ResponsiveContainer width="100%" height=\{200\}>[\s\S]*?<\/AreaChart>\n\s*<\/ResponsiveContainer>/;
const newAreaChart = `<ResponsiveContainer width="100%" height={260}>
          <AreaChart data={seriesData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorBytes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#27272a" strokeOpacity={0.4} />
            <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} dy={10} minTickGap={30} />
            <YAxis tickFormatter={(v) => formatBytes(v)} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} dx={-10} width={80} />
            <Tooltip 
              formatter={(val) => [formatBytes(val), "Traffic"]} 
              contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", padding: "8px 12px" }}
              itemStyle={{ color: "#e4e4e7", fontWeight: 500 }}
              labelStyle={{ color: "#a1a1aa", marginBottom: "4px" }}
              cursor={{ stroke: '#3f3f46', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area type="monotone" dataKey="bytes" stroke="#3b82f6" strokeWidth={3} fill="url(#colorBytes)" activeDot={{ r: 6, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>`;

c = c.replace(areaChartRegex, newAreaChart);

const smallChartsRegex = /<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">[\s\S]*?<\/Card>\n\s*<\/div>/;
const newSmallCharts = `<div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-8">
        <Card className="border-zinc-200 dark:border-zinc-800/60 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">New clients (30d)</h2>
            <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center"><Users size={16} className="text-purple-500"/></div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trends.data?.newClients ?? []} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#27272a" strokeOpacity={0.3} />
              <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} dy={8} />
              <YAxis tick={{ fill: "#71717a", fontSize: 10 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{ fill: "#a855f7", opacity: 0.1 }} 
                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", padding: "8px 12px" }}
                itemStyle={{ color: "#e4e4e7", fontWeight: 500 }}
              />
              <Bar dataKey="count" name="Clients" fill="#a855f7" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800/60 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">Usage by Admin</h2>
            <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center"><UserCog size={16} className="text-emerald-500"/></div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Pie data={adminData} dataKey="bytes" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={2} stroke="none">
                {adminData.map((entry, index) => (
                  <Cell key={\`cell-\${index}\`} fill={['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'][index % 6]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(val) => [formatBytes(val), "Usage"]} 
                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", padding: "8px 12px" }}
                itemStyle={{ color: "#e4e4e7", fontWeight: 500 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800/60 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">Usage by Inbound</h2>
            <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center"><Server size={16} className="text-amber-500"/></div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Pie data={inboundData} dataKey="bytes" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={2} stroke="none">
                {inboundData.map((entry, index) => (
                  <Cell key={\`cell-\${index}\`} fill={['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#06b6d4'][index % 6]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(val) => [formatBytes(val), "Usage"]} 
                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", padding: "8px 12px" }}
                itemStyle={{ color: "#e4e4e7", fontWeight: 500 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>`;

c = c.replace(smallChartsRegex, newSmallCharts);

fs.writeFileSync('src/app/(app)/dashboard/page.tsx', c);
