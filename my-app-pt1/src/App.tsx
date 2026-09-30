import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Home from './pages/Home';
import Docs from './pages/Docs';

// Everything behind login is lazy-loaded so the landing page doesn't have to
// download Syncfusion / Yjs / recharts before it can render.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ToolsPage = lazy(() => import('./pages/ToolsPage'));
const FAQuotation = lazy(() => import('./pages/faquotation'));
const FaQuo = lazy(() => import('./pages/faquo'));
const Approve = lazy(() => import('./pages/approve'));
const LikeExcel = lazy(() => import('./pages/likeexcel'));
const LikeExcelAD = lazy(() => import('./pages/likeexcelAD'));
const ExcelMappingSetup = lazy(() => import('./pages/ExcelMappingSetup'));
const EMailClassifySetup = lazy(() => import('./pages/EMailClassifySetup').then(m => ({ default: m.EMailClassifySetup })));
const LikeExcelList = lazy(() => import('./pages/ExcelList'));
const DailyForecastChangePage = lazy(() => import('./pages/DailyForecastChangePage'));
const DbConsole = lazy(() => import('./pages/DbConsole'));
const FileRevisions = lazy(() => import('./pages/FileRevisions'));

const pageFallback = <div className="p-6 text-gray-500">Loading…</div>;

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={pageFallback}>
      <Routes>
        {/* 1. MOVE HOME HERE - Outside the Layout */}
        <Route path="/" element={<Home />} />
        <Route path="/docs" element={<Docs />} />

        {/* 2. ALL OTHER PAGES - Require a resolved AD identity */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Layout />}>
            {/* <Route index element={<Home />} /> */}
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="fa-quotation" element={<FAQuotation />} />
            <Route path="fa-quotation/new" element={<FaQuo />} />
            <Route path="fa-quotation/edit/:id" element={<FaQuo />} />
            <Route path="approve" element={<Approve />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="like-excel" element={<LikeExcel />} />
            <Route path="like-excel-ad" element={<LikeExcelAD />} />
            <Route path="email-classify-setup" element={<EMailClassifySetup />} />

            {/* 🌟 新增：對接到 Layout.tsx 側邊欄點擊的網址路徑 */}
            <Route path="excel-mapping-setup" element={<ExcelMappingSetup />}/>
            <Route path="like-excel-list" element={<LikeExcelList />}/>
            <Route path="db-console" element={<DbConsole />}/>
            <Route path="file-revisions" element={<FileRevisions />}/>

            {/* 📊 新增：Report > Forecast Change */}
            <Route path="report/forecast-change" element={<DailyForecastChangePage />}/>
          </Route>
        </Route>
      </Routes>
      </Suspense>
    </AuthProvider>
  );
}
