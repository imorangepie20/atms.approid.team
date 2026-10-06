import { BookOpenCheck, Building2, ChevronDown, ChevronRight, LayoutDashboard, Settings } from 'lucide-react'
import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

interface SidebarProps { collapsed: boolean; onToggle: () => void }
interface MenuItem { title: string; icon: ReactNode; path?: string; children?: { title: string; path: string }[] }

const menuItems: MenuItem[] = [
    { title: '대시보드', icon: <LayoutDashboard size={20} aria-hidden="true" />, path: '/' },
    { title: '회사 관리', icon: <Building2 size={20} aria-hidden="true" />, path: '/companies' },
    // [F01 본인 요청] 회사 소속이 없는 로그인 사용자도 진입할 수 있다.
    { title: '회사 접근 요청', icon: <Building2 size={20} aria-hidden="true" />, path: '/company-access' },
    { title: '회계·세무', icon: <BookOpenCheck size={20} aria-hidden="true" />, children: [
        { title: '규칙 적용 현황', path: '/accounting/rules' },
        // [F02 T1] 실제 서버와 연결한 거래처 화면으로 이동한다.
        { title: '거래처', path: '/accounting/counterparties' },
        // [F03 B1] 첫 증빙 업무 화면으로 이동한다. 공개 파일 URL은 메뉴에 만들지 않는다.
        { title: '증빙', path: '/accounting/evidence' },
        // [F04 B1] 승인된 계정과목 관리 화면이다. 회사 관리 권한은 화면/API에서 확인한다.
        { title: '계정과목', path: '/accounting/accounts' },
        // [F04 B1 메뉴 누락 수리] 승인된 초안 화면에 메뉴로 진입한다. 회사·권한은 화면/API에서 확인한다.
        { title: '전표 초안', path: '/accounting/journals' },
        // [F05 A3] 실제 승인 화면 진입점. 현재 위치는 기존 aria-current와 활성 스타일을 사용한다.
        { title: '전표 승인', path: '/accounting/approvals' },
    ] },
    { title: '설정', icon: <Settings size={20} aria-hidden="true" />, path: '/settings' },
]

const Sidebar = ({ collapsed }: SidebarProps) => {
    const location = useLocation()
    const [expandedMenus, setExpandedMenus] = useState<string[]>(['회계·세무'])
    const active = (path?: string) => path === location.pathname
    const parentActive = (item: MenuItem) => item.children?.some(child => active(child.path)) ?? false

    return (
        <aside aria-label="주요 탐색" className={`fixed top-0 left-0 h-full bg-hud-bg-secondary border-r border-hud-border-secondary z-50 transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'}`}>
            <div className="h-16 flex items-center justify-center border-b border-hud-border-secondary">
                <Link to="/" aria-label="ATMS 홈" className="flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                    <span aria-hidden="true" className="w-10 h-10 bg-gradient-to-br from-hud-accent-primary to-hud-accent-info rounded-lg grid place-items-center font-bold text-hud-bg-primary">A</span>
                    {!collapsed && <span className="font-semibold text-lg text-glow">ATMS</span>}
                </Link>
            </div>
            <nav className="py-4 overflow-y-auto h-[calc(100%-4rem)]">
                <ul className="space-y-1 px-3">
                    {menuItems.map(item => <li key={item.title}>
                        {item.children ? <>
                            <button type="button" aria-expanded={expandedMenus.includes(item.title)}
                                onClick={() => setExpandedMenus(current => current.includes(item.title) ? current.filter(value => value !== item.title) : [...current, item.title])}
                                className={`w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary ${parentActive(item) ? 'bg-hud-accent-primary/10 text-hud-accent-primary' : 'text-hud-text-secondary hover:bg-hud-bg-hover hover:text-hud-text-primary'}`}>
                                {item.icon}{!collapsed && <><span className="flex-1 text-left text-sm">{item.title}</span>{expandedMenus.includes(item.title) ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}</>}
                            </button>
                            {/* [F08 탐색 밀도 수리] 모바일 44px 조작 영역은 유지하고 데스크톱에서만 서브메뉴 높이와 간격을 줄인다. */}
                            {!collapsed && expandedMenus.includes(item.title) && <ul className="mt-0.5 ml-8 space-y-0.5">
                                {item.children.map(child => <li key={child.path}><Link to={child.path} aria-current={active(child.path) ? 'page' : undefined}
                                    className={`block min-h-11 px-3 py-3 md:min-h-9 md:py-2 rounded-lg text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary ${active(child.path) ? 'text-hud-accent-primary bg-hud-accent-primary/10' : 'text-hud-text-secondary hover:text-hud-text-primary hover:bg-hud-bg-hover'}`}>{child.title}</Link></li>)}
                            </ul>}
                        </> : <Link to={item.path!} aria-current={active(item.path) ? 'page' : undefined}
                            className={`min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary ${active(item.path) ? 'menu-active text-hud-accent-primary' : 'text-hud-text-secondary hover:bg-hud-bg-hover hover:text-hud-text-primary'}`}>
                            {item.icon}{!collapsed && <span className="text-sm">{item.title}</span>}
                        </Link>}
                    </li>)}
                </ul>
            </nav>
        </aside>
    )
}

export default Sidebar
