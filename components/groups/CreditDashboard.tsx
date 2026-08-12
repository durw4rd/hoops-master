"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFlags } from "launchdarkly-react-client-sdk";
import {
  CreditBalance,
  GroupTransaction,
  PaymentRecord,
  SettlementDTO,
  SettlementPairingDTO,
  TransactionType,
} from "@/lib/types";
import {
  Loader2,
  Download,
  Euro,
  ChevronDown,
  ChevronRight,
  Handshake,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { GraffitiDialog } from "@/components/ui/GraffitiDialog";
import SettlementModal from "./SettlementModal";
import { type DraftPairing } from "./SettlementBuilder";
import { crewBalanceTotalCents, formatCents, toSettlementBalances } from "@/lib/settlement";

interface CreditDashboardProps {
  groupId: string;
  userEmail: string;
  isGroupAdmin: boolean;
  members: { userEmail: string; displayName?: string }[];
}

function transactionTypeLabel(type: TransactionType): string {
  const labels: Record<TransactionType, string> = {
    admin_assign: "Admin assigned",
    round_robin_assign: "Rotation assigned",
    signup: "Signed up",
    offer: "Offered",
    claim: "Claimed",
    retract: "Retracted",
    reassign: "Reassigned",
    admin_reassign: "Admin reassigned",
    release: "Released",
    waitlist_promote: "Bench promo",
    split_settle: "Split cost",
    split_remainder: "Split remainder",
    split_unsettle: "Split undo",
    price_adjustment: "Price adjustment",
    guest_assign: "Guest spot",
    unassign_refund: "Removal refund",
    event_cancelled_refund: "Game cancelled",
  };
  return labels[type] ?? type;
}

function CollapsibleHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1 font-graffiti text-xl text-asphalt hover:text-terracotta transition-colors w-full text-left"
    >
      {open ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
      {title}
    </button>
  );
}

function displayNameFor(
  email: string,
  members: { userEmail: string; displayName?: string }[]
): string {
  const m = members.find((x) => x.userEmail === email);
  return m?.displayName || email.split("@")[0];
}

