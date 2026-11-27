import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

try {
  if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    try {
      dbInstance = initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
          ignoreUndefinedProperties: true,
        },
        firebaseConfig.firestoreDatabaseId,
      );
    } catch {
      dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
    authInstance = getAuth(app);
  }
} catch (err) {
  console.warn('[firebase] Initialization skipped or failed:', err);
}

export const db = dbInstance;
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function isFirebaseReady(): boolean {
  return Boolean(db && auth);
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errMessage = error instanceof Error ? error.message : String(error);
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  if (!db) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        return true;
      } catch (retryError) {
        if (
          retryError instanceof Error &&
          retryError.message.includes('the client is offline')
        ) {
          console.error('Please check your Firebase configuration or network connection.');
        }
      }
    }
    return false;
  }
}

export async function signInWithGoogleAdmin() {
  if (!auth) throw new Error('Firebase Auth غير مهيأ.');
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebase() {
  if (!auth) return;
  await signOut(auth);
}
