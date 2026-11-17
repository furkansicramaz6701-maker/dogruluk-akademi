import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractJsonArray(rawText: string): unknown[] {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  return JSON.parse(candidate);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // 1. İnternetten Konulara Göre Güncel Soru Arama & Üretme (Google Search Grounding)
  app.post('/api/questions/internet-search', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY tanımlı değil. Lütfen Secrets panelinden anahtarı yapılandırın.',
        });
        return;
      }

      const {
        gradeLabel = 'TYT',
        subject = 'Türkçe',
        topic = 'Paragrafta Ana Düşünce',
        count = 5,
        optionCount = 5,
        difficulty = 'Orta',
      } = req.body ?? {};

      const safeCount = Math.min(20, Math.max(1, Number(count) || 5));
      const letters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];

      const prompt = `Sen Doğruluk Akademi için çalışan kıdemli bir MEB ve ÖSYM soru yazarısın.
İnternet araştırması yaparak "${gradeLabel}" düzeyinde, "${subject}" dersinin "${topic}" konusunda güncel müfredata uygun ${safeCount} adet özgün çoktan seçmeli soru oluştur.
Zorluk seviyesi: ${difficulty}. Her soruda ${letters.length} şık (${letters.join(', ')}) olsun.

Yanıtını SADECE geçerli bir JSON dizisi olarak ver. Her eleman şu alanlara sahip olsun:
{
  "subject": "${subject}",
  "topic": "${topic}",
  "gainCode": "MEB/OSYM kazanım kodu",
  "difficulty": "Kolay" | "Orta" | "Zor",
  "stem": "Soru kökü (Türkçe, net ve anlaşılır)",
  "options": { ${letters.map((l) => `"${l}": "şık metni"`).join(', ')} },
  "correctOption": "${letters[0]}",
  "explanation": "Kısa ve öğretici çözüm açıklaması"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = response.text ?? '[]';
      const parsed = extractJsonArray(rawText);
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources = chunks
        .map((c) => c.web)
        .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
        .slice(0, 6);

      res.json({ questions: parsed, sources });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen sunucu hatası';
      res.status(500).json({ error: `İnternetten soru üretilirken hata oluştu: ${message}` });
    }
  });

  // 2. Ders Kitabı (PDF veya Metin) Yükleyerek Soru Oluşturma
  app.post('/api/questions/from-textbook', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY tanımlı değil. Lütfen Secrets panelinden anahtarı yapılandırın.',
        });
        return;
      }

      const {
        gradeLabel = 'TYT',
        subject = 'Genel',
        count = 5,
        optionCount = 5,
        textContent = '',
        fileBase64,
        fileMimeType,
      } = req.body ?? {};

      const safeCount = Math.min(20, Math.max(1, Number(count) || 5));
      const letters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (fileBase64 && fileMimeType) {
        parts.push({
          inlineData: {
            mimeType: String(fileMimeType),
            data: String(fileBase64),
          },
        });
      }

      parts.push({
        text: `Eklenen ders kitabı içeriğini / metnini incele ve yalnızca bu içerikteki bilgilere ve kazanımlara dayanarak "${gradeLabel}" düzeyinde "${subject}" dersi için ${safeCount} adet çoktan seçmeli deneme sorusu üret.
Her soru ${letters.length} şıklı (${letters.join(', ')}) olmalıdır.
${textContent ? `\nDers Kitabı Metni:\n${String(textContent).slice(0, 24000)}` : ''}`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                subject: { type: Type.STRING },
                topic: { type: Type.STRING },
                gainCode: { type: Type.STRING },
                difficulty: { type: Type.STRING },
                stem: { type: Type.STRING },
                options: {
                  type: Type.OBJECT,
                  properties: Object.fromEntries(
                    letters.map((l) => [l, { type: Type.STRING }])
                  ),
                },
                correctOption: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ['subject', 'topic', 'difficulty', 'stem', 'options', 'correctOption', 'explanation'],
            },
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const questions = JSON.parse((response.text ?? '[]').trim());
      res.json({ questions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      res.status(500).json({ error: `Ders kitabından soru oluşturulurken hata oluştu: ${message}` });
    }
  });

  // 2B. MEB Müfredat PDF'i Ekleyerek Aktif Müfredat & Dinamik Sorular Çıkarma
  app.post('/api/curriculum/from-meb-pdf', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY tanımlı değil; yerel müfredat ayrıştırıcı kullanılıyor.',
        });
        return;
      }

      const {
        gradeLabel = '5. Sınıf',
        optionCount = 4,
        sourceName = 'MEB Müfredat PDF',
        textContent = '',
        fileBase64,
        fileMimeType,
        count = 8,
      } = req.body ?? {};

      const safeCount = Math.min(20, Math.max(4, Number(count) || 8));
      const letters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (fileBase64 && fileMimeType) {
        parts.push({
          inlineData: {
            mimeType: String(fileMimeType),
            data: String(fileBase64),
          },
        });
      }

      parts.push({
        text: `Bu MEB öğretim programı / müfredat belgesini ("${sourceName}") incele. Hedef öğrenci düzeyi: "${gradeLabel}".
