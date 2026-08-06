// src/pages/ToolsPage.tsx
// src/pages/Home.tsx
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="p-10 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-5xl font-black text-slate-900 mb-4">Welcome to ENGINE</h1>
      <p className="text-xl text-slate-600 max-w-2xl mb-8">
        This is your central command center for managing all system functions and tools.
      </p>
      <Link to="/dashboard" className="bg-blue-600 text-white px-8 py-3 rounded-full font-bold hover:bg-blue-700 transition-all">
        Go to Dashboard
      </Link>
    </div>
  );
}