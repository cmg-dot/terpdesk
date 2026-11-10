/** Where the "Download Verification PDF" button points. Client-safe: this file imports nothing from the server. */
export const verificationPdfUrl = (requestId: string, position: number): string => `/api/verification-pdf/${requestId}/${position}`;
