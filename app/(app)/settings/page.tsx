"use client";
import { useDashboard } from "@/components/dashboard/AppShell";
import { SettingsPage } from "@/components/dashboard/SettingsPage";

export default function Page() {
	const { dark, onToggleTheme } = useDashboard();
	return <SettingsPage dark={dark} onToggleTheme={onToggleTheme} />;
}
