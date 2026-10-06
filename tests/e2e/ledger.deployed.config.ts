import { defineConfig, devices } from '@playwright/test'

// [F04 B8] 같은 HTTPS 정적 앱에서 메뉴·Router·반응형을 검증하고 업무 응답은 시험 fixture로 분리한다.
export default defineConfig({ testDir: '.', testMatch: 'ledger.spec.ts', workers: 2, fullyParallel: true, retries: 0,
    reporter: [['list'], ['json', { outputFile: '.artifacts/implementation-f04-ledger-browser/deployed-e2e.json' }]],
    use: { baseURL: 'https://atms.approid.team', trace: 'retain-on-failure' },
    projects: [{ name: 'deployed-chromium', use: { ...devices['Desktop Chrome'] } }],
})
