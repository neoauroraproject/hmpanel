"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Image as ImageIcon, Palette, Layout, Link as LinkIcon, MessageCircle, Phone, Globe, Mail, QrCode } from "lucide-react";
import { api } from "@/lib/api";
import { Card, PageHeader, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { motion } from "framer-motion";
import { useAuth } from "@/store/auth";

const THEMES = [
  { id: "Dark", label: "Dark Mode" },
  { id: "Light", label: "Light Mode" },
  { id: "Cyberpunk", label: "Cyberpunk" },
  { id: "Sunset", label: "Sunset" },
  { id: "Minimalist", label: "Minimalist" },
  { id: "Hacker", label: "Hacker" },
];

const defaultSettings = {
  // Support
  showTelegram: false, telegramLink: "",
  showWhatsApp: false, whatsappLink: "",
  showWebsite: false, websiteUrl: "",
  showEmail: false, emailAddress: "",
  // Branding
  portalName: "",
  logoUrl: "",
  primaryColor: "#3b82f6",
  theme: "Dark",
  // Portal Toggles
  showPlatformQR: true,
  showNativeQR: true,
  allowQRDownload: true,
  allowDirectImport: true,
  showSupportSection: true,
};

export default function ResellerSettingsPage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const { admin: user } = useAuth();
  const [form, setForm] = useState(defaultSettings);

  const { data: admin, isLoading, error } = useQuery({
    queryKey: ["admins", user?.id],
    queryFn: async () => (await api.get(`/admins/${user?.id}`)).data,
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (admin?.portalSettings) {
      setForm({ ...defaultSettings, ...(admin.portalSettings || {}) });
    }
  }, [admin]);

  const updateSettings = useMutation({
    mutationFn: async (payload: any) => (await api.patch(`/admins/${user?.id}`, { portalSettings: payload })).data,
    onSuccess: () => {
      toast("Portal Settings saved successfully");
      qc.invalidateQueries({ queryKey: ["admins", user?.id] });
    },
    onError: () => toast("Failed to save settings", "error"),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    const status = (error as any)?.response?.status || (error as any)?.status;
    if (status === 403) {
      return (
        <div className="space-y-8 max-w-5xl">
          <PageHeader title="Branding & Subscription Portal" subtitle="Customize your customer-facing subscription pages and client connection details." />
          <Card className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
              <Palette size={32} className="text-zinc-400" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100 mb-2">Feature Disabled</h2>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-md">
              You do not have permission to customize the portal branding. Please contact your administrator if you need access to this feature.
            </p>
          </Card>
        </div>
      );
    }
    return <ErrorBox message="Failed to load settings" />;
  }

  const hasPermission = admin?.permissions?.includes("canCustomizeBranding") || admin?.role === "SUPER_ADMIN";

  if (!hasPermission) {
    return (
      <div className="space-y-8 max-w-5xl">
        <PageHeader title="Branding & Subscription Portal" subtitle="Customize your customer-facing subscription pages and client connection details." />
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
            <Palette size={32} className="text-zinc-400" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100 mb-2">Feature Disabled</h2>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-md">
            You do not have permission to customize the portal branding. Please contact your administrator if you need access to this feature.
          </p>
        </Card>
      </div>
    );
  }

  const handleSave = () => updateSettings.mutate(form);

  return (
    <div className="space-y-8 max-w-5xl">
      <PageHeader
        title="Branding & Subscription Portal"
        subtitle="Customize your customer-facing subscription pages and client connection details."
      />

      <div className="flex justify-end">
        <button 
          onClick={handleSave} disabled={updateSettings.isPending}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {updateSettings.isPending ? <Spinner className="w-4 h-4" /> : <Save size={16} />} Save All Settings
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* BRANDING */}
        {process.env.NEXT_PUBLIC_RELEASE_MODE !== 'COMMUNITY' && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-4">
            <Palette size={20} className="text-purple-400" />
            <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Branding</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Portal Name</label>
              <input 
                type="text" 
                value={form.portalName} 
                onChange={e => setForm(f => ({ ...f, portalName: e.target.value }))}
                className="w-full rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-800 dark:text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                placeholder="e.g. My Premium VPN"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-2"><ImageIcon size={14}/> Logo URL</span>
                <label className="cursor-pointer text-xs bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 px-2 py-1 rounded transition-colors">
                  Upload Logo
                  <input 
                    type="file" 
                    accept="image/png" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        toast("File size must be less than 2MB", "error");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setForm(f => ({ ...f, logoUrl: reader.result as string }));
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </label>
              <input 
                type="text" 
                value={form.logoUrl} 
                onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                className="w-full rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-800 dark:text-zinc-100 focus:border-blue-500 outline-none"
                placeholder="https://example.com/logo.png or Base64"
              />
              {form.logoUrl && form.logoUrl.startsWith('data:image') && (
                <div className="mt-2">
                  <img src={form.logoUrl} alt="Logo Preview" className="h-12 object-contain" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={form.primaryColor} 
                    onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                    className="h-10 w-14 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 cursor-pointer"
                  />
                  <input 
                    type="text" 
                    value={form.primaryColor} 
                    onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                    className="w-full rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-800 dark:text-zinc-100 outline-none uppercase font-mono text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Theme Selection</label>
                <select 
                  value={form.theme} 
                  onChange={e => setForm(f => ({ ...f, theme: e.target.value }))}
                  className="w-full h-10 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 text-zinc-800 dark:text-zinc-100 outline-none"
                >
                  {THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>{theme.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </Card>
        )}

        {/* SUBSCRIPTION PORTAL */}
        <Card className="p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-4">
            <QrCode size={20} className="text-blue-400" />
            <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Subscription Page Features</h3>
          </div>

          <div className="space-y-3">
            <Toggle label="Show Platform Subscription QR" checked={form.showPlatformQR} onChange={(v: boolean) => setForm(f => ({ ...f, showPlatformQR: v }))} desc="The central managed URL that routes to active nodes." />
            <Toggle label="Show Native 3x-ui QR" checked={form.showNativeQR} onChange={(v: boolean) => setForm(f => ({ ...f, showNativeQR: v }))} desc="Direct link to the underlying server." />
            <Toggle label="Allow QR PNG Download" checked={form.allowQRDownload} onChange={(v: boolean) => setForm(f => ({ ...f, allowQRDownload: v }))} />
            <Toggle label="Allow Direct App Imports" checked={form.allowDirectImport} onChange={(v: boolean) => setForm(f => ({ ...f, allowDirectImport: v }))} desc="Buttons to 'Import to V2rayNG / Shadowrocket'." />
            <Toggle label="Show Support Section" checked={form.showSupportSection} onChange={(v: boolean) => setForm(f => ({ ...f, showSupportSection: v }))} />
          </div>
        </Card>

        {/* SUPPORT SETTINGS */}
        <Card className="p-6 md:col-span-2">
          <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-4">
            <MessageCircle size={20} className="text-emerald-400" />
            <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Support Information</h3>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Only enabled items will be visible on the client subscription page.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SupportRow icon={<MessageCircle className="text-blue-400"/>} title="Telegram" checked={form.showTelegram} onCheck={(v: boolean) => setForm(f => ({ ...f, showTelegram: v }))} value={form.telegramLink} onChange={(v: string) => setForm(f => ({ ...f, telegramLink: v }))} placeholder="https://t.me/your_channel" />
            <SupportRow icon={<Phone className="text-emerald-500"/>} title="WhatsApp" checked={form.showWhatsApp} onCheck={(v: boolean) => setForm(f => ({ ...f, showWhatsApp: v }))} value={form.whatsappLink} onChange={(v: string) => setForm(f => ({ ...f, whatsappLink: v }))} placeholder="https://wa.me/1234567890" />
            <SupportRow icon={<Globe className="text-purple-400"/>} title="Website" checked={form.showWebsite} onCheck={(v: boolean) => setForm(f => ({ ...f, showWebsite: v }))} value={form.websiteUrl} onChange={(v: string) => setForm(f => ({ ...f, websiteUrl: v }))} placeholder="https://myvpn.com" />
            <SupportRow icon={<Mail className="text-amber-400"/>} title="Email Address" checked={form.showEmail} onCheck={(v: boolean) => setForm(f => ({ ...f, showEmail: v }))} value={form.emailAddress} onChange={(v: string) => setForm(f => ({ ...f, emailAddress: v }))} placeholder="support@myvpn.com" />
          </div>
        </Card>

      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, desc }: { label: string, checked: boolean, onChange: (v: boolean) => void, desc?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className={`mt-0.5 w-10 h-5 rounded-full transition-colors relative ${checked ? "bg-blue-600" : "bg-zinc-700"}`}>
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </div>
      <div>
        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200 group-hover:text-white transition-colors">{label}</div>
        {desc && <div className="text-xs text-zinc-500 mt-0.5">{desc}</div>}
      </div>
      <input type="checkbox" className="hidden" checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

function SupportRow({ icon, title, checked, onCheck, value, onChange, placeholder }: any) {
  return (
    <div className="flex gap-4 items-start bg-white dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
      <label className="flex items-center gap-3 cursor-pointer mt-2">
        <input type="checkbox" checked={checked} onChange={e => onCheck(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900" />
        <div className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg">{icon}</div>
      </label>
      <div className="flex-1 space-y-1">
        <div className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{title}</div>
        <input 
          type="text" 
          value={value} 
          onChange={e => onChange(e.target.value)}
          disabled={!checked}
          placeholder={placeholder}
          className="w-full rounded bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 p-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 disabled:opacity-40"
        />
      </div>
    </div>
  );
}
