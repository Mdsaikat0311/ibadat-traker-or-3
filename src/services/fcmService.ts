import { ref, update, onValue } from 'firebase/database';
import { db, auth } from './firebase';
import { NotificationService } from './notificationService';

// Typing declarations for various Cordova Push / Firebase Messaging plugins
declare global {
  interface Window {
    PushNotification?: {
      init: (options: any) => {
        on: (event: string, callback: (...args: any[]) => void) => void;
        finish?: (success?: () => void, error?: () => void, id?: string) => void;
      };
    };
    FCM?: {
      getToken: (success: (token: string) => void, error?: (err: any) => void) => void;
      onNotification: (callback: (data: any) => void, success?: () => void, error?: (err: any) => void) => void;
      onTokenRefresh?: (callback: (token: string) => void) => void;
    };
    FCMPlugin?: {
      getToken: (success: (token: string) => void, error?: (err: any) => void) => void;
      onNotification: (callback: (data: any) => void, success?: () => void, error?: (err: any) => void) => void;
      onTokenRefresh?: (callback: (token: string) => void) => void;
    };
  }
}

export interface PushMessagePayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  receivedAt: number;
}

type PushListener = (payload: PushMessagePayload) => void;

class FCMServiceClass {
  private currentToken: string | null = null;
  private isInitialized = false;
  private listeners: PushListener[] = [];
  private detectedPlugin = 'অপেক্ষমান...';

  constructor() {
    if (typeof window !== 'undefined') {
      this.currentToken = localStorage.getItem('ibadat_fcm_token');
    }
  }

  /**
   * Register a listener for incoming push messages
   */
  onMessage(listener: PushListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  /**
   * Get current stored FCM token
   */
  getToken(): string | null {
    return this.currentToken || (typeof window !== 'undefined' ? localStorage.getItem('ibadat_fcm_token') : null);
  }

  /**
   * Get detected plugin and messaging status
   */
  getStatus(): { plugin: string; token: string | null; isCordova: boolean } {
    const isCordova = NotificationService.isCordovaEnvironment();
    return {
      plugin: this.detectedPlugin,
      token: this.getToken(),
      isCordova
    };
  }

  /**
   * Save and sync FCM token to Firebase Realtime Database
   */
  async saveTokenToFirebase(token: string): Promise<void> {
    if (!token) return;
    this.currentToken = token;
    try {
      localStorage.setItem('ibadat_fcm_token', token);
    } catch {}

    try {
      const updates: Record<string, any> = {};
      const sanitizedToken = token.replace(/[.#$[\]]/g, '_');
      const isCordova = NotificationService.isCordovaEnvironment();

      if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        updates[`users/${uid}/fcmToken`] = token;
        updates[`users/${uid}/fcmTokenUpdatedAt`] = Date.now();
      }

      updates[`fcm_tokens/${sanitizedToken}`] = {
        token,
        updatedAt: Date.now(),
        platform: isCordova ? 'cordova-android' : 'web',
        userId: auth.currentUser?.uid || 'guest',
        userName: auth.currentUser?.displayName || 'ব্যবহারকারী'
      };

      await update(ref(db), updates);
      console.log('[FCM] Device token saved to Firebase successfully');
    } catch (err) {
      console.warn('[FCM] Could not sync token to Firebase:', err);
    }
  }

  /**
   * Dispatch an incoming push notification to the system and in-app listeners
   */
  handleIncomingPush(title: string, body: string, data?: any): void {
    const finalTitle = title || '🔔 ইবাদত ট্র্যাকার বার্তা';
    const finalBody = body || 'আপনার জন্য নতুন একটি নসীহত বা বার্তা এসেছে।';

    console.log('[FCM] Incoming Push Notification:', { title: finalTitle, body: finalBody, data });

    // 1. Trigger local system notification + Islamic audio chime
    NotificationService.sendNotification(finalTitle, finalBody);

    // 2. Dispatch to registered in-app listeners
    const payload: PushMessagePayload = {
      title: finalTitle,
      body: finalBody,
      data,
      receivedAt: Date.now()
    };

    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (e) {
        console.warn('[FCM] Error in push listener:', e);
      }
    });
  }

  /**
   * Initialize Cordova Push Plugins & Firebase Cloud Messaging
   */
  init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Listen on Cordova deviceready
    NotificationService.onDeviceReady(() => {
      this.initCordovaPushPlugins();
    });

