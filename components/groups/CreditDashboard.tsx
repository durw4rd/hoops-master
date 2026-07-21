"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditBalance, GroupTransaction, PaymentRecord, TransactionType } from "@/lib/types";
import { Loader2, Download, Euro, ChevronDown, ChevronRight } from "lucide-react";

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

  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payDescription, setPayDescription] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recording, setRecording] = useState(false);

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

  useEffect(() => {
    if (!balancesLoaded) fetchBalances();
  }, [balancesLoaded, fetchBalances]);

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

  const exportCsv = (type: "balances" | "transactions" | "payments") => {
    window.open(`/api/groups/${groupId}/export?type=${type}`, "_blank");
  };

  const balanceColor = (balance: number) =>
    balance > 0 ? "text-success" : balance < 0 ? "text-terracotta" : "text-asphalt";

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
                        {transactions.map((t) => (
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
        <h2 className="font-graffiti text-xl text-asphalt">Balances</h2>
        <p className="text-xs text-asphalt/50 font-body mt-3 mb-3">
          Balance = paid − spots received + spots given up. Positive means credit available.
        </p>
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
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
