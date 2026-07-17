"use client";

import type { ComponentType } from "react";
import type { ClientOutputModel } from "./types";
import { SubscriptionRenderer } from "./renderers/SubscriptionRenderer";
import { WireGuardRenderer } from "./renderers/WireGuardRenderer";
import { GenericRenderer } from "./renderers/GenericRenderer";

export type ConnectionRendererProps = {
  output: ClientOutputModel;
  /** Prefer admin download paths when true */
  admin?: boolean;
  showPlatformQR?: boolean;
  showNativeQR?: boolean;
  allowQRDownload?: boolean;
};

const REGISTRY: Record<string, ComponentType<ConnectionRendererProps>> = {
  subscription: SubscriptionRenderer,
  wireguard: WireGuardRenderer,
  generic: GenericRenderer,
};

/** Frontend never branches on protocol — only outputType. */
export function getConnectionRenderer(outputType: string) {
  return REGISTRY[outputType] || GenericRenderer;
}

export function registerConnectionRenderer(
  outputType: string,
  component: ComponentType<ConnectionRendererProps>,
) {
  REGISTRY[outputType] = component;
}
