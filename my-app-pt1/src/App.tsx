import { Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import { GOOGLE_CLIENT_ID } from './config/googleAuth';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ToolsPage from './pages/ToolsPage';
import FAQuotation from './pages/faquotation'; // Import new file
import FaQuo from './pages/faquo'; // Import your new form file
import Approve from './pages/approve';         // Import new file
import LikeExcel from './pages/likeexcel'; // Import it
import LikeExcelG from './pages/likeexcelG'; // Import it
import { ExcelMappingSetup } from './pages/ExcelMappingSetup';
import { EMailClassifySetup } from './pages/EMailClassifySetup'; 
import  LikeExcelList  from './pages/ExcelList';
import DailyForecastChangePage from './pages/DailyForecastChangePage';

import { registerLicense } from "@syncfusion/ej2-base";

registerLicense(
"IAk8BicRIAEqCzQhAR8kAxMHIgRJXmFXf013TGhYfUFzdUpPaVVYVHdeSFhqQ3taZiUeUn1ecnFURGNcU0V3W0ZVZkB/Vn1GYQ=="
);

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
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
              <Route path="like-excel-g" element={<LikeExcelG />} />
              <Route path="email-classify-setup" element={<EMailClassifySetup />} />

              {/* 🌟 新增：對接到 Layout.tsx 側邊欄點擊的網址路徑 */}
              <Route path="excel-mapping-setup" element={<ExcelMappingSetup />}/>
              <Route path="like-excel-list" element={<LikeExcelList />}/>

              {/* 📊 新增：Report > Forecast Change */}
              <Route path="report/forecast-change" element={<DailyForecastChangePage />}/>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}