"use client";

export type StorefrontProduct = {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
  priceUsd: number;
  priceToman?: number | null;
  traffic: string;
  durationDays: number;
  badge?: string | null;
  featured?: boolean;
  renewable?: boolean;
};

export type StorefrontStore = {
  title: string;
  description?: string | null;
  slug: string;
  logoUrl?: string | null;
  logoDarkUrl?: string | null;
  defaultCurrency?: string;
  branding?: {
    name?: string | null;
    description?: string | null;
    logo?: string | null;
    logoDark?: string | null;
    primaryColor?: string | null;
    theme?: string | null;
    supportLinks?: Record<string, string> | null;
  };
  payment?: {
    method: string;
    instructions?: string | null;
    cardNumber?: string | null;
    cardHolder?: string | null;
    bankName?: string | null;
    iban?: string | null;
    accountInfo?: string | null;
    cards?: Array<{
      id: string;
      bankName?: string;
      cardNumber?: string;
      cardHolder?: string;
      iban?: string;
      instructions?: string;
      enabled?: boolean;
    }>;
    methods?: Array<{
      id: string;
      label: string;
      enabled: boolean;
      available?: boolean;
    }>;
  };
};

export type CustomerProfile = {
  id?: string;
  token?: string;
  name?: string | null;
  telegram?: string | null;
  whatsapp?: string | null;
  email?: string | null;
};

export type CustomerNotification = {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  readAt?: string | null;
  isRead?: boolean;
  createdAt: string;
};

export type CustomerService = {
  id: string;
  email: string;
  remark?: string | null;
  subId?: string | null;
  subToken?: string | null;
  status: "active" | "expired" | "disabled" | "pending";
  total: string;
  up: string;
  down: string;
  expiryTime: string;
};

export type CustomerOrder = {
  id: string;
  trackingCode: string;
  status: string;
  amount: number;
  currency: string;
  isRenewal: boolean;
  productName: string;
  categoryId: string;
  createdAt: string;
  timeline?: Array<{
    id?: string;
    status: string;
    message?: string | null;
    createdAt: string;
  }>;
};

export type CustomerDashboard = {
  token: string;
  profile: CustomerProfile;
  store?: {
    slug?: string;
    title?: string;
    defaultCurrency?: string;
    payment?: StorefrontStore["payment"] | null;
  };
  branding?: StorefrontStore["branding"];
  supportLinks?: Record<string, string> | null;
  services: CustomerService[];
  activeServices: CustomerService[];
  expiredServices: CustomerService[];
  pendingOrders: CustomerOrder[];
  orders: CustomerOrder[];
  products: StorefrontProduct[];
  renewProducts: StorefrontProduct[];
  notifications: CustomerNotification[];
  activity: Array<{
    id: string;
    type: string;
    title: string;
    message?: string | null;
    createdAt: string;
  }>;
};
