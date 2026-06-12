"use client";
import Link from "next/link";
// SettingsPage.tsx — connect / manage exchange API keys (live CRUD against /api/accounts).
import React from "react";
import { useData } from "@/components/DataProvider";
import { ExChip, MiniTag, ThemeToggle } from "@/components/primitives";
import { EXCHANGE_META, type ExchangeKey } from "@/lib/exchanges/types";
import { cn } from "@/lib/theme";
import { DPageHead, DPanel } from "./parts";

const EXCHANGE_KEYS = Object.keys(EXCHANGE_META) as ExchangeKey[];

interface AccountRow {
	id: string;
	exchange: ExchangeKey;
	label: string | null;
	apiKeyMasked: string;
	enabled: boolean;
	lastError: string | null;
	verified: boolean;
}

// shared input style — hairline border on the sunken surface
const INPUT_CLS =
	"w-full rounded-lg border border-line bg-card2 px-3 py-[11px] font-mono text-[13px] text-ink outline-none focus:border-primary/50";
const LABEL_CLS = "mb-1.5 block font-sans text-xs font-semibold text-sec";

export function SettingsPage({
	dark,
	onToggleTheme,
}: {
	dark: boolean;
	onToggleTheme: () => void;
}) {
	const { user, refresh } = useData();
	const headToggle = <ThemeToggle dark={dark} onToggle={onToggleTheme} />;
	const [accounts, setAccounts] = React.useState<AccountRow[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [form, setForm] = React.useState({
		exchange: "binance" as ExchangeKey,
		apiKey: "",
		apiSecret: "",
		passphrase: "",
		label: "",
	});
	const [busy, setBusy] = React.useState(false);
	const [msg, setMsg] = React.useState<{
		kind: "ok" | "err";
		text: string;
	} | null>(null);

	// third-party (OAuth) account links
	const [conn, setConn] = React.useState<{
		hasPassword: boolean;
		google: { linked: boolean; email: string | null; image: string | null };
	} | null>(null);
	const [connMsg, setConnMsg] = React.useState<{
		kind: "ok" | "err";
		text: string;
	} | null>(null);
	const loadConn = React.useCallback(async () => {
		const r = await fetch("/api/me/connections");
		if (r.ok) setConn(await r.json());
	}, []);
	React.useEffect(() => {
		if (user) loadConn();
	}, [user, loadConn]);
	// surface the Google link callback result (?linked=google / ?error=…)
	React.useEffect(() => {
		const p = new URLSearchParams(window.location.search);
		if (p.get("linked") === "google")
			setConnMsg({ kind: "ok", text: "已成功綁定 Google" });
		else if (p.get("error"))
			setConnMsg({ kind: "err", text: p.get("error") as string });
		if (p.get("linked") || p.get("error"))
			window.history.replaceState(null, "", window.location.pathname);
	}, []);
	async function unlinkGoogle() {
		setConnMsg(null);
		const r = await fetch("/api/me/connections", { method: "DELETE" });
		const j = await r.json();
		if (!r.ok) setConnMsg({ kind: "err", text: j.error ?? "解除失敗" });
		else {
			setConnMsg({ kind: "ok", text: "已解除 Google 綁定" });
			await loadConn();
		}
	}

	const load = React.useCallback(async () => {
		setLoading(true);
		try {
			const r = await fetch("/api/accounts");
			if (r.ok) setAccounts((await r.json()).accounts);
		} finally {
			setLoading(false);
		}
	}, []);
	React.useEffect(() => {
		if (user) load();
		else setLoading(false);
	}, [user, load]);

	const meta = EXCHANGE_META[form.exchange];

	async function add(ev: React.FormEvent) {
		ev.preventDefault();
		setBusy(true);
		setMsg(null);
		try {
			const r = await fetch("/api/accounts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(form),
			});
			const j = await r.json();
			if (!r.ok) {
				setMsg({ kind: "err", text: j.error ?? "新增失敗" });
			} else {
				setMsg(
					j.testError
						? { kind: "err", text: `已儲存，但連線測試失敗：${j.testError}` }
						: { kind: "ok", text: "已新增並通過連線測試" },
				);
				setForm({
					...form,
					apiKey: "",
					apiSecret: "",
					passphrase: "",
					label: "",
				});
				await load();
				refresh();
			}
		} catch (e) {
			setMsg({ kind: "err", text: e instanceof Error ? e.message : "錯誤" });
		} finally {
			setBusy(false);
		}
	}

	async function remove(id: string) {
		await fetch(`/api/accounts/${id}`, { method: "DELETE" });
		await load();
		refresh();
	}

	// inline 備註 editing — PATCH /api/accounts/[id] { label }
	const [editingId, setEditingId] = React.useState<string | null>(null);
	const [draftLabel, setDraftLabel] = React.useState("");
	async function saveLabel(id: string) {
		await fetch(`/api/accounts/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ label: draftLabel.trim() }),
		});
		setEditingId(null);
		await load();
		refresh();
	}
	async function test(id: string) {
		setMsg(null);
		const r = await fetch(`/api/accounts/${id}/test`, { method: "POST" });
		const j = await r.json();
		setMsg(
			j.ok
				? { kind: "ok", text: "連線正常" }
				: { kind: "err", text: j.error ?? "連線失敗" },
		);
		await load();
	}

	if (!user) {
		return (
			<div>
				<DPageHead title="設定" sub="交易所連接與偏好設定" right={headToggle} />
				<DPanel title="請先登入">
					<div className="mb-4 font-sans text-[13px] leading-relaxed text-sec">
						連接交易所 API Key 需要登入帳號。金鑰會以 AES-256-GCM
						加密儲存，僅用於唯讀讀取持倉與資產。
					</div>
					<div className="flex gap-2.5">
						<Link
							href="/login"
							className="rounded-lg bg-primary px-5 py-[11px] font-sans text-[13px] font-semibold text-white no-underline"
						>
							登入
						</Link>
						<Link
							href="/register"
							className="rounded-lg border border-line px-5 py-[11px] font-sans text-[13px] font-semibold text-ink no-underline"
						>
							註冊
						</Link>
					</div>
				</DPanel>
			</div>
		);
	}

	return (
		<div>
			<DPageHead title="設定" sub="交易所連接與偏好設定" right={headToggle} />

			{/* read-only key advisory */}
			<div className="mb-4 flex gap-2.5 rounded-[10px] border border-primary/20 bg-primary/5 px-4 py-3.5">
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					className="mt-px shrink-0 text-primary"
					aria-hidden="true"
				>
					<path
						d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinejoin="round"
					/>
					<path
						d="M9 12l2 2 4-4"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<div>
					<div className="font-sans text-[13px] font-bold text-ink">
						建議使用唯讀權限金鑰
					</div>
					<div className="mt-0.5 font-sans text-xs leading-snug text-sec">
						請僅授予「讀取 / 持倉」權限，勿開啟提領與下單。金鑰以 AES-256-GCM
						加密儲存於伺服器，永不回傳前端。
					</div>
				</div>
			</div>

			<div className="flex flex-wrap items-start gap-4">
				<DPanel
					title="已連接交易所"
					hint={`${accounts.length} 個`}
					className="min-w-[300px] flex-[1.3_1_360px]"
				>
					{loading ? (
						<div className="py-5 font-sans text-[13px] text-ter">載入中…</div>
					) : accounts.length === 0 ? (
						<div className="py-5 text-center font-sans text-[13px] text-ter">
							尚未連接任何交易所
						</div>
					) : (
						<div className="flex flex-col gap-2.5">
							{accounts.map((a) => (
								<div
									key={a.id}
									className={cn(
										"rounded-[10px] border bg-card2 p-3.5",
										a.lastError ? "border-down/35" : "border-line-soft",
									)}
								>
									<div className="flex flex-wrap items-center gap-3">
										<ExChip ex={a.exchange} size={34} radius={10} />
										<div className="min-w-[120px] flex-1">
											<div className="flex flex-wrap items-center gap-1.5">
												<span className="font-sans text-sm font-bold text-ink">
													{EXCHANGE_META[a.exchange].name}
												</span>
												{/* user-supplied note (備註) — click ✎ to edit inline */}
												{editingId === a.id ? (
													<span className="inline-flex items-center gap-1">
														<input
															value={draftLabel}
															onChange={(e) => setDraftLabel(e.target.value)}
															onKeyDown={(e) => {
																if (e.key === "Enter") saveLabel(a.id);
																if (e.key === "Escape") setEditingId(null);
															}}
															// biome-ignore lint/a11y/noAutofocus: focus follows an explicit user click on 編輯備註
															autoFocus
															placeholder="備註"
															className="w-28 rounded border border-line bg-card2 px-1.5 py-0.5 font-sans text-[11px] text-ink outline-none focus:border-primary/50"
														/>
														<button
															type="button"
															onClick={() => saveLabel(a.id)}
															className="cursor-pointer rounded border-0 bg-primary px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white"
														>
															存
														</button>
														<button
															type="button"
															onClick={() => setEditingId(null)}
															className="cursor-pointer rounded border border-line bg-transparent px-1.5 py-0.5 font-sans text-[11px] text-sec"
														>
															取消
														</button>
													</span>
												) : (
													<button
														type="button"
														title="編輯備註"
														onClick={() => {
															setEditingId(a.id);
															setDraftLabel(a.label ?? "");
														}}
														className="inline-flex cursor-pointer items-center gap-1 rounded border-0 bg-sunken px-1.5 py-px font-sans text-[11px] font-medium text-sec hover:text-ink dark:bg-card"
													>
														{a.label || "加備註"}
														<svg
															width="10"
															height="10"
															viewBox="0 0 24 24"
															fill="none"
															aria-hidden="true"
														>
															<path
																d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z"
																stroke="currentColor"
																strokeWidth="2"
																strokeLinejoin="round"
															/>
														</svg>
													</button>
												)}
												{!a.verified && <MiniTag tone="warn">未驗證</MiniTag>}
											</div>
											<div className="mt-[3px] flex items-center gap-[5px]">
												<span
													className={cn(
														"h-1.5 w-1.5 rounded-full",
														a.lastError ? "bg-down" : "bg-up",
													)}
												/>
												<span className="font-mono text-[11px] text-sec">
													{a.apiKeyMasked}
												</span>
											</div>
										</div>
										<button
											type="button"
											onClick={() => test(a.id)}
											className="cursor-pointer rounded-[7px] border border-line bg-transparent px-3 py-[7px] font-sans text-xs font-medium text-ink"
										>
											測試
										</button>
										<button
											type="button"
											onClick={() => remove(a.id)}
											className="cursor-pointer rounded-[7px] border border-down/35 bg-transparent px-3 py-[7px] font-sans text-xs font-medium text-down"
										>
											移除
										</button>
									</div>
									{a.lastError && (
										<div className="mt-2.5 break-words font-mono text-[11px] leading-relaxed text-down">
											{a.lastError}
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</DPanel>

				<DPanel title="新增交易所" className="min-w-[280px] flex-[1_1_300px]">
					<form onSubmit={add} className="flex flex-col gap-3.5">
						<div>
							<label className={LABEL_CLS} htmlFor="hb-exchange">
								交易所
							</label>
							<select
								id="hb-exchange"
								value={form.exchange}
								onChange={(e) =>
									setForm({ ...form, exchange: e.target.value as ExchangeKey })
								}
								className={cn(INPUT_CLS, "font-sans")}
							>
								{EXCHANGE_KEYS.map((k) => (
									<option key={k} value={k}>
										{EXCHANGE_META[k].name}
										{EXCHANGE_META[k].verified ? "" : "（未驗證）"}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className={LABEL_CLS} htmlFor="hb-key">
								API Key
							</label>
							<input
								id="hb-key"
								value={form.apiKey}
								onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
								className={INPUT_CLS}
								autoComplete="off"
								required
							/>
						</div>
						<div>
							<label className={LABEL_CLS} htmlFor="hb-secret">
								API Secret
							</label>
							<input
								id="hb-secret"
								value={form.apiSecret}
								onChange={(e) =>
									setForm({ ...form, apiSecret: e.target.value })
								}
								type="password"
								className={INPUT_CLS}
								autoComplete="off"
								required
							/>
						</div>
						{meta.requiresPassphrase && (
							<div>
								<label className={LABEL_CLS} htmlFor="hb-pass">
									Passphrase
								</label>
								<input
									id="hb-pass"
									value={form.passphrase}
									onChange={(e) =>
										setForm({ ...form, passphrase: e.target.value })
									}
									type="password"
									className={INPUT_CLS}
									autoComplete="off"
									required
								/>
							</div>
						)}
						<div>
							<label className={LABEL_CLS} htmlFor="hb-label">
								備註（選填）
							</label>
							<input
								id="hb-label"
								value={form.label}
								onChange={(e) => setForm({ ...form, label: e.target.value })}
								className={cn(INPUT_CLS, "font-sans")}
							/>
						</div>
						{msg && (
							<div
								className={cn(
									"font-sans text-xs leading-relaxed",
									msg.kind === "ok" ? "text-up" : "text-down",
								)}
							>
								{msg.text}
							</div>
						)}
						<button
							type="submit"
							disabled={busy}
							className={cn(
								"rounded-lg border-0 py-[11px] font-sans text-[13.5px] font-semibold text-white",
								busy
									? "cursor-default bg-line-strong"
									: "cursor-pointer bg-primary",
							)}
						>
							{busy ? "連線測試中…" : "連接交易所"}
						</button>
					</form>
				</DPanel>
			</div>

			{/* third-party account links */}
			<div className="mt-4">
				<DPanel title="第三方帳號" hint="登入方式">
					<div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line-soft bg-card2 p-3.5">
						{/* Google glyph */}
						<span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-sunken dark:bg-card">
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
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
						</span>
						<div className="min-w-[120px] flex-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-sans text-sm font-bold text-ink">
									Google
								</span>
								{conn?.google.linked ? (
									<MiniTag tone="primary">已綁定</MiniTag>
								) : (
									<MiniTag tone="warn">未綁定</MiniTag>
								)}
							</div>
							<div className="mt-[3px] font-mono text-[11px] text-sec">
								{conn === null
									? "讀取中…"
									: conn.google.linked
										? conn.google.email
										: "綁定後可用 Google 一鍵登入"}
							</div>
						</div>
						{conn?.google.linked ? (
							<button
								type="button"
								onClick={unlinkGoogle}
								disabled={!conn.hasPassword}
								title={
									conn.hasPassword
										? "解除 Google 綁定"
										: "請先設定密碼，才能解除綁定"
								}
								className={cn(
									"rounded-[7px] border px-3 py-[7px] font-sans text-xs font-medium",
									conn.hasPassword
										? "cursor-pointer border-down/35 bg-transparent text-down"
										: "cursor-not-allowed border-line bg-transparent text-ter",
								)}
							>
								解除綁定
							</button>
						) : (
							<a
								href="/api/auth/google?link=1"
								className="cursor-pointer rounded-[7px] border-0 bg-primary px-3.5 py-[7px] font-sans text-xs font-semibold text-white no-underline"
							>
								綁定 Google
							</a>
						)}
					</div>
					{connMsg && (
						<div
							className={cn(
								"mt-2.5 font-sans text-xs leading-relaxed",
								connMsg.kind === "ok" ? "text-up" : "text-down",
							)}
						>
							{connMsg.text}
						</div>
					)}
				</DPanel>
			</div>
		</div>
	);
}
