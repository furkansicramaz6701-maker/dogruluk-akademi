import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Calendar,
  Clock,
  Download,
  Gift,
  MapPin,
  Phone,
  QrCode,
  Rotate3D,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { CoverConfig, ExamAnalysisResult, GradeProfile } from '../types/academy';
import { triggerDownload } from '../utils/pdfAndZip';
import { buildGradeAppropriateSubtitle } from '../utils/weeklyAnalysis';
import { Logo3D } from './Logo3D';

const POSTER_BACKDROP_SRC = '/src/assets/images/academy_poster_backdrop_1794753070520.jpg';

type PosterTemplateId =
  | 'deneme-kampi'
  | 'esentepe-odullu'
  | 'uzay-odullu'
  | 'basari-onur'
  | 'akademi-tanitim';

interface Poster3DStudioProps {
  gradeProfile: GradeProfile;
  analysis: ExamAnalysisResult;
  cover: CoverConfig;
}

export function Poster3DStudio({
  gradeProfile,
  analysis,
  cover,
}: Poster3DStudioProps) {
  const [template, setTemplate] = useState<PosterTemplateId>('esentepe-odullu');
  const [headline, setHeadline] = useState<string>(
    `${gradeProfile.shortLabel.toUpperCase()} ÖDÜLLÜ SEVİYE TESPİT SINAVI`
  );
  const [subheadline, setSubheadline] = useState<string>(
    () => buildGradeAppropriateSubtitle(gradeProfile)
  );
  const [ctaText, setCtaText] = useState<string>(
    'Sınava Katılan Herkese Sürpriz Hediyeler & Ücretsiz Kurumsal Karne'
  );
  const [examDateTime, setExamDateTime] = useState<string>(
    `${cover.examDate} Cumartesi · Saat: 10.00`
  );
  const [locationAddress, setLocationAddress] = useState<string>(
    `${cover.academyName} Merkez Kampüsü`
  );
  const [phonePrimary, setPhonePrimary] = useState<string>('0505 226 92 58');
  const [phoneSecondary, setPhoneSecondary] = useState<string>('0507 152 01 34');
  const [prize1, setPrize1] = useState<string>('1.ye BİSİKLET / AKILLI SAAT');
  const [prize2, setPrize2] = useState<string>('2.ye DRON / KULAKLIK');
  const [prize3, setPrize3] = useState<string>('3.ye UZAKTAN KUMANDALI ARABA');
  const [participantGift, setParticipantGift] = useState<string>(
    'Katılan Herkese Akademi Bilekliği & Sürpriz Hediye'
  );
  const [targetGradesLabel, setTargetGradesLabel] = useState<string>(
    `${gradeProfile.shortLabel} Öğrencilerine Özel`
  );
  const [deadlineBadge, setDeadlineBadge] = useState<string>('Son Kayıt: 25 Kasım');
  const [bonusThresholdText, setBonusThresholdText] = useState<string>(
    '350 Barajını Geçen Öğrencilerimize Ücretsiz Ek Destek Kursu'
  );
  const [qrTargetUrl, setQrTargetUrl] = useState<string>(
    'https://forms.gle/dogruluk-akademi-sinav-kayit'
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [footerNote, setFooterNote] = useState<string>(
    `${cover.academyName} · ${cover.signatureName} İmzalı Resmi Yayın`
  );
  const [tiltY, setTiltY] = useState<number>(-8);
  const [tiltX, setTiltX] = useState<number>(5);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setSubheadline(buildGradeAppropriateSubtitle(gradeProfile));
    setTargetGradesLabel(`${gradeProfile.shortLabel} Öğrencilerine Özel`);
  }, [gradeProfile]);

  useEffect(() => {
    let active = true;
    const target = qrTargetUrl.trim() || 'https://forms.gle/dogruluk-akademi';
    QRCode.toDataURL(target, {
      width: 240,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [qrTargetUrl]);

  const applyTemplate = (id: PosterTemplateId) => {
    setTemplate(id);
    if (id === 'esentepe-odullu') {
      setHeadline(`${gradeProfile.shortLabel.toUpperCase()} ÖDÜLLÜ SEVİYE TESPİT SINAVI`);
      setSubheadline('Geleceğe Umutla Bakan Öğrenciler İçin Resmi Kurumsal Deneme');
      setCtaText(participantGift);
      setPrize1('1.ye BİSİKLET');
      setPrize2('2.ye DRON');
      setPrize3('3.ye UZAKTAN KUMANDALI ARABA');
    } else if (id === 'uzay-odullu') {
      setHeadline(`ÖDÜLLÜ DENEME SINAVI (${gradeProfile.shortLabel.toUpperCase()})`);
      setSubheadline('Dereceye Giren Öğrencilere Büyük Ödüller & QR Başvuru');
      setCtaText('Sınava Katılan Herkese Ücretsiz Hediyeler & Analiz Karnesi');
      setPrize1('1. AKILLI SAAT');
      setPrize2('2. KABLOSUZ KULAKLIK');
      setPrize3('3. RC ARABA');
    } else if (id === 'deneme-kampi') {
      setHeadline(`${gradeProfile.shortLabel.toUpperCase()} BÜYÜK DENEME MARATONU`);
      setSubheadline(`${gradeProfile.label} · 5 Çeşit Analiz Karnesi & Veli Mesaj Sistemi`);
      setCtaText('Erken Kayıt ve Kitapçık Rezervasyonu');
    } else if (id === 'basari-onur') {
      setHeadline(
        `${(analysis.studentName || 'DERECE ÖĞRENCİMİZ').toUpperCase()} — ÜSTÜN BAŞARI ONURU`
      );
      setSubheadline(
        `${analysis.examTitle} · ${analysis.totalNet.toFixed(2)} Net · ${analysis.estimatedScore.toFixed(1)} Puan`
      );
      setCtaText(`Kurum Sıralaması: ${analysis.academyRank} / ${analysis.academySize}`);
    } else {
      setHeadline(`${cover.academyName.toUpperCase()} YENİ DÖNEM KAYITLARI`);
      setSubheadline(buildGradeAppropriateSubtitle(gradeProfile));
      setCtaText('Ücretsiz Seviye Tespit & Deneme Sınavı');
    }
  };

  const isSpaceTheme = template === 'uzay-odullu';
  const isBrightCampTheme = template === 'esentepe-odullu';

  const handleDownloadPosterPng = async () => {
    setExporting(true);
    try {
      const W = 1200;
      const H = 1600;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // Backdrop based on template
      if (isBrightCampTheme) {
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#0284c7');
        sky.addColorStop(0.5, '#0ea5e9');
        sky.addColorStop(1, '#1e3a8a');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);
      } else if (isSpaceTheme) {
        const space = ctx.createLinearGradient(0, 0, 0, H);
        space.addColorStop(0, '#020617');
        space.addColorStop(0.55, '#0f172a');
        space.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = space;
        ctx.fillRect(0, 0, W, H);
        // Subtle stars
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        for (let i = 0; i < 90; i++) {
          const sx = ((i * 197) % (W - 80)) + 40;
          const sy = ((i * 313) % (H - 80)) + 40;
          ctx.beginPath();
          ctx.arc(sx, sy, (i % 3) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#0f2747';
        ctx.fillRect(0, 0, W, H);
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const scale = Math.max(W / img.width, H / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = POSTER_BACKDROP_SRC;
        });
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, 'rgba(10, 22, 46, 0.88)');
        grad.addColorStop(0.5, 'rgba(15, 39, 71, 0.62)');
        grad.addColorStop(1, 'rgba(7, 15, 32, 0.94)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // Outer frame
      ctx.strokeStyle = isBrightCampTheme ? '#fde047' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 4;
      ctx.strokeRect(44, 44, W - 88, H - 88);

      // 3D Crest Box top-left
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(88, 88, 92, 92);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(88, 88, 92, 92);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DA', 134, 134);

      // Brand Header (Always grade-appropriate — no forced TYT leak)
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(cover.academyName.toUpperCase(), 204, 120);
      ctx.fillStyle = '#fde68a';
      ctx.font = '700 21px "DM Sans", sans-serif';
      ctx.fillText(
        `${gradeProfile.label.toUpperCase()} · KOD: ${cover.institutionCode8 || '48291045'}`,
        204,
        158
      );

      // Grade badge & Deadline seal
      ctx.fillStyle = '#facc15';
      ctx.fillRect(88, 220, 480, 48);
      ctx.fillStyle = '#0f172a';
      ctx.font = '800 21px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(targetGradesLabel.toUpperCase().slice(0, 34), 328, 245);

      ctx.fillStyle = '#dc2626';
      ctx.fillRect(W - 418, 214, 330, 56);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3;
      ctx.strokeRect(W - 418, 214, 330, 56);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(deadlineBadge.toUpperCase().slice(0, 26), W - 253, 243);

      // Main 3D Extruded Headline
      ctx.textAlign = 'left';
      const words = headline.split(/\s+/);
      const lines: string[] = [];
      let cur = '';
      ctx.font = '800 62px "Plus Jakarta Sans", sans-serif';
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(test).width > W - 180 && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);

      let y = 345;
      for (const line of lines.slice(0, 3)) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(line, 94, y + 6);
        ctx.fillStyle = isSpaceTheme ? '#fde047' : '#ffffff';
        ctx.fillText(line, 88, y);
        y += 78;
      }

      // Subheadline & CTA Banner
      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 26px "DM Sans", sans-serif';
      ctx.fillText(subheadline.slice(0, 72), 88, y + 20);

      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(88, 635, W - 176, 74);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3;
      ctx.strokeRect(88, 635, W - 176, 74);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 25px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ctaText.slice(0, 62), W / 2, 673);

      // Top 3 Award Boxes
      const awardCards = [
        { label: prize1, bg: '#fef08a', border: '#eab308', text: '#713f12' },
        { label: prize2, bg: '#e2e8f0', border: '#94a3b8', text: '#0f172a' },
        { label: prize3, bg: '#fed7aa', border: '#ea580c', text: '#7c2d12' },
      ];
      const boxW = (W - 176 - 36) / 3;
      awardCards.forEach((card, i) => {
        const bx = 88 + i * (boxW + 18);
        const by = 735;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(bx + 6, by + 6, boxW, 155);
        ctx.fillStyle = card.bg;
        ctx.fillRect(bx, by, boxW, 155);
        ctx.strokeStyle = card.border;
        ctx.lineWidth = 4;
        ctx.strokeRect(bx, by, boxW, 155);

        ctx.fillStyle = card.border;
        ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`DERECE ${i + 1}`, bx + boxW / 2, by + 44);

        ctx.fillStyle = card.text;
        ctx.font = '800 23px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(card.label.slice(0, 22), bx + boxW / 2, by + 100);
      });

      // Score Threshold Bonus Strip
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(88, 910, W - 176, 56);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 3;
      ctx.strokeRect(88, 910, W - 176, 56);
      ctx.fillStyle = '#b91c1c';
      ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bonusThresholdText.slice(0, 62), W / 2, 940);

      // Info Card + QR Code Section
      const cardY = 988;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(88, cardY, W - 176, 420);
      ctx.strokeStyle = 'rgba(147, 197, 253, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(88, cardY, W - 176, 420);

      ctx.textAlign = 'left';
      const infoRows = [
        { k: 'TARİH & SAAT', v: examDateTime },
        { k: 'ADRES / KONUM', v: locationAddress },
        { k: 'KAYIT & İRTİBAT', v: `${phonePrimary}  |  ${phoneSecondary}` },
        { k: 'SINAV ÖZELLİKLERİ', v: `${cover.questionCount} Soru · ${cover.durationMinutes} Dk` },
      ];
      infoRows.forEach((item, idx) => {
        const ry = cardY + 58 + idx * 92;
        ctx.fillStyle = '#93c5fd';
        ctx.font = '700 18px "DM Sans", sans-serif';
        ctx.fillText(item.k, 130, ry);
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 27px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(item.v.slice(0, 44), 130, ry + 36);
      });

      // Scannable QR Code on Bottom-Right inside Info Card
      if (qrDataUrl) {
        await new Promise<void>((resolve) => {
          const qrImg = new Image();
          qrImg.onload = () => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(W - 355, cardY + 60, 220, 255);
            ctx.drawImage(qrImg, W - 340, cardY + 75, 190, 190);
            ctx.fillStyle = '#0f172a';
            ctx.textAlign = 'center';
            ctx.font = '800 16px "DM Sans", sans-serif';
            ctx.fillText('BAŞVURU QR KODU', W - 245, cardY + 292);
            resolve();
          };
          qrImg.onerror = () => resolve();
          qrImg.src = qrDataUrl;
        });
      }

      // Footer
      ctx.textAlign = 'left';
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '600 20px "DM Sans", sans-serif';
      ctx.fillText(footerNote, 88, H - 96);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fda4af';
      ctx.font = '700 19px "DM Sans", sans-serif';
      ctx.fillText(
        cover.isSampleDemo
          ? 'ÇOĞALTILAMAZ · ÖRNEK AFİŞ'
          : 'ÇOĞALTILAMAZ · RESMİ KURUM YAYINI',
        W - 88,
        H - 96
      );

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png')
      );
      triggerDownload(blob, `Dogruluk-Akademi-3D-Afis-${template}.png`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="surface-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">
            3 Boyutlu Profesyonel Akademi Afiş, Ödül & QR Başvuru Stüdyosu
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Ödüllü kamp afişleri, tarih/saat/adres ikonları ve okutulabilir Google Form başvuru QR koduyla yüksek çözünürlüklü afişler oluşturun.
          </p>
        </div>

        <button
          type="button"
          disabled={exporting}
          onClick={handleDownloadPosterPng}
          className="btn-3d px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>{exporting ? 'Afiş Oluşturuluyor...' : 'Yüksek Çözünürlüklü Afişi İndir (PNG)'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Controls */}
        <section className="lg:col-span-5 surface-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
            <h3 className="text-base font-bold">Afiş Tasarım Çeşidi & İçerik Editörü</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: 'esentepe-odullu' as const, label: 'Ödüllü Kamp' },
              { id: 'uzay-odullu' as const, label: 'Uzay & QR Afiş' },
              { id: 'deneme-kampi' as const, label: 'Deneme Duyuru' },
              { id: 'basari-onur' as const, label: 'Başarı Onur' },
              { id: 'akademi-tanitim' as const, label: 'Kurum Tanıtım' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyTemplate(item.id)}
                className={`px-2.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                  template === item.id ? 'btn-3d' : 'btn-3d-secondary'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>Ana Afiş Başlığı (3D Katmanlı)</span>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt"
            />
          </label>

          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>Alt Açıklama</span>
            <textarea
              rows={2}
              value={subheadline}
              onChange={(e) => setSubheadline(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Hedef Sınıf Bandı</span>
              <input
                type="text"
                value={targetGradesLabel}
                onChange={(e) => setTargetGradesLabel(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
              />
            </label>
            <label className="block text-xs font-semibold">
              <span style={{ color: 'var(--text-secondary)' }}>Son Kayıt Mühürü</span>
              <input
                type="text"
                value={deadlineBadge}
                onChange={(e) => setDeadlineBadge(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
              />
            </label>
          </div>

          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>Katılım Hediyesi / Vurgu Bandı</span>
            <input
              type="text"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm surface-alt"
            />
          </label>

          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>Puan Barajı & Ücretsiz Kurs Bandı</span>
            <input
              type="text"
              value={bonusThresholdText}
              onChange={(e) => setBonusThresholdText(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="block text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Trophy className="w-3 h-3 text-amber-500" aria-hidden="true" />
                <span>1. Ödül</span>
              </span>
              <input
                type="text"
                value={prize1}
                onChange={(e) => setPrize1(e.target.value)}
                className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-alt"
              />
            </label>
            <label className="block text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Trophy className="w-3 h-3 text-slate-400" aria-hidden="true" />
                <span>2. Ödül</span>
              </span>
              <input
                type="text"
                value={prize2}
                onChange={(e) => setPrize2(e.target.value)}
                className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-alt"
              />
            </label>
            <label className="block text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Trophy className="w-3 h-3 text-orange-500" aria-hidden="true" />
                <span>3. Ödül</span>
              </span>
              <input
                type="text"
                value={prize3}
                onChange={(e) => setPrize3(e.target.value)}
                className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs surface-alt"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="block text-xs font-semibold">
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tarih & Saat</span>
              </span>
              <input
                type="text"
                value={examDateTime}
                onChange={(e) => setExamDateTime(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
              />
            </label>
            <label className="block text-xs font-semibold">
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Adres / Konum</span>
              </span>
              <input
                type="text"
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="block text-xs font-semibold">
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Telefon 1</span>
              </span>
              <input
                type="text"
                value={phonePrimary}
                onChange={(e) => setPhonePrimary(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt font-mono-num"
              />
            </label>
            <label className="block text-xs font-semibold">
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Telefon 2</span>
              </span>
              <input
                type="text"
                value={phoneSecondary}
                onChange={(e) => setPhoneSecondary(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt font-mono-num"
              />
            </label>
          </div>

          <label className="block text-xs font-semibold">
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Google Form / Online Başvuru QR Linki</span>
            </span>
            <input
              type="url"
              value={qrTargetUrl}
              onChange={(e) => setQrTargetUrl(e.target.value)}
              placeholder="https://forms.gle/..."
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt font-mono-num"
            />
          </label>

          <label className="block text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>Alt İmza & Kurum Notu</span>
            <input
              type="text"
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs surface-alt"
            />
          </label>

          <div className="pt-2 border-t grid grid-cols-2 gap-4" style={{ borderColor: 'var(--border-subtle)' }}>
            <label className="text-xs flex flex-col gap-1">
              <span className="flex justify-between font-medium" style={{ color: 'var(--text-secondary)' }}>
                <span>3D Yatay Perspektif</span>
                <span className="font-mono-num">{tiltY}°</span>
              </span>
              <input
                type="range"
                min={-25}
                max={25}
                value={tiltY}
                onChange={(e) => setTiltY(Number(e.target.value))}
                className="w-full"
              />
            </label>
            <label className="text-xs flex flex-col gap-1">
              <span className="flex justify-between font-medium" style={{ color: 'var(--text-secondary)' }}>
                <span>3D Dikey Eğim</span>
                <span className="font-mono-num">{tiltX}°</span>
              </span>
              <input
                type="range"
                min={-15}
                max={15}
                value={tiltX}
                onChange={(e) => setTiltX(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </div>
        </section>

        {/* Right: 3D Perspective Poster Stage */}
        <section className="lg:col-span-7 surface-card rounded-xl p-5 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Rotate3D className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span className="text-sm font-bold">Canlı 3D Perspektif Afiş Sahnesi</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setTiltX(5);
                setTiltY(-8);
              }}
              className="btn-3d-secondary px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer"
            >
              Açıyı Sıfırla
            </button>
          </div>

          <div className="perspective-stage py-4 px-3 w-full flex justify-center">
            <div
              className="booklet-3d relative w-[350px] sm:w-[410px] min-h-[535px] rounded-2xl overflow-hidden shadow-2xl border border-white/20 text-white"
              style={{
                background: isBrightCampTheme
                  ? 'linear-gradient(180deg, #0284c7 0%, #0ea5e9 48%, #1e3a8a 100%)'
                  : isSpaceTheme
                    ? 'radial-gradient(circle at top right, #312e81 0%, #0f172a 55%, #020617 100%)'
                    : '#0f2747',
                transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
                boxShadow:
                  '18px 24px 48px rgba(15, 23, 42, 0.45), -2px -2px 0 rgba(255,255,255,0.18)',
              }}
            >
              {!isBrightCampTheme && !isSpaceTheme && (
                <>
                  <img
                    src={POSTER_BACKDROP_SRC}
                    alt="Doğruluk Akademi Mimari Afiş Zemini"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(10,22,46,0.9) 0%, rgba(15,39,71,0.58) 48%, rgba(7,15,32,0.94) 100%)',
                    }}
                  />
                </>
              )}

              {/* 3D Floating Poster Content */}
              <div
                className="relative z-10 h-full p-4 flex flex-col justify-between gap-2.5"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Top Header with 3D Logo */}
                <div className="flex items-center justify-between gap-2" style={{ transform: 'translateZ(20px)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Logo3D size="sm" interactive={false} variant={cover.logoStyleId} />
                    <div className="min-w-0">
                      <div className="font-display font-extrabold text-sm tracking-wide truncate">
                        {cover.academyName.toUpperCase()}
                      </div>
                      <div className="text-[10px] text-amber-200 font-semibold truncate">
                        {gradeProfile.shortLabel} · Kod: {cover.institutionCode8 || '48291045'}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded-md bg-rose-600 border border-amber-300 text-white text-[9.5px] font-extrabold shrink-0">
                    {deadlineBadge}
                  </span>
                </div>

                {/* Target Grades + 4 Motivation Pillars */}
                <div className="space-y-2" style={{ transform: 'translateZ(30px)' }}>
                  <div className="inline-block px-2.5 py-0.5 rounded bg-amber-300 text-slate-950 text-[10px] font-extrabold">
                    {targetGradesLabel}
                  </div>
                  <h3
                    className={`font-display font-extrabold text-xl sm:text-2xl leading-tight ${
                      isSpaceTheme ? 'text-amber-300' : 'text-white'
                    }`}
                    style={{ textShadow: '0 4px 12px rgba(0,0,0,0.55)' }}
                  >
                    {headline}
                  </h3>
                  <p className="text-xs text-slate-100 leading-snug">{subheadline}</p>
                  {isBrightCampTheme && (
                    <div className="grid grid-cols-4 gap-1 text-center">
                      {['Kendini Tanı', 'Hedefini Belirle', 'Geleceğe Hazırlan', 'Başarı Seninle'].map((pillar) => (
                        <div key={pillar} className="rounded bg-white/95 text-slate-900 px-1 py-1 text-[8.5px] font-extrabold leading-tight shadow-sm">
                          {pillar}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rounded-lg bg-rose-700/95 border border-amber-300/70 px-3 py-1.5 text-[11px] font-bold flex items-center gap-2">
                    <Gift className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
                    <span className="truncate">{ctaText}</span>
                  </div>
                </div>

                {/* Top 3 Prize Strip + Score Threshold Strip */}
                <div className="space-y-2" style={{ transform: 'translateZ(26px)' }}>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { rank: '1.', val: prize1, cls: 'bg-amber-200 text-amber-950 border-amber-400' },
                      { rank: '2.', val: prize2, cls: 'bg-slate-100 text-slate-900 border-slate-300' },
                      { rank: '3.', val: prize3, cls: 'bg-orange-200 text-orange-950 border-orange-400' },
                    ].map((p) => (
                      <div
                        key={p.rank}
                        className={`rounded-lg border-2 p-2 text-center shadow-md ${p.cls}`}
                      >
                        <div className="text-[10px] font-extrabold">{p.rank} DERECE</div>
                        <div className="text-[10px] font-bold leading-tight mt-0.5 line-clamp-2">
                          {p.val}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg bg-white text-rose-700 border-2 border-dashed border-rose-500 px-2.5 py-1 text-center text-[10px] font-extrabold shadow-sm">
                    {bonusThresholdText}
                  </div>
                </div>

                {/* Info Icons + Live Scannable QR Code */}
                <div
                  className="bg-slate-950/85 backdrop-blur-sm border border-white/20 rounded-xl p-3 flex items-center justify-between gap-3"
                  style={{ transform: 'translateZ(24px)' }}
                >
                  <div className="space-y-1.5 text-[11px] min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-blue-200">
                      <Clock className="w-3.5 h-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                      <span className="font-bold truncate">{examDateTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-200">
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
                      <span className="truncate">{locationAddress}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-100 font-mono-num">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-sky-300" aria-hidden="true" />
                      <span className="truncate">{phonePrimary} · {phoneSecondary}</span>
                    </div>
                  </div>

                  {/* Live Generated QR Image */}
                  <div className="bg-white rounded-lg p-1.5 shrink-0 text-center shadow-md">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="Online Sınav Başvuru QR Kodu"
                        className="w-16 h-16 block"
                      />
                    ) : (
                      <div className="w-16 h-16 flex items-center justify-center text-slate-900">
                        <QrCode className="w-8 h-8" aria-hidden="true" />
                      </div>
                    )}
                    <div className="text-[8px] font-extrabold text-slate-900 mt-0.5">
                      KAYIT QR
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-[10px] text-slate-300">
                  <span className="truncate">{footerNote}</span>
                  <span className="inline-flex items-center gap-1 font-bold text-rose-300 shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{cover.isSampleDemo ? 'Örnek Afiş' : 'Çoğaltılamaz'}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
