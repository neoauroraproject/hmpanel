import { Injectable } from '@nestjs/common';
import type { PluginSlotName } from './plugin-manifest';

export type PluginSlotHandler = {
  pluginId: string;
  slot: PluginSlotName;
  /** Declarative handle only — never a user-supplied function. */
  ref: string;
};

@Injectable()
export class PluginSlotRegistry {
  private readonly handlers = new Map<PluginSlotName, PluginSlotHandler[]>();

  register(handler: PluginSlotHandler): void {
    const list = this.handlers.get(handler.slot) || [];
    if (list.some((h) => h.pluginId === handler.pluginId && h.ref === handler.ref)) return;
    list.push(handler);
    this.handlers.set(handler.slot, list);
  }

  list(slot?: PluginSlotName): PluginSlotHandler[] {
    if (slot) return [...(this.handlers.get(slot) || [])];
    return [...this.handlers.values()].flat();
  }

  clear(): void {
    this.handlers.clear();
  }
}
