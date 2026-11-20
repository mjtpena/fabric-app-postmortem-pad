import type { ReactNode } from 'react';
import { Activity, Info, ListChecks, Waves } from 'lucide-react';

import { mountApp } from '@x10/shared/runtime';

import { App } from './App';
import { config } from './app.config';
import './index.css';

const ICONS: Record<string, ReactNode> = {
  '/': <Activity />,
  '/trends': <Waves />,
  '/actions': <ListChecks />,
  '/about': <Info />,
};

mountApp({ ...config, nav: config.nav.map((n) => ({ ...n, icon: ICONS[n.to] })) }, <App />);
