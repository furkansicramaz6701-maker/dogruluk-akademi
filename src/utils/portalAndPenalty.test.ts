import test from 'node:test';
import assert from 'node:assert/strict';
import { getGradeProfile } from '../data/curriculum';
import {
  buildInstitutionLogoProfile,
  extractInstitutionInitials,
} from '../data/logos';
import {
  DEFAULT_INSTITUTIONS,
  DEFAULT_INSTITUTION_PASSWORD,
  authenticateInstitution,
  updateInstitutionRecord,
} from './institutionCodes';
import { evaluateOmrExam, formatPenaltyRuleLabel } from './examAnalysis';
import { calculateNetAndScore, computeWeeklyComparison } from './weeklyAnalysis';
import { searchWorkspaceEntities } from './globalSearch';
import { StudentRecord } from '../types/academy';

test('3-5th grade zero penalty (0) yields Net = Correct without division by zero', () => {
  const g3 = getGradeProfile('3');
  const g4 = getGradeProfile('4');
  const g5 = getGradeProfile('5');

  const noPenalty5 = calculateNetAndScore(17, 3, 20, g5, 0);
  assert.equal(noPenalty5.net, 17);
  assert.equal(noPenalty5.successPct, 85);

  const threePenalty5 = calculateNetAndScore(17, 3, 20, g5, 3);
  assert.equal(threePenalty5.net, 16);

  const noPenalty3 = calculateNetAndScore(40, 10, 50, g3, 0);
  assert.equal(noPenalty3.net, 40);

  const noPenalty4 = calculateNetAndScore(45, 5, 60, g4, 0);
  assert.equal(noPenalty4.net, 45);

  assert.equal(formatPenaltyRuleLabel(0, true), 'Götürmesiz (Net = Doğru)');
  assert.equal(formatPenaltyRuleLabel(3, true), '3Y = 1D');
});

test('evaluateOmrExam and computeWeeklyComparison support penaltyDivisor = 0 cleanly', () => {
  const res = evaluateOmrExam({
    studentName: 'Elif Aydın',
    studentNumber: '48123456',
    classroom: '3-A',
    examTitle: '3. Sınıf Kazanım Denemesi',
    gradeId: '3',
    penaltyDivisor: 0,
    studentAnswers: ['A', 'B', 'C', 'D', null],
    answerKey: ['A', 'B', 'A', 'A', 'A'],
    questions: [
      {
        id: 'q1',
        number: 1,
        subject: 'Türkçe',
        topic: 'Anlam',
        gainCode: 'T.3.1',
        difficulty: 'Kolay',
        stem: 'S1',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correctOption: 'A',
        explanation: '',
        source: 'Müfredat Havuzu',
      },
      {
        id: 'q2',
        number: 2,
        subject: 'Türkçe',
        topic: 'Anlam',
        gainCode: 'T.3.2',
        difficulty: 'Kolay',
        stem: 'S2',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correctOption: 'B',
        explanation: '',
        source: 'Müfredat Havuzu',
      },
      {
        id: 'q3',
        number: 3,
        subject: 'Matematik',
        topic: 'Sayılar',
        gainCode: 'M.3.1',
        difficulty: 'Orta',
        stem: 'S3',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correctOption: 'A',
        explanation: '',
        source: 'Müfredat Havuzu',
      },
      {
        id: 'q4',
        number: 4,
        subject: 'Matematik',
        topic: 'Sayılar',
        gainCode: 'M.3.2',
        difficulty: 'Orta',
        stem: 'S4',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correctOption: 'A',
        explanation: '',
        source: 'Müfredat Havuzu',
      },
      {
        id: 'q5',
        number: 5,
        subject: 'Fen Bilimleri',
        topic: 'Madde',
        gainCode: 'F.3.1',
        difficulty: 'Kolay',
        stem: 'S5',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correctOption: 'A',
        explanation: '',
        source: 'Müfredat Havuzu',
      },
    ],
  });

  assert.equal(res.totalCorrect, 2);
  assert.equal(res.totalWrong, 2);
  assert.equal(res.totalBlank, 1);
  assert.equal(res.totalNet, 2);

  const g4 = getGradeProfile('4');
  const weeklyRows = computeWeeklyComparison({
    entries: [
      {
        studentId: 's1',
        studentName: 'Ali',
        studentNumber8: '10000001',
        classroom: '4-A',
        kts1Correct: 15,
        kts1Wrong: 5,
        kts1Blank: 0,
        kts2Correct: 18,
        kts2Wrong: 2,
        kts2Blank: 0,
      },
    ],
    kts1TotalQuestions: 20,
    kts2TotalQuestions: 20,
    gradeProfile: g4,
    penaltyDivisorOverride: 0,
  });
  assert.equal(weeklyRows[0].kts1Net, 15);
  assert.equal(weeklyRows[0].kts2Net, 18);
});

