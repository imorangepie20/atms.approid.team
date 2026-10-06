import { defineConfig, devices } from '@playwright/test'

// [F05 A8] 배포된 같은 HTTPS 호스트의 화면/메뉴를 검사한다. 업무 응답은 시험별 fixture로 분리한다.
export default defineConfig({ testDir: '.', testMatch: 'approvals.spec.ts', workers: 2, fullyParallel: true, retries: 0,
    reporter: [['list'], ['json', { outputFile: '.artifacts/implementation-f05-approval-browser/deployed-e2e.json' }]],
    use: { baseURL: 'https://atms.approid.team', trace: 'retain-on-failure' },
    projects: [{ name: 'deployed-chromium', use: { ...devices['Desktop Chrome'] } }],
})
