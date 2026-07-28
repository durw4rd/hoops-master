"use client";

import { useCallback, useMemo, useState } from "react";
import {
  SECOND_STAGE_COPY,
  SPOT_CONFIRM_COPY,
  type ConfirmMode,
  type SpotActionKind,
} from "@/lib/spotConfirm";

interface Pending {
  kind: SpotActionKind;
  run: () => void | Promise<void>;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant: "danger" | "default";
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface ConfirmGate {
  /**
   * Route an action through the confirmation flow. In `disabled` mode it runs
   * immediately; otherwise it opens the modal (twice, in `double` mode).
   */
  request: (kind: SpotActionKind, run: () => void | Promise<void>) => void;
  /** Props for the single shared <ConfirmDialog> (stage-driven). */
  dialogProps: ConfirmDialogProps;
}

/**
 * Mis-click guard for spot actions. Sits between a button's onClick and the
 * actual handler: shows one modal (`single`) or two (`double`) before running,
 * or nothing (`disabled`). The confirm button spins while the async handler
 * runs, then the modal closes; errors surface in the caller's existing UI.
 */
export function useConfirmGate(mode: ConfirmMode): ConfirmGate {
  const [pending, setPending] = useState<Pending | null>(null);
  const [stage, setStage] = useState<1 | 2>(1);
  const [running, setRunning] = useState(false);

  const request = useCallback(
    (kind: SpotActionKind, run: () => void | Promise<void>) => {
      if (mode === "disabled") {
        void run();
        return;
      }
      setStage(1);
      setPending({ kind, run });
    },
    [mode]
  );

  const reset = useCallback(() => {
    setPending(null);
    setStage(1);
  }, []);

  const onCancel = useCallback(() => {
    if (running) return; // don't let the user bail mid-request
    reset();
  }, [running, reset]);

  const onConfirm = useCallback(async () => {
    if (!pending) return;
    if (mode === "double" && stage === 1) {
      setStage(2);
      return;
    }
    setRunning(true);
    try {
      await pending.run();
    } finally {
      setRunning(false);
      reset();
    }
  }, [pending, mode, stage, reset]);

  const dialogProps = useMemo<ConfirmDialogProps>(() => {
    const copy = pending ? SPOT_CONFIRM_COPY[pending.kind] : null;
    const secondStage = stage === 2;
    return {
      open: pending !== null,
      title: !copy ? "" : secondStage ? SECOND_STAGE_COPY.title : copy.title,
      message: !copy ? "" : secondStage ? SECOND_STAGE_COPY.message : copy.message,
      confirmLabel: copy?.confirmLabel ?? "Confirm",
      variant: copy?.variant ?? "default",
      loading: running,
      onConfirm,
      onCancel,
    };
  }, [pending, stage, running, onConfirm, onCancel]);

  return { request, dialogProps };
}
