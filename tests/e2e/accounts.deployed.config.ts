import { defineConfig, devices } from '@playwright/test'

// [F04 B7] 배포 HTTPS만 대상으로 한다. webServer가 없으므로 새 개발 포트를 시작하지 않는다.
export default defineConfig({
    testDir: '.', testMatch: 'accounts.spec.ts', fullyParallel: true, workers: 2, retries: 0,
    reporter: [['list'], ['json', { outputFile: '.artifacts/implementation-f04-accounts-browser/e2e.json' }]],
    use: { baseURL: 'https://atms.approid.team', trace: 'retain-on-failure' },
    projects: [{ name: 'deployed-chromium', use: { ...devices['Desktop Chrome'] } }],
})
