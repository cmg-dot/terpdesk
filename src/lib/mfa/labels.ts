/** The default names offered for a new authenticator device. Client-safe: the Settings form pre-fills it and the server falls back to it. */

export const DEFAULT_DEVICE_LABEL = "Primary authenticator";

/** The name for a device added to a login that already has `existing` confirmed devices. */
export const defaultDeviceLabel = (existing: number): string => (existing === 0 ? DEFAULT_DEVICE_LABEL : `Authenticator ${existing + 1}`);
