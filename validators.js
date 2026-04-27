// Bangladesh phone: 01XXXXXXXXX (11 digits, starts with 01)
export function validatePhone(phone) {
  const clean = phone.trim().replace(/\s+/g, "");
  if (!/^01[3-9]\d{8}$/.test(clean)) {
    return { valid: false, msg: "Enter a valid BD phone number (e.g. 01712345678)" };
  }
  return { valid: true, value: clean };
}

// Name: letters, spaces, dots only — min 2 chars
export function validateName(name) {
  const clean = name.trim();
  if (clean.length < 2) return { valid: false, msg: "Name must be at least 2 characters" };
  if (!/^[A-Za-z\u0980-\u09FF\s.''-]+$/.test(clean)) {
    return { valid: false, msg: "Name must contain letters only, no numbers" };
  }
  return { valid: true, value: clean };
}

// Email: standard format check
export function validateEmail(email) {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
    return { valid: false, msg: "Enter a valid email address" };
  }
  return { valid: true, value: clean };
}

// Bags: integer between 1 and 10
export function validateBags(val) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1 || n > 10 || String(n) !== String(val).trim()) {
    return { valid: false, msg: "Bags must be a whole number between 1 and 10" };
  }
  return { valid: true, value: n };
}

// Blood type: strict enum
const BLOOD_TYPES = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
export function validateBloodType(bt) {
  if (!BLOOD_TYPES.includes(bt)) {
    return { valid: false, msg: "Select a valid blood type" };
  }
  return { valid: true, value: bt };
}

// Date: not empty, not future (for DOB/donation dates)
export function validateDate(dateStr, allowFuture = false) {
  if (!dateStr) return { valid: false, msg: "Date is required" };
  const d = new Date(dateStr);
  if (isNaN(d)) return { valid: false, msg: "Enter a valid date" };
  if (!allowFuture && d > new Date()) {
    return { valid: false, msg: "Date cannot be in the future" };
  }
  return { valid: true, value: d };
}

// Show/clear inline error helper
export function showError(fieldId, msg) {
  const el = document.getElementById(fieldId + "-error");
  if (el) el.textContent = msg || "";
  document.getElementById(fieldId)?.classList.toggle("input-error", !!msg);
}

export function clearErrors(...fieldIds) {
  fieldIds.forEach(id => showError(id, ""));
}