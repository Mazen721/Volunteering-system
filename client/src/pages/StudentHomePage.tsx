import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarClock, LayoutGrid, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { MyUpcomingCard } from '../components/student/MyUpcomingCard';
import { OpportunityCard } from '../components/student/OpportunityCard';
import { StudentHomeHero } from '../components/student/StudentHomeHero';
import { AR } from '../constants/ar';
import { useAuth } from '../context/authContext';
import { useStudentHome } from '../hooks/useStudentHome';
import { formatDateAr } from '../utils/format';
import { buildMyUpcoming } from '../utils/myUpcoming';

const HOME = AR.studentPortal.home;
const MY_UPCOMING_PREVIEW = 4;

/**
 * The student's main page: the work itself, with no statistics. A big hero
 * block shows what is happening now (or next, or a welcome for new students),
 * followed by his upcoming work, gold-marked suggested opportunities, and a
 * short preview of all volunteer work with a see-all link to the board.
 */
export function StudentHomePage() {
  const { user } = useAuth();
  const { summary, recommendations, allOpportunities, loading, error, retry } = useStudentHome();
  const isPendingAccount = user?.status === 'pending';
  const myUpcoming = summary ? buildMyUpcoming(summary).slice(0, MY_UPCOMING_PREVIEW) : [];
  const firstName = user?.fullName.trim().split(/\s+/)[0] ?? '';

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <header className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-slate-800">
            {HOME.greeting}، {firstName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            {formatDateAr(new Date())}
            {user?.faculty && (
              <>
                <span className="text-slate-300"> • </span>
                {user.faculty}
              </>
            )}
          </p>
        </header>

        {isPendingAccount && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 space-y-1"
          >
            <p className="text-xs font-black">{AR.pending.waitingTitle}</p>
            <p className="text-xs font-semibold leading-relaxed">{AR.pending.waitingSubtitle}</p>
          </div>
        )}

        {loading && !summary && (
          <div className="glass-card rounded-3xl p-6 flex items-center gap-3 text-mnu-500 text-sm font-bold">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {HOME.loading}
          </div>
        )}

        {error && !loading && (
          <div role="alert" className="glass-card rounded-3xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-rose-600 text-sm font-bold">
              <XCircle className="w-5 h-5" />
              {HOME.errorTitle}
            </div>
            <p className="text-xs text-slate-600">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="px-4 py-2 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition cursor-pointer"
            >
              {AR.studentPortal.common.retry}
            </button>
          </div>
        )}

        {summary && (
          <>
            <StudentHomeHero summary={summary} />

            {myUpcoming.length > 0 && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-base font-black text-slate-800">
                    <CalendarClock className="w-5 h-5 text-mnu-500" />
                    {HOME.myUpcomingTitle}
                  </h2>
                  <Link
                    to="/me/applications"
                    className="text-[11px] font-bold text-mnu-600 hover:text-mnu-700"
                  >
                    {HOME.myUpcomingAll}
                  </Link>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {myUpcoming.map((item) => (
                    <MyUpcomingCard key={item.opportunity._id} item={item} />
                  ))}
                </div>
              </section>
            )}

            <section id="home-suggested" className="space-y-3 scroll-mt-28">
              <h2 className="flex items-center gap-2 text-base font-black text-slate-800">
                <Sparkles className="w-5 h-5 text-mnu-gold" />
                {HOME.suggestedTitle}
              </h2>
              {recommendations.length === 0 ? (
                <p className="text-xs text-slate-500">{HOME.suggestedEmpty}</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {recommendations.map((opportunity) => (
                    <OpportunityCard key={opportunity._id} opportunity={opportunity} suggested />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-base font-black text-slate-800">
                <LayoutGrid className="w-5 h-5 text-mnu-500" />
                {HOME.allWorkTitle}
              </h2>
              {allOpportunities.length === 0 ? (
                <p className="text-xs text-slate-500">{HOME.allWorkEmpty}</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {allOpportunities.map((opportunity) => (
                      <OpportunityCard key={opportunity._id} opportunity={opportunity} />
                    ))}
                  </div>
                  <div className="flex justify-center pt-1">
                    <Link
                      to="/opportunities"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border-2 border-mnu-500 text-mnu-600 bg-white text-sm font-black transition hover:bg-mnu-50"
                    >
                      {HOME.seeAllButton}
                      <ArrowLeft className="w-4 h-4" />
                    </Link>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
