import React, { useState } from 'react';
import {
  BookHeart,
  BellRing,
  Clock3,
  LogIn,
  UserPlus,
  LogOut,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  Trophy,
  AlertCircle,
  Play
} from 'lucide-react';
import { AppStats, GeneralReminderSetting } from '../types/ibadat';
import { StatsGrid } from '../components/StatsGrid';
import { User } from '../services/firebase';
import { NotificationService } from '../services/notificationService';

interface SettingsScreenProps {
  currentUser: User | null;
  userName: string;
  appStats: AppStats;
  autoHadithEnabled: boolean;
  generalReminder: GeneralReminderSetting;
  lifetimeStartDate: string;
  isViewingToday: boolean;
  onLogin: (email: string, pass: string) => Promise<void>;
  onRegister: (name: string, email: string, pass: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onSetUserName: (name: string) => void;
  onToggleAutoHadith: () => void;
  onToggleGeneralReminder: () => void;
  onSetGeneralInterval: (interval: number) => void;
  onSetLifetimeStartDate: (date: string) => void;
  onRequestReset: () => void;
  onOpenLeaderboard: (metricType: string, title: string) => void;
  getMyRank: (metricType: string) => number;
  onShowAlert: (message: string, isSuccess: boolean) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  currentUser,
  userName,
  appStats,
  autoHadithEnabled,
  generalReminder,
  lifetimeStartDate,
  isViewingToday,
  onLogin,
  onRegister,
  onLogout,
  onSetUserName,
  onToggleAutoHadith,
  onToggleGeneralReminder,
  onSetGeneralInterval,
  onSetLifetimeStartDate,
  onRequestReset,
  onOpenLeaderboard,
  getMyRank,
  onShowAlert
}) => {
  // Auth Form State
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Settings State
  const [dateInput, setDateInput] = useState(lifetimeStartDate);
  const [nameInput, setNameInput] = useState(userName);
  const [testingIndex, setTestingIndex] = useState<number | null>(null);

  const handleTestNightly = async (index: number, forceSimulateZero: boolean = false) => {
    setTestingIndex(index);
    try {
      const todayPts = appStats.todayPoints || 0;
      const isZero = forceSimulateZero || todayPts === 0;

      const res = await NotificationService.triggerTestNightly(
        index,
        (zeroTitle, zeroBody) => {
          onShowAlert(
            `🔔 ২য় সতর্কতা নোটিফিকেশন (শূন্য পয়েন্ট):\n\n${zeroTitle}\n\n${zeroBody}`,
            false
          );
        },
        forceSimulateZero
      );

      if (res) {
        if (index >= 1 && index <= 6 && (isZero || res.hasFollowUpZero)) {
          onShowAlert(
            `🔔 ১ম নোটিফিকেশন পাঠানো হয়েছে:\n\n${res.title}\n\n${res.body}\n\n⚠️ আজকের পয়েন্ট ০ থাকায় ২.৫ সেকেন্ড পরেই ২য় সতর্কতা নোটিফিকেশন স্ক্রিনে আসবে এবং সাউন্ড বাজবে...`,
            true
          );
        } else if (index === 7) {
          onShowAlert(
            `🔔 ২য় সতর্কতা নোটিফিকেশন (শূন্য পয়েন্ট):\n\n${res.title}\n\n${res.body}`,
            false
          );
        } else {
          onShowAlert(
            `🔔 টেস্ট নোটিফিকেশন পাঠানো হয়েছে:\n\n${res.title}\n\n${res.body}\n\n(বর্তমানে পয়েন্ট ${todayPts} থাকায় ২য় শূন্য-পয়েন্ট সতর্কতা নিষ্ক্রিয়। শূন্য পয়েন্ট সতর্কতা দেখতে "০ পয়েন্ট টেস্ট" বাটনে ক্লিক করুন)`,
            true
          );
        }
      } else {
        onShowAlert('এই নোটিফিকেশনটির মেসেজ তৈরি করা যায়নি।', false);
      }
    } catch {
      onShowAlert('নোটিফিকেশন পাঠানো ব্যর্থ হয়েছে।', false);
    } finally {
      setTestingIndex(null);
    }
  };

  const intervals = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
  const maxDate = new Date().toISOString().split('T')[0];

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setAuthError('ইমেইল এবং পাসওয়ার্ড দিন');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await onLogin(loginEmail.trim(), loginPassword);
    } catch (err: any) {
      let msg = "লগইন ব্যর্থ হয়েছে।";
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found') {
        msg = "ভুল ইমেইল বা পাসওয়ার্ড।";
      } else if (err?.message) {
        msg = err.message;
      }
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerName.trim() || !registerEmail.trim() || !registerPassword.trim()) {
      setAuthError('সব তথ্য পূরণ করুন');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await onRegister(registerName.trim(), registerEmail.trim(), registerPassword);
    } catch (err: any) {
      let msg = "রেজিস্ট্রেশন ব্যর্থ হয়েছে।";
      if (err?.code === 'auth/email-already-in-use') {
        msg = "এই ইমেইল দিয়ে ইতোমধ্যে অ্যাকাউন্ট তৈরি করা হয়েছে।";
      } else if (err?.code === 'auth/weak-password') {
        msg = "পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।";
      } else if (err?.message) {
        msg = err.message;
      }
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const openExactAlarmSettings = () => {
    if (typeof window !== 'undefined' && (window as any).device?.platform === 'Android') {
      const packageName = "com.yourdomain.ibadattracker";
      const intentShim = (window as any).plugins?.intentShim;
      if (intentShim) {
        intentShim.startActivity(
          {
            action: "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
            url: "package:" + packageName
          },
          () => console.log("Settings opened"),
          () => onShowAlert("সেটিংস ওপেন করা যায়নি। অনুগ্রহ করে ম্যানুয়ালি পারমিশন দিন।", false)
        );
        return;
      }
    }
    onShowAlert("মোবাইলের Settings > Apps > Ibadat Tracker > Alarms & Reminders থেকে 'Allow' পারমিশন অন করুন।", true);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* If User is NOT Logged In: Show ONLY Sign In / Registration Tabs */}
      {!currentUser ? (
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-4">সেটিংস</h2>

          <div className="bg-white rounded-xl shadow-md border border-gray-100 mb-5 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('signin');
                  setAuthError(null);
                }}
                className={`flex-1 py-3 text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  authTab === 'signin'
                    ? 'text-teal-600 border-b-2 border-teal-600 bg-gray-50'
                    : 'text-gray-500 bg-white hover:text-gray-700'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>সাইন ইন</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('signup');
                  setAuthError(null);
                }}
                className={`flex-1 py-3 text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  authTab === 'signup'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-gray-50'
                    : 'text-gray-500 bg-white hover:text-gray-700'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>রেজিস্ট্রেশন</span>
              </button>
            </div>

            {/* Error message */}
            {authError && (
              <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {/* Forms */}
            <div className="p-5">
              {authTab === 'signin' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">ইমেইল</label>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="আপনার ইমেইল লিখুন"
                      required
                      className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">পাসওয়ার্ড</label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="পাসওয়ার্ড লিখুন"
                      required
                      className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-bold text-sm transition shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {authLoading ? 'সাইন ইন হচ্ছে...' : 'সাইন ইন করুন'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">নাম</label>
                    <input
                      type="text"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      placeholder="আপনার নাম লিখুন"
                      required
                      className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">ইমেইল</label>
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="আপনার ইমেইল লিখুন"
                      required
                      className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">পাসওয়ার্ড</label>
                    <input
                      type="password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="পাসওয়ার্ড লিখুন (কমপক্ষে ৬ অক্ষর)"
                      required
                      className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-sm transition shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {authLoading ? 'অ্যাকাউন্ট তৈরি হচ্ছে...' : 'অ্যাকাউন্ট তৈরি করুন'}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Local Display Name Setting for Guest Users */}
          <div className="bg-white p-5 rounded-xl shadow-md border border-gray-100 mb-5">
            <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center">
              <UserCheck className="w-4 h-4 mr-2 text-teal-600" />
              <span>ব্যবহারকারীর নাম (অফলাইন প্রোফাইল)</span>
            </h3>
            <div className="flex space-x-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="আপনার নাম লিখুন"
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={() => onSetUserName(nameInput.trim() || 'ব্যবহারকারী')}
                className="bg-teal-600 text-white px-4 rounded-lg cursor-pointer hover:bg-teal-700 transition font-bold text-sm shrink-0"
              >
                সেভ
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* If User IS Logged In: Show Profile, Stats Grid */
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-4">আমার প্রোফাইল</h2>

          {/* Profile Card */}
          <div className="bg-gray-100 p-6 rounded-xl shadow-sm border border-gray-300 text-center mb-5">
            <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-bold text-teal-700">
                {currentUser.displayName ? currentUser.displayName[0] : (userName ? userName[0] : 'U')}
              </span>
            </div>

            <h3 className="text-lg font-bold text-gray-800">
              {currentUser.displayName || userName || 'User'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">{currentUser.email}</p>

            {/* 7 Stats Grid with Realtime Rank Badges */}
            <StatsGrid
              stats={appStats}
              isToday={isViewingToday}
              onOpenLeaderboard={onOpenLeaderboard}
              getRank={getMyRank}
            />

            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2 mt-4 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>লগ আউট করুন</span>
            </button>
          </div>
        </div>
      )}

      {/* Shared Settings & Preferences (Available Online & Offline) */}
      <div className="space-y-4">
        {/* Automatic Hadith */}
        <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center">
              <BookHeart className="w-5 h-5 mr-2 text-indigo-600" />
              <span>অটোমেটিক হাদিস</span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              প্রতি ১ ঘণ্টা পর পর (অনলাইন/অফলাইন)
            </p>
            <p className="text-[11px] text-teal-600 font-medium mt-0.5">
              সরাসরি নোটিফিকেশন প্যানেলেই সম্পূর্ণ হাদিস পড়তে পারবেন
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoHadithEnabled}
              onChange={onToggleAutoHadith}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
          </label>
        </div>

        {/* Tauba & Zikir Reminder */}
        <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-lg font-bold text-gray-800 flex items-center">
                <BellRing className="w-5 h-5 mr-2 text-orange-600" />
                <span>তাওবা ও জিকির রিমাইন্ডার</span>
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                নির্দিষ্ট সময় পর পর এলার্ম বাজবে
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={generalReminder && generalReminder.enabled}
                onChange={onToggleGeneralReminder}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600" />
            </label>
          </div>

          <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
            <span className="text-sm font-medium text-gray-700">সময় ব্যবধান:</span>
            <select
              id="general-interval-select"
              value={generalReminder.interval}
              onChange={(e) => onSetGeneralInterval(Number(e.target.value))}
              className="flex-grow p-2 border border-gray-300 rounded-md text-sm focus:ring-orange-500 focus:border-orange-500 bg-white"
            >
              {intervals.map((m) => (
                <option key={m} value={m}>
                  {m} মিনিট
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Alarm Issue / Exact Alarm Permission Prompt */}
        <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 rounded-r-xl">
          <p className="text-sm font-bold">অ্যালার্ম সমস্যা হচ্ছে?</p>
          <p className="text-xs mt-0.5 text-yellow-700">
            সঠিক সময়ে রিমাইন্ডার পেতে নিচের বাটনে ক্লিক করে পারমিশন 'Allow' করুন।
          </p>
          <button
            type="button"
            onClick={openExactAlarmSettings}
            className="mt-2.5 bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
          >
            পারমিশন অন করুন
          </button>
        </div>

        {/* Nightly Leaderboard & Custom Notification Reminders (6 Slots + Zero Point Warning) - Hidden from UI */}
        <div className="hidden" style={{ display: 'none' }} aria-hidden="true">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-bold text-gray-800 flex items-center">
              <Trophy className="w-5 h-5 mr-2 text-amber-500" />
              <span>লিডারবোর্ড ও রাতের রিমাইন্ডার</span>
            </h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              ৬টি সময়সূচী + সতর্কতা
            </span>
          </div>

          <p className="text-xs text-gray-600 mb-3 leading-relaxed">
            প্রতিদিন রাত ৮:৩০ থেকে ১১:০০ এর মধ্যে আপনার পয়েন্ট ও লিডারবোর্ডের র্যাঙ্ক অনুযায়ী স্বয়ংক্রিয়ভাবে নোটিফিকেশন পাঠানো হয়। এবং ওই দিনে কোনো ইবাদত পয়েন্ট না থাকলে (০ পয়েন্ট হলে) সবগুলো নোটিফিকেশনের ঠিক পরপরই দ্বিতীয় নোটিফিকেশন হিসেবে বিশেষ সতর্কবার্তা ও হেদায়েতের দু'আ পাঠানো হয়।
          </p>

          {/* Today's Points & Zero Warning Status Banner */}
          <div className="mb-3 p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 border-slate-200">
            <div className="text-xs">
              <span className="font-semibold text-gray-700">আজকের অর্জিত পয়েন্ট: </span>
              <span className="font-bold text-teal-700 text-sm">{appStats.todayPoints} পয়েন্ট</span>
            </div>
            {appStats.todayPoints === 0 ? (
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 flex items-center gap-1.5 w-fit">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>পয়েন্ট ০: প্রতিটি নোটিফিকেশনের পর ২য় সতর্কতা সক্রিয়</span>
              </span>
            ) : (
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-300 flex items-center gap-1.5 w-fit">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>পয়েন্ট বিদ্যমান (সতর্কতা নিষ্ক্রিয়)</span>
              </span>
            )}
          </div>

          <div className="space-y-2 mb-3">
            {[
              { id: 70001, hour: 20, min: 30, index: 1, name: "১ম নোটিফিকেশন (৮:৩০ PM)", desc: "গতকালকের সেরা / গতকালের অবস্থান ও ৭/৩০ দিনের স্কোর" },
              { id: 70002, hour: 21, min: 0, index: 2, name: "২য় নোটিফিকেশন (৯:০০ PM)", desc: "গতকালকের সেরা / গতকালের অবস্থান ও আখিরাতের উন্নতি" },
              { id: 70003, hour: 21, min: 30, index: 3, name: "৩য় নোটিফিকেশন (৯:৩০ PM)", desc: "আজকের সেরা / ১ম স্থানে যাওয়ার প্রয়োজনীয় পয়েন্ট" },
              { id: 70004, hour: 22, min: 0, index: 4, name: "৪র্থ নোটিফিকেশন (১০:০০ PM)", desc: "আজকের পয়েন্ট ও গতকালকের তুলনায় অগ্রগতি" },
              { id: 70005, hour: 22, min: 30, index: 5, name: "৫ম নোটিফিকেশন (১০:৩০ PM)", desc: "আজকের সেরা / ১ম নম্বরে উঠে আসার অনুপ্রেরণা" },
              { id: 70006, hour: 23, min: 0, index: 6, name: "৬ষ্ঠ নোটিফিকেশন (১১:০০ PM)", desc: "আজকের অর্জন, ওযু করে তাহাজ্জুদের নিয়ত ও শুভ রাত্রি" },
              { id: 70007, hour: 23, min: 0, index: 7, name: "শূন্য (০) পয়েন্ট সতর্কতা (সবগুলোর পরপরই)", desc: "পয়েন্ট ০ থাকলে ১ থেকে ৬ সবগুলো নোটিফিকেশনের ঠিক পরপরই ২য় নোটিফিকেশন হিসেবে এই সতর্কবার্তা আসে", isAlert: true }
            ].map((slot) => (
              <div
                key={slot.id}
                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                  slot.isAlert ? 'bg-amber-50/70 border-amber-200' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex-1 mr-2">
                  <div className="flex items-center gap-1.5 font-bold text-gray-800">
                    {slot.isAlert ? (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    ) : (
                      <Clock3 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    )}
                    <span>{slot.name}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{slot.desc}</div>
                </div>

                {slot.isAlert ? (
                  <button
                    type="button"
                    disabled={testingIndex === slot.index}
                    onClick={() => handleTestNightly(slot.index, true)}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-[11px] font-bold transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs disabled:opacity-50"
                    title="সরাসরি শূন্য পয়েন্ট সতর্কতা নোটিফিকেশন টেস্ট পাঠান"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>{testingIndex === slot.index ? 'পাঠানো হচ্ছে...' : 'টেস্ট'}</span>
                  </button>
                ) : appStats.todayPoints === 0 ? (
                  <button
                    type="button"
                    disabled={testingIndex === slot.index}
                    onClick={() => handleTestNightly(slot.index, false)}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-[11px] font-bold transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs disabled:opacity-50"
                    title="টেস্ট নোটিফিকেশন পাঠান (১ম নোটিফিকেশন + শূন্য পয়েন্ট সতর্কতা)"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>{testingIndex === slot.index ? 'পাঠানো হচ্ছে...' : 'টেস্ট (২টি নোটিফিকেশন)'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={testingIndex === slot.index}
                      onClick={() => handleTestNightly(slot.index, false)}
                      className="px-2 py-1 bg-white hover:bg-teal-50 text-teal-700 border border-teal-200 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                      title="সাধারণ টেস্ট পাঠান"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>{testingIndex === slot.index ? '...' : 'টেস্ট'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={testingIndex === slot.index}
                      onClick={() => handleTestNightly(slot.index, true)}
                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                      title="০ পয়েন্ট ধরে ২য় সতর্কতা সহ টেস্ট করুন"
                    >
                      <AlertCircle className="w-3 h-3 text-amber-600" />
                      <span>০ পয়েন্ট টেস্ট</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-[11px] text-teal-700 bg-teal-50 p-2.5 rounded-lg border border-teal-100 flex items-start gap-1.5">
            <span className="font-bold">💡 তথ্য:</span>
            <span>কারো পয়েন্ট ০ থাকলে সবগুলো নোটিফিকেশনের ঠিক পরপরই ২য় নোটিফিকেশন হিসেবে এই সতর্কবার্তা পাঠানো হয়। যেকোনো ১টি আমলও লিপিবদ্ধ করার সাথে সাথে (পয়েন্ট ১ বা তার বেশি হলে) এই সতর্কতা স্বয়ংক্রিয়ভাবে বন্ধ হয়ে যায়।</span>
          </div>
        </div>

        {/* Point count start date */}
        <div className="bg-white p-5 rounded-xl shadow-md border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center">
            <Clock3 className="w-5 h-5 inline mr-2 text-teal-600" />
            <span>পয়েন্ট কাউন্ট শুরু</span>
          </h2>
          <div className="flex space-x-2">
            <input
              type="date"
              id="lifetime-start-date-input"
              value={dateInput}
              max={maxDate}
              onChange={(e) => setDateInput(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="button"
              onClick={() => onSetLifetimeStartDate(dateInput)}
              className="bg-teal-600 text-white px-4 rounded-lg cursor-pointer hover:bg-teal-700 transition font-bold text-sm shrink-0"
            >
              সেট
            </button>
          </div>
        </div>

        {/* Data Reset Button - Hidden */}
        <div className="hidden" style={{ display: 'none' }} aria-hidden="true">
          <h2 className="text-lg font-bold text-red-600 mb-2 flex items-center">
            <RotateCcw className="w-5 h-5 mr-2" />
            <span>ডাটা রিসেট</span>
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            আপনার সমস্ত সংরক্ষিত ইবাদত ট্র্যাকিং ও পয়েন্ট হিস্ট্রি মুছে ফেলতে চাইলে নিচের বাটনে ক্লিক করুন।
          </p>
          <button
            type="button"
            onClick={onRequestReset}
            className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>সমস্ত ডাটা মুছে ফেলুন</span>
          </button>
        </div>
      </div>
    </div>
  );
};
