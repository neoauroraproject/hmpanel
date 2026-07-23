import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, Check, AlertTriangle, Users, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { motion } from "framer-motion";
import { useT } from "@/i18n";

interface BulkCreateModalProps {
  onClose: () => void;
  inboundsList: any[];
}

export function BulkCreateModal({ onClose, inboundsList }: BulkCreateModalProps) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  const [form, setForm] = useState({
    prefix: "",
    separator: "-",
    startNumber: 1,
    endNumber: 10,
    trafficGB: "",
    expiryDays: "",
    inboundIds: [] as string[],
    group: "",
    remark: "",
    enable: true,
    limitIp: "",
  });

  const [previewEmails, setPreviewEmails] = useState<string[]>([]);
  const [validation, setValidation] = useState<{
    valid: boolean;
    conflicts?: string[];
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Fetch groups
  const { data: groups } = useQuery<string[]>({
    queryKey: ["xui-groups"],
    queryFn: async () => (await api.get<string[]>("/clients/groups")).data,
  });

  // Populate default inbound if empty
  useEffect(() => {
    if (inboundsList?.length > 0 && form.inboundIds.length === 0) {
      try {
        const cached = JSON.parse(localStorage.getItem("lastSelectedInboundIds") || "[]");
        const validCached = cached.filter((id: string) => inboundsList.some(i => i.id === id));
        if (validCached.length > 0) {
          setTimeout(() => setForm(f => ({ ...f, inboundIds: validCached })), 0);
        } else {
          setTimeout(() => setForm(f => ({ ...f, inboundIds: [inboundsList[0].id] })), 0);
        }
      } catch {
        setTimeout(() => setForm(f => ({ ...f, inboundIds: [inboundsList[0].id] })), 0);
      }
    }
  }, [inboundsList]);

  // Validation & Preview effect
  useEffect(() => {
    // Generate preview
    const { prefix, separator, startNumber, endNumber } = form;
    const emails: string[] = [];
    const maxPreview = 10;
    
    if (startNumber > 0 && endNumber >= startNumber) {
      for (let i = startNumber; i <= Math.min(endNumber, startNumber + maxPreview - 1); i++) {
        emails.push(`${prefix}${separator}${i}`);
      }
      if (endNumber > startNumber + maxPreview - 1) {
        emails.push("...");
      }
    }
    setPreviewEmails(emails);

    // Validate
    const validateParams = async () => {
      if (!prefix || form.inboundIds.length === 0 || startNumber <= 0 || endNumber < startNumber) {
        setValidation(null);
        return;
      }
      if (endNumber - startNumber > 500) {
        setValidation({ valid: false, conflicts: [t("clients.maxBulkError")] });
        return;
      }

      setIsValidating(true);
      try {
        const res = await api.post("/clients/bulk-create/validate", {
          prefix,
          separator,
          startNumber,
          endNumber,
          inboundIds: form.inboundIds,
        });
        setValidation(res.data);
      } catch (err: any) {
        setValidation({
          valid: false,
          conflicts: [err.response?.data?.message || t("common.validationFailed")],
        });
      } finally {
        setIsValidating(false);
      }
    };

    const timeoutId = setTimeout(validateParams, 500);
    return () => clearTimeout(timeoutId);
  }, [form.prefix, form.separator, form.startNumber, form.endNumber, form.inboundIds, t]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        prefix: form.prefix,
        separator: form.separator,
        startNumber: form.startNumber,
        endNumber: form.endNumber,
        inboundIds: form.inboundIds,
        enable: form.enable,
        limitIp: form.limitIp ? Number(form.limitIp) : 0,
      };

      if (form.trafficGB) {
        payload.total = Number(form.trafficGB) * 1024 * 1024 * 1024;
      }
      if (form.expiryDays) {
        payload.expiryTime = Date.now() + Number(form.expiryDays) * 24 * 60 * 60 * 1000;
      }
      if (form.group) payload.group = form.group;
      if (form.remark) payload.remark = form.remark;

      return await api.post("/clients/bulk-create", payload);
    },
    onSuccess: () => {
      toast(t("clients.bulkCreateSuccess"), "success");
      qc.invalidateQueries({ queryKey: ["clients"] });
      onClose();
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("clients.bulkCreateFailed"), "error");
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation?.valid) return;
    createMutation.mutate();
  };

  const count = form.endNumber - form.startNumber + 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/10 p-2 text-blue-500">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{t("clients.bulkCreateTitle")}</h3>
              <p className="text-xs text-zinc-500">{t("clients.bulkCreateSubtitle")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 p-2"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Naming Section */}
            <div className="space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4">
              <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("clients.namingPattern")}</h4>
              
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">{t("clients.prefix")}</label>
                <input
                  type="text"
                  required
                  placeholder={t("clients.prefixPlaceholder")}
                  value={form.prefix}
                  onChange={(e) => setForm({ ...form, prefix: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">{t("clients.separator")}</label>
                <select
                  value={form.separator}
                  onChange={(e) => setForm({ ...form, separator: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
                >
                  <option value="-">{t("clients.sepHyphen")}</option>
                  <option value="_">{t("clients.sepUnderscore")}</option>
                  <option value="*">{t("clients.sepAsterisk")}</option>
                  <option value=".">{t("clients.sepDot")}</option>
                  <option value="">{t("clients.sepNone")}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">{t("clients.startNumber")}</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.startNumber}
                    onChange={(e) => setForm({ ...form, startNumber: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">{t("clients.endNumber")}</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.endNumber}
                    onChange={(e) => setForm({ ...form, endNumber: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {previewEmails.length > 0 && (
                <div className="mt-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
                  <span className="text-xs text-zinc-500 mb-1 block">{t("clients.previewClients", { count: count > 0 ? count : 0 })}</span>
                  <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto">
                    {previewEmails.map((email, idx) => (
                      <span key={idx} className="inline-block bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[11px] text-zinc-600 dark:text-zinc-300 font-mono">
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Config Section */}
            <div className="space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4">
              <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("clients.configuration")}</h4>
              
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">{t("clients.assignedInbounds")}</label>
                <div className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
                  <div className="max-h-[160px] overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800">
                    {inboundsList?.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-zinc-500">{t("common.noInboundsAvailable")}</div>
                    ) : (
                      inboundsList?.map((i) => {
                        const isChecked = form.inboundIds.includes(i.id);
                        return (
                          <label
                            key={i.id}
                            className="flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 select-none"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const nextIds = isChecked
                                  ? form.inboundIds.filter(id => id !== i.id)
                                  : [...form.inboundIds, i.id];
                                setForm({ ...form, inboundIds: nextIds });
                                localStorage.setItem("lastSelectedInboundIds", JSON.stringify(nextIds));
                              }}
                              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-zinc-900 bg-transparent"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center gap-2">
                                <span className="font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                                  {i.remark ? i.remark : i.tag}
                                </span>
                                <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-bold shrink-0">
                                  {i.protocol} : {i.port}
                                </span>
                              </div>
                              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                                {t("clients.panelInboundLine", {
                                  panel: i.panel?.name || t("common.unknown"),
                                  tag: i.tag,
                                  port: i.port,
                                })}
                              </div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">{t("clients.totalGb")}</label>
                  <input
                    type="number"
                    min="0"
                    placeholder={t("common.unlimited")}
                    value={form.trafficGB}
                    onChange={(e) => setForm({ ...form, trafficGB: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">{t("clients.expiryDays")}</label>
                  <input
                    type="number"
                    min="0"
                    placeholder={t("common.unlimited")}
                    value={form.expiryDays}
                    onChange={(e) => setForm({ ...form, expiryDays: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-zinc-500">{t("clients.ipLimit")}</label>
                <input
                  type="number"
                  min="0"
                  placeholder={t("clients.ipLimitPlaceholder")}
                  value={form.limitIp}
                  onChange={(e) => setForm({ ...form, limitIp: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="bulk-enable"
                  checked={form.enable}
                  onChange={(e) => setForm({ ...form, enable: e.target.checked })}
                  className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="bulk-enable" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t("clients.enableImmediately")}
                </label>
              </div>
            </div>
          </div>

          {/* Validation Status */}
          <div className="rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
            {isValidating ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">{t("clients.validating3xui")}</span>
              </div>
            ) : validation?.valid ? (
              <div className="flex items-center gap-2 text-emerald-500">
                <Check size={18} />
                <span className="text-sm font-medium">{t("clients.validationPassed")}</span>
              </div>
            ) : validation?.conflicts && validation.conflicts.length > 0 ? (
              <div className="flex items-start gap-2 text-red-500">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <span className="text-sm font-medium">{t("clients.validationFailedLabel")}</span>
                  <ul className="list-disc pl-5 mt-1 text-xs space-y-1">
                    {validation.conflicts.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-zinc-500">
                <AlertTriangle size={18} />
                <span className="text-sm">{t("clients.validationFillRequired")}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-6 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !validation?.valid || count <= 0}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/30 hover:bg-blue-500 disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              {createMutation.isPending
                ? t("common.creating")
                : t("clients.createClientsBtn", { count: count > 0 ? count : 0 })}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
