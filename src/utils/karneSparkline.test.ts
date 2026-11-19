import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import { HistoricalExamPoint } from '../types/academy';
import { buildKarneSparklineData } from './karneSparkline';

const SAMPLE_TREND: HistoricalExamPoint[] = [
  { examName: 'Deneme 1', date: '10.10.2026', net: 42.5, score: 332.0, academyAvgNet: 40 },
  { examName: 'Deneme 2', date: '20.10.2026', net: 46.0, score: 356.5, academyAvgNet: 43 },
  { examName: 'Deneme 3', date: '01.11.2026', net: 48.25, score: 371.0, academyAvgNet: 44 },
  { examName: 'Deneme 4', date: '10.11.2026', net: 51.0, score: 388.4, academyAvgNet: 45 },
  { examName: 'Deneme 5', date: '18.11.2026', net: 54.5, score: 412.2, academyAvgNet: 47 },
  { examName: 'Deneme 6', date: '25.11.2026', net: 57.75, score: 434.8, academyAvgNet: 49 },
];

test('buildKarneSparklineData slices last 5 exams and toggles between Net and Toplam Puan metrics', () => {
  const g5 = getGradeProfile('5');

  const netSeries = buildKarneSparklineData({
    historicalTrend: SAMPLE_TREND,
    metric: 'net',
    gradeProfile: g5,
    limit: 5,
  });

  assert.equal(netSeries.points.length, 5);
  assert.equal(netSeries.points[0].examName, 'Deneme 2');
  assert.equal(netSeries.points[4].examName, 'Deneme 6');
  assert.equal(netSeries.deltaValue, 11.75);
  assert.equal(netSeries.formattedDelta, '+11.75 Net');
  assert.ok(netSeries.polylinePoints.split(' ').length === 5);
  assert.ok(netSeries.areaPath.startsWith('M '));

  const scoreSeries = buildKarneSparklineData({
    historicalTrend: SAMPLE_TREND,
    metric: 'score',
    gradeProfile: g5,
    limit: 5,
  });

  assert.equal(scoreSeries.points.length, 5);
  assert.equal(scoreSeries.latestValue, 434.8);
  assert.equal(scoreSeries.formattedLatest, '434.8 Puan');
  assert.equal(scoreSeries.deltaValue, 78.3);
  assert.equal(scoreSeries.formattedDelta, '+78.3 Puan');
});

test('buildKarneSparklineData handles empty trends cleanly without NaN coordinates', () => {
  const empty = buildKarneSparklineData({
    historicalTrend: [],
    metric: 'net',
  });
  assert.equal(empty.points.length, 0);
  assert.equal(empty.polylinePoints, '');
  assert.equal(empty.formattedLatest, '0.00 Net');
});
