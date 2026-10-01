import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom';
import { LanguageProvider } from './i18n/LanguageProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
 // <React.StrictMode>
  <LanguageProvider>
    {/* BASE_URL is the IIS sub-path in production (e.g. /WebExcelApp/), "/" in dev */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </LanguageProvider>
 // </React.StrictMode>,
)
