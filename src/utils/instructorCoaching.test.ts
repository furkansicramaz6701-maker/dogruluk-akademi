import assert from 'node:assert/strict';
import test from 'node:test';
import { getGradeProfile } from '../data/curriculum';
import { Institution, StudentRecord, WeeklyStudentScore } from '../types/academy';
import {
  buildBulkRemedialCalendarEvents,
  buildInstructorCoachingDataset,
} from './instructorCoaching';

const SAMPLE_INST: Institution = {
  id: 'inst-test-1',
  name: 'Test Akademi',
  code8: '48291034',
  city: 'Ankara',
  createdAt: '2026-01-01T00:00:00.000Z',
};

test('buildInstructorCoachingDataset generates 5-exam trends and common knowledge gap groups', () => {
  const grade = getGradeProfile('8');
  const students: StudentRecord[] = [
    {
      id: 'stu-1',
      fullName: 'Alihan Sarı',
      studentNumber8: '48291001',
      institutionId: SAMPLE_INST.id,
      institutionCode8: SAMPLE_INST.code8,
      institutionName: SAMPLE_INST.name,
      classroom: '8-A',
      gradeId: '8',
      createdAt: '2026-01-01',
    },
    {
      id: 'stu-2',
      fullName: 'Zeynep Karahan',
      studentNumber8: '48291002',
      institutionId: SAMPLE_INST.id,
      institutionCode8: SAMPLE_INST.code8,
      institutionName: SAMPLE_INST.name,
      classroom: '8-B',
      gradeId: '8',
      createdAt: '2026-01-01',
    },
  ];

  const weeklyEntries: WeeklyStudentScore[] = [
    {
      studentId: 'stu-1',
      studentName: 'Alihan Sarı',
      studentNumber8: '48291001',
      classroom: '8-A',
      kts1Correct: 30,
      kts1Wrong: 12,
      kts1Blank: 8,
      kts2Correct: 34,
      kts2Wrong: 10,
      kts2Blank: 6,
      weakTopicNote: 'Yeni nesil grafik soruları',
    },
    {
      studentId: 'stu-2',
      studentName: 'Zeynep Karahan',
      studentNumber8: '48291002',
      classroom: '8-B',
      kts1Correct: 22,
      kts1Wrong: 15,
      kts1Blank: 13,
      kts2Correct: 24,
      kts2Wrong: 14,
      kts2Blank: 12,
      weakTopicNote: 'Kesir problemleri',
    },
  ];

  const dataset = buildInstructorCoachingDataset({
    institution: SAMPLE_INST,
    gradeProfile: grade,
    penaltyDivisor: 3,
    students,
    weeklyEntries,
    weeklyQuestionCount: 50,
  });

  assert.equal(dataset.isLiveCohort, true);
  assert.equal(dataset.totalStudents, 2);
  assert.equal(dataset.cohortCurve.length, 5);
  assert.equal(dataset.studentTrends[0].points.length, 5);
  assert.ok(dataset.knowledgeGapGroups.length >= 1);
  // Both notes map to Matematik, so they merge cleanly into a common gap cohort
  const mathGroup = dataset.knowledgeGapGroups.find((g) => g.subject === 'Matematik');
  assert.ok(mathGroup);
  assert.equal(mathGroup.affectedStudents.length, 2);
});

test('buildBulkRemedialCalendarEvents assigns filtered students into calendar events', () => {
  const grade = getGradeProfile('8');
  const dataset = buildInstructorCoachingDataset({
    institution: SAMPLE_INST,
    gradeProfile: grade,
    penaltyDivisor: 3,
    students: [],
    weeklyEntries: [],
    weeklyQuestionCount: 50,
  });

  const firstGroup = dataset.knowledgeGapGroups[0];
  assert.ok(firstGroup);
  const selectedIds = new Set(
    firstGroup.affectedStudents.slice(0, 2).map((s) => s.studentId)
  );

  const events = buildBulkRemedialCalendarEvents({
    groups: [firstGroup],
    selectedStudentIds: selectedIds,
    institutionId: SAMPLE_INST.id,
    gradeId: '8',
    date: '2026-12-01',
    time: '16:30',
    customNote: 'Çözüm kampı ile desteklenecek.',
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'telafi-etutu');
  assert.equal(events[0].date, '2026-12-01');
  assert.equal(events[0].time, '16:30');
  assert.ok(events[0].title.includes(`(${selectedIds.size} Öğrenci)`));
  assert.ok(events[0].note.includes('Çözüm kampı ile desteklenecek.'));
});
