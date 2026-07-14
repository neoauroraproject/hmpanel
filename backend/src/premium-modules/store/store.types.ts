export interface CheckoutPayload {
    name?: string;
    telegram?: string;
    whatsapp?: string;
    email?: string;
    productId: string;
    renewClientId?: string;
    configName?: string;
    isRenewal?: boolean;
    customerToken?: string;
    receiptText?: string;
    receiptImage?: string;
    notes?: string;
    currency?: string;
    haveToken?: boolean;
}
export interface RenewCheckoutPayload {
    clientId: string;
    productId: string;
    receiptText?: string;
    receiptImage?: string;
    notes?: string;
    currency?: string;
}
export function generateTrackingCode() { return 'CODE'; }
