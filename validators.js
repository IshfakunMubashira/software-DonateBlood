// ===============================
// Phone: Bangladesh format
// Supports: 01XXXXXXXXX and +8801XXXXXXXXX
// ===============================
export function validatePhone(phone) {
  if (!phone) return { valid: false, msg: "Phone number is required" };

  let clean = phone.trim().replace(/\s+/g, "");

  // Normalize +88 or 88 prefix
  if (clean.startsWith("+88")) clean = clean.slice(3);
  else if (clean.startsWith("88")) clean = clean.slice(2);

  if (!/^01[3-9]\d{8}$/.test(clean)) {
    return { valid: false, msg: "Enter a valid BD phone number (e.g. 01712345678)" };
  }

  return { valid: true, value: clean };
}

// ===============================
// Name: letters (English + Bangla), spaces, ., ', -
// ===============================
export function validateName(name) {
  if (!name) return { valid: false, msg: "Name is required" };

  const clean = name.trim();

  if (clean.length < 2) {
    return { valid: false, msg: "Name must be at least 2 characters" };
  }

  const regex = /^[A-Za-z\u0980-\u09FF]+([ .'-][A-Za-z\u0980-\u09FF]+)*$/;

  if (!regex.test(clean)) {
    return {
      valid: false,
      msg: "Name can contain letters, spaces, dots, hyphens, and apostrophes only"
    };
  }

  return { valid: true, value: clean };
}

// ===============================
// Email: basic safe validation
// ===============================
export function validateEmail(email) {
  if (!email) return { valid: true, value: "" }; // optional field

  const clean = email.trim().toLowerCase();

  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!regex.test(clean)) {
    return { valid: false, msg: "Enter a valid email address" };
  }

  return { valid: true, value: clean };
}

// ===============================
// NID (National ID) - Bangladesh format
// Supports: 10, 13, or 17 digits
// ===============================
export function validateNID(nid) {
  if (!nid) {
    // NID is optional only if Passport is provided, but validation is done at form level
    return { valid: true, value: "" };
  }

  const clean = nid.trim().replace(/\s+/g, "");

  if (!/^\d+$/.test(clean)) {
    return { valid: false, msg: "NID must contain digits only" };
  }

  if (![10, 13, 17].includes(clean.length)) {
    return {
      valid: false,
      msg: "NID must be 10, 13, or 17 digits"
    };
  }

  // Optional: prevent trivial fake numbers like 1111111111
  if (/^(\d)\1+$/.test(clean)) {
    return { valid: false, msg: "Invalid NID number" };
  }

  return { valid: true, value: clean };
}

// ===============================
// Passport: 6 to 12 alphanumeric characters
// ===============================
export function validatePassport(passport) {
  if (!passport) {
    // Passport is optional only if NID is provided
    return { valid: true, value: "" };
  }

  const clean = passport.trim().toUpperCase();

  if (!/^[A-Z0-9]{6,12}$/.test(clean)) {
    return {
      valid: false,
      msg: "Passport must be 6–12 alphanumeric characters"
    };
  }

  return { valid: true, value: clean };
}

// ===============================
// Bags: integer 1–10
// ===============================
export function validateBags(val) {
  if (val === null || val === undefined || val === "") {
    return { valid: false, msg: "Bags value is required" };
  }

  const n = Number(val);

  if (!Number.isInteger(n) || n < 1 || n > 10) {
    return { valid: false, msg: "Bags must be a whole number between 1 and 10" };
  }

  return { valid: true, value: n };
}

// ===============================
// Blood Type
// ===============================
const BLOOD_TYPES = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];

export function validateBloodType(bt) {
  if (!bt) return { valid: false, msg: "Blood type is required" };

  if (!BLOOD_TYPES.includes(bt)) {
    return { valid: false, msg: "Select a valid blood type" };
  }

  return { valid: true, value: bt };
}

// ===============================
// Date: not empty, valid, optional future
// ===============================
export function validateDate(dateStr, allowFuture = false, isDonationDate = false) {
  if (!dateStr) {
    return { valid: false, msg: "Date is required" };
  }

  const d = new Date(dateStr);

  if (isNaN(d.getTime())) {
    return { valid: false, msg: "Enter a valid date" };
  }

  // Normalize dates (ignore time)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inputDate = new Date(d);
  inputDate.setHours(0, 0, 0, 0);

  // ❌ Future date check
  if (!allowFuture && inputDate > today) {
    return { valid: false, msg: "Date cannot be in the future" };
  }

  // When future dates are allowed, past dates are invalid
  if (allowFuture && inputDate < today) {
    return { valid: false, msg: "Date cannot be in the past" };
  }

  // ❌ 4-month donation gap rule
  if (isDonationDate) {
    const minAllowed = new Date(today);
    minAllowed.setMonth(minAllowed.getMonth() - 4);

    if (inputDate > minAllowed) {
      return {
        valid: false,
        msg: "Last donation must be at least 4 months ago"
      };
    }
  }

  return { valid: true, value: inputDate };
}

// ===============================
// UI Helpers (Errors in RED)
// ===============================
export function showError(fieldId, msg) {
  const input = document.getElementById(fieldId);
  const errorEl = document.getElementById(fieldId + "-error");

  if (errorEl) {
    errorEl.textContent = msg || "";
    errorEl.style.color = "red";
    errorEl.style.fontSize = "0.8rem";
    errorEl.style.marginTop = "4px";
  }

  if (input) {
    if (msg) {
      input.classList.add("input-error");
      input.style.borderColor = "red";
    } else {
      input.classList.remove("input-error");
      input.style.borderColor = "";
    }
  }
}

export function clearErrors(...fieldIds) {
  fieldIds.forEach(id => showError(id, ""));
}