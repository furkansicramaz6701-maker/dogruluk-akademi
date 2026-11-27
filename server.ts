import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import http from 'node:http';
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

function extractJsonObject(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  }
  return JSON.parse(candidate) as Record<string, unknown>;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

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

  // 2A-1. Ders Kitabından Sınıf Bazlı Konu Başlıkları ve Soru Başlıkları Analizi
  app.post('/api/textbook/analyze', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY tanımlı değil. Yapay zeka analizi için sunucu anahtarı gerekir.',
        });
        return;
      }

      const {
        gradeLabel = '5. Sınıf',
        subject = 'Tümü',
        fileName = 'Ders Kitabı',
        textContent = '',
        fileBase64,
        fileMimeType,
      } = req.body ?? {};

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
        text: `Eklenen ders kitabı içeriğini ("${fileName}") incele.
Hedef Sınıf Düzeyi: "${gradeLabel}". Seçilen Ders: "${subject}".
Kurallar:
1. Kesinlikle "${gradeLabel}" dışındaki üst/alt sınıf veya ilgisiz sınav (TYT/AYT/LGS) terimlerini karıştırma.
2. Kitaptaki ünite, bölüm ve kazanımlara göre 5 ile 12 arasında net "konu başlığı" (topics) çıkar.
3. Öğretmenin sınav/deneme veya yazılı hazırlarken seçebileceği 5 ile 8 arasında "soru başlığı" (questionHeadings — örn. Kavram & Tanım Doğrulama, Günlük Yaşam Problemi, Paragraf & Anlam Analizi, Tablo/Grafik Yorumlama veya üniteye özgü soru başlıkları) öner.
4. Kısa, anlaşılır bir özet (summary) ve tespit edilen ana dersi (detectedSubject) yaz.
${textContent ? `\nDers Kitabı Metni:\n${String(textContent).slice(0, 28000)}` : ''}`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              detectedSubject: { type: Type.STRING },
              topics: { type: Type.ARRAY, items: { type: Type.STRING } },
              questionHeadings: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['summary', 'detectedSubject', 'topics', 'questionHeadings'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      res.status(500).json({ error: `Ders kitabı analiz edilirken hata oluştu: ${message}` });
    }
  });

  // 2A-2. Ders Kitabından Konu Başlıkları ve Soru Başlıklarına Göre Deneme veya Yazılı Oluşturma
  app.post('/api/textbook/generate-exam', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY tanımlı değil. Yapay zeka soru üretimi için sunucu anahtarı gerekir.',
        });
        return;
      }

      const {
        gradeLabel = '5. Sınıf',
        subject = 'Matematik',
        examKind = 'deneme',
        count = 10,
        optionCount = 4,
        difficulty = 'dengeli',
        topics = [],
        questionHeadings = [],
        textContent = '',
        fileBase64,
        fileMimeType,
      } = req.body ?? {};

      const safeCount = Math.min(40, Math.max(1, Number(count) || 10));
      const safeTopics = Array.isArray(topics) ? topics.filter(Boolean).slice(0, 15) : [];
      const safeHeadings = Array.isArray(questionHeadings) ? questionHeadings.filter(Boolean).slice(0, 12) : [];

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (fileBase64 && fileMimeType) {
        parts.push({
          inlineData: {
            mimeType: String(fileMimeType),
            data: String(fileBase64),
          },
        });
      }

      if (examKind === 'yazili-acik-uclu') {
        parts.push({
          text: `Eklenen ders kitabına ve öğretmenin belirttiği başlıklara dayanarak "${gradeLabel}" düzeyinde "${subject}" dersi için ${safeCount} adet AÇIK UÇLU (KLASİK YAZILI) soru üret.
Kullanılacak Konu Başlıkları: ${safeTopics.join(', ') || subject}
Kullanılacak Soru Başlıkları / Tarzları: ${safeHeadings.join(', ') || 'Kavram Açıklama, Uygulama Problemi'}
Zorluk Profili: ${difficulty}.
Her sorunun prompt metni başında köşeli parantez içinde soru başlığı (örn. [Günlük Yaşam Problemi]) yer alsın, toplam puan 100 olacak şekilde puan dağılımı yap, örnek çözüm (modelAnswer) ve anahtar kelimeler (keywords) ekle.
${textContent ? `\nDers Kitabı Metni:\n${String(textContent).slice(0, 26000)}` : ''}`,
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
                  maxPoints: { type: Type.INTEGER },
                  prompt: { type: Type.STRING },
                  modelAnswer: { type: Type.STRING },
                  keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['subject', 'topic', 'maxPoints', 'prompt', 'modelAnswer', 'keywords'],
              },
            },
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });

        const openEndedQuestions = JSON.parse((response.text ?? '[]').trim());
        res.json({ examKind, openEndedQuestions });
        return;
      }

      const letters = optionCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'];
      const modeText =
        examKind === 'yazili-test'
          ? 'YAZILIYA HAZIRLIK ÇOKTAN SEÇMELİ TESTİ'
          : 'SINIF BAZLI DENEME SINAVI';

      parts.push({
        text: `Eklenen ders kitabına ve öğretmenin belirttiği başlıklara dayanarak "${gradeLabel}" düzeyinde "${subject}" dersi için ${safeCount} adet ${modeText} sorusu üret.
Kullanılacak Konu Başlıkları: ${safeTopics.join(', ') || subject}
Kullanılacak Soru Başlıkları / Tarzları: ${safeHeadings.join(', ') || 'Kavram & Tanım Doğrulama'}
Zorluk Profili: ${difficulty}. Her soruda kesinlikle ${letters.length} şık (${letters.join(', ')}) olmalıdır.
Her soru kökünün başında seçilen soru başlığı [Soru Başlığı] formatında belirtilsin ve yalnızca "${gradeLabel}" seviyesine uygun olsun.
${textContent ? `\nDers Kitabı Metni:\n${String(textContent).slice(0, 26000)}` : ''}`,
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
                  properties: Object.fromEntries(letters.map((l) => [l, { type: Type.STRING }])),
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
      res.json({ examKind, questions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      res.status(500).json({ error: `Ders kitabından sınav oluşturulurken hata oluştu: ${message}` });
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

  // 2C. Deneme Editörü İçin Deneme PDF Yükleyip Soruları (Grafik/Tablo/İşlem/Resimli İngilizce Dahil) Otomatik Çıkarma
  app.post('/api/questions/from-exam-pdf', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY tanımlı değil; yerel PDF soru ayrıştırıcı kullanılıyor.',
        });
        return;
      }

      const {
        gradeLabel = '5. Sınıf',
        optionCount = 4,
        fileName = 'Deneme.pdf',
        textContent = '',
        fileBase64,
        fileMimeType,
        count = 10,
      } = req.body ?? {};

      const safeCount = Math.min(20, Math.max(1, Number(count) || 10));
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
        text: `Bu deneme sınavı PDF/metin belgesini ("${fileName}") incele. Hedef öğrenci düzeyi: "${gradeLabel}".
Belgedeki soruları (${safeCount} adede kadar) veya belgedeki kazanımlara göre düzenlenebilir çoktan seçmeli (${letters.join(', ')} şıklı) soruları JSON dizisi olarak çıkar.
Eğer sorularda sütun grafiği, tablolu işlem, matematiksel işlem/şekil veya resimli İngilizce sahnesi varsa "visual" alanını doldur ("type": "chart" | "table" | "math" | "image").
${textContent ? `\nBelge Metni:\n${String(textContent).slice(0, 24000)}` : ''}`,
      });

      const response = await Promise.race([
        ai.models.generateContent({
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
                    properties: Object.fromEntries(letters.map((l) => [l, { type: Type.STRING }])),
                  },
                  correctOption: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  visual: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING },
                      title: { type: Type.STRING },
                      caption: { type: Type.STRING },
                      formula: { type: Type.STRING },
                      geometryShape: { type: Type.STRING },
                      scenePresetId: { type: Type.STRING },
                      sceneLabels: { type: Type.ARRAY, items: { type: Type.STRING } },
                      headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                      rows: {
                        type: Type.ARRAY,
                        items: { type: Type.ARRAY, items: { type: Type.STRING } },
                      },
                      bars: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            label: { type: Type.STRING },
                            value: { type: Type.NUMBER },
                          },
                        },
                      },
                    },
                  },
                },
                required: ['subject', 'topic', 'difficulty', 'stem', 'options', 'correctOption'],
              },
            },
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('PDF analiz zaman aşımı')), 12000)
        ),
      ]);

      const questions = JSON.parse((response.text ?? '[]').trim());
      res.json({ questions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF soru çıkarma hatası';
      res.status(504).json({ error: message });
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

      const {
        fileBase64,
        fileMimeType,
        mode = 'student',
        expectedCount = 120,
        optionCount = 5,
        isCroppedRegion = false,
        regionSummary = '',
        targetBooklet = '',
        subjectName = '',
      } = req.body ?? {};
      if (!fileBase64 || !fileMimeType) {
        res.status(400).json({ error: 'Dosya verisi eksik.' });
        return;
      }

      const cleanTargetBooklet = ['A', 'B', 'C', 'D'].includes(String(targetBooklet).trim().toUpperCase())
        ? String(targetBooklet).trim().toUpperCase()
        : '';
      const cleanSubject = String(subjectName || '').trim();
      const letters = optionCount === 4 ? 'A, B, C, D' : 'A, B, C, D, E';
      const subjectContext = cleanSubject ? ` Bu sınav/test özellikle "${cleanSubject}" dersi içindir.` : '';
      const targetBookletContext = cleanTargetBooklet
        ? ` Kullanıcı özellikle "${cleanTargetBooklet}" kitapçığı için cevap anahtarı yüklüyor. Tablo içinde A, B, C, D sütunları varsa "answersString" alanına kesinlikle ${cleanTargetBooklet} kitapçığının cevaplarını yaz; diğer görünen kitapçıkları da "bookletKeys" nesnesine ekle.`
        : ' Tabloda birden fazla kitapçık sütunu (A, B, C, D) varsa tespit ettiklerini "bookletKeys" nesnesinde ayrıca paylaş.';

      const prompt =
        mode === 'key'
          ? isCroppedRegion
            ? `Bu görsel kullanıcı tarafından Manuel Optik Bölge Editörü ile özellikle kırpılmış cevap anahtarı bölgesidir (${String(regionSummary || 'özel kırpım')}).${subjectContext} Yalnızca bu kırpılmış alandaki soru numaralarını ve doğru şıklarını (${letters}) sırayla çıkar; okunamayan veya boş satır varsa "-" yaz. İlk ${expectedCount} soru için doğru şıkları döndür.${targetBookletContext} Görselde yazan ders adını (örn. Matematik, Türkçe) "detectedSubject" alanına, kitapçık türünü (A, B, C veya D) "bookletCode" alanına yaz (görünmüyorsa "${cleanTargetBooklet || ''}").`
            : `Bu dosyadaki, ekran görüntüsündeki veya fotoğraftaki cevap anahtarını oku.${subjectContext} İlk ${expectedCount} soru için her sorunun doğru şıkkını (${letters}) sırayla çıkar (okunamayan/boş satır için "-" yaz).${targetBookletContext} Görselde belirtilen ders adını (örn. Matematik, Türkçe, Fen Bilimleri) "detectedSubject" alanına yaz; kitapçık türü (A, B, C veya D) yazıyorsa "bookletCode" alanına yaz (görünmüyorsa "${cleanTargetBooklet || ''}").`
          : `Bu optik cevap kağıdındaki işaretlenmiş baloncukları ve üst bilgi/çift karekod alanını oku.${subjectContext} İlk ${expectedCount} soru için öğrencinin işaretlediği şıkkı (${letters}) veya boş bırakılmışsa "-" karakterini sırayla çıkar. Kağıt başlığındaki ders adını "detectedSubject" alanına, Öğrenci No (8 haneli kod) bilgisini "detectedStudentNumber" alanına, üstteki Karne QR bağlantısını "detectedQrUrl" alanına, altındaki "DAK2." ile başlayan şifreli öğretmen analiz karekodunu varsa "detectedAnalysisQr" alanına ve işaretlenen kitapçık türünü (A, B, C veya D) "bookletCode" alanına yaz.`;

      const callGemini = async () =>
        ai.models.generateContent({
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
                bookletCode: {
                  type: Type.STRING,
                  description: 'Tespit edilen kitapçık türü: A, B, C, D veya boş',
                },
                detectedSubject: {
                  type: Type.STRING,
                  description: 'Optik form veya cevap anahtarındaki ders adı (örn. Matematik, Türkçe)',
                },
                detectedStudentNumber: {
                  type: Type.STRING,
                  description: 'Varsa 8 haneli öğrenci numarası',
                },
                detectedQrUrl: {
                  type: Type.STRING,
                  description: 'Varsa karne karekod (QR) bağlantısı veya parametreleri',
                },
                detectedAnalysisQr: {
                  type: Type.STRING,
                  description: 'Varsa DAK2. ile başlayan ikinci şifreli öğretmen analiz karekodu metni',
                },
                bookletKeys: {
                  type: Type.OBJECT,
                  properties: {
                    A: { type: Type.STRING },
                    B: { type: Type.STRING },
                    C: { type: Type.STRING },
                    D: { type: Type.STRING },
                  },
                },
                notes: { type: Type.STRING },
              },
              required: ['answersString', 'detectedCount'],
            },
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });

      let response;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await callGemini();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          const rawMsg = err instanceof Error ? err.message : String(err);
          const isTransient =
            rawMsg.includes('503') ||
            rawMsg.includes('UNAVAILABLE') ||
            rawMsg.includes('429') ||
            rawMsg.includes('RESOURCE_EXHAUSTED');
          if (!isTransient || attempt === 2) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        }
      }
      if (!response && lastErr) {
        throw lastErr;
      }

      const rawText = (response?.text ?? '{}').trim();
      const parsed = extractJsonObject(rawText);
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Optik okuma hatası';
      if (message.includes('503') || message.includes('UNAVAILABLE')) {
        res.status(503).json({
          error: 'Gemini optik okuma servisi yoğun talep nedeniyle geçici olarak meşgul (503). Lütfen birazdan tekrar deneyin.',
        });
        return;
      }
      if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Gemini API kota sınırına ulaşıldı (429). Kısa bir süre sonra tekrar deneyin.',
        });
        return;
      }
      res.status(500).json({ error: `Optik/Cevap anahtarı okunamadı: ${message}` });
    }
  });

  // 3B. 10 Soruluk Açık Uçlu (Klasik) Öğrenci Kağıdı & Çözüm Anahtarı Analizi
  app.post('/api/open-ended/analyze-paper', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY tanımlı değil; metin tabanlı yerel rubrik değerlendirici kullanılabilir.',
        });
        return;
      }

      const {
        gradeLabel = '5. Sınıf',
        studentName = 'Öğrenci',
        examTitle = '10 Soruluk Açık Uçlu Yazılı',
        questions = [],
        solutionFileBase64,
        solutionFileMimeType,
        solutionText = '',
        studentPaperBase64,
        studentPaperMimeType,
        studentPaperText = '',
      } = req.body ?? {};

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (solutionFileBase64 && solutionFileMimeType) {
        parts.push({
          inlineData: {
            mimeType: String(solutionFileMimeType),
            data: String(solutionFileBase64),
          },
        });
      }
      if (studentPaperBase64 && studentPaperMimeType) {
        parts.push({
          inlineData: {
            mimeType: String(studentPaperMimeType),
            data: String(studentPaperBase64),
          },
        });
      }

      const rubricSummary = Array.isArray(questions)
        ? questions
            .slice(0, 10)
            .map(
              (q: { number?: number; subject?: string; maxPoints?: number; prompt?: string; modelAnswer?: string }, idx: number) =>
                `Soru ${q.number ?? idx + 1} (${q.subject ?? 'Genel'}, ${q.maxPoints ?? 10} Puan):\nSoru: ${q.prompt ?? ''}\nÖrnek Çözüm: ${q.modelAnswer ?? ''}`
            )
            .join('\n\n')
        : '';

      parts.push({
        text: `Sen Doğruluk Akademi için çalışan kıdemli bir ölçme-değerlendirme öğretmenisin.
Öğrenci: ${studentName} · Düzey: ${gradeLabel} · Sınav: ${examTitle}.
Yüklenen öğrenci yazılı kağıdını (görsel/PDF veya metin) aşağıdaki sorular ve örnek çözümler / rubrik ile karşılaştırarak her soru için 0 ile maxPoints arasında puan ver, status ("tam" | "kismi" | "yanlis" | "bos") belirle ve kısa Türkçe geri bildirim yaz.

Sorular ve Örnek Çözümler:
${rubricSummary}

${solutionText ? `\nEk Çözüm Anahtarı Metni:\n${String(solutionText).slice(0, 8000)}` : ''}
${studentPaperText ? `\nÖğrenci Kağıdı Metni:\n${String(studentPaperText).slice(0, 12000)}` : ''}`,
      });

      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                overallFeedback: { type: Type.STRING },
                questionGrades: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      number: { type: Type.INTEGER },
                      subject: { type: Type.STRING },
                      score: { type: Type.NUMBER },
                      maxPoints: { type: Type.NUMBER },
                      status: { type: Type.STRING },
                      studentAnswerSummary: { type: Type.STRING },
                      feedback: { type: Type.STRING },
                    },
                    required: ['number', 'score', 'maxPoints', 'status', 'studentAnswerSummary', 'feedback'],
                  },
                },
              },
              required: ['overallFeedback', 'questionGrades'],
            },
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Açık uçlu kağıt analizi zaman aşımına uğradı')), 15000)
        ),
      ]);

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Açık uçlu kağıt analizi hatası';
      res.status(504).json({ error: message });
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

  // 4b. Gemini Çoklu Deneme Koçluk İçgörüleri (Coaching Insights)
  app.post('/api/analysis/coaching-insights', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'GEMINI_API_KEY tanımlı değil. Lütfen Settings > Secrets panelinden API anahtarınızı yapılandırın.',
        });
        return;
      }

      const { payload } = req.body ?? {};
      if (!payload || !payload.currentMetrics || !payload.multiExamTrend) {
        res.status(400).json({
          error: 'Çoklu deneme analiz ve konu eksikliği verisi eksik.',
        });
        return;
      }

      const prompt = `Sen Doğruluk Akademi Baş Eğitim Koçusun. Aşağıdaki öğrencinin birden fazla deneme sınavındaki performans trendini (net ve puan değişimi, kurum ortalamasıyla kıyas) ve tespit edilen konu eksiklerini analiz et. Öğrenciye kişiselleştirilmiş, somut çalışma odak alanları öner. Tüm metinler doğal, motive edici ve net Türkçe olmalıdır.

Öğrenci ve Sınav Bilgisi:
${JSON.stringify(payload.student)}

Güncel Sınav Özeti:
${JSON.stringify(payload.currentMetrics)}

Çoklu Deneme Geçmişi ve Trend:
${JSON.stringify(payload.multiExamTrend)}

Ders Bazlı Performans:
${JSON.stringify(payload.subjectMetrics)}

Öncelikli Konu Eksikleri (Hakimiyet yüzdesi düşükten yükseğe):
${JSON.stringify(payload.topicGaps)}

Hata Dağılımı:
${JSON.stringify(payload.errorBreakdown)}

Kurallar:
1. trendDirection alanı sadece "yukselis", "dengeli" veya "destek-gerekli" değerlerinden biri olsun.
2. focusAreas dizisinde 2 ile 4 arası odak alanı ver; her biri yukarıdaki konu eksikleriyle doğrudan eşleşsin ve priority alanı "yuksek", "orta" veya "pekistirme" olsun.
3. recommendedAction içinde somut haftalık soru sayısı, dakika ve çalışma tekniği belirt.
4. weeklyHours alanında haftalık önerilen saati (0.5 ile 10 arası sayı) ver.`;

      const callGemini = async () =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              required: [
                'headline',
                'trendDirection',
                'trendSummary',
                'strengthsHighlight',
                'focusAreas',
                'weeklyCoachNote',
              ],
              properties: {
                headline: {
                  type: Type.STRING,
                  description: 'Kısa koçluk değerlendirme başlığı (Türkçe)',
                },
                trendDirection: {
                  type: Type.STRING,
                  enum: ['yukselis', 'dengeli', 'destek-gerekli'],
                  description: 'yukselis, dengeli veya destek-gerekli',
                },
                trendSummary: {
                  type: Type.STRING,
                  description:
                    'Çoklu deneme net/puan ivmesi ve akademi ortalaması kıyasını özetleyen 2-3 cümle',
                },
                strengthsHighlight: {
                  type: Type.STRING,
                  description: 'Öğrencinin güçlü olduğu ders/konu vurgusu',
                },
                focusAreas: {
                  type: Type.ARRAY,
                  minItems: '2',
                  maxItems: '4',
                  items: {
                    type: Type.OBJECT,
                    required: [
                      'subject',
                      'topic',
                      'priority',
                      'reason',
                      'recommendedAction',
                      'weeklyHours',
                    ],
                    properties: {
                      subject: { type: Type.STRING },
                      topic: { type: Type.STRING },
                      priority: {
                        type: Type.STRING,
                        enum: ['yuksek', 'orta', 'pekistirme'],
                        description: 'yuksek, orta veya pekistirme',
                      },
                      reason: {
                        type: Type.STRING,
                        description: 'Konu eksiğinin çoklu deneme trendine etkisi',
                      },
                      recommendedAction: {
                        type: Type.STRING,
                        description: 'Somut haftalık çalışma adımı',
                      },
                      weeklyHours: {
                        type: Type.NUMBER,
                        description: 'Önerilen haftalık çalışma saati',
                      },
                    },
                  },
                },
                weeklyCoachNote: {
                  type: Type.STRING,
                  description: 'Karne ve veli özetine aktarılabilir kısa koçluk notu',
                },
              },
            },
          },
        });

      let response;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await callGemini();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          const rawMsg = err instanceof Error ? err.message : String(err);
          const isTransient =
            rawMsg.includes('503') ||
            rawMsg.includes('UNAVAILABLE') ||
            rawMsg.includes('429') ||
            rawMsg.includes('RESOURCE_EXHAUSTED');
          if (!isTransient || attempt === 2) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        }
      }
      if (!response && lastErr) {
        throw lastErr;
      }

      const rawText = (response?.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json({ insights: parsed });
    } catch (err) {
      const rawMessage =
        err instanceof Error ? err.message : 'Gemini koçluk içgörüleri oluşturulamadı.';
      let friendly = rawMessage;
      let status = 502;
      if (rawMessage.includes('503') || rawMessage.includes('UNAVAILABLE')) {
        status = 503;
        friendly =
          'Gemini servisi şu anda yoğun talep nedeniyle geçici olarak meşgul (503). Lütfen birkaç saniye sonra tekrar deneyin.';
      } else if (rawMessage.includes('429') || rawMessage.includes('RESOURCE_EXHAUSTED')) {
        status = 429;
        friendly =
          'Gemini API kullanım kotası sınırına ulaşıldı (429). Lütfen kısa bir süre sonra tekrar deneyin veya Settings > Secrets panelini kontrol edin.';
      } else if (rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('PERMISSION_DENIED')) {
        status = 403;
        friendly =
          'Gemini API anahtarı geçersiz veya yetkisiz. Lütfen Settings > Secrets panelinden anahtarınızı kontrol edin.';
      }
      res.status(status).json({ error: friendly });
    }
  });

  // 4c. Gemini AI Soru Geliştirme & Varyasyon Önerisi (Question Refinement)
  app.post('/api/questions/refine', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'GEMINI_API_KEY tanımlı değil. Lütfen Settings > Secrets panelinden API anahtarınızı yapılandırın.',
        });
        return;
      }

      const { gradeLabel, optionCount = 4, mode = 'harder', instruction, question } =
        req.body ?? {};

      if (!question || !question.stem) {
        res.status(400).json({ error: 'Düzenlenecek soru verisi eksik.' });
        return;
      }

      const optCount = optionCount === 5 ? 5 : 4;
      const letters = optCount === 5 ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
      const optionProperties: Record<string, { type: typeof Type.STRING }> = {};
      letters.forEach((l) => {
        optionProperties[l] = { type: Type.STRING };
      });

      const prompt = `Sen Türkiye MEB ve ÖSYM standartlarında çalışan kıdemli bir soru yazarısın.
Hedef Sınıf / Sınav Düzeyi: ${gradeLabel || '8. Sınıf (LGS)'} (${optCount} şıklı sistem: ${letters.join(', ')})
İstenen Düzenleme Modu: ${mode}
Öğretmen Talimatı: ${instruction || 'Soruyu daha kaliteli ve dengeli hale getir.'}

Mevcut Soru:
${JSON.stringify(question)}

Kurallar:
1. Kesinlikle belirtilen sınıf düzeyine uygun dil ve kazanım seviyesi kullan (ör. ilkokul/ortaokul sorusuna YKS/TYT terimi ekleme).
2. Tam olarak ${optCount} şık (${letters.join(', ')}) üret ve "correctOption" sadece ${letters.join(' | ')} değerlerinden biri olsun.
3. Doğru şıkkın çözümünü "explanation" alanında adım adım net biçimde açıkla.
4. "summaryRationale" alanında yapılan değişikliğin pedagojik gerekçesini 1-2 Türkçe cümleyle özetle.`;

      const callGemini = async () =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              required: ['summaryRationale', 'refinedQuestion'],
              properties: {
                summaryRationale: {
                  type: Type.STRING,
                  description: 'Önerilen varyasyonun pedagojik gerekçesi (Türkçe)',
                },
                refinedQuestion: {
                  type: Type.OBJECT,
                  required: [
                    'subject',
                    'topic',
                    'gainCode',
                    'difficulty',
                    'stem',
                    'options',
                    'correctOption',
                    'explanation',
                  ],
                  properties: {
                    subject: { type: Type.STRING },
                    topic: { type: Type.STRING },
                    gainCode: { type: Type.STRING },
                    difficulty: {
                      type: Type.STRING,
                      enum: ['Kolay', 'Orta', 'Zor'],
                    },
                    stem: { type: Type.STRING },
                    options: {
                      type: Type.OBJECT,
                      required: letters,
                      properties: optionProperties,
                    },
                    correctOption: {
                      type: Type.STRING,
                      enum: letters,
                    },
                    explanation: { type: Type.STRING },
                  },
                },
              },
            },
          },
        });

      let response;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await callGemini();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          const rawMsg = err instanceof Error ? err.message : String(err);
          const isTransient =
            rawMsg.includes('503') ||
            rawMsg.includes('UNAVAILABLE') ||
            rawMsg.includes('429') ||
            rawMsg.includes('RESOURCE_EXHAUSTED');
          if (!isTransient || attempt === 2) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        }
      }
      if (!response && lastErr) {
        throw lastErr;
      }

      const rawText = (response?.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json({ suggestion: parsed });
    } catch (err) {
      const rawMessage =
        err instanceof Error ? err.message : 'Soru varyasyonu oluşturulamadı.';
      let friendly = rawMessage;
      let status = 502;
      if (rawMessage.includes('503') || rawMessage.includes('UNAVAILABLE')) {
        status = 503;
        friendly =
          'Gemini servisi şu anda yoğun talep nedeniyle geçici olarak meşgul (503). Lütfen birkaç saniye sonra tekrar deneyin.';
      } else if (rawMessage.includes('429') || rawMessage.includes('RESOURCE_EXHAUSTED')) {
        status = 429;
        friendly =
          'Gemini API kullanım kotası sınırına ulaşıldı (429). Lütfen kısa bir süre sonra tekrar deneyin veya Settings > Secrets panelini kontrol edin.';
      } else if (rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('PERMISSION_DENIED')) {
        status = 403;
        friendly =
          'Gemini API anahtarı geçersiz veya yetkisiz. Lütfen Settings > Secrets panelinden anahtarınızı kontrol edin.';
      }
      res.status(status).json({ error: friendly });
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

  const httpServer = http.createServer(app);

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Doğruluk Akademi sunucusu http://localhost:${port} adresinde çalışıyor`);
  });
}

startServer();
