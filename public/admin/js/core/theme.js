'use strict';

import { state } from './state.js';

export function toggleTheme(){state.theme=state.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=state.theme;localStorage.setItem('nexora_admin_theme',state.theme)}
