"use client";

import { Check, Handshake, Loader2 } from "lucide-react";
import { GraffitiDialog } from "@/components/ui/GraffitiDialog";
import type { CreditBalance, SettlementDTO, SettlementPairingDTO } from "@/lib/types";
import SettlementBuilder, { type DraftPairing } from "./SettlementBuilder";

interface SettlementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "build" = no settlement in play (manager only); "view" = one is running. */
  mode: "build" | "view";
  settlement: SettlementDTO | null;
  balances: CreditBalance[];
  displayNameFor: (email: string) => string;
  userEmail: string;
  isGroupAdmin: boolean;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  drafts: DraftPairing[];
  onDraftsChange: (drafts: DraftPairing[]) => void;
  onSubmitDrafts: (drafts: DraftPairing[]) => void;
  onMarkPaid: (pairing: SettlementPairingDTO) => void;
  onTearUp: () => void;
}

/**
 * The settlement workspace, opened from the Balances card. Purely presentational
 * — every fetch and mutation stays with CreditDashboard, which also owns the
 * single mark-paid dialog so this modal and the inline strip can't drift apart.
 */
export default function SettlementModal({
  open,
  onOpenChange,
  mode,
  settlement,
  balances,
  displayNameFor,
  userEmail,
  isGroupAdmin,
  loading,
  submitting,
  error,
  drafts,
  onDraftsChange,
  onSubmitDrafts,
  onMarkPaid,
  onTearUp,
}: SettlementModalProps) {
  return (
    <GraffitiDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Squash the Beef"
      description={
        mode === "view"
          ? "Each player in the black collects from the players matched to them. Mark it here once the money moves."
          : "Match players in the black with players in the red so the whole crew gets square."
      }
      // The builder needs room for two columns; the pairing list doesn't.
      className={mode === "build" ? "max-w-2xl" : "max-w-lg"}
    >
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-asphalt/60 font-body py-4 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading settlement…
          </div>
        ) : mode === "view" && settlement ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left font-graffiti text-asphalt/70 border-b-2 border-asphalt/20">
                    <th className="py-2 pr-2">Who pays who</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 pl-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlement.pairings.map((p) => {
                    const youPay = p.debtorEmail === userEmail;
                    const youCollect = p.creditorEmail === userEmail;
                    const canMarkPaid =
                      p.status === "open" && (isGroupAdmin || youPay || youCollect);
                    return (
                      <tr
                        key={p.pairingId}
                        className={`border-b border-asphalt/10 ${
                          youPay || youCollect ? "bg-moss-green/20" : ""
                        }`}
                      >
                        <td className="py-2 pr-2 font-body">
                          {youPay ? (
                            <>
                              You owe <span className="font-marker">{p.creditorName}</span>
                            </>
                          ) : youCollect ? (
                            <>
                              <span className="font-marker">{p.debtorName}</span> owes you
                            </>
                          ) : (
                            <>
                              <span className="font-marker">{p.debtorName}</span> pays{" "}
                              <span className="font-marker">{p.creditorName}</span>
                            </>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-graffiti whitespace-nowrap">
                          €{p.amount.toFixed(2)}
                        </td>
                        <td className="py-2 pl-2 font-body">
                          {p.status === "paid" ? (
                            <span className="flex items-center gap-1 text-success whitespace-nowrap">
                              <Check className="w-4 h-4" />
                              Squared
                              {p.markedPaidByName && (
                                <span className="text-asphalt/50 text-xs">
                                  by {p.markedPaidByName}
                                </span>
                              )}
                            </span>
                          ) : p.status === "cancelled" ? (
                            <span className="text-asphalt/50 text-xs">Torn up</span>
                          ) : canMarkPaid ? (
                            <button
                              type="button"
                              onClick={() => onMarkPaid(p)}
                              className="flex items-center gap-1 bg-asphalt text-sticker-white px-2 py-1 border-2 border-asphalt font-graffiti text-xs hover:bg-terracotta transition-colors whitespace-nowrap"
                            >
                              <Handshake className="w-3.5 h-3.5" /> Mark Paid
                            </button>
                          ) : (
                            <span className="text-asphalt/50 text-xs">Waiting</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {isGroupAdmin && (
              <button
                type="button"
                onClick={onTearUp}
                className="bg-terracotta text-white px-3 py-1.5 border-2 border-asphalt font-graffiti text-xs hover:bg-asphalt transition-colors"
              >
                Tear It Up
              </button>
            )}
          </>
        ) : isGroupAdmin ? (
          <SettlementBuilder
            balances={balances}
            displayNameFor={displayNameFor}
            submitting={submitting}
            drafts={drafts}
            onDraftsChange={onDraftsChange}
            onSubmit={onSubmitDrafts}
          />
        ) : null}

        {error && (
          <div className="p-2 bg-terracotta/10 border-2 border-terracotta">
            <p className="text-sm text-terracotta font-body">{error}</p>
          </div>
        )}
      </div>
    </GraffitiDialog>
  );
}
