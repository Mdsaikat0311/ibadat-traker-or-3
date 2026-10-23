import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  get,
  child,
  update,
  onValue
} from 'firebase/database';
import { LeaderboardUser, CommunityUserState } from '../types/ibadat';

export type { CommunityUserState };

// Configuration from environment or original application
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCzQNwGR6NzTgxFEKzxyRmOVJfi83P4dcA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ibadat-traker.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://ibadat-traker-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ibadat-traker",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ibadat-traker.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "288524999382",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:288524999382:web:4ec05edfaeb691dda9c777",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-HKC4BTQZPS"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getDatabase(app);

// Helper for formatted date key YYYY-MM-DD
export function getDateKey(dateObj: Date): string {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPointsForDate(history: Record<string, number> | undefined, dateObj: Date): number {
  if (!history) return 0;
  const key = getDateKey(dateObj);
  return Number(history[key]) || 0;
}

export function getPointsForPastDays(history: Record<string, number> | undefined, days: number): number {
  if (!history) return 0;
  let total = 0;
  const today = new Date();
  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    total += getPointsForDate(history, d);
  }
  return total;
}

export function getTotalHistoryPoints(history: Record<string, number> | undefined): number {
  if (!history) return 0;
  let total = 0;
  Object.values(history).forEach((p) => {
    total += parseInt(String(p), 10) || 0;
  });
  return total;
}

/**
 * Fetch top users by metric from Firebase Realtime Database
 */
export async function getTopUsersByMetric(
  metricType: string,
  limit = 20
): Promise<LeaderboardUser[]> {
  try {
    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);

    if (!snapshot.exists()) return [];

    const processedUsers: Array<{ id: string; name: string; points: number }> = [];
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    snapshot.forEach((childSnap) => {
      const data = childSnap.val();
      if (!data) return;
      const history = data.pointsHistory || {};
      const stats = data.stats || {};
      let score = 0;

      if (metricType === 'todayPoints') {
        score = Math.max(getPointsForDate(history, today), Number(stats.todayPoints) || 0);
      } else if (metricType === 'yesterdayPoints') {
        score = Math.max(getPointsForDate(history, yesterday), Number(stats.yesterdayPoints) || 0);
      } else if (metricType === 'totalPoints7Days') {
        let sum7 = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          sum7 += getPointsForDate(history, d);
        }
        score = Math.max(sum7, Number(stats.totalPoints7Days) || 0);
      } else if (metricType === 'totalPoints30Days') {
        let sum30 = 0;
        for (let i = 0; i < 30; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          sum30 += getPointsForDate(history, d);
        }
        score = Math.max(sum30, Number(stats.totalPoints30Days) || 0);
      } else if (metricType === 'totalPoints') {
        score = Math.max(
          getTotalHistoryPoints(history),
          Number(stats.totalLifetimePoints) || 0,
          Number(stats.totalPoints) || 0
        );
      } else if (metricType === 'highScore30Days') {
        score = Number(stats.highScore30Days) || 0;
      }

      processedUsers.push({
        id: childSnap.key || '',
        name: data.name || 'বেনামী',
        points: score
      });
    });

    processedUsers.sort((a, b) => b.points - a.points);

    const currentUid = auth.currentUser ? auth.currentUser.uid : null;
    const finalLimit = limit === 0 ? processedUsers.length : limit;
    const sliced = processedUsers.slice(0, finalLimit);

    let currentRank = 1;
    return sliced.map((u, idx) => {
      if (idx > 0 && u.points < sliced[idx - 1].points) {
        currentRank = idx + 1;
      }
      return {
        id: u.id,
        name: u.name,
        points: u.points,
        rank: currentRank,
        isCurrentUser: currentUid === u.id
      };
    });
  } catch (error) {
    console.warn("Error calculating leaderboard from Firebase:", error);
    return [];
  }
}

/**
 * Fetch rank of current user from Firebase Realtime Database
 */
