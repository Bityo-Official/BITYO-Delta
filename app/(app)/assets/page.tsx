"use client";
import { useDashboard } from "@/components/dashboard/AppShell";
import { AssetsPage } from "@/components/dashboard/pages";

export default function Page() {
	return <AssetsPage {...useDashboard()} />;
}
