import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { jwtVerify, createRemoteJWKSet } from 'jose';

// A Vercel Serverless Function (auto-detected from the api/ directory —
// no framework needed). This is the ONLY server-side code outside Firebase
// Cloud Functions: it exists purely to hand the browser a short-lived,
// narrowly-scoped upload token for Vercel Blob, since BLOB_READ_WRITE_TOKEN
// itself must never reach the client.
//
// Auth is verified here WITHOUT the Firebase Admin SDK — no service-account
// secret needs to live in Vercel at all. A Firebase ID token is a standard
// RS256 JWT; verifying its signature against Google's published public keys
// (via `jose`) and checking issuer/audience/expiry is exactly what the
// Admin SDK does internally, just without needing a service account to do it.
//
// Uses the classic (req, res) signature, not the Web-standard Request/Response
// one — Vercel's plain Node.js function runtime (no framework) hands you an
// IncomingMessage-based VercelRequest here, not a Fetch API Request.

const FIREBASE_PROJECT_ID = 'helpcertify-v1';
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

interface FirebaseIdTokenClaims {
  sub: string;
}

async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdTokenClaims> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });
  return payload as unknown as FirebaseIdTokenClaims;
}

const ALLOWED_CONTENT_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — matches the old Multer limit

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req, // handleUpload accepts a Node IncomingMessage directly — no Request adaptation needed
      // @vercel/blob/client's upload() has no custom-headers option, so the
      // Firebase ID token travels as clientPayload instead (see
      // uploadsApi.ts) and is verified right here, before a token is ever issued.
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const idToken = clientPayload ? (JSON.parse(clientPayload) as { idToken?: string }).idToken : undefined;
        if (!idToken) throw new Error('Missing Firebase ID token');

        let claims: FirebaseIdTokenClaims;
        try {
          claims = await verifyFirebaseIdToken(idToken);
        } catch {
          throw new Error('Invalid or expired token');
        }

        // Not gated to role: 'admin' here on purpose — role now lives only
        // on the Firestore users/{uid} doc (see api/admin.ts's requireAdmin),
        // and looking that up would mean pulling in the Firebase Admin SDK
        // (a service-account secret) into the one file that deliberately
        // avoids it. The real enforcement point is api/content-admin.ts's
        // createQuiz/createPracticeTest, which does check admin role via
        // Firestore before anything uploaded here can become a quiz —
        // a non-admin uploading a file to the private Blob store on its own
        // achieves nothing.
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ uid: claims.sub }),
        };
      },
      // No onUploadCompleted webhook logic: the client explicitly calls the
      // registerUpload Cloud Function with the resulting blob URL right
      // after upload() resolves (see the frontend admin upload page),
      // rather than relying on Vercel calling back to this route.
      onUploadCompleted: async () => {},
    });
    res.status(200).json(jsonResponse);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
}
