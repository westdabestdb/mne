import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth-server";

// better-auth's catch-all endpoint: sign-in / sign-up / sign-out / session.
export const { GET, POST } = toNextJsHandler(auth);
