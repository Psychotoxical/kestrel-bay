import { Suspense } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import AppRoutes from './AppRoutes';

// Counterpart of AppRoutes.mobile.test.tsx: the touch-shell routes do not
// exist in desktop builds.
describe('AppRoutes in the desktop build', () => {
  beforeEach(() => { resetAllStores(); });

  it.each(['/library', '/orbit'])('%s renders no page', path => {
    const { container } = renderWithProviders(
      <Suspense fallback={null}><AppRoutes /></Suspense>,
      { route: path },
    );
    expect(container).toBeEmptyDOMElement();
  });
});
