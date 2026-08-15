import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { User, Group, Expense, Activity } from '../types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID,
};

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Initialize Firestore with custom database ID if present
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== ''
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Collection References
const usersCol = collection(db, 'users');
const groupsCol = collection(db, 'groups');
const expensesCol = collection(db, 'expenses');
const activitiesCol = collection(db, 'activities');

// Live Subscriptions
export function subscribeUsers(userId: string, friendIds: string[], callback: (users: User[]) => void) {
  const idsToFetch = Array.from(new Set([userId, ...friendIds])).slice(0, 30); // Firestore 'in' limit is 30
  const q = idsToFetch.length > 0 ? query(usersCol, where('id', 'in', idsToFetch)) : usersCol;
  
  return onSnapshot(q, (snapshot) => {
    const usersList: User[] = [];
    snapshot.forEach((d) => {
      usersList.push(d.data() as User);
    });
    if (usersList.length > 0) {
      callback(usersList);
    }
  });
}

export function subscribeGroups(userId: string, callback: (groups: Group[]) => void) {
  const q = query(groupsCol, where('members', 'array-contains', userId));
  return onSnapshot(q, (snapshot) => {
    const groupsList: Group[] = [];
    snapshot.forEach((d) => {
      groupsList.push(d.data() as Group);
    });
    if (groupsList.length > 0) {
      callback(groupsList);
    }
  });
}

export function subscribeExpenses(userId: string, callback: (expenses: Expense[]) => void) {
  const q = query(expensesCol, where('involvedUserIds', 'array-contains', userId));
  return onSnapshot(q, (snapshot) => {
    const expensesList: Expense[] = [];
    snapshot.forEach((d) => {
      expensesList.push(d.data() as Expense);
    });
    if (expensesList.length > 0) {
      expensesList.sort(
        (a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()
      );
      callback(expensesList);
    }
  });
}

export function subscribeActivities(userId: string, callback: (activities: Activity[]) => void) {
  // To keep it simple, we fetch activities where the user is the creator.
  // In a full production app, you might also want activities for groups the user is in.
  const q = query(activitiesCol, where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    const actList: Activity[] = [];
    snapshot.forEach((d) => {
      actList.push(d.data() as Activity);
    });
    if (actList.length > 0) {
      actList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      callback(actList);
    }
  });
}

// Data persistence helpers
export async function saveUserToFirestore(user: User) {
  try {
    await setDoc(doc(usersCol, user.id), user, { merge: true });
  } catch (e) {
    console.error('Error saving user to Firestore:', e);
  }
}

export async function saveGroupToFirestore(group: Group) {
  try {
    await setDoc(doc(groupsCol, group.id), group, { merge: true });
  } catch (e) {
    console.error('Error saving group to Firestore:', e);
  }
}

export async function saveExpenseToFirestore(expense: Expense) {
  try {
    const involved = new Set<string>();
    involved.add(expense.paidBy);
    expense.splits.forEach(s => involved.add(s.userId));
    expense.involvedUserIds = Array.from(involved);

    await setDoc(doc(expensesCol, expense.id), expense, { merge: true });
  } catch (e) {
    console.error('Error saving expense to Firestore:', e);
  }
}

export async function updateExpenseInFirestore(expense: Expense) {
  try {
    const involved = new Set<string>();
    involved.add(expense.paidBy);
    expense.splits.forEach(s => involved.add(s.userId));
    expense.involvedUserIds = Array.from(involved);

    await setDoc(doc(expensesCol, expense.id), expense, { merge: true });
  } catch (e) {
    console.error('Error updating expense in Firestore:', e);
  }
}

export async function deleteExpenseFromFirestore(expenseId: string) {
  try {
    await deleteDoc(doc(expensesCol, expenseId));
  } catch (e) {
    console.error('Error deleting expense from Firestore:', e);
  }
}

export async function saveActivityToFirestore(activity: Activity) {
  try {
    await setDoc(doc(activitiesCol, activity.id), activity, { merge: true });
  } catch (e) {
    console.error('Error saving activity to Firestore:', e);
  }
}

