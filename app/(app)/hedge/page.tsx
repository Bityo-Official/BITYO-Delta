"use client";
import { useDashboard } from "@/components/dashboard/AppShell";
import { HedgePage } from "@/components/dashboard/pages";

export default function Page() {
	return <HedgePage {...useDashboard()} />;
}
