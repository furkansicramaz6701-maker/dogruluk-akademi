import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampPct,
  computeStarCountFromPct,
  resolveExamPerformanceVisual,
  resolveSubjectProgressVisual,
  resolveTopicProgressVisual,
} from './karneVisualMetrics';

test('clampPct clamps out-of-range and non-finite percentages safely', () => {
  assert.equal(clampPct(-12), 0);
  assert.equal(clampPct(118.6), 100);
  assert.equal(clampPct(Number.NaN), 0);
  assert.equal(clampPct(67.4), 67);
});

test('resolveExamPerformanceVisual classifies basarili / gelismekte / tekrar accurately', () => {
  const top = resolveExamPerformanceVisual({ successPct: 92 });
  assert.equal(top.tier, 'basarili');
  assert.equal(top.label, 'Başarılı');
  assert.equal(top.stars, 5);
  assert.equal(top.progressPct, 92);

  const good = resolveExamPerformanceVisual({ successPct: 70 });
  assert.equal(good.tier, 'basarili');
  assert.equal(good.stars, 4);

  const midHigh = resolveExamPerformanceVisual({ successPct: 62 });
  assert.equal(midHigh.tier, 'gelismekte');
  assert.equal(midHigh.label, 'Gelişmekte');
  assert.equal(midHigh.stars, 3);

  const midLow = resolveExamPerformanceVisual({ successPct: 45 });
  assert.equal(midLow.tier, 'gelismekte');
  assert.equal(midLow.stars, 2);

  const low = resolveExamPerformanceVisual({ successPct: 34 });
  assert.equal(low.tier, 'tekrar');
  assert.equal(low.shortLabel, 'TEKRAR');
  assert.equal(low.stars, 1);
});

test('resolveExamPerformanceVisual handles pending exam state gracefully', () => {
  const pending = resolveExamPerformanceVisual({ successPct: 0, hasExamData: false });
  assert.equal(pending.tier, 'bekleniyor');
  assert.equal(pending.stars, 0);
  assert.equal(pending.progressPct, 0);
});

test('subject and topic visual helpers match star and tier rules', () => {
  const s = resolveSubjectProgressVisual(78, true);
  assert.equal(s.tier, 'basarili');
  assert.equal(s.stars, 4);

  const t = resolveTopicProgressVisual(41);
  assert.equal(t.tier, 'tekrar');
  assert.equal(t.stars, 2);

  assert.equal(computeStarCountFromPct(85, true), 5);
  assert.equal(computeStarCountFromPct(55, true), 3);
  assert.equal(computeStarCountFromPct(20, true), 1);
});