async function linkGhostUser(newUid: string, email: string, phone?: string) {
  try {
    let ghostUser: User | null = null;
    let ghostDocRef = null;

    if (email) {
      const q = query(usersCol, where('email', '==', email));
      const snaps = await getDocs(q);
      snaps.forEach(docSnap => {
        if (docSnap.id.startsWith('user-')) {
          ghostUser = docSnap.data() as User;
          ghostDocRef = docSnap.ref;
        }
      });
    }

    if (!ghostUser && phone) {
      const q = query(usersCol, where('phone', '==', phone));
      const snaps = await getDocs(q);
      snaps.forEach(docSnap => {
        if (docSnap.id.startsWith('user-')) {
          ghostUser = docSnap.data() as User;
          ghostDocRef = docSnap.ref;
        }
      });
    }

    if (!ghostUser) return;
    
    const ghostId = ghostUser.id;
    const batch = writeBatch(db);

    const friendsQ = query(usersCol, where('friendIds', 'array-contains', ghostId));
    const friendsSnap = await getDocs(friendsQ);
    friendsSnap.forEach(docSnap => {
      const u = docSnap.data() as User;
      const newFriendIds = (u.friendIds || []).map(id => id === ghostId ? newUid : id);
      batch.update(docSnap.ref, { friendIds: newFriendIds });
    });

    const groupsQ = query(groupsCol, where('members', 'array-contains', ghostId));
    const groupsSnap = await getDocs(groupsQ);
    groupsSnap.forEach(docSnap => {
      const g = docSnap.data() as Group;
      const newMembers = (g.members || []).map(id => id === ghostId ? newUid : id);
      batch.update(docSnap.ref, { members: newMembers });
    });

    const expQ = query(expensesCol, where('involvedUserIds', 'array-contains', ghostId));
    const expSnap = await getDocs(expQ);
    expSnap.forEach(docSnap => {
      const e = docSnap.data() as Expense;
      const updatedExp = { ...e };
      if (updatedExp.paidBy === ghostId) updatedExp.paidBy = newUid;
      if (updatedExp.createdBy === ghostId) updatedExp.createdBy = newUid;
      updatedExp.involvedUserIds = (updatedExp.involvedUserIds || []).map(id => id === ghostId ? newUid : id);
      updatedExp.splits = (updatedExp.splits || []).map(s => s.userId === ghostId ? { ...s, userId: newUid } : s);
      batch.update(docSnap.ref, updatedExp);
    });

    const actQ = query(activitiesCol, where('userId', '==', ghostId));
    const actSnap = await getDocs(actQ);
    actSnap.forEach(docSnap => {
      batch.update(docSnap.ref, { userId: newUid });
    });

    if (ghostDocRef) {
      batch.delete(ghostDocRef);
    }

    await batch.commit();
    console.log(`Ghost user ${ghostId} linked to real user ${newUid}`);
  } catch (error) {
    console.error('Error linking ghost user:', error);
  }
}

// Authentication Functions
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const fbUser = result.user;
  
  await linkGhostUser(fbUser.uid, fbUser.email || '');
  
  const user: User = {
    id: fbUser.uid,
    name: fbUser.displayName || 'Google User',
    email: fbUser.email || '',
    avatar: fbUser.photoURL || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80`,
  };
  await saveUserToFirestore(user);
  return user;
}

export async function signInWithEmail(emailVal: string, passwordVal: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, emailVal, passwordVal);
  const fbUser = result.user;
  const user: User = {
    id: fbUser.uid,
    name: fbUser.displayName || emailVal.split('@')[0],
    email: fbUser.email || emailVal,
    avatar: fbUser.photoURL || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80`,
  };
  return user;
}

export async function registerWithEmail(nameVal: string, emailVal: string, phoneVal: string, passwordVal: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, emailVal, passwordVal);
  const fbUser = result.user;

  await linkGhostUser(fbUser.uid, emailVal, phoneVal);

  const user: User = {
    id: fbUser.uid,
    name: nameVal,
    email: emailVal,
    phone: phoneVal,
    avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80`,
  };
  await saveUserToFirestore(user);
  return user;
}

export async function signOutUser() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error('Error signing out:', e);
  }
}

export function subscribeAuth(callback: (fbUser: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}
