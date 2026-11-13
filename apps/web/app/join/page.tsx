import type { Metadata } from "next";
import AuthShell, { safeNext } from "@/components/account/auth-shell";
import JoinForm from "@/components/account/join-form";

export const metadata: Metadata = {
  title: "Join PaninoPoints",
  description: "Join PaninoPoints, free. Earn 10 points for every $1 and redeem them for free dips, drinks, sides and sandwiches at Al Panino's.",
};

export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { next } = await searchParams;
  return (
    <AuthShell>
      <JoinForm next={safeNext(next)} />
    </AuthShell>
  );
}
