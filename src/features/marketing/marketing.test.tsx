import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MARKETING_ROUTES } from './routes';
import { COMPANY } from './companyInfo';

describe('marketing routes', () => {
  it('registers the home page plus the seven public legal/marketing pages', () => {
    expect(MARKETING_ROUTES.map((r) => r.path)).toEqual([
      '/',
      '/about',
      '/contact',
      '/privacy',
      '/terms',
      '/refund',
      '/support',
      '/disclaimer',
    ]);
  });

  it('every route has a title and a non-trivial meta description', () => {
    for (const route of MARKETING_ROUTES) {
      expect(route.title.length).toBeGreaterThan(5);
      expect(route.description.length).toBeGreaterThan(40);
    }
  });

  it.each(MARKETING_ROUTES.filter((r) => r.path !== '/'))(
    'renders real content for $path (not a placeholder)',
    (route) => {
      render(<MemoryRouter initialEntries={[route.path]}>{route.element}</MemoryRouter>);
      // The old LegalPlaceholderPage rendered this exact string.
      expect(screen.queryByText(/this page is a placeholder/i)).toBeNull();
      // Footer is shared chrome and names the operator on every page.
      expect(screen.getAllByText(new RegExp(COMPANY.operatorName)).length).toBeGreaterThan(0);
    },
  );

  it('the refund policy makes no money-back / 48-hour-guarantee promise', () => {
    const route = MARKETING_ROUTES.find((r) => r.path === '/refund')!;
    const html = renderToString(<StaticRouter location="/refund">{route.element}</StaticRouter>);
    expect(html).not.toMatch(/money-back/i);
    expect(html).not.toMatch(/no questions asked/i);
    expect(html).not.toMatch(/48[- ]hour (money-back |refund )?guarantee/i);
    // 48 hours is still referenced — but only as a reporting window.
    expect(html).toMatch(/within 48 hours/i);
  });

  it('the support policy states the 7 calendar day resolution SLA', () => {
    const route = MARKETING_ROUTES.find((r) => r.path === '/support')!;
    const html = renderToString(<StaticRouter location="/support">{route.element}</StaticRouter>);
    expect(html).toMatch(/resolution may take up to 7 calendar days/i);
  });

  it('prerenders each route to server HTML without throwing', async () => {
    for (const route of MARKETING_ROUTES) {
      const html = renderToString(
        <StaticRouter location={route.path}>{route.element}</StaticRouter>,
      );
      expect(html.length).toBeGreaterThan(500);
      expect(html).not.toContain('<div id="root">');
    }
  });
});
