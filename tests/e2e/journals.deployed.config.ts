import { defineConfig, devices } from '@playwright/test'
// [B8/K6] 기존 배포 HTTPS만 사용한다. webServer 없이 실행하며 API는 시험별 fixture로 대체한다.
export default defineConfig({ testDir: '.', testMatch: 'journals.spec.ts', workers: 2, fullyParallel: true, retries: 0,
    reporter: [['list'], ['json', { outputFile: '.artifacts/implementation-f04-journal-browser/e2e.json' }]],
    use: { baseURL: 'https://atms.approid.team', trace: 'retain-on-failure' },
    projects: [{ name: 'deployed-chromium', use: { ...devices['Desktop Chrome'] } }],
})
