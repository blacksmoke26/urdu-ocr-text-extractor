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
import {Theme} from '@radix-ui/themes';

import './index.css';
import '@radix-ui/themes/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme accentColor="violet">
      <ThemeProvider>
        <ToastProvider>
          <App/>
        </ToastProvider>
      </ThemeProvider>
    </Theme>
  </StrictMode>,
);
