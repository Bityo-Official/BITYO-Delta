"use client";
import { useDashboard } from "@/components/dashboard/AppShell";
import { LedgerPage } from "@/components/dashboard/pages";

export default function Page() {
	return <LedgerPage {...useDashboard()} />;
}
