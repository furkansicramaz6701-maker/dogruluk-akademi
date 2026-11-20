import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'select_account' });

// Strictly in-memory token cache (never stored in localStorage or sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

export function initGoogleDriveAuth(
  onAuthSuccess: (user: User, token: string) => void,
  onAuthCleared: () => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      onAuthSuccess(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (!user) {
        cachedAccessToken = null;
      }
      if (!cachedAccessToken) {
        onAuthCleared();
      }
    }
  });
}

export async function signInWithGoogleDrive(): Promise<{
  user: User;
  accessToken: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google Drive erişim jetonu alınamadı. Lütfen tekrar deneyin.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/user-cancelled' ||
      (err instanceof Error && /access_denied|closed/i.test(err.message))
    ) {
      throw new Error(
        'Google Drive izni iptal edildi. İsterseniz yeniden "Google ile Bağlan" diyebilir veya e-posta girmeden yukarıdaki "Bilgisayara Kur / ZIP İndir" bağlantılarını kullanabilirsiniz.'
      );
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleDrive(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}

export function getCachedDriveToken(): string | null {
  return cachedAccessToken;
}

export async function listGoogleDriveFiles(
  accessToken: string,
  searchQuery = ''
): Promise<DriveFileItem[]> {
  const baseFilter = 'trashed = false';
  const q = searchQuery.trim()
    ? `${baseFilter} and name contains '${searchQuery.trim().replace(/'/g, "\\'")}'`
    : baseFilter;

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('pageSize', '40');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set(
    'fields',
    'files(id,name,mimeType,modifiedTime,size,webViewLink)'
  );

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Google Drive dosyaları listelenemedi (${resp.status}): ${errText}`);
  }
  const data = (await resp.json()) as { files?: DriveFileItem[] };
  return data.files ?? [];
}

export async function ensureDriveFolder(
  accessToken: string,
  folderName = 'Doğruluk Akademi Arşivi'
): Promise<string> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set(
    'q',
    `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  url.searchParams.set('fields', 'files(id,name)');

  const findResp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (findResp.ok) {
    const data = (await findResp.json()) as { files?: Array<{ id: string }> };
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createResp.ok) {
    throw new Error('Google Drive klasörü oluşturulamadı.');
  }
  const folder = (await createResp.json()) as { id: string };
  return folder.id;
}

export async function uploadBlobToGoogleDrive(
  accessToken: string,
  params: {
    fileName: string;
    mimeType: string;
    blob: Blob;
    folderId?: string;
    overwriteFileId?: string;
  }
): Promise<DriveFileItem> {
  const metadata: Record<string, unknown> = {
    name: params.fileName,
    mimeType: params.mimeType,
  };
  if (params.folderId && !params.overwriteFileId) {
    metadata.parents = [params.folderId];
  }

  const boundary = `da_drive_boundary_${Date.now()}`;
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}\r\n`;
  const fileHeader = `--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const bodyBlob = new Blob([metaPart, fileHeader, params.blob, closing], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const targetUrl = params.overwriteFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${params.overwriteFileId}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink`;

  const resp = await fetch(targetUrl, {
    method: params.overwriteFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: bodyBlob,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Google Drive yükleme hatası (${resp.status}): ${errText}`);
  }
  return (await resp.json()) as DriveFileItem;
}

export async function downloadGoogleDriveFileBlob(
  accessToken: string,
  fileId: string
): Promise<Blob> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!resp.ok) {
    throw new Error(`Dosya Google Drive'dan indirilemedi (${resp.status}).`);
  }
  return resp.blob();
}

export async function deleteGoogleDriveFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!resp.ok) {
    throw new Error(`Dosya Google Drive'dan silinemedi (${resp.status}).`);
  }
}
