import { useAuth } from '../lib/api';

export function PublicLanding() {
  const { data: user, isLoading } = useAuth();

  const handleDiscordLogin = () => {
    // Use relative URL so backend generates OAuth redirect URI from the current domain.
    window.location.href = `/api/auth/discord?origin=${encodeURIComponent(window.location.origin)}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans text-slate-900">
      <div className="w-full max-w-[400px] bg-white rounded-[28px] border border-slate-100 shadow-[0_4px_24px_rgba(15,23,42,0.04)] overflow-hidden animate-[fadeInUp_0.6s_ease-out]">

        {/* Top section with logo */}
        <div className="pt-10 pb-6 px-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full overflow-hidden ring-4 ring-slate-50 shadow-sm mb-5">
            <img
              src="https://i.ibb.co/TBvBGV78/photo-2026-02-14-20-12-47.jpg"
              alt="Kingsize"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-[22px] font-black tracking-[0.15em] text-slate-900 uppercase leading-none">
            Kingsize
          </h1>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold mt-1.5 leading-none">
            Family
          </p>
        </div>

        {/* Content section */}
        <div className="px-8 pb-10">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : user ? (
            <div className="flex flex-col items-center gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <img
                src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.username}&background=e2e8f0&color=334155`}
                alt={user.username}
                className="w-20 h-20 rounded-full shadow-sm ring-4 ring-white"
              />
              <div className="text-center">
                <p className="font-bold text-[18px] text-slate-900">{user.username}</p>
                <p className="text-[12px] text-slate-400 font-mono mt-1">
                  ID: {user.discordId}
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-slate-500 text-center mb-6">
                Публичная страница семьи Kingsize. Авторизуйтесь через Discord.
              </p>
              <button
                onClick={handleDiscordLogin}
                className="w-full rounded-2xl px-5 py-4 bg-slate-900 text-white font-semibold text-[14px] hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.12)]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                </svg>
                Войти через Discord
              </button>
            </>
          )}

          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="h-px flex-1 bg-slate-100"></div>
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.15em] font-semibold whitespace-nowrap">
              Discord OAuth2 · Secure
            </p>
            <div className="h-px flex-1 bg-slate-100"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
