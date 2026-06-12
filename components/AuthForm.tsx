"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
// AuthForm.tsx — shared login / register form (Tailwind; theme comes from the
// pre-hydration <html> classes set by the root layout script).
import React from "react";
import { cn } from "@/lib/theme";

const INPUT_CLS =
	"w-full rounded-lg border border-line bg-card2 px-3.5 py-3 font-mono text-sm text-ink outline-none focus:border-primary/50";
const LABEL_CLS = "mb-1.5 block font-sans text-xs font-semibold text-sec";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
	const router = useRouter();
	const [email, setEmail] = React.useState("");
	const [password, setPassword] = React.useState("");
	const [name, setName] = React.useState("");
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const isRegister = mode === "register";

	// surface OAuth callback errors (?error=…) — read from the URL directly to avoid
	// pulling in useSearchParams (which would force this static page dynamic)
	React.useEffect(() => {
		const e = new URLSearchParams(window.location.search).get("error");
		if (e) setError(e);
	}, []);

	async function submit(ev: React.FormEvent) {
		ev.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const r = await fetch(`/api/auth/${mode}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					isRegister ? { email, password, name } : { email, password },
				),
			});
			const j = await r.json();
			if (!r.ok) {
				setError(j.error ?? "發生錯誤");
			} else {
				router.push("/dashboard");
				router.refresh();
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "網路錯誤");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-app p-5 font-sans">
			<div className="w-[min(400px,100%)]">
				{/* wordmark */}
				<div className="mb-6 flex items-center justify-center gap-2.5">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src="/icon.png"
						alt="Bityo Delta"
						width={34}
						height={34}
						className="h-[34px] w-[34px] rounded-[9px] object-contain"
					/>
					<div>
						<div className="text-lg font-bold tracking-tight text-ink">
							Bityo Delta
						</div>
						<div className="text-[11px] text-ter">跨所合約記帳</div>
					</div>
				</div>

				<div className="rounded-[14px] border border-line bg-card p-7">
					<div className="mb-1 text-xl font-bold text-ink">
						{isRegister ? "建立帳號" : "登入"}
					</div>
					<div className="mb-5 text-[13px] text-sec">
						{isRegister ? "註冊後即可連接交易所 API Key" : "歡迎回來"}
					</div>

					{/* Google OAuth — full-page redirect (not fetch) */}
					<a
						href="/api/auth/google"
						className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-card2 py-3 text-sm font-semibold text-ink no-underline transition-colors hover:bg-sunken"
					>
						<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
							<path
								fill="#4285F4"
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
							/>
							<path
								fill="#34A853"
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
							/>
							<path
								fill="#FBBC05"
								d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
							/>
							<path
								fill="#EA4335"
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
							/>
						</svg>
						使用 Google {isRegister ? "註冊" : "登入"}
					</a>

					<div className="my-5 flex items-center gap-3">
						<div className="h-px flex-1 bg-line" />
						<span className="font-sans text-xs text-ter">或</span>
						<div className="h-px flex-1 bg-line" />
					</div>

					<form onSubmit={submit} className="flex flex-col gap-4">
						{isRegister && (
							<div>
								<label className={LABEL_CLS} htmlFor="auth-name">
									名稱（選填）
								</label>
								<input
									id="auth-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									className={cn(INPUT_CLS, "font-sans")}
								/>
							</div>
						)}
						<div>
							<label className={LABEL_CLS} htmlFor="auth-email">
								Email
							</label>
							<input
								id="auth-email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								type="email"
								required
								className={INPUT_CLS}
								autoComplete="email"
							/>
						</div>
						<div>
							<label className={LABEL_CLS} htmlFor="auth-pass">
								密碼
							</label>
							<input
								id="auth-pass"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								type="password"
								required
								minLength={isRegister ? 8 : undefined}
								className={INPUT_CLS}
								autoComplete={isRegister ? "new-password" : "current-password"}
							/>
						</div>
						{error && <div className="text-xs text-down">{error}</div>}
						<button
							type="submit"
							disabled={busy}
							className={cn(
								"rounded-lg border-0 py-3 text-sm font-semibold text-white",
								busy
									? "cursor-default bg-line-strong"
									: "cursor-pointer bg-primary",
							)}
						>
							{busy ? "處理中…" : isRegister ? "註冊" : "登入"}
						</button>
					</form>

					<div className="mt-[18px] text-center text-[13px] text-sec">
						{isRegister ? "已有帳號？" : "還沒有帳號？"}{" "}
						<Link
							href={isRegister ? "/login" : "/register"}
							className="font-bold text-primary no-underline"
						>
							{isRegister ? "登入" : "註冊"}
						</Link>
					</div>
				</div>

				<div className="mt-[18px] text-center">
					<Link href="/" className="text-xs text-ter no-underline">
						← 返回首頁
					</Link>
				</div>
			</div>
		</div>
	);
}
