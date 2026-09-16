"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportStatus = exports.CategoryType = exports.TransactionSource = exports.TransactionStatus = exports.TransactionType = exports.LIABILITY_ACCOUNT_TYPES = exports.AccountType = void 0;
var AccountType;
(function (AccountType) {
    AccountType["BANK"] = "BANK";
    AccountType["CREDIT_CARD"] = "CREDIT_CARD";
    AccountType["CASH"] = "CASH";
    AccountType["BROKER"] = "BROKER";
    AccountType["MUTUAL_FUND"] = "MUTUAL_FUND";
    AccountType["LOAN"] = "LOAN";
    AccountType["OTHER"] = "OTHER";
})(AccountType || (exports.AccountType = AccountType = {}));
/** Liability accounts carry money owed; their balance counts against net worth. */
exports.LIABILITY_ACCOUNT_TYPES = [
    AccountType.CREDIT_CARD,
    AccountType.LOAN,
];
var TransactionType;
(function (TransactionType) {
    TransactionType["INCOME"] = "INCOME";
    TransactionType["EXPENSE"] = "EXPENSE";
    TransactionType["TRANSFER"] = "TRANSFER";
    TransactionType["REFUND"] = "REFUND";
    TransactionType["FEE"] = "FEE";
    TransactionType["INTEREST"] = "INTEREST";
    TransactionType["UNKNOWN"] = "UNKNOWN";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "PENDING";
    TransactionStatus["CLEARED"] = "CLEARED";
    TransactionStatus["POSSIBLE_DUPLICATE"] = "POSSIBLE_DUPLICATE";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
var TransactionSource;
(function (TransactionSource) {
    TransactionSource["MANUAL"] = "MANUAL";
    TransactionSource["CSV"] = "CSV";
    TransactionSource["XLSX"] = "XLSX";
    TransactionSource["PDF"] = "PDF";
})(TransactionSource || (exports.TransactionSource = TransactionSource = {}));
var CategoryType;
(function (CategoryType) {
    CategoryType["INCOME"] = "INCOME";
    CategoryType["EXPENSE"] = "EXPENSE";
    CategoryType["TRANSFER"] = "TRANSFER";
})(CategoryType || (exports.CategoryType = CategoryType = {}));
var ImportStatus;
(function (ImportStatus) {
    ImportStatus["PENDING"] = "PENDING";
    ImportStatus["PROCESSING"] = "PROCESSING";
    ImportStatus["REVIEW"] = "REVIEW";
    ImportStatus["COMPLETED"] = "COMPLETED";
    ImportStatus["FAILED"] = "FAILED";
    ImportStatus["CANCELLED"] = "CANCELLED";
})(ImportStatus || (exports.ImportStatus = ImportStatus = {}));
//# sourceMappingURL=enums.js.map