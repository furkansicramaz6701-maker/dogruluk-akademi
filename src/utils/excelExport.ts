import * as XLSX from 'xlsx';
import { GRADE_PROFILES, getGradeProfile } from '../data/curriculum';
import { GradeLevelId, Institution, StudentRecord } from '../types/academy';
import {
  generate8DigitInstitutionCode,
  generate8DigitStudentNumber,
} from './institutionCodes';
import { normalizeTurkishSlug, triggerDownload } from './downloadHelpers';

export interface InstitutionExportRow {
  'Kurum Kodu (8 Hane)': string;
  'Kurum Adı': string;
  'Şehir': string;
  'Öğrenci Sayısı': number;
  'Kayıt Tarihi': string;
}

export interface StudentExportRow {
  'Öğrenci No (8 Hane)': string;
  'Adı Soyadı': string;
  'Kurum Kodu (8 Hane)': string;
  'Kurum Adı': string;
  'Sınıf / Sınav Düzeyi': string;
  'Düzey Kodu': GradeLevelId;
  'Şube': string;
  'Kayıt Tarihi': string;
}

/**
 * Normalizes arbitrary user/Excel grade strings (e.g. "5", "5. Sınıf", "LGS", "TYT", "AYT Sayısal")
 * strictly into one of the valid GradeLevelId values so elementary/middle school students
 * never leak into TYT/AYT profiles.
 */
export function normalizeImportedGradeId(
  raw: unknown,
  fallback: GradeLevelId = '5'
): GradeLevelId {
  if (raw === null || raw === undefined) return fallback;
  const text = String(raw).trim();
  if (!text) return fallback;

  const upper = text
    .toLocaleUpperCase('tr-TR')
    .replace(/\s+/g, ' ');

  if (upper === 'AYT-SAY' || (upper.includes('AYT') && upper.includes('SAY'))) {
    return 'AYT-SAY';
  }
  if (upper === 'AYT-EA' || (upper.includes('AYT') && (upper.includes('EA') || upper.includes('EŞİT') || upper.includes('ESIT')))) {
    return 'AYT-EA';
  }
  if (upper === 'AYT-SOZ' || (upper.includes('AYT') && (upper.includes('SÖZ') || upper.includes('SOZ')))) {
    return 'AYT-SOZ';
  }
  if (upper.includes('TYT') || upper.includes('ÜNİVERSİTE') || upper.includes('UNIVERSITE') || upper.includes('YKS')) {
    return 'TYT';
  }
  if (upper.includes('LGS') || /\b8\b/.test(upper) || upper.startsWith('8.')) {
    return '8';
  }

  const numMatch = upper.match(/\b(1[0-2]|[3-9])\b/);
  if (numMatch) {
    const matched = numMatch[1] as GradeLevelId;
    if (GRADE_PROFILES.some((g) => g.id === matched)) {
      return matched;
    }
  }

  const exact = GRADE_PROFILES.find(
    (g) =>
      g.id.toLocaleUpperCase('tr-TR') === upper ||
      g.shortLabel.toLocaleUpperCase('tr-TR') === upper ||
      g.label.toLocaleUpperCase('tr-TR') === upper
  );
  if (exact) return exact.id;

  return fallback;
}

export function defaultClassroomForGrade(gradeId: GradeLevelId): string {
  switch (gradeId) {
    case '3':
      return '3-A';
    case '4':
      return '4-A';
    case '5':
      return '5-A';
    case '6':
      return '6-A';
    case '7':
      return '7-A';
    case '8':
      return '8-A LGS';
    case '9':
      return '9-A';
    case '10':
      return '10-A';
    case '11':
      return '11-A Sayısal';
    case '12':
      return '12-A YKS';
    case 'TYT':
      return '12-A TYT';
    case 'AYT-SAY':
      return '12-A Sayısal';
    case 'AYT-EA':
      return '12-B Eşit Ağırlık';
    case 'AYT-SOZ':
      return '12-C Sözel';
    default:
      return '5-A';
  }
}

