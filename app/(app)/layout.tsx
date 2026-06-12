import { DataProvider } from "@/components/DataProvider";
import { AppShell } from "@/components/dashboard/AppShell";
import { getCurrentUser } from "@/lib/auth";

// Server component: resolve the session user on the server so the sidebar / login
// state is correct on first paint — no client /api/me round-trip flash on refresh.
// (Live portfolio data still loads async via WS/REST; it must not be SSR'd because it
// hits the exchanges.) Reading the cookie opts this layout into dynamic rendering,
// which is what we want for an authenticated dashboard.
export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const initialUser = await getCurrentUser();
	return (
		<DataProvider initialUser={initialUser}>
			<AppShell>{children}</AppShell>
		</DataProvider>
	);
}
