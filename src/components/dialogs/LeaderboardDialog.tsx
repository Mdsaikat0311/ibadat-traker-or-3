import React, { useState, useEffect } from 'react';
import { X, Loader2, Trophy, Crown, Medal } from 'lucide-react';
import { repository } from '../../data/repository';
import { getTopUsersByMetric } from '../../services/firebase';
import { LeaderboardUser } from '../../types/ibadat';

interface LeaderboardDialogProps {
  initialTitle?: string;
  initialMetric?: string;
  onDismiss: () => void;
}

const LEADERBOARD_TABS = [
  { id: 'todayPoints', label: 'আজকের সেরা', title: 'আজকের সেরা' },
  { id: 'yesterdayPoints', label: 'গতকালকের সেরা', title: 'গতকালকের সেরা' },
  { id: 'totalPoints7Days', label: 'সাপ্তাহিক (৭ দিন)', title: 'সাপ্তাহিক সেরা (৭ দিন)' },
  { id: 'totalPoints30Days', label: 'মাসিক (৩০ দিন)', title: 'মাসিক সেরা (৩০ দিন)' },
  { id: 'totalPoints', label: 'সর্বমোট সেরা', title: 'সর্বমোট সেরা (লাইফটাইম)' },
  { id: 'highScore30Days', label: '৩০ দিনের হাই স্কোর', title: '৩০ দিনের হাই স্কোর' }
];

export const LeaderboardDialog: React.FC<LeaderboardDialogProps> = ({
  initialTitle = 'লিডারবোর্ড (সেরা ২০)',
  initialMetric = 'todayPoints',
  onDismiss
}) => {
  const [selectedMetric, setSelectedMetric] = useState<string>(initialMetric);
  const [title, setTitle] = useState<string>(initialTitle);
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Sync state if initial props change
  useEffect(() => {
    setSelectedMetric(initialMetric);
    const matchedTab = LEADERBOARD_TABS.find((t) => t.id === initialMetric);
    setTitle(matchedTab?.title || initialTitle);
  }, [initialMetric, initialTitle]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    getTopUsersByMetric(selectedMetric, 20)
      .then((firebaseUsers) => {
        if (!mounted) return;
        if (firebaseUsers && firebaseUsers.length > 0) {
          setUsers(firebaseUsers);
        } else {
          setUsers(repository.getLeaderboard(selectedMetric));
        }
      })
      .catch(() => {
        if (!mounted) return;
        setUsers(repository.getLeaderboard(selectedMetric));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedMetric]);

  const handleTabChange = (metric: string, tabTitle: string) => {
    setSelectedMetric(metric);
    setTitle(tabTitle);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
      <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-teal-50 rounded-t-xl">
          <h3 className="text-base font-bold text-teal-800 flex items-center gap-1.5">
            <Trophy className="w-5 h-5 text-amber-500 fill-amber-500 shrink-0" />
            <span className="truncate">{title}</span>
          </h3>
          <button
            type="button"
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 cursor-pointer p-1 rounded-full hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch with all 5+ categories */}
        <div className="px-3 py-2 bg-gray-50 flex items-center gap-1.5 border-b border-gray-200 overflow-x-auto no-scrollbar">
          {LEADERBOARD_TABS.map((tab) => {
            const isActive = selectedMetric === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id, tab.title)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border shadow-2xs whitespace-nowrap transition cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-teal-600 text-white border-teal-600 ring-1 ring-teal-600 shadow-xs'
                    : 'bg-white hover:bg-teal-50/50 text-gray-700 border-gray-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="p-4 overflow-y-auto flex-grow bg-gray-50 min-h-[220px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
              <span className="text-xs font-medium">লিডারবোর্ড লোড হচ্ছে...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-xs text-gray-500">
              কোনো তথ্য পাওয়া যায়নি
            </div>
          ) : (
            users.map((u) => {
              const isMe = u.isCurrentUser;
              const rank = u.rank;

              const rowClass = isMe
                ? 'bg-teal-50 border-teal-500 ring-1 ring-teal-400 shadow-sm z-10'
                : 'bg-white border-gray-200';

              let rankBadge = (
                <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-xs border border-gray-200 shrink-0">
                  #{rank}
                </div>
              );

              if (rank === 1) {
                rankBadge = (
                  <div className="w-7 h-7 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center shadow-xs shrink-0 text-xs font-black text-amber-800">
                    <Crown className="w-4 h-4 text-amber-500 fill-amber-500 mr-0.5" />
                    <span>1</span>
                  </div>
                );
              } else if (rank === 2) {
                rankBadge = (
                  <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center shadow-xs shrink-0 text-xs font-black text-slate-700">
                    <Medal className="w-3.5 h-3.5 text-slate-500 mr-0.5" />
                    <span>2</span>
                  </div>
                );
              } else if (rank === 3) {
                rankBadge = (
                  <div className="w-7 h-7 rounded-full bg-orange-100 border border-orange-300 flex items-center justify-center shadow-xs shrink-0 text-xs font-black text-orange-800">
                    <Medal className="w-3.5 h-3.5 text-orange-600 mr-0.5" />
                    <span>3</span>
                  </div>
                );
              }

              return (
                <div
                  key={u.id}
                  className={`flex items-center justify-between p-3 mb-2 rounded-xl border ${rowClass} transition-all`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {rankBadge}
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-sm flex items-center truncate">
                        <span className="truncate">{u.name}</span>
                        {isMe && (
                          <span className="ml-2 text-[10px] bg-teal-600 text-white px-1.5 py-0.2 rounded-full font-semibold shrink-0">
                            আমি
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="font-extrabold text-teal-700 text-sm bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-lg shrink-0">
                    {u.points} <span className="text-[10px] font-normal text-gray-500">pts</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
