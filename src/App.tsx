import { BrowserRouter as Router, Navigate, Outlet, Routes, Route, useLocation } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import { useAuth } from './context/AuthContext'
import RuleApplications from './pages/accounting/RuleApplications'
import Counterparties from './pages/accounting/Counterparties'
import Evidence from './pages/accounting/Evidence'
import Accounts from './pages/accounting/Accounts'
import Journals from './pages/accounting/Journals'
import Approvals from './pages/accounting/Approvals'
import CompanyManagement from './pages/companies/CompanyManagement'
import AcceptCompanyInvitation from './pages/companies/AcceptCompanyInvitation'
import CompanyAccessRequests from './pages/companies/CompanyAccessRequests'

// Dashboard
import Dashboard from './pages/dashboard/Dashboard'
import Analytics from './pages/dashboard/Analytics'

// Email
import EmailInbox from './pages/email/EmailInbox'
import EmailCompose from './pages/email/EmailCompose'
import EmailDetail from './pages/email/EmailDetail'

// Core Pages
import Widgets from './pages/Widgets'
import Profile from './pages/Profile'
import Calendar from './pages/Calendar'
import Settings from './pages/Settings'
import ScrumBoard from './pages/ScrumBoard'
import Products from './pages/Products'
import Pricing from './pages/Pricing'
import Gallery from './pages/Gallery'

// Auth
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
// [F01 공개 계정 경로 추가] 페이지 import가 계정 fragment를 Router 생성 전에 캡처한다.
import VerifyEmail from './pages/auth/VerifyEmail'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'

// AI Studio
import AiChat from './pages/ai/AiChat'
import AiImageGenerator from './pages/ai/AiImageGenerator'

// POS System
import PosCustomerOrder from './pages/pos/PosCustomerOrder'
import PosKitchenOrder from './pages/pos/PosKitchenOrder'
import PosCounterCheckout from './pages/pos/PosCounterCheckout'
import PosTableBooking from './pages/pos/PosTableBooking'
import PosMenuStock from './pages/pos/PosMenuStock'

// UI Components
import UiBootstrap from './pages/ui/UiBootstrap'
import UiButtons from './pages/ui/UiButtons'
import UiCard from './pages/ui/UiCard'
import UiIcons from './pages/ui/UiIcons'
import UiModalNotification from './pages/ui/UiModalNotification'
import UiTypography from './pages/ui/UiTypography'
import UiTabsAccordions from './pages/ui/UiTabsAccordions'

// Forms
import FormElements from './pages/forms/FormElements'
import FormPlugins from './pages/forms/FormPlugins'
import FormWizards from './pages/forms/FormWizards'

// Tables
import TableElements from './pages/tables/TableElements'
import TablePlugins from './pages/tables/TablePlugins'

// Charts
import ChartJs from './pages/charts/ChartJs'

// Misc Pages
import Error404 from './pages/Error404'
import ComingSoon from './pages/ComingSoon'

function RequireSession() {
    const { status } = useAuth()
    const location = useLocation()
    if (status === 'loading') return <div className="min-h-screen bg-hud-bg-primary text-hud-text-primary grid place-items-center" role="status" aria-live="polite">세션을 확인하고 있습니다.</div>
    if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
    return <Outlet />
}

function App() {
    return (
        <Router>
            <Routes>
                {/* Auth Pages (No Layout) */}
                <Route path="/login" element={<Login />} />
                {/* [F01 본인 접근] 초대 화면이 직접 로그인하므로 fragment를 일반 redirect에 전달하지 않는다. */}
                <Route path="/accept-company-invitation" element={<AcceptCompanyInvitation />} />
                <Route path="/register" element={<Register />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/coming-soon" element={<ComingSoon />} />
                <Route path="/404" element={<Error404 />} />

                {/* [F08-09 추가] 실제 업무 화면은 서버 세션 복원이 끝난 뒤에만 표시한다. */}
                <Route element={<RequireSession />}>
                <Route path="/" element={<MainLayout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="companies" element={<CompanyManagement />} />
                    <Route path="company-access" element={<CompanyAccessRequests />} />
                    <Route path="accounting/rules" element={<RuleApplications />} />
                    {/* [F02 T1] 기존 세션 보호 아래의 회사별 거래처 업무 화면이다. */}
                    <Route path="accounting/counterparties" element={<Counterparties />} />
                    {/* [F03 B1] 증빙도 기존 세션 보호·공통 레이아웃 안에서만 열며 회사 권한은 페이지/API가 다시 확인한다. */}
                    <Route path="accounting/evidence" element={<Evidence />} />
                    {/* [F04 B1] 기존 세션 보호 아래 회사별 계정과목 화면을 연결한다. */}
                    <Route path="accounting/accounts" element={<Accounts />} />
                    {/* [B1] 기존 세션 보호 안에서 전표 페이지가 현재 회사 권한을 확인한다. */}
                    <Route path="accounting/journals" element={<Journals />} />
                    {/* [F05 A3] 승인 목록·이력은 같은 세션 경계 안에서 회사 권한을 재확인한다. */}
                    <Route path="accounting/approvals" element={<Approvals />} />

                    {/* Email */}
                    <Route path="email/inbox" element={<EmailInbox />} />
                    <Route path="email/compose" element={<EmailCompose />} />
                    <Route path="email/detail/:id" element={<EmailDetail />} />

                    {/* Core Pages */}
                    <Route path="widgets" element={<Widgets />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="calendar" element={<Calendar />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="scrum-board" element={<ScrumBoard />} />
                    <Route path="products" element={<Products />} />
                    <Route path="pricing" element={<Pricing />} />
                    <Route path="gallery" element={<Gallery />} />

                    {/* AI Studio */}
                    <Route path="ai/chat" element={<AiChat />} />
                    <Route path="ai/image-generator" element={<AiImageGenerator />} />

                    {/* POS System */}
                    <Route path="pos/customer-order" element={<PosCustomerOrder />} />
                    <Route path="pos/kitchen-order" element={<PosKitchenOrder />} />
                    <Route path="pos/counter-checkout" element={<PosCounterCheckout />} />
                    <Route path="pos/table-booking" element={<PosTableBooking />} />
                    <Route path="pos/menu-stock" element={<PosMenuStock />} />

                    {/* UI Components */}
                    <Route path="ui/bootstrap" element={<UiBootstrap />} />
                    <Route path="ui/buttons" element={<UiButtons />} />
                    <Route path="ui/card" element={<UiCard />} />
                    <Route path="ui/icons" element={<UiIcons />} />
                    <Route path="ui/modal-notification" element={<UiModalNotification />} />
                    <Route path="ui/typography" element={<UiTypography />} />
                    <Route path="ui/tabs-accordions" element={<UiTabsAccordions />} />

                    {/* Forms */}
                    <Route path="form/elements" element={<FormElements />} />
                    <Route path="form/plugins" element={<FormPlugins />} />
                    <Route path="form/wizards" element={<FormWizards />} />

                    {/* Tables */}
                    <Route path="table/elements" element={<TableElements />} />
                    <Route path="table/plugins" element={<TablePlugins />} />

                    {/* Charts */}
                    <Route path="chart/chartjs" element={<ChartJs />} />
                </Route>
                </Route>

                {/* 404 Fallback */}
                <Route path="*" element={<Error404 />} />
            </Routes>
        </Router>
    )
}

export default App
