"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { formatBytes } from "@/lib/format";
import { ShieldCheck, Server, AlertCircle, RefreshCw, Upload, FileImage, CreditCard, Copy, Check, Globe } from "lucide-react";

const translations = {
  en: {
    storeNotFound: "Store Not Found",
    storeNotFoundDesc: "The store you are looking for does not exist or is currently unavailable.",
    availablePlans: "Available Plans",
    orderNow: "Order Now",
    traffic: "Traffic",
    duration: "Duration",
    days: "Days",
    noPlans: "No plans available at the moment. Please check back later.",
    backToProducts: "← Back to Products",
    completePurchase: "Complete Your Purchase",
    ordering: "You are ordering",
    newAccount: "New Account",
    renewExisting: "Renew Existing",
    subUrlLabel: "Subscription URL (Link or Token)",
    subUrlDesc: "Paste your current subscription link here so we can extend your existing account without changing your config.",
    nameLabel: "Your Name",
    telegramLabel: "Telegram (Optional)",
    whatsappLabel: "WhatsApp (Optional)",
    paymentInstructions: "Payment Instructions",
    cardNumber: "Card Number",
    receiptLabel: "Payment Receipt / Reference",
    receiptPlaceholder: "Enter transaction ID, reference number, or paste a link to the receipt image.",
    receiptHelp: "You can also use image hosting sites (like imgur) and paste the link here.",
    submitOrder: "Submit Order",
    submitting: "Submitting..."
  },
  fa: {
    storeNotFound: "فروشگاه یافت نشد",
    storeNotFoundDesc: "فروشگاهی که به دنبال آن هستید وجود ندارد یا در حال حاضر در دسترس نیست.",
    availablePlans: "طرح‌های موجود",
    orderNow: "سفارش",
    traffic: "ترافیک",
    duration: "مدت زمان",
    days: "روز",
    noPlans: "در حال حاضر هیچ طرحی موجود نیست.",
    backToProducts: "بازگشت به محصولات →",
    completePurchase: "تکمیل خرید",
    ordering: "شما در حال سفارش هستید",
    newAccount: "اکانت جدید",
    renewExisting: "تمدید اکانت فعلی",
    subUrlLabel: "لینک اشتراک (لینک یا توکن)",
    subUrlDesc: "لینک اشتراک فعلی خود را اینجا وارد کنید تا اکانت شما بدون تغییر کانفیگ تمدید شود.",
    nameLabel: "نام شما",
    telegramLabel: "تلگرام (اختیاری)",
    whatsappLabel: "واتساپ (اختیاری)",
    paymentInstructions: "دستورالعمل پرداخت",
    cardNumber: "شماره کارت",
    receiptLabel: "رسید پرداخت / کد پیگیری",
    receiptPlaceholder: "کد پیگیری تراکنش را وارد کنید یا لینک تصویر رسید را قرار دهید.",
    receiptHelp: "می‌توانید از سایت‌های آپلود عکس استفاده کرده و لینک آن را اینجا قرار دهید.",
    submitOrder: "ثبت سفارش",
    submitting: "در حال ثبت..."
  }
};

