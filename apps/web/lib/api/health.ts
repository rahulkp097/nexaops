import { API_BASE_URL } from '../api-client';

// GET /health is deliberately version-neutral (see docs/api/contract.md) —
// it lives at the gateway's bare origin, not under /v1.
const GATEWAY_ORIGIN = API_BASE_URL.replace(/\/v\d+$/, '');

export interface GatewayHealth {
  status: 'ok' | 'error' | 'shutting_down';
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string }>;
  details?: Record<string, { status: string }>;
}

export async function getGatewayHealth(): Promise<GatewayHealth> {
  const response = await fetch(`${GATEWAY_ORIGIN}/health`);
  const body = (await response.json()) as GatewayHealth;
  return body;
}
