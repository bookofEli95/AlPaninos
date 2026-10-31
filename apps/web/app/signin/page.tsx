import type { Metadata } from "next";
import AuthShell, { safeNext } from "@/components/account/auth-shell";
import SignInForm from "@/components/account/sign-in-form";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Al Paninos account to order faster, see your orders and earn PaninoPoints.",
};

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const { next } = await searchParams;
  return (
    <AuthShell>
      <SignInForm next={safeNext(next)} />
    </AuthShell>
  );
}
