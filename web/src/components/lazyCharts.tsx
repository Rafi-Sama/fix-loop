/** Recharts is ~115 KB gzip: pages that show a chart below the fold render first and pull it in after. */
import { type ComponentProps, lazy, Suspense } from 'react';
import { Skeleton } from './ui';

const load = () => import('./charts');
const LazyBars = lazy(() => load().then((m) => ({ default: m.Bars })));
const LazyDonut = lazy(() => load().then((m) => ({ default: m.Donut })));

export const Bars = (p: ComponentProps<typeof LazyBars>) => (
  <Suspense fallback={<Skeleton h={p.height ?? 200} />}>
    <LazyBars {...p} />
  </Suspense>
);

export const Donut = (p: ComponentProps<typeof LazyDonut>) => (
  <Suspense fallback={<Skeleton h={p.size ?? 168} />}>
    <LazyDonut {...p} />
  </Suspense>
);
