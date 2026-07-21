"use client";

import { useState } from "react";
import { Check, Copy, CreditCard } from "lucide-react";

export type BankCardVisualProps = {
  bankName?: string | null;
  cardNumber?: string | null;
  cardHolder?: string | null;
  iban?: string | null;
  instructions?: string | null;
  copyLabel?: string;
  copiedLabel?: string;
  transferLabel?: string;
  className?: string;
};

function formatCardNumber(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 12) {
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  }
  return raw.trim();
}

/** Shared payment-card UI — inline styles so it always looks like a real bank card (even if Tailwind purge misses classes). */
export function BankCardVisual({
  bankName,
  cardNumber,
  cardHolder,
  iban,
  instructions,
  copyLabel = "Copy card number",
  copiedLabel = "Copied",
  transferLabel = "Card to Card",
  className,
}: BankCardVisualProps) {
  const [copied, setCopied] = useState(false);
  const displayNumber = cardNumber
    ? formatCardNumber(cardNumber)
    : "———— ———— ———— ————";

  const copyNumber = async () => {
    if (!cardNumber) return;
    const plain = cardNumber.replace(/\s+/g, "");
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={className}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#64748b",
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <CreditCard size={14} />
        {transferLabel}
      </div>

      <button
        type="button"
        onClick={copyNumber}
        disabled={!cardNumber}
        aria-label={copyLabel}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 420,
          aspectRatio: "1.586 / 1",
          maxHeight: 220,
          margin: 0,
          padding: 20,
          border: "none",
          borderRadius: 18,
          cursor: cardNumber ? "pointer" : "default",
          textAlign: "start",
          color: "#fff",
          overflow: "hidden",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e293b 42%, #0c4a6e 100%)",
          boxShadow: "0 12px 32px rgba(15, 23, 42, 0.35)",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            insetInlineEnd: -24,
            top: -36,
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            filter: "blur(2px)",
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            insetInlineStart: -20,
            bottom: -40,
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "rgba(56, 189, 248, 0.22)",
            filter: "blur(2px)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.72)",
              }}
            >
              {bankName || "BANK"}
            </div>
            <div
              aria-hidden
              style={{
                width: 44,
                height: 34,
                borderRadius: 6,
                background:
                  "linear-gradient(145deg, #fde68a 0%, #f59e0b 55%, #d97706 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 20,
                  borderRadius: 3,
                  border: "1px solid rgba(120,53,15,0.35)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(245,158,11,0.35))",
                }}
              />
            </div>
          </div>

          <div
            dir="ltr"
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: "clamp(1.15rem, 4.5vw, 1.55rem)",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "#fff",
            }}
          >
            {displayNumber}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                Card holder
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.95)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 200,
                }}
              >
                {cardHolder || "—"}
              </div>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 600,
                color: "#fff",
                background: "rgba(255,255,255,0.16)",
                backdropFilter: "blur(6px)",
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? copiedLabel : copyLabel}
            </span>
          </div>
        </div>
      </button>

      {iban ? (
        <div
          dir="ltr"
          style={{
            marginTop: 8,
            paddingInline: 4,
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            color: "#71717a",
          }}
        >
          IBAN: {iban}
        </div>
      ) : null}
      {instructions ? (
        <p
          style={{
            marginTop: 8,
            paddingInline: 4,
            fontSize: 13,
            lineHeight: 1.5,
            color: "#71717a",
            whiteSpace: "pre-line",
          }}
        >
          {instructions}
        </p>
      ) : null}
    </div>
  );
}

export function resolvePaymentCards(
  payment?: {
    cards?: Array<{
      id?: string;
      bankName?: string | null;
      cardNumber?: string | null;
      cardHolder?: string | null;
      iban?: string | null;
      instructions?: string | null;
      enabled?: boolean;
    }> | null;
    cardNumber?: string | null;
    cardHolder?: string | null;
    bankName?: string | null;
    iban?: string | null;
    instructions?: string | null;
  } | null,
) {
  const fromList = (payment?.cards || []).filter(
    (c) =>
      c &&
      c.enabled !== false &&
      Boolean(c.cardNumber || c.bankName || c.iban || c.instructions),
  );
  if (fromList.length) {
    return fromList.map((c, i) => ({
      id: c.id || `card_${i}`,
      bankName: c.bankName || undefined,
      cardNumber: c.cardNumber || undefined,
      cardHolder: c.cardHolder || undefined,
      iban: c.iban || undefined,
      instructions: c.instructions || undefined,
    }));
  }
  if (payment?.cardNumber || payment?.bankName || payment?.iban) {
    return [
      {
        id: "legacy",
        bankName: payment.bankName || undefined,
        cardNumber: payment.cardNumber || undefined,
        cardHolder: payment.cardHolder || undefined,
        iban: payment.iban || undefined,
        instructions: payment.instructions || undefined,
      },
    ];
  }
  return [];
}
