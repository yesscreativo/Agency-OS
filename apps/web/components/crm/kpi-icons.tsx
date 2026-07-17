import type { QuoteKpiKey } from "@agency-os/domain";

/** Iconos de trazo 18px para las KPI cards de la lista (heredan currentColor).
 * No hay librería de iconos en el repo — SVGs inline a propósito. */

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function BarsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M5 20V13" />
      <path d="M12 20V6" />
      <path d="M19 20V10" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3l-6.5 18-4-7.5L3 9.5Z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9.2 9.2 5.6 5.6" />
      <path d="m14.8 9.2-5.6 5.6" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 4L18 12H5" />
    </svg>
  );
}

export const QUOTE_KPI_ICONS: Record<QuoteKpiKey, React.ReactNode> = {
  total: <BarsIcon />,
  sent: <SendIcon />,
  accepted: <CheckCircleIcon />,
  under_review: <ClockIcon />,
  rejected: <XCircleIcon />,
  closed: <FlagIcon />,
};