export function buildInstitutionsRows(
  institutions: Institution[],
  students: StudentRecord[]
): InstitutionExportRow[] {
  return institutions.map((inst) => ({
    'Kurum Kodu (8 Hane)': inst.code8,
    'Kurum Adı': inst.name,
    'Şehir': inst.city || 'Türkiye',
    'Öğrenci Sayısı': students.filter((s) => s.institutionId === inst.id).length,
    'Kayıt Tarihi': inst.createdAt,
  }));
}

export function buildStudentsRows(students: StudentRecord[]): StudentExportRow[] {
  return students.map((stu) => {
    const profile = getGradeProfile(stu.gradeId);
    return {
      'Öğrenci No (8 Hane)': stu.studentNumber8,
      'Adı Soyadı': stu.fullName,
      'Kurum Kodu (8 Hane)': stu.institutionCode8,
      'Kurum Adı': stu.institutionName,
      'Sınıf / Sınav Düzeyi': profile.shortLabel,
      'Düzey Kodu': stu.gradeId,
      'Şube': stu.classroom,
      'Kayıt Tarihi': stu.createdAt,
    };
  });
}

function getRowField(row: Record<string, unknown>, candidates: string[]): string {
  const entries = Object.entries(row);
  for (const cand of candidates) {
    const target = cand.toLocaleLowerCase('tr-TR');
    for (const [k, v] of entries) {
      if (k.trim().toLocaleLowerCase('tr-TR').includes(target)) {
        const str = String(v ?? '').trim();
        if (str) return str;
      }
    }
  }
  return '';
}

export function parseInstitutionsSpreadsheet(
  arrayBuffer: ArrayBuffer,
  existingCodes: Set<string> = new Set()
): Institution[] {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const usedCodes = new Set(existingCodes);
  const created: Institution[] = [];
  const today = new Date().toLocaleDateString('tr-TR');

  rawRows.forEach((row, idx) => {
    const name = getRowField(row, ['kurum adı', 'kurum adi', 'kurum', 'okul', 'akademi', 'ad']);
    if (!name) return;
    const city = getRowField(row, ['şehir', 'sehir', 'il']) || 'Türkiye';
    const rawCode = getRowField(row, ['kurum kodu', 'kod', 'code']).replace(/\D/g, '');
    const code8 =
      rawCode.length === 8 && !usedCodes.has(rawCode)
        ? rawCode
        : generate8DigitInstitutionCode(name, usedCodes);
    usedCodes.add(code8);

    created.push({
      id: `inst-xls-${Date.now()}-${idx}`,
      name,
      code8,
      city,
      createdAt: today,
    });
  });

  return created;
}

export function parseStudentsSpreadsheet(
  arrayBuffer: ArrayBuffer,
  targetInstitution: Institution,
  fallbackGradeId: GradeLevelId,
  existingNumbers: Set<string> = new Set()
): StudentRecord[] {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const usedNumbers = new Set(existingNumbers);
  const created: StudentRecord[] = [];
  const today = new Date().toLocaleDateString('tr-TR');

  rawRows.forEach((row, idx) => {
    const fullName = getRowField(row, ['adı soyadı', 'adi soyadi', 'ad soyad', 'öğrenci', 'ogrenci', 'isim', 'ad']);
    if (!fullName) return;

    const rawGrade = getRowField(row, ['düzey', 'duzey', 'sınav', 'sinav', 'sınıf', 'sinif', 'grade']);
    const gradeId = normalizeImportedGradeId(rawGrade, fallbackGradeId);
    const classroom =
      getRowField(row, ['şube', 'sube', 'sınıf/şube', 'sinif/sube', 'classroom']) ||
      defaultClassroomForGrade(gradeId);

    const rawNo = getRowField(row, ['öğrenci no', 'ogrenci no', 'numara', 'no']).replace(/\D/g, '');
    const studentNumber8 =
      rawNo.length === 8 && !usedNumbers.has(rawNo)
        ? rawNo
        : generate8DigitStudentNumber(fullName, targetInstitution.code8, usedNumbers);
    usedNumbers.add(studentNumber8);

    created.push({
      id: `stu-xls-${Date.now()}-${idx}`,
      fullName,
      studentNumber8,
      institutionId: targetInstitution.id,
      institutionCode8: targetInstitution.code8,
      institutionName: targetInstitution.name,
      classroom,
      gradeId,
      createdAt: today,
    });
  });

  return created;
}

