import { AlertTriangle, LineChart, RefreshCw } from 'lucide-react';
import { Navbar } from '../components/Navbar.jsx';
import { DashboardErrorState } from '../components/dashboard/DashboardErrorState.jsx';
import { FacultyChart } from '../components/dashboard/FacultyChart.jsx';
import { KpiGrid } from '../components/dashboard/KpiGrid.jsx';
import { LeaderboardCard } from '../components/dashboard/LeaderboardCard.jsx';
import { AR } from '../constants/ar.js';
import { useDashboardStats } from '../hooks/useDashboardStats.js';

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-label={AR.dashboard.loading}>
      <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="h-7 w-64 rounded-xl shimmer" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-28 rounded-2xl shimmer" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 h-80 rounded-3xl shimmer" />
        <div className="h-80 rounded-3xl shimmer" />
      </div>
    </div>
  );
}

/**
 * Main admin dashboard displaying live KPI cards, faculty breakdown, and category leaderboard.
 */
export function DashboardPage() {
  const {
    overview,
    faculties,
    leaderboard,
    certificateHours,
    activeCategory,
    initialLoading,
    refreshing,
    pageError,
    leaderboardLoading,
    leaderboardError,
    selectCategory,
    refresh,
  } = useDashboardStats();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {initialLoading && !overview ? (
          <DashboardSkeleton />
        ) : pageError && !overview ? (
          <DashboardErrorState message={pageError} onRetry={refresh} />
        ) : (
          <>
            {pageError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{pageError}</span>
                </div>
                <button
                  type="button"
                  onClick={refresh}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition shrink-0 cursor-pointer"
                >
                  {AR.dashboard.retryButton}
                </button>
              </div>
            )}

            <section className="glass-card rounded-3xl p-6 sm:p-8 relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mnu-500/10 text-mnu-500 text-xs font-bold mb-2.5">
                    <LineChart className="w-4 h-4" />
                    <span>{AR.dashboard.badge}</span>
                  </div>
                  <h2 className="text-xl sm:text-3xl font-black text-slate-800">
                    {AR.dashboard.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">{AR.dashboard.subtitle}</p>
                </div>

                <button
                  type="button"
                  onClick={refresh}
                  disabled={refreshing}
                  className="px-4 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-mnu-500/20 active:scale-95 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  <span>{refreshing ? AR.dashboard.refreshing : AR.dashboard.refreshButton}</span>
                </button>
              </div>

              {overview && <KpiGrid overview={overview} />}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <FacultyChart faculties={faculties} />
              <LeaderboardCard
                volunteers={leaderboard}
                certificateHours={certificateHours}
                activeCategory={activeCategory}
                onSelectCategory={selectCategory}
                loading={leaderboardLoading}
                error={leaderboardError}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
