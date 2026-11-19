import { getGradeProfile } from '../data/curriculum';
import { GradeLevelId, Institution, StudentRecord } from '../types/academy';
import { defaultClassroomForGrade } from './excelExport';
import {
  createDefaultPermissions,
  generate8DigitStudentNumber,
} from './institutionCodes';

export interface InstitutionQuotaStatus {
  count: number;
  maxStudents: number;
  remaining: number;
  isAtLimit: boolean;
  isSuspended: boolean;
}

export function filterInstitutionStudents(
  students: StudentRecord[],
  institutionId: string,
  searchQuery = ''
): StudentRecord[] {
  const instList = students.filter((s) => s.institutionId === institutionId);
  const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
  if (!q) return instList;

  return instList.filter((stu) => {
    const gradeLabel = getGradeProfile(stu.gradeId).shortLabel.toLocaleLowerCase('tr-TR');
    return (
      stu.fullName.toLocaleLowerCase('tr-TR').includes(q) ||
      stu.studentNumber8.includes(q) ||
      stu.classroom.toLocaleLowerCase('tr-TR').includes(q) ||
      gradeLabel.includes(q)
    );
  });
}

export function getInstitutionQuotaStatus(
  students: StudentRecord[],
  institution: Institution
): InstitutionQuotaStatus {
  const perms = institution.permissions ?? createDefaultPermissions();
  const count = students.filter((s) => s.institutionId === institution.id).length;
  const maxStudents = Math.max(1, perms.maxStudents || 500);
  const remaining = Math.max(0, maxStudents - count);

  return {
    count,
    maxStudents,
    remaining,
    isAtLimit: count >= maxStudents,
    isSuspended: perms.status === 'Askıda',
  };
}

export function buildStudentRecordForInstitution(params: {
  fullName: string;
  institution: Institution;
  gradeId: GradeLevelId;
  classroom?: string;
  parentPhone?: string;
  existingStudents: StudentRecord[];
  now?: Date;
}): { ok: boolean; student?: StudentRecord; reason?: string } {
  const cleanName = params.fullName.trim().replace(/\s+/g, ' ');
  if (cleanName.length < 2) {
    return { ok: false, reason: 'Lütfen öğrencinin adını ve soyadını en az 2 karakter olarak girin.' };
  }

  const quota = getInstitutionQuotaStatus(params.existingStudents, params.institution);
  if (quota.isSuspended) {
    return {
      ok: false,
      reason: `${params.institution.name} kurum lisansı askıda olduğu için öğrenci eklenemez.`,
    };
  }
  if (quota.isAtLimit) {
    return {
      ok: false,
      reason: `${params.institution.name} için ${quota.maxStudents} öğrenci kotasına ulaşıldı.`,
    };
  }

  const existingNumbers = new Set(params.existingStudents.map((s) => s.studentNumber8));
  const studentNumber8 = generate8DigitStudentNumber(
    cleanName,
    params.institution.code8,
    existingNumbers
  );

  const now = params.now ?? new Date();
  const safeClassroom =
    (params.classroom ?? '').trim() || defaultClassroomForGrade(params.gradeId);
  const cleanPhone = (params.parentPhone ?? '').trim();

  const student: StudentRecord = {
    id: `stu-${now.getTime()}-${studentNumber8.slice(-4)}`,
    fullName: cleanName,
    studentNumber8,
    institutionId: params.institution.id,
    institutionCode8: params.institution.code8,
    institutionName: params.institution.name,
    classroom: safeClassroom,
    gradeId: params.gradeId,
    parentPhone: cleanPhone || undefined,
    createdAt: now.toISOString().slice(0, 10),
  };

  return { ok: true, student };
}
