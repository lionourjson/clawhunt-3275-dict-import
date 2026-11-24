import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import DemoPage from './pages/DemoPage';
import MemberListPage from './pages/MemberListPage';
import MemberFormPage from './pages/MemberFormPage';
import DictImportWizard from './pages/DictImportWizard';
import TagTreePage from './pages/TagTreePage';
import ImportGuard from './auth/ImportGuard';

/** 路由：统一挂在 /admin 下。真实接入时把 MSW 换成真实 API（见 README 集成点）。 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/admin/demo" element={<DemoPage />} />
          <Route path="/admin/members" element={<MemberListPage />} />
          <Route path="/admin/members/new" element={<MemberFormPage />} />
          <Route path="/admin/tags" element={<TagTreePage />} />
          <Route path="/admin/taxonomy/import" element={<ImportGuard><DictImportWizard /></ImportGuard>} />
          <Route path="*" element={<Navigate to="/admin/taxonomy/import" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
