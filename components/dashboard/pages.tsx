"use client";
// pages.tsx — Overview / Hedge / Ledger / Assets route views (Tailwind).
// Layout language: StatBar header stats → content panels; hairline dividers carry
// the hierarchy. All numerals are tabular mono.
import React from "react";
import {
	CoinDot,
	Donut,
	ExChip,
	Money,
	Segmented,
	SideTag,
	ThemeToggle,
} from "@/components/primitives";
import {
	type Exposure,
	type HedgePair,
	isHedgedBase,
	liqDistance,
	type Totals,
} from "@/lib/derive";
import {
	EXCHANGE_META,
	type ExchangeKey,
	type NormBalance,
	type NormPosition,
	type NormTrade,
} from "@/lib/exchanges/types";
import { cn, fmtNum, fmtPct, fmtPrice, fmtSigned, fmtUSD } from "@/lib/theme";
import {
	DPageHead,
	DPanel,
	DTableRow,
	ExName,
	MicroLabel,
	SLICE_PALETTE,
	StatBar,
	TD_NUM_CLS,
	TH_CLS,
	TH_LEFT_CLS,
} from "./parts";

export interface PageProps {
	positions: NormPosition[];
	balances: NormBalance[];
	trades: NormTrade[];
	totals: Totals;
	hedges: HedgePair[];
	/** coins that have at least one long AND one short (hedged baskets) */
	hedgedBases: Set<string>;
	/** exchange → user note (備註) saved with the API key */
	labels: Record<string, string>;
	exposure: Exposure[];
	demo: boolean;
	onOpen: (p: NormPosition) => void;
	// theme toggle hosted on each page's title row
	dark: boolean;
	onToggleTheme: () => void;
}

function slicesOf(balances: NormBalance[]) {
	return balances
		.map((b, i) => ({
			exchange: b.exchange,
			label: EXCHANGE_META[b.exchange].name,
			value: b.equity,
			color: SLICE_PALETTE[i % SLICE_PALETTE.length],
		}))
		.filter((s) => s.value > 0);
}

function Empty({ msg }: { msg: string }) {
	return (
		<div className="py-9 text-center font-sans text-xs text-ter">{msg}</div>
	);
}

const upDown = (v: number) => (v >= 0 ? "text-up" : "text-down");

