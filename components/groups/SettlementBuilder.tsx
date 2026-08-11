"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Euro, Loader2, Plus, X } from "lucide-react";
import type { CreditBalance } from "@/lib/types";
import { formatCents, remainingCentsByPlayer, toCents } from "@/lib/settlement";

export interface DraftPairing {
  debtorEmail: string;
  creditorEmail: string;
  amountCents: number;
}

interface SettlementBuilderProps {
  balances: CreditBalance[];
  displayNameFor: (email: string) => string;
  submitting: boolean;
  onSubmit: (drafts: DraftPairing[]) => void;
}

/**
 * Hand-built pairing sheet: the manager matches players in the black with
 * players in the red, one draft at a time. Nothing is persisted until "Lock It
 * In" — until then this is all local state, and every remaining figure updates
 * as drafts come and go so it stays obvious who still needs a match.
 */
export default function SettlementBuilder({
  balances,
  displayNameFor,
  submitting,
  onSubmit,
}: SettlementBuilderProps) {
  const [drafts, setDrafts] = useState<DraftPairing[]>([]);
  const [creditorEmail, setCreditorEmail] = useState<string | null>(null);
  const [debtorEmail, setDebtorEmail] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  // Owed money vs owing money, biggest first — the natural order to work down.
  const creditors = useMemo(
    () => balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance),
    [balances]
  );
  const debtors = useMemo(
    () => balances.filter((b) => b.balance < 0).sort((a, b) => a.balance - b.balance),
    [balances]
  );

  // Shared with the server-side validator, keyed by email here.
  const remainingCents = useMemo(
    () =>
      remainingCentsByPlayer(
        balances.map((b) => ({ userId: b.userEmail, balanceCents: toCents(b.balance) })),
        drafts.map((d) => ({
          debtorUserId: d.debtorEmail,
          creditorUserId: d.creditorEmail,
          amountCents: d.amountCents,
        }))
      ),
    [balances, drafts]
  );

  const creditorRemaining = creditorEmail ? remainingCents.get(creditorEmail) ?? 0 : 0;
  const debtorRemaining = debtorEmail ? remainingCents.get(debtorEmail) ?? 0 : 0;
  const suggestedCents = Math.min(creditorRemaining, debtorRemaining);

  // Pre-fill with whatever fully squares one of the two sides.
  useEffect(() => {
    if (creditorEmail && debtorEmail && suggestedCents > 0) {
      setAmountInput(formatCents(suggestedCents));
      setHint(null);
    }
  }, [creditorEmail, debtorEmail, suggestedCents]);

  const unmatched = useMemo(
    () =>
      [...creditors, ...debtors].filter((b) => (remainingCents.get(b.userEmail) ?? 0) > 0),
    [creditors, debtors, remainingCents]
  );

  const totalCents = drafts.reduce((sum, d) => sum + d.amountCents, 0);

  const addDraft = () => {
    if (!creditorEmail || !debtorEmail) return;
    const cents = Math.round(parseFloat(amountInput) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setHint("Enter an amount above zero.");
      return;
    }
    if (cents > creditorRemaining) {
      setHint(
        `${displayNameFor(creditorEmail)} is only owed €${formatCents(creditorRemaining)} more.`
      );
      return;
    }
    if (cents > debtorRemaining) {
      setHint(`${displayNameFor(debtorEmail)} only owes €${formatCents(debtorRemaining)} more.`);
      return;
    }

    setDrafts((prev) => {
      // One pairing per pair of players — top up the existing one instead.
      const existing = prev.findIndex(
        (d) => d.debtorEmail === debtorEmail && d.creditorEmail === creditorEmail
      );
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], amountCents: next[existing].amountCents + cents };
        return next;
      }
      return [...prev, { debtorEmail, creditorEmail, amountCents: cents }];
    });
    setCreditorEmail(null);
    setDebtorEmail(null);
    setAmountInput("");
    setHint(null);
  };

  const removeDraft = (index: number) =>
    setDrafts((prev) => prev.filter((_, i) => i !== index));

  const column = (
    title: string,
    rows: CreditBalance[],
    selected: string | null,
    onSelect: (email: string | null) => void,
    tone: "success" | "terracotta"
  ) => (
    <div className="space-y-1">
      <p className="text-xs font-graffiti text-asphalt/70">{title}</p>
      <div className="border-2 border-asphalt bg-white divide-y divide-asphalt/10 max-h-56 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-asphalt/50 font-body p-3">Nobody here</p>
        ) : (
          rows.map((b) => {
            const remaining = remainingCents.get(b.userEmail) ?? 0;
            const squared = remaining <= 0;
            const isSelected = selected === b.userEmail;
            return (
              <button
                key={b.userEmail}
                type="button"
                disabled={squared}
                onClick={() => onSelect(isSelected ? null : b.userEmail)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-body text-left transition-colors ${
                  isSelected ? "bg-dull-gold/40" : squared ? "opacity-40" : "hover:bg-sticker-white"
                } ${squared ? "cursor-default" : "cursor-pointer"}`}
              >
                <span className="font-marker truncate">{displayNameFor(b.userEmail)}</span>
                <span
                  className={`whitespace-nowrap font-graffiti ${
                    squared ? "text-asphalt/50" : tone === "success" ? "text-success" : "text-terracotta"
                  }`}
                >
                  {squared ? (
                    <span className="flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> squared
                    </span>
                  ) : (
                    `€${formatCents(remaining)}`
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  if (creditors.length === 0 || debtors.length === 0) {
    return (
      <p className="text-sm text-asphalt/60 font-body">
        Nothing to pair up — the crew needs players on both sides of zero before you can
        settle up.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        {column("Owed money — pick one", creditors, creditorEmail, setCreditorEmail, "success")}
        {column("Owes money — pick one", debtors, debtorEmail, setDebtorEmail, "terracotta")}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-2 border-dashed border-asphalt/30 p-3">
        <div className="space-y-1">
          <label className="text-xs font-graffiti text-asphalt">Amount (€)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            disabled={!creditorEmail || !debtorEmail}
            className="sketch-input w-28 text-sm disabled:opacity-50"
            placeholder="0.00"
          />
        </div>
        <button
          type="button"
          onClick={addDraft}
          disabled={!creditorEmail || !debtorEmail}
          className="sticker-btn flex items-center gap-1 text-sm py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Match Up
        </button>
        <p className="text-xs font-body text-asphalt/60 flex-1 min-w-[12rem]">
          {creditorEmail && debtorEmail ? (
            <>
              {displayNameFor(debtorEmail)} pays {displayNameFor(creditorEmail)}. Defaults to
              whatever squares one of them off.
            </>
          ) : (
            "Pick a player from each side to match them up."
          )}
        </p>
      </div>

      {hint && (
        <div className="p-2 bg-terracotta/10 border-2 border-terracotta">
          <p className="text-sm text-terracotta font-body">{hint}</p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-graffiti text-asphalt/70">
          Matched up {drafts.length > 0 && `(${drafts.length} — €${formatCents(totalCents)})`}
        </p>
        {drafts.length === 0 ? (
          <p className="text-sm text-asphalt/50 font-body">No pairings yet.</p>
        ) : (
          <ul className="border-2 border-asphalt bg-white divide-y divide-asphalt/10">
            {drafts.map((d, i) => (
              <li
                key={`${d.debtorEmail}>${d.creditorEmail}`}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="font-body truncate">
                  <span className="font-marker">{displayNameFor(d.debtorEmail)}</span> pays{" "}
                  <span className="font-marker">{displayNameFor(d.creditorEmail)}</span>
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="font-graffiti">€{formatCents(d.amountCents)}</span>
                  <button
                    type="button"
                    onClick={() => removeDraft(i)}
                    aria-label="Remove pairing"
                    className="text-asphalt/50 hover:text-terracotta transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs font-body text-asphalt/60">
        {unmatched.length === 0
          ? "Everyone's covered — the whole crew squares up with these pairings."
          : `Still unmatched: ${unmatched
              .map((b) => `${displayNameFor(b.userEmail)} €${formatCents(remainingCents.get(b.userEmail) ?? 0)}`)
              .join(", ")}. You can lock in a partial settlement and leave the rest for next time.`}
      </p>

      <button
        type="button"
        onClick={() => onSubmit(drafts)}
        disabled={submitting || drafts.length === 0}
        className="sticker-btn flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Euro className="w-4 h-4" />}
        Lock It In
      </button>
    </div>
  );
}
