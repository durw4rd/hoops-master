"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Euro, Loader2, Plus, X } from "lucide-react";
import type { CreditBalance } from "@/lib/types";
import {
  allocateGreedy,
  formatCents,
  mergeProposals,
  remainingCentsByPlayer,
  toSettlementBalances,
  type PairingProposal,
} from "@/lib/settlement";

export interface DraftPairing {
  debtorEmail: string;
  creditorEmail: string;
  amountCents: number;
}

interface SettlementBuilderProps {
  balances: CreditBalance[];
  displayNameFor: (email: string) => string;
  submitting: boolean;
  /** Controlled by the parent so drafts survive the modal being closed. */
  drafts: DraftPairing[];
  onDraftsChange: (drafts: DraftPairing[]) => void;
  onSubmit: (drafts: DraftPairing[]) => void;
}

const toProposal = (d: DraftPairing): PairingProposal => ({
  debtorUserId: d.debtorEmail,
  creditorUserId: d.creditorEmail,
  amountCents: d.amountCents,
});

const toDraft = (p: PairingProposal): DraftPairing => ({
  debtorEmail: p.debtorUserId,
  creditorEmail: p.creditorUserId,
  amountCents: p.amountCents,
});

/**
 * Hand-built pairing sheet: the manager matches players in the black with
 * players in the red. Pick one from each side to set an exact amount, or several
 * on either side and the biggest debts get matched to the biggest credits in one
 * move. Nothing is persisted until "Lock It In" — until then it is all draft
 * state, and every remaining figure updates as drafts come and go so it stays
 * obvious who still needs a match.
 */
