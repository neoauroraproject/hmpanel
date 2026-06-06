"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, PageHeader, Spinner, Badge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Check, X, Eye, FileImage } from "lucide-react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { useState } from "react";

export default function StoreOrdersPage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["storeOrders"],
    queryFn: async () => (await api.get("/store/orders")).data,
  });

  const approveOrder = useMutation({
    mutationFn: async (id: string) => (await api.post(`/store/orders/${id}/approve`)).data,
    onSuccess: () => {
      toast("Order approved & Client created/updated!");
      qc.invalidateQueries({ queryKey: ["storeOrders"] });
    },
    onError: (e: any) => toast(e.response?.data?.message || "Failed to approve order", "error"),
  });

  const rejectOrder = useMutation({
    mutationFn: async (id: string) => (await api.post(`/store/orders/${id}/reject`)).data,
    onSuccess: () => {
      toast("Order rejected");
      qc.invalidateQueries({ queryKey: ["storeOrders"] });
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <PageHeader 
          title="Store Orders" 
          subtitle="Manage customer purchases and renewals." 
        />
        <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg">
          <Link href="/store/settings" className="px-4 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300">Settings</Link>
          <Link href="/store/products" className="px-4 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300">Products</Link>
          <Link href="/store/orders" className="px-4 py-1.5 text-sm font-medium bg-white dark:bg-zinc-700 shadow-sm rounded-md text-zinc-900 dark:text-zinc-100">Orders</Link>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3 font-medium">Tracking</th>
                <th className="px-6 py-3 font-medium">Customer</th>
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Receipt</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {orders?.map((o: any) => (
                <tr key={o.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-zinc-800 dark:text-zinc-200">{o.trackingCode}</td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-zinc-800 dark:text-zinc-200">{o.clientName}</div>
                    <div className="text-xs text-zinc-500">{o.telegramId || o.whatsapp || "No contact"}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-zinc-800 dark:text-zinc-200">{o.product?.name}</div>
                    <div className="text-xs text-zinc-500">${o.product?.price}</div>
                  </td>
                  <td className="px-6 py-4">
                    {o.isRenewal ? <Badge tone="blue">Renewal</Badge> : <Badge tone="emerald">New</Badge>}
                  </td>
                  <td className="px-6 py-4">
                    {o.receiptImage ? (
                      <button 
                        onClick={() => setViewImage(o.receiptImage)}
                        className="flex items-center gap-1 text-blue-500 hover:underline"
                      >
                        <FileImage size={14} /> View
                      </button>
                    ) : o.receiptText ? (
                      <span className="text-zinc-500">{o.receiptText.substring(0, 15)}...</span>
                    ) : (
                      <span className="text-zinc-400 italic">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone={
                      o.status === 'PENDING' ? 'amber' : 
                      o.status === 'DELIVERED' ? 'green' : 
                      'red'
                    }>
                      {o.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-zinc-500 text-xs">{formatDateTime(o.createdAt)}</td>
                  <td className="px-6 py-4 text-right">
                    {o.status === 'PENDING' && (
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => {
                            if (confirm(`Approve order? This will automatically ${o.isRenewal ? 'update' : 'create'} the client.`)) {
                              approveOrder.mutate(o.id);
                            }
                          }}
                          disabled={approveOrder.isPending}
                          className="flex items-center justify-center p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                          title="Approve"
                        >
                          <Check size={18} />
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm('Reject this order?')) rejectOrder.mutate(o.id);
                          }}
                          disabled={rejectOrder.isPending}
                          className="flex items-center justify-center p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Reject"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {orders?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-zinc-500">No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {viewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setViewImage(null)}>
          <img src={viewImage} className="max-w-full max-h-full rounded-lg" alt="Receipt" />
        </div>
      )}
    </div>
  );
}