export default function ShopPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [lang, setLang] = useState<'en' | 'fa'>('fa');
  const t = translations[lang];

  useEffect(() => {
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }, [lang]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["shop", slug],
    queryFn: async () => (await api.get(`/store/public/${slug}`)).data,
    retry: false,
  });

  const createOrder = useMutation({
    mutationFn: async (payload: any) => (await api.post(`/store/public/${slug}/order`, payload)).data,
    onSuccess: (res) => {
      router.push(`/track/${res.trackingCode}`);
    },
  });

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isRenewal, setIsRenewal] = useState(false);
  const [form, setForm] = useState({
    subUrl: "",
    clientName: "",
    telegramId: "",
    whatsapp: "",
    notes: "",
    receiptText: "",
    receiptImage: "",
  });

  const [copied, setCopied] = useState(false);
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="animate-spin text-blue-500"><RefreshCw size={32} /></div>
    </div>;
  }

  if (error || !data) {
    return <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <AlertCircle size={48} className="text-red-500 mb-4" />
      <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100 mb-2">{t.storeNotFound}</h1>
      <p className="text-zinc-500">{t.storeNotFoundDesc}</p>
    </div>;
  }

  const { store, products } = data;

  if (selectedProduct) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4 font-sans text-zinc-900 dark:text-zinc-100" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
        <div className="max-w-2xl mx-auto space-y-6">
          <button 
            onClick={() => setSelectedProduct(null)}
            className="text-sm font-medium text-blue-500 hover:text-blue-600 mb-4 inline-block"
          >
            {t.backToProducts}
          </button>
          
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-200 dark:border-zinc-800">
            <div className="flex justify-between items-start mb-6 pb-6 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="text-xl font-bold mb-1">{t.completePurchase}</h2>
                <p className="text-zinc-500 text-sm">{t.ordering} {selectedProduct.name}</p>
              </div>
              <div className={`text-${lang === 'fa' ? 'left' : 'right'}`}>
                <div className="text-2xl font-black text-emerald-500">${selectedProduct.price}</div>
                <div className="text-xs text-zinc-400" dir="ltr">{formatBytes(Number(selectedProduct.traffic))} / {selectedProduct.durationDays} {t.days}</div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Renewal vs New */}
              <div className="flex gap-4 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl">
                <button 
                  onClick={() => setIsRenewal(false)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${!isRenewal ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
                >
                  {t.newAccount}
                </button>
                <button 
                  onClick={() => setIsRenewal(true)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${isRenewal ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
                >
                  {t.renewExisting}
                </button>
              </div>

              {isRenewal ? (
                <div>
                  <label className="block text-sm font-medium mb-1">{t.subUrlLabel}</label>
                  <p className="text-xs text-zinc-500 mb-2">{t.subUrlDesc}</p>
                  <input 
                    value={form.subUrl} onChange={e => setForm({...form, subUrl: e.target.value})}
                    placeholder="https://.../s/YOUR_TOKEN"
                    dir="ltr"
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 outline-none focus:border-blue-500 text-left" 
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">{t.nameLabel}</label>
                  <input 
                    value={form.clientName} onChange={e => setForm({...form, clientName: e.target.value})}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 outline-none focus:border-blue-500" 
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t.telegramLabel}</label>
                  <input 
                    value={form.telegramId} onChange={e => setForm({...form, telegramId: e.target.value})}
                    dir="ltr"
                    placeholder="@username"
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 outline-none focus:border-blue-500 text-left" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t.whatsappLabel}</label>
                  <input 
                    value={form.whatsapp} onChange={e => setForm({...form, whatsapp: e.target.value})}
                    dir="ltr"
                    placeholder="+123456789"
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 outline-none focus:border-blue-500 text-left" 
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/20">
                <h4 className="font-semibold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-2">
                  <CreditCard size={18} /> {t.paymentInstructions}
                </h4>
                <p className="text-sm text-blue-600/80 dark:text-blue-300/80 mb-4 whitespace-pre-line">
                  {store.paymentInstructions}
                </p>
                {store.bankCardNumber && (
                  <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-3 rounded-lg border border-blue-100 dark:border-blue-500/30">
                    <div dir="ltr" className="text-left">
                      <div className="text-xs text-zinc-500">{t.cardNumber}</div>
                      <div className="font-mono font-bold tracking-wider">{store.bankCardNumber}</div>
                      {store.bankAccountInfo && <div className="text-xs text-zinc-500 mt-0.5">{store.bankAccountInfo}</div>}
                    </div>
                    <button onClick={() => handleCopy(store.bankCardNumber)} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                      {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t.receiptLabel}</label>
                <textarea 
                  value={form.receiptText} onChange={e => setForm({...form, receiptText: e.target.value})}
                  placeholder={t.receiptPlaceholder}
                  rows={2}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 outline-none focus:border-blue-500" 
                />
                <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                  <FileImage size={12} /> {t.receiptHelp}
                </p>
              </div>

              <button
                onClick={() => {
                  createOrder.mutate({
                    productId: selectedProduct.id,
                    ...form
                  });
                }}
                disabled={createOrder.isPending || (isRenewal ? !form.subUrl : !form.clientName) || !form.receiptText}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
              >
                {createOrder.isPending ? <div className="animate-spin"><RefreshCw size={20} /></div> : t.submitOrder}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      {/* Store Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 py-12 px-4 text-center relative">
        <div className="absolute top-4 right-4 flex gap-2">
          <button onClick={() => setLang('fa')} className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${lang === 'fa' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>FA</button>
          <button onClick={() => setLang('en')} className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${lang === 'en' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>EN</button>
        </div>

        <div className="max-w-3xl mx-auto flex flex-col items-center">
          {store.logoUrl ? (
            <img src={store.logoUrl} alt={store.title} className="h-20 w-20 rounded-2xl mb-4 object-cover shadow-sm" />
          ) : (
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-tr from-blue-500 to-emerald-500 flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-500/20">
              <ShieldCheck size={40} />
            </div>
          )}
          <h1 className="text-3xl font-black tracking-tight mb-3">{store.title}</h1>
          {store.description && (
            <p className="text-zinc-500 max-w-lg mx-auto">{store.description}</p>
          )}
        </div>
      </div>

      {/* Products */}
      <div className="max-w-5xl mx-auto py-12 px-4">
        <h2 className="text-xl font-bold mb-8 flex items-center gap-2">
          <Server className="text-blue-500" /> {t.availablePlans}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products?.map((p: any) => (
            <div 
              key={p.id} 
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-blue-500/50 transition-all cursor-pointer flex flex-col group relative overflow-hidden"
            >
              <div className={`absolute top-0 ${lang === 'fa' ? 'left-0' : 'right-0'} w-32 h-32 bg-gradient-to-bl from-blue-500/10 to-transparent -mx-16 -mt-16 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all`}></div>
              
              <h3 className="text-xl font-bold mb-2">{p.name}</h3>
              <p className="text-sm text-zinc-500 mb-6 h-10">{p.description}</p>
              
              <div className="mb-6" dir="ltr" style={{ textAlign: lang === 'fa' ? 'right' : 'left' }}>
                <span className="text-3xl font-black text-blue-600 dark:text-blue-400">${p.price}</span>
              </div>

              <div className="space-y-3 flex-1 mb-8">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">{t.traffic}</span>
                  <span className="font-semibold" dir="ltr">{formatBytes(Number(p.traffic))}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">{t.duration}</span>
                  <span className="font-semibold">{p.durationDays} {t.days}</span>
                </div>
              </div>

              <button 
                onClick={() => setSelectedProduct(p)}
                className="w-full py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 rounded-xl font-bold transition-colors"
              >
                {t.orderNow}
              </button>
            </div>
          ))}
          {products?.length === 0 && (
            <div className="col-span-full py-20 text-center text-zinc-500">
              {t.noPlans}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
