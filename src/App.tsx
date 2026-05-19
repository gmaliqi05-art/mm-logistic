import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

function lazyWithRetry<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await factory();
      } catch (err) {
        const isChunkError = err instanceof Error && /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(err.message);
        if (!isChunkError || attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    return factory();
  });
}
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { LanguageProvider } from './i18n';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SuperAdminLoginPage from './pages/SuperAdminLoginPage';
import RegisterPage from './pages/RegisterPage';
const LegalPage = lazy(() => import('./pages/LegalPage'));
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'));
const SecuritySettings = lazy(() => import('./pages/SecuritySettings'));
const AccountDeletion = lazy(() => import('./pages/AccountDeletion'));
import InstallPromptBanner from './components/InstallPromptBanner';
import PushAutoSubscribe from './components/PushAutoSubscribe';
import PushEnableBanner from './components/PushEnableBanner';

const SuperAdminLayout = lazy(() => import('./layouts/SuperAdminLayout'));
const CompanyAdminLayout = lazy(() => import('./layouts/CompanyAdminLayout'));
const EmailAutomationLayout = lazy(() => import('./layouts/EmailAutomationLayout'));
const DepotLayout = lazy(() => import('./layouts/DepotLayout'));
const DriverLayout = lazy(() => import('./layouts/DriverLayout'));
const AccountingLayout = lazy(() => import('./layouts/AccountingLayout'));
const LogisticsLayout = lazy(() => import('./layouts/LogisticsLayout'));

const SuperAdminDashboard = lazy(() => import('./pages/super-admin/Dashboard'));
const SuperAdminCompanies = lazy(() => import('./pages/super-admin/Companies'));
const SuperAdminUsers = lazy(() => import('./pages/super-admin/Users'));
const SuperAdminReports = lazy(() => import('./pages/super-admin/Reports'));
const SuperAdminSettings = lazy(() => import('./pages/super-admin/Settings'));
const SuperAdminChat = lazy(() => import('./pages/super-admin/Chat'));
const SuperAdminSubscriptionPlans = lazy(() => import('./pages/super-admin/SubscriptionPlans'));
const SuperAdminPaymentSettings = lazy(() => import('./pages/super-admin/PaymentSettings'));
const SuperAdminHomepage = lazy(() => import('./pages/super-admin/HomepageManager'));
const SuperAdminStaticPages = lazy(() => import('./pages/super-admin/StaticPages'));
const SuperAdminFooterSettings = lazy(() => import('./pages/super-admin/FooterSettings'));
const SuperAdminFooterLinks = lazy(() => import('./pages/super-admin/FooterLinks'));
const SuperAdminQRCodes = lazy(() => import('./pages/super-admin/QRCodes'));
const SuperAdminAppDownload = lazy(() => import('./pages/super-admin/AppDownload'));
const SuperAdminMetadataSeo = lazy(() => import('./pages/super-admin/MetadataSeo'));
const SuperAdminHomepageMap = lazy(() => import('./pages/super-admin/HomepageMap'));
const SuperAdminPwaSettings = lazy(() => import('./pages/super-admin/PwaSettings'));
const SuperAdminUserManual = lazy(() => import('./pages/super-admin/UserManual'));
const SuperAdminTestNotifications = lazy(() => import('./pages/super-admin/TestNotifications'));
const SuperAdminPushNotifications = lazy(() => import('./pages/super-admin/PushNotifications'));
const SuperAdminPlatformBranding = lazy(() => import('./pages/super-admin/PlatformBranding'));
const SuperAdminLegalPages = lazy(() => import('./pages/super-admin/LegalPages'));
const SuperAdminEmailTemplates = lazyWithRetry(() => import('./pages/super-admin/EmailTemplates'));
const SuperAdminEmailTemplateEditor = lazyWithRetry(() => import('./pages/super-admin/EmailTemplateEditor'));
const SuperAdminEmailCampaigns = lazyWithRetry(() => import('./pages/super-admin/EmailCampaigns'));
const SuperAdminEmailCampaignNew = lazyWithRetry(() => import('./pages/super-admin/EmailCampaignNew'));
const SuperAdminEmailCampaignDetail = lazyWithRetry(() => import('./pages/super-admin/EmailCampaignDetail'));
const SuperAdminEmailLog = lazyWithRetry(() => import('./pages/super-admin/EmailLog'));
const SuperAdminEmailSettings = lazyWithRetry(() => import('./pages/super-admin/EmailSettings'));

