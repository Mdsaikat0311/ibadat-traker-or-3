import { ReminderSetting } from '../types/ibadat';
import { getRandomQuote } from '../data/hadithBank';
import { repository } from '../data/repository';
import { auth, getTopUsersByMetric } from './firebase';

// Cordova plugin typing definitions
declare global {
  interface Window {
    device?: {
      platform?: string;
      version?: string;
    };
    cordova?: {
      plugins?: {
        notification?: {
          local?: {
            hasPermission: (callback: (granted: boolean) => void) => void;
            requestPermission: (callback: (granted: boolean) => void) => void;
            schedule: (options: any | any[]) => void;
            cancel: (id: any | any[], callback?: () => void) => void;
            clear: (id: any | any[], callback?: () => void) => void;
            getAll: (callback: (notifications: any[]) => void) => void;
            isPresent: (id: number, callback: (present: boolean) => void) => void;
            update: (options: any) => void;
            createChannel?: (options: any) => void;
            setDefaults?: (options: any) => void;
            on?: (event: string, callback: (...args: any[]) => void) => void;
          };
        };
        backgroundMode?: {
          enable: () => void;
          disable: () => void;
          isEnabled: () => boolean;
          isActive: () => boolean;
          setDefaults: (options: Record<string, any>) => void;
          overrideBackButton: () => void;
          excludeFromTaskList?: () => void;
          disableBatteryOptimizations?: () => void;
          disableWebViewOptimizations?: () => void;
        };
        permissions?: {
          POST_NOTIFICATIONS?: string;
          checkPermission: (permission: string, success: (status: any) => void, error?: (err: any) => void) => void;
          requestPermission: (permission: string, success: (status: any) => void, error?: (err: any) => void) => void;
        };
      };
    };
  }
}

// Memory of what was triggered today to prevent duplicate triggers in JS ticker
const triggeredKeysToday = new Set<string>();
let lastDayKey = "";
let lastHadithTimestamp = Date.now();
let lastGeneralTimestamp = Date.now();
let isDeviceReady = false;
const readyListeners: Array<() => void> = [];

