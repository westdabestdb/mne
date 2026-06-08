import { createAuthClient } from "better-auth/react";

// Browser-side better-auth client for client components (sign-in / sign-up / sign-out).
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});

export const { signIn, signUp, signOut, useSession } = authClient;
