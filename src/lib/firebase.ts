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
import firebaseConfig from '../../firebase-applet-config.json';
import { User, Group, Expense, Activity } from '../types';
import { DEMO_USERS, DEMO_GROUPS, DEMO_EXPENSES, DEMO_ACTIVITIES } from '../data/demoData';

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

// Helper to seed initial data if Firestore is empty
export async function seedInitialFirestoreDataIfEmpty() {
  try {
    const usersSnapshot = await getDocs(usersCol);
    if (usersSnapshot.empty) {
      const batch = writeBatch(db);

      DEMO_USERS.forEach((u) => {
        batch.set(doc(usersCol, u.id), u);
      });
      DEMO_GROUPS.forEach((g) => {
        batch.set(doc(groupsCol, g.id), g);
      });
      DEMO_EXPENSES.forEach((e) => {
        batch.set(doc(expensesCol, e.id), e);
      });
      DEMO_ACTIVITIES.forEach((a) => {
        batch.set(doc(activitiesCol, a.id), a);
      });

      await batch.commit();
    }
  } catch (err) {
    console.warn('Firestore initial check or seed error:', err);
  }
}

// Live Subscriptions
export function subscribeUsers(callback: (users: User[]) => void) {
  return onSnapshot(usersCol, (snapshot) => {
    const usersList: User[] = [];
    snapshot.forEach((d) => {
      usersList.push(d.data() as User);
    });
    if (usersList.length > 0) {
      callback(usersList);
    }
  });
}

export function subscribeGroups(callback: (groups: Group[]) => void) {
  return onSnapshot(groupsCol, (snapshot) => {
    const groupsList: Group[] = [];
    snapshot.forEach((d) => {
      groupsList.push(d.data() as Group);
    });
    if (groupsList.length > 0) {
      callback(groupsList);
    }
  });
}

export function subscribeExpenses(callback: (expenses: Expense[]) => void) {
  return onSnapshot(expensesCol, (snapshot) => {
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

export function subscribeActivities(callback: (activities: Activity[]) => void) {
  return onSnapshot(activitiesCol, (snapshot) => {
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
    await setDoc(doc(expensesCol, expense.id), expense, { merge: true });
  } catch (e) {
    console.error('Error saving expense to Firestore:', e);
  }
}

export async function updateExpenseInFirestore(expense: Expense) {
  try {
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

// Authentication Functions
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const fbUser = result.user;
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