const CompanyDashboard = lazy(() => import('./pages/company/Dashboard'));
const CompanyDepots = lazy(() => import('./pages/company/Depots'));
const CompanyDrivers = lazy(() => import('./pages/company/Drivers'));
const CompanyStock = lazy(() => import('./pages/company/Stock'));
const CompanyCategories = lazy(() => import('./pages/company/Categories'));
const CompanyDeliveryNotes = lazy(() => import('./pages/company/DeliveryNotes'));
const CompanyReports = lazy(() => import('./pages/company/Reports'));
const CompanyRepairReports = lazy(() => import('./pages/company/RepairReports'));
const CompanyWorkerRepairStats = lazy(() => import('./pages/company/WorkerRepairStats'));
const CompanyChat = lazy(() => import('./pages/company/Chat'));
const CompanyDocuments = lazy(() => import('./pages/company/Documents'));
const CompanyAuditLog = lazy(() => import('./pages/company/AuditLog'));
const CompanyAuditReport = lazy(() => import('./pages/company/AuditReport'));
const CompanyStockAlerts = lazy(() => import('./pages/company/StockAlerts'));
const CompanyDataExport = lazy(() => import('./pages/company/DataExport'));
const CompanySettings = lazy(() => import('./pages/company/Settings'));
const CompanyApiWebhooks = lazy(() => import('./pages/company/ApiWebhooks'));
const CompanyOverdueDocuments = lazy(() => import('./pages/company/OverdueDocuments'));
const CompanyPartners = lazy(() => import('./pages/company/Partners'));
const CompanyPartnerDetail = lazy(() => import('./pages/company/PartnerDetail'));
const CompanyPartnerFlows = lazy(() => import('./pages/company/PartnerFlows'));
const CompanyReview = lazy(() => import('./pages/company/Review'));
const CompanyVehicles = lazy(() => import('./pages/company/Vehicles'));
const CompanyTrailers = lazy(() => import('./pages/company/Trailers'));
const CompanyVehicleDetail = lazy(() => import('./pages/company/VehicleDetail'));
const CompanyDriverDetail = lazy(() => import('./pages/company/DriverDetail'));
const CompanyDriverReports = lazy(() => import('./pages/company/DriverReports'));
const CompanyCompliance = lazy(() => import('./pages/company/Compliance'));
const CompanyFleetScans = lazy(() => import('./pages/company/FleetScans'));
const CompanyFinancialSummary = lazy(() => import('./pages/company/FinancialSummary'));
const CompanyAccountingUpgrade = lazy(() => import('./pages/company/AccountingUpgrade'));
const CompanyEmailTemplatesList = lazy(() => import('./pages/company/EmailTemplatesList'));
const CompanyEmailTemplateEditor = lazy(() => import('./pages/company/EmailTemplateEditor'));
const CompanyEmailBranding = lazy(() => import('./pages/company/EmailBranding'));
const CompanyEmailLog = lazy(() => import('./pages/company/EmailLog'));
const CompanyManualEmail = lazy(() => import('./pages/company/ManualEmail'));
const CompanyClientPricesPage = lazy(() => import('./pages/company/ClientPricesPage'));
const CompanyAutomationRules = lazy(() => import('./pages/company/AutomationRules'));
const AccountingRoute = lazy(() => import('./components/subscription/AccountingRoute'));

const DepotDashboard = lazy(() => import('./pages/depot/Dashboard'));
const DepotStock = lazy(() => import('./pages/depot/Stock'));
const DepotReceiving = lazy(() => import('./pages/depot/Receiving'));
const DepotSorting = lazy(() => import('./pages/depot/Sorting'));
const DepotRepairs = lazy(() => import('./pages/depot/Repairs'));
const DepotRepairWorkers = lazy(() => import('./pages/depot/RepairWorkers'));
const WorkerRepairEntry = lazy(() => import('./pages/depot/WorkerRepairEntry'));
const DepotDeliveryNotes = lazy(() => import('./pages/depot/DeliveryNotes'));
const DepotChat = lazy(() => import('./pages/depot/Chat'));
const DepotDocuments = lazy(() => import('./pages/depot/Documents'));
const DepotReports = lazy(() => import('./pages/depot/Reports'));
const DepotTrailers = lazy(() => import('./pages/depot/Trailers'));
const DepotSettings = lazy(() => import('./pages/depot/Settings'));

