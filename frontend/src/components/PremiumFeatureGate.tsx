"use client";

import React from "react";
import { useLicense, PremiumFeature } from "@/hooks/useLicense";

interface PremiumFeatureProps {
  flag: PremiumFeature;
  children: React.ReactNode;
  /** Optional fallback to show if the feature is disabled. Default is null (hidden). */
  fallback?: React.ReactNode;
}

/**
 * A wrapper component that conditionally renders its children
 * based on whether the specified premium feature flag is active.
 * 
 * If the license is loading or the feature is disabled, it returns the fallback (or null).
 */
export function PremiumFeatureGate({ flag, children, fallback = null }: PremiumFeatureProps) {
  const { hasFeature, isLoading } = useLicense();

  if (isLoading) return null; // Avoid flashing content while loading license status

  if (!hasFeature(flag)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
