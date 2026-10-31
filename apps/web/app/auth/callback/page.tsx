import type { Metadata } from "next";
import { safeNext } from "@/components/account/auth-shell";
import AuthCallback from "@/components/account/auth-callback";

export const metadata: Metadata = { title: "Signing In", robots: { index: false } };

// Where Google sends people back to after signing in.
export default async function AuthCallbackPage({ searchParams }: PageProps<"/auth/callback">) {
  const { next } = await searchParams;
  return <AuthCallback next={safeNext(next)} />;
}
