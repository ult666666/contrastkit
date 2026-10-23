import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Mirror what index.html provides, so page-level checks see the same document.
document.documentElement.lang = 'en';
document.title = 'Palette Auditor · contrastkit';

// jsdom has no canvas. axe-core probes for one and copes with null, but jsdom logs a
// "Not implemented" error first; return null directly to keep test output clean.
HTMLCanvasElement.prototype.getContext = () => null;

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});
