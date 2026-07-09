"use client";

import React from "react";
import { usePluginRegistry } from "@/store/pluginRegistry";

interface PluginSlotProps {
  name: string;
  props?: Record<string, unknown>;
}

/** Extension point — premium bundle registers slot components at runtime. */
export function PluginSlot({ name, props }: PluginSlotProps) {
  const slots = usePluginRegistry((state) => state.slots[name]);

  if (!slots?.length) return null;

  return (
    <>
      {slots.map((Slot, index) => {
        const Component = Slot.component;
        return <Component key={index} {...props} />;
      })}
    </>
  );
}
