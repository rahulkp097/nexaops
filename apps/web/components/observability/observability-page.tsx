'use client';

import type { AuditLogResponseDto } from '@nexaops/shared-types';
import { useEffect, useState } from 'react';
import { listAuditLogs } from '../../lib/api/admin';
import { getGatewayHealth, type GatewayHealth } from '../../lib/api/health';
import { ApiError } from '../../lib/api-client';
import { Badge, ErrorBanner, Spinner } from '../ui';

// Phase 18 (spec §27) deliberately built request-id-correlated *logging*,
// not a persisted traces/requests table or a query API for one (the spec's
// own data model has no such table) — so there is no request-trace search
// or latency chart this dashboard could honestly show. It surfaces the two
// things that ARE real, queryable signals today: live service health and
// the audit trail. A fuller trace-search view would need Phase 18's scope
// revisited with real backend storage, not something to fake here.
export function ObservabilityPage() {
  const [health, setHealth] = useState<GatewayHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogResponseDto[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    getGatewayHealth()
      .then(setHealth)
      .catch(() => setHealthError('Could not reach the gateway health endpoint'));
    listAuditLogs(50)
      .then(setAuditLogs)
      .catch((err) => setAuditError(err instanceof ApiError ? err.message : 'Failed to load audit logs'));
  }, []);

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Observability</h1>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase text-neutral-500">Gateway dependency health</h2>
        {healthError && <ErrorBanner message={healthError} />}
        {!health && !healthError && (
          <div className="flex justify-center p-4">
            <Spinner />
          </div>
        )}
        {health && (
          <div className="flex gap-2">
            {Object.entries(health.details ?? {}).map(([name, detail]) => (
              <Badge key={name} tone={detail.status === 'up' ? 'green' : 'red'}>
                {name}: {detail.status}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-neutral-500">Recent audit activity</h2>
        {auditError && <ErrorBanner message={auditError} />}
        {auditLogs === null && !auditError && (
          <div className="flex justify-center p-4">
            <Spinner />
          </div>
        )}
        {auditLogs?.length === 0 && <p className="text-sm text-neutral-400">No audit activity yet.</p>}
        {auditLogs && auditLogs.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="pb-2">When</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Resource</th>
                <th className="pb-2">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 text-neutral-500">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="py-2">{log.action}</td>
                  <td className="py-2">{log.resource}</td>
                  <td className="max-w-md truncate py-2 text-xs text-neutral-500" title={JSON.stringify(log.metadata)}>
                    {JSON.stringify(log.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
