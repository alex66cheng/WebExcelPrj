import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import { GOOGLE_CLIENT_ID } from './config/googleAuth';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';

// Everything behind login is lazy-loaded so the landing page doesn't have to
// download Syncfusion / Yjs / recharts before it can render.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ToolsPage = lazy(() => import('./pages/ToolsPage'));
const FAQuotation = lazy(() => import('./pages/faquotation'));
const FaQuo = lazy(() => import('./pages/faquo'));
const Approve = lazy(() => import('./pages/approve'));
const LikeExcel = lazy(() => import('./pages/likeexcel'));
const ExcelMappingSetup = lazy(() => import('./pages/ExcelMappingSetup'));
const LikeExcelList = lazy(() => import('./pages/ExcelList'));
const DailyForecastChangePage = lazy(() => import('./pages/DailyForecastChangePage'));
const DbConsole = lazy(() => import('./pages/DbConsole'));

const pageFallback = <div className="p-6 text-gray-500">Loading…</div>;

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <Suspense fallback={pageFallback}>
        <Routes>
          {/* 1. MOVE HOME HERE - Outside the Layout */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />

          {/* 2. ALL OTHER PAGES - Require a signed-in user */}
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

              {/* 🌟 新增：對接到 Layout.tsx 側邊欄點擊的網址路徑 */}
              <Route path="excel-mapping-setup" element={<ExcelMappingSetup />}/>
              <Route path="like-excel-list" element={<LikeExcelList />}/>
              <Route path="db-console" element={<DbConsole />}/>

              {/* 📊 新增：Report > Forecast Change */}
              <Route path="report/forecast-change" element={<DailyForecastChangePage />}/>
            </Route>
          </Route>
        </Routes>
        </Suspense>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