export function exportInstitutionsToXlsx(
  institutions: Institution[],
  students: StudentRecord[]
): void {
  const wb = XLSX.utils.book_new();
  const instRows = buildInstitutionsRows(institutions, students);
  const instSheet = XLSX.utils.json_to_sheet(instRows);
  instSheet['!cols'] = [
    { wch: 20 },
    { wch: 36 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, instSheet, 'Kurumlar');

  if (students.length > 0) {
    const stuSheet = XLSX.utils.json_to_sheet(buildStudentsRows(students));
    stuSheet['!cols'] = [
      { wch: 20 },
      { wch: 26 },
      { wch: 20 },
      { wch: 32 },
      { wch: 20 },
      { wch: 12 },
      { wch: 16 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, stuSheet, 'Tum Ogrenciler');
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, 'Dogruluk-Akademi-Kurumlar.xlsx');
}

export function exportStudentsToXlsx(
  students: StudentRecord[],
  activeInstitution: Institution
): void {
  const wb = XLSX.utils.book_new();
  const rows = buildStudentsRows(students);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 20 },
    { wch: 26 },
    { wch: 20 },
    { wch: 32 },
    { wch: 20 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Ogrenciler');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `Ogrenciler-${activeInstitution.code8}.xlsx`);
}

export function buildWeeklyComparisonWorkbookBlob(params: {
  rows: Array<{
    rank: number;
    studentName: string;
    studentNumber8: string;
    classroom: string;
    kts1Net: number;
    kts1Score: number;
    kts2Net: number;
    kts2Score: number;
    netDelta: number;
    scoreDelta: number;
    successPct: number;
    status: string;
    focusAdvice: string;
  }>;
  academyName: string;
  kts1Name: string;
  kts2Name: string;
  gradeLabel: string;
}): Blob {
  const wb = XLSX.utils.book_new();
  const sheetRows = params.rows.map((r) => ({
    Sira: r.rank,
    'Rozet': r.rank <= 3 ? `İlk ${r.rank}. Başarı Rozeti` : '—',
    'Öğrenci No (8H)': r.studentNumber8,
    'Adı Soyadı': r.studentName,
    'Sınıf / Şube': r.classroom,
    'Düzey': params.gradeLabel,
    [`${params.kts1Name} Net`]: r.kts1Net,
    [`${params.kts1Name} Puan`]: r.kts1Score,
    [`${params.kts2Name} Net`]: r.kts2Net,
    [`${params.kts2Name} Puan`]: r.kts2Score,
    'Net Gelişimi': `${r.netDelta >= 0 ? '+' : ''}${r.netDelta.toFixed(2)}`,
    'Puan Farkı': `${r.scoreDelta >= 0 ? '+' : ''}${r.scoreDelta.toFixed(1)}`,
    'Başarı %': `%${r.successPct}`,
    Durum: r.status,
    'Koçluk / Çalışma Notu': r.focusAdvice,
  }));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws['!cols'] = [
    { wch: 7 },
    { wch: 20 },
    { wch: 16 },
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 22 },
    { wch: 44 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Haftalik Liste Analizi');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function exportWeeklyComparisonToXlsx(params: {
  rows: Array<{
    rank: number;
    studentName: string;
    studentNumber8: string;
    classroom: string;
    kts1Net: number;
    kts1Score: number;
    kts2Net: number;
    kts2Score: number;
    netDelta: number;
    scoreDelta: number;
    successPct: number;
    status: string;
    focusAdvice: string;
  }>;
  academyName: string;
  kts1Name: string;
  kts2Name: string;
  gradeLabel: string;
}): Blob {
  const blob = buildWeeklyComparisonWorkbookBlob(params);
  const ktsSlug = normalizeTurkishSlug(params.kts1Name, 'kts-1');
  triggerDownload(blob, `Haftalik-Liste-Analizi-${ktsSlug}.xlsx`);
  return blob;
}
