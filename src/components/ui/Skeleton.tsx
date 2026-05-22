/**
 * Reusable loading skeletons. They replace the bare full-page spinner
 * (Loader2 spinning in the center of a 64h container) on the busiest
 * pages so users see the page structure flash in instead of an empty
 * void. Saves perceived latency on slow mobile connections.
 *
 * Components are intentionally stateless — they only need the count
 * of rows / cards / lines to render. Consumers swap them in for the
 * spinner the same way they would swap any other JSX block.
 */

interface SkeletonProps {
  className?: string;
}

/** Base block. Animated gradient via Tailwind's animate-pulse. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`bg-slate-200 rounded animate-pulse ${className}`} />;
}

/** N stat cards in a grid — matches Dashboard headers. */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Rows of a data table. Default 8 rows with 5 cells each. */
export function TableRowsSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3 border-b border-slate-50 last:border-b-0 flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Card list — matches stock category cards, repair lists, etc. */
export function CardListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ))}
    </div>
  );
}

/** Full page placeholder — header + stats + table. */
export function PageSkeleton({
  showStats = true,
  rows = 8,
  cols = 5,
}: {
  showStats?: boolean;
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {showStats && <StatCardsSkeleton />}
      <TableRowsSkeleton rows={rows} cols={cols} />
    </div>
  );
}
