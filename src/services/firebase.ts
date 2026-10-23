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
    const todayIso = getDateKey(today); // "YYYY-MM-DD"

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const currentUid = auth.currentUser ? auth.currentUser.uid : null;

    snapshot.forEach((childSnap) => {
      const data = childSnap.val();
      if (!data) return;
      const uid = childSnap.key || '';
      const isCurrent = currentUid === uid;

      const history: Record<string, any> = data.pointsHistory || {};

      // Helper to retrieve points for a specific Date object from pointsHistory or fullState
      const getPointsForDateObj = (d: Date): number => {
        const iso = getDateKey(d);
        const alt = d.toDateString();
        let pts = 0;
        if (history[iso] !== undefined) pts = Math.max(pts, Number(history[iso]) || 0);
        if (history[alt] !== undefined) pts = Math.max(pts, Number(history[alt]) || 0);

        if (data.fullState) {
          let fs = data.fullState;
          if (typeof fs === 'string') {
            try { fs = JSON.parse(fs); } catch {}
          }
          if (fs?.pointsHistory) {
            if (fs.pointsHistory[iso] !== undefined) pts = Math.max(pts, Number(fs.pointsHistory[iso]) || 0);
            if (fs.pointsHistory[alt] !== undefined) pts = Math.max(pts, Number(fs.pointsHistory[alt]) || 0);
          }
        }
        return pts;
      };

      let score = 0;

      if (metricType === 'todayPoints') {
        // Today's best: Strictly points recorded on today's actual date
        score = getPointsForDateObj(today);
      } else if (metricType === 'yesterdayPoints') {
        // Yesterday's best: Strictly points recorded on yesterday's actual date
        score = getPointsForDateObj(yesterday);
      } else if (metricType === 'totalPoints7Days') {
        // Last 7 days: Sum of actual points recorded across the 7-day period
        // (checks both including today and from yesterday back 7 full days)
        let sum7WithToday = 0;
        let sum7FromYesterday = 0;

        for (let i = 0; i < 7; i++) {
          const dToday = new Date(today);
          dToday.setDate(today.getDate() - i);
          sum7WithToday += getPointsForDateObj(dToday);

          const dYest = new Date(yesterday);
          dYest.setDate(yesterday.getDate() - i);
          sum7FromYesterday += getPointsForDateObj(dYest);
        }

        score = Math.max(sum7WithToday, sum7FromYesterday);
      } else if (metricType === 'totalPoints30Days') {
        // Last 30 days: Sum of actual points recorded across the 30-day period
        // (checks both including today and from yesterday back 30 full days)
        let sum30WithToday = 0;
        let sum30FromYesterday = 0;

        for (let i = 0; i < 30; i++) {
          const dToday = new Date(today);
          dToday.setDate(today.getDate() - i);
          sum30WithToday += getPointsForDateObj(dToday);

          const dYest = new Date(yesterday);
          dYest.setDate(yesterday.getDate() - i);
          sum30FromYesterday += getPointsForDateObj(dYest);
        }

        score = Math.max(sum30WithToday, sum30FromYesterday);
      } else if (metricType === 'highScore30Days') {
        // Maximum single-day score in the last 30 days
        let high = 0;
        for (let i = 0; i <= 30; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const p = getPointsForDateObj(d);
          if (p > high) high = p;
        }
        score = high;
      } else if (metricType === 'totalPoints') {
        // Lifetime: Sum of all points recorded on dates up to today
        let lifetime = 0;
        Object.entries(history).forEach(([dateStr, pVal]) => {
          if (dateStr <= todayIso || dateStr.length > 10) {
            lifetime += Number(pVal) || 0;
          }
        });

        if (data.fullState) {
          let fs = data.fullState;
          if (typeof fs === 'string') {
            try { fs = JSON.parse(fs); } catch {}
          }
          if (fs?.pointsHistory && typeof fs.pointsHistory === 'object') {
            Object.entries(fs.pointsHistory).forEach(([dateStr, pVal]) => {
              if ((dateStr <= todayIso || dateStr.length > 10) && !history[dateStr]) {
                lifetime += Number(pVal) || 0;
              }
            });
          }
        }

        if (data.stats?.totalLifetimePoints && Number(data.stats.totalLifetimePoints) > lifetime) {
          lifetime = Number(data.stats.totalLifetimePoints);
        }

        score = lifetime;
      }

      if (score > 0 || isCurrent) {
        processedUsers.push({
          id: uid,
          name: data.name || (isCurrent && auth.currentUser?.displayName ? auth.currentUser.displayName : 'ব্যবহারকারী'),
          points: score
        });
      }
    });

    processedUsers.sort((a, b) => b.points - a.points);

    // Dense ranking: Equal scores get the identical rank;
    // next score group gets the next sequential rank (1, 1, 1 -> 2, 2 -> 3...)
    let currentRank = 1;
    const rankedUsers = processedUsers.map((u, idx) => {
      if (idx > 0 && u.points < processedUsers[idx - 1].points) {
        currentRank++;
      }
      return {
        id: u.id,
        name: u.name,
        points: u.points,
        rank: currentRank,
        isCurrentUser: currentUid === u.id
      };
    });

    const finalLimit = limit === 0 ? rankedUsers.length : limit;
    return rankedUsers.slice(0, finalLimit);
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
    const myUser = sorted.find((u) => u.id === user.uid);
    if (myUser) {
      return myUser.rank;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch yesterday champion from Firebase (includes all users tied for 1st place)
 */
export async function fetchFirebaseChampion(): Promise<{ name: string; points: number } | null> {
  try {
    const champions = await getTopUsersByMetric('yesterdayPoints', 0);
    if (champions.length > 0 && champions[0].points > 0) {
      const topPoints = champions[0].points;
      const topUsers = champions.filter((u) => u.points === topPoints);
      return {
        name: topUsers.map((u) => u.name).join(', '),
        points: topPoints
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
      let currentRank = 1;
      for (let i = 0; i < list.length; i++) {
        if (i > 0 && list[i].points < list[i - 1].points) {
          currentRank++;
        }
        if (list[i].uid === user.uid) {
          myRanks[dateStr] = currentRank;
          break;
        }
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