Kesinlikle üst sınıf veya TYT/AYT konularını karıştırma; yalnızca "${gradeLabel}" düzeyine uygun ders adlarını, ünite/konu başlıklarını ve ${safeCount} adet çoktan seçmeli (${letters.join(', ')} şıklı) örnek deneme sorusunu JSON formatında çıkar.
${textContent ? `\nBelge Metni:\n${String(textContent).slice(0, 24000)}` : ''}`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subjects: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    questionCount: { type: Type.INTEGER },
                    topics: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['name', 'topics'],
                },
              },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    subject: { type: Type.STRING },
                    topic: { type: Type.STRING },
                    gainCode: { type: Type.STRING },
                    difficulty: { type: Type.STRING },
                    stem: { type: Type.STRING },
                    options: {
                      type: Type.OBJECT,
                      properties: Object.fromEntries(letters.map((l) => [l, { type: Type.STRING }])),
                    },
                    correctOption: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                  },
                  required: ['subject', 'topic', 'difficulty', 'stem', 'options', 'correctOption'],
                },
              },
            },
            required: ['subjects', 'questions'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MEB müfredat PDF ayrıştırma hatası';
      res.status(500).json({ error: message });
    }
  });

  // 3. Yüklenen Optik Form veya Cevap Anahtarı Görseli/PDF'ini Okuma (OMR Vision)
  app.post('/api/omr/parse-file', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY tanımlı değil. Lütfen Secrets panelinden anahtarı yapılandırın.',
        });
        return;
      }

      const { fileBase64, fileMimeType, mode = 'student', expectedCount = 120, optionCount = 5 } = req.body ?? {};
      if (!fileBase64 || !fileMimeType) {
        res.status(400).json({ error: 'Dosya verisi eksik.' });
        return;
      }

      const letters = optionCount === 4 ? 'A, B, C, D' : 'A, B, C, D, E';
      const prompt =
        mode === 'key'
          ? `Bu dosyadaki cevap anahtarını oku. İlk ${expectedCount} soru için her sorunun doğru şıkkını (${letters}) sırayla çıkar.`
          : `Bu optik cevap kağıdındaki işaretlenmiş baloncukları oku. İlk ${expectedCount} soru için öğrencinin işaretlediği şıkkı (${letters}) veya boş bırakılmışsa "-" karakterini sırayla çıkar.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType: String(fileMimeType), data: String(fileBase64) } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answersString: {
                type: Type.STRING,
                description: `Tam olarak harfler ve boşlar için '-' içeren kesintisiz dizi, örn: ABCDE-AB...`,
              },
              detectedCount: { type: Type.INTEGER },
              notes: { type: Type.STRING },
            },
            required: ['answersString', 'detectedCount'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Optik okuma hatası';
      res.status(500).json({ error: `Optik/Cevap anahtarı okunamadı: ${message}` });
    }
  });

  // 4. AI Eğitim Koçu Yorumu ve Kişisel Çalışma Reçetesi
  app.post('/api/analysis/ai-coach', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY tanımlı değil.',
        });
        return;
      }

      const { analysis } = req.body ?? {};
      if (!analysis) {
        res.status(400).json({ error: 'Analiz verisi eksik.' });
        return;
      }

      const prompt = `Sen Doğruluk Akademi Baş Eğitim Koçusun. Aşağıdaki öğrenci deneme sınavı analizine göre öğrenciye motive edici, somut, ders ve konu bazlı haftalık çalışma reçetesi yaz (Türkçe, maksimum 3 kısa paragraf + 4 maddelik aksiyon listesi):
Öğrenci: ${analysis.studentName} (${analysis.classroom})
Sınav: ${analysis.examTitle}
Toplam Net: ${analysis.totalNet} / ${analysis.totalQuestions} (Doğru: ${analysis.totalCorrect}, Yanlış: ${analysis.totalWrong}, Boş: ${analysis.totalBlank})
Tahmini Puan: ${analysis.estimatedScore}
Ders Netleri: ${JSON.stringify(analysis.subjectMetrics)}
En Zayıf Konular: ${JSON.stringify((analysis.topicGaps ?? []).slice(0, 5))}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      res.json({ summary: response.text ?? '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Koç yorumu üretilemedi';
      res.status(500).json({ error: message });
    }
  });

  // 5. Tüm Uygulama Kaynak Kodunu ZIP Olarak İndirme
  app.get('/api/export/app-zip', async (_req, res) => {
    try {
      const zip = new JSZip();
      const ignoredDirs = new Set([
        'node_modules',
        'dist',
        '.git',
        '.playwright-cli',
        '.aistudio',
      ]);
      const ignoredFiles = new Set(['.env', 'server.js']);

      async function addDirToZip(dirPath: string, relBase: string) {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (ignoredDirs.has(entry.name)) continue;
            await addDirToZip(
              path.join(dirPath, entry.name),
              relBase ? `${relBase}/${entry.name}` : entry.name
            );
          } else if (entry.isFile()) {
            if (ignoredFiles.has(entry.name)) continue;
            const fullPath = path.join(dirPath, entry.name);
            const content = await fs.readFile(fullPath);
            const zipPath = relBase ? `${relBase}/${entry.name}` : entry.name;
            zip.file(zipPath, content);
          }
        }
      }

      await addDirToZip(__dirname, '');
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="Dogruluk-Akademi-Uygulama-Kaynak-Kodu.zip"'
      );
      res.send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ZIP oluşturulamadı';
      res.status(500).json({ error: `Uygulama ZIP paketi hazırlanamadı: ${message}` });
    }
  });

  // 6. E-posta Girmeden Bilgisayara Masaüstü Uygulaması Başlatıcı Paketi (.ZIP)
  app.get('/api/export/desktop-kit', async (req, res) => {
    try {
      const rawUrl = typeof req.query.appUrl === 'string' ? req.query.appUrl.trim() : '';
      let safeOrigin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      if (rawUrl) {
        try {
          const parsed = new URL(rawUrl);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            safeOrigin = parsed.origin;
          }
        } catch {
          // Keep request origin fallback
        }
      }

      const zip = new JSZip();

      const windowsBat = [
        '@echo off',
        'chcp 65001 >nul',
        'title Dogruluk Akademi — Masasustu Uygulamasi',
        'echo Dogruluk Akademi uygulama penceresinde aciliyor (E-posta girisi gerekmez)...',
        `set "APP_URL=${safeOrigin}"`,
        'if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (',
        '  start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%APP_URL%"',
        '  exit /b 0',
        ')',
        'if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (',
        '  start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%APP_URL%"',
        '  exit /b 0',
        ')',
        'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (',
        '  start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app="%APP_URL%"',
        '  exit /b 0',
        ')',
        'if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" (',
        '  start "" "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" --app="%APP_URL%"',
        '  exit /b 0',
        ')',
        'start "" "%APP_URL%"',
      ].join('\r\n');

      const macLinuxCmd = [
        '#!/usr/bin/env bash',
        `APP_URL="${safeOrigin}"`,
        'if command -v open >/dev/null 2>&1; then',
        '  if [ -d "/Applications/Google Chrome.app" ]; then',
        '    open -na "Google Chrome" --args --app="$APP_URL"',
        '  elif [ -d "/Applications/Microsoft Edge.app" ]; then',
        '    open -na "Microsoft Edge" --args --app="$APP_URL"',
        '  else',
        '    open "$APP_URL"',
        '  fi',
        'elif command -v xdg-open >/dev/null 2>&1; then',
        '  xdg-open "$APP_URL"',
        'fi',
      ].join('\n');

      const iconPath = path.resolve(__dirname, 'public', 'favicon.ico');
      try {
        const iconBuffer = await fs.readFile(iconPath);
        zip.file('Dogruluk-Akademi-Ikon.ico', iconBuffer);
      } catch {
        // Ignore if icon file is missing
      }

      const windowsDesktopShortcutBat = [
        '@echo off',
        'chcp 65001 >nul',
        'title Dogruluk Akademi — Masasustu Uygulama Simgesi Olusturucu',
        `set "APP_URL=${safeOrigin}"`,
        'set "ICON_DIR=%LocalAppData%\\DogrulukAkademi"',
        'if not exist "%ICON_DIR%" mkdir "%ICON_DIR%"',
        'if exist "%~dp0Dogruluk-Akademi-Ikon.ico" copy /y "%~dp0Dogruluk-Akademi-Ikon.ico" "%ICON_DIR%\\Dogruluk-Akademi-Ikon.ico" >nul',
        'set "BROWSER_EXE="',
        'if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"',
        'if not defined BROWSER_EXE if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER_EXE=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"',
        'if not defined BROWSER_EXE if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER_EXE=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
        'if not defined BROWSER_EXE if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER_EXE=%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"',
        'if not defined BROWSER_EXE (',
        '  echo Edge veya Chrome bulunamadi; tarayicida aciliyor...',
        '  start "" "%APP_URL%"',
        '  exit /b 0',
        ')',
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath(\'Desktop\'); $lnk = $ws.CreateShortcut((Join-Path $desktop \'Dogruluk Akademi.lnk\')); $lnk.TargetPath = $env:BROWSER_EXE; $lnk.Arguments = \'--app=\' + $env:APP_URL; $lnk.IconLocation = (Join-Path $env:ICON_DIR \'Dogruluk-Akademi-Ikon.ico\') + \',0\'; $lnk.Description = \'Dogruluk Akademi Masasustu Uygulamasi\'; $lnk.Save()"',
        'echo.',
        'echo Dogruluk Akademi simgesi Masaustunuze eklendi! Uygulama aciliyor...',
        'start "" "%BROWSER_EXE%" --app="%APP_URL%"',
        'timeout /t 2 >nul',
      ].join('\r\n');

      const shortcutUrl = [
        '[InternetShortcut]',
        `URL=${safeOrigin}`,
        `IconFile=${safeOrigin}/favicon.ico`,
        'IconIndex=0',
      ].join('\r\n');

      const readmeTxt = [
        'DOĞRULUK AKADEMİ — BİLGİSAYAR & TELEFON KURULUM REHBERİ (E-POSTASIZ)',
        '==========================================================================',
        '',
        'Bu paketi kullanmak için kesinlikle Google hesabı veya e-posta girişi GEREKMEZ.',
        '',
        'YÖNTEM 1 (MASAÜSTÜNE DOĞRULUK AKADEMİ SİMGELİ UYGULAMA KURMA — ÖNERİLEN):',
        '1. ZIP klasörünü bilgisayarınızda Masaüstüne çıkarın.',
        '2. Windows kullanıyorsanız "Dogruluk-Akademi-Masasustune-Simge-Ekle.bat" dosyasına çift tıklayın.',
        '   Masaüstünüze Doğruluk Akademi logolu "Dogruluk Akademi" ikonu eklenir ve uygulama',
        '   adres çubuğu olmadan bağımsız Masaüstü Programı penceresinde açılır.',
        '3. Sadece hemen açmak için "Dogruluk-Akademi-Uygulamayi-Ac.bat" dosyasını da kullanabilirsiniz.',
        '   (Mac/Linux için "Dogruluk-Akademi-Mac-Linux.command" dosyasını kullanın.)',
        '',
        'YÖNTEM 2 (CHROME / EDGE VEYA TELEFONDAN ANA EKRANA KURMA):',
        `1. Tarayıcıda şu adresi açın: ${safeOrigin}/?install=1`,
        '2. Bilgisayarda: Sağ üstteki Yükle simgesine veya "⋮ > Kaydet ve Paylaş > Doğruluk Akademi olarak yükle"ye tıklayın.',
        '3. Android Telefonda: Chrome ile açıp "Uygulamayı Kur" veya "⋮ > Ana ekrana ekle"ye dokunun.',
        '4. iPhone / iPad’de: Safari ile açıp "Paylaş > Ana Ekrana Ekle"ye dokunun.',
        '',
        `Uygulama Adresi: ${safeOrigin}/?install=1`,
      ].join('\r\n');

      zip.file('Dogruluk-Akademi-Masasustune-Simge-Ekle.bat', windowsDesktopShortcutBat);
      zip.file('Dogruluk-Akademi-Uygulamayi-Ac.bat', windowsBat);
      zip.file('Dogruluk-Akademi-Mac-Linux.command', macLinuxCmd);
      zip.file('Dogruluk-Akademi-Masasustu-Kisayol.url', shortcutUrl);
      zip.file('KURULUM-REHBERI.txt', readmeTxt);

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="Dogruluk-Akademi-Bilgisayar-Kurulumu.zip"'
      );
      res.send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Masaüstü paketi oluşturulamadı';
      res.status(500).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Doğruluk Akademi sunucusu http://localhost:${port} adresinde çalışıyor`);
  });
}

startServer();
