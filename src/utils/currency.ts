// Money moves through this app in paise (INR's smallest unit, matching what
// Razorpay's API expects) end to end — only these two functions convert to
// and from the whole-rupee numbers a human types into or reads off a form.

export function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}
