export declare enum AccountType {
    BANK = "BANK",
    CREDIT_CARD = "CREDIT_CARD",
    CASH = "CASH",
    BROKER = "BROKER",
    MUTUAL_FUND = "MUTUAL_FUND",
    LOAN = "LOAN",
    OTHER = "OTHER"
}
/** Liability accounts carry money owed; their balance counts against net worth. */
export declare const LIABILITY_ACCOUNT_TYPES: readonly AccountType[];
export declare enum TransactionType {
    INCOME = "INCOME",
    EXPENSE = "EXPENSE",
    TRANSFER = "TRANSFER",
    REFUND = "REFUND",
    FEE = "FEE",
    INTEREST = "INTEREST",
    UNKNOWN = "UNKNOWN"
}
export declare enum TransactionStatus {
    PENDING = "PENDING",
    CLEARED = "CLEARED",
    POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE"
}
export declare enum TransactionSource {
    MANUAL = "MANUAL",
    CSV = "CSV",
    XLSX = "XLSX",
    PDF = "PDF"
}
export declare enum CategoryType {
    INCOME = "INCOME",
    EXPENSE = "EXPENSE",
    TRANSFER = "TRANSFER"
}
export declare enum ImportStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    REVIEW = "REVIEW",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED"
}