export async function fetchUserRank(statKey: string): Promise<number | null> {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const sorted = await getTopUsersByMetric(statKey, 0);
    const myIndex = sorted.findIndex((u) => u.id === user.uid);
    if (myIndex !== -1) {
      return myIndex + 1;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch yesterday champion from Firebase
 */
export async function fetchFirebaseChampion(): Promise<{ name: string; points: number } | null> {
  try {
    const champions = await getTopUsersByMetric('yesterdayPoints', 1);
    if (champions.length > 0 && champions[0].points > 0) {
      return {
        name: champions[0].name,
        points: champions[0].points
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Push local state to Firebase Realtime Database
 */
export async function syncStateToFirebase(
  activeDateKey: string,
  points: number,
  stats: any,
  fullState: any
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const uid = user.uid;
    const dateObj = new Date(activeDateKey);
    const formattedDate = getDateKey(dateObj);

    const updates: Record<string, any> = {};
    updates[`users/${uid}/pointsHistory/${formattedDate}`] = points;
    updates[`users/${uid}/name`] = user.displayName || fullState.currentUser?.name || 'ব্যবহারকারী';
    updates[`users/${uid}/fullState`] = JSON.stringify(fullState);
    updates[`users/${uid}/stats`] = {
      ...stats,
      totalPoints: stats.totalLifetimePoints || stats.totalPoints || 0
    };

    await update(ref(db), updates);
  } catch (err) {
    console.warn("Firebase update failed:", err);
  }
}

/**
 * Pull fullState and account history from Firebase on user login
 */
export async function fetchUserCloudState(uid: string): Promise<any | null> {
  try {
    const snapshot = await get(child(ref(db), `users/${uid}`));
    if (snapshot.exists()) {
      const val = snapshot.val();
      let state: Record<string, any> = {};
      if (val.fullState) {
        try {
          state = JSON.parse(val.fullState);
        } catch {
          state = {};
        }
      }
      if (val.pointsHistory && typeof val.pointsHistory === 'object') {
        state.pointsHistory = { ...(state.pointsHistory || {}), ...val.pointsHistory };
      }
      if (val.stats && typeof val.stats === 'object') {
        state.stats = { ...val.stats, ...(state.stats || {}) };
      }
      return state;
    }
    return null;
  } catch (e) {
    console.warn("Failed to fetch cloud state:", e);
    return null;
  }
}

/**
 * Directly fetch user's account total lifetime points from pointsHistory
 */
export async function fetchUserAccountLifetimePoints(uid?: string): Promise<number | null> {
  const currentUid = uid || auth.currentUser?.uid;
  if (!currentUid) return null;

  try {
    const snapshot = await get(child(ref(db), `users/${currentUid}`));
    if (snapshot.exists()) {
      const val = snapshot.val();
      if (val.pointsHistory && typeof val.pointsHistory === 'object') {
        return getTotalHistoryPoints(val.pointsHistory);
      }
      if (val.stats?.totalPoints) {
        return Number(val.stats.totalPoints) || 0;
      }
      if (val.stats?.totalLifetimePoints) {
        return Number(val.stats.totalLifetimePoints) || 0;
      }
    }
    return null;
  } catch (err) {
    console.warn("Failed fetching user account lifetime points:", err);
    return null;
  }
}

/**
 * Fetch all pointsHistory for a user from Firebase Realtime Database
 */
export async function fetchUserPointsHistory(uid?: string): Promise<Record<string, number> | null> {
  const currentUid = uid || auth.currentUser?.uid;
  if (!currentUid) return null;

  try {
    const snapshot = await get(child(ref(db), `users/${currentUid}/pointsHistory`));
    if (snapshot.exists()) {
      return snapshot.val() as Record<string, number>;
    }
    return null;
  } catch (err) {
    console.warn("Failed fetching user points history:", err);
    return null;
  }
}

/**
 * Fetch rank of current user for each date in a month from Firebase Realtime Database
 */
export async function fetchUserRanksForMonth(
  year: number,
  monthIndex: number
): Promise<Record<string, number>> {
  const user = auth.currentUser;
  if (!user) return {};

  try {
    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);
    if (!snapshot.exists()) return {};

    const monthStr = String(monthIndex + 1).padStart(2, '0');
    const prefix = `${year}-${monthStr}`;

    const dateScores: Record<string, Array<{ uid: string; points: number }>> = {};

    snapshot.forEach((childSnap) => {
      const uid = childSnap.key;
      const data = childSnap.val();
      if (!uid || !data) return;
      const history = data.pointsHistory;
      if (!history || typeof history !== 'object') return;

      Object.entries(history).forEach(([dateStr, pVal]) => {
        if (dateStr.startsWith(prefix)) {
          const pts = Number(pVal) || 0;
          if (pts > 0) {
            if (!dateScores[dateStr]) dateScores[dateStr] = [];
            dateScores[dateStr].push({ uid, points: pts });
          }
        }
      });
    });

    const myRanks: Record<string, number> = {};

    Object.entries(dateScores).forEach(([dateStr, list]) => {
      list.sort((a, b) => b.points - a.points);
      const myIdx = list.findIndex((item) => item.uid === user.uid);
      if (myIdx !== -1) {
        myRanks[dateStr] = myIdx + 1;
      }
    });

    return myRanks;
  } catch (err) {
    console.warn("fetchUserRanksForMonth error:", err);
    return {};
  }
}

/**
 * Fetch all registered users from Firebase Realtime Database
 */
export async function fetchAllCommunityUsers(): Promise<CommunityUserState[]> {
  try {
    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);
    if (!snapshot.exists()) return [];

    const userList: CommunityUserState[] = [];
    snapshot.forEach((childSnap) => {
      const uid = childSnap.key || '';
      const data = childSnap.val() || {};
      let fullState = null;
      if (data.fullState) {
        if (typeof data.fullState === 'string') {
          try {
            fullState = JSON.parse(data.fullState);
          } catch {}
        } else if (typeof data.fullState === 'object') {
          fullState = data.fullState;
        }
      }
      userList.push({
        uid,
        name: data.name || 'ব্যবহারকারী',
        fullState,
        pointsHistory: data.pointsHistory || {},
        stats: data.stats || {}
      });
    });
    return userList;
  } catch (err) {
    console.warn("fetchAllCommunityUsers error:", err);
    return [];
  }
}

/**
 * Real-time listener for all registered users in Firebase Realtime Database
 */
export function subscribeCommunityUsers(
  callback: (users: CommunityUserState[]) => void
): () => void {
  try {
    const usersRef = ref(db, 'users');
    const unsubscribe = onValue(
      usersRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback([]);
          return;
        }
        const userList: CommunityUserState[] = [];
        snapshot.forEach((childSnap) => {
          const uid = childSnap.key || '';
          const data = childSnap.val() || {};
          let fullState = null;
          if (data.fullState) {
            if (typeof data.fullState === 'string') {
              try {
                fullState = JSON.parse(data.fullState);
              } catch {}
            } else if (typeof data.fullState === 'object') {
              fullState = data.fullState;
            }
          }
          userList.push({
            uid,
            name: data.name || 'ব্যবহারকারী',
            fullState,
            pointsHistory: data.pointsHistory || {},
            stats: data.stats || {}
          });
        });
        callback(userList);
      },
      (error) => {
        console.warn("subscribeCommunityUsers error:", error);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.warn("Error setting up users subscription:", err);
    return () => {};
  }
}

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
};
export type { User };