export default function CreditDashboard({
  groupId,
  userEmail,
  isGroupAdmin,
  members,
}: CreditDashboardProps) {
  const [balances, setBalances] = useState<CreditBalance[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [transactions, setTransactions] = useState<GroupTransaction[]>([]);

  const [balancesLoading, setBalancesLoading] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const [balancesLoaded, setBalancesLoaded] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [transactionsLoaded, setTransactionsLoaded] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  const [showPayForm, setShowPayForm] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);

  // Spot Ledger filters (client-side — the full ledger is already loaded).
  const [ledgerGameFilter, setLedgerGameFilter] = useState<string>("all");
  const [ledgerPlayerFilter, setLedgerPlayerFilter] = useState<string>("all");

  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payDescription, setPayDescription] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recording, setRecording] = useState(false);

  // --- Squash the Beef (crew settlement) ---
  // Two flags on purpose. The UI is gated by `group-settlement-ui`, read by the
  // client SDK straight from LaunchDarkly, so per-player entitlement takes effect
  // instantly. The API is gated by `group-settlement`, which the server reads from
  // a Vercel Edge Config snapshot that can lag a flag version — sharing one key
  // meant a live UI could sit on top of an API still answering 403.
  const flags = useFlags();
  const settlementEnabled = flags?.groupSettlementUi === true;
  const [settlement, setSettlement] = useState<SettlementDTO | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementLoaded, setSettlementLoaded] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [creatingSettlement, setCreatingSettlement] = useState(false);
  const [builderDrafts, setBuilderDrafts] = useState<DraftPairing[]>([]);
  const [pendingDrafts, setPendingDrafts] = useState<DraftPairing[] | null>(null);
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [settlementGateError, setSettlementGateError] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancellingSettlement, setCancellingSettlement] = useState(false);
  const [payingPairing, setPayingPairing] = useState<SettlementPairingDTO | null>(null);
  const [payingNote, setPayingNote] = useState("");
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);

  const allSelected = members.length > 0 && selectedEmails.length === members.length;
  const toggleEmail = (email: string) =>
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  const toggleAll = () =>
    setSelectedEmails(allSelected ? [] : members.map((m) => m.userEmail));

  const fetchBalances = useCallback(async () => {
    setBalancesLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/credits`);
      if (res.ok) {
        const data = await res.json();
        setBalances(data.data || []);
        setBalancesLoaded(true);
      }
    } catch (err) {
      console.error("Failed to fetch credits:", err);
    } finally {
      setBalancesLoading(false);
    }
  }, [groupId]);

  const fetchPayments = useCallback(async () => {
    setPaymentsLoading(true);
    setPaymentsError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/payments`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data.data || []);
        setPaymentsLoaded(true);
      } else {
        const data = await res.json();
        setPaymentsError(data.error || "Failed to load payments");
      }
    } catch {
      setPaymentsError("Failed to load payments");
    } finally {
      setPaymentsLoading(false);
    }
  }, [groupId]);

  const fetchTransactions = useCallback(async () => {
    setTransactionsLoading(true);
    setTransactionsError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/transactions`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.data || []);
        setTransactionsLoaded(true);
      } else {
        const data = await res.json();
        setTransactionsError(data.error || "Failed to load spot ledger");
      }
    } catch {
      setTransactionsError("Failed to load spot ledger");
    } finally {
      setTransactionsLoading(false);
    }
  }, [groupId]);

  const fetchSettlement = useCallback(async (): Promise<SettlementDTO | null> => {
    setSettlementLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/settlement`);
      if (res.ok) {
        const data = await res.json();
        const next: SettlementDTO | null = data.data ?? null;
        setSettlement(next);
        setSettlementGateError(null);
        return next;
      }
      // The UI flag is on but the API gate says no — surface it instead of
      // leaving the entry point in a permanent loading state.
      setSettlementGateError(
        res.status === 403
          ? "Squaring up is switched off on the server right now."
          : "Couldn't load the settlement."
      );
    } catch (err) {
      console.error("Failed to fetch settlement:", err);
      setSettlementGateError("Couldn't load the settlement.");
    } finally {
      setSettlementLoading(false);
      setSettlementLoaded(true);
    }
    return null;
  }, [groupId]);

  useEffect(() => {
    if (!balancesLoaded) fetchBalances();
  }, [balancesLoaded, fetchBalances]);

  // Players need to see their own pairings without hunting for them, so this
  // loads with the tab rather than on expand.
  useEffect(() => {
    if (settlementEnabled && !settlementLoaded) fetchSettlement();
  }, [settlementEnabled, settlementLoaded, fetchSettlement]);

  // The UI flag streams live, so it can switch off under a loaded dashboard.
  // Drop the loaded state and close anything open, both so nothing stays
  // actionable and so re-enabling fetches fresh data instead of reusing this.
  useEffect(() => {
    if (settlementEnabled) return;
    setSettlement(null);
    setSettlementLoaded(false);
    setSettlementGateError(null);
    setSettlementModalOpen(false);
    setPendingDrafts(null);
    setConfirmCancelOpen(false);
    setPayingPairing(null);
    setBuilderDrafts([]);
  }, [settlementEnabled]);

  const togglePayments = () => {
    const next = !showPayments;
    setShowPayments(next);
    if (next && !paymentsLoaded) fetchPayments();
  };

  const toggleTransactions = () => {
    const next = !showTransactions;
    setShowTransactions(next);
    if (next && !transactionsLoaded) fetchTransactions();
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmails.length === 0 || payAmount === "") return;
    setRecording(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmails: selectedEmails,
          amount: parseFloat(payAmount),
          description: payDescription || undefined,
          paymentDate: payDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record payment");
        return;
      }
      setSelectedEmails([]);
      setPayAmount("");
      setPayDescription("");
      if (balancesLoaded) fetchBalances();
      if (paymentsLoaded) fetchPayments();
    } catch {
      setError("Failed to record payment");
    } finally {
      setRecording(false);
    }
  };

  /** Everything the settlement touches: pairings, balances, and the payment log. */
  const refreshAfterSettlement = async () => {
    const next = await fetchSettlement();
    // Squaring the last pairing auto-completes the settlement server-side, so the
    // modal would otherwise drop a manager into an empty builder.
    if (!next) setSettlementModalOpen(false);
    if (balancesLoaded) fetchBalances();
    if (paymentsLoaded) fetchPayments();
  };

  const handleCreateSettlement = async () => {
    if (!pendingDrafts) return;
    setCreatingSettlement(true);
    setSettlementError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/settlement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairings: pendingDrafts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettlementError(data.error || "Failed to lock in the settlement");
        return;
      }
      setPendingDrafts(null);
      setBuilderDrafts([]);
      refreshAfterSettlement();
    } catch {
      setSettlementError("Failed to lock in the settlement");
    } finally {
      setCreatingSettlement(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!payingPairing) return;
    setMarkingPaid(true);
    setMarkPaidError(null);
    try {
      const res = await fetch(
        `/api/groups/${groupId}/settlement/pairings/${payingPairing.pairingId}/paid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: payingNote || undefined }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        // 409 means someone already recorded it — reloading resolves the view.
        if (res.status === 409) {
          setPayingPairing(null);
          setPayingNote("");
          refreshAfterSettlement();
          return;
        }
        setMarkPaidError(data.error || "Failed to mark it squared");
        return;
      }
      setPayingPairing(null);
      setPayingNote("");
      refreshAfterSettlement();
    } catch {
      setMarkPaidError("Failed to mark it squared");
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleCancelSettlement = async () => {
    setCancellingSettlement(true);
    setSettlementError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/settlement`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setSettlementError(data.error || "Failed to tear up the settlement");
        return;
      }
      setConfirmCancelOpen(false);
      setBuilderDrafts([]);
      refreshAfterSettlement();
    } catch {
      setSettlementError("Failed to tear up the settlement");
    } finally {
      setCancellingSettlement(false);
    }
  };

  const exportCsv = (type: "balances" | "transactions" | "payments") => {
    window.open(`/api/groups/${groupId}/export?type=${type}`, "_blank");
  };

  // Only compares against zero, so it reads cents as happily as euros.
  const balanceColor = (balance: number) =>
    balance > 0 ? "text-success" : balance < 0 ? "text-terracotta" : "text-asphalt";

  // The crew's net position, NOT an error signal. Spot charges are one-sided
  // (`from_user_id IS NULL`), so every unpaid spot pushes this negative until a
  // payment lands, and a season buy-in pushes it positive until the games are
  // played. Zero just means everyone is square right now.
  const crewTotalCents = useMemo(
    () => crewBalanceTotalCents(toSettlementBalances(balances)),
    [balances]
  );
  const showCrewPosition = balancesLoaded && balances.length > 0 && crewTotalCents !== 0;

  const openPairingCount =
    settlement?.pairings.filter((p) => p.status === "open").length ?? 0;
  // Server-filtered by role: crew-wide for a manager, own-only for a player.
  const myOpenPairings = useMemo(
    () =>
      (settlement?.pairings ?? []).filter(
        (p) =>
          p.status === "open" && (p.debtorEmail === userEmail || p.creditorEmail === userEmail)
      ),
    [settlement, userEmail]
  );
  // Managers always get the entry point; a player only once they're in a
  // settlement (the API returns null when they have no pairings).
  const canSeeSettlement = settlementEnabled && (isGroupAdmin || settlement !== null);

  const openMarkPaid = (pairing: SettlementPairingDTO) => {
    setPayingPairing(pairing);
    setPayingNote("");
    setMarkPaidError(null);
  };

  // Includes tip-off time — crews often run multiple games on the same day.
  const formatGameDate = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // Distinct games present in the loaded ledger, newest first.
  const ledgerGameOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const t of transactions) {
      if (!byId.has(t.eventId)) byId.set(t.eventId, t.eventStartsAt);
    }
    return [...byId.entries()].sort(
      (a, b) => new Date(b[1]).getTime() - new Date(a[1]).getTime()
    );
  }, [transactions]);

  const ledgerPlayerOptions = useMemo(
    () =>
      [...members].sort((a, b) =>
        displayNameFor(a.userEmail, members).localeCompare(displayNameFor(b.userEmail, members))
      ),
    [members]
  );

  const filteredTransactions = transactions.filter(
    (t) =>
      (ledgerGameFilter === "all" || t.eventId === ledgerGameFilter) &&
      (ledgerPlayerFilter === "all" ||
        t.fromUserEmail === ledgerPlayerFilter ||
        t.toUserEmail === ledgerPlayerFilter)
  );
  const ledgerFiltered = ledgerGameFilter !== "all" || ledgerPlayerFilter !== "all";

  return (
    <div className="space-y-4">
      {isGroupAdmin && (
        <div className="marker-card p-4 space-y-3">
          <div className="flex items-center justify-end flex-wrap gap-2 pb-1 border-b-2 border-asphalt/10">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => exportCsv("balances")}
                className="flex items-center gap-1 bg-asphalt text-sticker-white px-3 py-1.5 border-2 border-asphalt font-graffiti text-xs hover:bg-terracotta transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Balances
              </button>
              <button
                type="button"
                onClick={() => exportCsv("transactions")}
                className="flex items-center gap-1 bg-asphalt text-sticker-white px-3 py-1.5 border-2 border-asphalt font-graffiti text-xs hover:bg-terracotta transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Transactions
              </button>
              <button
                type="button"
                onClick={() => exportCsv("payments")}
                className="flex items-center gap-1 bg-asphalt text-sticker-white px-3 py-1.5 border-2 border-asphalt font-graffiti text-xs hover:bg-terracotta transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Payments
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <CollapsibleHeader
              title="Square Up"
              open={showPayForm}
              onToggle={() => setShowPayForm((v) => !v)}
            />
            {showPayForm && (
              <form onSubmit={handleRecordPayment} className="space-y-3 pl-6">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-graffiti text-asphalt">
                      Players {selectedEmails.length > 0 && `(${selectedEmails.length} selected)`}
                    </label>
                    {members.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-xs font-graffiti text-terracotta hover:underline"
                      >
                        {allSelected ? "Clear all" : "Select all"}
                      </button>
                    )}
                  </div>
                  <div className="max-h-44 overflow-y-auto border-2 border-asphalt bg-white divide-y divide-asphalt/10">
                    {members.length === 0 ? (
                      <p className="text-sm text-asphalt/50 font-body p-3">No players yet</p>
                    ) : (
                      members.map((m) => {
                        const checked = selectedEmails.includes(m.userEmail);
                        return (
                          <label
                            key={m.userEmail}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm font-body ${
                              checked ? "bg-moss-green/30" : "hover:bg-sticker-white"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEmail(m.userEmail)}
                              className="w-4 h-4 accent-terracotta"
                            />
                            {m.displayName || m.userEmail.split("@")[0]}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-graffiti text-asphalt">Amount (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="sketch-input w-full text-sm"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-graffiti text-asphalt">Date</label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="sketch-input w-full text-sm"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-graffiti text-asphalt">Note (optional)</label>
                    <input
                      type="text"
                      value={payDescription}
                      onChange={(e) => setPayDescription(e.target.value)}
                      className="sketch-input w-full text-sm"
                      placeholder="e.g., season buy-in"
                    />
                  </div>
                </div>
                <p className="text-xs text-asphalt/50 font-body">
                  The same amount is recorded for every selected player — handy for a season buy-in.
                </p>
                <div>
                  <button
                    type="submit"
                    disabled={recording || selectedEmails.length === 0 || payAmount === ""}
                    className="sticker-btn flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {recording ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Euro className="w-4 h-4" />
                    )}
                    {selectedEmails.length > 1
                      ? `Record for ${selectedEmails.length} players`
                      : "Record Payment"}
                  </button>
                </div>
              </form>
            )}

            <CollapsibleHeader title="Payments" open={showPayments} onToggle={togglePayments} />
            {showPayments && (
              <div className="pl-6">
                {paymentsError && (
                  <div className="p-2 mb-2 bg-terracotta/10 border-2 border-terracotta">
                    <p className="text-sm text-terracotta font-body">{paymentsError}</p>
                  </div>
                )}
                {paymentsLoading ? (
                  <div className="flex items-center gap-2 text-asphalt/60 font-body py-4 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading payments…
                  </div>
                ) : payments.length === 0 ? (
                  <p className="text-center text-asphalt/50 font-body py-4">No payments yet</p>
                ) : (
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left font-graffiti text-asphalt/70 border-b-2 border-asphalt/20">
                          <th className="py-2 pr-2">Date</th>
                          <th className="py-2 px-2">Player</th>
                          <th className="py-2 px-2 text-right">Amount</th>
                          <th className="py-2 pl-2">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p.paymentId} className="border-b border-asphalt/10">
                            <td className="py-2 pr-2 font-body whitespace-nowrap">{p.paymentDate}</td>
                            <td className="py-2 px-2 font-marker">
                              {displayNameFor(p.userEmail, members)}
                            </td>
                            <td className="py-2 px-2 text-right font-body">€{p.amount.toFixed(2)}</td>
                            <td className="py-2 pl-2 font-body text-asphalt/60 truncate max-w-[140px]">
                              {p.description || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <CollapsibleHeader
              title="Spot Ledger"
              open={showTransactions}
              onToggle={toggleTransactions}
            />
            {showTransactions && (
              <div className="pl-6">
                {transactionsError && (
                  <div className="p-2 mb-2 bg-terracotta/10 border-2 border-terracotta">
                    <p className="text-sm text-terracotta font-body">{transactionsError}</p>
                  </div>
                )}
                {transactionsLoading ? (
                  <div className="flex items-center gap-2 text-asphalt/60 font-body py-4 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading spot ledger…
                  </div>
                ) : transactions.length === 0 ? (
                  <p className="text-center text-asphalt/50 font-body py-4">No spot moves yet</p>
                ) : (
                  <>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Select value={ledgerGameFilter} onValueChange={setLedgerGameFilter}>
                      <SelectTrigger className="w-[180px] bg-white border-2 border-asphalt rounded-none font-body text-xs h-8 focus:ring-0 focus:ring-offset-0 shadow-sticker-sm">
                        <SelectValue placeholder="All games" />
                      </SelectTrigger>
                      <SelectContent className="bg-sticker-white border-2 border-asphalt rounded-none">
                        <SelectItem value="all" className="font-body">All games</SelectItem>
                        {ledgerGameOptions.map(([eventId, startsAt]) => (
                          <SelectItem key={eventId} value={eventId} className="font-body">
                            {formatGameDate(startsAt)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={ledgerPlayerFilter} onValueChange={setLedgerPlayerFilter}>
                      <SelectTrigger className="w-[160px] bg-white border-2 border-asphalt rounded-none font-body text-xs h-8 focus:ring-0 focus:ring-offset-0 shadow-sticker-sm">
                        <SelectValue placeholder="All players" />
                      </SelectTrigger>
                      <SelectContent className="bg-sticker-white border-2 border-asphalt rounded-none">
                        <SelectItem value="all" className="font-body">All players</SelectItem>
                        {ledgerPlayerOptions.map((m) => (
                          <SelectItem key={m.userEmail} value={m.userEmail} className="font-body">
                            {displayNameFor(m.userEmail, members)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="font-body text-xs text-asphalt/50">
                      Showing {filteredTransactions.length} of {transactions.length} moves
                    </span>
                    {ledgerFiltered && (
                      <button
                        type="button"
                        onClick={() => { setLedgerGameFilter("all"); setLedgerPlayerFilter("all"); }}
                        className="font-graffiti text-xs text-terracotta hover:text-asphalt transition-colors"
                      >
                        CLEAR
                      </button>
                    )}
                  </div>
                  {filteredTransactions.length === 0 ? (
                    <p className="text-center text-asphalt/50 font-body py-4">No moves match these filters</p>
                  ) : (
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left font-graffiti text-asphalt/70 border-b-2 border-asphalt/20">
                          <th className="py-2 pr-2">When</th>
                          <th className="py-2 px-2">Game</th>
                          <th className="py-2 px-2">Type</th>
                          <th className="py-2 px-2">From → To</th>
                          <th className="py-2 px-2 text-right">€</th>
                          <th className="py-2 pl-2">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((t) => (
                          <tr key={t.transactionId} className="border-b border-asphalt/10">
                            <td className="py-2 pr-2 font-body whitespace-nowrap text-xs">
                              {formatWhen(t.createdAt)}
                            </td>
                            <td className="py-2 px-2 font-body whitespace-nowrap text-xs">
                              {formatGameDate(t.eventStartsAt)}
                            </td>
                            <td className="py-2 px-2 font-marker text-xs">
                              {transactionTypeLabel(t.type)}
                            </td>
                            <td className="py-2 px-2 font-body text-xs">
                              {t.fromUserEmail
                                ? `${displayNameFor(t.fromUserEmail, members)} → ${displayNameFor(t.toUserEmail, members)}`
                                : `— → ${displayNameFor(t.toUserEmail, members)}`}
                            </td>
                            <td className="py-2 px-2 text-right font-body">€{t.amount.toFixed(2)}</td>
                            <td className="py-2 pl-2 font-body text-asphalt/60 text-xs truncate max-w-[100px]">
                              {t.notes || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                  </>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="p-2 bg-terracotta/10 border-2 border-terracotta">
              <p className="text-sm text-terracotta font-body">{error}</p>
            </div>
          )}
        </div>
      )}

      <div className="marker-card p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-graffiti text-xl text-asphalt">Balances</h2>
          {canSeeSettlement && (
            <button
              type="button"
              onClick={() => {
                setSettlementError(null);
                setSettlementModalOpen(true);
              }}
              disabled={!settlementLoaded}
              className="sticker-btn flex items-center gap-2 text-sm py-2 disabled:opacity-50"
            >
              {settlementLoaded ? (
                <Handshake className="w-4 h-4" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {settlement
                ? openPairingCount > 0
                  ? `See the Beef (${openPairingCount} open)`
                  : "See the Beef (all squared)"
                : "Squash the Beef"}
            </button>
          )}
        </div>
        <p className="text-xs text-asphalt/50 font-body mt-3 mb-3">
          Balance = paid − spots received + spots given up. Positive means credit available.
        </p>

        {settlementEnabled && settlementGateError && (
          <p className="text-xs font-body text-terracotta mb-3">{settlementGateError}</p>
        )}

        {settlementEnabled && myOpenPairings.length > 0 && (
          <div className="border-2 border-dashed border-asphalt/30 p-3 mb-3 space-y-1">
            <p className="text-xs font-graffiti text-asphalt/70">Your beef</p>
            <ul className="divide-y divide-asphalt/10">
              {myOpenPairings.map((p) => (
                <li key={p.pairingId} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="font-body text-sm">
                    {p.debtorEmail === userEmail ? (
                      <>
                        You owe <span className="font-marker">{p.creditorName}</span>{" "}
                        <span className="font-graffiti">€{p.amount.toFixed(2)}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-marker">{p.debtorName}</span> owes you{" "}
                        <span className="font-graffiti">€{p.amount.toFixed(2)}</span>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => openMarkPaid(p)}
                    className="flex items-center gap-1 bg-asphalt text-sticker-white px-2 py-1 border-2 border-asphalt font-graffiti text-xs hover:bg-terracotta transition-colors whitespace-nowrap"
                  >
                    <Handshake className="w-3.5 h-3.5" /> Mark Paid
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isGroupAdmin && showCrewPosition && (
          <div className="bg-dull-gold/20 border-2 border-asphalt p-2 mb-3">
            <p className="font-graffiti text-xs text-asphalt">
              {crewTotalCents < 0
                ? `The crew still owes €${formatCents(-crewTotalCents)} for spots nobody has paid in for yet`
                : `The crew is holding €${formatCents(crewTotalCents)} of credit players haven't used yet`}
            </p>
          </div>
        )}

        {balancesLoading ? (
          <div className="flex items-center gap-2 text-asphalt/60 font-body py-6 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading balances…
          </div>
        ) : balances.length === 0 ? (
          <p className="text-center text-asphalt/50 font-body py-6">No balances yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-graffiti text-asphalt/70 border-b-2 border-asphalt/20">
                  <th className="py-2 pr-2">Player</th>
                  <th className="py-2 px-2 text-right">Paid (€)</th>
                  <th className="py-2 px-2 text-right">Spent (€)</th>
                  <th className="py-2 px-2 text-right">Earned (€)</th>
                  <th className="py-2 pl-2 text-right">Balance (€)</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr
                    key={b.userEmail}
                    className={`border-b border-asphalt/10 ${
                      b.userEmail === userEmail ? "bg-moss-green/20" : ""
                    }`}
                  >
                    <td className="py-2 pr-2 font-marker">
                      {b.displayName || b.userEmail.split("@")[0]}
                      {b.userEmail === userEmail && (
                        <span className="text-asphalt/50 ml-1 text-xs">(you)</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-body">€{b.totalPaid.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-body">€{b.totalSpent.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-body">€{b.totalEarned.toFixed(2)}</td>
                    <td className={`py-2 pl-2 text-right font-graffiti ${balanceColor(b.balance)}`}>
                      €{b.balance.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-asphalt/20">
                  <td colSpan={4} className="py-2 pr-2 font-graffiti text-asphalt/70">
                    Crew total
                  </td>
                  <td
                    className={`py-2 pl-2 text-right font-graffiti ${balanceColor(crewTotalCents)}`}
                  >
                    €{formatCents(crewTotalCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/*
        These four are siblings, not nested. They share z-50, so DOM order decides
        what paints on top: the mark-paid dialog is last because it can be opened
        from inside the settlement modal AND from the strip above.
      */}
      <SettlementModal
        open={settlementModalOpen}
        onOpenChange={(open) => {
          setSettlementModalOpen(open);
          if (!open) setSettlementError(null);
        }}
        mode={settlement ? "view" : "build"}
        settlement={settlement}
        balances={balances}
        displayNameFor={(email) => displayNameFor(email, members)}
        userEmail={userEmail}
        isGroupAdmin={isGroupAdmin}
        loading={settlementLoading && !settlementLoaded}
        submitting={creatingSettlement}
        error={settlementError}
        drafts={builderDrafts}
        onDraftsChange={setBuilderDrafts}
        onSubmitDrafts={(drafts) => {
          setSettlementError(null);
          setPendingDrafts(drafts);
        }}
        onMarkPaid={openMarkPaid}
        onTearUp={() => {
          setSettlementError(null);
          setConfirmCancelOpen(true);
        }}
      />

      <ConfirmDialog
        open={pendingDrafts !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDrafts(null);
            setSettlementError(null);
          }
        }}
        title="Lock it in?"
        message={
          settlementError ??
          `Set ${pendingDrafts?.length ?? 0} pairing${
            (pendingDrafts?.length ?? 0) === 1 ? "" : "s"
          } worth €${((pendingDrafts ?? []).reduce((s, d) => s + d.amountCents, 0) / 100).toFixed(
            2
          )} in stone? Everyone involved gets tagged, and the crew can't start another settlement until this one is done.`
        }
        confirmLabel={settlementError ? "OK" : "Lock It In"}
        cancelLabel={settlementError ? "Close" : "Cancel"}
        variant="default"
        loading={creatingSettlement}
        onConfirm={
          settlementError
            ? () => {
                setPendingDrafts(null);
                setSettlementError(null);
              }
            : handleCreateSettlement
        }
      />

      <ConfirmDialog
        open={confirmCancelOpen}
        onOpenChange={(open) => {
          setConfirmCancelOpen(open);
          if (!open) setSettlementError(null);
        }}
        title="Tear it up?"
        message={
          settlementError ??
          "Scrap every pairing nobody has paid yet. Anything already marked squared stays on the books."
        }
        confirmLabel={settlementError ? "OK" : "TEAR IT UP"}
        loading={cancellingSettlement}
        onConfirm={
          settlementError
            ? () => {
                setConfirmCancelOpen(false);
                setSettlementError(null);
              }
            : handleCancelSettlement
        }
      />

      <GraffitiDialog
        open={payingPairing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPayingPairing(null);
            setPayingNote("");
            setMarkPaidError(null);
          }
        }}
        title="Money moved?"
        description={
          payingPairing
            ? `${payingPairing.debtorName} pays ${payingPairing.creditorName} €${payingPairing.amount.toFixed(2)}. This records the payment for both of them and squares the pairing off.`
            : ""
        }
        className="max-w-sm"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-graffiti text-asphalt">
              How did it move? (optional)
            </label>
            <input
              type="text"
              value={payingNote}
              onChange={(e) => setPayingNote(e.target.value)}
              maxLength={200}
              className="sketch-input w-full text-sm"
              placeholder="e.g., Revolut, cash at the court"
            />
            <p className="text-xs text-asphalt/50 font-body">
              Goes on both payment records along with your name.
            </p>
          </div>
          {markPaidError && (
            <div className="p-2 bg-terracotta/10 border-2 border-terracotta">
              <p className="text-sm text-terracotta font-body">{markPaidError}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPayingPairing(null)}
              disabled={markingPaid}
              className="flex-1 bg-sticker-white text-asphalt border-3 border-asphalt font-graffiti text-base py-2.5 px-4 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-sticker-md transition-all disabled:opacity-50"
            >
              Not Yet
            </button>
            <button
              type="button"
              onClick={handleMarkPaid}
              disabled={markingPaid}
              className="flex-1 bg-asphalt text-white border-3 border-asphalt font-graffiti text-base py-2.5 px-4 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-sticker-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {markingPaid && <Loader2 className="w-4 h-4 animate-spin" />}
              Squared
            </button>
          </div>
        </div>
      </GraffitiDialog>
    </div>
  );
}