const DriverDashboard = lazy(() => import('./pages/driver/Dashboard'));
const DriverChat = lazy(() => import('./pages/driver/Chat'));
const DriverDocuments = lazy(() => import('./pages/driver/Documents'));
const DriverMyDocuments = lazy(() => import('./pages/driver/MyDocuments'));
const DriverOverdue = lazy(() => import('./pages/driver/Overdue'));
const DriverSettings = lazy(() => import('./pages/driver/Settings'));
const DriverTracking = lazy(() => import('./pages/driver/Tracking'));
const DriverRoutePlanner = lazy(() => import('./pages/driver/RoutePlanner'));
const DriverNavigation = lazy(() => import('./pages/driver/Navigation'));
const DriverTrailers = lazy(() => import('./pages/driver/Trailers'));
const CompanyRoutePlanner = lazy(() => import('./pages/company/RoutePlanner'));
const CompanyFleetReports = lazy(() => import('./pages/company/FleetReports'));
const CompanySortingReports = lazy(() => import('./pages/company/SortingReports'));
const LogisticsLiveMap = lazy(() => import('./pages/logistics/LiveMap'));
const CompanyAutomjetet = lazy(() => import('./pages/company/Automjetet'));
const CompanyLiveMapWithPlanner = lazy(() => import('./pages/company/LiveMapWithPlanner'));
const CompanyPalletAccounts = lazy(() => import('./pages/company/PalletAccounts'));
const CompanyPalletAccountDetail = lazy(() => import('./pages/company/PalletAccountDetail'));

const AccDashboard = lazy(() => import('./pages/accounting/Dashboard'));
const AccContacts = lazy(() => import('./pages/accounting/Contacts'));
const AccProducts = lazy(() => import('./pages/accounting/Products'));
const AccProductDetail = lazy(() => import('./pages/accounting/ProductDetail'));
const AccInvoices = lazy(() => import('./pages/accounting/Invoices'));
const AccInvoicePrint = lazy(() => import('./pages/accounting/InvoicePrint'));
const AccPurchases = lazy(() => import('./pages/accounting/Purchases'));
const AccStock = lazy(() => import('./pages/accounting/Stock'));
const AccDeliveryNotes = lazy(() => import('./pages/accounting/AccDeliveryNotes'));
const AccTransactions = lazy(() => import('./pages/accounting/Transactions'));
const AccExpenseCategories = lazy(() => import('./pages/accounting/ExpenseCategories'));
const AccBankAccounts = lazy(() => import('./pages/accounting/BankAccounts'));
const AccBankReconciliation = lazy(() => import('./pages/accounting/BankReconciliation'));
const AccReports = lazy(() => import('./pages/accounting/Reports'));
const AccSettings = lazy(() => import('./pages/accounting/AccSettings'));
const AccDatevExport = lazy(() => import('./pages/accounting/DatevExport'));
const AccTestExport = lazy(() => import('./pages/accounting/TestExport'));
const AccFixedAssets = lazy(() => import('./pages/accounting/FixedAssets'));
const AccScans = lazy(() => import('./pages/accounting/Scans'));
const AccClientInvoices = lazy(() => import('./pages/accounting/ClientInvoices'));
const AccGermanFinancials = lazy(() => import('./pages/accounting/GermanFinancials'));
const AccImports = lazy(() => import('./pages/accounting/Imports'));
const AccChartOfAccounts = lazy(() => import('./pages/accounting/ChartOfAccounts'));
const AccInvoiceBuilder = lazy(() => import('./pages/accounting/InvoiceBuilder'));

