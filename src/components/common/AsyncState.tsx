import { AlertTriangle, Inbox, Loader2, RotateCcw } from 'lucide-react'
import Button from './Button'

interface AsyncStateProps {
    kind: 'loading' | 'empty' | 'error'
    title: string
    description: string
    onRetry?: () => void
}

// [F08-14 추가] 동적 조회 상태를 같은 크기의 영역에 표시해 화면 이동을 줄이고 상태 변화를 보조기기에 알린다.
export default function AsyncState({ kind, title, description, onRetry }: AsyncStateProps) {
    const Icon = kind === 'loading' ? Loader2 : kind === 'error' ? AlertTriangle : Inbox
    return (
        <section role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'} aria-busy={kind === 'loading'}
            className="hud-card rounded-xl min-h-64 grid place-items-center p-8 text-center">
            <div className="max-w-md">
                <Icon aria-hidden="true" size={36} className={`mx-auto mb-4 ${kind === 'error' ? 'text-hud-accent-danger' : 'text-hud-accent-primary'} ${kind === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''}`} />
                <h2 className="text-lg font-semibold text-hud-text-primary">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-hud-text-muted">{description}</p>
                {onRetry && <Button type="button" variant="outline" onClick={onRetry} leftIcon={<RotateCcw size={16} aria-hidden="true" />}
                    className="mt-5 min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">다시 시도</Button>}
            </div>
        </section>
    )
}
