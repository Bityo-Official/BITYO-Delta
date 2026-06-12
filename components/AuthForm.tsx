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
				router.push("/");
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
						← 以訪客身分瀏覽展示資料
					</Link>
				</div>
			</div>
		</div>
	);
}
