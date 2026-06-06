"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, PageHeader, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useAuth } from "@/store/auth";
import { Store, Save, Link as LinkIcon, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function StoreSettingsPage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  const user = useAuth((s) => s.admin);
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["storeProfile"],
    queryFn: async () => (await api.get("/store/profile")).data,
    retry: false
  });

  const { data: stats } = useQuery({
    queryKey: ["storeStats"],
    queryFn: async () => (await api.get("/store/stats")).data,
    enabled: !!profile
  });

  const updateProfile = useMutation({
    mutationFn: async (payload: any) => (await api.patch("/store/profile", payload)).data,
    onSuccess: () => {
      toast("Store profile updated successfully");
      qc.invalidateQueries({ queryKey: ["storeProfile"] });
    },
    onError: (e: any) => toast(e.response?.data?.message || "Failed to update profile", "error"),
  });

  const [form, setForm] = useState({
    slug: "",
    title: "",
    logoUrl: "",
    description: "",
    theme: "modern",
    defaultCurrency: "USD",
    supportLinks: { telegram: "", whatsapp: "", website: "", email: "" },
    paymentInstructions: "",
    bankCardNumber: "",
    bankAccountInfo: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        slug: profile.slug || "",
        title: profile.title || "",
        logoUrl: profile.logoUrl || "",
        description: profile.description || "",
        theme: profile.theme || "modern",
        defaultCurrency: profile.defaultCurrency || "USD",
        supportLinks: profile.supportLinks || { telegram: "", whatsapp: "", website: "", email: "" },
        paymentInstructions: profile.paymentInstructions || "",
        bankCardNumber: profile.bankCardNumber || "",
        bankAccountInfo: profile.bankAccountInfo || "",
      });
    }
  }, [profile]);

  if (isLoading) return <Spinner />;

  const activateSelf = useMutation({
    mutationFn: async (panelId: string) => (await api.post("/store/activate-self", { panelId })).data,
    onSuccess: () => {
      toast("Store activated successfully");
      qc.invalidateQueries({ queryKey: ["storeProfile"] });
    },
    onError: (e: any) => toast(e.response?.data?.message || "Failed to activate store", "error"),
  });

  const { data: panels } = useQuery({
    queryKey: ["panels"],
    queryFn: async () => (await api.get("/panels")).data,
    enabled: !!error && user?.role === "SUPER_ADMIN"
  });

  const [selectedPanelId, setSelectedPanelId] = useState("");

  if (error) {
    return (
      <div className="space-y-6 max-w-4xl">
        <PageHeader title="Store Settings" subtitle="Configure your storefront appearance and payment details." />
        <Card className="p-8 text-center border-t-4 border-t-amber-500">
          <Store className="w-16 h-16 text-amber-500 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-2">Store Not Activated</h2>
          <p className="text-zinc-500 max-w-md mx-auto mb-6">Your premium store has not been activated yet. Please contact the Super Admin to assign a panel and enable your store.</p>
          
          {user?.role === "SUPER_ADMIN" && (
            <div className="max-w-sm mx-auto p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 text-left">
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100 mb-3 flex items-center gap-2"><ShieldCheck size={16} className="text-blue-500" /> Super Admin Activation</h3>
              <select 
                value={selectedPanelId} 
                onChange={e => setSelectedPanelId(e.target.value)}
                className="w-full mb-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
              >
                <option value="" disabled>Select Panel Node for Store...</option>
                {(panels as any[])?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button 
                onClick={() => activateSelf.mutate(selectedPanelId)}
                disabled={!selectedPanelId || activateSelf.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {activateSelf.isPending ? <Spinner className="w-4 h-4" /> : "Activate My Store"}
              </button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <PageHeader 
          title="Store Settings" 
          subtitle="Configure your storefront appearance and payment details." 
        />
        <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg">
          <Link href="/store/settings" className="px-4 py-1.5 text-sm font-medium bg-white dark:bg-zinc-700 shadow-sm rounded-md text-zinc-900 dark:text-zinc-100">Settings</Link>
          <Link href="/store/products" className="px-4 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300">Products</Link>
          <Link href="/store/orders" className="px-4 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300">Orders</Link>
        </div>
      </div>

      {!error && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="p-5 flex items-center gap-4 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/10 dark:to-zinc-900 border-blue-100 dark:border-blue-900/30">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
              <Store size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Delivered Orders</p>
              <h4 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">{stats.totalOrders}</h4>
            </div>
          </Card>
          <Card className="p-5 flex items-center gap-4 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/10 dark:to-zinc-900 border-emerald-100 dark:border-emerald-900/30">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400">
              <Save size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Sales Value</p>
              <h4 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
                {stats.totalSales.toLocaleString()} <span className="text-sm font-normal text-zinc-500">{form.defaultCurrency}</span>
              </h4>
            </div>
          </Card>
        </div>
      )}

      <Card className="p-6 border-t-4 border-t-blue-500">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <Store className="text-blue-500" /> Store Profile
          </h3>
          {profile?.slug && (
            <a 
              href={`/shop/${profile.slug}`} 
              target="_blank" 
              className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 font-medium"
            >
              View Storefront <ExternalLink size={14} />
            </a>
          )}
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Store URL (Slug)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">/shop/</span>
                <input 
                  value={form.slug} onChange={e => setForm({...form, slug: e.target.value})}
                  className="w-full pl-14 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Store Title</label>
              <input 
                value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" 
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Logo URL (Optional)</label>
            <input 
              value={form.logoUrl} onChange={e => setForm({...form, logoUrl: e.target.value})}
              placeholder="https://example.com/logo.png"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description (Optional)</label>
            <textarea 
              value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              rows={2}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Store Theme</label>
              <select 
                value={form.theme} onChange={e => setForm({...form, theme: e.target.value})}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" 
              >
                <option value="modern">Modern (Default)</option>
                <option value="minimal">Minimal</option>
                <option value="corporate">Corporate</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Default Currency</label>
              <select 
                value={form.defaultCurrency} onChange={e => setForm({...form, defaultCurrency: e.target.value})}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" 
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="IRR">IRR (Toman)</option>
                <option value="CRYPTO">Crypto (USDT/BTC)</option>
              </select>
            </div>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800 my-6" />

          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 mb-4">Support Links</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Telegram</label>
              <input value={form.supportLinks.telegram} onChange={e => setForm({...form, supportLinks: {...form.supportLinks, telegram: e.target.value}})} placeholder="@username or t.me/..." className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">WhatsApp</label>
              <input value={form.supportLinks.whatsapp} onChange={e => setForm({...form, supportLinks: {...form.supportLinks, whatsapp: e.target.value}})} placeholder="+123456789" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email</label>
              <input type="email" value={form.supportLinks.email} onChange={e => setForm({...form, supportLinks: {...form.supportLinks, email: e.target.value}})} placeholder="support@domain.com" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Website</label>
              <input value={form.supportLinks.website} onChange={e => setForm({...form, supportLinks: {...form.supportLinks, website: e.target.value}})} placeholder="https://..." className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" />
            </div>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800 my-6" />

          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 mb-4">Payment Information</h3>
          
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Payment Instructions</label>
            <textarea 
              value={form.paymentInstructions} onChange={e => setForm({...form, paymentInstructions: e.target.value})}
              placeholder="e.g. Please transfer the exact amount and upload the receipt."
              rows={2}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Bank Card Number</label>
              <input 
                value={form.bankCardNumber} onChange={e => setForm({...form, bankCardNumber: e.target.value})}
                placeholder="6037-9919-XXXX-XXXX"
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Account Holder Name</label>
              <input 
                value={form.bankAccountInfo} onChange={e => setForm({...form, bankAccountInfo: e.target.value})}
                placeholder="John Doe"
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500" 
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              onClick={() => updateProfile.mutate(form)}
              disabled={updateProfile.isPending}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {updateProfile.isPending ? <Spinner className="w-4 h-4" /> : <Save size={16} />}
              Save Profile
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
