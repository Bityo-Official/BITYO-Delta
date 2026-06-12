"use client";
import { useDashboard } from "@/components/dashboard/AppShell";
import { OverviewPage } from "@/components/dashboard/pages";

export default function Page() {
	return <OverviewPage {...useDashboard()} />;
}
