/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {ThemeProvider} from './context/ThemeContext';
import {ToastProvider} from './context/ToastContext';

import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App/>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
