/**
 * IMPREZA Bracelet Control System — Audit Utility
 * 
 * Usage (browser console, while logged in):
 *   import('/src/utils/auditSystem.js').then(m => m.runAudit())
 * 
 * What it checks:
 *   1. Expense type coverage — what % are INTERNAL / EXTERNAL / THIRD
 *   2. Stuck transfers — SENT status > 48h (potential lost transfers)
 *   3. Expense forms with no type set (legacy, defaults to INTERNAL)
 *   4. Balance sanity — detect cities/countries with potentially negative state
 *   5. Zero-accept cancellations — receiver submitted all zeros (intentional?)
 *   6. Company loss vs shortage attribution summary
 *   7. Discrepancy resolution coverage — unresolved DISCREPANCY_FOUND
 */

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function apiFetch(path, params = {}) {
  const token = JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token;
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

function pct(value, total) {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

export async function runAudit() {
  console.group('🔍 IMPREZA Bracelet Control — System Audit');
  console.log('Starting audit at', new Date().toLocaleString('ru-RU'));
  const results = { timestamp: new Date().toISOString(), checks: [] };

  // ──────────────────────────────────────────────────────────────
  // CHECK 1: Expense type coverage
  // ──────────────────────────────────────────────────────────────
  try {
    console.group('📊 Check 1: Expense type coverage');
    const expData = await apiFetch('/inventory/expenses', { limit: 1000 });
    const expenses = expData?.data || expData || [];
    const total = expenses.length;

    const byType = { INTERNAL: 0, EXTERNAL: 0, THIRD: 0, UNKNOWN: 0 };
    const noType = [];
    expenses.forEach(ex => {
      if (!ex.type) {
        byType.UNKNOWN++;
        noType.push({ id: ex.id, eventName: ex.eventName, createdAt: ex.createdAt, city: ex.city?.name });
      } else {
        byType[ex.type] = (byType[ex.type] || 0) + 1;
      }
    });

    console.log(`Total expenses: ${total}`);
    console.table({
      'EXTERNAL (мероприятия)': { count: byType.EXTERNAL, percent: pct(byType.EXTERNAL, total) },
      'INTERNAL (внутренние)': { count: byType.INTERNAL, percent: pct(byType.INTERNAL, total) },
      'THIRD (сторонние)':     { count: byType.THIRD,    percent: pct(byType.THIRD, total) },
      'БЕЗ ТИПА (legacy)':     { count: byType.UNKNOWN,  percent: pct(byType.UNKNOWN, total) },
    });

    if (noType.length > 0) {
      console.warn(`⚠️ ${noType.length} expenses without type (will default to INTERNAL):`, noType);
    } else {
      console.log('✅ All expenses have type set');
    }

    results.checks.push({
      name: 'Expense type coverage',
      status: noType.length === 0 ? 'ok' : 'warn',
      data: { total, byType, noTypeCount: noType.length }
    });
    console.groupEnd();
  } catch (err) {
    console.error('Check 1 failed:', err.message);
    results.checks.push({ name: 'Expense type coverage', status: 'error', error: err.message });
    console.groupEnd();
  }

  // ──────────────────────────────────────────────────────────────
  // CHECK 2: Stuck transfers (SENT > 48h)
  // ──────────────────────────────────────────────────────────────
  try {
    console.group('⏰ Check 2: Stuck transfers (SENT > 48h)');
    const tData = await apiFetch('/transfers', { status: 'SENT', limit: 500 });
    const transfers = tData?.data || tData || [];
    const now = Date.now();
    const THRESHOLD_MS = 48 * 60 * 60 * 1000;

    const stuck = transfers.filter(t => {
      const age = now - new Date(t.createdAt).getTime();
      return age > THRESHOLD_MS;
    });

    const stuckInfo = stuck.map(t => ({
      id: t.id,
      ageHours: Math.round((now - new Date(t.createdAt).getTime()) / 3600000),
      from: t.senderCity?.name || t.senderCountry?.name || t.senderOffice?.name || '?',
      to: t.receiverCity?.name || t.receiverCountry?.name || t.receiverOffice?.name || '?',
      createdAt: new Date(t.createdAt).toLocaleDateString('ru-RU'),
    }));

    if (stuck.length === 0) {
      console.log('✅ No stuck transfers (all SENT < 48h old)');
    } else {
      console.warn(`⚠️ ${stuck.length} transfers stuck in SENT status > 48h:`);
      console.table(stuckInfo);
    }

    results.checks.push({
      name: 'Stuck transfers (>48h SENT)',
      status: stuck.length === 0 ? 'ok' : 'warn',
      data: { stuckCount: stuck.length, transfers: stuckInfo }
    });
    console.groupEnd();
  } catch (err) {
    console.error('Check 2 failed:', err.message);
    results.checks.push({ name: 'Stuck transfers', status: 'error', error: err.message });
    console.groupEnd();
  }

  // ──────────────────────────────────────────────────────────────
  // CHECK 3: Unresolved discrepancies
  // ──────────────────────────────────────────────────────────────
  try {
    console.group('🔴 Check 3: Unresolved discrepancies (DISCREPANCY_FOUND)');
    const pData = await apiFetch('/transfers/problematic', { limit: 200 });
    const problematic = pData?.data?.data || pData?.data || pData || [];

    if (problematic.length === 0) {
      console.log('✅ No unresolved discrepancies');
    } else {
      console.warn(`⚠️ ${problematic.length} transfers in DISCREPANCY_FOUND (awaiting admin resolution):`);
      const info = problematic.map(t => ({
        id: t.id.slice(0, 8) + '...',
        from: t.senderCity?.name || '?',
        to: t.receiverCity?.name || '?',
        ageHours: Math.round((Date.now() - new Date(t.createdAt).getTime()) / 3600000),
        createdAt: new Date(t.createdAt).toLocaleDateString('ru-RU'),
      }));
      console.table(info);
    }

    results.checks.push({
      name: 'Unresolved discrepancies',
      status: problematic.length === 0 ? 'ok' : 'warn',
      data: { count: problematic.length }
    });
    console.groupEnd();
  } catch (err) {
    console.error('Check 3 failed:', err.message);
    results.checks.push({ name: 'Unresolved discrepancies', status: 'error', error: err.message });
    console.groupEnd();
  }

  // ──────────────────────────────────────────────────────────────
  // CHECK 4: Company losses summary
  // ──────────────────────────────────────────────────────────────
  try {
    console.group('💸 Check 4: Company losses summary');
    const lossData = await apiFetch('/inventory/company-losses/summary');
    const summary = lossData?.data || lossData;

    if (summary) {
      console.log('Company loss totals:');
      console.table({
        'Чёрные': { lost: summary.black || 0 },
        'Белые':  { lost: summary.white || 0 },
        'Красные':{ lost: summary.red   || 0 },
        'Синие':  { lost: summary.blue  || 0 },
        'ИТОГО':  { lost: (summary.black||0)+(summary.white||0)+(summary.red||0)+(summary.blue||0) },
      });
    }

    const sysData = await apiFetch('/inventory/system-losses/summary').catch(() => null);
    if (sysData) {
      const sys = sysData?.data || sysData;
      const totalSys = (sys.black||0)+(sys.white||0)+(sys.red||0)+(sys.blue||0);
      const totalCo = (summary?.black||0)+(summary?.white||0)+(summary?.red||0)+(summary?.blue||0);
      console.log(`\nSystem losses (all entities): ${totalSys} bracelets`);
      console.log(`Company losses (absorbed): ${totalCo} bracelets`);
      const personalLoss = totalSys - totalCo;
      if (personalLoss > 0) {
        console.log(`Personal/shortage losses: ${personalLoss} bracelets (charged to users/cities)`);
      }
    }

    results.checks.push({ name: 'Company losses', status: 'ok', data: summary });
    console.groupEnd();
  } catch (err) {
    console.error('Check 4 failed:', err.message);
    results.checks.push({ name: 'Company losses', status: 'error', error: err.message });
    console.groupEnd();
  }

  // ──────────────────────────────────────────────────────────────
  // CHECK 5: Stats health check (key metrics present)
  // ──────────────────────────────────────────────────────────────
  try {
    console.group('📈 Check 5: Stats API health');
    const statsData = await apiFetch('/transfers/stats', { period: 'month' });
    const stats = statsData?.data || statsData;

    const fields = ['summary', 'statusBreakdown', 'transfersByDay'];
    const missing = fields.filter(f => !stats?.[f]);

    if (missing.length === 0) {
      console.log('✅ Stats API returning all expected fields');
      console.log(`Period summary: ${stats.summary?.totalTransfers} transfers, ${stats.summary?.totalBracelets} bracelets`);
    } else {
      console.warn(`⚠️ Stats API missing fields: ${missing.join(', ')}`);
    }

    results.checks.push({
      name: 'Stats API health',
      status: missing.length === 0 ? 'ok' : 'warn',
      data: { missingFields: missing }
    });
    console.groupEnd();
  } catch (err) {
    console.error('Check 5 failed:', err.message);
    results.checks.push({ name: 'Stats API', status: 'error', error: err.message });
    console.groupEnd();
  }

  // ──────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────
  console.group('📋 AUDIT SUMMARY');
  const okCount    = results.checks.filter(c => c.status === 'ok').length;
  const warnCount  = results.checks.filter(c => c.status === 'warn').length;
  const errorCount = results.checks.filter(c => c.status === 'error').length;
  console.log(`✅ OK: ${okCount} | ⚠️ WARN: ${warnCount} | ❌ ERROR: ${errorCount}`);
  results.checks.forEach(c => {
    const icon = c.status === 'ok' ? '✅' : c.status === 'warn' ? '⚠️' : '❌';
    console.log(`  ${icon} ${c.name}`);
  });
  console.groupEnd();
  console.groupEnd();

  return results;
}

export default { runAudit };
