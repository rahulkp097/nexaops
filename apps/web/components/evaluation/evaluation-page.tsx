'use client';

import type { EvaluationRunDetailResponseDto, EvaluationRunResponseDto } from '@nexaops/shared-types';
import { useEffect, useState } from 'react';
import { getEvaluationRun, listEvaluationRuns, startEvaluationRun } from '../../lib/api/evaluation';
import { ApiError } from '../../lib/api-client';
import { Badge, Button, ErrorBanner, Spinner } from '../ui';

function statusTone(status: EvaluationRunResponseDto['status']): 'green' | 'red' | 'amber' {
  if (status === 'COMPLETED') return 'green';
  if (status === 'FAILED') return 'red';
  return 'amber';
}

function categoryBreakdown(run: EvaluationRunDetailResponseDto) {
  const byCategory = new Map<string, { passed: number; total: number }>();
  for (const result of run.results) {
    const entry = byCategory.get(result.category) ?? { passed: 0, total: 0 };
    entry.total += 1;
    if (result.passed) entry.passed += 1;
    byCategory.set(result.category, entry);
  }
  return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function EvaluationPage() {
  const [runs, setRuns] = useState<EvaluationRunResponseDto[] | null>(null);
  const [selectedRun, setSelectedRun] = useState<EvaluationRunDetailResponseDto | null>(null);
  const [starting, setStarting] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refreshRuns() {
    listEvaluationRuns()
      .then(setRuns)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load runs'));
  }

  useEffect(refreshRuns, []);

  async function handleStartRun() {
    setStarting(true);
    setError(null);
    try {
      await startEvaluationRun();
      refreshRuns();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start a run');
    } finally {
      setStarting(false);
    }
  }

  async function handleSelectRun(id: string) {
    setLoadingDetail(true);
    setError(null);
    try {
      const detail = await getEvaluationRun(id);
      setSelectedRun(detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load run detail');
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="flex h-full">
      <div className="w-96 shrink-0 overflow-y-auto border-r border-neutral-200 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Evaluation</h1>
          <Button onClick={handleStartRun} disabled={starting}>
            {starting ? 'Starting…' : 'Run now'}
          </Button>
        </div>

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        )}

        {runs === null && (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        )}
        {runs?.length === 0 && <p className="text-sm text-neutral-400">No evaluation runs yet.</p>}

        <ul className="space-y-1">
          {runs?.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => handleSelectRun(run.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                  selectedRun?.id === run.id ? 'bg-neutral-200' : 'hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{new Date(run.startedAt).toLocaleString()}</span>
                  <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                </div>
                {run.model && <div className="text-xs text-neutral-500">{run.model}</div>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loadingDetail && (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        )}
        {!loadingDetail && !selectedRun && (
          <p className="text-sm text-neutral-400">Select a run to see its category breakdown and case results.</p>
        )}
        {!loadingDetail && selectedRun && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Badge tone={statusTone(selectedRun.status)}>{selectedRun.status}</Badge>
              <span className="text-sm text-neutral-500">
                {selectedRun.model ? `${selectedRun.provider}/${selectedRun.model}` : 'no model recorded'}
              </span>
            </div>
            {selectedRun.error && <ErrorBanner message={selectedRun.error} />}

            <h2 className="mb-2 mt-4 text-sm font-semibold uppercase text-neutral-500">By category</h2>
            <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categoryBreakdown(selectedRun).map(([category, { passed, total }]) => (
                <div key={category} className="rounded-md border border-neutral-200 p-2 text-sm">
                  <div className="font-medium">{category}</div>
                  <div className={passed === total ? 'text-green-700' : 'text-amber-700'}>
                    {passed}/{total} passed
                  </div>
                </div>
              ))}
            </div>

            <h2 className="mb-2 text-sm font-semibold uppercase text-neutral-500">Cases</h2>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="pb-2">Category</th>
                  <th className="pb-2">Question</th>
                  <th className="pb-2">Result</th>
                  <th className="pb-2">Latency</th>
                </tr>
              </thead>
              <tbody>
                {selectedRun.results.map((result) => (
                  <tr key={result.id} className="border-t border-neutral-100 align-top">
                    <td className="py-2">{result.category}</td>
                    <td className="max-w-md py-2">
                      <p>{result.question}</p>
                      {result.error && <p className="mt-1 text-xs text-red-500">{result.error}</p>}
                    </td>
                    <td className="py-2">
                      <Badge tone={result.passed ? 'green' : 'red'}>{result.passed ? 'passed' : 'failed'}</Badge>
                    </td>
                    <td className="py-2 text-neutral-500">{result.latencyMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