const HRMyLeave = lazy(() => import('./pages/hr/MyLeave'));
const HRMyAttendance = lazy(() => import('./pages/hr/MyAttendance'));
const HRMyWorkHours = lazy(() => import('./pages/hr/MyWorkHours'));
const HRDashboard = lazy(() => import('./pages/company/HR/HRDashboard'));
const HRLeaveRequests = lazy(() => import('./pages/company/HR/LeaveRequests'));
const HRAttendance = lazy(() => import('./pages/company/HR/HRAttendance'));
const HRWorkHours = lazy(() => import('./pages/company/HR/HRWorkHours'));
const HRReports = lazy(() => import('./pages/company/HR/HRReports'));
const HRSettings = lazy(() => import('./pages/company/HR/HRSettings'));

const LogisticsDashboard = lazy(() => import('./pages/logistics/Dashboard'));
const LogisticsDispatch = lazy(() => import('./pages/logistics/Dispatch'));
const LogisticsActive = lazy(() => import('./pages/logistics/Active'));
const LogisticsDrivers = lazy(() => import('./pages/logistics/Drivers'));

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
    </div>
  );
}

function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(profile.role)) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/sa-access" element={<SuperAdminLoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/privacy-policy" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/legal" element={<LegalPage documentKey="impressum" />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
        <Route path="/settings/security" element={
          <ProtectedRoute>
            <SecuritySettings />
          </ProtectedRoute>
        } />
        <Route path="/settings/account" element={
          <ProtectedRoute>
            <AccountDeletion />
          </ProtectedRoute>
        } />

        <Route path="/super-admin" element={
          <ProtectedRoute roles={['super_admin']}>
            <SuperAdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={<SuperAdminDashboard />} />
          <Route path="companies" element={<SuperAdminCompanies />} />
          <Route path="plans" element={<SuperAdminSubscriptionPlans />} />
          <Route path="reports" element={<SuperAdminReports />} />
          <Route path="payment-settings" element={<SuperAdminPaymentSettings />} />
          <Route path="homepage" element={<SuperAdminHomepage />} />
          <Route path="users" element={<SuperAdminUsers />} />
          <Route path="settings" element={<SuperAdminSettings />} />
          <Route path="branding" element={<SuperAdminPlatformBranding />} />
          <Route path="chat" element={<SuperAdminChat />} />
          <Route path="static-pages" element={<SuperAdminStaticPages />} />
          <Route path="legal-pages" element={<SuperAdminLegalPages />} />
          <Route path="footer-settings" element={<SuperAdminFooterSettings />} />
          <Route path="footer-links" element={<SuperAdminFooterLinks />} />
          <Route path="qr-codes" element={<SuperAdminQRCodes />} />
          <Route path="app-download" element={<SuperAdminAppDownload />} />
          <Route path="metadata-seo" element={<SuperAdminMetadataSeo />} />
          <Route path="homepage-map" element={<SuperAdminHomepageMap />} />
          <Route path="pwa-settings" element={<SuperAdminPwaSettings />} />
          <Route path="user-manual" element={<SuperAdminUserManual />} />
          <Route path="test-notifications" element={<SuperAdminTestNotifications />} />
          <Route path="push-notifications" element={<SuperAdminPushNotifications />} />
          <Route path="email/templates" element={<SuperAdminEmailTemplates />} />
          <Route path="email/templates/new" element={<SuperAdminEmailTemplateEditor />} />
          <Route path="email/templates/:code" element={<SuperAdminEmailTemplateEditor />} />
          <Route path="email/campaigns" element={<SuperAdminEmailCampaigns />} />
          <Route path="email/campaigns/new" element={<SuperAdminEmailCampaignNew />} />
          <Route path="email/campaigns/:id" element={<SuperAdminEmailCampaignDetail />} />
          <Route path="email/log" element={<SuperAdminEmailLog />} />
          <Route path="email/settings" element={<SuperAdminEmailSettings />} />
        </Route>

        <Route path="/company" element={
          <ProtectedRoute roles={['company_admin']}>
            <CompanyAdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={<CompanyDashboard />} />
          <Route path="depots" element={<CompanyDepots />} />
          <Route path="drivers" element={<CompanyDrivers />} />
          <Route path="drivers/:id" element={<CompanyDriverDetail />} />
          <Route path="drivers/:id/reports" element={<CompanyDriverReports />} />
          <Route path="vehicles" element={<CompanyVehicles />} />
          <Route path="trailers" element={<CompanyTrailers />} />
          <Route path="vehicles/:id" element={<CompanyVehicleDetail />} />
          <Route path="compliance" element={<CompanyCompliance />} />
          <Route path="fleet-scans" element={<CompanyFleetScans />} />
          <Route path="stock" element={<CompanyStock />} />
          <Route path="categories" element={<CompanyCategories />} />
          <Route path="documents" element={<CompanyDocuments />} />
          <Route path="delivery-notes" element={<CompanyDeliveryNotes />} />
          <Route path="review" element={<CompanyReview />} />
          <Route path="overdue" element={<CompanyOverdueDocuments />} />
          <Route path="partners" element={<CompanyPartners />} />
          <Route path="partners/:id" element={<CompanyPartnerDetail />} />
          <Route path="partner-flows" element={<CompanyPartnerFlows />} />
          <Route path="pallet-accounts" element={<CompanyPalletAccounts />} />
          <Route path="pallet-accounts/:id" element={<CompanyPalletAccountDetail />} />
          <Route path="live-map" element={<CompanyLiveMapWithPlanner />} />
          <Route path="route-planner" element={<CompanyRoutePlanner />} />
          <Route path="automjetet" element={<CompanyAutomjetet />} />
          <Route path="fleet-reports" element={<CompanyFleetReports />} />
          <Route path="reports" element={<CompanyReports />} />
          <Route path="sorting" element={<DepotSorting />} />
          <Route path="sorting-reports" element={<CompanySortingReports />} />
          <Route path="repair-reports" element={<CompanyRepairReports />} />
          <Route path="worker-repair-stats" element={<CompanyWorkerRepairStats />} />
          <Route path="chat" element={<CompanyChat />} />
          <Route path="audit-log" element={<CompanyAuditLog />} />
          <Route path="audit-report" element={<CompanyAuditReport />} />
          <Route path="stock-alerts" element={<CompanyStockAlerts />} />
          <Route path="data-export" element={<CompanyDataExport />} />
          <Route path="settings" element={<CompanySettings />} />
          <Route path="settings/api-webhooks" element={<CompanyApiWebhooks />} />
          <Route path="financial-summary" element={<CompanyFinancialSummary />} />
          <Route path="hr" element={<HRDashboard />} />
          <Route path="hr/requests" element={<HRLeaveRequests />} />
          <Route path="hr/attendance" element={<HRAttendance />} />
          <Route path="hr/work-hours" element={<HRWorkHours />} />
          <Route path="hr/reports" element={<HRReports />} />
          <Route path="hr/settings" element={<HRSettings />} />
          <Route path="hr/leave" element={<HRMyLeave />} />
          <Route path="accounting-upgrade" element={<CompanyAccountingUpgrade />} />
          <Route path="invoices" element={<AccInvoices />} />
          <Route path="invoices/new" element={<AccInvoiceBuilder />} />
          <Route path="invoices/:id/edit" element={<AccInvoiceBuilder />} />
          <Route path="invoices/:id/print" element={<AccInvoicePrint />} />
          <Route path="email" element={<EmailAutomationLayout />}>
            <Route index element={<CompanyEmailTemplatesList />} />
            <Route path="templates" element={<CompanyEmailTemplatesList />} />
            <Route path="templates/new" element={<CompanyEmailTemplateEditor />} />
            <Route path="templates/:code" element={<CompanyEmailTemplateEditor />} />
            <Route path="branding" element={<CompanyEmailBranding />} />
            <Route path="automation" element={<CompanyAutomationRules />} />
            <Route path="send" element={<CompanyManualEmail />} />
            <Route path="log" element={<CompanyEmailLog />} />
          </Route>
          <Route path="client-prices" element={<CompanyClientPricesPage />} />
        </Route>

        <Route path="/depot" element={
          <ProtectedRoute roles={['depot_worker']}>
            <DepotLayout />
          </ProtectedRoute>
        }>
          <Route index element={<DepotDashboard />} />
          <Route path="stock" element={<DepotStock />} />
          <Route path="receiving" element={<DepotReceiving />} />
          <Route path="sorting" element={<DepotSorting />} />
          <Route path="delivery-notes" element={<DepotDeliveryNotes />} />
          <Route path="trailers" element={<DepotTrailers />} />
          <Route path="repairs" element={<DepotRepairs />} />
          <Route path="repair-workers" element={<DepotRepairWorkers />} />
          <Route path="repair-workers/:workerId" element={<WorkerRepairEntry />} />
          <Route path="documents" element={<DepotDocuments />} />
          <Route path="reports" element={<DepotReports />} />
          <Route path="leave" element={<HRMyLeave />} />
          <Route path="attendance" element={<HRMyAttendance />} />
          <Route path="work-hours" element={<HRMyWorkHours />} />
          <Route path="chat" element={<DepotChat />} />
          <Route path="settings" element={<DepotSettings />} />
        </Route>

        <Route path="/driver" element={
          <ProtectedRoute roles={['driver']}>
            <DriverLayout />
          </ProtectedRoute>
        }>
          <Route index element={<DriverDashboard />} />
          <Route path="tracking" element={<DriverTracking />} />
          <Route path="trailers" element={<DriverTrailers />} />
          <Route path="route-planner" element={<DriverRoutePlanner />} />
          <Route path="navigation" element={<DriverNavigation />} />
          <Route path="overdue" element={<DriverOverdue />} />
          <Route path="documents" element={<DriverDocuments />} />
          <Route path="my-documents" element={<DriverMyDocuments />} />
          <Route path="chat" element={<DriverChat />} />
          <Route path="leave" element={<HRMyLeave />} />
          <Route path="attendance" element={<HRMyAttendance />} />
          <Route path="work-hours" element={<HRMyWorkHours />} />
          <Route path="settings" element={<DriverSettings />} />
        </Route>

        <Route path="/accounting" element={
          <AccountingRoute>
            <AccountingLayout />
          </AccountingRoute>
        }>
          <Route index element={<AccDashboard />} />
          <Route path="contacts" element={<AccContacts />} />
          <Route path="clients" element={<AccClientInvoices />} />
          <Route path="products" element={<AccProducts />} />
          <Route path="products/:id" element={<AccProductDetail />} />
          <Route path="invoices" element={<AccInvoices />} />
          <Route path="invoices/new" element={<AccInvoiceBuilder />} />
          <Route path="invoices/:id/edit" element={<AccInvoiceBuilder />} />
          <Route path="invoices/:id/print" element={<AccInvoicePrint />} />
          <Route path="purchases" element={<AccPurchases />} />
          <Route path="stock" element={<AccStock />} />
          <Route path="deliveries" element={<AccDeliveryNotes />} />
          <Route path="transactions" element={<AccTransactions />} />
          <Route path="expenses" element={<AccExpenseCategories />} />
          <Route path="bank-accounts" element={<AccBankAccounts />} />
          <Route path="bank-reconciliation" element={<AccBankReconciliation />} />
          <Route path="reports" element={<AccReports />} />
          <Route path="financials" element={<AccGermanFinancials />} />
          <Route path="imports" element={<AccImports />} />
          <Route path="coa" element={<AccChartOfAccounts />} />
          <Route path="assets" element={<AccFixedAssets />} />
          <Route path="scans" element={<AccScans />} />
          <Route path="settings" element={<AccSettings />} />
          <Route path="datev-export" element={<AccDatevExport />} />
          <Route path="test-export" element={<AccTestExport />} />
        </Route>

        <Route path="/logistics" element={
          <ProtectedRoute roles={['logistics_admin', 'company_admin']}>
            <LogisticsLayout />
          </ProtectedRoute>
        }>
          <Route index element={<LogisticsDashboard />} />
          <Route path="dispatch" element={<LogisticsDispatch />} />
          <Route path="active" element={<LogisticsActive />} />
          <Route path="live-map" element={<LogisticsLiveMap />} />
          <Route path="drivers" element={<LogisticsDrivers />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <AppRoutes />
            <PushAutoSubscribe />
            <PushEnableBanner />
            <InstallPromptBanner />
          </SubscriptionProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
