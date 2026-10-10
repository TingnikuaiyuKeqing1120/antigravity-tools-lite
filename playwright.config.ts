import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './tests/ui',
    outputDir: 'test-results/auto-switch',
    timeout: 30000,
    fullyParallel: false,
    use: { baseURL: 'http://127.0.0.1:31420', viewport: { width: 1440, height: 1080 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 31420 --strictPort', url: 'http://127.0.0.1:31420', reuseExistingServer: false },
});
