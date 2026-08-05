/** True when this inbound is hosted on a 3x-ui node (not the master panel xray). */
export function isNodeInbound(inbound: {
  nodeId?: number | null;
  originNodeGuid?: string | null;
}): boolean {
  const nodeId = Number(inbound?.nodeId || 0);
  if (Number.isFinite(nodeId) && nodeId > 0) return true;
  return Boolean(String(inbound?.originNodeGuid || "").trim());
}