export default function SettlementBuilder({
  balances,
  displayNameFor,
  submitting,
  drafts,
  onDraftsChange,
  onSubmit,
}: SettlementBuilderProps) {
  const [creditorEmails, setCreditorEmails] = useState<string[]>([]);
  const [debtorEmails, setDebtorEmails] = useState<string[]>([]);
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

  const settlementBalances = useMemo(() => toSettlementBalances(balances), [balances]);
  const draftProposals = useMemo(() => drafts.map(toProposal), [drafts]);
  // Shared with the server-side validator, keyed by email here.
  const remainingCents = useMemo(
    () => remainingCentsByPlayer(settlementBalances, draftProposals),
    [settlementBalances, draftProposals]
  );

  const sidesOf = useCallback(
    (emails: string[]) =>
      emails.map((email) => ({ userId: email, remainingCents: remainingCents.get(email) ?? 0 })),
    [remainingCents]
  );

  const isSingle = creditorEmails.length === 1 && debtorEmails.length === 1;
  const singleSuggestedCents = isSingle
    ? Math.min(remainingCents.get(creditorEmails[0]) ?? 0, remainingCents.get(debtorEmails[0]) ?? 0)
    : 0;

  /** What "Match Up" will create — also drives the preview, so no surprises. */
  const planned = useMemo<DraftPairing[]>(() => {
    if (creditorEmails.length === 0 || debtorEmails.length === 0) return [];
    if (isSingle) {
      const cents = Math.round(parseFloat(amountInput) * 100);
      if (!Number.isFinite(cents) || cents <= 0) return [];
      return [{ debtorEmail: debtorEmails[0], creditorEmail: creditorEmails[0], amountCents: cents }];
    }
    return allocateGreedy(sidesOf(creditorEmails), sidesOf(debtorEmails)).map(toDraft);
  }, [creditorEmails, debtorEmails, amountInput, isSingle, sidesOf]);

  // One-on-one gets an editable amount, pre-filled with whatever squares one of
  // the two off. Any other selection is computed, so the box is cleared rather
  // than left showing a stale figure behind a disabled control.
  useEffect(() => {
    if (isSingle && singleSuggestedCents > 0) {
      setAmountInput(formatCents(singleSuggestedCents));
      setHint(null);
    } else if (!isSingle) {
      setAmountInput("");
    }
  }, [isSingle, singleSuggestedCents]);

  // A player can be squared off by a different draft while still selected —
  // drop them so a row is never both disabled and picked.
  useEffect(() => {
    const prune = (prev: string[]) => {
      const next = prev.filter((email) => (remainingCents.get(email) ?? 0) > 0);
      return next.length === prev.length ? prev : next;
    };
    setCreditorEmails(prune);
    setDebtorEmails(prune);
  }, [remainingCents]);

  const unmatched = useMemo(
    () => [...creditors, ...debtors].filter((b) => (remainingCents.get(b.userEmail) ?? 0) > 0),
    [creditors, debtors, remainingCents]
  );

  const totalCents = drafts.reduce((sum, d) => sum + d.amountCents, 0);
  const plannedTotalCents = planned.reduce((sum, d) => sum + d.amountCents, 0);
  const pickedCreditorCents = creditorEmails.reduce((s, e) => s + (remainingCents.get(e) ?? 0), 0);
  const pickedDebtorCents = debtorEmails.reduce((s, e) => s + (remainingCents.get(e) ?? 0), 0);
  const leftoverCents = Math.abs(pickedCreditorCents - pickedDebtorCents);

  const toggleIn =
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => (email: string) => {
      setHint(null);
      setter((prev) =>
        prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
      );
    };

  const applyPlanned = () => {
    if (creditorEmails.length === 0 || debtorEmails.length === 0) return;
    if (planned.length === 0) {
      setHint(
        isSingle
          ? "Enter an amount above zero."
          : "Nothing left to match — the players you picked are already squared."
      );
      return;
    }

    // Only the hand-typed amount can overshoot; the allocator is capped by
    // whatever each player has left.
    if (isSingle) {
      const creditorRemaining = remainingCents.get(creditorEmails[0]) ?? 0;
      const debtorRemaining = remainingCents.get(debtorEmails[0]) ?? 0;
      const cents = planned[0].amountCents;
      if (cents > creditorRemaining) {
        setHint(
          `${displayNameFor(creditorEmails[0])} is only owed €${formatCents(creditorRemaining)} more.`
        );
        return;
      }
      if (cents > debtorRemaining) {
        setHint(`${displayNameFor(debtorEmails[0])} only owes €${formatCents(debtorRemaining)} more.`);
        return;
      }
    }

    // One pairing per pair of players — top up the existing one instead.
    const merged = mergeProposals(draftProposals, planned.map(toProposal));
    if ([...remainingCentsByPlayer(settlementBalances, merged).values()].some((v) => v < 0)) {
      setHint("Balances moved — clear a pairing and try again.");
      return;
    }

    onDraftsChange(merged.map(toDraft));
    setCreditorEmails([]);
    setDebtorEmails([]);
    setAmountInput("");
    setHint(null);
  };

  const removeDraft = (index: number) =>
    onDraftsChange(drafts.filter((_, i) => i !== index));

  const column = (
    title: string,
    rows: CreditBalance[],
    selected: string[],
    onToggle: (email: string) => void,
    tone: "success" | "terracotta"
  ) => (
    <div className="space-y-1">
      <p className="text-xs font-graffiti text-asphalt/70">
        {title}
        {selected.length > 0 && ` (${selected.length} picked)`}
      </p>
      <div className="border-2 border-asphalt bg-white divide-y divide-asphalt/10 max-h-56 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-asphalt/50 font-body p-3">Nobody here</p>
        ) : (
          rows.map((b) => {
            const remaining = remainingCents.get(b.userEmail) ?? 0;
            const squared = remaining <= 0;
            const isSelected = selected.includes(b.userEmail);
            return (
              <button
                key={b.userEmail}
                type="button"
                disabled={squared}
                aria-pressed={isSelected}
                onClick={() => onToggle(b.userEmail)}
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
        {column(
          "Owed money — pick who collects",
          creditors,
          creditorEmails,
          toggleIn(setCreditorEmails),
          "success"
        )}
        {column(
          "Owes money — pick who pays",
          debtors,
          debtorEmails,
          toggleIn(setDebtorEmails),
          "terracotta"
        )}
      </div>

      <div className="border-2 border-dashed border-asphalt/30 p-3 space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs font-graffiti text-asphalt">Amount (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={!isSingle}
              className="sketch-input w-28 text-sm disabled:opacity-50"
              placeholder={isSingle ? "0.00" : "auto"}
            />
          </div>
          <button
            type="button"
            onClick={applyPlanned}
            disabled={creditorEmails.length === 0 || debtorEmails.length === 0}
            className="sticker-btn flex items-center gap-1 text-sm py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Match Up
          </button>
          <p className="text-xs font-body text-asphalt/60 flex-1 min-w-[12rem]">
            {creditorEmails.length === 0 || debtorEmails.length === 0 ? (
              "Pick players from each side — one or more on either."
            ) : isSingle ? (
              <>
                {displayNameFor(debtorEmails[0])} pays {displayNameFor(creditorEmails[0])}. Defaults
                to whatever squares one of them.
              </>
            ) : (
              "Biggest debts get matched to the biggest credits first."
            )}
          </p>
        </div>

        {!isSingle && planned.length > 0 && (
          <ul className="text-xs font-body space-y-0.5 border-t-2 border-asphalt/10 pt-2">
            {planned.map((p) => (
              <li key={`${p.debtorEmail}>${p.creditorEmail}`}>
                {displayNameFor(p.debtorEmail)} → {displayNameFor(p.creditorEmail)}{" "}
                <span className="font-graffiti">€{formatCents(p.amountCents)}</span>
              </li>
            ))}
            <li className="text-asphalt/60">
              {planned.length} pairing{planned.length === 1 ? "" : "s"} · €
              {formatCents(plannedTotalCents)}
              {leftoverCents > 0 && ` — €${formatCents(leftoverCents)} stays unmatched`}
            </li>
          </ul>
        )}
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
