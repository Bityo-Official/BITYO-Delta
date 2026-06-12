import { redirect } from "next/navigation";
import { DataProvider } from "@/components/DataProvider";
import { AppShell } from "@/components/dashboard/AppShell";
import { getCurrentUser } from "@/lib/auth";

// Server component + AUTH GATE: the dashboard requires login. Resolve the session user
// on the server (from the JWT — no DB round-trip) so the chrome is correct on first
// paint; if there's no valid session, redirect to /login before rendering anything.
export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const initialUser = await getCurrentUser();
	if (!initialUser) redirect("/login");
	return (
		<DataProvider initialUser={initialUser}>
			<AppShell>{children}</AppShell>
		</DataProvider>
	);
}
