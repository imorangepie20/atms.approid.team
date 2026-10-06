import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
    plugins: [react(), {
        // [F03 PDF] worker는 Vite URL import로 묶고, 추가 디코딩 자원도 같은 출처에 보존한다.
        // 빌드 때만 복사한다. 외부 CDN 연결 없이 한글 CMap·표준 글꼴·WASM을 필요할 때 조회한다.
        name: 'local-pdf-resources', apply: 'build',
        writeBundle(options) {
            const target = join(options.dir ?? 'dist', 'assets/pdfjs/6.4.299')
            mkdirSync(target, { recursive: true })
            for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
                cpSync(fileURLToPath(new URL(`./node_modules/pdfjs-dist/${folder}`, import.meta.url)), join(target, folder), { recursive: true })
            }
        },
    }],
    build: {
        rollupOptions: { output: {
            // 기존 Nginx는 .js만 JavaScript MIME으로 제공한다. 모듈 worker도 .js로 출력해 정상 로드한다.
            assetFileNames: asset => asset.name?.endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
        } },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        host: '127.0.0.1',
        port: 4173,
        strictPort: true,
        watch: {
            ignored: ['**/.artifacts/**', '**/server/**', '**/infra/secrets/**', '**/playwright-report/**', '**/test-results/**'],
        },
        proxy: {
            '/api': { target: 'http://127.0.0.1:4300' },
        },
    },
})
