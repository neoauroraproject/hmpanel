/**
 * True when this inbound is hosted on a remote 3x-ui node (not the master panel).
 *
 * Local ⇒ nodeId null/0/absent. Node ⇒ nodeId > 0, the same rule 3x-ui's own
 * inbound list uses. `nodeName` is a secondary signal because the sync only fills
 * it for inbounds it matched to a registered node — it covers transitive
 * sub-nodes, which are projected with node id 0 and therefore have no nodeId.
 *
 * Never use `originNodeGuid`: newer 3x-ui builds fill it with the master's own
 * panelGuid for local inbounds at read time (#4983 LocalOriginGuid), so every
 * inbound would look node-hosted.
 */
export function isNodeInbound(inbound: {
  nodeId?: number | null;
  originNodeGuid?: string | null;
  nodeName?: string | null;
}): boolean {
  const nodeId = Number(inbound?.nodeId);
  if (Number.isFinite(nodeId) && nodeId > 0) return true;
  return Boolean(String(inbound?.nodeName || "").trim());
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
