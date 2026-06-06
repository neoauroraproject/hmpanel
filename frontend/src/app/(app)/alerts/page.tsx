"use client";

import { useLicense } from "@/hooks/useLicense";
import { Bell, AlertTriangle, CheckCircle2, Info, Settings, Trash2, Plus } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { useState } from "react";

export default function AlertsPage() {
  const { hasFeature } = useLicense();
  const [config, setConfig] = useState({
    telegramBotToken: "",
    telegramChatId: "",
    emailAddress: "",
    slackWebhook: "",
  });

  if (!hasFeature("SMART_ALERTS")) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-500">
        <Bell size={48} className="mb-4 opacity-50 text-amber-500" />
        <h2 className="text-xl font-semibold mb-2 text-zinc-800 dark:text-zinc-200">Feature Not Available</h2>
        <p>Smart Alerts (Telegram, Email, Slack notifications) require a Premium License.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Smart Alerts" 
        subtitle="Configure proactive notifications for panel health, SSL expiry, and traffic limits." 
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2 mb-6">
            <Bell className="text-amber-500" /> Notification Channels
          </h3>
          
          <div className="space-y-4">
            <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-blue-500">Telegram Bot</span>
                <input type="checkbox" className="w-4 h-4" defaultChecked />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500">Bot Token</label>
                  <input 
                    type="password"
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Chat ID</label>
                  <input 
                    placeholder="-100123456789"
                    className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-zinc-800 dark:text-zinc-100">Email</span>
                <input type="checkbox" className="w-4 h-4" />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Email Address</label>
                <input 
                  placeholder="admin@example.com"
                  className="w-full mt-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            <button className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500">
              Save Channels
            </button>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2 mb-6">
            <Settings className="text-zinc-500" /> Alert Rules
          </h3>

          <div className="space-y-3">
            {[
              { id: 1, title: 'Panel Offline', desc: 'Alert when a connected panel stops responding', severity: 'Critical' },
              { id: 2, title: 'SSL Expiry', desc: 'Alert 7 days before domain SSL certificates expire', severity: 'Warning' },
              { id: 3, title: 'High Traffic', desc: 'Alert when a user reaches 90% of data limit', severity: 'Info' },
              { id: 4, title: 'Backup Failed', desc: 'Alert when auto-backup fails to upload', severity: 'Critical' },
            ].map((rule) => (
              <div key={rule.id} className="flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-blue-500 transition-colors">
                <div>
                  <div className="font-medium text-sm text-zinc-800 dark:text-zinc-100">{rule.title}</div>
                  <div className="text-xs text-zinc-500">{rule.desc}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                    rule.severity === 'Critical' ? 'bg-red-500/10 text-red-500' :
                    rule.severity === 'Warning' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-blue-500/10 text-blue-500'
                  }`}>
                    {rule.severity}
                  </span>
                  <input type="checkbox" defaultChecked className="w-4 h-4 cursor-pointer" />
                </div>
              </div>
            ))}

            <button className="w-full mt-4 flex items-center justify-center gap-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg py-2 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors">
              <Plus size={16} /> Add Custom Rule
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