    // Also attempt Web Push if in browser
    this.initWebPush();

    // Start listening to Firebase Realtime Database direct cloud messages
    this.initRealtimeDatabaseCloudMessages();
  }

  /**
   * Initializes Cordova Push Plugins (supports phonegap-plugin-push, FCMPlugin, cordova-plugin-firebase-messaging)
   */
  private initCordovaPushPlugins(): void {
    if (typeof window === 'undefined') return;

    // 1. Check for cordova-plugin-firebase-messaging
    const anyCordova = window.cordova as any;
    const fbMessaging = anyCordova?.plugins?.firebase?.messaging;
    if (fbMessaging) {
      this.detectedPlugin = 'cordova-plugin-firebase-messaging';
      console.log('[FCM] Detected cordova-plugin-firebase-messaging');

      try {
        fbMessaging.requestPermission?.({ forceShow: true }).then(() => {
          return fbMessaging.getToken();
        }).then((token: string) => {
          if (token) this.saveTokenToFirebase(token);
        }).catch((e: any) => {
          console.warn('[FCM] Error getting token from firebase-messaging:', e);
        });

        fbMessaging.onTokenRefresh?.((token: string) => {
          if (token) this.saveTokenToFirebase(token);
        });

        fbMessaging.onMessage?.((payload: any) => {
          const title = payload.title || payload.notification?.title || payload.gcm?.title || payload.data?.title;
          const body = payload.body || payload.message || payload.notification?.body || payload.gcm?.body || payload.data?.message;
          this.handleIncomingPush(title, body, payload);
        });

        fbMessaging.onBackgroundMessage?.((payload: any) => {
          const title = payload.title || payload.notification?.title || payload.gcm?.title || payload.data?.title;
          const body = payload.body || payload.message || payload.notification?.body || payload.gcm?.body || payload.data?.message;
          this.handleIncomingPush(title, body, payload);
        });
        return;
      } catch (err) {
        console.warn('[FCM] Error initializing firebase-messaging plugin:', err);
      }
    }

    // 2. Check for PhoneGap / Cordova PushNotification plugin (phonegap-plugin-push / @havescript/cordova-plugin-push)
    if (window.PushNotification) {
      this.detectedPlugin = 'phonegap-plugin-push';
      console.log('[FCM] Detected window.PushNotification');

      try {
        const push = window.PushNotification.init({
          android: {
            senderID: "288524999382",
            sound: true,
            vibrate: true,
            clearBadge: true,
            forceShow: true
          },
          ios: {
            alert: true,
            badge: true,
            sound: true
          }
        });

        push.on('registration', (data: { registrationId: string }) => {
          console.log('[FCM] Registered device token:', data.registrationId);
          if (data.registrationId) {
            this.saveTokenToFirebase(data.registrationId);
          }
        });

        push.on('notification', (data: { title?: string; message?: string; additionalData?: any }) => {
          this.handleIncomingPush(data.title || '', data.message || '', data.additionalData);
        });

        push.on('error', (e: any) => {
          console.warn('[FCM] PushNotification plugin error:', e);
        });
        return;
      } catch (err) {
        console.warn('[FCM] Error initializing PushNotification:', err);
      }
    }

    // 3. Check for cordova-plugin-fcm / cordova-plugin-fcm-with-dependecy-updated
    const fcm = window.FCM || window.FCMPlugin;
    if (fcm) {
      this.detectedPlugin = 'cordova-plugin-fcm';
      console.log('[FCM] Detected FCM / FCMPlugin');

      try {
        fcm.getToken(
          (token: string) => {
            console.log('[FCM] FCMPlugin got token:', token);
            if (token) this.saveTokenToFirebase(token);
          },
          (err: any) => {
            console.warn('[FCM] FCMPlugin getToken error:', err);
          }
        );

        fcm.onTokenRefresh?.((token: string) => {
          if (token) this.saveTokenToFirebase(token);
        });

        fcm.onNotification(
          (data: any) => {
            const title = data.title || data.notification?.title || data.messageTitle;
            const body = data.body || data.message || data.notification?.body || data.messageBody;
            this.handleIncomingPush(title, body, data);
          },
          () => {},
          (err: any) => {
            console.warn('[FCM] FCMPlugin onNotification error:', err);
          }
        );
        return;
      } catch (err) {
        console.warn('[FCM] Error initializing FCM plugin:', err);
      }
    }

    if (NotificationService.isCordovaEnvironment()) {
      this.detectedPlugin = 'কর্ডোভা প্লাগইনের অপেক্ষায়...';
    } else {
      this.detectedPlugin = 'ওয়েব / ব্রাউজার মোড';
    }
  }

  /**
   * Initializes Web Push if supported
   */
  private async initWebPush(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const { isSupported, getMessaging, getToken, onMessage } = await import('firebase/messaging');
      const supported = await isSupported();
      if (!supported) return;

      const { getApp } = await import('firebase/app');
      const app = getApp();
      const messaging = getMessaging(app);

      // Check existing permission
      if (Notification.permission === 'granted') {
        const token = await getToken(messaging, {
          vapidKey: undefined // uses project default
        }).catch(() => null);

        if (token) {
          this.saveTokenToFirebase(token);
        }
      }

      onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title || '';
        const body = payload.notification?.body || payload.data?.body || payload.data?.message || '';
        this.handleIncomingPush(title, body, payload.data);
      });
    } catch (e) {
      // Gracefully ignore web push failure in unsupported environments
      console.log('[FCM] Web Push not active in this environment:', e);
    }
  }

  /**
   * Listens to Realtime Database "cloud_messages" node.
   * This allows direct notification broadcast from Firebase Console / RTDB!
   */
  private initRealtimeDatabaseCloudMessages(): void {
    try {
      const messagesRef = ref(db, 'cloud_messages');
      const appStartTime = Date.now() - 3000;
      const lastSeenStr = typeof window !== 'undefined' ? localStorage.getItem('last_seen_cloud_msg') : null;
      let lastSeenTime = lastSeenStr ? parseInt(lastSeenStr, 10) : appStartTime;

      onValue(messagesRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();
        if (!data) return;

        // If single message object
        if (data.title && (data.message || data.body)) {
          const msgTime = Number(data.timestamp) || Date.now();
          if (msgTime > lastSeenTime) {
            lastSeenTime = msgTime;
            try { localStorage.setItem('last_seen_cloud_msg', String(msgTime)); } catch {}
            this.handleIncomingPush(String(data.title), String(data.message || data.body), data);
          }
        } else if (typeof data === 'object') {
          // List of messages
          Object.entries(data).forEach(([key, val]: [string, any]) => {
            if (!val || typeof val !== 'object') return;
            const msgTime = Number(val.timestamp) || 0;
            const seenKey = `seen_cloud_msg_${key}`;
            const alreadySeen = typeof window !== 'undefined' && localStorage.getItem(seenKey);

            if (msgTime > appStartTime && !alreadySeen) {
              try {
                localStorage.setItem(seenKey, 'true');
                if (msgTime > lastSeenTime) {
                  lastSeenTime = msgTime;
                  localStorage.setItem('last_seen_cloud_msg', String(msgTime));
                }
              } catch {}
              this.handleIncomingPush(
                String(val.title || 'ইবাদত ট্র্যাকার বার্তা'),
                String(val.message || val.body || ''),
                val
              );
            }
          });
        }
      });
    } catch (err) {
      console.warn('[FCM] Realtime messages listener error:', err);
    }
  }

  /**
   * Trigger a test notification locally to verify the push delivery pipeline
   */
  sendTestPush(): void {
    const quotes = [
      "মুমিনের প্রতিটি নেক আমলই আল্লাহর দরবারে অমূল্য সঞ্চয়। নিয়মিত সালাত ও যিকিরে অবিচল থাকুন।",
      "রাসুলুল্লাহ (সা.) বলেছেন: 'যে ব্যক্তি আল্লাহর সন্তুষ্টির উদ্দেশ্যে একটি ভালো কাজ করল, আল্লাহ তার দশগুণ সওয়াব দান করেন।'",
      "আজকের তাহাজ্জুদ ও রাতের আমল সম্পন্ন করেছেন কি? এখনই আমলটি লিপিবদ্ধ করুন।"
    ];
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    this.handleIncomingPush('🔔 টেস্ট ক্লাউড মেসেজ (FCM)', quote, { test: true });
  }
}

export const FCMService = new FCMServiceClass();
