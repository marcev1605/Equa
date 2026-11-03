import React from 'react';
import { createRoot } from 'react-dom/client';
import { registry } from './shims/expo-router';
import RootLayout from '../../app/_layout';
import AppLayout from '../../app/(app)/_layout';
import Login from '../../app/login';
import Resumen from '../../app/(app)/index';
import Prevision from '../../app/(app)/forecast';
import Tarjetas from '../../app/(app)/cards';
import Ahorro from '../../app/(app)/savings';
import Estadisticas from '../../app/(app)/stats';
import Datos from '../../app/(app)/data';

registry.login = Login; registry.appLayout = AppLayout;
registry.screens = { '/': Resumen, '/forecast': Prevision, '/cards': Tarjetas, '/savings': Ahorro, '/stats': Estadisticas, '/data': Datos };
createRoot(document.getElementById('root')!).render(<RootLayout />);
