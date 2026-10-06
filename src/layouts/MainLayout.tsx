import { useEffect, useState } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { X } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'

const MainLayout = () => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)

    useEffect(() => {
        const desktop = window.matchMedia('(min-width: 768px)')
        const closeOnDesktop = () => {
            if (desktop.matches) setMobileNavigationOpen(false)
        }
        desktop.addEventListener('change', closeOnDesktop)
        return () => desktop.removeEventListener('change', closeOnDesktop)
    }, [])

    return (
        <div className="min-h-screen bg-hud-bg-primary hud-grid-bg">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-hud-bg-secondary focus:px-4 focus:py-3 focus:text-hud-text-primary">본문으로 건너뛰기</a>
            {/* Sidebar */}
            <div className="hidden md:block">
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                />
            </div>
            <Dialog open={mobileNavigationOpen} onClose={setMobileNavigationOpen} className="relative z-50 md:hidden">
                <DialogBackdrop className="fixed inset-0 bg-black/60" />
                <DialogPanel className="fixed inset-y-0 left-0 w-64"
                    onClick={event => {
                        if ((event.target as HTMLElement).closest('a')) setMobileNavigationOpen(false)
                    }}>
                    <DialogTitle className="sr-only">탐색 메뉴</DialogTitle>
                    <Sidebar collapsed={false} onToggle={() => setMobileNavigationOpen(false)} />
                    <button type="button" aria-label="탐색 메뉴 닫기" onClick={() => setMobileNavigationOpen(false)}
                        className="absolute top-2 left-full ml-2 min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-hud-bg-secondary text-hud-text-primary z-[60] focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-text-primary">
                        <X size={20} aria-hidden="true" />
                    </button>
                </DialogPanel>
            </Dialog>

            {/* Main Content */}
            <div className={`transition-all duration-300 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
                {/* Header */}
                <Header onMenuToggle={() => {
                    if (window.matchMedia('(min-width: 768px)').matches) setSidebarCollapsed(!sidebarCollapsed)
                    else setMobileNavigationOpen(true)
                }} />

                {/* Page Content */}
                <main id="main-content" tabIndex={-1} className="p-4 sm:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}

export default MainLayout
