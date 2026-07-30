import { HttpError } from "./http.js";

const limits = {
  companyName: 100,
  taxNo: 40,
  address: 150,
  phone: 40,
  bankName: 100,
  bankAccount: 60,
  remark: 300,
};

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export function validateCompany(input) {
  const item = {
    companyName: clean(input.companyName ?? input.company_name, limits.companyName),
    taxNo: clean(input.taxNo ?? input.tax_no, limits.taxNo),
    address: clean(input.address, limits.address),
    phone: clean(input.phone, limits.phone),
    bankName: clean(input.bankName ?? input.bank_name, limits.bankName),
    bankAccount: clean(input.bankAccount ?? input.bank_account, limits.bankAccount),
    remark: clean(input.remark, limits.remark),
  };
  const missing = [];
  if (!item.companyName) missing.push("公司名称");
  if (!item.taxNo) missing.push("统一社会信用代码");
  if (!item.address) missing.push("注册地址");
  if (!item.bankName) missing.push("开户银行");
  if (!item.bankAccount) missing.push("银行账号");
  if (missing.length) throw new HttpError(400, `请填写：${missing.join("、")}`);
  return item;
}

export function toDatabase(item) {
  return {
    company_name: item.companyName,
    tax_no: item.taxNo,
    address: item.address,
    phone: item.phone || null,
    bank_name: item.bankName,
    bank_account: item.bankAccount,
    remark: item.remark || null,
  };
}

export function toClient(row) {
  return {
    id: row.id,
    companyName: row.company_name,
    taxNo: row.tax_no,
    address: row.address,
    phone: row.phone || "",
    bankName: row.bank_name,
    bankAccount: row.bank_account,
    remark: row.remark || "",
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || "",
  };
}

export function companyFingerprint(input) {
  const item = input.company_name !== undefined ? {
    companyName: String(input.company_name ?? "").trim(),
    taxNo: String(input.tax_no ?? "").trim(),
    address: String(input.address ?? "").trim(),
    phone: String(input.phone ?? "").trim(),
    bankName: String(input.bank_name ?? "").trim(),
    bankAccount: String(input.bank_account ?? "").trim(),
    remark: String(input.remark ?? "").trim(),
  } : {
    companyName: String(input.companyName ?? "").trim(),
    taxNo: String(input.taxNo ?? "").trim(),
    address: String(input.address ?? "").trim(),
    phone: String(input.phone ?? "").trim(),
    bankName: String(input.bankName ?? "").trim(),
    bankAccount: String(input.bankAccount ?? "").trim(),
    remark: String(input.remark ?? "").trim(),
  };
  return JSON.stringify([
    item.companyName,
    item.taxNo,
    item.address,
    item.phone,
    item.bankName,
    item.bankAccount,
    item.remark,
  ]);
}

export function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}
