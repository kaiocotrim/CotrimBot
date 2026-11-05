import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/**', route => route.fulfill({ json: null }));
});

test('desktop browser downloads the Windows installer from MediaFire', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/login/');
  const link = page.getByRole('link', { name: 'Baixar para Windows (.exe)' });
  await expect(link).toBeVisible();
  await page.route('https://download1478.mediafire.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/octet-stream',
    headers: { 'content-disposition': 'attachment; filename="CotrimBot-Setup-1.1.0-x64.exe"' },
    body: 'installer fixture',
  }));
  const download = page.waitForEvent('download');
  await link.click();
  const installer = await download;
  expect(installer.url()).toBe('https://download1478.mediafire.com/0yxpdfo7iowgUi4BRIe8WVQGyuSbt9jo6Pu4QXjBSCoxxU_94fFdYlNybflcVAfXLirA0alCAITlTo5G8OU5iylPrb5n4A57Uzfih-OMctadVxG4SfPBBxohMYXfA5PsDcm9GEdrOSag3Obhuo_XZ1cNcD29Rlk-OVctKZwdbeHPBPw/00xqgjw0cxjhsc1/CotrimBot-Setup-1.1.0-x64.exe');
  expect(installer.suggestedFilename()).toBe('CotrimBot-Setup-1.1.0-x64.exe');
});

test('mobile viewport hides the Windows download', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login/');
  await expect(page.locator('main')).toHaveAttribute('data-intro-complete', 'true');
  await expect(page.getByRole('link', { name: 'Baixar para Windows (.exe)' })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('mobile-login.png'), animations: 'disabled' });
});

for (const [name, userAgent] of [
  ['Electron', 'Mozilla/5.0 Chrome/148.0 Electron/45.2.1 CotrimBotDesktop/1.1'],
  ['mobile device with a wide viewport', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/148.0 Mobile Safari/537.36'],
]) {
  test.describe(name, () => {
    test.use({ userAgent, viewport: { width: 1280, height: 900 } });
    test('never renders the Windows download', async ({ page }) => {
      await page.goto('/login/');
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Baixar para Windows (.exe)' })).toHaveCount(0);
    });
  });
}