test('institution authentication validates 8-digit code and institution password', () => {
  const inst = DEFAULT_INSTITUTIONS[0];
  const valid = authenticateInstitution(
    DEFAULT_INSTITUTIONS,
    inst.code8,
    DEFAULT_INSTITUTION_PASSWORD
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.institution?.id, inst.id);

  const wrongPass = authenticateInstitution(DEFAULT_INSTITUTIONS, inst.code8, '999999');
  assert.equal(wrongPass.ok, false);
  assert.ok(wrongPass.reason?.includes('hatalı'));

  const updatedRes = updateInstitutionRecord(DEFAULT_INSTITUTIONS, inst.id, {
    accessPassword: 'ozel-sifre-2026',
  });
  assert.equal(updatedRes.ok, true);
  const loginAfterChange = authenticateInstitution(
    updatedRes.institutions,
    inst.code8,
    'ozel-sifre-2026'
  );
  assert.equal(loginAfterChange.ok, true);
});

test('global workspace search filters modules, active institution students, and institutions', () => {
  const inst0 = DEFAULT_INSTITUTIONS[0];
  const inst1 = DEFAULT_INSTITUTIONS[1];
  const students: StudentRecord[] = [
    {
      id: 'st-1',
      fullName: 'Kerem Demir',
      studentNumber8: '48000001',
      institutionId: inst0.id,
      institutionCode8: inst0.code8,
      institutionName: inst0.name,
      classroom: '5-A',
      gradeId: '5',
      createdAt: '2026-09-01',
    },
    {
      id: 'st-2',
      fullName: 'Elif Diğer Kurum',
      studentNumber8: '77000002',
      institutionId: inst1.id,
      institutionCode8: inst1.code8,
      institutionName: inst1.name,
      classroom: '4-A',
      gradeId: '4',
      createdAt: '2026-09-01',
    },
  ];

  const openEndedRes = searchWorkspaceEntities({
    query: 'açık uçlu',
    students,
    institutions: DEFAULT_INSTITUTIONS,
    activeInstitutionId: inst0.id,
  });
  assert.ok(openEndedRes.modules.some((m) => m.id === 'mod-open-ended'));

  const studentRes = searchWorkspaceEntities({
    query: 'Kerem',
    students,
    institutions: DEFAULT_INSTITUTIONS,
    activeInstitutionId: inst0.id,
  });
  assert.equal(studentRes.students.length, 1);
  assert.equal(studentRes.students[0].fullName, 'Kerem Demir');

  // Isolation check: students from other institutions do not leak into active institution search
  const otherStudentRes = searchWorkspaceEntities({
    query: 'Diğer Kurum',
    students,
    institutions: DEFAULT_INSTITUTIONS,
    activeInstitutionId: inst0.id,
  });
  assert.equal(otherStudentRes.students.length, 0);
});

test('auto-generated institution logo builds Turkish initials and distinct profiles', () => {
  assert.equal(extractInstitutionInitials('Doğruluk Akademi'), 'DA');
  assert.equal(extractInstitutionInitials('Anadolu İlköğretim & LGS Kurumu'), 'Aİ');
  assert.equal(extractInstitutionInitials('Yıldız Koleji'), 'YK');
  assert.equal(extractInstitutionInitials('Boğaziçi YKS Hazırlık Akademisi'), 'BY');

  const mainProfile = buildInstitutionLogoProfile('Doğruluk Akademi');
  assert.equal(mainProfile.initials, 'DA');
  assert.equal(mainProfile.variant, 'akademi-kalkani');

  const partnerProfile = buildInstitutionLogoProfile('Anadolu İlköğretim & LGS Kurumu');
  assert.equal(partnerProfile.initials, 'Aİ');
  assert.equal(partnerProfile.institutionName, 'Anadolu İlköğretim & LGS Kurumu');
  assert.ok(partnerProfile.primaryColor.startsWith('#'));
});
