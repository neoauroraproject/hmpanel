/**
 * True when this inbound is hosted on a remote 3x-ui node (not the master panel).
 *
 * Use `nodeId` only. Do NOT use `originNodeGuid` alone: on newer 3x-ui builds the
 * list API fills OriginNodeGuid with the master's own panelGuid for local inbounds
 * at read time (#4983 LocalOriginGuid), so every inbound would look like a node.
 * Local ⇒ nodeId null/0/absent. Node ⇒ nodeId > 0.
 */
export function isNodeInbound(inbound: {
  nodeId?: number | null;
  originNodeGuid?: string | null;
  nodeName?: string | null;
}): boolean {
  const nodeId = Number(inbound?.nodeId);
  return Number.isFinite(nodeId) && nodeId > 0;
}

/** Display label for a node-hosted inbound (prefer API node name). */
export function nodeInboundLabel(inbound: {
  nodeId?: number | null;
  nodeName?: string | null;
}): string | null {
  if (!isNodeInbound(inbound)) return null;
  const name = String(inbound?.nodeName || "").trim();
  if (name) return name;
  return "Node";
}
