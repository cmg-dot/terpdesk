"use client";

import { Pencil, Smartphone, Trash2 } from "lucide-react";
import type { MfaDeviceInfo, MfaStatus } from "@/lib/mfa/types";

const BUTTON = "rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";
const ICON_BUTTON = "inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800";

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

interface DevicesPanelProps {
  status: MfaStatus;
  onAdd: () => void;
  onRename: (device: MfaDeviceInfo) => void;
  onRemove: (device: MfaDeviceInfo) => void;
  onRegenerate: () => void;
  onDisable: () => void;
}

/** Two-step is on: the registered authenticator devices, and the account-wide actions (recovery codes, turning it off). */
export const DevicesPanel = ({ status, onAdd, onRename, onRemove, onRegenerate, onDisable }: DevicesPanelProps) => {
  const low = status.recoveryCodesLeft <= 2;
  const full = status.devices.length >= status.maxDevices;
  return (
    <div data-mfa-on>
      <p className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
        <span className="h-2 w-2 rounded-full bg-[var(--mint-dot)]" aria-hidden="true" />
        On{status.enrolledAt ? ` since ${formatDate(status.enrolledAt)}` : ""}
      </p>

      <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200" aria-label="Authenticator devices" data-mfa-devices>
        {status.devices.map((device) => (
          <li key={device.id} data-device-id={device.id} className="flex items-center gap-3 px-4 py-3">
            <Smartphone className="h-5 w-5 shrink-0 text-[var(--sage)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p data-device-label className="truncate text-sm font-medium text-[var(--ink)]">
                {device.label}
              </p>
              <p className="text-[12px] text-[var(--sage)]">
                Added {formatDate(device.addedAt)} · Last used {device.lastUsedAt ? formatDate(device.lastUsedAt) : "Never"}
              </p>
            </div>
            <button type="button" onClick={() => onRename(device)} className={ICON_BUTTON} aria-label={`Rename ${device.label}`} title="Rename">
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onRemove(device)} className={`${ICON_BUTTON} hover:bg-red-50 hover:text-red-700`} aria-label={`Remove ${device.label}`} title="Remove">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <p className={`mt-3 text-[13px] ${low ? "font-medium text-amber-700" : "text-[var(--sage)]"}`}>
        {status.recoveryCodesLeft} of 10 recovery codes left{low ? ". Create new ones soon." : "."} They work for your whole account, whichever device you use.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onAdd} disabled={full} className={BUTTON} title={full ? `You can have up to ${status.maxDevices} devices.` : undefined}>
          Add another device
        </button>
        <button type="button" onClick={onRegenerate} className={BUTTON}>
          Create new recovery codes
        </button>
        <button type="button" onClick={onDisable} className={`${BUTTON} text-red-700`}>
          Turn off
        </button>
      </div>
      {full && <p className="mt-2 text-[12px] text-[var(--sage)]">You have {status.maxDevices} devices, the most allowed. Remove one to add another.</p>}
    </div>
  );
};