// ════════════ OVERVIEW ════════════
export function OverviewPage({
	positions,
	balances,
	totals,
	hedges,
	labels,
	onOpen,
	demo,
	dark,
	onToggleTheme,
}: PageProps) {
	const slices = slicesOf(balances);
	const totalEq = slices.reduce((s, x) => s + x.value, 0) || totals.equity;
	const sorted = [...positions].sort(
		(a, b) => b.mark * b.size - a.mark * a.size,
	);

	// 各所摘要：合約資產 + 淨倉位價值（多 − 空）
	const perExchange = balances.map((b) => {
		const ps = positions.filter((p) => p.exchange === b.exchange);
		const net = ps.reduce(
			(s, p) => s + (p.side === "long" ? 1 : -1) * p.mark * p.size,
			0,
		);
		return { exchange: b.exchange, equity: b.equity, net, count: ps.length };
	});

	return (
		<div>
			<DPageHead
				title="跨所合約總覽"
				sub={`${positions.length} 個持倉 · ${balances.length} 間交易所${demo ? " · 展示資料" : ""}`}
				right={<ThemeToggle dark={dark} onToggle={onToggleTheme} />}
			/>

			<StatBar
				stats={[
					{
						label: "跨所總合約資產",
						value: fmtUSD(totals.equity),
						sub: `${fmtSigned(totals.realizedRecent)} · 24H 已實現`,
						subCls: upDown(totals.realizedRecent),
					},
					{
						label: "未實現損益",
						value: fmtSigned(totals.upnl),
						valueCls: upDown(totals.upnl),
						sub: `${totals.marginUsed ? fmtPct((totals.upnl / totals.marginUsed) * 100) : "—"} ROE`,
						subCls: upDown(totals.upnl),
					},
					{
						label: "淨曝險 Delta",
						value: fmtSigned(totals.netDelta, 0),
						valueCls: upDown(totals.netDelta),
						sub: totals.netDelta >= 0 ? "偏多" : "偏空",
					},
					{
						label: "已用保證金",
						value: fmtUSD(totals.marginUsed),
						sub: `使用率 ${totals.equity ? ((totals.marginUsed / totals.equity) * 100).toFixed(1) : "0"}%`,
					},
					{
						label: "累計資金費",
						value: fmtSigned(totals.fundingToday),
						valueCls: upDown(totals.fundingToday),
						sub: `${hedges.length} 組對沖`,
					},
				]}
			/>

			{/* 各所摘要：合約資產 + 淨倉位（多 − 空） */}
			{perExchange.length > 0 && (
				<div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
					{perExchange.map((x) => (
						<div
							key={x.exchange}
							className="rounded-xl border border-line bg-card px-4 py-3"
						>
							<div className="mb-2.5 flex items-center gap-1.5">
								<ExName ex={x.exchange} label={labels[x.exchange]} chip={18} />
								<span className="ml-auto font-mono text-[10.5px] text-ter">
									{x.count} 倉
								</span>
							</div>
							<div className="flex items-end justify-between gap-2">
								<div>
									<MicroLabel>合約資產</MicroLabel>
									<div className="mt-1 font-mono text-[15px] font-semibold tracking-tight text-ink">
										{fmtUSD(x.equity, 0)}
									</div>
								</div>
								<div className="text-right">
									<MicroLabel>淨倉位 多−空</MicroLabel>
									<div
										className={cn(
											"mt-1 font-mono text-[15px] font-semibold tracking-tight",
											x.net === 0 ? "text-sec" : upDown(x.net),
										)}
									>
										{fmtSigned(x.net, 0)}
									</div>
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			<div className="flex flex-wrap items-start gap-3.5">
				{/* positions table */}
				<DPanel
					title="持倉明細"
					hint="點列查看詳情"
					className="min-w-[320px] flex-[2.2_1_560px] !p-4"
				>
					{sorted.length === 0 ? (
						<Empty msg="目前沒有未平倉部位" />
					) : (
						<div className="-mx-1.5 overflow-x-auto">
							<table className="w-full min-w-[780px] border-collapse">
								<thead>
									<tr className="border-b border-line">
										<th className={cn(TH_LEFT_CLS, "pl-1.5")}>合約 / 交易所</th>
										<th className={TH_LEFT_CLS}>方向</th>
										<th className={TH_CLS}>槓桿</th>
										<th className={TH_CLS}>數量</th>
										<th className={TH_CLS}>倉位價值</th>
										<th className={TH_CLS}>持倉均價</th>
										<th className={TH_CLS}>標記價格</th>
										<th className={TH_CLS}>強平價格</th>
										<th className={TH_CLS}>保證金</th>
										<th className={TH_CLS}>未實現</th>
										<th className={TH_CLS}>ROE</th>
										<th className={TH_CLS}>距爆倉</th>
									</tr>
								</thead>
								<tbody>
									{sorted.map((p, i) => (
										<DTableRow
											key={`${p.exchange}-${p.symbol}-${p.side}-${i}`}
											p={p}
											label={labels[p.exchange]}
											onClick={() => onOpen(p)}
										/>
									))}
								</tbody>
							</table>
						</div>
					)}
				</DPanel>

				{/* right rail */}
				<div className="flex min-w-[270px] flex-[1_1_300px] flex-col gap-3.5">
					<DPanel title="風險警示">
						{sorted.length === 0 ? (
							<Empty msg="無" />
						) : (
							<div className="flex flex-col">
								{[...positions]
									.sort((a, b) => liqDistance(a) - liqDistance(b))
									.slice(0, 5)
									.map((p, i, arr) => {
										const d = liqDistance(p);
										const barCls =
											d < 8 ? "bg-down" : d < 15 ? "bg-warn" : "bg-up";
										const txtCls =
											d < 8 ? "text-down" : d < 15 ? "text-warn" : "text-up";
										return (
											<div
												key={`${p.exchange}-${p.symbol}-${p.side}`}
												className={cn(
													"flex items-center gap-2 py-2",
													i < arr.length - 1 && "border-b border-line-soft",
												)}
											>
												<CoinDot base={p.base} size={22} />
												<span className="font-sans text-xs font-semibold text-ink">
													{p.base}
												</span>
												<ExChip ex={p.exchange} size={14} radius={4} />
												<div className="flex-1" />
												<div className="h-[3px] w-14 overflow-hidden rounded-sm bg-sunken dark:bg-card2">
													<div
														className={cn("h-full rounded-sm", barCls)}
														style={{
															width: `${Math.max(8, Math.min(100, 100 - d * 2.6))}%`,
														}}
													/>
												</div>
												<span
													className={cn(
														"w-[46px] text-right font-mono text-[11.5px] font-medium",
														txtCls,
													)}
												>
													{d >= 999 ? "—" : `${d.toFixed(1)}%`}
												</span>
											</div>
										);
									})}
							</div>
						)}
					</DPanel>

					<DPanel title="對沖組合">
						{hedges.length === 0 ? (
							<Empty msg="尚無跨所對沖組合" />
						) : (
							<div className="flex flex-col">
								{hedges.map((h, i) => (
									<div
										key={h.id}
										className={cn(
											"flex items-center gap-2.5 py-2",
											i < hedges.length - 1 && "border-b border-line-soft",
										)}
									>
										<CoinDot base={h.base} size={22} />
										<div className="flex-1">
											<div className="font-sans text-xs font-semibold text-ink">
												{h.base}
												<span
													className={cn(
														"ml-1.5 text-[10.5px] font-medium",
														h.neutral ? "text-up" : "text-warn",
													)}
												>
													{h.neutral ? "中性" : "偏移"}
												</span>
											</div>
											<div className="mt-[3px] flex items-center gap-1">
												{[...h.longs, ...h.shorts].slice(0, 4).map((leg, j) => (
													<ExChip
														key={`${leg.exchange}-${leg.side}-${j}`}
														ex={leg.exchange}
														size={13}
														radius={4}
													/>
												))}
												<span className="ml-1 font-mono text-[10.5px] text-ter">
													資金費 {fmtSigned(h.netFunding, 1)}
												</span>
											</div>
										</div>
										<Money
											value={h.netUpnl}
											className="text-xs font-semibold"
										/>
									</div>
								))}
							</div>
						)}
					</DPanel>

					<DPanel title="資產分佈">
						{slices.length === 0 ? (
							<Empty msg="無" />
						) : (
							<div className="flex items-center gap-[18px]">
								<div className="relative h-24 w-24 shrink-0">
									<Donut slices={slices} size={96} thickness={10} />
									<div className="absolute inset-0 flex items-center justify-center">
										<span className="font-mono text-xs font-semibold text-ink">
											{fmtUSD(totalEq, 0)}
										</span>
									</div>
								</div>
								<div className="flex flex-1 flex-col gap-[7px]">
									{slices.map((s) => (
										<div
											key={s.exchange}
											className="flex items-center gap-[7px]"
										>
											<span
												className="h-[7px] w-[7px] shrink-0 rounded-sm"
												style={{ background: s.color }}
											/>
											<ExChip ex={s.exchange} size={14} radius={4} />
											<span className="flex-1 font-sans text-[11.5px] text-sec">
												{s.label}
											</span>
											<span className="font-mono text-[11px] font-medium text-ink">
												{((s.value / totalEq) * 100).toFixed(0)}%
											</span>
										</div>
									))}
								</div>
							</div>
						)}
					</DPanel>
				</div>
			</div>
		</div>
	);
}

// ════════════ HEDGE ════════════
export function HedgePage({
	positions,
	totals,
	hedges,
	hedgedBases,
	labels,
	onOpen,
	dark,
	onToggleTheme,
}: PageProps) {
	const hedgedUpnl = hedges.reduce((s, h) => s + h.netUpnl, 0);
	const fundingArb = hedges.reduce((s, h) => s + h.netFunding, 0);
	// 單邊部位 = 沒有任何對沖組合的幣種
	const standalone = positions.filter((p) => !isHedgedBase(p, hedgedBases));

	const Leg = ({ p }: { p: NormPosition }) => (
		<button
			type="button"
			onClick={() => onOpen(p)}
			className="w-full cursor-pointer rounded-[10px] border border-line-soft bg-card2 p-3 text-left transition-colors hover:border-line"
		>
			<div className="mb-2.5 flex items-center gap-[7px]">
				<ExName ex={p.exchange} label={labels[p.exchange]} chip={18} />
				<span className="ml-auto">
					<SideTag side={p.side} small />
				</span>
			</div>
			<div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
				{(
					[
						["數量", fmtNum(p.size)],
						["倉位價值", fmtUSD(p.mark * p.size, 0)],
						["持倉均價", fmtPrice(p.entry)],
						["槓桿", `${p.lev}x`],
						["資金費", fmtSigned(p.fundPaid, 1)],
						["損益", fmtSigned(p.upnl)],
					] as [string, string][]
				).map(([k, v], i) => (
					<div key={k} className="flex justify-between">
						<span className="font-sans text-[11px] text-ter">{k}</span>
						<span
							className={cn(
								"font-mono text-[11.5px] font-medium",
								i === 5
									? upDown(p.upnl)
									: i === 4
										? upDown(p.fundPaid)
										: "text-ink",
							)}
						>
							{v}
						</span>
					</div>
				))}
			</div>
		</button>
	);

	return (
		<div>
			<DPageHead
				title="對沖監控"
				sub={`${hedges.length} 組對沖 · 多單在左、空單在右，依籃計算淨 Delta`}
				right={<ThemeToggle dark={dark} onToggle={onToggleTheme} />}
			/>

			<StatBar
				stats={[
					{
						label: "淨曝險 Delta",
						value: fmtSigned(totals.netDelta, 0),
						valueCls: upDown(totals.netDelta),
						sub: totals.netDelta >= 0 ? "偏多" : "偏空",
					},
					{
						label: "對沖組合",
						value: `${hedges.length} 組`,
						sub: `${hedges.reduce((s, h) => s + h.longs.length + h.shorts.length, 0)} 條腿`,
					},
					{
						label: "對沖部位損益",
						value: fmtSigned(hedgedUpnl),
						valueCls: upDown(hedgedUpnl),
						sub: "對沖幣種合計",
					},
					{
						label: "資金費套利",
						value: fmtSigned(fundingArb),
						valueCls: upDown(fundingArb),
						sub: "對沖幣種累計收付",
					},
				]}
			/>

			<div className="flex flex-wrap items-start gap-3.5">
				<div className="flex min-w-[300px] flex-[2_1_520px] flex-col gap-3.5">
					{hedges.length === 0 ? (
						<DPanel>
							<Empty msg="尚未偵測到對沖（需同幣種同時持有多單與空單）" />
						</DPanel>
					) : (
						hedges.map((h) => (
							<DPanel key={h.id} className="!p-4">
								{/* basket header */}
								<div className="mb-3 flex flex-wrap items-center gap-2.5">
									<CoinDot base={h.base} size={28} />
									<div className="min-w-[140px] flex-1">
										<div className="font-sans text-[13.5px] font-semibold text-ink">
											{h.base} 對沖組合
										</div>
										<div className="mt-0.5 flex items-center gap-[5px]">
											<span
												className={cn(
													"h-[5px] w-[5px] rounded-full",
													h.neutral ? "bg-up" : "bg-warn",
												)}
											/>
											<span className="font-sans text-[11px] text-sec">
												{h.neutral ? "Delta 已中性" : "Delta 偏移"} · 淨{" "}
												{fmtSigned(h.netDelta, 0)}
											</span>
										</div>
									</div>
									<div className="flex flex-wrap gap-5">
										{(
											[
												["組合損益", fmtSigned(h.netUpnl), upDown(h.netUpnl)],
												[
													"資金費合計",
													fmtSigned(h.netFunding),
													upDown(h.netFunding),
												],
												["基差", fmtPct(h.basis), "text-sec"],
											] as [string, string, string][]
										).map(([k, v, c]) => (
											<div key={k} className="text-right">
												<MicroLabel>{k}</MicroLabel>
												<div
													className={cn(
														"mt-[3px] font-mono text-[13.5px] font-semibold",
														c,
													)}
												>
													{v}
												</div>
											</div>
										))}
									</div>
								</div>

								{/* two baskets: longs left, shorts right */}
								<div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
									<div>
										<div className="mb-1.5 flex items-baseline justify-between px-0.5">
											<MicroLabel className="!text-up">
												多單 {h.longs.length}
											</MicroLabel>
											<span className="font-mono text-[11px] font-medium text-up">
												{fmtUSD(h.longNotional, 0)}
											</span>
										</div>
										<div className="flex flex-col gap-2">
											{h.longs.map((p, i) => (
												<Leg key={`l-${p.exchange}-${i}`} p={p} />
											))}
										</div>
									</div>
									<div>
										<div className="mb-1.5 flex items-baseline justify-between px-0.5">
											<MicroLabel className="!text-down">
												空單 {h.shorts.length}
											</MicroLabel>
											<span className="font-mono text-[11px] font-medium text-down">
												{fmtUSD(h.shortNotional, 0)}
											</span>
										</div>
										<div className="flex flex-col gap-2">
											{h.shorts.map((p, i) => (
												<Leg key={`s-${p.exchange}-${i}`} p={p} />
											))}
										</div>
									</div>
								</div>
							</DPanel>
						))
					)}
				</div>

				<div className="min-w-[250px] flex-[1_1_280px]">
					<DPanel
						title="單邊部位"
						hint={`${standalone.length} 個 · 無對沖的幣種`}
					>
						{standalone.length === 0 ? (
							<Empty msg="全部幣種皆有對沖" />
						) : (
							<div className="flex flex-col gap-2">
								{standalone.map((p) => {
									const notional =
										(p.side === "long" ? 1 : -1) * p.mark * p.size;
									return (
										<button
											type="button"
											key={`${p.exchange}-${p.symbol}-${p.side}`}
											onClick={() => onOpen(p)}
											className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-line-soft bg-card2 px-3 py-2.5 text-left"
										>
											<CoinDot base={p.base} size={26} />
											<div className="flex-1">
												<div className="flex items-center gap-1.5">
													<span className="font-sans text-xs font-semibold text-ink">
														{p.base}
													</span>
													<ExChip ex={p.exchange} size={13} radius={4} />
													<SideTag side={p.side} small />
												</div>
												<div className="mt-[3px] font-mono text-[10.5px] text-ter">
													名目 {fmtSigned(notional, 0)}
												</div>
											</div>
											<span className="whitespace-nowrap rounded border border-warn/30 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-warn">
												單邊
											</span>
										</button>
									);
								})}
							</div>
						)}
					</DPanel>
				</div>
			</div>
		</div>
	);
}

// ════════════ LEDGER ════════════
export function LedgerPage({
	positions,
	trades,
	labels,
	dark,
	onToggleTheme,
}: PageProps) {
	const [tab, setTab] = React.useState<"closed" | "funding">("closed");
	// exchange filter — options come from whatever venues appear in the data
	const [exFilter, setExFilter] = React.useState<"all" | ExchangeKey>("all");
	const exchanges = React.useMemo(
		() =>
			Array.from(
				new Set([
					...trades.map((t) => t.exchange),
					...positions.map((p) => p.exchange),
				]),
			),
		[trades, positions],
	);
	const fTrades =
		exFilter === "all" ? trades : trades.filter((t) => t.exchange === exFilter);
	const fPositions =
		exFilter === "all"
			? positions
			: positions.filter((p) => p.exchange === exFilter);

	const realized = fTrades.reduce((s, t) => s + t.realized, 0);
	const fees = fTrades.reduce((s, t) => s + t.fee, 0);
	const funding = fTrades.reduce((s, t) => s + t.funding, 0);
	const net = realized + fees + funding;
	const wins = fTrades.filter((t) => t.realized > 0).length;
	const winRate = fTrades.length ? (wins / fTrades.length) * 100 : 0;
	const fmtTime = (ms: number) =>
		new Date(ms).toLocaleString("zh-TW", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});

	return (
		<div>
			<DPageHead
				title="記帳"
				sub="平倉損益、手續費與資金費率紀錄"
				right={<ThemeToggle dark={dark} onToggle={onToggleTheme} />}
			/>

			<StatBar
				stats={[
					{
						label: "已實現淨額",
						value: fmtSigned(net),
						valueCls: upDown(net),
						sub: `${fTrades.length} 筆交易`,
					},
					{
						label: "勝率",
						value: `${winRate.toFixed(0)}%`,
						sub: `${wins} 勝 / ${fTrades.length - wins} 敗`,
					},
					{
						label: "手續費合計",
						value: fmtUSD(fees),
						valueCls: fees < 0 ? "text-down" : "text-ink",
						sub: "Taker + Maker",
					},
					{
						label: "資金費淨額",
						value: fmtSigned(funding),
						valueCls: upDown(funding),
						sub: "收付相抵",
					},
				]}
			/>

			<DPanel
				title={tab === "closed" ? "平倉紀錄" : "資金費率"}
				className="!p-4"
				right={
					<div className="flex items-center gap-2">
						{/* 交易所篩選（預設全部） */}
						<select
							value={exFilter}
							onChange={(e) =>
								setExFilter(e.target.value as "all" | ExchangeKey)
							}
							className="rounded-lg border border-line bg-card2 px-2.5 py-[6px] font-sans text-xs font-medium text-ink outline-none"
						>
							<option value="all">全部交易所</option>
							{exchanges.map((ex) => (
								<option key={ex} value={ex}>
									{EXCHANGE_META[ex].name}
									{labels[ex] ? `（${labels[ex]}）` : ""}
								</option>
							))}
						</select>
						<div className="w-56">
							<Segmented
								value={tab}
								onChange={setTab}
								options={[
									{ value: "closed", label: "平倉紀錄" },
									{ value: "funding", label: "資金費率" },
								]}
							/>
						</div>
					</div>
				}
			>
				{tab === "closed" ? (
					fTrades.length === 0 ? (
						<Empty msg="近期沒有平倉紀錄" />
					) : (
						<div className="-mx-1.5 overflow-x-auto">
							<table className="w-full min-w-[760px] border-collapse">
								<thead>
									<tr className="border-b border-line">
										<th className={cn(TH_LEFT_CLS, "pl-1.5")}>時間</th>
										<th className={TH_LEFT_CLS}>合約 / 交易所</th>
										<th className={TH_LEFT_CLS}>方向</th>
										<th className={TH_CLS}>數量</th>
										<th className={TH_CLS}>進場</th>
										<th className={TH_CLS}>出場</th>
										<th className={TH_CLS}>已實現</th>
										<th className={TH_CLS}>手續費</th>
										<th className={TH_CLS}>資金費</th>
										<th className={TH_CLS}>淨損益</th>
									</tr>
								</thead>
								<tbody>
									{fTrades.map((t) => {
										const rowNet = t.realized + t.fee + t.funding;
										return (
											<tr
												key={`${t.exchange}-${t.id}-${t.time}`}
												className="border-b border-line-soft"
											>
												<td className="whitespace-nowrap py-3 pl-1.5 pr-2.5 font-mono text-[11.5px] text-sec">
													{fmtTime(t.time)}
												</td>
												<td className="px-2.5">
													<div className="flex items-center gap-2">
														<CoinDot base={t.base} size={24} />
														<div>
															<div className="font-sans text-xs font-semibold text-ink">
																{t.base}
															</div>
															<div className="mt-0.5">
																<ExName
																	ex={t.exchange}
																	label={labels[t.exchange]}
																	chip={13}
																/>
															</div>
														</div>
													</div>
												</td>
												<td className="px-2.5">
													<SideTag side={t.side} small />
												</td>
												<td className={TD_NUM_CLS}>
													{t.size ? fmtNum(t.size) : "—"}
												</td>
												<td className={TD_NUM_CLS}>
													{t.entry ? fmtPrice(t.entry) : "—"}
												</td>
												<td className={TD_NUM_CLS}>
													{t.exit ? fmtPrice(t.exit) : "—"}
												</td>
												<td className={cn(TD_NUM_CLS, upDown(t.realized))}>
													{fmtSigned(t.realized)}
												</td>
												<td className={cn(TD_NUM_CLS, "text-sec")}>
													{t.fee.toFixed(2)}
												</td>
												<td className={cn(TD_NUM_CLS, upDown(t.funding))}>
													{t.funding >= 0 ? "+" : ""}
													{t.funding.toFixed(2)}
												</td>
												<td
													className={cn(
														TD_NUM_CLS,
														"font-semibold",
														upDown(rowNet),
													)}
												>
													{fmtSigned(rowNet)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)
				) : fPositions.length === 0 ? (
					<Empty msg="無持倉資金費資料" />
				) : (
					<div className="-mx-1.5 overflow-x-auto">
						<table className="w-full min-w-[560px] border-collapse">
							<thead>
								<tr className="border-b border-line">
									<th className={cn(TH_LEFT_CLS, "pl-1.5")}>合約 / 交易所</th>
									<th className={TH_LEFT_CLS}>方向</th>
									<th className={TH_CLS}>當前費率</th>
									<th className={TH_CLS}>狀態</th>
									<th className={TH_CLS}>累計收付</th>
								</tr>
							</thead>
							<tbody>
								{[...fPositions]
									.sort((a, b) => b.fundRate - a.fundRate)
									.map((p) => {
										const receives =
											(p.side === "short" && p.fundRate > 0) ||
											(p.side === "long" && p.fundRate < 0);
										const rate = p.fundRate * 100;
										return (
											<tr
												key={`${p.exchange}-${p.symbol}-${p.side}`}
												className="border-b border-line-soft"
											>
												<td className="py-3 pl-1.5 pr-2.5">
													<div className="flex items-center gap-2">
														<CoinDot base={p.base} size={24} />
														<div>
															<div className="font-sans text-xs font-semibold text-ink">
																{p.base}
															</div>
															<div className="mt-0.5">
																<ExName
																	ex={p.exchange}
																	label={labels[p.exchange]}
																	chip={13}
																/>
															</div>
														</div>
													</div>
												</td>
												<td className="px-2.5">
													<SideTag side={p.side} small />
												</td>
												<td className={cn(TD_NUM_CLS, upDown(rate))}>
													{p.fundRate
														? `${rate >= 0 ? "+" : ""}${rate.toFixed(4)}%`
														: "—"}
												</td>
												<td className={TD_NUM_CLS}>
													<span
														className={cn(
															"rounded px-[7px] py-0.5 font-sans text-[11px] font-semibold",
															receives
																? "bg-up/10 text-up"
																: "bg-down/10 text-down",
														)}
													>
														{receives ? "收取" : "支付"}
													</span>
												</td>
												<td
													className={cn(
														TD_NUM_CLS,
														"font-semibold",
														p.fundPaid > 0
															? "text-up"
															: p.fundPaid < 0
																? "text-down"
																: "text-sec",
													)}
												>
													{p.fundPaid ? fmtSigned(p.fundPaid) : "—"}
												</td>
											</tr>
										);
									})}
							</tbody>
						</table>
					</div>
				)}
			</DPanel>
		</div>
	);
}

// ════════════ ASSETS ════════════
export function AssetsPage({
	positions,
	balances,
	totals,
	exposure,
	labels,
	dark,
	onToggleTheme,
}: PageProps) {
	const slices = slicesOf(balances);
	const totalEq = slices.reduce((s, x) => s + x.value, 0) || totals.equity;
	const maxExp = Math.max(1, ...exposure.map((e) => Math.abs(e.net)));

	return (
		<div>
			<DPageHead
				title="資產"
				sub="跨所合約資產分佈、幣種曝險與保證金使用率"
				right={<ThemeToggle dark={dark} onToggle={onToggleTheme} />}
			/>

			<StatBar
				stats={[
					{
						label: "跨所總合約資產",
						value: fmtUSD(totalEq),
						sub: `${balances.length} 間交易所`,
					},
					{
						label: "可用餘額",
						value: fmtUSD(totals.available),
						sub: "可開新倉",
					},
					{
						label: "已用保證金",
						value: fmtUSD(totals.marginUsed),
						sub: `使用率 ${totalEq ? ((totals.marginUsed / totalEq) * 100).toFixed(1) : "0"}%`,
					},
					{
						label: "未實現損益",
						value: fmtSigned(totals.upnl),
						valueCls: upDown(totals.upnl),
						sub: "所有持倉合計",
					},
				]}
			/>

			<div className="mb-3.5 flex flex-wrap items-stretch gap-3.5">
				<DPanel
					title="資產分佈"
					hint="依交易所"
					className="min-w-[280px] flex-[1_1_320px]"
				>
					{slices.length === 0 ? (
						<Empty msg="無" />
					) : (
						<div className="flex flex-wrap items-center gap-[22px]">
							<div className="relative h-[132px] w-[132px] shrink-0">
								<Donut slices={slices} size={132} thickness={12} />
								<div className="absolute inset-0 flex flex-col items-center justify-center">
									<MicroLabel>總資產</MicroLabel>
									<span className="mt-[3px] font-mono text-base font-semibold text-ink">
										{fmtUSD(totalEq, 0)}
									</span>
								</div>
							</div>
							<div className="flex min-w-[170px] flex-1 flex-col">
								{slices.map((s, i) => (
									<div
										key={s.exchange}
										className={cn(
											"flex items-center gap-2 py-[7px]",
											i < slices.length - 1 && "border-b border-line-soft",
										)}
									>
										<span
											className="h-[7px] w-[7px] shrink-0 rounded-sm"
											style={{ background: s.color }}
										/>
										<ExName
											ex={s.exchange}
											label={labels[s.exchange]}
											chip={18}
										/>
										<span className="flex-1" />
										<span className="font-mono text-xs font-medium text-ink">
											{fmtUSD(s.value, 0)}
										</span>
										<span className="w-11 text-right font-mono text-[11px] text-ter">
											{((s.value / totalEq) * 100).toFixed(1)}%
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</DPanel>

				<DPanel
					title="淨曝險"
					hint="依幣種 · 多正空負"
					className="min-w-[280px] flex-[1_1_320px]"
				>
					{exposure.length === 0 ? (
						<Empty msg="無持倉" />
					) : (
						<div className="flex flex-col gap-3">
							{exposure.map((e) => {
								const pos = e.net >= 0;
								const w = Math.max(3, (Math.abs(e.net) / maxExp) * 46);
								return (
									<div key={e.base} className="flex items-center gap-2.5">
										<CoinDot base={e.base} size={20} />
										<span className="w-10 font-sans text-xs font-semibold text-ink">
											{e.base}
										</span>
										<div className="relative flex h-[18px] flex-1 items-center">
											<div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
											<div
												className={cn(
													"absolute left-1/2 h-2.5 rounded-sm opacity-85",
													pos ? "bg-up" : "bg-down",
												)}
												style={{
													width: `${w}%`,
													transform: pos ? undefined : "translateX(-100%)",
												}}
											/>
										</div>
										<span
											className={cn(
												"w-[84px] text-right font-mono text-[11.5px] font-medium",
												pos ? "text-up" : "text-down",
											)}
										>
											{fmtSigned(e.net, 0)}
										</span>
									</div>
								);
							})}
						</div>
					)}
				</DPanel>
			</div>

			<DPanel title="各所帳戶" hint="資產 · 可用 · 保證金使用率">
				{balances.length === 0 ? (
					<Empty msg="尚未連接交易所" />
				) : (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
						{balances.map((a) => {
							const util = a.equity ? (a.marginUsed / a.equity) * 100 : 0;
							const posCount = positions.filter(
								(p) => p.exchange === a.exchange,
							).length;
							return (
								<div
									key={a.exchange}
									className="rounded-[10px] border border-line-soft bg-card2 p-3.5"
								>
									<div className="mb-3 flex items-center gap-2">
										<ExName
											ex={a.exchange}
											label={labels[a.exchange]}
											chip={26}
										/>
										<span className="ml-auto font-mono text-[10.5px] text-ter">
											{posCount} 持倉
										</span>
									</div>
									<div className="font-mono text-[17px] font-semibold tracking-tight text-ink">
										{fmtUSD(a.equity)}
									</div>
									<div className="mb-1.5 mt-2.5 flex justify-between">
										<span className="font-sans text-[11px] text-ter">
											可用 {fmtUSD(a.available, 0)}
										</span>
										<span className="font-mono text-[11px] text-ter">
											{util.toFixed(1)}%
										</span>
									</div>
									<div className="h-[3px] overflow-hidden rounded-sm bg-sunken dark:bg-card">
										<div
											className={cn(
												"h-full rounded-sm",
												util > 30 ? "bg-warn" : "bg-primary",
											)}
											style={{ width: `${Math.min(100, util * 2.5)}%` }}
										/>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</DPanel>
		</div>
	);
}
