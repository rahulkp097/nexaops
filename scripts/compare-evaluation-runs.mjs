#!/usr/bin/env node
// Phase 21 (spec §30): "Run the fixed evaluation set after major AI
// pipeline changes and compare metrics against the previous run." Phase
// 17 already persists every run's metrics (evaluation_runs.metrics); this
// is the comparison step spec calls out, built on that existing data
// rather than a new AI-regression feature of its own.
//
// Usage:
//   node scripts/compare-evaluation-runs.mjs <accessToken>
//   node scripts/compare-evaluation-runs.mjs <accessToken> <runIdA> <runIdB>
//
// With no run ids given, compares the two most recent COMPLETED runs for
// the caller's organization. Exits non-zero if any category's pass rate
// regressed, so this can gate a CI step once one exists (spec §21's own
// "AI regression tests" bullet).

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:4000';

async function fetchRuns(accessToken) {
  const response = await fetch(`${GATEWAY_URL}/evaluation/runs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`GET /evaluation/runs failed with status ${response.status}`);
  }
  return response.json();
}

async function fetchRun(accessToken, runId) {
  const response = await fetch(`${GATEWAY_URL}/evaluation/runs/${runId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`GET /evaluation/runs/${runId} failed with status ${response.status}`);
  }
  return response.json();
}

function formatDelta(before, after) {
  if (before === undefined || after === undefined) return 'n/a';
  const delta = after - before;
  const sign = delta > 0 ? '+' : '';
  return `${(before * 100).toFixed(1)}% -> ${(after * 100).toFixed(1)}% (${sign}${(delta * 100).toFixed(1)}pp)`;
}

async function main() {
  const [accessToken, runIdA, runIdB] = process.argv.slice(2);
  if (!accessToken) {
    console.error('Usage: node scripts/compare-evaluation-runs.mjs <accessToken> [runIdA runIdB]');
    process.exitCode = 1;
    return;
  }

  let previous;
  let current;
  if (runIdA && runIdB) {
    previous = await fetchRun(accessToken, runIdA);
    current = await fetchRun(accessToken, runIdB);
  } else {
    const runs = (await fetchRuns(accessToken)).filter((r) => r.status === 'COMPLETED');
    if (runs.length < 2) {
      console.log(`Only ${runs.length} completed run(s) found — need at least 2 to compare. Nothing to do.`);
      return;
    }
    // GET /evaluation/runs is already ordered newest-first.
    current = await fetchRun(accessToken, runs[0].id);
    previous = await fetchRun(accessToken, runs[1].id);
  }

  console.log(`Comparing run ${previous.id} (${previous.startedAt}) -> run ${current.id} (${current.startedAt})\n`);

  const beforeMetrics = previous.metrics ?? {};
  const afterMetrics = current.metrics ?? {};
  console.log(`Overall pass rate: ${formatDelta(beforeMetrics.passRate, afterMetrics.passRate)}`);

  const categories = new Set([
    ...Object.keys(beforeMetrics.byCategory ?? {}),
    ...Object.keys(afterMetrics.byCategory ?? {}),
  ]);

  let regressed = false;
  console.log('\nBy category:');
  for (const category of [...categories].sort()) {
    const before = beforeMetrics.byCategory?.[category]?.passRate;
    const after = afterMetrics.byCategory?.[category]?.passRate;
    const isRegression = before !== undefined && after !== undefined && after < before;
    if (isRegression) regressed = true;
    console.log(`  ${isRegression ? '[REGRESSION] ' : ''}${category}: ${formatDelta(before, after)}`);
  }

  if (regressed) {
    console.log('\nAt least one category regressed since the previous run.');
    process.exitCode = 1;
  } else {
    console.log('\nNo category regressed since the previous run.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
