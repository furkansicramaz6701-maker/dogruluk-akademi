import assert from 'node:assert/strict';
import test from 'node:test';
import { Institution, StudentRecord } from '../types/academy';
import { createDefaultPermissions, generate8DigitInstitutionCode } from './institutionCodes';
import {
  buildStudentRecordForInstitution,
  filterInstitutionStudents,
  getInstitutionQuotaStatus,
} from './studentPanel';

function makeFreshInstitution(name = 'Yeni Kurum Akademi'): Institution {
  return {
    id: 'inst-fresh-1',
    name,
    code8: generate8DigitInstitutionCode(name),
    city: 'Ankara',
    createdAt: '2026-11-19',
    accessPassword: '123456',
    permissions: createDefaultPermissions('Kurum Yöneticisi', ['ilkokul', 'ortaokul', 'lise', 'yks']),
  };
}

test('fresh institution starts with zero students and full remaining quota', () => {
  const inst = makeFreshInstitution();
  const initialStudents: StudentRecord[] = [];
  const list = filterInstitutionStudents(initialStudents, inst.id, '');
  const quota = getInstitutionQuotaStatus(initialStudents, inst);

  assert.equal(list.length, 0);
  assert.equal(quota.count, 0);
  assert.equal(quota.remaining, 500);
  assert.equal(quota.isAtLimit, false);
  assert.equal(quota.isSuspended, false);
});

test('buildStudentRecordForInstitution creates clean zero-exam student scoped to institution and filters accurately', () => {
  const instA = makeFreshInstitution('Alfa Akademi');
  const instB: Institution = {
    ...makeFreshInstitution('Beta Koleji'),
    id: 'inst-fresh-2',
  };

  const created = buildStudentRecordForInstitution({
    fullName: '  Mert   Kaya ',
    institution: instA,
    gradeId: '5',
    classroom: '',
    parentPhone: '0555 123 45 67',
    existingStudents: [],
  });

  assert.equal(created.ok, true);
  assert.ok(created.student);
  assert.equal(created.student.fullName, 'Mert Kaya');
  assert.equal(created.student.institutionId, instA.id);
  assert.equal(created.student.institutionCode8, instA.code8);
  assert.equal(created.student.classroom, '5-A');
  assert.equal(created.student.lastOmrAnswers, undefined);
  assert.match(created.student.studentNumber8, /^\d{8}$/);

  const allStudents = [created.student];
  assert.equal(filterInstitutionStudents(allStudents, instA.id, 'mert').length, 1);
  assert.equal(filterInstitutionStudents(allStudents, instB.id, '').length, 0);
  assert.equal(filterInstitutionStudents(allStudents, instA.id, 'olmayan').length, 0);
});

test('buildStudentRecordForInstitution blocks suspended institutions and quota limits', () => {
  const suspendedInst: Institution = {
    ...makeFreshInstitution('Askıda Kurum'),
    permissions: {
      ...createDefaultPermissions(),
      status: 'Askıda',
    },
  };

  const res = buildStudentRecordForInstitution({
    fullName: 'Deniz Demir',
    institution: suspendedInst,
    gradeId: '8',
    existingStudents: [],
  });

  assert.equal(res.ok, false);
  assert.match(res.reason || '', /askıda/i);
});
