import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  disableNetwork,
  doc,
  enableNetwork,
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
          experimentalLongPollingOptions: { timeoutSeconds: 5 },
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

export async function ensureFirestoreNetwork(): Promise<void> {
  if (!db) return;
  try {
    await enableNetwork(db);
  } catch {
    // ignore if already enabled
  }
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

async function probeFirestoreRest(timeoutMs = 4500): Promise<boolean> {
  if (!firebaseConfig?.projectId || !firebaseConfig?.firestoreDatabaseId || !firebaseConfig?.apiKey) {
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseConfig.projectId,
    )}/databases/${encodeURIComponent(
      firebaseConfig.firestoreDatabaseId,
    )}/documents:runQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'products' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'published' },
              op: 'EQUAL',
              value: { booleanValue: true },
            },
          },
          limit: 1,
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let inFlightConnectionCheck: Promise<boolean> | null = null;

export async function testConnection(): Promise<boolean> {
  if (!db) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  if (inFlightConnectionCheck) {
    return inFlightConnectionCheck;
  }

  inFlightConnectionCheck = (async () => {
    const restReachable = await probeFirestoreRest();
    if (!restReachable) {
      return false;
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      await ensureFirestoreNetwork();
      const sdkConnected = await Promise.race<boolean>([
        getDocFromServer(doc(db!, 'test', 'connection')).then(() => true),
        new Promise<boolean>((resolve) => {
          // Guard before Firestore's 10s OnlineStateTimeout fires if Listen/channel is blocked
          timeoutHandle = setTimeout(() => resolve(false), 7500);
        }),
      ]);

      if (!sdkConnected) {
        await disableNetwork(db!).catch(() => undefined);
        return false;
      }
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        await disableNetwork(db!).catch(() => undefined);
      }
      return false;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  })();

  try {
    return await inFlightConnectionCheck;
  } finally {
    inFlightConnectionCheck = null;
  }
}

export async function signInWithGoogleAdmin() {
  if (!auth) throw new Error('Firebase Auth غير مهيأ.');
  await ensureFirestoreNetwork();
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebase() {
  if (!auth) return;
  await signOut(auth);
}
