"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, PageHeader, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Package, Plus, Trash2, Edit2 } from "lucide-react";
import Link from "next/link";
import { formatBytes } from "@/lib/format";

export default function StoreProductsPage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["storeProducts"],
    queryFn: async () => (await api.get("/store/products")).data,
  });

  const { data: inbounds } = useQuery({
    queryKey: ["inbounds"],
    queryFn: async () => (await api.get<any[]>("/inbounds")).data,
  });

  const addProduct = useMutation({
    mutationFn: async (payload: any) => (await api.post("/store/products", payload)).data,
    onSuccess: () => {
      toast("Product created");
      qc.invalidateQueries({ queryKey: ["storeProducts"] });
      setIsModalOpen(false);
    },
    onError: () => toast("Failed to create product", "error"),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/store/products/${id}`)).data,
    onSuccess: () => {
      toast("Product deleted");
      qc.invalidateQueries({ queryKey: ["storeProducts"] });
    },
  });

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: 0,
    trafficGB: 50,
    durationDays: 30,
    inboundId: "",
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <PageHeader 
          title="Product Templates" 
          subtitle="Manage the plans available on your storefront." 
        />
        <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg">
          <Link href="/store/settings" className="px-4 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300">Settings</Link>
          <Link href="/store/products" className="px-4 py-1.5 text-sm font-medium bg-white dark:bg-zinc-700 shadow-sm rounded-md text-zinc-900 dark:text-zinc-100">Products</Link>
          <Link href="/store/orders" className="px-4 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300">Orders</Link>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <Plus size={16} /> New Product
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {products?.map((p: any) => (
          <Card key={p.id} className="p-0 overflow-hidden flex flex-col group hover:border-blue-500 transition-colors">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-100">{p.name}</h3>
                <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded text-sm font-bold">${p.price}</span>
              </div>
              <p className="text-xs text-zinc-500 h-8 line-clamp-2">{p.description}</p>
            </div>
            <div className="p-5 bg-zinc-50 dark:bg-zinc-900/50 flex-1 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Traffic:</span>
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{formatBytes(Number(p.traffic))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Duration:</span>
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{p.durationDays} Days</span>
              </div>
            </div>
            <div className="flex border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <button 
                onClick={() => {
                  if (confirm("Delete this product?")) deleteProduct.mutate(p.id);
                }}
                className="flex-1 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </Card>
        ))}
        {products?.length === 0 && (
          <div className="col-span-3 text-center py-12 text-zinc-500 border border-dashed rounded-xl border-zinc-300 dark:border-zinc-700">
            No products created yet.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-zinc-800 dark:text-zinc-100">Create Product</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Name</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
                <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Price ($)</label>
                  <input type="number" value={form.price} onChange={e => setForm({...form, price: Number(e.target.value)})} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Duration (Days)</label>
                  <input type="number" value={form.durationDays} onChange={e => setForm({...form, durationDays: Number(e.target.value)})} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Traffic (GB) - 0 for unlimited</label>
                <input type="number" value={form.trafficGB} onChange={e => setForm({...form, trafficGB: Number(e.target.value)})} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Target Inbound</label>
                <select value={form.inboundId} onChange={e => setForm({...form, inboundId: e.target.value})} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none">
                  <option value="">Select an inbound...</option>
                  {inbounds?.map(i => <option key={i.id} value={i.id}>{i.remark} (Port {i.port})</option>)}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancel</button>
              <button 
                onClick={() => {
                  addProduct.mutate({
                    ...form,
                    traffic: form.trafficGB * 1024 * 1024 * 1024,
                    inboundIds: [form.inboundId]
                  });
                }}
                disabled={!form.name || !form.inboundId || addProduct.isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
