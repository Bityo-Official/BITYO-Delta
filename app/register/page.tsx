import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
	title: "免費註冊 — 開始跨所合約對沖記帳",
	description:
		"註冊 Bityo Delta,連接 Binance、Bybit、OKX 等七大交易所,即時掌握跨所合約持倉、對沖與資金費率。",
	alternates: { canonical: "/register" },
};

export default function RegisterPage() {
	return <AuthForm mode="register" />;
}