// Convert activity key and repeat index to a unique integer ID for Cordova Local Notifications
function hashKeyToNumber(key: string, index: number): number {
  let hash = 0;
  const str = `${key}_${index}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 500000) * 10 + (index % 10) + 1000;
}

// Initialize Cordova deviceready listener
if (typeof document !== 'undefined') {
  document.addEventListener('deviceready', () => {
    isDeviceReady = true;
    console.log('[Cordova] deviceready event triggered successfully!');
    NotificationService.initCordova();
    readyListeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn('deviceready listener error:', e);
      }
    });
  }, false);
}

export class NotificationService {
  /**
   * Register a listener for when Cordova deviceready fires
   */
  static onDeviceReady(listener: () => void): () => void {
    if (isDeviceReady) {
      listener();
    }
    readyListeners.push(listener);
    return () => {
      const idx = readyListeners.indexOf(listener);
      if (idx !== -1) readyListeners.splice(idx, 1);
    };
  }

  /**
   * Check if Cordova Local Notification plugin is available
   */
  static isCordovaAvailable(): boolean {
    return Boolean(
      typeof window !== 'undefined' &&
      window.cordova?.plugins?.notification?.local
    );
  }

  /**
   * Check if Cordova is in environment
   */
  static isCordovaEnvironment(): boolean {
    return Boolean(typeof window !== 'undefined' && window.cordova);
  }

  /**
   * Check if Web Notification API is available in browser
   */
  static isWebNotificationAvailable(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Initializes Cordova plugins (Background Mode, Channels, Permissions)
   */
  static initCordova(): void {
    if (typeof window === 'undefined' || !window.cordova) return;

    // 1. Configure Background Mode if installed
    try {
      const bg = window.cordova.plugins?.backgroundMode;
      if (bg) {
        bg.setDefaults({
          title: 'ইবাদত ট্র্যাকার চলছে',
          text: 'ওয়াক্ত ও আমলের রিমাইন্ডার ব্যাকগ্রাউন্ডে সক্রিয় রয়েছে',
          icon: 'icon',
          color: '0D9488',
          silent: true
        });
        bg.enable();
        bg.overrideBackButton();
        console.log('[Cordova] background-mode enabled successfully');
      }
    } catch (e) {
      console.warn('[Cordova] background-mode init failed:', e);
    }

    // 2. Request Android 13+ Notification Permissions (POST_NOTIFICATIONS)
    try {
      const local = window.cordova.plugins?.notification?.local;
      if (local) {
        local.hasPermission((granted) => {
          if (!granted) {
            local.requestPermission((res) => {
              console.log('[Cordova] local-notification permission response:', res);
            });
          }
        });

        // 3. Create 'night-leaderboard' channel for 6-stage nightly notifications
        if (local.createChannel) {
          local.createChannel({
            id: 'night-leaderboard',
            name: 'Nightly Leaderboard',
            importance: 4,
            visibility: 1,
            vibration: true,
            sound: window.device?.platform === 'Android' ? 'res://raw/reminder_sound3' : undefined
          });
        }
      }

      const permissions = window.cordova.plugins?.permissions;
      if (permissions && typeof permissions.POST_NOTIFICATIONS === 'string') {
        const postNotif = permissions.POST_NOTIFICATIONS;
        permissions.checkPermission(postNotif, (status: any) => {
          if (!status?.hasPermission) {
            permissions.requestPermission(postNotif, (s: any) => {
              console.log('[Cordova] POST_NOTIFICATIONS granted:', s);
            });
          }
        });
      }
    } catch (e) {
      console.warn('[Cordova] permission/channel check error:', e);
    }

    // Schedule dynamic nightly notifications upon Cordova readiness
    this.scheduleDynamicNightlyNotifications();
  }

  /**
   * Request notification permission from Cordova or Browser
   */
  static async requestPermission(): Promise<boolean> {
    if (this.isCordovaAvailable()) {
      return new Promise<boolean>((resolve) => {
        try {
          window.cordova!.plugins!.notification!.local!.requestPermission((granted) => {
            resolve(Boolean(granted));
          });
        } catch {
          resolve(false);
        }
      });
    }

    if (this.isWebNotificationAvailable()) {
      try {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Get current permission state
   */
  static getPermissionState(): 'granted' | 'denied' | 'default' | 'unsupported' {
    if (this.isCordovaAvailable()) {
      return 'granted';
    }
    if (this.isWebNotificationAvailable()) {
      return Notification.permission;
    }
    return 'unsupported';
  }

  /**
   * Diagnostic report for troubleshooting outside/background notifications
   */
  static getDiagnostics(): {
    isCordova: boolean;
    isDeviceReady: boolean;
    hasLocalNotification: boolean;
    hasBackgroundMode: boolean;
    permission: string;
  } {
    return {
      isCordova: Boolean(typeof window !== 'undefined' && window.cordova),
      isDeviceReady,
      hasLocalNotification: Boolean(typeof window !== 'undefined' && window.cordova?.plugins?.notification?.local),
      hasBackgroundMode: Boolean(typeof window !== 'undefined' && window.cordova?.plugins?.backgroundMode),
      permission: this.getPermissionState()
    };
  }

  /**
   * Play a pleasant melodic Islamic chime using Web Audio API
   */
  static playChime(): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Triple chime: C5 -> E5 -> G5
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);

        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.65);
      });
    } catch (e) {
      console.warn("Chime audio failed", e);
    }
  }

  private static inAppListeners: Array<(title: string, body: string) => void> = [];

  /**
   * ইন-অ্যাপ নোটিফিকেশন লিসেনার রেজিস্টার করে
   */
  static addInAppListener(listener: (title: string, body: string) => void): () => void {
    this.inAppListeners.push(listener);
    return () => {
      this.inAppListeners = this.inAppListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Send an immediate notification (Web, Cordova, and Audio chime)
   */
  static sendNotification(title: string, body: string): void {
    // 1. Play audio chime
    this.playChime();

    // 2. Notify all registered in-app listeners
    this.inAppListeners.forEach((listener) => {
      try {
        listener(title, body);
      } catch (err) {
        console.warn("InApp listener error:", err);
      }
    });

    // 3. Try Cordova Local Notification (shows on system tray / heads-up)
    if (this.isCordovaAvailable()) {
      try {
        window.cordova!.plugins!.notification!.local!.schedule({
          id: Math.floor(Math.random() * 800000) + 100000,
          title,
          text: body,
          foreground: true,
          wakeup: true,
          vibrate: true,
          sound: true,
          priority: 2,
          importance: 4,
          channel: 'ibadat_instant_channel',
          channelName: 'ইবাদত রিমাইন্ডার',
          channelDescription: 'আমল ও ওয়াক্ত নোটিফিকেশন',
          lockscreenVisibility: 1
        });
      } catch (err) {
        console.warn("Cordova immediate notification failed", err);
      }
    }

    // 4. Try HTML5 Web Notification
    if (this.isWebNotificationAvailable() && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/app-icon.jpg',
          badge: '/app-icon.jpg',
          tag: 'ibadat_instant_' + Date.now()
        });
      } catch (err) {
        console.warn("HTML5 notification failed", err);
      }
    }
  }

  /**
   * Schedule native Cordova local notifications for an activity reminder.
   * This is registered directly in Android's AlarmManager so that it triggers
   * even when the user is OUTSIDE the app, locked, or after reboot!
   */
  static scheduleCordovaReminders(setting: ReminderSetting): void {
    if (!this.isCordovaAvailable()) {
      console.log(`[Cordova] Cannot schedule ${setting.name}: Cordova plugin not detected.`);
      return;
    }

    try {
      const [hourStr, minuteStr] = setting.start.split(':');
      const baseHour = parseInt(hourStr, 10) || 6;
      const baseMin = parseInt(minuteStr, 10) || 0;
      const notifications: any[] = [];

      for (let i = 0; i < setting.count; i++) {
        const triggerTime = new Date();
        triggerTime.setHours(baseHour);
        triggerTime.setMinutes(baseMin + i * setting.interval);
        triggerTime.setSeconds(0);
        triggerTime.setMilliseconds(0);

        // If time already passed today, schedule for tomorrow
        if (triggerTime.getTime() <= Date.now()) {
          triggerTime.setDate(triggerTime.getDate() + 1);
        }

        const notifId = hashKeyToNumber(setting.key, i);

        notifications.push({
          id: notifId,
          title: `⏰ ${setting.name} এর রিমাইন্ডার`,
          text: `এখন ${setting.name}-এর ওয়াক্ত/আমল করার সময় হয়েছে (${i + 1}/${setting.count} বার)। আমলটি সম্পূর্ণ করুন।`,
          trigger: {
            at: triggerTime,
            every: 'day' // Android repeats daily at this exact time!
          },
          foreground: true,
          wakeup: true,
          vibrate: true,
          sound: true,
          priority: 2, // High priority
          importance: 4, // Android 8+ IMPORTANCE_HIGH (pops up banner)
          channel: 'ibadat_reminders_channel',
          channelName: 'ইবাদত ওয়াক্ত রিমাইন্ডার',
          channelDescription: 'ওয়াক্ত ও আমলের সময়সূচীর নোটিফিকেশন',
          lockscreenVisibility: 1
        });
      }

      window.cordova!.plugins!.notification!.local!.schedule(notifications);
      console.log(`[Cordova] Successfully scheduled ${notifications.length} alarms for ${setting.name}`);
    } catch (e) {
      console.warn("Failed scheduling Cordova notifications", e);
    }
  }

  /**
   * Test a delayed notification (e.g. 5 seconds) so user can minimize
   * the app and test outside-the-app notification on their phone.
   */
  static scheduleDelayedOutsideTest(delaySeconds = 5, onScheduled?: () => void): void {
    const triggerDate = new Date(Date.now() + delaySeconds * 1000);
    const title = '🔔 ইবাদত ট্র্যাকার টেস্ট নোটিফিকেশন';
    const text = 'আলহামদুলিল্লাহ! বাহিরের (Background & Lockscreen) নোটিফিকেশন সফলভাবে কাজ করছে।';

    if (this.isCordovaAvailable()) {
      try {
        window.cordova!.plugins!.notification!.local!.schedule({
          id: 999991,
          title,
          text,
          trigger: { at: triggerDate },
          foreground: true,
          wakeup: true,
          vibrate: true,
          sound: true,
          priority: 2,
          importance: 4,
          channel: 'ibadat_test_channel',
          channelName: 'ইবাদত টেস্ট চ্যানেল',
          channelDescription: 'টেস্টিং নোটিফিকেশন',
          lockscreenVisibility: 1
        });
      } catch (err) {
        console.warn("Cordova delayed test failed", err);
      }
    } else if (this.isWebNotificationAvailable() && Notification.permission === 'granted') {
      setTimeout(() => {
        new Notification(title, {
          body: text,
          icon: './app-icon.jpg',
          badge: './app-icon.jpg'
        });
        this.playChime();
      }, delaySeconds * 1000);
    } else {
      setTimeout(() => {
        this.playChime();
      }, delaySeconds * 1000);
    }

    if (onScheduled) onScheduled();
  }

  /**
   * Cancel native Cordova notifications for an activity reminder
   */
  static cancelCordovaReminders(key: string, maxCount = 10): void {
    if (!this.isCordovaAvailable()) return;

    try {
      const ids: number[] = [];
      for (let i = 0; i < maxCount; i++) {
        ids.push(hashKeyToNumber(key, i));
      }
      window.cordova!.plugins!.notification!.local!.cancel(ids);
      console.log(`[Cordova] Cancelled alarms for ${key}`);
    } catch (e) {
      console.warn("Failed canceling Cordova notifications", e);
    }
  }

  /**
   * Reschedule all active reminders into Cordova (e.g. on app launch or deviceready)
   */
  static syncAllCordovaReminders(reminders: Record<string, ReminderSetting>): void {
    if (!this.isCordovaAvailable()) return;
    Object.values(reminders).forEach((setting) => {
      this.scheduleCordovaReminders(setting);
    });
  }

  /**
   * Schedule background Hadith notifications directly into Android AlarmManager / Cordova.
   * Sends the actual Hadith text directly in the notification body so users can expand
   * and read it right from their notification shade without having to open the app!
   */
  static scheduleCordovaHadithReminders(intervalMinutes = 60, count = 100): void {
    if (!this.isCordovaAvailable()) {
      console.log('[Cordova] Cannot schedule hadith notifications: Cordova plugin not detected.');
      return;
    }

    // Cancel old schedules first
    this.cancelCordovaHadithReminders();

    try {
      const notifications: any[] = [];
      const now = Date.now();

      for (let i = 1; i <= count; i++) {
        const triggerTime = new Date(now + i * intervalMinutes * 60 * 1000);
        const quote = getRandomQuote();

        notifications.push({
          id: 80000 + i,
          title: '📜 হাদিস ও বাণী',
          text: quote, // সরাসরি সম্পূর্ণ হাদিস নোটিফিকেশনে থাকবে
          summary: '১ ঘণ্টার নসীহত',
          trigger: { at: triggerTime },
          foreground: true,
          wakeup: true,
          vibrate: true,
          sound: true,
          priority: 2,
          importance: 4,
          channel: 'hadith_channel_v3',
          channelName: 'হাদিস রিমাইন্ডার',
          channelDescription: 'প্রতি ১ ঘণ্টার নির্বাচিত হাদিস ও বাণী',
          lockscreenVisibility: 1
        });
      }

      window.cordova!.plugins!.notification!.local!.schedule(notifications);
      console.log(`[Cordova] Successfully scheduled ${notifications.length} hourly hadith notifications.`);
    } catch (e) {
      console.warn("Failed scheduling Cordova hadith notifications", e);
    }
  }

  /**
   * Cancel all scheduled Cordova background hadith notifications
   */
  static cancelCordovaHadithReminders(): void {
    if (!this.isCordovaAvailable()) return;
    try {
      const ids: number[] = [];
      for (let i = 1; i <= 250; i++) {
        ids.push(80000 + i);
      }
      window.cordova!.plugins!.notification!.local!.cancel(ids);
      console.log('[Cordova] Cancelled all background hadith notifications.');
    } catch (e) {
      console.warn("Failed canceling Cordova hadith notifications", e);
    }
  }

  /**
   * Periodic scheduler that runs inside the app (every 15-30 seconds).
   * Note: Only triggers in-app alert when app is foreground, and also sends sound/notification.
   */
  static checkTick(
    reminders: Record<string, ReminderSetting>,
    autoHadithEnabled: boolean,
    generalReminder: { enabled: boolean; interval: number },
    onInAppNotification: (title: string, message: string) => void
  ): void {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);

    // Reset daily trigger cache on new day
    if (lastDayKey !== todayKey) {
      triggeredKeysToday.clear();
      lastDayKey = todayKey;
    }

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    // 1. Check Specific Activity Reminders
    Object.values(reminders).forEach((r) => {
      if (!r.start) return;
      const [hStr, mStr] = r.start.split(':');
      const startHour = parseInt(hStr, 10) || 0;
      const startMin = parseInt(mStr, 10) || 0;

      for (let i = 0; i < r.count; i++) {
        const totalMinutes = startHour * 60 + startMin + i * r.interval;
        const targetHour = Math.floor(totalMinutes / 60) % 24;
        const targetMin = totalMinutes % 60;

        if (currentHour === targetHour && currentMin === targetMin) {
          const triggerKey = `${todayKey}_${r.key}_${i}`;
          if (!triggeredKeysToday.has(triggerKey)) {
            triggeredKeysToday.add(triggerKey);

            const title = `⏰ ${r.name} এর রিমাইন্ডার`;
            const msg = `এখন ${r.name}-এর ওয়াক্ত/আমল করার সময় হয়েছে (${i + 1}/${r.count} বার)। আমলটি সম্পূর্ণ করুন।`;

            this.sendNotification(title, msg);
            onInAppNotification(title, msg);
          }
        }
      }
    });

    // 2. Check Auto Hadith (every 60 mins / 1 hour)
    if (autoHadithEnabled) {
      const elapsedMinutes = (Date.now() - lastHadithTimestamp) / (1000 * 60);
      if (elapsedMinutes >= 60) {
        lastHadithTimestamp = Date.now();
        const quote = getRandomQuote();
        const title = `📜 হাদিস ও বাণী`;
        const msg = quote; // সরাসরি সম্পূর্ণ হাদিস
        this.sendNotification(title, msg);
        onInAppNotification(title, msg);
      }
    }

    // 3. Check General Tauba & Zikir Reminder
    if (generalReminder.enabled && generalReminder.interval > 0) {
      const elapsedMinutes = (Date.now() - lastGeneralTimestamp) / (1000 * 60);
      if (elapsedMinutes >= generalReminder.interval) {
        lastGeneralTimestamp = Date.now();
        const title = `📿 তাওবাহ ও যিকিরের রিমাইন্ডার`;
        const msg = `আসতাগফিরুল্লাহ, সুবহানাল্লাহ, আলহামদুলিল্লাহ, লা ইলাহা ইল্লাল্লাহ পাঠ করে অন্তরকে সতেজ করুন।`;
        this.sendNotification(title, msg);
        onInAppNotification(title, msg);
      }
    }

    // 4. Check Dynamic Nightly Reminders (8:30 PM, 9:00 PM, 9:30 PM, 10:00 PM, 10:30 PM, 11:00 PM)
    const nightlySchedule = [
      { hour: 20, minute: 30, index: 1 }, // 8:30 PM (১ম)
      { hour: 21, minute: 0, index: 2 },  // 9:00 PM (২য়)
      { hour: 21, minute: 30, index: 3 }, // 9:30 PM (৩য়)
      { hour: 22, minute: 0, index: 4 },  // 10:00 PM (৪র্থ)
      { hour: 22, minute: 30, index: 5 }, // 10:30 PM (৫ম)
      { hour: 23, minute: 0, index: 6 }   // 11:00 PM (৬ষ্ঠ)
    ];

    const matchedSlot = nightlySchedule.find((s) => s.hour === currentHour && s.minute === currentMin);
    if (matchedSlot) {
      const notifIndex = matchedSlot.index;
      const notifKey = `${todayKey}_nightly_${notifIndex}`;
      if (!triggeredKeysToday.has(notifKey)) {
        triggeredKeysToday.add(notifKey);
        this.getNightlyMessageForIndex(notifIndex).then((msg) => {
          if (msg) {
            this.sendNotification(msg.title, msg.body);
            onInAppNotification(msg.title, msg.body);
          }

          // সবগুলো নোটিফিকেশনের (১-৬) ঠিক পরপরই যদি কারো পয়েন্ট ০ হয়, তবে সাথে সাথে ২য় নোটিফিকেশন হিসেবে শূন্য পয়েন্ট সতর্কতা দেওয়া হবে
          const currentPts = repository.calculatePoints(todayKey);
          if (currentPts === 0) {
            const zeroKey = `${todayKey}_nightly_zero_${notifIndex}`;
            if (!triggeredKeysToday.has(zeroKey)) {
              triggeredKeysToday.add(zeroKey);
              setTimeout(() => {
                this.getNightlyMessageForIndex(7).then((zeroMsg) => {
                  if (zeroMsg) {
                    this.sendNotification(zeroMsg.title, zeroMsg.body);
                    onInAppNotification(zeroMsg.title, zeroMsg.body);
                  }
                });
              }, 4000);
            }
          }
        });
      }
    }
  }

  /**
   * ৬টি নোটিফিকেশন + শূন্য (০) পয়েন্ট সতর্কতা নোটিফিকেশন শিডিউলার
   * দৈনিক রাত ৮:৩০, ৯:০০, ৯:৩০, ১০:০০, ১০:৩০, ১১:০০ এবং শূন্য পয়েন্ট থাকলে ঠিক পরপরই সতর্কতা নোটিফিকেশন সেট ও আপডেট করে
   */
  static async scheduleDynamicNightlyNotifications(): Promise<void> {
    try {
      const todayKey = repository.getTodayKey();
      const myRealTimePoints = repository.calculatePoints(todayKey);
      const myPointsToday = myRealTimePoints;
      const stats = repository.getAppStats(todayKey);
      const myPointsYesterday = stats.yesterdayPoints || 0;
      const score7Days = stats.totalPoints7Days || 0;
      const score30Days = stats.totalPoints30Days || 0;
      const highScore30 = stats.highScore30Days || 0;

      let myIndexToday = -1;
      let myRankToday = 1;
      let myRankYesterday = '#১';
      let topName = 'সেরা আমলকারী';
      let topPoints = 0;

      try {
        const currentUid = auth.currentUser ? auth.currentUser.uid : null;
        const todayUsers = await getTopUsersByMetric('todayPoints', 0);
        const yesterdayUsers = await getTopUsersByMetric('yesterdayPoints', 0);

        if (todayUsers && todayUsers.length > 0) {
          topName = todayUsers[0].name || 'সেরা আমলকারী';
          topPoints = todayUsers[0].points || 0;
        }

        if (currentUid && todayUsers && todayUsers.length > 0) {
          myIndexToday = todayUsers.findIndex((u) => u.id === currentUid);
          if (myIndexToday !== -1) {
            myRankToday = todayUsers[myIndexToday].rank;
          } else {
            myRankToday = todayUsers.length + 1;
          }
        }

        if (currentUid && yesterdayUsers && yesterdayUsers.length > 0) {
          const yIdx = yesterdayUsers.findIndex((u) => u.id === currentUid);
          if (yIdx !== -1) {
            myRankYesterday = `#${yesterdayUsers[yIdx].rank}`;
          } else {
            myRankYesterday = `#${yesterdayUsers.length + 1}`;
          }
        }
      } catch (err) {
        console.warn('Failed to load cloud leaderboard for nightly notifications:', err);
      }

      // Offline / Local Fallback
      if (myIndexToday === -1) {
        const localToday = repository.getLeaderboard('todayPoints');
        const myUserToday = localToday.find((u) => u.isCurrentUser);
        if (myUserToday) {
          myRankToday = myUserToday.rank;
          myIndexToday = localToday.indexOf(myUserToday);
        } else {
          myIndexToday = myPointsToday > 0 ? 0 : -1;
          myRankToday = 1;
        }

        const localYesterday = repository.getLeaderboard('yesterdayPoints');
        const myUserYest = localYesterday.find((u) => u.isCurrentUser);
        myRankYesterday = `#${myUserYest?.rank || 1}`;

        if (localToday.length > 0) {
          topName = localToday[0].name;
          topPoints = localToday[0].points;
        }
      }

      const pointsNeeded = Math.max(1, (topPoints - myPointsToday) + 1);

      // ৪. ৬টি নোটিফিকেশনের সময় এবং ইনডেক্স (৮:৩০ PM, ৯:০০ PM, ৯:৩০ PM, ১০:০০ PM, ১০:৩০ PM, ১১:০০ PM)
      const reminders = [
        { id: 70001, hour: 20, minute: 30, index: 1 }, // ১ম নোটিফিকেশন (8:30 PM)
        { id: 70002, hour: 21, minute: 0, index: 2 },  // ২য় নোটিফিকেশন (9:00 PM)
        { id: 70003, hour: 21, minute: 30, index: 3 }, // ৩য় নোটিফিকেশন (9:30 PM)
        { id: 70004, hour: 22, minute: 0, index: 4 },  // ৪র্থ নোটিফিকেশন (10:00 PM)
        { id: 70005, hour: 22, minute: 30, index: 5 }, // ৫ম নোটিফিকেশন (10:30 PM)
        { id: 70006, hour: 23, minute: 0, index: 6 }   // ৬ষ্ঠ নোটিফিকেশন (11:00 PM)
      ];

      // ৫. লুপ চালিয়ে প্রতিটি নোটিফিকেশনের জন্য আলাদা মেসেজ সেট করা
      reminders.forEach((r) => {
        let title = '';
        let body = '';

        // --- ১. ১ম নোটিফিকেশন ---
        if (r.index === 1) {
          if (myIndexToday === 0) {
            title = `🏆মাশাআল্লাহ! আপনিই গতকালকের সেরা! 👑${myRankYesterday}`;
            body = `গত ৭ দিন: ${score7Days} | ৩০ দিন: ${score30Days} |৩০ দিনের হাইস্কোর: ${highScore30}। নিজের ইবাদতের উন্নতি করে আখিরাত সুন্দর করুন।`;
          } else {
            title = `গতকাল লিডারবোর্ডে আপনি ছিলেন ${myRankYesterday}`;
            body = `গত ৭ দিন: ${score7Days} | ৩০ দিন: ${score30Days} |৩০ দিনের হাইস্কোর: ${highScore30}। নিজের ইবাদতের উন্নতি করে আখিরাত সুন্দর করুন।`;
          }
        }

        // --- ২. ২য় নোটিফিকেশন ---
        else if (r.index === 2) {
          if (myIndexToday === 0) {
            title = `🏆মাশাআল্লাহ! আপনিই গতকালকের সেরা! 👑${myRankYesterday}`;
            body = `গত ৭ দিন: ${score7Days} | ৩০ দিন: ${score30Days} |৩০ দিনের হাইস্কোর: ${highScore30}। নিজের ইবাদতের উন্নতি করে আখিরাত সুন্দর করুন।`;
          } else {
            title = `গতকাল লিডারবোর্ডে আপনি ছিলেন ${myRankYesterday}`;
            body = `গত ৭ দিন: ${score7Days} | ৩০ দিন: ${score30Days} |৩০ দিনের হাইস্কোর: ${highScore30}। নিজের ইবাদতের উন্নতি করে আখিরাত সুন্দর করুন।`;
          }
        }

        // --- ৩. ৩য় নোটিফিকেশন ---
        else if (r.index === 3) {
          if (myIndexToday === 0) {
            title = `🏆 মাশাআল্লাহ! আপনিই আজকের সেরা!`;
            body = `আজকের পয়েন্ট:👑 ${myPointsToday}। গতকাল ছিল: ${myPointsYesterday}। আরও বেশি আমল করে আখিরাতে নিজের মর্যাদা বৃদ্ধি করুন!`;
          } else {
            title = `🎉 প্রথম স্থানে আছেন ${topName} (${topPoints})`;
            body = `আজকে আপনার র্যাঙ্ক #${myRankToday}। প্রথম স্থানে যেতে প্রয়োজন আর ${pointsNeeded} পয়েন্ট। নিজের আমল বৃদ্ধি করে ১ নম্বরে উঠে আসুন এবং আখিরাত সুন্দর করুন।`;
          }
        }

        // --- ৪. ৪র্থ নোটিফিকেশন ---
        else if (r.index === 4) {
          if (myIndexToday === 0) {
            title = `🏆 মাশাআল্লাহ! আপনিই আজকের সেরা!`;
            body = `আজকের পয়েন্ট: 👑${myPointsToday}। গতকাল ছিল: ${myPointsYesterday}। আরও বেশি আমল করে আখিরাতে নিজের মর্যাদা বৃদ্ধি করুন!`;
          } else {
            title = `🎉 প্রথম স্থানে আছেন ${topName} (${topPoints})`;
            body = `আজকে আপনার র্যাঙ্ক #${myRankToday}। প্রথম স্থানে যেতে প্রয়োজন আর ${pointsNeeded} পয়েন্ট। নিজের আমল বৃদ্ধি করে ১ নম্বরে উঠে আসুন এবং আখিরাত সুন্দর করুন।`;
          }
        }

        // --- ৫. ৫ম নোটিফিকেশন ---
        else if (r.index === 5) {
          if (myIndexToday === 0) {
            title = `🏆 মাশাআল্লাহ! আপনিই আজকের সেরা!`;
            body = `আজকের পয়েন্ট:👑 ${myPointsToday}। গতকাল ছিল: ${myPointsYesterday}। আরও বেশি আমল করে আখিরাতে নিজের মর্যাদা বৃদ্ধি করুন!`;
          } else {
            title = `🎉 প্রথম স্থানে আছেন ${topName} (${topPoints})`;
            body = `আজকে আপনার র্যাঙ্ক #${myRankToday}। প্রথম স্থানে যেতে প্রয়োজন আর ${pointsNeeded} পয়েন্ট। নিজের আমল বৃদ্ধি করে ১ নম্বরে উঠে আসুন এবং আখিরাত সুন্দর করুন।`;
          }
        }

        // --- ৬. ৬ষ্ঠ নোটিফিকেশন (শেষ) ---
        else if (r.index === 6) {
          if (myIndexToday === 0) {
            title = `👑 আজকের ইবাদতে আপনি শীর্ষে! মাশাআল্লাহ, অনেক ভালো!`;
            body = `আপনার পয়েন্ট: ${myRealTimePoints}। এতো ভালো পারফরম্যান্সের পর, ওযু করে সকল দু'আ পড়ে তাহাজ্জুদের নিয়ত করে ঘুমোচ্ছেন তো? আল্লাহ কবুল করুন! শুভ রাত্রি।`;
          } else {
            title = `😴 রাতের শেষ ঘণ্টা! আপনার আজকের অর্জন #${myRankToday}`;
            body = `আপনার আজকের ফল: ${myRealTimePoints}। আপনি যথেষ্ট চেষ্টা করেছেন, আলহামদুলিল্লাহ! এখন ওযু করে সকল দু'আ পড়ে তাহাজ্জুদের নিয়ত করে ঘুমোচ্ছেন তো? শুভ রাত্রি।`;
          }
        }

        // ৬. শিডিউল বা আপডেট লজিক
        if (typeof window !== 'undefined' && window.cordova?.plugins?.notification?.local) {
          const local = window.cordova.plugins.notification.local;
          local.isPresent(r.id, (present: boolean) => {
            if (present) {
              // আপডেট (সাইলেন্ট)
              local.update({
                id: r.id,
                title: title,
                text: body
              });
              console.log(`Updated notification ${r.id} with points: ${myRealTimePoints}`);
            } else {
              // নতুন শিডিউল
              local.schedule({
                id: r.id,
                title: title,
                text: body,
                trigger: { every: { hour: r.hour, minute: r.minute } },
                foreground: true,
                priority: 2,
                wakeup: true,
                channel: 'night-leaderboard',
                sound: window.device?.platform === 'Android' ? 'res://raw/reminder_sound3' : undefined
              });
              console.log(`Scheduled notification ${r.id}`);
            }
          });

          // যদি ওই দিনে ব্যবহারকারীর পয়েন্ট ০ থাকে, তবে সবগুলো নোটিফিকেশনের (১-৬) ঠিক পরপরই (৬ সেকেন্ড পর) ২য় নোটিফিকেশন হিসেবে শূন্য পয়েন্ট সতর্কতা আসবে
          const zeroFollowUpId = r.id + 100; // 70101, 70102, 70103, 70104, 70105, 70106
          const zeroPointTitle = "⚠️ আজকের কোনো ইবাদত পয়েন্ট নেই!";
          const zeroPointBody = "আজকে আপনার কোনো ইবাদত পয়েন্ট নেই বা আপনি ইবাদতে অমনোযোগী হয়ে গেছেন। আপনার ইবাদত ঠিক রাখার জন্য এবং উন্নতি করার জন্য নিয়মিত ইবাদত ট্র্যাকিং ও হিসাব রাখুন, ইনশাআল্লাহ উন্নতি আসবে। এবং আল্লাহর কাছে হেদায়েতের জন্য দু'আ করুন।";

          if (myRealTimePoints === 0) {
            const zeroTriggerDate = new Date();
            zeroTriggerDate.setHours(r.hour, r.minute, 6, 0); // সংশ্লিষ্ট নোটিফিকেশনটির ঠিক ৬ সেকেন্ড পর
            if (zeroTriggerDate.getTime() <= Date.now()) {
              zeroTriggerDate.setDate(zeroTriggerDate.getDate() + 1);
            }

            local.isPresent(zeroFollowUpId, (present: boolean) => {
              if (present) {
                local.update({
                  id: zeroFollowUpId,
                  title: zeroPointTitle,
                  text: zeroPointBody
                });
              } else {
                local.schedule({
                  id: zeroFollowUpId,
                  title: zeroPointTitle,
                  text: zeroPointBody,
                  trigger: {
                    at: zeroTriggerDate,
                    every: 'day'
                  },
                  foreground: true,
                  priority: 2,
                  wakeup: true,
                  channel: 'night-leaderboard',
                  sound: window.device?.platform === 'Android' ? 'res://raw/reminder_sound3' : undefined
                });
                console.log(`Scheduled zero-point follow-up notification ${zeroFollowUpId} after notification ${r.index}`);
              }
            });
          } else {
            // ইউজারের পয়েন্ট থাকলে শূন্য পয়েন্টের অ্যালার্ম বাতিল করা হবে
            local.cancel(zeroFollowUpId);
          }
        }
      });
    } catch (error) {
      console.error("Error setting custom notifications:", error);
    }
  }

  /**
   * নির্দিষ্ট ইনডেক্সের (১-৬ অথবা শূন্য পয়েন্টের ৭) নোটিফিকেশন মেসেজ তৈরি করে
   */
  static async getNightlyMessageForIndex(index: number): Promise<{ title: string; body: string } | null> {
    try {
      const todayKey = repository.getTodayKey();
      const myRealTimePoints = repository.calculatePoints(todayKey);
      const myPointsToday = myRealTimePoints;
      const stats = repository.getAppStats(todayKey);
      const myPointsYesterday = stats.yesterdayPoints || 0;
      const score7Days = stats.totalPoints7Days || 0;
      const score30Days = stats.totalPoints30Days || 0;
      const highScore30 = stats.highScore30Days || 0;

      let myIndexToday = -1;
      let myRankToday = 1;
      let myRankYesterday = '#১';
      let topName = 'সেরা আমলকারী';
      let topPoints = 0;

      try {
        const currentUid = auth.currentUser ? auth.currentUser.uid : null;
        const todayUsers = await getTopUsersByMetric('todayPoints', 0);
        const yesterdayUsers = await getTopUsersByMetric('yesterdayPoints', 0);

        if (todayUsers && todayUsers.length > 0) {
          topName = todayUsers[0].name || 'সেরা আমলকারী';
          topPoints = todayUsers[0].points || 0;
        }

        if (currentUid && todayUsers && todayUsers.length > 0) {
          myIndexToday = todayUsers.findIndex((u) => u.id === currentUid);
          if (myIndexToday !== -1) {
            myRankToday = todayUsers[myIndexToday].rank;
          } else {
            myRankToday = todayUsers.length + 1;
          }
        }

        if (currentUid && yesterdayUsers && yesterdayUsers.length > 0) {
          const yIdx = yesterdayUsers.findIndex((u) => u.id === currentUid);
          if (yIdx !== -1) {
            myRankYesterday = `#${yesterdayUsers[yIdx].rank}`;
          } else {
            myRankYesterday = `#${yesterdayUsers.length + 1}`;
          }
        }
      } catch {}

      if (myIndexToday === -1) {
        const localToday = repository.getLeaderboard('todayPoints');
        const myUserToday = localToday.find((u) => u.isCurrentUser);
        if (myUserToday) {
          myRankToday = myUserToday.rank;
          myIndexToday = localToday.indexOf(myUserToday);
        } else {
          myIndexToday = myPointsToday > 0 ? 0 : -1;
          myRankToday = 1;
        }

        const localYesterday = repository.getLeaderboard('yesterdayPoints');
        const myUserYest = localYesterday.find((u) => u.isCurrentUser);
        myRankYesterday = `#${myUserYest?.rank || 1}`;

        if (localToday.length > 0) {
          topName = localToday[0].name;
          topPoints = localToday[0].points;
        }
      }

      const pointsNeeded = Math.max(1, (topPoints - myPointsToday) + 1);

      if (index === 1 || index === 2) {
        if (myIndexToday === 0) {
          return {
            title: `🏆মাশাআল্লাহ! আপনিই গতকালকের সেরা! 👑${myRankYesterday}`,
            body: `গত ৭ দিন: ${score7Days} | ৩০ দিন: ${score30Days} |৩০ দিনের হাইস্কোর: ${highScore30}। নিজের ইবাদতের উন্নতি করে আখিরাত সুন্দর করুন।`
          };
        } else {
          return {
            title: `গতকাল লিডারবোর্ডে আপনি ছিলেন ${myRankYesterday}`,
            body: `গত ৭ দিন: ${score7Days} | ৩০ দিন: ${score30Days} |৩০ দিনের হাইস্কোর: ${highScore30}। নিজের ইবাদতের উন্নতি করে আখিরাত সুন্দর করুন।`
          };
        }
      }

      if (index >= 3 && index <= 5) {
        if (myIndexToday === 0) {
          return {
            title: `🏆 মাশাআল্লাহ! আপনিই আজকের সেরা!`,
            body: `আজকের পয়েন্ট:👑 ${myPointsToday}। গতকাল ছিল: ${myPointsYesterday}। আরও বেশি আমল করে আখিরাতে নিজের মর্যাদা বৃদ্ধি করুন!`
          };
        } else {
          return {
            title: `🎉 প্রথম স্থানে আছেন ${topName} (${topPoints})`,
            body: `আজকে আপনার র্যাঙ্ক #${myRankToday}। প্রথম স্থানে যেতে প্রয়োজন আর ${pointsNeeded} পয়েন্ট। নিজের আমল বৃদ্ধি করে ১ নম্বরে উঠে আসুন এবং আখিরাত সুন্দর করুন।`
          };
        }
      }

      if (index === 6) {
        if (myIndexToday === 0) {
          return {
            title: `👑 আজকের ইবাদতে আপনি শীর্ষে! মাশাআল্লাহ, অনেক ভালো!`,
            body: `আপনার পয়েন্ট: ${myRealTimePoints}। এতো ভালো পারফরম্যান্সের পর, ওযু করে সকল দু'আ পড়ে তাহাজ্জুদের নিয়ত করে ঘুমোচ্ছেন তো? আল্লাহ কবুল করুন! শুভ রাত্রি।`
          };
        } else {
          return {
            title: `😴 রাতের শেষ ঘণ্টা! আপনার আজকের অর্জন #${myRankToday}`,
            body: `আপনার আজকের ফল: ${myRealTimePoints}। আপনি যথেষ্ট চেষ্টা করেছেন, আলহামদুলিল্লাহ! এখন ওযু করে সকল দু'আ পড়ে তাহাজ্জুদের নিয়ত করে ঘুমোচ্ছেন তো? শুভ রাত্রি।`
          };
        }
      }

      if (index === 7) {
        return {
          title: "⚠️ আজকের কোনো ইবাদত পয়েন্ট নেই!",
          body: "আজকে আপনার কোনো ইবাদত পয়েন্ট নেই বা আপনি ইবাদতে অমনোযোগী হয়ে গেছেন। আপনার ইবাদত ঠিক রাখার জন্য এবং উন্নতি করার জন্য নিয়মিত ইবাদত ট্র্যাকিং ও হিসাব রাখুন, ইনশাআল্লাহ উন্নতি আসবে। এবং আল্লাহর কাছে হেদায়েতের জন্য দু'আ করুন।"
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * টেস্ট করার জন্য নোটিফিকেশন তাৎক্ষণিক ট্রিগার করে (ওয়েব এবং কর্ডোভা উভয়তেই সাউন্ডসহ বাজবে)
   * যদি ইউজারের আজকের পয়েন্ট ০ থাকে অথবা forceZero সত্য হয়, তবে ১-৬ প্রতিটি নোটিফিকেশনের ঠিক পরপরই ২য় নোটিফিকেশন হিসেবে শূন্য পয়েন্ট সতর্কতা আসবে
   */
  static async triggerTestNightly(
    index: number,
    onFollowUp?: (title: string, body: string) => void,
    forceZero: boolean = false
  ): Promise<{ title: string; body: string; hasFollowUpZero?: boolean } | null> {
    const msg = await this.getNightlyMessageForIndex(index);
    const todayPts = repository.calculatePoints(repository.getTodayKey());
    const isZero = forceZero || todayPts === 0;

    if (!msg) {
      if (index === 7) {
        // টেস্ট করার জন্য শূন্য পয়েন্ট বার্তা প্রদর্শন
        const testZero = {
          title: "⚠️ আজকের কোনো ইবাদত পয়েন্ট নেই!",
          body: "আজকে আপনার কোনো ইবাদত পয়েন্ট নেই বা আপনি ইবাদতে অমনোযোগী হয়ে গেছেন। আপনার ইবাদত ঠিক রাখার জন্য এবং উন্নতি করার জন্য নিয়মিত ইবাদত ট্র্যাকিং ও হিসাব রাখুন, ইনশাআল্লাহ উন্নতি আসবে। এবং আল্লাহর কাছে হেদায়েতের জন্য দু'আ করুন।"
        };
        this.sendNotification(testZero.title, testZero.body);
        return { ...testZero, hasFollowUpZero: false };
      }
      return null;
    }

    this.sendNotification(msg.title, msg.body);

    // সবগুলো নোটিফিকেশনের (১-৬) যেকোনোটি টেস্ট করার সময় যদি ইউজারের পয়েন্ট ০ থাকে (অথবা forceZero থাকে),
    // তবে ২.৫ সেকেন্ড পরই ফলো-আপ হিসেবে ২য় নোটিফিকেশন (শূন্য পয়েন্ট সতর্কবার্তা) বাজবে ও প্রদর্শিত হবে
    if (index >= 1 && index <= 6 && isZero) {
      setTimeout(() => {
        const zeroMsg = {
          title: "⚠️ আজকের কোনো ইবাদত পয়েন্ট নেই!",
          body: "আজকে আপনার কোনো ইবাদত পয়েন্ট নেই বা আপনি ইবাদতে অমনোযোগী হয়ে গেছেন। আপনার ইবাদত ঠিক রাখার জন্য এবং উন্নতি করার জন্য নিয়মিত ইবাদত ট্র্যাকিং ও হিসাব রাখুন, ইনশাআল্লাহ উন্নতি আসবে। এবং আল্লাহর কাছে হেদায়েতের জন্য দু'আ করুন।"
        };
        this.sendNotification(zeroMsg.title, zeroMsg.body);
        if (onFollowUp) {
          onFollowUp(zeroMsg.title, zeroMsg.body);
        }
      }, 2500);
    }

    return { ...msg, hasFollowUpZero: index >= 1 && index <= 6 && isZero };
  }
}
