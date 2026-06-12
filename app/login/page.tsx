import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
	title: "登入",
	description: "登入 Bityo Delta,管理你的跨所合約持倉與對沖記帳。",
	alternates: { canonical: "/login" },
	robots: { index: false, follow: true },
};

export default function LoginPage() {
	return <AuthForm mode="login" />;
}
