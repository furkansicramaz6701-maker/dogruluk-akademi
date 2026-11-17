import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAppWhatsAppShareHref,
  buildAppWhatsAppShareMessage,
  buildDesktopKitDownloadUrl,
  buildPhoneInstallUrl,
  detectDeviceInstallPlatform,
} from './appInstallShare';

test('buildPhoneInstallUrl appends ?install=1 cleanly without duplicating params', () => {
  assert.equal(
    buildPhoneInstallUrl('https://dogruluk.example.com'),
    'https://dogruluk.example.com/?install=1'
  );
  assert.equal(
    buildPhoneInstallUrl('https://dogruluk.example.com/?install=1'),
    'https://dogruluk.example.com/?install=1'
  );
  assert.equal(buildPhoneInstallUrl(''), '/?install=1');
});

test('buildDesktopKitDownloadUrl encodes appUrl query parameter', () => {
  assert.equal(
    buildDesktopKitDownloadUrl('https://dogruluk.example.com'),
    '/api/export/desktop-kit?appUrl=https%3A%2F%2Fdogruluk.example.com'
  );
});

test('detectDeviceInstallPlatform identifies iOS, Android, Desktop and WhatsApp in-app browser', () => {
  const waAndroid = detectDeviceInstallPlatform(
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 WhatsApp/2.24'
  );
  assert.equal(waAndroid.platform, 'android');
  assert.equal(waAndroid.isInAppBrowser, true);
  assert.equal(waAndroid.inAppLabel, 'WhatsApp');

  const iphoneSafari = detectDeviceInstallPlatform(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
  );
  assert.equal(iphoneSafari.platform, 'ios');
  assert.equal(iphoneSafari.isInAppBrowser, false);

  const desktopChrome = detectDeviceInstallPlatform(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36'
  );
  assert.equal(desktopChrome.platform, 'desktop');
  assert.equal(desktopChrome.isInAppBrowser, false);
});

test('buildAppWhatsAppShareMessage and href build valid Turkish WhatsApp app distribution link', () => {
  const msg = buildAppWhatsAppShareMessage({
    academyName: 'Doğruluk Akademi Merkez',
    installUrl: 'https://akademi.example.com',
    customNote: 'Kurum Kodumuz: 31570113',
  });
  assert.ok(msg.includes('Doğruluk Akademi Merkez'));
  assert.ok(msg.includes('https://akademi.example.com/?install=1'));
  assert.ok(msg.includes('Doğruluk Akademi ikonu'));
  assert.ok(msg.includes('Kurum Kodumuz: 31570113'));

  const href = buildAppWhatsAppShareHref('0505 226 92 58', msg);
  assert.ok(href.startsWith('https://wa.me/905052269258?text='));

  const openRecipientHref = buildAppWhatsAppShareHref('', msg);
  assert.ok(openRecipientHref.startsWith('https://wa.me/?text='));
});
