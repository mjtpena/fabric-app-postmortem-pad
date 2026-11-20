import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@x10/shared/runtime';

import { AboutPage } from './pages/AboutPage';
import { ActionsPage } from './pages/ActionsPage';
import { EditIncidentPage } from './pages/EditIncidentPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { NewIncidentPage } from './pages/NewIncidentPage';
import { SeismographPage } from './pages/SeismographPage';
import { TrendsPage } from './pages/TrendsPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell immersive><SeismographPage /></AppShell>} />
      <Route path="/new" element={<AppShell><NewIncidentPage /></AppShell>} />
      <Route path="/incidents/:id" element={<AppShell><IncidentDetailPage /></AppShell>} />
      <Route path="/incidents/:id/edit" element={<AppShell><EditIncidentPage /></AppShell>} />
      <Route path="/trends" element={<AppShell wide><TrendsPage /></AppShell>} />
      <Route path="/actions" element={<AppShell><ActionsPage /></AppShell>} />
      <Route path="/about" element={<AppShell><AboutPage /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
