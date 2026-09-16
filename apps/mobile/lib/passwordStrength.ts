export type PasswordStrength = {
  label: 'Weak' | 'Medium' | 'Strong';
  color: string;
  percent: number;
};

export function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { label: 'Weak', color: '#DC2626', percent: 33 };
  if (score <= 3) return { label: 'Medium', color: '#D97706', percent: 66 };
  return { label: 'Strong', color: '#16A34A', percent: 100 };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
