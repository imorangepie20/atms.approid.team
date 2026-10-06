import { defineConfig, devices } from '@playwright/test'

// [F03 V5] 기존 배포 주소만 사용한다. webServer가 없어 Vite/API와 새 로컬 포트를 시작하지 않는다.
// evidence.spec.ts의 모든 API는 fixture가 가로채므로 가상 오류 시험이 실제 운영 데이터를 변경하지 않는다.
export default defineConfig({
    testDir: '.', testMatch: 'evidence.spec.ts', fullyParallel: true, workers: 2, retries: 0,
    reporter: [['list'], ['json', { outputFile: '.artifacts/implementation-f03-evidence-preview/e2e.json' }]],
    use: { baseURL: 'https://atms.approid.team', trace: 'retain-on-failure' },
    projects: [{ name: 'deployed-chromium', use: { ...devices['Desktop Chrome'] } }],
})
